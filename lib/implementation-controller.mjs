import {
  IMPLEMENTATION_PROTOCOL_LIMITS,
  canonicalBytes,
  canonicalDigest,
  validateBinding,
  validateBoundedArray,
  validateControllerId,
  validateDigest,
  validateRootDecisionProposal,
  validateTaskId,
  validateTimestamp,
} from './implementation-protocol.mjs';
import {
  planOrientation,
  reduceEventLog,
  stopAllowsEffect,
  taskRevisionAuthorizesEffect,
} from './implementation-reducer.mjs';
import { planDispatch, planShadowDispatch } from './implementation-scheduler.mjs';

export const IMPLEMENTATION_CONTROLLER_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  protocolVersions: Object.freeze([1]),
  ledgerVersions: Object.freeze([1]),
  providerAdapters: Object.freeze(['codex_exec_v1']),
  liveEffects: 'disabled_without_activation_receipt',
});

const ORIENTATION_KEYS = Object.freeze([
  'schemaVersion', 'binding', 'snapshotDigest', 'task', 'repository',
  'pendingAssignments', 'runningAssignments', 'assignmentStates', 'verification',
  'controls', 'deadlines', 'quota', 'approvals', 'observedAt',
]);

export class ImplementationControllerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationControllerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationControllerError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('CONTROLLER_INPUT_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('CONTROLLER_INPUT_INVALID', `${label} has unknown or missing fields`);
  }
}

function validateTaskProjection(task) {
  exactKeys(task, ['id', 'taskRevision', 'recordVersion', 'status'], 'task projection');
  validateTaskId(task.id, 'task projection.id');
  for (const field of ['taskRevision', 'recordVersion']) {
    if (!Number.isSafeInteger(task[field]) || task[field] < 1) {
      fail('CONTROLLER_INPUT_INVALID', `task projection.${field} is invalid`);
    }
  }
  if (!['ready', 'active', 'needs_verification', 'done', 'cancelled', 'superseded'].includes(task.status)) {
    fail('CONTROLLER_INPUT_INVALID', 'task projection.status is invalid');
  }
}

function validateRepositoryProjection(repository) {
  exactKeys(repository, ['baseCommit', 'head', 'tree', 'statusDigest'], 'repository projection');
  for (const field of ['baseCommit', 'head', 'tree']) {
    if (typeof repository[field] !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(repository[field])) {
      fail('CONTROLLER_INPUT_INVALID', `repository projection.${field} is invalid`);
    }
  }
  validateDigest(repository.statusDigest, 'repository projection.statusDigest');
}

function validateAssignments(values, label) {
  validateBoundedArray(values, label, { maximumItems: IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems });
  const ids = new Set();
  for (const value of values) {
    if (!plainObject(value)) fail('CONTROLLER_INPUT_INVALID', `${label} entry is invalid`);
    validateControllerId(value.assignmentId, `${label} assignmentId`);
    if (ids.has(value.assignmentId)) fail('CONTROLLER_INPUT_INVALID', `${label} contains a duplicate assignment`);
    ids.add(value.assignmentId);
  }
}

function validateSmallObject(value, label) {
  if (!plainObject(value) || Object.keys(value).length > 128) {
    fail('CONTROLLER_INPUT_INVALID', `${label} is invalid`);
  }
}

export function validateOrientation(value) {
  exactKeys(value, ORIENTATION_KEYS, 'orientation');
  if (value.schemaVersion !== 1) fail('CONTROLLER_UNSUPPORTED', 'orientation version is unsupported');
  validateBinding(value.binding, 'orientation.binding');
  validateDigest(value.snapshotDigest, 'orientation.snapshotDigest');
  validateTaskProjection(value.task);
  validateRepositoryProjection(value.repository);
  validateAssignments(value.pendingAssignments, 'orientation.pendingAssignments');
  validateAssignments(value.runningAssignments, 'orientation.runningAssignments');
  for (const field of ['assignmentStates', 'verification', 'controls', 'deadlines', 'quota', 'approvals']) {
    validateSmallObject(value[field], `orientation.${field}`);
  }
  validateTimestamp(value.observedAt, 'orientation.observedAt');
  canonicalBytes(value, { maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.orientationBytes });
  return value;
}

export function buildOrientation({
  binding,
  snapshot,
  task,
  repository,
  pendingAssignments = [],
  runningAssignments = [],
  assignmentStates = {},
  verification = {},
  controls = {},
  deadlines = {},
  quota = {},
  approvals = {},
  observedAt,
}) {
  if (!plainObject(snapshot)) fail('CONTROLLER_INPUT_INVALID', 'snapshot is invalid');
  const value = {
    schemaVersion: 1,
    binding: structuredClone(binding),
    snapshotDigest: canonicalDigest(snapshot),
    task: structuredClone(task),
    repository: structuredClone(repository),
    pendingAssignments: structuredClone(pendingAssignments),
    runningAssignments: structuredClone(runningAssignments),
    assignmentStates: structuredClone(assignmentStates),
    verification: structuredClone(verification),
    controls: structuredClone(controls),
    deadlines: structuredClone(deadlines),
    quota: structuredClone(quota),
    approvals: structuredClone(approvals),
    observedAt,
  };
  validateOrientation(value);
  return Object.freeze({
    value: deepFreeze(value),
    digest: canonicalDigest(value),
    bytes: canonicalBytes(value, { maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.orientationBytes }).length,
  });
}

