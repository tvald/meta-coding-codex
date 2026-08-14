export const DEFAULT_IMPLEMENTATION_WIP = Object.freeze({ background: 3, root: 1 });

export class ImplementationSchedulerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationSchedulerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationSchedulerError(code, message);
}

function pathSegments(value) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\') ||
      value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('ASSIGNMENT_INVALID', 'assignment path is invalid');
  }
  return value.split('/');
}

function pathOverlaps(left, right) {
  const a = pathSegments(left);
  const b = pathSegments(right);
  const shared = Math.min(a.length, b.length);
  return a.slice(0, shared).every((part, index) => part === b[index]);
}

export function writeOwnershipConflicts(left, right) {
  const leftPaths = left?.ownership?.writePaths;
  const rightPaths = right?.ownership?.writePaths;
  if (!Array.isArray(leftPaths) || !Array.isArray(rightPaths)) {
    fail('ASSIGNMENT_INVALID', 'assignment ownership is invalid');
  }
  return leftPaths.some((leftPath) => rightPaths.some((rightPath) => pathOverlaps(leftPath, rightPath)));
}

function claimIdentity(claim) {
  if (claim === null || typeof claim !== 'object' || Array.isArray(claim) ||
      typeof claim.key !== 'string' || claim.key.length === 0 ||
      !['shared_read', 'namespaced_write', 'exclusive'].includes(claim.mode) ||
      (claim.namespace !== null && (typeof claim.namespace !== 'string' || claim.namespace.length === 0))) {
    fail('ASSIGNMENT_INVALID', 'resource claim is invalid');
  }
  if (claim.mode === 'namespaced_write' && claim.namespace === null) {
    fail('ASSIGNMENT_INVALID', 'namespaced write requires a namespace');
  }
  if (claim.mode !== 'namespaced_write' && claim.namespace !== null) {
    fail('ASSIGNMENT_INVALID', 'only namespaced writes may name a namespace');
  }
  return `${claim.key}\0${claim.namespace ?? ''}`;
}

export function resourceClaimsConflict(left, right, serializedKeys = new Set()) {
  if (!Array.isArray(left) || !Array.isArray(right) || !(serializedKeys instanceof Set)) {
    fail('ASSIGNMENT_INVALID', 'resource claim collection is invalid');
  }
  for (const leftClaim of left) {
    claimIdentity(leftClaim);
    for (const rightClaim of right) {
      claimIdentity(rightClaim);
      if (leftClaim.key !== rightClaim.key) continue;
      if (serializedKeys.has(leftClaim.key)) return true;
      if (leftClaim.mode === 'exclusive' || rightClaim.mode === 'exclusive') return true;
      if (leftClaim.mode === 'shared_read' || rightClaim.mode === 'shared_read') continue;
      if (leftClaim.namespace === rightClaim.namespace) return true;
    }
  }
  return false;
}

function assignmentState(states, id) {
  if (states instanceof Map) return states.get(id);
  if (states !== null && typeof states === 'object' && !Array.isArray(states)) return states[id];
  fail('SCHEDULER_INPUT_INVALID', 'assignment states are invalid');
}

function dependenciesSatisfied(assignment, states) {
  if (!Array.isArray(assignment.dependencies)) fail('ASSIGNMENT_INVALID', 'assignment dependencies are invalid');
  for (const dependency of assignment.dependencies) {
    const state = assignmentState(states, dependency.assignmentId);
    if (state === undefined || state.generation !== dependency.generation) return false;
    if (dependency.condition === 'result' && state.resultObserved !== true) return false;
    if (dependency.condition === 'integrated' && state.integrated !== true) return false;
    if (dependency.condition === 'gate_pass' && state.gatePassed !== true) return false;
    if (!['result', 'integrated', 'gate_pass'].includes(dependency.condition)) {
      fail('ASSIGNMENT_INVALID', 'assignment dependency condition is invalid');
    }
  }
  return true;
}

function dependencyGeneration(assignment) {
  return assignment.dependencies.reduce((maximum, dependency) => Math.max(maximum, dependency.generation), 0);
}

function compareAssignments(left, right, priorityByAssignmentId) {
  const generation = dependencyGeneration(left) - dependencyGeneration(right);
  if (generation !== 0) return generation;
  const leftPriority = priorityByAssignmentId[left.assignmentId] ?? 0;
  const rightPriority = priorityByAssignmentId[right.assignmentId] ?? 0;
  if (!Number.isSafeInteger(leftPriority) || !Number.isSafeInteger(rightPriority)) {
    fail('SCHEDULER_INPUT_INVALID', 'assignment priority is invalid');
  }
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  return left.assignmentId.localeCompare(right.assignmentId, 'en');
}

