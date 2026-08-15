import {
  buildOrientation,
  convergeRootProposal,
  planControllerTick,
} from './implementation-controller.mjs';
import { runFinalizationAsync } from './implementation-finalization.mjs';
import { validateImplementationCandidate } from './implementation-git.mjs';
import { createImplementationPipeline } from './implementation-pipeline.mjs';
import {
  canonicalDigest,
  createRootLaunchIntent,
  validateAssignment,
  validateAttempt,
  validateBinding,
  validateCheckReceipt,
  validateControlRequest,
  validateControllerId,
  validateLaunchReceipt,
  validateModelResult,
  validateOperation,
  validateProcessReceipt,
  validateRef,
  validateResourceReceipt,
  validateRootDecision,
  validateRootLaunchIntent,
  validateRootModelResult,
  validateRootDecisionProposal,
  validateTerminalReceipt,
  validateTimestamp,
  validateWorkerResult,
} from './implementation-protocol.mjs';
import { planImplementationStart } from './implementation-supervisor.mjs';
import {
  evaluateVerificationGate,
  validateCheckRequirement,
} from './implementation-verification.mjs';

export const IMPLEMENTATION_APPLICATION_VERSION = 1;

const APPLICATIONS = new WeakSet();
const TERMINAL_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);

export class ImplementationApplicationError extends Error {
  constructor(code, message, { reconciliationRequired = false, cause = undefined } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ImplementationApplicationError';
    this.code = code;
    this.reconciliationRequired = reconciliationRequired;
  }
}

function fail(code, message, options) {
  throw new ImplementationApplicationError(code, message, options);
}

function reconcile(code, message, cause) {
  fail(code, message, { reconciliationRequired: true, cause });
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

function exactPort(port, methods, label) {
  if (!plainObject(port) || methods.some((method) => typeof port[method] !== 'function')) {
    fail('APPLICATION_PORT_INVALID', `${label} port is invalid`);
  }
  return port;
}

function nowFrom(clock) {
  const value = clock();
  try { validateTimestamp(value, 'application clock'); } catch {
    fail('APPLICATION_CLOCK_INVALID', 'application clock returned an invalid timestamp');
  }
  return value;
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

function sameAuthority(left, right) {
  return plainObject(left) && plainObject(right) && [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'controlGeneration', 'correctionGeneration',
  ].every((key) => left[key] === right[key]);
}

function reference(kind, id, value) {
  const result = Object.freeze({ kind, id, digest: canonicalDigest(value) });
  validateRef(result);
  return result;
}

function bindingFor(run, snapshot) {
  const value = Object.freeze({
    runId: run.runId,
    epoch: snapshot.epoch,
    snapshotRevision: snapshot.revision,
    taskId: run.authority.taskId,
    taskRevision: run.authority.taskRevision,
    taskRecordVersion: snapshot.taskRecordVersion,
    capsuleDigest: run.authority.capsuleDigest,
    controlGeneration: snapshot.controlGeneration,
    correctionGeneration: snapshot.correctionGeneration,
  });
  validateBinding(value);
  return value;
}

function applicationState(run) {
  const assignments = [...run.assignments.values()]
    .map((entry) => Object.freeze({
      assignmentId: entry.assignment.assignmentId,
      generation: entry.assignment.generation,
      resultObserved: entry.resultObserved,
      integrated: entry.integrated,
      rejected: entry.rejected,
      gatePassed: entry.gatePassed,
      stale: entry.stale,
      candidateId: entry.candidate?.candidateId ?? null,
    }))
    .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId, 'en'));
  return deepFreeze({
    runId: run.runId,
    disposition: run.reconciliation === null
      ? run.finalization === null ? 'active' : 'finalization_handoff'
      : 'reconciliation_required',
    assignments,
    currentCandidate: run.currentCandidate === null
      ? null
      : Object.freeze({
        candidateId: run.currentCandidate.candidateId,
        tree: run.currentCandidate.tree,
      }),
    gate: run.gate,
    waiting: run.waiting,
    waitState: run.waitState,
    operatorBlock: run.operatorBlock,
    decisions: run.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      kind: decision.proposal.kind,
      binding: decision.binding,
    })),
    finalization: run.finalization,
    reconciliation: run.reconciliation,
  });
}

function stampAssignment(template, binding) {
  if (!plainObject(template) || Object.hasOwn(template, 'binding')) {
    fail('APPLICATION_INPUT_INVALID', 'assignment templates must omit binding');
  }
  const assignment = deepFreeze({ ...structuredClone(template), binding: { ...binding } });
  validateAssignment(assignment, { expectedBinding: binding });
  return assignment;
}

function rootAssignment({ run, binding, orientation, repository }) {
  const policy = run.rootDecision;
  const assignment = deepFreeze({
    schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
    assignmentId: `root_${canonicalDigest({ runId: run.runId,
      orientation: orientation.digest }).slice(7, 31)}`,
    generation: 1,
    binding: { ...binding },
    sourceDecisionId: null,
    sourceProposalId: null,
    role: 'root_decision',
    profileDigest: policy.profileDigest,
    goal: 'Make one bounded semantic decision for the exact published orientation.',
    scope: [],
    nonGoals: ['Do not perform supervisor effects.'],
    dependencies: [],
    ownership: { writePaths: [], readPaths: [] },
    resources: [],
    baseCandidateId: policy.baseCandidateId,
    baseTree: repository.tree,
    permissions: {
      sandbox: 'read-only', network: false, approvalPolicy: 'never', nestedAgents: false,
    },
    checks: [],
    deadlineAt: policy.deadlineAt,
    restartPolicy: 'never',
  });
  validateAssignment(assignment, { expectedBinding: binding });
  return assignment;
}

function deriveAssignments({ run, proposal, decisionId, binding, repository }) {
  const proposals = Array.isArray(proposal.assignments) ? proposal.assignments : [];
  const ids = new Map(proposals.map((item) => [item.proposalId,
    `assignment_${canonicalDigest({ decisionId, proposalId: item.proposalId }).slice(7, 31)}`]));
  return proposals.map((item) => {
    const profileDigest = run.rootDecision.profileDigests?.[item.role];
    if (typeof profileDigest !== 'string') {
      fail('APPLICATION_ROOT_POLICY_INVALID', `no trusted profile digest exists for ${item.role}`);
    }
    const assignment = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      assignmentId: ids.get(item.proposalId),
      generation: Math.max(1, binding.correctionGeneration + 1),
      binding: { ...binding },
      sourceDecisionId: decisionId,
      sourceProposalId: item.proposalId,
      role: item.role,
      profileDigest,
      goal: item.goal,
      scope: [...item.scope],
      nonGoals: [...item.nonGoals],
      dependencies: item.dependencies.map((dependency) => ({
        assignmentId: dependency.targetKind === 'proposal'
          ? ids.get(dependency.targetId)
          : dependency.targetId,
        condition: dependency.condition,
        generation: dependency.targetKind === 'proposal'
          ? Math.max(1, binding.correctionGeneration + 1)
          : run.assignments.get(dependency.targetId)?.assignment.generation ?? 1,
      })),
      ownership: structuredClone(item.ownership),
      resources: structuredClone(item.resources),
      baseCandidateId: run.currentCandidate?.candidateId ?? run.rootDecision.baseCandidateId,
      baseTree: run.currentCandidate?.tree ?? repository.tree,
      permissions: {
        sandbox: ['implementer', 'qa'].includes(item.role) ? 'workspace-write' : 'read-only',
        network: false,
        approvalPolicy: 'never',
        nestedAgents: false,
      },
      checks: [...item.checks],
      deadlineAt: run.rootDecision.deadlineAt,
      restartPolicy: item.restartPolicy,
    });
    validateAssignment(assignment, { expectedBinding: binding });
    return assignment;
  });
}

function activeEntries(run) {
  return [...run.assignments.values()].filter((entry) =>
    entry.stale !== true && entry.rejected !== true &&
    entry.attempt?.state !== 'quarantined');
}

function candidateChoice(entry) {
  return entry.attempt === null ? null : candidateIdFor(entry.attempt.attemptId);
}

function semanticPoint(run, dispatch = []) {
  const active = activeEntries(run);
  if (run.bootstrapOnly !== true && active.length === 0) {
    return Object.freeze({ kind: 'declare_assignments' });
  }
  const integration = active.filter((entry) => entry.resultObserved && !entry.integrated &&
      entry.candidate !== null)
    .map((entry) => ({ assignmentId: entry.assignment.assignmentId,
      candidateId: candidateChoice(entry) }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId, 'en'));
  if (integration.length > 0) {
    return Object.freeze({ kind: 'integrate_candidate', candidates: Object.freeze(integration) });
  }
  if (run.gate?.disposition === 'correction_required') {
    return Object.freeze({
      kind: 'request_correction',
      failedCheckIds: Object.freeze([...run.gate.failed].sort()),
    });
  }
  if (run.currentCandidate !== null && run.verifiedCandidateId !== run.currentCandidate.candidateId &&
      active.some((entry) => entry.integrated)) {
    return Object.freeze({
      kind: 'schedule_gates',
      candidateId: run.currentCandidate.candidateId,
    });
  }
  const complete = active.length > 0 && active.every((entry) =>
    entry.resultObserved && entry.integrated && entry.gatePassed);
  if (complete && run.gate?.disposition === 'passed') {
    return Object.freeze({
      kind: 'finalize',
      candidateId: run.currentCandidate.candidateId,
      requiredCheckReceiptIds: Object.freeze(run.receipts.map(({ receiptId }) => receiptId).sort()),
    });
  }
  if (Array.isArray(dispatch) && dispatch.length === 0 &&
      active.some((entry) => !entry.resultObserved)) {
    return Object.freeze({ kind: 'wait' });
  }
  return null;
}

const CONTROL_DECISIONS = new Set(['wait', 'checkpoint_task', 'request_approval', 'stop', 'fail']);

function validateSemanticProposal(run, semantic, proposal) {
  const candidateDisposition = semantic.kind === 'integrate_candidate' &&
    ['integrate_candidate', 'reject_candidate'].includes(proposal.kind);
  if (proposal.kind !== semantic.kind && !candidateDisposition &&
      !CONTROL_DECISIONS.has(proposal.kind)) {
    fail('APPLICATION_ROOT_DECISION_INVALID',
      `Root proposal ${proposal.kind} cannot decide ${semantic.kind}`);
  }
  if (proposal.kind === 'integrate_candidate' &&
      !semantic.candidates.some(({ candidateId }) => candidateId === proposal.candidateId)) {
    fail('APPLICATION_ROOT_DECISION_INVALID', 'Root selected a non-current candidate');
  }
  if (proposal.kind === 'reject_candidate' &&
      !semantic.candidates.some(({ candidateId }) => candidateId === proposal.candidateId)) {
    fail('APPLICATION_ROOT_DECISION_INVALID', 'Root rejected a non-current candidate');
  }
  if (proposal.kind === 'schedule_gates' && proposal.candidateId !== semantic.candidateId) {
    fail('APPLICATION_ROOT_DECISION_INVALID', 'Root scheduled gates for a stale candidate');
  }
  if (proposal.kind === 'request_correction') {
    const staleIds = new Set(proposal.supersededAssignmentIds);
    if (proposal.affectedCheckIds.length === 0 ||
        semantic.failedCheckIds.some((id) => !proposal.affectedCheckIds.includes(id)) ||
        [...staleIds].some((id) => run.assignments.get(id)?.stale !== false)) {
      fail('APPLICATION_ROOT_DECISION_INVALID', 'Root correction does not stale exact affected work');
    }
  }
  if (proposal.kind === 'finalize') {
    const actual = [...proposal.requiredCheckReceiptIds].sort();
    if (proposal.candidateId !== semantic.candidateId ||
        canonicalDigest(actual) !== canonicalDigest(semantic.requiredCheckReceiptIds)) {
      fail('APPLICATION_ROOT_DECISION_INVALID', 'Root finalize proposal is stale or incomplete');
    }
  }
  return proposal;
}

function operationId(kind, idempotencyKey) {
  return `operation_${canonicalDigest({ kind, idempotencyKey }).slice(7, 31)}`;
}

function makeOperation(specification, prior, changes) {
  const operation = deepFreeze({
    schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
    operationId: specification.operationId,
    recordVersion: prior === null ? 1 : prior.recordVersion + 1,
    previousDigest: prior === null ? null : canonicalDigest(prior),
    idempotencyKey: specification.idempotencyKey,
    kind: specification.kind,
    subject: specification.subject,
    binding: specification.binding,
    inputDigest: specification.inputDigest,
    expected: specification.expected,
    state: changes.state,
    attemptNumber: changes.attemptNumber,
    receipt: changes.receipt ?? null,
    observedAt: changes.observedAt,
    failureCode: changes.failureCode ?? null,
  });
  validateOperation(operation, { expectedBinding: specification.binding });
  return operation;
}

function operationInvariant(value) {
  return {
    operationId: value.operationId,
    idempotencyKey: value.idempotencyKey,
    kind: value.kind,
    subject: value.subject,
    binding: value.binding,
    inputDigest: value.inputDigest,
    expected: value.expected,
  };
}

function assertApplication(application) {
  if (!APPLICATIONS.has(application)) {
    fail('APPLICATION_INVALID', 'application service receiver is invalid');
  }
}

function eventFor({ runtimeState, binding, kind, subject, payload, correlationId, observedAt }) {
  const eventSeed = { kind, subject, payload, correlationId, binding };
  return deepFreeze({
    schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
    eventId: `event_${canonicalDigest(eventSeed).slice(7, 31)}`,
    sequence: runtimeState.snapshot.eventCursor + 1,
    binding: { ...binding },
    kind,
    subject: { ...subject },
    causationId: null,
    correlationId,
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `application:${canonicalDigest(eventSeed)}`,
    observedAt,
    payload: { ...payload },
  });
}

function attemptIdFor(runId, assignment) {
  return `attempt_${canonicalDigest({ runId, id: assignment.assignmentId,
    generation: assignment.generation }).slice(7, 31)}`;
}

function candidateIdFor(attemptId) {
  return `candidate_${canonicalDigest({ attemptId }).slice(7, 31)}`;
}

function workspaceIdFor(attemptId) {
  return `workspace_${canonicalDigest({ attemptId }).slice(7, 31)}`;
}

function resultIdFor(attemptId) {
  return `result_${canonicalDigest({ attemptId }).slice(7, 31)}`;
}