export function coalesceWakeReasons(reasons) {
  validateBoundedArray(reasons, 'wake reasons', { maximumItems: 128 });
  const normalized = [];
  for (const reason of reasons) {
    if (typeof reason !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(reason)) {
      fail('CONTROLLER_INPUT_INVALID', 'wake reason is invalid');
    }
    if (!normalized.includes(reason)) normalized.push(reason);
  }
  return Object.freeze(normalized.sort());
}

export function planControllerTick({
  snapshot,
  orientation,
  stateChanged = false,
  deadlineDue = false,
  serializedResourceKeys = [],
  priorityByAssignmentId = {},
  caps = {},
  shadow = true,
}) {
  validateOrientation(orientation);
  if (!plainObject(snapshot) || snapshot.runId !== orientation.binding.runId ||
      snapshot.revision !== orientation.binding.snapshotRevision ||
      canonicalDigest(snapshot) !== orientation.snapshotDigest) {
    fail('CONTROLLER_STALE', 'orientation does not bind the current snapshot');
  }
  if (!taskRevisionAuthorizesEffect(orientation.binding, orientation.task)) {
    return Object.freeze({
      schemaVersion: 1,
      effectAuthority: false,
      disposition: 'supersede',
      reason: 'task_revision_changed',
      orientationDigest: canonicalDigest(orientation),
      root: null,
      background: Object.freeze({ dispatch: Object.freeze([]), waiting: Object.freeze([]) }),
    });
  }
  if (!stopAllowsEffect(snapshot)) {
    const reason = snapshot.stop?.requested === true ? 'stop_requested' :
      snapshot.reconciliation?.required === true || snapshot.phase === 'reconciliation_required' ?
        'reconciliation_required' : 'terminal';
    return Object.freeze({
      schemaVersion: 1,
      effectAuthority: false,
      disposition: reason === 'stop_requested' ? 'stop' : 'quiesced',
      reason,
      orientationDigest: canonicalDigest(orientation),
      root: null,
      background: Object.freeze({ dispatch: Object.freeze([]), waiting: Object.freeze([]) }),
    });
  }
  const orientationPlan = planOrientation(snapshot, { stateChanged, deadlineDue });
  const schedulerInput = {
    pending: orientation.pendingAssignments,
    running: orientation.runningAssignments,
    assignmentStates: orientation.assignmentStates,
    serializedResourceKeys,
    priorityByAssignmentId,
    stopRequested: snapshot.stop.requested,
    quotaDisposition: orientation.quota.disposition ?? 'unavailable',
    approvalsCurrent: orientation.approvals.current === true,
    caps,
  };
  const background = shadow ? planShadowDispatch(schedulerInput) : planDispatch(schedulerInput);
  const root = orientationPlan.action === 'orient' ? Object.freeze({
    kind: 'root_tick',
    orientationDigest: canonicalDigest(orientation),
    hypothetical: shadow,
    reason: orientationPlan.reason,
  }) : null;
  return deepFreeze({
    schemaVersion: 1,
    effectAuthority: false,
    disposition: root === null && (background.dispatch?.length ?? background.hypotheticalIntents?.length ?? 0) === 0 ?
      'waiting' : 'planned',
    reason: orientationPlan.reason,
    orientationDigest: canonicalDigest(orientation),
    root,
    background,
  });
}

export function convergeRootProposal({ proposal, orientation, expectedOrientationDigest }) {
  validateOrientation(orientation);
  validateDigest(expectedOrientationDigest, 'expected orientation digest');
  const actualOrientationDigest = canonicalDigest(orientation);
  if (actualOrientationDigest !== expectedOrientationDigest) {
    fail('CONTROLLER_STALE', 'Root proposal names a stale orientation');
  }
  validateRootDecisionProposal(proposal);
  const proposalDigest = canonicalDigest(proposal);
  const intents = proposal.kind === 'declare_assignments' || proposal.kind === 'request_correction' ||
    proposal.kind === 'schedule_gates' ? proposal.assignments.map((assignment) => Object.freeze({
      kind: 'derive_assignment',
      proposalId: assignment.proposalId,
      role: assignment.role,
      proposalDigest,
      hypothetical: true,
    })) : [];
  return deepFreeze({
    schemaVersion: 1,
    effectAuthority: false,
    binding: structuredClone(orientation.binding),
    orientationDigest: actualOrientationDigest,
    proposalDigest,
    decisionKind: proposal.kind,
    intents,
  });
}

export function doctorControllerState({ snapshot, orientation, events = [] }) {
  const issues = [];
  try {
    validateOrientation(orientation);
    if (!plainObject(snapshot) || canonicalDigest(snapshot) !== orientation.snapshotDigest) {
      issues.push('snapshot_digest_mismatch');
    }
    if (!taskRevisionAuthorizesEffect(orientation.binding, orientation.task)) {
      issues.push('task_binding_stale');
    }
    if (snapshot?.stop?.requested === true && stopAllowsEffect(snapshot)) issues.push('sticky_stop_violated');
    reduceEventLog(events);
  } catch (error) {
    issues.push(error?.code === 'EVENT_GAP' || error?.code === 'EVENT_CONFLICT' ?
      'event_log_invalid' : 'state_invalid');
  }
  const normalized = [...new Set(issues)].sort();
  return Object.freeze({
    ok: normalized.length === 0,
    disposition: normalized.length === 0 ? 'healthy' : 'reconciliation_required',
    issues: Object.freeze(normalized),
  });
}