function normalizedCaps(caps = {}) {
  const background = caps.background ?? DEFAULT_IMPLEMENTATION_WIP.background;
  const root = caps.root ?? DEFAULT_IMPLEMENTATION_WIP.root;
  const roles = caps.roles ?? {};
  if (!Number.isSafeInteger(background) || background < 0 || !Number.isSafeInteger(root) || root < 0 ||
      roles === null || typeof roles !== 'object' || Array.isArray(roles) ||
      Object.values(roles).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    fail('SCHEDULER_INPUT_INVALID', 'scheduler WIP caps are invalid');
  }
  return { background, root, roles };
}

function rootLane(assignment) {
  return assignment.role === 'root_decision';
}

function assignmentValid(assignment) {
  if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment) ||
      typeof assignment.assignmentId !== 'string' || assignment.assignmentId.length === 0 ||
      typeof assignment.role !== 'string' || !Array.isArray(assignment.resources) ||
      assignment.ownership === null || typeof assignment.ownership !== 'object') {
    fail('ASSIGNMENT_INVALID', 'assignment is invalid');
  }
  for (const claim of assignment.resources) claimIdentity(claim);
  for (const path of assignment.ownership.writePaths ?? []) pathSegments(path);
  return assignment;
}

function dispatchConflict(candidate, active, serializedKeys) {
  return active.some((other) => writeOwnershipConflicts(candidate, other) ||
    resourceClaimsConflict(candidate.resources, other.resources, serializedKeys));
}

export function planDispatch({
  pending,
  running = [],
  assignmentStates = {},
  serializedResourceKeys = [],
  priorityByAssignmentId = {},
  stopRequested = false,
  quotaDisposition = 'proceed',
  approvalsCurrent = true,
  caps = {},
}) {
  if (!Array.isArray(pending) || !Array.isArray(running) || !Array.isArray(serializedResourceKeys) ||
      priorityByAssignmentId === null || typeof priorityByAssignmentId !== 'object' ||
      Array.isArray(priorityByAssignmentId)) {
    fail('SCHEDULER_INPUT_INVALID', 'scheduler input is invalid');
  }
  const normalized = normalizedCaps(caps);
  const serialized = new Set(serializedResourceKeys);
  const active = running.map(assignmentValid);
  const selected = [];
  const waiting = [];
  const roleCounts = new Map();
  let backgroundRunning = 0;
  let rootRunning = 0;
  for (const assignment of active) {
    if (rootLane(assignment)) rootRunning += 1;
    else backgroundRunning += 1;
    roleCounts.set(assignment.role, (roleCounts.get(assignment.role) ?? 0) + 1);
  }
  const candidates = pending.map(assignmentValid)
    .sort((left, right) => compareAssignments(left, right, priorityByAssignmentId));
  const seenIds = new Set(active.map(({ assignmentId }) => assignmentId));
  for (const assignment of candidates) {
    if (seenIds.has(assignment.assignmentId)) fail('ASSIGNMENT_CONFLICT', 'assignment ID is duplicated');
    seenIds.add(assignment.assignmentId);
    let reason = null;
    if (stopRequested) reason = 'stop_requested';
    else if (quotaDisposition !== 'proceed') reason = 'quota_unavailable';
    else if (!approvalsCurrent) reason = 'approval_unavailable';
    else if (!dependenciesSatisfied(assignment, assignmentStates)) reason = 'dependency_wait';
    else if (dispatchConflict(assignment, [...active, ...selected], serialized)) reason = 'ownership_or_resource_conflict';
    else if (rootLane(assignment) ? rootRunning >= normalized.root : backgroundRunning >= normalized.background) {
      reason = 'lane_wip';
    } else if ((roleCounts.get(assignment.role) ?? 0) >= (normalized.roles[assignment.role] ?? Number.MAX_SAFE_INTEGER)) {
      reason = 'role_wip';
    }
    if (reason !== null) {
      waiting.push({ assignmentId: assignment.assignmentId, reason });
      continue;
    }
    selected.push(assignment);
    if (rootLane(assignment)) rootRunning += 1;
    else backgroundRunning += 1;
    roleCounts.set(assignment.role, (roleCounts.get(assignment.role) ?? 0) + 1);
  }
  return Object.freeze({
    dispatch: Object.freeze(selected.map(({ assignmentId }) => assignmentId)),
    waiting: Object.freeze(waiting.map((entry) => Object.freeze(entry))),
    observedConcurrency: Object.freeze({ background: backgroundRunning, root: rootRunning }),
  });
}

export function planShadowDispatch(input) {
  const plan = planDispatch(input);
  return Object.freeze({
    effectAuthority: false,
    hypotheticalIntents: Object.freeze(plan.dispatch.map((assignmentId) => Object.freeze({
      kind: 'launch_job',
      assignmentId,
      hypothetical: true,
    }))),
    waiting: plan.waiting,
    observedConcurrency: plan.observedConcurrency,
  });
}
