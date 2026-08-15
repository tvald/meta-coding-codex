import {
  canonicalDigest,
  canonicalJson,
  validateBinding,
  validateRootDecision,
} from './implementation-protocol.mjs';

export const RUN_PHASES = Object.freeze([
  'preflight',
  'dormant',
  'orienting',
  'judgment_required',
  'intent_published',
  'executing',
  'verifying',
  'waiting',
  'stopping',
  'finalizing',
  'reconciliation_required',
  'succeeded',
  'failed',
  'stopped',
  'superseded',
]);

export const ATTEMPT_STATES = Object.freeze([
  'allocated',
  'launch_intended',
  'running',
  'ambiguous',
  'terminal_observed',
  'frozen',
  'ingested',
  'accepted',
  'rejected',
  'stale',
  'cleanup_pending',
  'cleaned',
  'quarantined',
]);

export const OPERATION_STATES = Object.freeze([
  'intended',
  'started',
  'observed_succeeded',
  'observed_failed',
  'ambiguous',
  'abandoned',
]);

const TERMINAL_RUN_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);
const TERMINAL_ATTEMPT_STATES = new Set(['cleaned', 'quarantined']);
const TERMINAL_OPERATION_STATES = new Set(['observed_succeeded', 'observed_failed', 'abandoned']);