function validateObservation(value, label) {
  if (!plainObject(value) || !['absent', 'succeeded', 'ambiguous'].includes(value.outcome) ||
      (value.outcome === 'succeeded') !== Object.hasOwn(value, 'value')) {
    reconcile('APPLICATION_POSTCONDITION_INVALID', `${label} returned an invalid postcondition`);
  }
  return value;
}

/**
 * Leaf orchestration service. All externally mutating behavior is injected through
 * explicit ports; importing this module activates nothing.
 */
export function createImplementationApplicationService({
  runtime,
  taskPort,
  quotaPort,
  approvalPort,
  providerPort,
  processPort,
  workspacePort,
  resourcePort,
  checkPort,
  finalizationPort = Object.freeze({
    async prepare() { return null; },
    run: runFinalizationAsync,
  }),
  clock = () => new Date().toISOString(),
  scheduler = {},
} = {}) {
  exactPort(runtime, [
    'start', 'attachExisting', 'readLifecycle', 'status', 'runUntilQuiescent',
    'pipelineJournal', 'commitTransition',
    'publishStopRequest', 'publishResumeRequest', 'waitForControl', 'doctor', 'release',
  ], 'runtime');
  exactPort(taskPort, ['observe'], 'task');
  exactPort(quotaPort, ['observe'], 'quota');
  exactPort(approvalPort, ['observe'], 'approval');
  exactPort(providerPort, ['observe', 'prepare', 'start', 'wait', 'recover', 'interrupt'],
    'provider');
  exactPort(processPort, ['observe', 'interrupt'], 'process');
  exactPort(workspacePort, [
    'observeRepository', 'observe', 'allocate', 'prepareIngestion', 'integrationInput',
    'observeCleanup', 'cleanup',
  ], 'workspace');
  exactPort(resourcePort, ['observe', 'allocate', 'cleanup'], 'resource');
  exactPort(checkPort, ['requirements', 'run'], 'check');
  exactPort(finalizationPort, ['prepare', 'run'], 'finalization');
  if (typeof clock !== 'function' || !plainObject(scheduler)) {
    fail('APPLICATION_PORT_INVALID', 'application clock or scheduler policy is invalid');
  }
  const runs = new Map();

  async function readAllLifecycle(runId) {
    let after = null;
    const records = [];
    let page;
    for (let index = 0; index < 128; index += 1) {
      page = await runtime.readLifecycle({ runId, after, limit: 128 });
      records.push(...page.records);
      if (page.next === null) return { ...page, records };
      after = page.next;
    }
    reconcile('APPLICATION_RECOVERY_LIMIT', 'lifecycle recovery exceeds its bounded record limit');
  }

  async function runtimeState(run) {
    const state = await runtime.status(run.runId);
    if (!plainObject(state) || !plainObject(state.snapshot)) {
      fail('APPLICATION_RUNTIME_INVALID', 'runtime status omitted its derived snapshot');
    }
    return state;
  }

  async function observeAuthority(run) {
    const state = await runtimeState(run);
    const binding = bindingFor(run, state.snapshot);
    const [task, quota, approvals] = await Promise.all([
      taskPort.observe({ runId: run.runId, binding }),
      quotaPort.observe({ runId: run.runId, binding }),
      approvalPort.observe({ runId: run.runId, binding }),
    ]);
    if (!plainObject(task) || task.id !== binding.taskId ||
        task.taskRevision !== binding.taskRevision ||
        task.recordVersion !== binding.taskRecordVersion || task.status !== 'active') {
      fail('APPLICATION_TASK_STALE', 'task authority changed');
    }
    if (!plainObject(quota) || typeof quota.disposition !== 'string') {
      fail('APPLICATION_QUOTA_INVALID', 'quota observation is invalid');
    }
    if (!plainObject(approvals) || typeof approvals.current !== 'boolean') {
      fail('APPLICATION_APPROVAL_INVALID', 'approval observation is invalid');
    }
    return { state, binding, task, quota, approvals };
  }

  async function guard(run, effect, { cleanup = false, administrative = false } = {}) {
    const authority = await observeAuthority(run);
    const snapshot = authority.state.snapshot;
    if (authority.state.reconciliationRequired || snapshot.reconciliation?.required === true) {
      reconcile('APPLICATION_RUNTIME_RECONCILIATION', `${effect} is blocked by runtime reconciliation`);
    }
    if (!cleanup && (snapshot.stop?.requested === true || snapshot.phase === 'stopping')) {
      fail('APPLICATION_STOPPED', `${effect} is blocked by the sticky stop`);
    }
    if (!cleanup && TERMINAL_PHASES.has(snapshot.phase)) {
      fail('APPLICATION_TERMINAL', `${effect} is blocked after terminal state`);
    }
    if (!cleanup && !administrative && authority.quota.disposition !== 'proceed') {
      fail('APPLICATION_QUOTA_BLOCKED', `${effect} is blocked by quota`);
    }
    if (!cleanup && !administrative && authority.approvals.current !== true) {
      fail('APPLICATION_APPROVAL_BLOCKED', `${effect} is blocked by approval state`);
    }
    return authority;
  }

  function journalFor(run, binding, { cleanup = false } = {}) {
    const inner = runtime.pipelineJournal({ runId: run.runId, expectedBinding: binding });
    return Object.freeze({
      read(kind, id) { return inner.read(kind, id); },
      async publish(kind, id, value) {
        const current = await guard(run, `publish_${kind}`, { cleanup });
        if (!sameAuthority(current.binding, binding)) {
          fail('APPLICATION_BINDING_STALE', 'journal publication lost its runtime binding');
        }
        return inner.publish(kind, id, value);
      },
    });
  }

  async function rehydrateRun(run, status, lifecycleRecords = []) {
    const binding = bindingFor(run, status.snapshot);
    const journal = runtime.pipelineJournal({ runId: run.runId, expectedBinding: binding });
    for (const assignmentRef of status.snapshot.assignments ?? []) {
      const found = await journal.read('assignment', assignmentRef.id);
      if (found === null || found.ref.digest !== assignmentRef.digest) {
        reconcile('APPLICATION_RECOVERY_INCOMPLETE', 'durable assignment evidence is missing');
      }
      validateAssignment(found.value);
      run.assignments.set(found.value.assignmentId, {
        assignment: found.value,
        ref: found.ref,
        attempt: null,
        attemptRef: null,
        result: null,
        resultObserved: false,
        candidate: null,
        integrated: false,
        gatePassed: false,
        stale: false,
        rejected: false,
        resources: [],
        processReceipt: null,
        processReceiptRef: null,
      });
    }
    run.decisions = lifecycleRecords
      .filter((record) => record.kind === 'decision')
      .map((record) => record.value)
      .sort((left, right) => left.binding.snapshotRevision - right.binding.snapshotRevision ||
        left.acceptedAt.localeCompare(right.acceptedAt, 'en') ||
        left.decisionId.localeCompare(right.decisionId, 'en'));
    for (const decision of run.decisions) {
      if (decision.proposal.kind === 'request_correction') {
        for (const id of decision.proposal.supersededAssignmentIds) {
          const entry = run.assignments.get(id);
          if (entry !== undefined) entry.stale = true;
        }
      }
    }
    const latestDecision = run.decisions.at(-1) ?? null;
    if (status.snapshot.phase === 'waiting' && latestDecision?.proposal.kind === 'wait') {
      run.waitState = deepFreeze({
        reasonCode: latestDecision.proposal.reasonCode,
        wakeOn: [...latestDecision.proposal.wakeOn],
        deadlineAt: latestDecision.proposal.deadlineAt,
        quotaDisposition: null,
        approvalsCurrent: null,
      });
    }
    if (['checkpoint_task', 'request_approval'].includes(latestDecision?.proposal.kind)) {
      run.operatorBlock = deepFreeze({
        kind: latestDecision.proposal.kind,
        decisionId: latestDecision.decisionId,
        proposal: latestDecision.proposal,
      });
    }
    for (const attemptRef of status.snapshot.attempts ?? []) {
      const found = await journal.read('attempt', attemptRef.id);
      if (found === null || found.ref.digest !== attemptRef.digest) {
        reconcile('APPLICATION_RECOVERY_INCOMPLETE', 'durable attempt evidence is missing');
      }
      validateAttempt(found.value);
      const entry = run.assignments.get(found.value.assignmentId);
      if (entry === undefined) continue;
      entry.attempt = found.value;
      entry.attemptRef = found.ref;
      entry.rejected = found.value.state === 'rejected' ||
        (found.value.state === 'cleaned' && lifecycleRecords.some((record) =>
          record.kind === 'attempt' && record.id === found.value.attemptId &&
          record.value.state === 'rejected'));
      entry.resultObserved = found.value.result !== null;
      if (found.value.result !== null) {
        const result = await journal.read(found.value.result.kind, found.value.result.id);
        if (result === null || result.ref.digest !== found.value.result.digest) {
          reconcile('APPLICATION_RECOVERY_INCOMPLETE', 'durable model result is missing');
        }
        validateModelResult(result.value);
        entry.result = result.value;
      }
      if (found.value.candidateId !== null) {
        const candidate = await journal.read('candidate', found.value.candidateId);
        if (candidate === null) {
          reconcile('APPLICATION_RECOVERY_INCOMPLETE', 'durable attempt candidate is missing');
        }
        validateImplementationCandidate(candidate.value, { oidLength: candidate.value.tree?.length });
        entry.candidate = candidate.value;
      }
      const processRecords = lifecycleRecords.filter((record) =>
        record.kind === 'process_receipt' && record.value.attemptId === found.value.attemptId)
        .sort((left, right) => left.value.observedAt.localeCompare(right.value.observedAt, 'en'));
      const process = processRecords.at(-1);
      if (process !== undefined) {
        validateProcessReceipt(process.value);
        entry.processReceipt = process.value;
        entry.processReceiptRef = reference('process_receipt', process.id, process.value);
      }
      entry.resources = lifecycleRecords.filter((record) =>
        record.kind === 'resource_receipt' && record.value.attemptId === found.value.attemptId &&
        record.value.action === 'allocate' &&
        !record.value.resourceKey.startsWith('workspace:'))
        .map((record) => ({ claim: null, receipt: record.value,
          ref: reference('resource_receipt', record.id, record.value) }));
      if (['launch_intended', 'running', 'ambiguous'].includes(found.value.state)) {
        const launches = lifecycleRecords.filter((record) =>
          record.kind === 'launch_receipt' &&
          record.value.requestId === found.value.launchRequestId &&
          record.value.processDomainId === found.value.processDomainId)
          .sort((left, right) => left.version - right.version);
        const launch = launches.at(-1);
        const recovered = await providerPort.recover({
          runId: run.runId, binding, assignment: entry.assignment, attempt: found.value,
          launchReceipt: launch?.value ?? null,
          processReceipt: process?.value ?? null,
        });
        if (!plainObject(recovered?.handle) || !plainObject(recovered.handle.expectation) ||
            recovered.handle.expectation.processDomainId !== found.value.processDomainId ||
            (process !== undefined && recovered.handle.expectation.processIdentityDigest !==
              process.value.processIdentityDigest)) {
          reconcile('APPLICATION_RECOVERY_PROCESS_UNPROVED',
            'nonterminal attempt process handle is not exactly recoverable');
        }
        run.inFlight.set(found.value.attemptId, {
          attemptId: found.value.attemptId,
          assignment: entry.assignment,
          binding: found.value.binding,
          workspace: found.value.workspace,
          resources: entry.resources,
          handle: recovered.handle,
        });
      }
    }
    const candidateId = status.snapshot.integration?.candidateId ?? null;
    if (candidateId !== null) {
      const found = await journal.read('candidate', candidateId);
      if (found === null) {
        reconcile('APPLICATION_RECOVERY_INCOMPLETE', 'durable integration candidate is missing');
      }
      validateImplementationCandidate(found.value, { oidLength: found.value.tree?.length });
      run.currentCandidate = found.value;
      for (const entry of run.assignments.values()) {
        if (entry.attempt !== null && found.value.producerAttempts.includes(entry.attempt.attemptId)) {
          entry.candidate = found.value;
          entry.integrated = true;
        }
      }
      const integrated = [...run.assignments.values()].filter((entry) => entry.integrated);
      const requirements = await checkPort.requirements({
        runId: run.runId,
        binding,
        assignments: integrated.map(({ assignment }) => assignment),
        candidate: found.value,
      });
      if (Array.isArray(requirements)) {
        const receipts = [];
        requirements.forEach(validateCheckRequirement);
        for (const receiptRef of status.snapshot.checks ?? []) {
          const receipt = await journal.read('check_receipt', receiptRef.id);
          if (receipt === null || receipt.ref.digest !== receiptRef.digest) {
            reconcile('APPLICATION_RECOVERY_INCOMPLETE',
              'durable verification receipt evidence is missing');
          }
          validateCheckReceipt(receipt.value);
          if (receipt.value.candidateId === found.value.candidateId &&
              receipt.value.candidateTree === found.value.tree) receipts.push(receipt.value);
        }
        if (receipts.length === requirements.length) {
          const gate = evaluateVerificationGate({ requirements, receipts, currentBinding: binding });
          run.requirements = requirements;
          run.receipts = receipts;
          run.gate = gate;
          run.verifiedCandidateId = found.value.candidateId;
          for (const entry of integrated) entry.gatePassed = gate.disposition === 'passed';
        }
      }
    }
    if (TERMINAL_PHASES.has(status.snapshot.phase)) {
      run.finalization = deepFreeze({
        disposition: status.snapshot.phase,
        receipt: null,
        boundariesApplied: [],
        terminalPublished: true,
        issue: null,
      });
    }
    run.changed = true;
  }

  async function publishOperation(journal, operation) {
    const result = await journal.publish('operation', operation.operationId, operation);
    if (result.ref.digest !== canonicalDigest(operation)) {
      reconcile('APPLICATION_JOURNAL_MISMATCH', 'operation journal returned a different record');
    }
    return result;
  }

  async function publishIntendedOperation(run, specification, { cleanup = false } = {}) {
    const journal = journalFor(run, specification.binding, { cleanup });
    const existing = await journal.read('operation', specification.operationId);
    if (existing !== null) {
      validateOperation(existing.value);
      if (!same(operationInvariant(existing.value), specification)) {
        reconcile('APPLICATION_OPERATION_CONFLICT',
          'operation idempotency input conflicts with durable intent');
      }
      return existing.value;
    }
    const operation = makeOperation(specification, null, {
      state: 'intended', attemptNumber: 0, observedAt: nowFrom(clock),
    });
    await publishOperation(journal, operation);
    return operation;
  }

  async function advanceOperation(run, prior, changes, { cleanup = false } = {}) {
    const journal = journalFor(run, prior.binding, { cleanup });
    const durable = await journal.read('operation', prior.operationId);
    if (durable === null) reconcile('APPLICATION_OPERATION_MISSING', 'operation intent is missing');
    if (durable.value.recordVersion > prior.recordVersion) return durable.value;
    if (durable.value.recordVersion !== prior.recordVersion ||
        canonicalDigest(durable.value) !== canonicalDigest(prior)) {
      reconcile('APPLICATION_OPERATION_CONFLICT', 'operation revision changed concurrently');
    }
    const next = makeOperation(operationInvariant(prior), prior, {
      state: changes.state,
      attemptNumber: changes.attemptNumber ?? prior.attemptNumber,
      receipt: changes.receipt ?? null,
      failureCode: changes.failureCode ?? null,
      observedAt: changes.observedAt ?? nowFrom(clock),
    });
    await publishOperation(journal, next);
    return next;
  }

  async function transitionAttempt(run, entry, {
    state,
    observation,
    evidence,
    changes = {},
    additionalRecords = [],
    administrative = false,
    cleanup = false,
  }) {
    const priorTransition = run.transitionTail;
    let releaseTransition;
    run.transitionTail = new Promise((resolve) => { releaseTransition = resolve; });
    await priorTransition;
    try {
    const authority = await guard(run, `attempt_${state}`, { administrative, cleanup });
    const previous = entry.attempt;
    const observedAt = nowFrom(clock);
    const attempt = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      attemptId: previous?.attemptId ?? attemptIdFor(run.runId, entry.assignment),
      assignmentId: entry.assignment.assignmentId,
      attemptNumber: previous?.attemptNumber ?? 1,
      recordVersion: (previous?.recordVersion ?? 0) + 1,
      previousDigest: previous === null ? null : canonicalDigest(previous),
      binding: { ...authority.binding },
      state,
      workspace: structuredClone(changes.workspace ?? previous?.workspace),
      launchRequestId: Object.hasOwn(changes, 'launchRequestId')
        ? changes.launchRequestId : previous?.launchRequestId ?? null,
      processDomainId: Object.hasOwn(changes, 'processDomainId')
        ? changes.processDomainId : previous?.processDomainId ?? null,
      result: Object.hasOwn(changes, 'result') ? changes.result : previous?.result ?? null,
      candidateId: Object.hasOwn(changes, 'candidateId')
        ? changes.candidateId : previous?.candidateId ?? null,
      observedAt,
      terminalReason: Object.hasOwn(changes, 'terminalReason')
        ? changes.terminalReason : previous?.terminalReason ?? null,
    });
    validateAttempt(attempt, { expectedBinding: authority.binding });
    const attemptRef = reference('attempt', attempt.attemptId, attempt);
    const previousRef = previous === null ? null : entry.attemptRef;
    const detail = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      recordType: 'attempt_transition',
      attempt: attemptRef,
      previousAttempt: previousRef,
      observation,
      evidence: evidence.map((value) => ({ ...value })),
      observedAt,
    });
    const detailId = `transition_${canonicalDigest(detail).slice(7, 31)}`;
    const detailRef = reference('detail', detailId, detail);
    const event = eventFor({
      runtimeState: authority.state,
      binding: authority.binding,
      kind: 'attempt_transition',
      subject: attemptRef,
      payload: detailRef,
      correlationId: attempt.attemptId,
      observedAt,
    });
    await runtime.commitTransition({
      runId: run.runId,
      expectedBinding: authority.binding,
      records: [
        ...additionalRecords,
        { kind: 'attempt', id: attempt.attemptId, version: attempt.recordVersion, value: attempt },
        { kind: 'detail', id: detailId, version: 1, value: detail },
      ],
      event,
    });
    entry.attempt = attempt;
    entry.attemptRef = attemptRef;
    return Object.freeze({ attempt, ref: attemptRef, detail: detailRef });
    } finally {
      releaseTransition();
    }
  }

  async function durableEffect({
    run,
    binding,
    kind,
    subject,
    expected,
    idempotencyKey,
    input,
    receiptKind,
    receiptId,
    observe,
    effect,
  }) {
    const journal = journalFor(run, binding);
    const specification = deepFreeze({
      operationId: operationId(kind, idempotencyKey),
      idempotencyKey,
      kind,
      subject: { ...subject },
      binding: { ...binding },
      inputDigest: canonicalDigest(input),
      expected: expected.map((value) => ({ ...value })),
    });
    let persisted = await journal.read('operation', specification.operationId);
    let operation = persisted?.value ?? null;
    if (operation !== null) {
      validateOperation(operation);
      if (!same(operationInvariant(operation), specification)) {
        reconcile('APPLICATION_OPERATION_CONFLICT', 'operation idempotency input conflicts');
      }
      if (operation.state === 'observed_succeeded') {
        const receipt = await journal.read(operation.receipt.kind, operation.receipt.id);
        if (receipt === null || receipt.ref.digest !== operation.receipt.digest) {
          reconcile('APPLICATION_RECEIPT_MISSING', 'successful operation receipt is missing');
        }
        return { operation, receipt, recovered: true };
      }
      if (['ambiguous', 'observed_failed', 'abandoned'].includes(operation.state)) {
        reconcile('APPLICATION_OPERATION_UNCERTAIN', 'operation is not safely repeatable');
      }
    } else {
      operation = makeOperation(specification, null, {
        state: 'intended', attemptNumber: 0, observedAt: nowFrom(clock),
      });
      await publishOperation(journal, operation);
    }
    if (operation.state === 'intended') {
      operation = makeOperation(specification, operation, {
        state: 'started', attemptNumber: operation.attemptNumber + 1, observedAt: nowFrom(clock),
      });
      await publishOperation(journal, operation);
    }

    let observation = validateObservation(await observe(), `${kind} observer`);
    if (observation.outcome === 'ambiguous') {
      const ambiguous = makeOperation(specification, operation, {
        state: 'ambiguous', attemptNumber: operation.attemptNumber,
        failureCode: 'postcondition_unknown', observedAt: nowFrom(clock),
      });
      await publishOperation(journal, ambiguous);
      reconcile('APPLICATION_OPERATION_UNCERTAIN', `${kind} postcondition is ambiguous`);
    }
    if (observation.outcome === 'absent') {
      await guard(run, kind);
      try {
        observation = { outcome: 'succeeded', value: await effect() };
      } catch (error) {
        const after = validateObservation(await observe(), `${kind} recovery observer`);
        if (after.outcome !== 'succeeded') {
          const ambiguous = makeOperation(specification, operation, {
            state: 'ambiguous', attemptNumber: operation.attemptNumber,
            failureCode: 'postcondition_unknown', observedAt: nowFrom(clock),
          });
          await publishOperation(journal, ambiguous);
          reconcile('APPLICATION_OPERATION_UNCERTAIN', `${kind} effect outcome is unknown`, error);
        }
        observation = after;
      }
    }
    const value = deepFreeze(structuredClone(observation.value));
    const receipt = await journal.publish(receiptKind, receiptId, value);
    operation = makeOperation(specification, operation, {
      state: 'observed_succeeded', attemptNumber: operation.attemptNumber,
      receipt: receipt.ref, observedAt: nowFrom(clock),
    });
    await publishOperation(journal, operation);
    return { operation, receipt, recovered: false };
  }

  async function quarantineWorkspace(run, entry, cause) {
    if (typeof workspacePort.observeCollision !== 'function') {
      reconcile('APPLICATION_WORKSPACE_QUARANTINE_UNPROVED',
        'workspace evidence failed without an exact collision observer', cause);
    }
    const authority = await guard(run, 'observe_workspace_collision', {
      administrative: true,
    });
    const output = await workspacePort.observeCollision({
      runId: run.runId,
      binding: authority.binding,
      assignment: entry.assignment,
      attempt: entry.attempt,
      cause,
    });
    const receipt = output?.receipt ?? output;
    validateResourceReceipt(receipt);
    if (receipt.binding.runId !== authority.binding.runId ||
        receipt.binding.controlGeneration !== authority.binding.controlGeneration ||
        receipt.binding.correctionGeneration !== authority.binding.correctionGeneration ||
        receipt.attemptId !== entry.attempt.attemptId ||
        receipt.resourceKey !== `workspace:${entry.attempt.workspace.workspaceId}` ||
        receipt.action !== 'observe_collision' || receipt.outcome !== 'ambiguous' ||
        receipt.ownershipTokenDigest !== entry.attempt.workspace.rootIdentity) {
      reconcile('APPLICATION_WORKSPACE_QUARANTINE_UNPROVED',
        'workspace collision receipt does not bind the exact attempt', cause);
    }
    const receiptRef = reference('resource_receipt', receipt.receiptId, receipt);
    await transitionAttempt(run, entry, {
      state: 'quarantined', observation: 'workspace_quarantined',
      evidence: [receiptRef],
      additionalRecords: [{ kind: 'resource_receipt', id: receipt.receiptId,
        version: 1, value: receipt }],
      administrative: true,
    });
    run.reconciliation = deepFreeze({
      code: 'APPLICATION_WORKSPACE_QUARANTINED',
      message: `workspace ownership for ${entry.attempt.attemptId} remains quarantined`,
    });
    reconcile('APPLICATION_WORKSPACE_QUARANTINED',
      'workspace evidence is quarantined and cannot be ingested or cleaned', cause);
  }

  async function launchAssignment(run, entry, dispatchBinding, {
    mode = 'background',
    orientation = null,
    controlWait = null,
  } = {}) {
    const assignment = entry.assignment;
    const attemptId = attemptIdFor(run.runId, assignment);
    const workspaceId = workspaceIdFor(attemptId);
    const assignmentRef = entry.ref;
    const resultId = resultIdFor(attemptId);
    const allocationInput = deepFreeze({
      assignmentDigest: canonicalDigest(assignment),
      attemptId,
      workspaceId,
      resources: assignment.resources,
    });
    const allocationReceiptId = `workspace_allocate_${attemptId.slice(8)}`;
    const allocated = await durableEffect({
      run,
      binding: dispatchBinding,
      kind: 'allocate_workspace',
      subject: assignmentRef,
      expected: [assignmentRef],
      idempotencyKey: `allocate_workspace:${run.runId}:${attemptId}`,
      input: allocationInput,
      receiptKind: 'resource_receipt',
      receiptId: allocationReceiptId,
      observe: async () => {
        const observed = validateObservation(await workspacePort.observe({
          runId: run.runId, binding: dispatchBinding, assignment, attemptId, workspaceId,
          baseCandidate: run.currentCandidate,
        }), 'workspace allocation observer');
        if (observed.outcome !== 'succeeded') return observed;
        validateResourceReceipt(observed.value.receipt);
        return { outcome: 'succeeded', value: observed.value.receipt };
      },
      effect: async () => {
        const output = await workspacePort.allocate({
          runId: run.runId, binding: dispatchBinding, assignment, attemptId, workspaceId,
          baseCandidate: run.currentCandidate,
        });
        if (!plainObject(output) || !plainObject(output.workspace) ||
            !plainObject(output.receipt)) {
          fail('APPLICATION_WORKSPACE_INVALID', 'workspace allocation evidence is invalid');
        }
        validateResourceReceipt(output.receipt);
        return output.receipt;
      },
    });
    validateResourceReceipt(allocated.receipt.value);
    const allocationObservation = validateObservation(await workspacePort.observe({
      runId: run.runId, binding: dispatchBinding, assignment, attemptId, workspaceId,
      baseCandidate: run.currentCandidate,
    }), 'workspace allocation observer');
    if (allocationObservation.outcome !== 'succeeded' ||
        !plainObject(allocationObservation.value?.workspace) ||
        !same(allocationObservation.value.receipt, allocated.receipt.value)) {
      reconcile('APPLICATION_WORKSPACE_AMBIGUOUS', 'allocated workspace identity is not exact');
    }
    const workspace = allocationObservation.value.workspace;
    if (workspace.workspaceId !== workspaceId || workspace.baseTree !== assignment.baseTree ||
        workspace.rootIdentity !== allocated.receipt.value.ownershipTokenDigest ||
        allocated.receipt.value.resourceKey !== `workspace:${workspaceId}` ||
        allocated.receipt.value.attemptId !== attemptId ||
        allocated.receipt.value.action !== 'allocate' ||
        allocated.receipt.value.outcome !== 'succeeded') {
      reconcile('APPLICATION_WORKSPACE_AMBIGUOUS', 'workspace allocation receipt mismatches identity');
    }
    await transitionAttempt(run, entry, {
      state: 'allocated', observation: 'workspace_allocated',
      evidence: [reference('operation', allocated.operation.operationId, allocated.operation),
        allocated.receipt.ref],
      changes: { workspace },
    });

    entry.resources = [];
    for (const claim of assignment.resources) {
      const receiptId = `resource_allocate_${canonicalDigest({ attemptId, claim }).slice(7, 31)}`;
      const resourceBinding = (await observeAuthority(run)).binding;
      const resource = await durableEffect({
        run,
        binding: resourceBinding,
        kind: 'allocate_resource',
        subject: entry.attemptRef,
        expected: [entry.attemptRef],
        idempotencyKey: `allocate_resource:${run.runId}:${attemptId}:${canonicalDigest(claim)}`,
        input: claim,
        receiptKind: 'resource_receipt',
        receiptId,
        observe: () => resourcePort.observe({ runId: run.runId, assignment, attempt: entry.attempt,
          claim, receiptId }),
        effect: () => resourcePort.allocate({ runId: run.runId, binding: resourceBinding,
          assignment, attempt: entry.attempt, claim, receiptId }),
      });
      validateResourceReceipt(resource.receipt.value);
      if (resource.receipt.value.attemptId !== attemptId ||
          resource.receipt.value.action !== 'allocate' ||
          resource.receipt.value.outcome !== 'succeeded' ||
          resource.receipt.value.ownershipTokenDigest === null ||
          resource.receipt.value.resourceKey.startsWith('workspace:') ||
          entry.resources.some(({ receipt }) =>
            receipt.resourceKey === resource.receipt.value.resourceKey)) {
        reconcile('APPLICATION_RESOURCE_ALLOCATION_INVALID',
          'resource allocation receipt is not unique and exact for the attempt');
      }
      entry.resources.push({ claim, receipt: resource.receipt.value, ref: resource.receipt.ref });
    }

    const launchBinding = (await guard(run, 'publish_launch_intent')).binding;
    const requestId = `request_${attemptId.slice(8)}`;
    const processDomainId = `process_${attemptId.slice(8)}`;
    let rootLaunchIntent = null;
    let rootLaunchIntentRef = null;
    if (mode === 'root_decision') {
      const orientationRef = orientation === null ? null : reference('detail',
        `orientation_${orientation.digest.slice(7, 31)}`, orientation.value);
      let request;
      try {
        request = await providerPort.prepare({
          runId: run.runId,
          binding: launchBinding,
          assignment,
          attempt: entry.attempt,
          resultId,
          mode,
          orientation: orientation?.value ?? null,
          orientationDigest: orientation?.digest ?? null,
          workspace,
          resources: entry.resources.map(({ receipt }) => receipt),
          requestId,
          processDomainId,
        });
        rootLaunchIntent = createRootLaunchIntent({ request, orientation: orientationRef });
        validateRootLaunchIntent(rootLaunchIntent, {
          expectedBinding: launchBinding,
          expectedOrientationRef: orientationRef,
        });
      } catch (error) {
        reconcile('APPLICATION_ROOT_LAUNCH_INTENT_INVALID',
          'Root provider preparation omitted one exact closed launch request', error);
      }
      if (rootLaunchIntent.request.requestId !== requestId ||
          rootLaunchIntent.request.assignmentId !== assignment.assignmentId ||
          rootLaunchIntent.request.attemptId !== attemptId ||
          rootLaunchIntent.request.providerAdapter !== run.provider.adapter ||
          rootLaunchIntent.request.executableVersion !== run.provider.executableVersion ||
          rootLaunchIntent.request.cwdIdentity !== entry.attempt.workspace.rootIdentity ||
          rootLaunchIntent.request.profileDigest !== assignment.profileDigest ||
          rootLaunchIntent.request.baseTree !== assignment.baseTree ||
          rootLaunchIntent.request.deadlineAt !== assignment.deadlineAt ||
          rootLaunchIntent.request.sandbox !== assignment.permissions.sandbox ||
          rootLaunchIntent.request.approvalPolicy !== assignment.permissions.approvalPolicy ||
          rootLaunchIntent.request.network !== assignment.permissions.network ||
          rootLaunchIntent.request.nestedAgents !== assignment.permissions.nestedAgents) {
        reconcile('APPLICATION_ROOT_LAUNCH_INTENT_INVALID',
          'Root launch request differs from its exact assignment or attempt');
      }
      const intentId = `root_launch_${canonicalDigest(rootLaunchIntent).slice(7, 31)}`;
      const publishedIntent = await journalFor(run, launchBinding)
        .publish('detail', intentId, rootLaunchIntent);
      rootLaunchIntentRef = reference('detail', intentId, rootLaunchIntent);
      if (!same(publishedIntent.ref, rootLaunchIntentRef)) {
        reconcile('APPLICATION_ROOT_LAUNCH_INTENT_INVALID',
          'Root launch intent journal returned different evidence');
      }
    }
    const launchInput = deepFreeze({
      assignmentDigest: canonicalDigest(assignment), attemptId, workspaceId,
      resources: entry.resources.map(({ ref }) => ref), mode,
      orientationDigest: orientation?.digest ?? null,
      requestId, processDomainId,
    });
    const specification = deepFreeze({
      operationId: operationId('launch_job',
        `launch_job:${run.runId}:${assignment.assignmentId}:${assignment.generation}`),
      idempotencyKey: `launch_job:${run.runId}:${assignment.assignmentId}:${assignment.generation}`,
      kind: 'launch_job',
      subject: { ...assignmentRef },
      binding: { ...launchBinding },
      inputDigest: rootLaunchIntent === null
        ? canonicalDigest(launchInput)
        : rootLaunchIntent.requestDigest,
      expected: [{ ...assignmentRef }, { ...entry.attemptRef },
        ...(rootLaunchIntentRef === null ? [] : [{ ...rootLaunchIntentRef }])],
    });
    let launchOperation = await publishIntendedOperation(run, specification);
    await transitionAttempt(run, entry, {
      state: 'launch_intended', observation: 'launch_intended',
      evidence: [reference('operation', launchOperation.operationId, launchOperation),
        ...(rootLaunchIntentRef === null ? [] : [rootLaunchIntentRef])],
      changes: { launchRequestId: requestId, processDomainId },
    });
    launchOperation = await advanceOperation(run, launchOperation, {
      state: 'started', attemptNumber: launchOperation.attemptNumber + 1,
    });

    const startBinding = (await guard(run, 'start_provider')).binding;
    const startProvider = async () => {
      try {
        return await providerPort.start({
          runId: run.runId, binding: startBinding, assignment, attempt: entry.attempt,
          resultId, mode, orientation: orientation?.value ?? null, workspace,
          resources: entry.resources.map(({ receipt }) => receipt),
          rootLaunchIntent,
        });
      } catch (error) {
        const recovered = await providerPort.recover({
          runId: run.runId, binding: startBinding, assignment, attempt: entry.attempt,
          resultId, mode, orientation: orientation?.value ?? null,
          rootLaunchIntent,
        });
        if (!plainObject(recovered)) {
          reconcile('APPLICATION_PROVIDER_START_UNCERTAIN',
            'provider spawn outcome has no exact recoverable handle', error);
        }
        return recovered;
      }
    };
    const startPromise = startProvider();
    const started = controlWait === null
      ? { kind: 'started', value: await startPromise }
      : await Promise.race([
        startPromise.then((value) => ({ kind: 'started', value })),
        controlWait.then((value) => ({ kind: 'control', value })),
      ]);
    let stopObserved = started.kind === 'control' ? started.value : null;
    let startEvidence = started.value;
    if (started.kind === 'control') {
      // A doorbell may beat handle capture, but the spawn promise cannot be abandoned:
      // it could still create a process after this controller returned. Wait for the
      // bounded provider-start/recovery seam to yield the exact handle before settling
      // the durable stop.
      startEvidence = await startPromise;
      if (!plainObject(startEvidence)) {
        reconcile('APPLICATION_STOP_DURING_SPAWN_UNCERTAIN',
          'durable stop arrived before an exact provider handle was recoverable');
      }
    }
    if (!plainObject(startEvidence) || !plainObject(startEvidence.handle) ||
        !plainObject(startEvidence.handle.identity) || !plainObject(startEvidence.handle.expectation) ||
        typeof startEvidence.handle.wait !== 'function' ||
        typeof startEvidence.handle.observe !== 'function' ||
        typeof startEvidence.handle.interrupt !== 'function') {
      reconcile('APPLICATION_PROCESS_HANDLE_INVALID', 'provider start omitted an exact process handle');
    }
    validateLaunchReceipt(startEvidence.launchReceipt);
    validateProcessReceipt(startEvidence.processReceipt);
    const runningProcessRef = reference('process_receipt',
      startEvidence.processReceipt.receiptId, startEvidence.processReceipt);
    if (startEvidence.launchReceipt.outcome !== 'running' ||
        startEvidence.launchReceipt.requestId !== requestId ||
        startEvidence.launchReceipt.processDomainId !== processDomainId ||
        !same(startEvidence.launchReceipt.providerHandleRef, runningProcessRef) ||
        startEvidence.processReceipt.state !== 'running' ||
        startEvidence.processReceipt.attemptId !== attemptId ||
        startEvidence.processReceipt.processIdentityDigest !==
          startEvidence.handle.expectation.processIdentityDigest ||
        startEvidence.processReceipt.launcherConnectionId !==
          startEvidence.handle.expectation.launcherConnectionId ||
        startEvidence.processReceipt.processDomainId !==
          startEvidence.handle.expectation.processDomainId) {
      reconcile('APPLICATION_PROCESS_HANDLE_MISMATCH',
        'provider running evidence mismatches the immutable process handle');
    }
    await transitionAttempt(run, entry, {
      state: 'running', observation: 'process_running',
      evidence: [reference('launch_receipt', startEvidence.launchReceipt.receiptId,
        startEvidence.launchReceipt), runningProcessRef],
      additionalRecords: [
        { kind: 'launch_receipt', id: startEvidence.launchReceipt.receiptId,
          version: startEvidence.launchReceipt.recordVersion, value: startEvidence.launchReceipt },
        { kind: 'process_receipt', id: startEvidence.processReceipt.receiptId,
          version: 1, value: startEvidence.processReceipt },
      ],
    });
    run.inFlight.set(attemptId, {
      attemptId, assignment, binding: startBinding, workspace,
      resources: entry.resources, handle: startEvidence.handle,
    });

    if (stopObserved !== null) {
      return deepFreeze({ disposition: 'control_observed', control: stopObserved });
    }

    const waitProvider = async () => {
      try {
        return await providerPort.wait({
          runId: run.runId, binding: startBinding, assignment, attempt: entry.attempt,
          resultId, mode, orientation: orientation?.value ?? null,
          rootLaunchIntent,
          handle: startEvidence.handle, expected: startEvidence.handle.expectation,
        });
      } catch (error) {
        const recovered = validateObservation(await providerPort.observe({
          runId: run.runId, assignment, attempt: entry.attempt, attemptId, resultId, mode,
        }), 'provider terminal observer');
        if (recovered.outcome !== 'succeeded') {
          reconcile('APPLICATION_PROVIDER_EVIDENCE_MISSING',
            'provider terminal outcome is not exactly recoverable', error);
        }
        return recovered.value;
      }
    };
    const completed = controlWait === null
      ? { kind: 'terminal', value: await waitProvider() }
      : await Promise.race([
        waitProvider().then((value) => ({ kind: 'terminal', value })),
        controlWait.then((value) => ({ kind: 'control', value })),
      ]);
    if (completed.kind === 'control') {
      return deepFreeze({ disposition: 'control_observed', control: completed.value });
    }
    const terminal = completed.value;
    if (!plainObject(terminal)) reconcile('APPLICATION_PROVIDER_INVALID', 'terminal evidence is invalid');
    await guard(run, 'record_terminal_provider');
    if (mode === 'root_decision') {
      validateRootModelResult(terminal.result);
      if (orientation === null || terminal.result.orientationDigest !== orientation.digest ||
          rootLaunchIntent === null ||
          terminal.result.promptDigest !== rootLaunchIntent.request.promptDigest ||
          Object.hasOwn(terminal, 'proposal')) {
        reconcile('APPLICATION_ROOT_PROVENANCE_INVALID',
          'Root result does not bind the exact orientation or uses a proposal side channel');
      }
    } else {
      validateWorkerResult(terminal.result);
    }
    validateLaunchReceipt(terminal.launchReceipt);
    validateProcessReceipt(terminal.processReceipt);
    if (!plainObject(terminal.processEvidence) || !Array.isArray(terminal.processEvidence.members) ||
        terminal.processReceipt.membersDigest !== canonicalDigest(terminal.processEvidence.members) ||
        terminal.processEvidence.processIdentityDigest !==
          terminal.processReceipt.processIdentityDigest ||
        terminal.processEvidence.processDomainId !== terminal.processReceipt.processDomainId ||
        terminal.processEvidence.launcherConnectionId !==
          terminal.processReceipt.launcherConnectionId ||
        terminal.processEvidence.state !== terminal.processReceipt.state ||
        terminal.processEvidence.descendantsComplete !==
          terminal.processReceipt.descendantsComplete) {
      reconcile('APPLICATION_PROCESS_EVIDENCE_MISMATCH',
        'typed process receipt does not bind its exact raw observation');
    }
    const resultRef = reference('model_result', resultId, terminal.result);
    const terminalProcessRef = reference('process_receipt', terminal.processReceipt.receiptId,
      terminal.processReceipt);
    if (terminal.launchReceipt.outcome !== 'exited' ||
        terminal.launchReceipt.recordVersion !== startEvidence.launchReceipt.recordVersion + 1 ||
        terminal.launchReceipt.previousDigest !== canonicalDigest(startEvidence.launchReceipt) ||
        !same(terminal.launchReceipt.modelResult, resultRef) ||
        !same(terminal.launchReceipt.providerHandleRef, terminalProcessRef) ||
        terminal.processReceipt.state !== 'empty' ||
        terminal.processReceipt.descendantsComplete !== true ||
        terminal.processReceipt.processIdentityDigest !==
          startEvidence.handle.expectation.processIdentityDigest) {
      reconcile('APPLICATION_PROCESS_LIVE',
        'terminal provider evidence does not prove the exact process domain empty');
    }
    launchOperation = await advanceOperation(run, launchOperation, {
      state: 'observed_succeeded', receipt: resultRef,
      observedAt: terminal.launchReceipt.completedAt,
    });
    await transitionAttempt(run, entry, {
      state: 'terminal_observed', observation: 'process_terminal',
      evidence: [reference('launch_receipt', terminal.launchReceipt.receiptId,
        terminal.launchReceipt), terminalProcessRef],
      changes: { result: resultRef, terminalReason: 'provider_exited' },
      additionalRecords: [
        { kind: 'model_result', id: resultId, version: 1, value: terminal.result },
        { kind: 'launch_receipt', id: terminal.launchReceipt.receiptId,
          version: terminal.launchReceipt.recordVersion, value: terminal.launchReceipt },
        { kind: 'process_receipt', id: terminal.processReceipt.receiptId,
          version: 1, value: terminal.processReceipt },
      ],
    });
    run.inFlight.delete(attemptId);
    entry.processReceipt = terminal.processReceipt;
    entry.processReceiptRef = terminalProcessRef;

    const observedLaunch = deepFreeze({
      attemptId,
      workspace,
      operation: launchOperation,
      operationRef: reference('operation', launchOperation.operationId, launchOperation),
      result: terminal.result,
      resultRef,
      launchReceipt: terminal.launchReceipt,
      processReceipt: terminal.processReceipt,
      rootLaunchIntent,
      rootLaunchIntentRef,
      attempt: entry.attempt,
      attemptRef: entry.attemptRef,
    });
    const priorCausalCommit = run.transitionTail;
    let releaseCausalCommit;
    run.transitionTail = new Promise((resolve) => { releaseCausalCommit = resolve; });
    await priorCausalCommit;
    try {
      await commitLaunchOperation(run, entry, observedLaunch);
      await commitResult(run, entry, observedLaunch);
    } finally {
      releaseCausalCommit();
    }

    let candidate = null;
    let candidateRef = null;
    let ingestOperation = null;
    if (mode !== 'root_decision') {
      const prepared = await workspacePort.prepareIngestion({
        runId: run.runId, assignment, attempt: entry.attempt, workspace,
        processReceipt: terminal.processReceipt,
        processExpectation: startEvidence.handle.expectation,
        processEvidence: terminal.processEvidence,
      });
      if (!plainObject(prepared) || !plainObject(prepared.inspectionInput) ||
          !plainObject(prepared.candidateInput)) {
        reconcile('APPLICATION_INGEST_INPUT_INVALID', 'workspace omitted exact ingestion inputs');
      }
      let ingestAuthority = await guard(run, 'freeze_attempt');
      let pipeline = createImplementationPipeline({
        journal: journalFor(run, ingestAuthority.binding), now: clock,
        checkRunner: async () => fail('APPLICATION_CHECK_INVALID', 'ingestion cannot run checks'),
        observePostcondition: typeof workspacePort.observeIngestion === 'function'
          ? (input) => workspacePort.observeIngestion(input) : null,
      });
      let frozen;
      try {
        frozen = pipeline.freezeAttempt({ inspectionInput: prepared.inspectionInput });
      } catch (error) {
        await quarantineWorkspace(run, entry, error);
      }
      await transitionAttempt(run, entry, {
        state: 'frozen', observation: 'workspace_frozen', evidence: [terminalProcessRef],
      });
      ingestAuthority = await guard(run, 'ingest_attempt');
      pipeline = createImplementationPipeline({
        journal: journalFor(run, ingestAuthority.binding), now: clock,
        checkRunner: async () => fail('APPLICATION_CHECK_INVALID', 'ingestion cannot run checks'),
        observePostcondition: typeof workspacePort.observeIngestion === 'function'
          ? (input) => workspacePort.observeIngestion(input) : null,
      });
      let ingested;
      try {
        ingested = await pipeline.ingestFrozen({
          inspection: frozen,
          candidateInput: { ...prepared.candidateInput, binding: ingestAuthority.binding,
            attemptId, candidateId: candidateIdFor(attemptId) },
          attemptRef: entry.attemptRef,
        });
      } catch (error) {
        await quarantineWorkspace(run, entry, error);
      }
      candidate = ingested.candidate;
      candidateRef = ingested.ref;
      ingestOperation = ingested.operation;
      await transitionAttempt(run, entry, {
        state: 'ingested', observation: 'candidate_ingested',
        evidence: [reference('operation', ingestOperation.operationId, ingestOperation), candidateRef],
        changes: { candidateId: candidate.candidateId },
      });
      entry.candidate = candidate;
    }
    return deepFreeze({
      ...observedLaunch,
      candidate,
      candidateRef,
      ingestOperation,
      attempt: entry.attempt,
      attemptRef: entry.attemptRef,
      proposal: mode === 'root_decision' ? terminal.result.proposal : null,
    });
  }

  async function commitLaunchOperation(run, entry, launched) {
    const authority = await guard(run, 'commit_launch_operation');
    const operationRef = reference('operation', launched.operation.operationId,
      launched.operation);
    const event = eventFor({
      runtimeState: authority.state,
      binding: authority.binding,
      kind: 'operation_transition',
      subject: operationRef,
      payload: launched.resultRef,
      correlationId: entry.assignment.assignmentId,
      observedAt: launched.launchReceipt.completedAt,
    });
    await runtime.commitTransition({
      runId: run.runId,
      expectedBinding: authority.binding,
      event,
    });
  }

  async function commitResult(run, entry, launched) {
    const authority = await guard(run, 'record_provider_result');
    const binding = authority.binding;
    const event = eventFor({
      runtimeState: authority.state,
      binding,
      kind: 'result_observed',
      subject: launched.attemptRef,
      payload: launched.resultRef,
      correlationId: entry.assignment.assignmentId,
      observedAt: launched.launchReceipt.completedAt,
    });
    await guard(run, 'commit_result_event');
    await runtime.commitTransition({ runId: run.runId, expectedBinding: binding, event });
    entry.attempt = launched.attempt;
    entry.attemptRef = launched.attemptRef;
    entry.result = launched.result;
    entry.resultObserved = true;
    run.changed = true;
  }

  async function cleanupAttempt(run, entry, { wake = true } = {}) {
    if (!['accepted', 'rejected', 'stale', 'cleanup_pending'].includes(entry.attempt?.state)) {
      fail('APPLICATION_CLEANUP_INVALID', 'attempt is not dispositioned for cleanup');
    }
    const resuming = entry.attempt.state === 'cleanup_pending';
    const authority = await guard(run, 'publish_cleanup_intent', { cleanup: true });
    const workspaceKey = `workspace:${entry.attempt.workspace.workspaceId}`;
    const cleanupJournal = journalFor(run, authority.binding, { cleanup: true });
    const workspaceOperationId = operationId('cleanup_workspace',
      `cleanup_workspace:${run.runId}:${entry.attempt.attemptId}`);
    const workspaceSpecification = deepFreeze({
      operationId: workspaceOperationId,
      idempotencyKey: `cleanup_workspace:${run.runId}:${entry.attempt.attemptId}`,
      kind: 'cleanup_workspace',
      subject: { ...entry.attemptRef },
      binding: { ...authority.binding },
      inputDigest: canonicalDigest({ workspace: entry.attempt.workspace }),
      expected: [{ ...entry.attemptRef }],
    });
    const durableWorkspaceOperation = resuming
      ? await cleanupJournal.read('operation', workspaceOperationId)
      : null;
    if (resuming && durableWorkspaceOperation === null) {
      reconcile('APPLICATION_CLEANUP_RECOVERY_INCOMPLETE',
        'cleanup-pending attempt lacks its durable workspace operation');
    }
    let workspaceOperation = resuming
      ? durableWorkspaceOperation.value
      : await publishIntendedOperation(run, workspaceSpecification, { cleanup: true });
    validateOperation(workspaceOperation);
    const resourceOperations = [];
    for (const allocated of entry.resources ?? []) {
      const resourceOperationId = operationId('cleanup_resource',
        `cleanup_resource:${run.runId}:${entry.attempt.attemptId}:${allocated.receipt.resourceKey}`);
      const specification = deepFreeze({
        operationId: resourceOperationId,
        idempotencyKey:
          `cleanup_resource:${run.runId}:${entry.attempt.attemptId}:${allocated.receipt.resourceKey}`,
        kind: 'cleanup_resource',
        subject: { ...entry.attemptRef },
        binding: { ...authority.binding },
        inputDigest: canonicalDigest({ allocation: allocated.ref }),
        expected: [{ ...entry.attemptRef }, { ...allocated.ref }],
      });
      const durable = resuming
        ? await cleanupJournal.read('operation', resourceOperationId)
        : null;
      if (resuming && durable === null) {
        reconcile('APPLICATION_CLEANUP_RECOVERY_INCOMPLETE',
          'cleanup-pending attempt lacks a durable resource operation');
      }
      const operation = resuming ? durable.value
        : await publishIntendedOperation(run, specification, { cleanup: true });
      validateOperation(operation);
      resourceOperations.push({ allocated, operation });
    }
    resourceOperations.sort((left, right) =>
      left.operation.operationId.localeCompare(right.operation.operationId, 'en'));
    if (!resuming) {
      await transitionAttempt(run, entry, {
        state: 'cleanup_pending', observation: 'cleanup_intended', administrative: true,
        cleanup: true,
        evidence: [reference('operation', workspaceOperation.operationId, workspaceOperation),
          ...resourceOperations.map(({ operation }) =>
            reference('operation', operation.operationId, operation))],
      });
    }

    const workspaceReceiptId = `workspace_cleanup_${entry.attempt.attemptId.slice(8)}`;
    let workspaceReceipt;
    let workspaceReceiptRef;
    if (workspaceOperation.state === 'observed_succeeded') {
      const durableReceipt = await cleanupJournal.read('resource_receipt', workspaceReceiptId);
      if (durableReceipt === null || !same(durableReceipt.ref, workspaceOperation.receipt)) {
        reconcile('APPLICATION_CLEANUP_RECOVERY_INCOMPLETE',
          'observed workspace cleanup receipt is missing');
      }
      workspaceReceipt = durableReceipt.value;
      workspaceReceiptRef = durableReceipt.ref;
    } else {
      const mayPerform = workspaceOperation.state === 'intended';
      if (mayPerform) {
        workspaceOperation = await advanceOperation(run, workspaceOperation, {
          state: 'started', attemptNumber: workspaceOperation.attemptNumber + 1,
        }, { cleanup: true });
      } else if (workspaceOperation.state !== 'started') {
        reconcile('APPLICATION_CLEANUP_UNCERTAIN',
          'workspace cleanup operation is not safely recoverable');
      }
      const observedBefore = validateObservation(await workspacePort.observeCleanup({
        runId: run.runId, assignment: entry.assignment, attempt: entry.attempt,
        receiptId: workspaceReceiptId,
      }), 'workspace cleanup observer');
      if (observedBefore.outcome === 'succeeded') {
        workspaceReceipt = observedBefore.value.receipt ?? observedBefore.value;
      } else {
        if (!mayPerform || observedBefore.outcome === 'ambiguous') {
          reconcile('APPLICATION_CLEANUP_UNCERTAIN',
            'started workspace cleanup has no exact recoverable postcondition');
        }
        try {
          const output = await workspacePort.cleanup({
            runId: run.runId, assignment: entry.assignment, attempt: entry.attempt,
            receiptId: workspaceReceiptId,
          });
          workspaceReceipt = output?.receipt ?? output;
        } catch (error) {
          const observed = validateObservation(await workspacePort.observeCleanup({
            runId: run.runId, assignment: entry.assignment, attempt: entry.attempt,
            receiptId: workspaceReceiptId,
          }), 'workspace cleanup recovery observer');
          if (observed.outcome !== 'succeeded') {
            reconcile('APPLICATION_CLEANUP_UNCERTAIN', 'workspace cleanup is ambiguous', error);
          }
          workspaceReceipt = observed.value.receipt ?? observed.value;
        }
      }
    }
    validateResourceReceipt(workspaceReceipt);
    if (workspaceReceipt.resourceKey !== workspaceKey || workspaceReceipt.action !== 'cleanup' ||
        workspaceReceipt.outcome !== 'succeeded' ||
        workspaceReceipt.ownershipTokenDigest !== entry.attempt.workspace.rootIdentity) {
      reconcile('APPLICATION_CLEANUP_UNCERTAIN', 'workspace cleanup receipt is not exact');
    }
    if (workspaceReceiptRef === undefined) {
      workspaceReceiptRef = (await journalFor(run, workspaceOperation.binding, { cleanup: true })
        .publish('resource_receipt', workspaceReceipt.receiptId, workspaceReceipt)).ref;
      workspaceOperation = await advanceOperation(run, workspaceOperation, {
        state: 'observed_succeeded', receipt: workspaceReceiptRef,
      }, { cleanup: true });
    }

    const cleanedResources = [];
    for (const item of resourceOperations) {
      let operation = await advanceOperation(run, item.operation, {
        state: 'started', attemptNumber: item.operation.attemptNumber + 1,
      }, { cleanup: true });
      const receiptId = `resource_cleanup_${canonicalDigest({ attemptId: entry.attempt.attemptId,
        key: item.allocated.receipt.resourceKey }).slice(7, 31)}`;
      let receipt;
      try {
        const output = await resourcePort.cleanup({
          runId: run.runId, assignment: entry.assignment, attempt: entry.attempt,
          allocation: item.allocated.receipt, receiptId,
        });
        receipt = output?.receipt ?? output;
      } catch (error) {
        const observed = validateObservation(await resourcePort.observe({
          runId: run.runId, assignment: entry.assignment, attempt: entry.attempt,
          action: 'cleanup', allocation: item.allocated.receipt, receiptId,
        }), 'resource cleanup observer');
        if (observed.outcome !== 'succeeded') {
          reconcile('APPLICATION_CLEANUP_UNCERTAIN', 'resource cleanup is ambiguous', error);
        }
        receipt = observed.value.receipt ?? observed.value;
      }
      validateResourceReceipt(receipt);
      if (receipt.resourceKey !== item.allocated.receipt.resourceKey ||
          receipt.action !== 'cleanup' || receipt.outcome !== 'succeeded' ||
          receipt.attemptId !== entry.attempt.attemptId ||
          receipt.ownershipTokenDigest !== item.allocated.receipt.ownershipTokenDigest) {
        reconcile('APPLICATION_CLEANUP_UNCERTAIN', 'resource cleanup receipt is not exact');
      }
      const receiptRef = (await journalFor(run, operation.binding, { cleanup: true })
        .publish('resource_receipt', receipt.receiptId, receipt)).ref;
      operation = await advanceOperation(run, operation, {
        state: 'observed_succeeded', receipt: receiptRef,
      }, { cleanup: true });
      cleanedResources.push({ operation, receipt, ref: receiptRef });
    }
    cleanedResources.sort((left, right) =>
      left.receipt.resourceKey.localeCompare(right.receipt.resourceKey, 'en'));
    const neverLaunched = entry.attempt.launchRequestId === null &&
      entry.attempt.processDomainId === null;
    const processRef = entry.processReceiptRef;
    if (!neverLaunched && (processRef === null || entry.processReceipt?.state !== 'empty' ||
        entry.processReceipt.descendantsComplete !== true)) {
      reconcile('APPLICATION_CLEANUP_UNCERTAIN',
        'cleanup lacks exact complete process-domain evidence');
    }
    await transitionAttempt(run, entry, {
      state: 'cleaned', observation: 'cleanup_observed', administrative: true,
      cleanup: true,
      evidence: [reference('operation', workspaceOperation.operationId, workspaceOperation),
        workspaceReceiptRef, ...(neverLaunched ? [] : [processRef]),
        ...cleanedResources.flatMap(({ operation, ref }) => [
          reference('operation', operation.operationId, operation), ref,
        ])],
    });
    if (wake) await publishWake(run, ['attempt_cleanup_complete']);
  }

  async function executeRootDecision(run, authority, orientation, repository, semantic,
    controlWait = null) {
    const orientationId = `orientation_${orientation.digest.slice(7, 31)}`;
    const orientationRef = reference('detail', orientationId, orientation.value);
    const orientationEvent = eventFor({
      runtimeState: authority.state,
      binding: authority.binding,
      kind: 'orientation_published',
      subject: orientationRef,
      payload: orientationRef,
      correlationId: orientationId,
      observedAt: orientation.value.observedAt,
    });
    await guard(run, 'publish_orientation');
    await runtime.commitTransition({
      runId: run.runId,
      expectedBinding: authority.binding,
      records: [{ kind: 'detail', id: orientationId, version: 1, value: orientation.value }],
      event: orientationEvent,
    });

    const rootAuthority = await guard(run, 'launch_root_decision');
    const assignment = rootAssignment({
      run,
      binding: rootAuthority.binding,
      orientation,
      repository,
    });
    const rootJournal = journalFor(run, rootAuthority.binding);
    const publishedAssignment = await rootJournal.publish('assignment', assignment.assignmentId,
      assignment);
    const entry = {
      assignment,
      ref: publishedAssignment.ref,
      attempt: null,
      attemptRef: null,
      result: null,
      resultObserved: false,
      candidate: null,
      integrated: false,
      gatePassed: false,
      stale: false,
      rejected: false,
      resources: [],
      processReceipt: null,
      processReceiptRef: null,
    };
    const launched = await launchAssignment(run, entry, rootAuthority.binding, {
      mode: 'root_decision', orientation, controlWait,
    });
    if (launched.disposition === 'control_observed') return launched;
    validateRootDecisionProposal(launched.proposal, {
      knownAssignmentIds: [...run.assignments.keys()],
    });
    validateSemanticProposal(run, semantic, launched.proposal);
    convergeRootProposal({
      proposal: launched.proposal,
      orientation: orientation.value,
      expectedOrientationDigest: orientation.digest,
    });

    const decisionAuthority = await guard(run, 'accept_root_decision');
    const decisionId = `decision_${canonicalDigest({
      orientation: orientation.digest,
      proposal: launched.proposal,
      modelResult: launched.resultRef,
    }).slice(7, 31)}`;
    const assignmentBinding = launched.proposal.kind === 'request_correction'
      ? Object.freeze({
        ...decisionAuthority.binding,
        snapshotRevision: decisionAuthority.binding.snapshotRevision + 1,
        correctionGeneration: decisionAuthority.binding.correctionGeneration + 1,
      })
      : decisionAuthority.binding;
    const assignments = deriveAssignments({
      run,
      proposal: launched.proposal,
      decisionId,
      binding: assignmentBinding,
      repository,
    });
    const assignmentRefs = assignments.map((value) =>
      reference('assignment', value.assignmentId, value));
    const launchReceiptRef = reference('launch_receipt',
      launched.launchReceipt.receiptId, launched.launchReceipt);
    const acceptedAt = nowFrom(clock);
    const decision = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      decisionId,
      binding: { ...decisionAuthority.binding },
      orientationDigest: orientation.digest,
      proposalDigest: canonicalDigest(launched.proposal),
      source: {
        launchIntent: { ...launched.rootLaunchIntentRef },
        launchReceipt: launchReceiptRef,
        modelResult: { ...launched.resultRef },
      },
      proposal: structuredClone(launched.proposal),
      derivedAssignments: assignmentRefs.map((value) => ({ ...value })),
      acceptedAt,
    });
    validateRootDecision(decision, {
      expectedBinding: decisionAuthority.binding,
      expectedOrientationDigest: orientation.digest,
      launchIntentRef: launched.rootLaunchIntentRef,
      launchIntent: launched.rootLaunchIntent,
      launchReceiptRef,
      launchReceipt: launched.launchReceipt,
    });
    const decisionRef = reference('decision', decisionId, decision);
    const decisionEvent = eventFor({
      runtimeState: decisionAuthority.state,
      binding: decisionAuthority.binding,
      kind: 'root_decision_accepted',
      subject: decisionRef,
      payload: decisionRef,
      correlationId: decisionId,
      observedAt: acceptedAt,
    });
    await guard(run, 'commit_root_decision');
    try {
      await runtime.commitTransition({
        runId: run.runId,
        expectedBinding: decisionAuthority.binding,
        records: [
          ...assignments.map((value) => ({
            kind: 'assignment', id: value.assignmentId, version: 1, value,
          })),
          { kind: 'decision', id: decisionId, version: 1, value: decision },
        ],
        event: decisionEvent,
      });
    } catch (error) {
      if (['BINDING_STALE', 'TRANSITION_EVENT_CONFLICT', 'EVENT_STALE']
        .includes(error?.code)) {
        fail('APPLICATION_ROOT_CAS_LOST',
          'Root proposal lost the exact orientation/binding compare-and-swap', { cause: error });
      }
      throw error;
    }
    if (launched.proposal.kind === 'request_correction') {
      for (const assignmentId of launched.proposal.supersededAssignmentIds) {
        const superseded = run.assignments.get(assignmentId);
        if (superseded !== undefined) {
          superseded.stale = true;
          superseded.gatePassed = false;
        }
      }
      run.gate = null;
      run.verifiedCandidateId = null;
    }
    for (const [index, value] of assignments.entries()) {
      run.assignments.set(value.assignmentId, {
        assignment: value,
        ref: assignmentRefs[index],
        attempt: null,
        attemptRef: null,
        result: null,
        resultObserved: false,
        candidate: null,
        integrated: false,
        gatePassed: false,
        stale: false,
        rejected: false,
        resources: [],
        processReceipt: null,
        processReceiptRef: null,
      });
    }
    run.decisions.push(decision);
    run.rootDecisionRef = decisionRef;
    if (launched.proposal.kind === 'wait') {
      run.waitState = deepFreeze({
        reasonCode: launched.proposal.reasonCode,
        wakeOn: [...launched.proposal.wakeOn],
        deadlineAt: launched.proposal.deadlineAt,
        quotaDisposition: decisionAuthority.quota.disposition,
        approvalsCurrent: decisionAuthority.approvals.current,
      });
    } else if (launched.proposal.kind === 'checkpoint_task' ||
        launched.proposal.kind === 'request_approval') {
      run.operatorBlock = deepFreeze({
        kind: launched.proposal.kind,
        decisionId,
        proposal: launched.proposal,
      });
    } else if (launched.proposal.kind === 'fail') {
      run.reconciliation = deepFreeze({
        code: launched.proposal.reasonCode,
        message: launched.proposal.rationale,
      });
    }
    await transitionAttempt(run, entry, {
      state: launched.proposal.kind === 'fail' ? 'rejected' : 'accepted',
      observation: launched.proposal.kind === 'fail' ? 'result_rejected' : 'result_accepted',
      evidence: [decisionRef],
    });
    await cleanupAttempt(run, entry, {
      wake: !['wait', 'finalize', 'stop'].includes(launched.proposal.kind),
    });
    return Object.freeze({ decision, proposal: launched.proposal });
  }

  async function publishWake(run, reasons, deadlineAt = null) {
    const normalized = [...new Set(reasons)].sort();
    if (normalized.length === 0) fail('APPLICATION_WAKE_INVALID', 'wake reasons are empty');
    const authority = await guard(run, 'publish_wake', { administrative: true });
    const observedAt = nowFrom(clock);
    const detail = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      recordType: 'wake_due',
      binding: { ...authority.binding },
      reasons: normalized,
      deadlineAt,
      observedAt,
    });
    const id = `wake_${canonicalDigest(detail).slice(7, 31)}`;
    const detailRef = reference('detail', id, detail);
    const event = eventFor({
      runtimeState: authority.state,
      binding: authority.binding,
      kind: 'wake_due',
      subject: detailRef,
      payload: detailRef,
      correlationId: id,
      observedAt,
    });
    await runtime.commitTransition({
      runId: run.runId,
      expectedBinding: authority.binding,
      records: [{ kind: 'detail', id, version: 1, value: detail }],
      event,
    });
    run.waitState = null;
    run.operatorBlock = null;
    run.changed = true;
    return detailRef;
  }

  async function integrateAssignment(run, entry, decision) {
    await transitionAttempt(run, entry, {
      state: 'accepted', observation: 'candidate_accepted',
      evidence: [reference('decision', decision.decisionId, decision)],
    });
    const authority = await guard(run, 'integrate_candidate');
    const binding = authority.binding;
    const prepared = await workspacePort.integrationInput({
      runId: run.runId, binding, assignment: entry.assignment, attempt: entry.attempt,
      currentCandidate: run.currentCandidate, incomingCandidate: entry.candidate,
    });
    if (!plainObject(prepared) || !plainObject(prepared.currentCandidate) ||
        !plainObject(prepared.input)) {
      reconcile('APPLICATION_INTEGRATION_INPUT_INVALID',
        'workspace omitted exact integration inputs');
    }
    const pipeline = createImplementationPipeline({
      journal: journalFor(run, binding), now: clock,
      checkRunner: async () => fail('APPLICATION_CHECK_INVALID', 'integration cannot run checks'),
      observePostcondition: typeof workspacePort.observeIntegration === 'function'
        ? (input) => workspacePort.observeIntegration(input) : null,
    });
    const integrated = await pipeline.integrate({
      ...prepared.input,
      binding,
      currentCandidate: prepared.currentCandidate,
      incomingCandidate: entry.candidate,
      candidateId: `candidate_integrated_${canonicalDigest({
        current: prepared.currentCandidate.candidateId,
        incoming: entry.candidate.candidateId,
        generation: binding.correctionGeneration,
      }).slice(7, 31)}`,
      producerAttempts: [...new Set([
        ...prepared.currentCandidate.producerAttempts, entry.attempt.attemptId,
      ])].sort(),
      allowedPaths: entry.assignment.ownership.writePaths,
      ownershipDigest: entry.candidate.ownershipDigest,
      createdAt: nowFrom(clock),
    });
    const operationRef = reference('operation', integrated.operation.operationId,
      integrated.operation);
    const event = eventFor({
      runtimeState: authority.state,
      binding,
      kind: 'operation_transition',
      subject: operationRef,
      payload: integrated.ref,
      correlationId: entry.assignment.assignmentId,
      observedAt: integrated.candidate.createdAt,
    });
    await guard(run, 'commit_integration_event');
    await runtime.commitTransition({ runId: run.runId, expectedBinding: binding, event });
    entry.integrated = true;
    run.currentCandidate = integrated.candidate;
    run.gate = null;
    run.verifiedCandidateId = null;
    for (const value of activeEntries(run)) value.gatePassed = false;
    run.changed = true;
    await cleanupAttempt(run, entry);
  }

  async function rejectAssignment(run, entry, decision) {
    await transitionAttempt(run, entry, {
      state: 'rejected', observation: 'candidate_rejected',
      evidence: [reference('decision', decision.decisionId, decision)],
    });
    entry.rejected = true;
    run.changed = true;
    await cleanupAttempt(run, entry);
  }

  async function verifyCandidate(run) {
    if (run.currentCandidate === null) return null;
    let authority = await guard(run, 'prepare_verification');
    const entries = activeEntries(run).filter((entry) => entry.integrated);
    const requirements = await checkPort.requirements({
      runId: run.runId,
      binding: authority.binding,
      assignments: entries.map(({ assignment }) => assignment),
      candidate: run.currentCandidate,
    });
    if (!Array.isArray(requirements)) {
      fail('APPLICATION_CHECK_INVALID', 'check requirements are invalid');
    }
    requirements.forEach(validateCheckRequirement);
    if (requirements.length === 0) {
      fail('APPLICATION_CHECK_INVALID',
        'a gate decision must name at least one durable check requirement');
    }
    const receipts = [];
    const operations = [];
    for (const requirement of requirements) {
      authority = await guard(run, 'prepare_check');
      const binding = authority.binding;
      const pipeline = createImplementationPipeline({
        journal: journalFor(run, binding),
        now: clock,
        checkRunner: async (input) => {
          await guard(run, 'run_check');
          return checkPort.run(input);
        },
        observePostcondition: typeof checkPort.observePostcondition === 'function'
          ? (input) => checkPort.observePostcondition(input)
          : null,
      });
      const one = await pipeline.verify({
        binding,
        candidate: run.currentCandidate,
        requirements: [requirement],
      });
      const receipt = one.receipts[0];
      const operation = one.operations[0];
      validateCheckReceipt(receipt);
      const operationRef = reference('operation', operation.operationId, operation);
      const receiptRef = reference('check_receipt', receipt.receiptId, receipt);
      const event = eventFor({
        runtimeState: authority.state,
        binding,
        kind: 'operation_transition',
        subject: operationRef,
        payload: receiptRef,
        correlationId: requirement.checkId,
        observedAt: receipt.completedAt,
      });
      await runtime.commitTransition({ runId: run.runId, expectedBinding: binding, event });
      receipts.push(receipt);
      operations.push(operation);
    }
    authority = await guard(run, 'complete_verification');
    const gate = evaluateVerificationGate({
      requirements,
      receipts,
      currentBinding: authority.binding,
    });
    run.requirements = requirements;
    run.receipts = receipts;
    run.gate = gate;
    for (const entry of entries) entry.gatePassed = gate.disposition === 'passed';
    run.verifiedCandidateId = run.currentCandidate.candidateId;
    run.changed = true;
    await publishWake(run, ['verification_complete']);
    return { verified: { receipts, operations, gate }, binding: authority.binding };
  }

  async function finalize(run, proposal) {
    if (run.finalization !== null || run.gate?.disposition !== 'passed') return run.finalization;
    const authority = await guard(run, 'prepare_finalization');
    const prepared = await finalizationPort.prepare({
      runId: run.runId,
      binding: authority.binding,
      candidate: run.currentCandidate,
      requirements: run.requirements,
      receipts: run.receipts,
    });
    if (prepared === null) return null;
    if (!plainObject(prepared) || !plainObject(prepared.plan) || !plainObject(prepared.options ?? {})) {
      fail('APPLICATION_FINALIZATION_INVALID', 'finalization preparation is invalid');
    }
    if (proposal.candidateId !== prepared.plan.candidate.candidateId ||
        proposal.completionEvidenceDigest !== prepared.plan.task.completionEvidenceDigest ||
        canonicalDigest([...proposal.requiredCheckReceiptIds].sort()) !==
          canonicalDigest(prepared.plan.requiredCheckReceipts.map(({ id }) => id).sort())) {
      fail('APPLICATION_ROOT_DECISION_INVALID', 'Root finalize attestation does not match the exact plan');
    }
    const pipeline = createImplementationPipeline({
      journal: journalFor(run, authority.binding),
      now: clock,
      checkRunner: async () => fail('APPLICATION_FINALIZATION_INVALID',
        'finalization authorization cannot run a new check'),
    });
    pipeline.authorizeFinalization({
      plan: prepared.plan,
      requirements: run.requirements,
      receipts: run.receipts,
    });
    await guard(run, 'run_finalization');
    const portBoundaryAuthorization = prepared.options.authorizeBoundary ?? null;
    const authorizeBoundary = async (context) => {
      const status = await runtimeState(run);
      const current = bindingFor(run, status.snapshot);
      if (!same(current, prepared.plan.binding) || status.snapshot.stop.requested === true ||
          status.reconciliationRequired) return false;
      const [task, quota, approvals] = await Promise.all([
        taskPort.observe({ runId: run.runId, binding: prepared.plan.binding }),
        quotaPort.observe({ runId: run.runId, binding: prepared.plan.binding }),
        approvalPort.observe({ runId: run.runId, binding: prepared.plan.binding }),
      ]);
      const taskStateValid = plainObject(task) && task.id === prepared.plan.task.taskId &&
        task.taskRevision === prepared.plan.task.taskRevision && (
          (context.observation.task.state === 'open' &&
            task.recordVersion === prepared.plan.task.expectedRecordVersion &&
            task.status === prepared.plan.task.expectedStatus) ||
          (context.observation.task.state === 'closed' &&
            task.recordVersion === prepared.plan.task.completedRecordVersion &&
            task.status === prepared.plan.task.completedStatus));
      if (!taskStateValid || quota?.disposition !== 'proceed' || approvals?.current !== true) {
        return false;
      }
      if (portBoundaryAuthorization !== null &&
          await portBoundaryAuthorization(context) !== true) return false;
      return true;
    };
    const result = await finalizationPort.run({
      plan: prepared.plan,
      ...(prepared.options ?? {}),
      authorizeBoundary,
    });
    if (!plainObject(result) || !['succeeded', 'handoff'].includes(result.disposition)) {
      reconcile('APPLICATION_FINALIZATION_UNCERTAIN', 'finalization returned no exact disposition');
    }
    const handoff = {
      disposition: result.disposition,
      receipt: result.receipt ?? null,
      boundariesApplied: result.boundariesApplied ?? [],
      terminalPublished: false,
      issue: null,
    };
    if (result.disposition === 'succeeded') {
      validateTerminalReceipt(result.receipt);
      const receiptRef = reference('terminal_receipt', result.receipt.receiptId, result.receipt);
      const event = eventFor({
        runtimeState: authority.state,
        binding: authority.binding,
        kind: 'terminal_published',
        subject: receiptRef,
        payload: receiptRef,
        correlationId: prepared.plan.finalizationId,
        observedAt: result.receipt.emittedAt,
      });
      await runtime.commitTransition({
        runId: run.runId,
        expectedBinding: authority.binding,
        records: [{
          kind: 'terminal_receipt', id: result.receipt.receiptId,
          version: 1, value: result.receipt,
        }],
        event,
      });
      handoff.terminalPublished = true;
    }
    run.finalization = deepFreeze(handoff);
    run.changed = true;
    return run.finalization;
  }

  async function cleanStopped(run) {
    const unsettled = [...run.assignments.values()].filter((entry) =>
      entry.attempt !== null && !['cleaned', 'quarantined'].includes(entry.attempt.state));
    if (unsettled.length > 0 || run.inFlight.size > 0) {
      reconcile('APPLICATION_STOP_RECOVERY_REQUIRED',
        'stopped execution has durable unsettled attempts; use requestStop with exact CAS evidence');
    }
    return publishStoppedTerminal(run);
  }

  async function publishStoppedTerminal(run) {
    if (run.finalization?.terminalPublished === true &&
        run.finalization?.receipt?.disposition === 'stopped') {
      return run.finalization.receipt;
    }
    const unsettled = [...run.assignments.values()].some((entry) =>
      entry.attempt !== null && !['cleaned', 'quarantined'].includes(entry.attempt.state));
    if (unsettled || run.inFlight.size > 0) return null;
    const authority = await guard(run, 'publish_stopped_terminal', { cleanup: true });
    const receipt = deepFreeze({
      schemaVersion: IMPLEMENTATION_APPLICATION_VERSION,
      receiptId: `terminal_stopped_${canonicalDigest({ runId: run.runId,
        controlGeneration: authority.binding.controlGeneration }).slice(7, 31)}`,
      binding: { ...authority.binding },
      disposition: 'stopped',
      candidateId: null,
      finalTree: null,
      finalCommit: null,
      taskStatus: authority.task.status,
      taskRecordVersion: authority.task.recordVersion,
      checkReceipts: [],
      completionEvidenceDigest: null,
      emittedAt: nowFrom(clock),
    });
    validateTerminalReceipt(receipt, { expectedBinding: authority.binding });
    const receiptRef = reference('terminal_receipt', receipt.receiptId, receipt);
    const event = eventFor({
      runtimeState: authority.state, binding: authority.binding,
      kind: 'terminal_published', subject: receiptRef, payload: receiptRef,
      correlationId: receipt.receiptId, observedAt: receipt.emittedAt,
    });
    await runtime.commitTransition({
      runId: run.runId,
      expectedBinding: authority.binding,
      records: [{ kind: 'terminal_receipt', id: receipt.receiptId, version: 1, value: receipt }],
      event,
    });
    run.finalization = deepFreeze({ disposition: 'stopped', receipt,
      boundariesApplied: [], terminalPublished: true, issue: null });
    run.changed = true;
    return receipt;
  }

  function beginControlWait(runId, binding) {
    const controller = new AbortController();
    const promise = runtime.waitForControl({
      runId,
      expectedEpoch: binding.epoch,
      expectedControlGeneration: binding.controlGeneration,
      signal: controller.signal,
    }).catch((error) => {
      if (controller.signal.aborted) return Object.freeze({ disposition: 'cancelled' });
      throw error;
    });
    return {
      controller,
      promise,
    };
  }

  async function settleObservedStop(run, observed) {
    if (!plainObject(observed) || observed.disposition !== 'control_observed' ||
        !plainObject(observed.request)) {
      reconcile('APPLICATION_CONTROL_WAKE_INVALID',
        'runtime control wake omitted its replayed durable request');
    }
    try {
      validateControlRequest(observed.request, { expectedRunId: run.runId });
    } catch (error) {
      reconcile('APPLICATION_CONTROL_WAKE_INVALID',
        'runtime control wake returned an invalid durable request', error);
    }
    if (observed.request.kind !== 'stop') {
      reconcile('APPLICATION_CONTROL_WAKE_INVALID',
        'running execution received an unsupported durable control');
    }
    return application.requestStop({
      runId: run.runId,
      requestId: observed.request.requestId,
      expectedEpoch: (await runtimeState(run)).snapshot.epoch,
      expectedControlGeneration: observed.request.expectedControlGeneration,
      reason: observed.request.reason,
      requestedAt: observed.request.requestedAt,
    });
  }

  const application = {
    async start({
      runtimePlan,
      rootDecision = null,
      bootstrapAssignments = [],
      scheduler: runScheduler = {},
      finalization = {},
    } = {}) {
      assertApplication(application);
      if (!plainObject(runtimePlan) || !Array.isArray(bootstrapAssignments) ||
          (rootDecision !== null && !plainObject(rootDecision)) ||
          !plainObject(runScheduler) || !plainObject(finalization) ||
          (rootDecision === null && bootstrapAssignments.length === 0) ||
          (rootDecision !== null && bootstrapAssignments.length > 0)) {
        fail('APPLICATION_INPUT_INVALID', 'application start input is invalid');
      }
      const planned = planImplementationStart(runtimePlan);
      const started = await runtime.start(runtimePlan);
      const runId = started.runId;
      if (started.disposition === 'already_started' &&
          !TERMINAL_PHASES.has(started.state.snapshot.phase)) {
        await runtime.attachExisting({
          runId,
          expectedEpoch: started.state.snapshot.epoch,
          attachedAt: nowFrom(clock),
        });
      }
      const lifecycle = await readAllLifecycle(runId);
      if (lifecycle.authority.manifest.task.id !== planned.manifest.task.id ||
          lifecycle.authority.manifest.task.taskRevision !== planned.manifest.task.taskRevision ||
          (started.disposition !== 'activation_recovered' &&
            lifecycle.authority.capsuleDigest !== canonicalDigest(planned.capsule))) {
        fail('APPLICATION_RECOVERY_STALE', 'durable lifecycle authority differs from start input');
      }
      let run = runs.get(runId);
      if (run === undefined) {
        run = {
          runId,
          authority: {
            taskId: lifecycle.authority.capsule.taskId,
            taskRevision: lifecycle.authority.capsule.taskRevision,
            capsuleDigest: lifecycle.authority.capsuleDigest,
          },
          assignments: new Map(),
          currentCandidate: null,
          requirements: [],
          receipts: [],
          gate: null,
          verifiedCandidateId: null,
          waiting: [],
          waitState: null,
          operatorBlock: null,
          decisions: [],
          finalization: null,
          reconciliation: null,
          changed: true,
          scheduler: { ...scheduler, ...runScheduler },
          finalizationInput: structuredClone(finalization),
          rootDecision: rootDecision === null ? null : structuredClone(rootDecision),
          provider: structuredClone(lifecycle.authority.manifest.provider),
          rootDecisionRef: null,
          bootstrapOnly: rootDecision === null,
          inFlight: new Map(),
          interruptedAttempts: new Set(),
          transitionTail: Promise.resolve(),
        };
        runs.set(runId, run);
        const status = lifecycle.state;
        if ((status.snapshot.assignments?.length ?? 0) > 0 ||
            (status.snapshot.attempts?.length ?? 0) > 0 ||
            status.snapshot.integration?.candidateId !== null ||
            lifecycle.records.some(({ kind }) => kind === 'decision') ||
            TERMINAL_PHASES.has(status.snapshot.phase)) {
          await rehydrateRun(run, status, lifecycle.records);
        }
      }
      if (bootstrapAssignments.length > 0) {
        const authority = await guard(run, 'publish_assignment');
        const journal = journalFor(run, authority.binding);
        for (const template of bootstrapAssignments) {
          validateControllerId(template?.assignmentId, 'assignment template ID');
          const existing = await journal.read('assignment', template.assignmentId);
          const assignment = existing === null
            ? stampAssignment(template, authority.binding)
            : existing.value;
          validateAssignment(assignment);
          const published = existing ?? await journal.publish('assignment', assignment.assignmentId, assignment);
          run.assignments.set(assignment.assignmentId, {
            assignment,
            ref: published.ref,
            attempt: null,
            attemptRef: null,
            result: null,
            resultObserved: false,
            candidate: null,
            integrated: false,
            gatePassed: false,
            stale: false,
            rejected: false,
            resources: [],
            processReceipt: null,
            processReceiptRef: null,
          });
        }
      }
      return deepFreeze({
        disposition: started.disposition,
        runId,
        runtime: started,
        bootstrapOnly: run.bootstrapOnly,
        application: applicationState(run),
      });
    },

    async step({ runId } = {}) {
      assertApplication(application);
      validateControllerId(runId, 'run ID');
      const run = runs.get(runId);
      if (run === undefined) fail('APPLICATION_RUN_UNKNOWN', 'application run is unknown');
      if (run.reconciliation !== null) {
        return deepFreeze({
          disposition: 'reconciliation_required',
          runId,
          application: applicationState(run),
        });
      }
      try {
        let current = await runtimeState(run);
        const controls = await runtime.runUntilQuiescent({
          runId,
          expectedEpoch: current.snapshot.epoch,
          maximumTransitions: 16,
        });
        current = controls.state ?? await runtimeState(run);
        if (controls.disposition === 'reconciliation_required' || current.reconciliationRequired) {
          reconcile('APPLICATION_RUNTIME_RECONCILIATION', 'runtime requires reconciliation');
        }
        if (controls.disposition === 'stopping' || current.snapshot.stop.requested) {
          await cleanStopped(run);
          run.changed = false;
          return deepFreeze({ disposition: 'stopping', runId, application: applicationState(run) });
        }
        if (TERMINAL_PHASES.has(current.snapshot.phase)) {
          return deepFreeze({ disposition: 'terminal', runId, application: applicationState(run) });
        }

        const stranded = [...run.assignments.values()].filter((entry) =>
          entry.attempt !== null && !['ingested', 'cleaned', 'quarantined']
            .includes(entry.attempt.state));
        if (run.inFlight.size > 0 || stranded.length > 0) {
          reconcile('APPLICATION_RECOVERY_EXPLICIT_ACTION_REQUIRED',
            'durable nonterminal attempt recovery requires exact stop or reconciliation action');
        }

        if (run.operatorBlock !== null) {
          return deepFreeze({
            disposition: 'operator_action_required', runId, application: applicationState(run),
          });
        }

        let authority = await observeAuthority(run);
        if (authority.state.snapshot.phase === 'waiting' && run.waitState !== null) {
          const reasons = [];
          const timestamp = Date.parse(nowFrom(clock));
          if (run.waitState.deadlineAt !== null && timestamp >= Date.parse(run.waitState.deadlineAt)) {
            reasons.push('deadline_due');
          }
          if (run.waitState.wakeOn.includes('quota_changed') &&
              authority.quota.disposition !== run.waitState.quotaDisposition) {
            reasons.push('quota_changed');
          }
          if (run.waitState.wakeOn.includes('approval_changed') &&
              authority.approvals.current !== run.waitState.approvalsCurrent) {
            reasons.push('approval_changed');
          }
          if (reasons.length === 0) {
            run.changed = false;
            return deepFreeze({ disposition: 'waiting', runId, application: applicationState(run) });
          }
          await publishWake(run, reasons, run.waitState.deadlineAt);
          return deepFreeze({ disposition: 'progressed', runId, application: applicationState(run) });
        }

        let semantic = semanticPoint(run, null);
        if (semantic !== null && !['dormant', 'waiting'].includes(authority.state.snapshot.phase)) {
          reconcile('APPLICATION_PHASE_STUCK',
            'a semantic decision became due outside an orientable stable phase');
        }

        authority = await observeAuthority(run);
        const repository = await workspacePort.observeRepository({ runId, binding: authority.binding });
        const states = Object.fromEntries([...run.assignments].map(([id, entry]) => [id, {
          generation: entry.assignment.generation,
          resultObserved: entry.resultObserved,
          integrated: entry.integrated,
          gatePassed: entry.gatePassed,
          stale: entry.stale,
          candidateId: candidateChoice(entry),
        }]));
        const pending = activeEntries(run)
          .filter((entry) => !entry.resultObserved)
          .map(({ assignment }) => assignment);
        let orientation = buildOrientation({
          binding: authority.binding,
          snapshot: authority.state.snapshot,
          task: authority.task,
          repository,
          pendingAssignments: pending,
          runningAssignments: [],
          assignmentStates: states,
          verification: {
            gate: run.gate,
            semantic,
            candidateId: run.currentCandidate?.candidateId ?? null,
            checkReceiptIds: run.receipts.map(({ receiptId }) => receiptId).sort(),
          },
          controls: { stopRequested: authority.state.snapshot.stop.requested },
          deadlines: run.waitState ?? {},
          quota: authority.quota,
          approvals: authority.approvals,
          observedAt: nowFrom(clock),
        });
        let planned = planControllerTick({
          snapshot: authority.state.snapshot,
          orientation: orientation.value,
          stateChanged: run.changed || semantic !== null,
          serializedResourceKeys: run.scheduler.serializedResourceKeys ?? [],
          priorityByAssignmentId: run.scheduler.priorityByAssignmentId ?? {},
          caps: run.scheduler.caps ?? {},
          shadow: false,
        });
        let dispatch = planned.background.dispatch ?? [];
        run.waiting = planned.background.waiting ?? [];
        semantic ??= semanticPoint(run, dispatch);
        if (semantic !== null && orientation.value.verification.semantic === null) {
          orientation = buildOrientation({
            ...orientation.value,
            snapshot: authority.state.snapshot,
            verification: { ...orientation.value.verification, semantic },
          });
          planned = planControllerTick({
            snapshot: authority.state.snapshot,
            orientation: orientation.value,
            stateChanged: true,
            serializedResourceKeys: run.scheduler.serializedResourceKeys ?? [],
            priorityByAssignmentId: run.scheduler.priorityByAssignmentId ?? {},
            caps: run.scheduler.caps ?? {},
            shadow: false,
          });
          dispatch = planned.background.dispatch ?? [];
        }

        if (semantic !== null && run.rootDecision !== null) {
          if (planned.root === null) {
            fail('APPLICATION_ROOT_UNAVAILABLE', 'semantic decision point has no current Root tick');
          }
          const rootControlWait = beginControlWait(runId, authority.binding);
          let accepted;
          try {
            accepted = await executeRootDecision(run, authority, orientation, repository, semantic,
              rootControlWait.promise);
          } finally {
            rootControlWait.controller.abort();
          }
          if (accepted?.disposition === 'control_observed') {
            await settleObservedStop(run, accepted.control);
            fail('APPLICATION_STOPPED', 'durable stop interrupted the Root provider');
          }
          const proposal = accepted.proposal;
          if (proposal.kind === 'integrate_candidate') {
            const entry = activeEntries(run).find((value) =>
              candidateChoice(value) === proposal.candidateId && value.resultObserved && !value.integrated);
            if (entry === undefined) fail('APPLICATION_ROOT_DECISION_INVALID', 'selected candidate disappeared');
            await integrateAssignment(run, entry, accepted.decision);
          } else if (proposal.kind === 'reject_candidate') {
            const entry = activeEntries(run).find((value) =>
              candidateChoice(value) === proposal.candidateId && value.resultObserved &&
              !value.integrated);
            if (entry === undefined) fail('APPLICATION_ROOT_DECISION_INVALID',
              'rejected candidate disappeared');
            await rejectAssignment(run, entry, accepted.decision);
          } else if (proposal.kind === 'schedule_gates') {
            await verifyCandidate(run);
          } else if (proposal.kind === 'finalize') {
            const finalization = await finalize(run, proposal);
            run.changed = false;
            return deepFreeze({
              disposition: finalization === null ? 'waiting' : 'finalization_handoff',
              runId,
              application: applicationState(run),
            });
          } else if (proposal.kind === 'wait') {
            run.changed = false;
            return deepFreeze({ disposition: 'waiting', runId, application: applicationState(run) });
          } else if (proposal.kind === 'checkpoint_task' || proposal.kind === 'request_approval') {
            run.changed = false;
            return deepFreeze({
              disposition: 'operator_action_required', runId, application: applicationState(run),
            });
          } else if (proposal.kind === 'stop') {
            run.changed = false;
            return deepFreeze({ disposition: 'stopping', runId, application: applicationState(run) });
          } else if (proposal.kind === 'fail') {
            return deepFreeze({
              disposition: 'reconciliation_required', runId, application: applicationState(run),
            });
          }
          return deepFreeze({
            disposition: 'progressed', runId, plan: planned, application: applicationState(run),
          });
        }

        if (semantic !== null && run.bootstrapOnly === true) {
          run.changed = false;
          return deepFreeze({ disposition: 'waiting', runId, plan: planned,
            application: applicationState(run) });
        }
        if (dispatch.length > 0) {
          const dispatchBinding = authority.binding;
          const controlWait = beginControlWait(runId, dispatchBinding);
          let launched;
          try {
            launched = await Promise.all(dispatch.map(async (assignmentId) => {
              const entry = run.assignments.get(assignmentId);
              return { entry, launched: await launchAssignment(run, entry, dispatchBinding, {
                controlWait: controlWait.promise,
              }) };
            }));
          } finally {
            controlWait.controller.abort();
          }
          const stopped = launched.find(({ launched: value }) =>
            value.disposition === 'control_observed');
          if (stopped !== undefined) {
            await settleObservedStop(run, stopped.launched.control);
            fail('APPLICATION_STOPPED', 'durable stop interrupted provider execution');
          }
          return deepFreeze({
            disposition: 'progressed', runId, plan: planned, application: applicationState(run),
          });
        }
        run.changed = false;
        return deepFreeze({ disposition: 'waiting', runId, plan: planned,
          application: applicationState(run) });
      } catch (error) {
        if (error?.reconciliationRequired === true) {
          run.reconciliation = deepFreeze({
            code: error.code ?? 'APPLICATION_RECONCILIATION_REQUIRED',
            message: error.message,
          });
          return deepFreeze({
            disposition: 'reconciliation_required',
            runId,
            application: applicationState(run),
          });
        }
        if (error?.code === 'APPLICATION_STOPPED') {
          run.changed = false;
          return deepFreeze({
            disposition: 'stopping', runId, application: applicationState(run),
          });
        }
        throw error;
      }
    },

    async runUntilQuiescent({ runId, maximumSteps = 16 } = {}) {
      assertApplication(application);
      if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1 || maximumSteps > 128) {
        fail('APPLICATION_INPUT_INVALID', 'maximum application step count is invalid');
      }
      let result;
      for (let step = 0; step < maximumSteps; step += 1) {
        result = await application.step({ runId });
        if (['waiting', 'stopping', 'terminal', 'finalization_handoff',
          'reconciliation_required'].includes(result.disposition)) {
          return deepFreeze({ ...result, steps: step + 1 });
        }
      }
      return deepFreeze({ ...result, disposition: 'transition_limit', steps: maximumSteps });
    },

    async requestStop({
      runId, requestId, expectedEpoch, expectedControlGeneration, reason, requestedAt,
    } = {}) {
      assertApplication(application);
      const run = runs.get(runId);
      if (run === undefined) fail('APPLICATION_RUN_UNKNOWN', 'application run is unknown');
      if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 1 ||
          !Number.isSafeInteger(expectedControlGeneration) || expectedControlGeneration < 0) {
        fail('APPLICATION_INPUT_INVALID', 'stop CAS inputs are invalid');
      }
      const published = await runtime.publishStopRequest({
        runId,
        requestId,
        expectedControlGeneration,
        reason,
        ...(requestedAt === undefined ? {} : { requestedAt }),
      });
      const accepted = await runtime.runUntilQuiescent({
        runId,
        expectedEpoch,
        maximumTransitions: 16,
      });
      const acceptedControl = accepted.state?.acceptedControls?.at(-1) ?? null;
      if (acceptedControl?.kind !== 'stop' ||
          acceptedControl.controlGeneration !== accepted.state.snapshot.controlGeneration ||
          !plainObject(acceptedControl.detailRef)) {
        reconcile('APPLICATION_STOP_EVIDENCE_MISSING',
          'runtime did not return the exact latest accepted stop evidence');
      }
      const stopBinding = bindingFor(run, accepted.state.snapshot);
      const interrupted = [];
      const handledAttempts = new Set();
      for (const flight of [...run.inFlight.values()]) {
        await guard(run, 'interrupt_process', { cleanup: true });
        const processInterrupted = await processPort.interrupt({
          runId, attemptId: flight.attemptId, assignment: flight.assignment,
          binding: stopBinding,
          handle: flight.handle,
          expected: flight.handle.expectation,
        });
        if (!plainObject(processInterrupted?.processReceipt)) {
          reconcile('APPLICATION_STOP_EVIDENCE_MISSING',
            'process interrupt port omitted its exact typed receipt');
        }
        validateProcessReceipt(processInterrupted.processReceipt);
        await guard(run, 'interrupt_provider', { cleanup: true });
        const providerInterrupted = await providerPort.interrupt({
          runId, attemptId: flight.attemptId, assignment: flight.assignment,
          binding: stopBinding, handle: flight.handle,
          expected: flight.handle.expectation,
          processReceipt: processInterrupted.processReceipt,
        });
        const entry = run.assignments.get(flight.assignment.assignmentId);
        const launchReceipt = providerInterrupted?.launchReceipt;
        const processReceipt = processInterrupted?.processReceipt;
        if (entry === undefined || !plainObject(launchReceipt) || !plainObject(processReceipt)) {
          reconcile('APPLICATION_STOP_EVIDENCE_MISSING',
            'interrupt ports omitted exact typed stop evidence');
        }
        validateLaunchReceipt(launchReceipt);
        validateProcessReceipt(processReceipt);
        const processRef = reference('process_receipt', processReceipt.receiptId, processReceipt);
        if (launchReceipt.outcome !== 'exited' ||
            !same(launchReceipt.providerHandleRef, processRef) ||
            launchReceipt.requestId !== entry.attempt.launchRequestId ||
            launchReceipt.processDomainId !== entry.attempt.processDomainId ||
            processReceipt.action !== 'interrupt') {
          reconcile('APPLICATION_STOP_EVIDENCE_MISMATCH',
            'interrupt evidence mismatches the durable attempt identity');
        }
        const provedEmpty = processReceipt.state === 'empty' &&
          processReceipt.descendantsComplete === true;
        await transitionAttempt(run, entry, {
          state: provedEmpty ? 'stale' : 'quarantined',
          observation: provedEmpty ? 'stop_stale' : 'stop_quarantined',
          evidence: [acceptedControl.detailRef,
            reference('launch_receipt', launchReceipt.receiptId, launchReceipt), processRef],
          additionalRecords: [
            { kind: 'launch_receipt', id: launchReceipt.receiptId,
              version: launchReceipt.recordVersion, value: launchReceipt },
            { kind: 'process_receipt', id: processReceipt.receiptId, version: 1,
              value: processReceipt },
          ],
          cleanup: true,
        });
        entry.processReceipt = processReceipt;
        entry.processReceiptRef = processRef;
        handledAttempts.add(entry.attempt.attemptId);
        run.inFlight.delete(flight.attemptId);
        if (provedEmpty) {
          await cleanupAttempt(run, entry, { wake: false });
          interrupted.push(flight.attemptId);
        } else {
          run.reconciliation = deepFreeze({
            code: 'APPLICATION_PROCESS_QUARANTINED',
            message: `process ownership for ${flight.attemptId} remains quarantined`,
          });
        }
      }
      for (const entry of run.assignments.values()) {
        if (entry.attempt === null || handledAttempts.has(entry.attempt.attemptId) ||
            ['cleaned', 'quarantined'].includes(entry.attempt.state)) continue;
        if (['terminal_observed', 'frozen', 'ingested'].includes(entry.attempt.state)) {
          if (entry.processReceiptRef === null || entry.processReceipt?.state !== 'empty' ||
              entry.processReceipt.descendantsComplete !== true) {
            reconcile('APPLICATION_STOP_EVIDENCE_MISSING',
              'non-running stopped attempt lacks prior exact empty process evidence');
          }
          await transitionAttempt(run, entry, {
            state: 'stale', observation: 'stop_stale',
            evidence: [acceptedControl.detailRef, entry.processReceiptRef],
            cleanup: true,
          });
          await cleanupAttempt(run, entry, { wake: false });
          interrupted.push(entry.attempt.attemptId);
          continue;
        }
        if (['accepted', 'rejected', 'stale'].includes(entry.attempt.state)) {
          await cleanupAttempt(run, entry, { wake: false });
          continue;
        }
        if (entry.attempt.state === 'allocated') {
          await transitionAttempt(run, entry, {
            state: 'stale', observation: 'stop_stale',
            evidence: [acceptedControl.detailRef], cleanup: true,
          });
          await cleanupAttempt(run, entry, { wake: false });
          interrupted.push(entry.attempt.attemptId);
          continue;
        }
        reconcile('APPLICATION_STOP_RECOVERY_REQUIRED',
          `stopped attempt ${entry.attempt.attemptId} requires exact lifecycle recovery`);
      }
      const terminal = await publishStoppedTerminal(run);
      return deepFreeze({ published, accepted, interrupted,
        terminal,
        reconciliationRequired: run.reconciliation !== null });
    },

    async requestResume({
      runId, requestId, expectedEpoch, expectedControlGeneration,
    } = {}) {
      assertApplication(application);
      const run = runs.get(runId);
      if (run === undefined) fail('APPLICATION_RUN_UNKNOWN', 'application run is unknown');
      if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 1 ||
          !Number.isSafeInteger(expectedControlGeneration) || expectedControlGeneration < 0) {
        fail('APPLICATION_INPUT_INVALID', 'resume CAS inputs are invalid');
      }
      const result = await runtime.publishResumeRequest({
        runId,
        requestId,
        expectedEpoch,
        expectedControlGeneration,
      });
      run.changed = true;
      return result;
    },

    async status(runId) {
      assertApplication(application);
      validateControllerId(runId, 'run ID');
      const run = runs.get(runId);
      const runtimeStatus = await runtime.status(runId);
      return deepFreeze({
        runId,
        runtime: runtimeStatus,
        application: run === undefined ? null : applicationState(run),
      });
    },

    async doctor(runId) {
      assertApplication(application);
      validateControllerId(runId, 'run ID');
      const runtimeDoctor = await runtime.doctor(runId);
      const run = runs.get(runId);
      const issues = [...(runtimeDoctor.issues ?? [])];
      if (run === undefined) issues.push('application_state_missing');
      if (run?.reconciliation !== null) issues.push('application_reconciliation_required');
      return deepFreeze({
        runId,
        ok: runtimeDoctor.ok === true && issues.length === 0,
        issues,
        runtime: runtimeDoctor,
        application: run === undefined ? null : applicationState(run),
      });
    },

    async release(runId) {
      assertApplication(application);
      validateControllerId(runId, 'run ID');
      const result = await runtime.release(runId);
      runs.delete(runId);
      return result;
    },
  };
  APPLICATIONS.add(application);
  return Object.freeze(application);
}
