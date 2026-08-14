import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindingAuthorizesEffect,
  ImplementationReducerError,
  planOrientation,
  postconditionAuthorizesAcknowledgement,
  reduceEventLog,
  registerOperation,
  selectRootDecision,
  stopAllowsEffect,
  taskRevisionAuthorizesEffect,
  transitionAttempt,
  transitionOperation,
  transitionRun,
  transitionTables,
} from '../lib/implementation-reducer.mjs';
import { canonicalDigest } from '../lib/implementation-protocol.mjs';

const now = '2026-08-14T10:00:00.000Z';
const digest = (label) => canonicalDigest({ label });
const ref = (kind, id) => ({ kind, id, digest: digest(`${kind}:${id}`) });
const binding = Object.freeze({
  runId: 'run_1',
  epoch: 1,
  snapshotRevision: 2,
  taskId: 'T-0054',
  taskRevision: 2,
  taskRecordVersion: 5,
  capsuleDigest: digest('capsule'),
  controlGeneration: 0,
  correctionGeneration: 0,
});

function snapshot(phase = 'dormant') {
  return {
    schemaVersion: 1,
    runId: 'run_1',
    revision: 2,
    phase,
    stop: { requested: false, mode: null, reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
    updatedAt: now,
  };
}

function attempt(state = 'allocated') {
  return { schemaVersion: 1, attemptId: 'attempt_1', recordVersion: 1, state, observedAt: now };
}

function operation(state = 'intended') {
  return {
    schemaVersion: 1,
    operationId: 'operation_1',
    recordVersion: 1,
    idempotencyKey: 'launch:attempt_1',
    inputDigest: digest('input'),
    state,
    receipt: null,
    observedAt: now,
    failureCode: null,
  };
}

test('run transitions require the exact legal observation and preserve terminal monotonicity', () => {
  const orienting = transitionRun(snapshot(), {
    expectedRevision: 2,
    nextPhase: 'orienting',
    observation: 'wake_changed',
    updatedAt: now,
  });
  assert.equal(orienting.phase, 'orienting');
  assert.equal(orienting.revision, 3);
  assert.throws(() => transitionRun(snapshot(), {
    expectedRevision: 2,
    nextPhase: 'orienting',
    observation: 'decision_accepted',
    updatedAt: now,
  }), (error) => error instanceof ImplementationReducerError && error.code === 'OBSERVATION_INVALID');
  assert.throws(() => transitionRun(snapshot('succeeded'), {
    expectedRevision: 2,
    nextPhase: 'dormant',
    observation: 'wake_changed',
    updatedAt: now,
  }), /transition is not legal/u);
  assert.throws(() => transitionRun(snapshot(), {
    expectedRevision: 1,
    nextPhase: 'orienting',
    observation: 'wake_changed',
    updatedAt: now,
  }), (error) => error.code === 'STALE_STATE');
});

test('sticky stop dominates otherwise legal run progress', () => {
  const stopped = snapshot();
  stopped.stop = { requested: true, mode: 'checkpoint', reasonDigest: digest('stop') };
  assert.throws(() => transitionRun(stopped, {
    expectedRevision: 2,
    nextPhase: 'orienting',
    observation: 'wake_changed',
    updatedAt: now,
  }), (error) => error.code === 'STOP_DOMINATES');
  assert.equal(transitionRun(stopped, {
    expectedRevision: 2,
    nextPhase: 'stopping',
    observation: 'stop_observed',
    updatedAt: now,
  }).phase, 'stopping');
  assert.equal(stopAllowsEffect(stopped), false);
  assert.equal(stopAllowsEffect(snapshot('intent_published')), true);
});

test('effect authorization binds every generation and the exact active task revision', () => {
  assert.equal(bindingAuthorizesEffect(binding, structuredClone(binding)), true);
  assert.equal(bindingAuthorizesEffect(binding, { ...binding, epoch: 2 }), false);
  assert.equal(bindingAuthorizesEffect(binding, { ...binding, controlGeneration: 1 }), false);
  assert.equal(taskRevisionAuthorizesEffect(binding, {
    id: 'T-0054', taskRevision: 2, recordVersion: 5, status: 'active',
  }), true);
  assert.equal(taskRevisionAuthorizesEffect(binding, {
    id: 'T-0054', taskRevision: 3, recordVersion: 6, status: 'active',
  }), false);
});

test('attempt ambiguity recovery requires a proved observation and never relaunches an attempt', () => {
  const ambiguous = { ...attempt('ambiguous'), recordVersion: 7 };
  assert.equal(transitionAttempt(ambiguous, {
    expectedRecordVersion: 7,
    nextState: 'running',
    observation: 'held_connection_exact_process_current',
    observedAt: now,
  }).state, 'running');
  assert.equal(transitionAttempt(ambiguous, {
    expectedRecordVersion: 7,
    nextState: 'quarantined',
    observation: 'reconciliation_unproved',
    observedAt: now,
  }).state, 'quarantined');
  assert.throws(() => transitionAttempt(ambiguous, {
    expectedRecordVersion: 7,
    nextState: 'launch_intended',
    observation: 'launch_intent_durable',
    observedAt: now,
  }), /transition is not legal/u);
  assert.deepEqual(Object.keys(transitionTables().attempt.quarantined), []);
});

test('operation effects require intent and idempotency conflicts force reconciliation', () => {
  const completed = transitionOperation(operation(), {
    expectedRecordVersion: 1,
    nextState: 'observed_succeeded',
    observation: 'success_postcondition_exists',
    observedAt: now,
    receipt: ref('evidence', 'receipt_1'),
  });
  assert.equal(completed.state, 'observed_succeeded');
  assert.equal(postconditionAuthorizesAcknowledgement(completed), true);
  assert.equal(postconditionAuthorizesAcknowledgement({ ...completed, receipt: null }), false);
  const first = registerOperation([], operation());
  assert.equal(first.created, true);
  assert.equal(registerOperation(first.operations, structuredClone(operation())).created, false);
  assert.throws(() => registerOperation(first.operations, {
    ...operation(),
    operationId: 'operation_2',
    inputDigest: digest('different'),
  }), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
});

function event(sequence, dedupeKey, label = dedupeKey) {
  return {
    schemaVersion: 1,
    eventId: `event_${sequence}`,
    sequence,
    binding,
    kind: 'provider_observed',
    subject: ref('attempt', 'attempt_1'),
    causationId: null,
    correlationId: 'job_1',
    producer: { kind: 'provider', connectionId: 'connection_1' },
    dedupeKey,
    observedAt: now,
    payload: ref('evidence', label),
  };
}

test('event replay converges across order and identical duplicates while rejecting gaps and conflicts', () => {
  const ordered = reduceEventLog([event(1, 'one'), event(2, 'two')]);
  const reversed = reduceEventLog([event(2, 'two'), event(1, 'one')]);
  assert.deepEqual(reversed, ordered);
  const duplicate = reduceEventLog([event(1, 'one'), event(2, 'one')]);
  assert.equal(duplicate.cursor, 2);
  assert.equal(duplicate.events.length, 1);
  assert.throws(() => reduceEventLog([event(2, 'two')]), (error) => error.code === 'EVENT_GAP');
  assert.throws(() => reduceEventLog([event(1, 'one'), event(2, 'one', 'different')]),
    (error) => error.code === 'EVENT_CONFLICT');
});

function rootDecision(id, rationale = 'wait safely') {
  const proposal = { schemaVersion: 1, rationale, kind: 'wait', reasonCode: 'stable', wakeOn: [], deadlineAt: null };
  return {
    schemaVersion: 1,
    decisionId: id,
    binding,
    orientationDigest: digest('orientation'),
    proposalDigest: canonicalDigest(proposal),
    source: { launchReceipt: ref('launch_receipt', 'launch_1'), modelResult: ref('model_result', 'result_1') },
    proposal,
    derivedAssignments: [],
    acceptedAt: now,
  };
}

test('one proposal digest converges and conflicting Root decisions cannot both authorize effects', () => {
  const first = rootDecision('decision_1');
  const duplicate = rootDecision('decision_2');
  assert.equal(selectRootDecision([duplicate, first], {
    binding,
    orientationDigest: digest('orientation'),
  }).decisionId, 'decision_1');
  assert.throws(() => selectRootDecision([first, rootDecision('decision_3', 'another action')], {
    binding,
    orientationDigest: digest('orientation'),
  }), (error) => error.code === 'DECISION_CONFLICT');
});

test('stable waiting launches no Root tick and coalesces changed state or due deadlines', () => {
  assert.deepEqual(planOrientation(snapshot('waiting')), { action: 'none', reason: 'stable_wait' });
  assert.deepEqual(planOrientation(snapshot('waiting'), { stateChanged: true }), {
    action: 'orient', reason: 'state_changed',
  });
  assert.deepEqual(planOrientation(snapshot('waiting'), { stateChanged: true, deadlineDue: true }), {
    action: 'orient', reason: 'deadline_due',
  });
  const stopped = snapshot('waiting');
  stopped.stop.requested = true;
  assert.deepEqual(planOrientation(stopped), { action: 'stop', reason: 'stop_requested' });
});