const RUN_EDGES = Object.freeze({
  preflight: Object.freeze({
    dormant: ['preflight_compatible'],
    failed: ['preflight_failed'],
    reconciliation_required: ['preflight_ambiguous'],
  }),
  dormant: Object.freeze({
    orienting: ['wake_changed', 'wake_due'],
    waiting: ['stable_wait'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  orienting: Object.freeze({
    judgment_required: ['orientation_published'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  judgment_required: Object.freeze({
    intent_published: ['decision_accepted'],
    waiting: ['wait_decision_accepted'],
    stopping: ['stop_observed'],
    failed: ['failure_decision_accepted'],
    reconciliation_required: ['decision_conflict', 'ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  intent_published: Object.freeze({
    executing: ['execution_intent_durable'],
    verifying: ['verification_intent_durable'],
    waiting: ['wait_intent_durable'],
    finalizing: ['finalization_intent_durable'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
  }),
  executing: Object.freeze({
    dormant: ['execution_observed'],
    verifying: ['candidate_ready'],
    waiting: ['execution_waiting'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  verifying: Object.freeze({
    dormant: ['verification_observed'],
    waiting: ['verification_waiting'],
    finalizing: ['required_checks_passed'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  waiting: Object.freeze({
    dormant: ['wake_changed', 'wake_due'],
    stopping: ['stop_observed'],
    reconciliation_required: ['ambiguity_observed'],
    superseded: ['task_revision_changed'],
  }),
  stopping: Object.freeze({
    stopped: ['all_effects_terminal'],
    reconciliation_required: ['termination_ambiguous'],
    superseded: ['task_revision_changed'],
  }),
  finalizing: Object.freeze({
    succeeded: ['final_postconditions_observed'],
    stopping: ['stop_observed'],
    reconciliation_required: ['finalization_ambiguous'],
    superseded: ['task_revision_changed'],
  }),
  reconciliation_required: Object.freeze({
    dormant: ['resume_reconciled'],
    stopping: ['resume_stop_reconciled'],
    finalizing: ['resume_finalization_reconciled'],
    failed: ['reconciliation_failed'],
    superseded: ['task_revision_changed'],
  }),
  succeeded: Object.freeze({}),
  failed: Object.freeze({}),
  stopped: Object.freeze({}),
  superseded: Object.freeze({}),
});

const ATTEMPT_EDGES = Object.freeze({
  allocated: Object.freeze({
    launch_intended: ['launch_intent_durable'],
    stale: ['binding_changed_before_launch'],
    quarantined: ['workspace_identity_invalid'],
  }),
  launch_intended: Object.freeze({
    running: ['matching_launch_running'],
    terminal_observed: ['pre_run_exit_domain_empty'],
    ambiguous: ['launch_indeterminate'],
    stale: ['binding_changed_domain_empty'],
    quarantined: ['identity_or_emptiness_unproved'],
  }),
  running: Object.freeze({
    terminal_observed: ['terminal_observed_domain_empty'],
    ambiguous: ['connection_process_conflict'],
    stale: ['binding_changed_interrupted_domain_empty'],
    quarantined: ['identity_or_emptiness_unproved'],
  }),
  ambiguous: Object.freeze({
    running: ['held_connection_exact_process_current'],
    terminal_observed: ['trusted_terminal_domain_empty'],
    stale: ['binding_changed_domain_empty'],
    quarantined: ['reconciliation_unproved'],
  }),
  terminal_observed: Object.freeze({
    frozen: ['workspace_frozen_domain_empty'],
    accepted: ['result_accepted'],
    rejected: ['result_rejected'],
    stale: ['binding_changed'],
    quarantined: ['workspace_identity_failed'],
  }),
  frozen: Object.freeze({
    ingested: ['actual_diff_validated'],
    stale: ['binding_changed'],
    quarantined: ['unsafe_or_unknown_paths'],
  }),
  ingested: Object.freeze({
    accepted: ['root_acceptance_current'],
    rejected: ['root_rejection_current'],
    stale: ['binding_changed'],
    quarantined: ['evidence_conflict'],
  }),
  accepted: Object.freeze({ cleanup_pending: ['cleanup_intent_exact'], quarantined: ['cleanup_preconditions_unproved'] }),
  rejected: Object.freeze({ cleanup_pending: ['cleanup_intent_exact'], quarantined: ['cleanup_preconditions_unproved'] }),
  stale: Object.freeze({ cleanup_pending: ['cleanup_intent_exact'], quarantined: ['cleanup_preconditions_unproved'] }),
  cleanup_pending: Object.freeze({
    cleaned: ['exact_cleanup_observed'],
    quarantined: ['cleanup_ambiguous'],
  }),
  cleaned: Object.freeze({}),
  quarantined: Object.freeze({}),
});

const OPERATION_EDGES = Object.freeze({
  intended: Object.freeze({
    started: ['effect_started'],
    observed_succeeded: ['success_postcondition_exists'],
    observed_failed: ['failure_postcondition_exists'],
    ambiguous: ['effect_indeterminate'],
    abandoned: ['no_effect_proved'],
  }),
  started: Object.freeze({
    observed_succeeded: ['success_postcondition_observed'],
    observed_failed: ['failure_postcondition_observed'],
    ambiguous: ['effect_indeterminate'],
    abandoned: ['no_effect_proved'],
  }),
  ambiguous: Object.freeze({
    observed_succeeded: ['success_postcondition_observed'],
    observed_failed: ['failure_postcondition_observed'],
    abandoned: ['no_effect_proved'],
  }),
  observed_succeeded: Object.freeze({}),
  observed_failed: Object.freeze({}),
  abandoned: Object.freeze({}),
});

export class ImplementationReducerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationReducerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationReducerError(code, message);
}

function exactSafeInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) fail('STATE_INVALID', `${label} is invalid`);
  return value;
}

function observationAllowed(edges, from, to, observation, label) {
  if (typeof from !== 'string' || !Object.hasOwn(edges, from) ||
      typeof to !== 'string' || !Object.hasOwn(edges[from], to)) {
    fail('TRANSITION_INVALID', `${label} transition is not legal`);
  }
  if (typeof observation !== 'string' || !edges[from][to].includes(observation)) {
    fail('OBSERVATION_INVALID', `${label} transition lacks its required observation`);
  }
}

function bindingEquals(left, right) {
  return canonicalJson(validateBinding(left)) === canonicalJson(validateBinding(right));
}

export function bindingAuthorizesEffect(expected, candidate) {
  return bindingEquals(expected, candidate);
}

export function taskRevisionAuthorizesEffect(binding, task) {
  validateBinding(binding);
  return task !== null && typeof task === 'object' && !Array.isArray(task) &&
    task.id === binding.taskId && task.taskRevision === binding.taskRevision &&
    task.recordVersion === binding.taskRecordVersion && task.status === 'active';
}

export function stopAllowsEffect(snapshot) {
  return snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
    snapshot.stop?.requested === false && !TERMINAL_RUN_PHASES.has(snapshot.phase) &&
    snapshot.phase !== 'stopping' && snapshot.phase !== 'reconciliation_required';
}

export function postconditionAuthorizesAcknowledgement(operation) {
  return operation !== null && typeof operation === 'object' && !Array.isArray(operation) &&
    TERMINAL_OPERATION_STATES.has(operation.state) && operation.receipt !== null;
}

function frozenClone(value) {
  return Object.freeze(structuredClone(value));
}

export function transitionRun(snapshot, {
  expectedRevision,
  nextPhase,
  observation,
  updatedAt,
}) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    fail('STATE_INVALID', 'run snapshot must be an object');
  }
  exactSafeInteger(expectedRevision, 'expected snapshot revision', { minimum: 1 });
  if (snapshot.revision !== expectedRevision) fail('STALE_STATE', 'run snapshot revision is stale');
  if (typeof updatedAt !== 'string' || updatedAt.length === 0) fail('STATE_INVALID', 'updatedAt is invalid');
  observationAllowed(RUN_EDGES, snapshot.phase, nextPhase, observation, 'run');
  if (snapshot.stop?.requested === true &&
      !['stopping', 'reconciliation_required', 'stopped', 'superseded'].includes(nextPhase)) {
    fail('STOP_DOMINATES', 'a durable stop prevents the requested run transition');
  }
  if (TERMINAL_RUN_PHASES.has(snapshot.phase)) fail('TRANSITION_INVALID', 'terminal run phase is monotonic');
  return frozenClone({
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: nextPhase,
    updatedAt,
  });
}

export function transitionAttempt(attempt, {
  expectedRecordVersion,
  nextState,
  observation,
  observedAt,
}) {
  if (attempt === null || typeof attempt !== 'object' || Array.isArray(attempt)) {
    fail('STATE_INVALID', 'attempt must be an object');
  }
  exactSafeInteger(expectedRecordVersion, 'expected attempt recordVersion', { minimum: 1 });
  if (attempt.recordVersion !== expectedRecordVersion) fail('STALE_STATE', 'attempt recordVersion is stale');
  if (typeof observedAt !== 'string' || observedAt.length === 0) fail('STATE_INVALID', 'observedAt is invalid');
  observationAllowed(ATTEMPT_EDGES, attempt.state, nextState, observation, 'attempt');
  if (TERMINAL_ATTEMPT_STATES.has(attempt.state)) {
    fail('TRANSITION_INVALID', 'terminal attempt state is monotonic');
  }
  return frozenClone({
    ...attempt,
    recordVersion: attempt.recordVersion + 1,
    state: nextState,
    observedAt,
  });
}

export function transitionOperation(operation, {
  expectedRecordVersion,
  nextState,
  observation,
  observedAt,
  receipt = operation?.receipt ?? null,
  failureCode = operation?.failureCode ?? null,
}) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    fail('STATE_INVALID', 'operation must be an object');
  }
  exactSafeInteger(expectedRecordVersion, 'expected operation recordVersion', { minimum: 1 });
  if (operation.recordVersion !== expectedRecordVersion) fail('STALE_STATE', 'operation recordVersion is stale');
  if (typeof observedAt !== 'string' || observedAt.length === 0) fail('STATE_INVALID', 'observedAt is invalid');
  observationAllowed(OPERATION_EDGES, operation.state, nextState, observation, 'operation');
  if (TERMINAL_OPERATION_STATES.has(operation.state)) {
    fail('TRANSITION_INVALID', 'terminal operation state is monotonic');
  }
  return frozenClone({
    ...operation,
    recordVersion: operation.recordVersion + 1,
    state: nextState,
    receipt,
    observedAt,
    failureCode,
  });
}

export function registerOperation(operations, incoming) {
  if (!Array.isArray(operations) || incoming === null || typeof incoming !== 'object' || Array.isArray(incoming) ||
      typeof incoming.idempotencyKey !== 'string' || typeof incoming.inputDigest !== 'string') {
    fail('STATE_INVALID', 'operation registration input is invalid');
  }
  const existing = operations.find(({ idempotencyKey }) => idempotencyKey === incoming.idempotencyKey);
  if (existing !== undefined) {
    if (existing.inputDigest !== incoming.inputDigest) {
      fail('IDEMPOTENCY_CONFLICT', 'an idempotency key was reused with another input digest');
    }
    return Object.freeze({ created: false, operation: frozenClone(existing), operations: frozenClone(operations) });
  }
  const next = [...operations, structuredClone(incoming)];
  return Object.freeze({ created: true, operation: frozenClone(incoming), operations: frozenClone(next) });
}

function eventSemanticDigest(event) {
  return canonicalDigest({
    binding: event.binding,
    kind: event.kind,
    subject: event.subject,
    causationId: event.causationId,
    correlationId: event.correlationId,
    producer: event.producer,
    payload: event.payload,
  });
}

export function reduceEventLog(events, { afterSequence = 0 } = {}) {
  if (!Array.isArray(events) || events.length > 10_000) fail('EVENT_INVALID', 'event collection is invalid');
  exactSafeInteger(afterSequence, 'afterSequence');
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const byDedupe = new Map();
  const accepted = [];
  let cursor = afterSequence;
  for (const event of ordered) {
    if (event === null || typeof event !== 'object' || Array.isArray(event) ||
        !Number.isSafeInteger(event.sequence) || event.sequence !== cursor + 1 ||
        typeof event.dedupeKey !== 'string' || event.dedupeKey.length === 0) {
      fail('EVENT_GAP', 'event sequence is not contiguous');
    }
    cursor = event.sequence;
    const digest = eventSemanticDigest(event);
    const prior = byDedupe.get(event.dedupeKey);
    if (prior !== undefined) {
      if (prior !== digest) fail('EVENT_CONFLICT', 'duplicate event key has conflicting semantic payload');
      continue;
    }
    byDedupe.set(event.dedupeKey, digest);
    accepted.push(structuredClone(event));
  }
  return Object.freeze({ cursor, events: frozenClone(accepted) });
}

export function selectRootDecision(decisions, { binding, orientationDigest }) {
  if (!Array.isArray(decisions) || typeof orientationDigest !== 'string') {
    fail('DECISION_INVALID', 'decision selection input is invalid');
  }
  validateBinding(binding);
  const current = decisions.map(validateRootDecision).filter((decision) =>
    bindingEquals(decision.binding, binding) && decision.orientationDigest === orientationDigest);
  if (current.length === 0) return null;
  const proposalDigests = new Set(current.map(({ proposalDigest }) => proposalDigest));
  if (proposalDigests.size !== 1) {
    fail('DECISION_CONFLICT', 'current Root decisions conflict for one semantic decision point');
  }
  current.sort((left, right) => left.decisionId.localeCompare(right.decisionId, 'en'));
  return frozenClone(current[0]);
}

export function planOrientation(snapshot, {
  stateChanged = false,
  deadlineDue = false,
} = {}) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !RUN_PHASES.includes(snapshot.phase)) fail('STATE_INVALID', 'run snapshot is invalid');
  if (TERMINAL_RUN_PHASES.has(snapshot.phase)) return Object.freeze({ action: 'none', reason: 'terminal' });
  if (snapshot.stop?.requested === true) return Object.freeze({ action: 'stop', reason: 'stop_requested' });
  if (snapshot.reconciliation?.required === true || snapshot.phase === 'reconciliation_required') {
    return Object.freeze({ action: 'none', reason: 'reconciliation_required' });
  }
  if (snapshot.phase === 'waiting' && !stateChanged && !deadlineDue) {
    return Object.freeze({ action: 'none', reason: 'stable_wait' });
  }
  if (snapshot.phase === 'dormant' || snapshot.phase === 'waiting') {
    return Object.freeze({ action: 'orient', reason: deadlineDue ? 'deadline_due' : 'state_changed' });
  }
  return Object.freeze({ action: 'none', reason: 'phase_not_orientable' });
}

export function transitionTables() {
  return Object.freeze({ run: RUN_EDGES, attempt: ATTEMPT_EDGES, operation: OPERATION_EDGES });
}
