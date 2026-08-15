import {
  acquireRunLock,
  discoverImplementationRuns,
  initializeRun,
  inspectRunLock,
  publishControlRequest,
  publishEvent,
  publishRecord,
  publishSnapshot,
  repairSnapshotCache,
  readRunStatus,
  replayRun,
} from './implementation-ledger.mjs';
import {
  PERSISTED_RECORD_KINDS,
  canonicalDigest,
  sha256Digest,
  validateBinding,
  validateControllerId,
  validateDigest,
  validateEvent,
  validatePersistedRecord,
  validateRef,
  validateRootLaunchIntent,
  validateRootModelResult,
  validateRunSnapshot,
  validateTimestamp,
} from './implementation-protocol.mjs';
import { validateOrientation } from './implementation-controller.mjs';
import { createImplementationControlWakeReceiver } from './implementation-control-wake.mjs';
import {
  deriveReadyTaskActivationJournal,
  deriveImplementationInitialSnapshot,
  planImplementationStart,
} from './implementation-supervisor.mjs';

export const IMPLEMENTATION_RUNTIME_VERSION = 1;

const RUNTIMES = new WeakSet();
const PIPELINE_JOURNALS = new WeakSet();
const TERMINAL_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);
const TYPED_RECORD_KINDS = new Set(PERSISTED_RECORD_KINDS);
const FAN_IN_RECORD_KINDS = new Set([
  'attempt',
  'operation',
  'candidate',
  'check_receipt',
  'resource_receipt',
  'process_receipt',
  'launch_receipt',
]);
const LIFECYCLE_EVENT_KINDS = new Set([
  'orientation_published',
  'root_decision_accepted',
  'attempt_transition',
  'operation_transition',
  'provider_observed',
  'result_observed',
  'wake_due',
  'terminal_published',
]);

export class ImplementationRuntimeError extends Error {
  constructor(code, message, { reconciliationRequired = false } = {}) {
    super(message);
    this.name = 'ImplementationRuntimeError';
    this.code = code;
    this.reconciliationRequired = reconciliationRequired;
  }
}

function fail(code, message, options) {
  throw new ImplementationRuntimeError(code, message, options);
}

function reconciliation(code, message) {
  fail(code, message, { reconciliationRequired: true });
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!plainObject(value)) reconciliation('REPLAY_UNSUPPORTED', `${label} is not an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    reconciliation('REPLAY_UNSUPPORTED', `${label} has an unsupported shape`);
  }
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('ARGUMENT_INVALID', `${label} is invalid`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail('ARGUMENT_INVALID', `${label} is invalid`);
  return value;
}

function nowFrom(clock) {
  const value = clock();
  validateTimestamp(value, 'runtime clock');
  return value;
}

function frozen(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function bindingFor(snapshot, replay) {
  return Object.freeze({
    runId: snapshot.runId,
    epoch: snapshot.epoch,
    snapshotRevision: snapshot.revision,
    taskId: replay.capsule.taskId,
    taskRevision: replay.capsule.taskRevision,
    taskRecordVersion: snapshot.taskRecordVersion,
    capsuleDigest: replay.capsuleDigest,
    controlGeneration: snapshot.controlGeneration,
    correctionGeneration: snapshot.correctionGeneration,
  });
}

function sameBinding(actual, expected) {
  return plainObject(actual) && Object.keys(expected).every((key) => actual[key] === expected[key]) &&
    Object.keys(actual).length === Object.keys(expected).length;
}

function sameAuthorityBinding(actual, expected) {
  return plainObject(actual) && plainObject(expected) && [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'controlGeneration', 'correctionGeneration',
  ].every((key) => actual[key] === expected[key]);
}

function recordBindingIsCurrent(kind, actual, expected) {
  return FAN_IN_RECORD_KINDS.has(kind)
    ? sameAuthorityBinding(actual, expected)
    : sameBinding(actual, expected);
}

function terminalBindingAdvancesTask(value, expected) {
  return value?.disposition === 'succeeded' && plainObject(value.binding) &&
    [
      'runId', 'epoch', 'snapshotRevision', 'taskId', 'taskRevision', 'capsuleDigest',
      'controlGeneration', 'correctionGeneration',
    ].every((key) => value.binding[key] === expected[key]) &&
    value.binding.taskRecordVersion === expected.taskRecordVersion + 1 &&
    value.taskRecordVersion === value.binding.taskRecordVersion;
}

function recordValueBindingIsCurrent(kind, value, expected) {
  if (!plainObject(value?.binding)) return true;
  if (kind === 'terminal_receipt') {
    return value.disposition === 'succeeded'
      ? terminalBindingAdvancesTask(value, expected)
      : sameBinding(value.binding, expected);
  }
  return recordBindingIsCurrent(kind, value.binding, expected);
}

function correctionAssignmentBinding(expected) {
  return Object.freeze({
    ...expected,
    snapshotRevision: expected.snapshotRevision + 1,
    correctionGeneration: expected.correctionGeneration + 1,
  });
}

function correctionAssignmentIsCurrent(value, expected, policy) {
  const allowedRefs = Array.isArray(policy) ? policy : policy?.refs;
  if (!plainObject(value) || !Array.isArray(allowedRefs)) return false;
  const reference = {
    kind: 'assignment',
    id: value.assignmentId,
    digest: canonicalDigest(value),
  };
  const provenanceMatches = Array.isArray(policy)
    ? true
    : value.sourceDecisionId === policy.decisionId &&
      policy.proposalIds.includes(value.sourceProposalId);
  return provenanceMatches && allowedRefs.some((candidate) => sameRef(candidate, reference)) &&
    sameBinding(value.binding, correctionAssignmentBinding(expected));
}

function taskObservation(value, journal, expectedStatus, expectedRecordVersion) {
  return plainObject(value) && value.taskId === journal.taskIntent.taskId &&
    value.taskRevision === journal.taskIntent.taskRevision &&
    value.recordVersion === expectedRecordVersion && value.status === expectedStatus;
}

function activationReceipt(journal, observedAt) {
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
    recordType: 'task_activation_receipt',
    operationId: journal.operation.operationId,
    intent: journal.detailRef,
    taskId: journal.taskIntent.taskId,
    taskRevision: journal.taskIntent.taskRevision,
    recordVersion: journal.taskIntent.resultingRecordVersion,
    status: 'active',
    observedAt,
  });
}

function activationReceiptRef(value) {
  return Object.freeze({
    kind: 'detail',
    id: 'activation_receipt',
    digest: canonicalDigest(value),
  });
}

function observedActivationOperation(journal, receipt, receiptRef) {
  return Object.freeze({
    ...journal.operation,
    recordVersion: 2,
    previousDigest: canonicalDigest(journal.operation),
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: receiptRef,
    observedAt: receipt.observedAt,
  });
}

function activationStartEvent(replay, initialSnapshot, operation, receiptRef) {
  const operationRef = Object.freeze({
    kind: 'operation',
    id: operation.operationId,
    digest: canonicalDigest(operation),
  });
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
    eventId: 'event_start',
    sequence: 1,
    binding: bindingFor(initialSnapshot, replay),
    kind: 'operation_transition',
    subject: operationRef,
    causationId: null,
    correlationId: 'implementation_start',
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `start:${replay.runId}`,
    observedAt: operation.observedAt,
    payload: receiptRef,
  });
}

function validateActivationReceipt(value, journal) {
  exactKeys(value, [
    'schemaVersion', 'recordType', 'operationId', 'intent', 'taskId', 'taskRevision',
    'recordVersion', 'status', 'observedAt',
  ], 'task activation receipt');
  if (value.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION ||
      value.recordType !== 'task_activation_receipt' ||
      value.operationId !== journal.operation.operationId ||
      !sameRef(value.intent, journal.detailRef) ||
      value.taskId !== journal.taskIntent.taskId ||
      value.taskRevision !== journal.taskIntent.taskRevision ||
      value.recordVersion !== journal.taskIntent.resultingRecordVersion ||
      value.status !== 'active') {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'task activation receipt does not prove the exact planned postcondition');
  }
  try { validateTimestamp(value.observedAt, 'task activation receipt timestamp'); } catch {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'task activation receipt timestamp is invalid');
  }
  return value;
}

function durableActivationJournal(replay, { allowAbsent = true } = {}) {
  const activationRecordPresent = replay.records.some(({ kind, id }) =>
    (kind === 'detail' && ['activation_intent', 'activation_receipt'].includes(id)) ||
    (kind === 'operation' && id === 'activate_task'));
  if (!activationRecordPresent && allowAbsent) return null;
  const journal = deriveReadyTaskActivationJournal({
    manifest: replay.manifest,
    capsule: replay.capsule,
    hypothetical: false,
  });
  const details = replay.records.filter(({ kind, id }) =>
    kind === 'detail' && id === journal.detailRef.id);
  const operations = replay.records.filter(({ kind, id }) =>
    kind === 'operation' && id === journal.operation.operationId)
    .sort((left, right) => left.version - right.version);
  const receipts = replay.records.filter(({ kind, id }) =>
    kind === 'detail' && id === 'activation_receipt');
  if (details.length !== 1 || details[0].version !== 1 ||
      details[0].digest !== journal.detailRef.digest ||
      canonicalDigest(details[0].value) !== canonicalDigest(journal.detail) ||
      operations.length > 2 ||
      (operations.length > 0 && (operations[0].version !== 1 ||
        canonicalDigest(operations[0].value) !== canonicalDigest(journal.operation)))) {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'durable Ready-task activation intent or Operation v1 conflicts with its run authority');
  }
  let receipt = null;
  let receiptRef = null;
  let operation = null;
  let operationPublished = false;
  if (receipts.length > 0 || operations.length > 1) {
    if (receipts.length !== 1 || receipts[0].version !== 1 ||
        ![1, 2].includes(operations.length) ||
        (operations.length === 2 && operations[1].version !== 2)) {
      reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
        'durable Ready-task activation completion is partial or conflicting');
    }
    receipt = validateActivationReceipt(receipts[0].value, journal);
    receiptRef = activationReceiptRef(receipt);
    operation = observedActivationOperation(journal, receipt, receiptRef);
    operationPublished = operations.length === 2;
    if (receipts[0].digest !== receiptRef.digest ||
        (operationPublished &&
          canonicalDigest(operations[1].value) !== canonicalDigest(operation))) {
      reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
        'durable Ready-task activation receipt or Operation v2 conflicts');
    }
  }
  return Object.freeze({
    journal,
    intentOperationPublished: operations.length > 0,
    receipt,
    receiptRef,
    operation,
    operationPublished,
  });
}

function startDetail(snapshot) {
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
    recordType: 'snapshot_publication',
    snapshotRevision: snapshot.revision,
    snapshotDigest: canonicalDigest(snapshot),
  });
}

function startEvent(replay, initialSnapshot, snapshotRef) {
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
    eventId: 'event_start',
    sequence: 1,
    binding: bindingFor(initialSnapshot, replay),
    kind: 'snapshot_published',
    subject: snapshotRef,
    causationId: null,
    correlationId: 'implementation_start',
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `start:${replay.runId}`,
    observedAt: replay.manifest.createdAt,
    payload: snapshotRef,
  });
}

function nextSnapshot(previous, event, changes) {
  const snapshot = frozen({
    ...previous,
    ...changes,
    revision: previous.revision + 1,
    previousDigest: canonicalDigest(previous),
    eventCursor: event.sequence,
    updatedAt: event.observedAt,
  });
  validateRunSnapshot(snapshot, {
    expectedRunId: previous.runId,
    minimumTaskRecordVersion: previous.taskRecordVersion,
  });
  return snapshot;
}

function reconciliationSnapshot(previous, event, code) {
  return nextSnapshot(previous, event, {
    phase: 'reconciliation_required',
    pendingWakeReasons: [],
    reconciliation: {
      required: true,
      reasonCode: code,
      refs: [{ kind: 'event', id: event.eventId, digest: event.__digest }],
    },
  });
}

function acceptedControlDetail(record) {
  const value = record?.value;
  exactKeys(value, [
    'schemaVersion', 'recordType', 'requestId', 'requestDigest', 'expectedEpoch',
    'expectedControlGeneration', 'kind', 'mode', 'reasonDigest', 'acceptedAt',
  ], 'accepted control detail');
  if (value.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION ||
      value.recordType !== 'accepted_control' ||
      !['stop', 'resume'].includes(value.kind) ||
      (value.kind === 'stop') !== (value.mode === 'checkpoint' && value.reasonDigest !== null) ||
      (value.kind === 'resume' && (value.mode !== null || value.reasonDigest !== null))) {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted control detail is unsupported');
  }
  try {
    validateControllerId(value.requestId, 'accepted control request ID');
    validateDigest(value.requestDigest, 'accepted control request digest');
    if (value.reasonDigest !== null) {
      validateDigest(value.reasonDigest, 'accepted control reason digest');
    }
    validateTimestamp(value.acceptedAt, 'accepted control timestamp');
  } catch {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted control detail is malformed');
  }
  if (!Number.isSafeInteger(value.expectedEpoch) || value.expectedEpoch < 1 ||
      !Number.isSafeInteger(value.expectedControlGeneration) ||
      value.expectedControlGeneration < 0) {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted control CAS evidence is malformed');
  }
  return value;
}

function resumeIntentDetail(record) {
  const value = record?.value;
  exactKeys(value, [
    'schemaVersion', 'recordType', 'requestId', 'requestDigest', 'expectedEpoch',
    'expectedControlGeneration', 'publishedAt',
  ], 'resume intent detail');
  if (value.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION ||
      value.recordType !== 'resume_intent') {
    reconciliation('REPLAY_UNSUPPORTED', 'resume intent detail is unsupported');
  }
  validateControllerId(value.requestId, 'resume intent request ID');
  positiveInteger(value.expectedEpoch, 'resume intent expected epoch');
  nonNegativeInteger(value.expectedControlGeneration, 'resume intent expected generation');
  validateTimestamp(value.publishedAt, 'resume intent timestamp');
  return value;
}

function findResumeIntent(replay, request, expectedEpoch) {
  const requestDigest = canonicalDigest(request);
  const id = `rsi_${requestDigest.slice(7, 31)}`;
  const record = replay.records.find(({ kind, id: recordId, version }) =>
    kind === 'detail' && recordId === id && version === 1);
  if (record === undefined) return null;
  const detail = resumeIntentDetail(record);
  if (detail.requestId !== request.requestId || detail.requestDigest !== requestDigest ||
      detail.expectedEpoch !== expectedEpoch ||
      detail.expectedControlGeneration !== request.expectedControlGeneration) {
    reconciliation('REPLAY_UNSUPPORTED', 'resume intent does not match its durable request');
  }
  return detail;
}

function lookupControl(replay, event) {
  const record = replay.records.find(({ kind, id, digest }) =>
    kind === 'detail' && id === event.payload.id && digest === event.payload.digest);
  if (record === undefined || event.payload.kind !== 'detail') {
    reconciliation('REPLAY_UNSUPPORTED', 'control event payload is not durable accepted-control evidence');
  }
  const detail = acceptedControlDetail(record);
  const control = replay.controls.find(({ id, digest }) =>
    id === detail.requestId && digest === detail.requestDigest);
  if (control === undefined) {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted control does not name one durable request');
  }
  if (control.value.kind !== detail.kind ||
      control.value.expectedControlGeneration !== detail.expectedControlGeneration) {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted control request and evidence disagree');
  }
  if (detail.kind === 'resume' &&
      findResumeIntent(replay, control.value, detail.expectedEpoch) === null) {
    reconciliation('REPLAY_UNSUPPORTED', 'accepted resume lacks durable epoch intent');
  }
  return { detail, control };
}

function recordForRef(replay, reference, label) {
  try {
    validateRef(reference, label);
  } catch {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', `${label} is invalid`);
  }
  const matches = replay.records.filter(({ kind, id, digest }) =>
    kind === reference.kind && id === reference.id && digest === reference.digest);
  if (matches.length !== 1) {
    reconciliation('LIFECYCLE_EVIDENCE_MISSING', `${label} does not resolve to one durable record`);
  }
  return matches[0];
}

function recordRef(record) {
  return Object.freeze({ kind: record.kind, id: record.id, digest: record.digest });
}

function immutableRecordForId(replay, kind, id, label) {
  const matches = replay.records.filter((record) => record.kind === kind && record.id === id);
  if (matches.length !== 1 || matches[0].version !== 1) {
    reconciliation('LIFECYCLE_EVIDENCE_MISSING', `${label} is not one immutable record`);
  }
  return matches[0];
}

function latestOrientationBefore(replay, sequence) {
  const event = replay.events
    .filter(({ value }) => value.kind === 'orientation_published' && value.sequence < sequence)
    .sort((left, right) => left.value.sequence - right.value.sequence)
    .at(-1)?.value;
  if (event === undefined || !sameRef(event.subject, event.payload)) {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID',
      'Root launch or decision lacks one current durable orientation');
  }
  const record = recordForRef(replay, event.payload, 'current Root orientation');
  if (record.kind !== 'detail') {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID',
      'current Root orientation is not a detail record');
  }
  try { validateOrientation(record.value); } catch {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'current Root orientation is invalid');
  }
  return { event, record, ref: event.payload };
}

function rootLaunchIntentEvidence(replay, intentRecord, {
  attempt,
  assignment,
  operation,
  orientation,
  expectedBinding,
} = {}) {
  if (intentRecord.kind !== 'detail') {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'Root launch intent is not a detail record');
  }
  try { validateRootLaunchIntent(intentRecord.value); } catch {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'Root launch intent is invalid');
  }
  const intent = intentRecord.value;
  const request = intent.request;
  const intentReference = recordRef(intentRecord);
  try { validatePersistedRecord('assignment', assignment.value); } catch {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'Root launch assignment is invalid');
  }
  if (!sameRef(intent.orientation, orientation.ref) ||
      intent.orientationDigest !== orientation.ref.digest ||
      !sameAuthorityBinding(orientation.record.value.binding, expectedBinding) ||
      !sameAuthorityBinding(request.binding, expectedBinding) ||
      !sameAuthorityBinding(assignment.value.binding, expectedBinding) ||
      request.assignmentId !== assignment.value.assignmentId ||
      request.assignmentId !== attempt.assignmentId ||
      request.attemptId !== attempt.attemptId ||
      request.requestId !== attempt.launchRequestId ||
      request.role !== 'root_decision' || assignment.value.role !== 'root_decision' ||
      request.providerAdapter !== replay.manifest.provider.adapter ||
      request.executableVersion !== replay.manifest.provider.executableVersion ||
      request.cwdIdentity !== attempt.workspace.rootIdentity ||
      request.profileDigest !== assignment.value.profileDigest ||
      request.baseTree !== assignment.value.baseTree ||
      request.sandbox !== assignment.value.permissions.sandbox ||
      request.approvalPolicy !== assignment.value.permissions.approvalPolicy ||
      request.network !== assignment.value.permissions.network ||
      request.nestedAgents !== assignment.value.permissions.nestedAgents ||
      request.deadlineAt !== assignment.value.deadlineAt ||
      (operation !== undefined && (
        operation.value.kind !== 'launch_job' || operation.value.state !== 'intended' ||
        operation.value.inputDigest !== intent.requestDigest ||
        !sameRef(operation.value.subject, recordRef(assignment)) ||
        !sameBinding(operation.value.binding, request.binding) ||
        !sameAuthorityBinding(operation.value.binding, expectedBinding) ||
        !operation.value.expected.some((reference) => sameRef(reference, intentReference))
      ))) {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID',
      'Root launch intent differs from its orientation, authority, assignment, attempt, or operation');
  }
  return intent;
}

function launchIntentPrecedesDecision(replay, attempt, intentReference, decisionSequence) {
  const launchIntended = replay.records.filter(({ kind, id, value }) =>
    kind === 'attempt' && id === attempt.attemptId && value.state === 'launch_intended');
  if (launchIntended.length !== 1) return false;
  const attemptReference = recordRef(launchIntended[0]);
  const events = replay.events.filter(({ value }) => value.kind === 'attempt_transition' &&
    value.sequence < decisionSequence && sameRef(value.subject, attemptReference));
  if (events.length !== 1) return false;
  const detail = recordForRef(replay, events[0].value.payload, 'Root launch-intended transition');
  return detail.kind === 'detail' && detail.value.observation === 'launch_intended' &&
    Array.isArray(detail.value.evidence) &&
    detail.value.evidence.some((reference) => sameRef(reference, intentReference));
}

function sameRef(left, right) {
  return left.kind === right.kind && left.id === right.id && left.digest === right.digest;
}

function upsertRef(values, reference) {
  const next = values.filter(({ kind, id }) => kind !== reference.kind || id !== reference.id);
  next.push(Object.freeze({ ...reference }));
  next.sort((left, right) => left.kind.localeCompare(right.kind, 'en') ||
    left.id.localeCompare(right.id, 'en'));
  return Object.freeze(next);
}

function validateWakeDetail(value, expectedBinding, event) {
  exactKeys(value, [
    'schemaVersion', 'recordType', 'binding', 'reasons', 'deadlineAt', 'observedAt',
  ], 'wake detail');
  if (value.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION || value.recordType !== 'wake_due' ||
      !sameBinding(value.binding, expectedBinding) || !Array.isArray(value.reasons) ||
      value.reasons.length < 1 || value.reasons.length > 128 ||
      value.observedAt !== event.observedAt) {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'wake detail is invalid or stale');
  }
  const reasons = [...value.reasons];
  for (const reason of reasons) validateControllerId(reason, 'wake reason');
  const sorted = [...new Set(reasons)].sort((left, right) => left.localeCompare(right, 'en'));
  if (sorted.length !== reasons.length || sorted.some((reason, index) => reason !== reasons[index])) {
    reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'wake reasons must be sorted and unique');
  }
  if (value.deadlineAt !== null) {
    validateTimestamp(value.deadlineAt, 'wake deadline');
    if (Date.parse(value.observedAt) < Date.parse(value.deadlineAt)) {
      reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'wake deadline is not due');
    }
  }
  validateTimestamp(value.observedAt, 'wake observation timestamp');
  return value;
}

function acceptedDecisionAuthorizes(replay, record, reference, expectedBinding) {
  const latest = replay.events.filter(({ value }) => value.kind === 'root_decision_accepted')
    .sort((left, right) => left.value.sequence - right.value.sequence).at(-1);
  const accepted = record.kind === 'decision' && latest !== undefined &&
    sameRef(latest.value.payload, reference);
  if (!accepted) return false;
  if (sameAuthorityBinding(record.value.binding, expectedBinding)) return true;
  if (record.value.proposal.kind !== 'request_correction' ||
      expectedBinding.correctionGeneration !== record.value.binding.correctionGeneration + 1) {
    return false;
  }
  return [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'controlGeneration',
  ].every((key) => record.value.binding[key] === expectedBinding[key]);
}

function attemptEvidence(replay, expectedBinding, detail) {
  if (!Array.isArray(detail.evidence) || detail.evidence.length > 128) {
    reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition evidence is invalid');
  }
  const seen = new Set();
  return detail.evidence.map((reference, index) => {
    try { validateRef(reference, `attempt transition evidence[${index}]`); } catch {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition evidence reference is invalid');
    }
    const identity = `${reference.kind}\0${reference.id}`;
    if (seen.has(identity)) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition evidence repeats an identity');
    }
    seen.add(identity);
    const record = recordForRef(replay, reference, `attempt transition evidence[${index}]`);
    if (TYPED_RECORD_KINDS.has(record.kind)) {
      try { validatePersistedRecord(record.kind, record.value, { expectedRunId: replay.runId }); } catch {
        reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition typed evidence is invalid');
      }
      const acceptedDecision = acceptedDecisionAuthorizes(replay, record, reference,
        expectedBinding);
      const current = acceptedDecision
        ? true
        : recordValueBindingIsCurrent(record.kind, record.value, expectedBinding);
      if (plainObject(record.value.binding) && !current) {
        reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition evidence is stale');
      }
    }
    return record;
  });
}

function exactEvidenceKinds(records, kinds) {
  return records.length === kinds.length &&
    kinds.every((kind, index) => records[index].kind === kind);
}

function operationEvidence(record, kind, state) {
  return record.kind === 'operation' && record.value.kind === kind && record.value.state === state;
}

function processReceiptMatches(replay, record, attempt, { state, provedEmpty = false } = {}) {
  if (record.kind !== 'process_receipt' || record.value.attemptId !== attempt.attemptId ||
      record.value.requestId !== attempt.launchRequestId ||
      record.value.processDomainId !== attempt.processDomainId || record.value.state !== state ||
      (provedEmpty && (state !== 'empty' || record.value.descendantsComplete !== true))) return false;
  return replay.records.some(({ kind, value }) => {
    if (kind !== 'launch_receipt' || value.requestId !== attempt.launchRequestId ||
        value.processDomainId !== attempt.processDomainId ||
        value.launcherConnectionId !== record.value.launcherConnectionId ||
        value.providerHandleRef?.kind !== 'process_receipt') return false;
    let linked;
    try { linked = recordForRef(replay, value.providerHandleRef, 'linked process identity'); } catch {
      return false;
    }
    return linked.value.processIdentityDigest === record.value.processIdentityDigest;
  });
}

function launchReceiptMatches(record, attempt, outcome, processReceipt = null) {
  return record.kind === 'launch_receipt' && record.value.outcome === outcome &&
    record.value.requestId === attempt.launchRequestId &&
    record.value.processDomainId === attempt.processDomainId &&
    (processReceipt === null ||
      (record.value.launcherConnectionId === processReceipt.value.launcherConnectionId &&
       plainObject(record.value.providerHandleRef) && sameRef(record.value.providerHandleRef, {
         kind: processReceipt.kind,
         id: processReceipt.id,
         digest: processReceipt.digest,
       })));
}

function workspaceResourceMatches(record, attempt, action, outcome = 'succeeded') {
  return record.kind === 'resource_receipt' && record.value.attemptId === attempt.attemptId &&
    record.value.resourceKey === `workspace:${attempt.workspace.workspaceId}` &&
    record.value.action === action && record.value.outcome === outcome &&
    record.value.ownershipTokenDigest === attempt.workspace.rootIdentity;
}

function operationReceiptMatches(operation, receipt) {
  return plainObject(operation.value.receipt) && sameRef(operation.value.receipt, {
    kind: receipt.kind,
    id: receipt.id,
    digest: receipt.digest,
  });
}

function sameAttemptIdentity(previous, next) {
  return previous.attemptId === next.attemptId &&
    previous.assignmentId === next.assignmentId &&
    previous.attemptNumber === next.attemptNumber &&
    canonicalDigest(previous.workspace) === canonicalDigest(next.workspace);
}

function correctionAuthorityAdvances(previous, next) {
  return next.correctionGeneration === previous.correctionGeneration + 1 && [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'controlGeneration',
  ].every((key) => previous[key] === next[key]);
}

function stopAuthorityAdvances(previous, next) {
  return next.controlGeneration > previous.controlGeneration && [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'correctionGeneration',
  ].every((key) => previous[key] === next[key]);
}

function stableAttemptFields(previous, next, nextState) {
  const authorityCurrent = sameAuthorityBinding(previous.binding, next.binding);
  const authorityValid = nextState === 'stale'
    ? correctionAuthorityAdvances(previous.binding, next.binding) ||
      stopAuthorityAdvances(previous.binding, next.binding)
    : nextState === 'quarantined'
      ? authorityCurrent || stopAuthorityAdvances(previous.binding, next.binding)
      : authorityCurrent;
  if (!sameAttemptIdentity(previous, next) || !authorityValid) return false;
  const launchMayChange = nextState === 'launch_intended' && previous.launchRequestId === null &&
    previous.processDomainId === null && next.launchRequestId !== null && next.processDomainId !== null;
  if (!launchMayChange && (previous.launchRequestId !== next.launchRequestId ||
      previous.processDomainId !== next.processDomainId)) return false;
  const terminalMayChange = nextState === 'terminal_observed' && previous.result === null &&
    previous.terminalReason === null && next.terminalReason !== null;
  if (!terminalMayChange && (canonicalDigest(previous.result) !== canonicalDigest(next.result) ||
      previous.terminalReason !== next.terminalReason)) return false;
  const candidateMayChange = nextState === 'ingested' && previous.candidateId === null &&
    next.candidateId !== null;
  return candidateMayChange || previous.candidateId === next.candidateId;
}

function latestAcceptedStopAuthorizes(replay, snapshot, record) {
  if (snapshot.phase !== 'stopping' || snapshot.stop.requested !== true ||
      record?.kind !== 'detail') return false;
  const latest = replay.events.filter(({ value }) => value.kind === 'control_accepted')
    .sort((left, right) => left.value.sequence - right.value.sequence).at(-1);
  if (latest === undefined || !sameRef(latest.value.payload, {
    kind: record.kind,
    id: record.id,
    digest: record.digest,
  })) return false;
  try {
    const { detail } = lookupControl(replay, latest.value);
    return detail.kind === 'stop' && detail.expectedEpoch === snapshot.epoch &&
      detail.expectedControlGeneration + 1 === snapshot.controlGeneration &&
      detail.mode === snapshot.stop.mode && detail.reasonDigest === snapshot.stop.reasonDigest;
  } catch {
    return false;
  }
}

function attemptTransitionEvidence(replay, attemptRef) {
  const event = replay.events.find(({ value }) => value.kind === 'attempt_transition' &&
    sameRef(value.subject, attemptRef))?.value;
  if (event === undefined) return [];
  const detail = recordForRef(replay, event.payload, 'prior attempt transition').value;
  return detail.evidence.map((reference, index) =>
    recordForRef(replay, reference, `prior attempt transition evidence[${index}]`));
}

function priorProcessReceipt(replay, attempt) {
  const attempts = replay.records.filter(({ kind, id, version }) =>
    kind === 'attempt' && id === attempt.attemptId && version <= attempt.recordVersion)
    .sort((left, right) => right.version - left.version);
  for (const record of attempts) {
    const reference = { kind: record.kind, id: record.id, digest: record.digest };
    const process = attemptTransitionEvidence(replay, reference)
      .find(({ kind }) => kind === 'process_receipt');
    if (process !== undefined) return process;
  }
  return null;
}

function stopProcessProof(replay, previous, attempt, launch, process, { provedEmpty }) {
  if (!launchReceiptMatches(launch, attempt, 'exited', process) ||
      process.value.action !== 'interrupt' ||
      !processReceiptMatches(replay, process, attempt, {
        state: process.value.state,
        provedEmpty,
      })) return false;
  const prior = priorProcessReceipt(replay, previous);
  return prior === null || (
    prior.value.launcherConnectionId === process.value.launcherConnectionId &&
    prior.value.processDomainId === process.value.processDomainId &&
    prior.value.processIdentityDigest === process.value.processIdentityDigest
  );
}

function causalEmptyProcessProof(replay, previous) {
  const process = priorProcessReceipt(replay, previous);
  return process !== null && processReceiptMatches(replay, process, previous, {
    state: 'empty',
    provedEmpty: true,
  });
}

function validateAttemptEdgeEvidence(replay, snapshot, previous, attempt, observation, evidence,
  event) {
  const edge = `${previous?.state ?? 'initial'}>${attempt.state}`;
  if (previous !== null && stopAuthorityAdvances(previous.binding, attempt.binding) &&
      !['stop_stale', 'stop_quarantined'].includes(observation)) {
    reconciliation('ATTEMPT_TRANSITION_INVALID',
      'stop-authority attempt transition lacks its closed stop observation');
  }
  if (edge === 'initial>allocated') {
    if (observation !== 'workspace_allocated' ||
        !exactEvidenceKinds(evidence, ['operation', 'resource_receipt']) ||
        !operationEvidence(evidence[0], 'allocate_workspace', 'observed_succeeded') ||
        evidence[0].value.subject.kind !== 'assignment' ||
        evidence[0].value.subject.id !== attempt.assignmentId ||
        !workspaceResourceMatches(evidence[1], attempt, 'allocate') ||
        !operationReceiptMatches(evidence[0], evidence[1])) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'allocated attempt lacks exact workspace evidence');
    }
    return;
  }
  if (edge === 'allocated>launch_intended') {
    const assignments = replay.records.filter(({ kind, id }) =>
      kind === 'assignment' && id === attempt.assignmentId);
    const rootAssignment = assignments.length === 1 && assignments[0].version === 1 &&
      assignments[0].value.role === 'root_decision'
      ? assignments[0]
      : null;
    const expectedKinds = rootAssignment === null ? ['operation'] : ['operation', 'detail'];
    if (observation !== 'launch_intended' || !exactEvidenceKinds(evidence, expectedKinds) ||
        !operationEvidence(evidence[0], 'launch_job', 'intended') ||
        evidence[0].value.subject.kind !== 'assignment' ||
        evidence[0].value.subject.id !== attempt.assignmentId) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'launch intent evidence is invalid');
    }
    if (rootAssignment !== null) {
      const orientation = latestOrientationBefore(replay, event.sequence);
      rootLaunchIntentEvidence(replay, evidence[1], {
        attempt,
        assignment: rootAssignment,
        operation: evidence[0],
        orientation,
        expectedBinding: bindingFor(snapshot, replay),
      });
    }
    return;
  }
  if (['launch_intended>running', 'ambiguous>running'].includes(edge)) {
    if (observation !== 'process_running' ||
        !exactEvidenceKinds(evidence, ['launch_receipt', 'process_receipt']) ||
        !launchReceiptMatches(evidence[0], attempt, 'running', evidence[1]) ||
        evidence[1].value.action !== 'observe' ||
        !processReceiptMatches(replay, evidence[1], attempt, { state: 'running' })) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'running attempt evidence is invalid');
    }
    return;
  }
  if (['launch_intended>terminal_observed', 'running>terminal_observed',
    'ambiguous>terminal_observed'].includes(edge)) {
    if (observation !== 'process_terminal' ||
        !exactEvidenceKinds(evidence, ['launch_receipt', 'process_receipt']) ||
        !launchReceiptMatches(evidence[0], attempt, 'exited', evidence[1]) ||
        !processReceiptMatches(replay, evidence[1], attempt, { state: 'empty', provedEmpty: true }) ||
        (attempt.result === null
          ? evidence[0].value.modelResult !== null
          : evidence[0].value.modelResult === null ||
            !sameRef(attempt.result, evidence[0].value.modelResult))) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'terminal attempt evidence is invalid');
    }
    return;
  }
  if (['launch_intended>ambiguous', 'running>ambiguous'].includes(edge)) {
    if (observation !== 'process_ambiguous' ||
        !exactEvidenceKinds(evidence, ['process_receipt']) ||
        !processReceiptMatches(replay, evidence[0], attempt, { state: 'ambiguous' })) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'ambiguous attempt evidence is invalid');
    }
    return;
  }
  if (['terminal_observed>accepted', 'terminal_observed>rejected'].includes(edge)) {
    const accepted = attempt.state === 'accepted';
    if (observation !== (accepted ? 'result_accepted' : 'result_rejected') ||
        attempt.candidateId !== null || attempt.result === null ||
        !exactEvidenceKinds(evidence, ['decision'])) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'non-candidate result disposition is invalid');
    }
    const decision = evidence[0].value;
    const launch = recordForRef(replay, decision.source.launchReceipt,
      'non-candidate decision launch receipt');
    const result = recordForRef(replay, decision.source.modelResult,
      'non-candidate decision model result');
    if (launch.kind !== 'launch_receipt' || result.kind !== 'model_result' ||
        launch.value.requestId !== attempt.launchRequestId ||
        launch.value.processDomainId !== attempt.processDomainId ||
        !sameRef(decision.source.modelResult, attempt.result) ||
        !sameRef(launch.value.modelResult, attempt.result) ||
        (!accepted && decision.proposal.kind !== 'fail')) {
      reconciliation('ATTEMPT_TRANSITION_INVALID',
        'non-candidate result lacks exact accepted decision provenance');
    }
    return;
  }
  const staleFrom = [
    'allocated', 'launch_intended', 'running', 'ambiguous', 'terminal_observed',
    'frozen', 'ingested',
  ];
  if (attempt.state === 'stale' && staleFrom.includes(previous?.state)) {
    if (observation === 'stop_stale') {
      const processRequired = ['launch_intended', 'running', 'ambiguous'].includes(previous.state);
      const expectedKinds = processRequired
        ? ['detail', 'launch_receipt', 'process_receipt']
        : ['detail'];
      const exactEvidence = exactEvidenceKinds(evidence, expectedKinds);
      const processValid = exactEvidence && (processRequired
        ? stopProcessProof(replay, previous, attempt, evidence[1], evidence[2], {
          provedEmpty: true,
        })
        : previous.state === 'allocated' || causalEmptyProcessProof(replay, previous));
      if (!exactEvidence || !latestAcceptedStopAuthorizes(replay, snapshot, evidence[0]) ||
          !stopAuthorityAdvances(previous.binding, attempt.binding) || !processValid) {
        reconciliation('ATTEMPT_TRANSITION_INVALID',
          'stale attempt lacks exact current stop and proved-empty process evidence');
      }
      return;
    }
    const processRequired = ['launch_intended', 'running', 'ambiguous'].includes(previous.state);
    const expectedKinds = processRequired ? ['decision', 'process_receipt'] : ['decision'];
    const decision = evidence[0]?.value;
    if (observation !== 'correction_stale' || !exactEvidenceKinds(evidence, expectedKinds) ||
        decision?.proposal?.kind !== 'request_correction' ||
        !decision.proposal.supersededAssignmentIds.includes(attempt.assignmentId) ||
        (processRequired && !processReceiptMatches(replay, evidence[1], attempt,
          { state: 'empty', provedEmpty: true }))) {
      reconciliation('ATTEMPT_TRANSITION_INVALID',
        'stale attempt lacks exact correction and process proof');
    }
    return;
  }
  if (attempt.state === 'quarantined' && previous !== null) {
    if (observation === 'stop_quarantined' &&
        ['launch_intended', 'running', 'ambiguous'].includes(previous.state)) {
      const process = evidence[2];
      const unresolved = process?.value?.state === 'ambiguous' ||
        (process?.value?.state === 'empty' && process.value.descendantsComplete === false);
      if (!exactEvidenceKinds(evidence, ['detail', 'launch_receipt', 'process_receipt']) ||
          !latestAcceptedStopAuthorizes(replay, snapshot, evidence[0]) ||
          !stopAuthorityAdvances(previous.binding, attempt.binding) || !unresolved ||
          !stopProcessProof(replay, previous, attempt, evidence[1], process, {
            provedEmpty: false,
          })) {
        reconciliation('ATTEMPT_TRANSITION_INVALID',
          'quarantined attempt lacks exact current stop and unresolved process evidence');
      }
      return;
    }
    if (['launch_intended', 'running', 'ambiguous'].includes(previous.state)) {
      let process;
      if (previous.state === 'launch_intended') {
        if (!exactEvidenceKinds(evidence, ['launch_receipt', 'process_receipt']) ||
            evidence[0].value.outcome !== 'ambiguous' ||
            !launchReceiptMatches(evidence[0], attempt, 'ambiguous', evidence[1])) {
          reconciliation('ATTEMPT_TRANSITION_INVALID', 'launch quarantine evidence is invalid');
        }
        process = evidence[1];
      } else {
        if (!exactEvidenceKinds(evidence, ['process_receipt'])) {
          reconciliation('ATTEMPT_TRANSITION_INVALID', 'process quarantine evidence is invalid');
        }
        process = evidence[0];
      }
      const unresolved = process.value.state === 'ambiguous' ||
        (process.value.state === 'empty' && process.value.descendantsComplete === false);
      if (observation !== 'process_quarantined' || !unresolved ||
          !processReceiptMatches(replay, process, attempt, { state: process.value.state })) {
        reconciliation('ATTEMPT_TRANSITION_INVALID', 'process quarantine lacks exact ambiguity');
      }
      return;
    }
    const cleanup = ['accepted', 'rejected', 'stale', 'cleanup_pending'].includes(previous.state);
    if (observation !== (cleanup ? 'cleanup_quarantined' : 'workspace_quarantined') ||
        !exactEvidenceKinds(evidence, ['resource_receipt']) ||
        !workspaceResourceMatches(evidence[0], attempt,
          cleanup ? 'cleanup' : 'observe_collision', 'ambiguous')) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'workspace quarantine evidence is invalid');
    }
    return;
  }
  if (edge === 'terminal_observed>frozen') {
    if (observation !== 'workspace_frozen' ||
        !exactEvidenceKinds(evidence, ['process_receipt']) ||
        !processReceiptMatches(replay, evidence[0], attempt, { state: 'empty', provedEmpty: true })) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'frozen attempt lacks proved-empty process evidence');
    }
    return;
  }
  if (edge === 'frozen>ingested') {
    if (observation !== 'candidate_ingested' ||
        !exactEvidenceKinds(evidence, ['operation', 'candidate']) ||
        !operationEvidence(evidence[0], 'ingest_attempt', 'observed_succeeded') ||
        !sameRef(evidence[0].value.subject, previous.__ref) ||
        !operationReceiptMatches(evidence[0], evidence[1]) ||
        evidence[1].value.candidateId !== attempt.candidateId ||
        !evidence[1].value.producerAttempts.includes(attempt.attemptId)) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'ingested attempt evidence is invalid');
    }
    return;
  }
  if (['ingested>accepted', 'ingested>rejected'].includes(edge)) {
    const accepted = attempt.state === 'accepted';
    const proposalKind = accepted ? 'integrate_candidate' : 'reject_candidate';
    if (observation !== (accepted ? 'candidate_accepted' : 'candidate_rejected') ||
        !exactEvidenceKinds(evidence, ['decision']) ||
        evidence[0].value.proposal.kind !== proposalKind ||
        evidence[0].value.proposal.candidateId !== attempt.candidateId ||
        evidence[0].value.derivedAssignments.length !== 0) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'candidate disposition evidence is invalid');
    }
    return;
  }
  if (['accepted>cleanup_pending', 'rejected>cleanup_pending',
    'stale>cleanup_pending'].includes(edge)) {
    const operations = evidence.map(({ value }) => value);
    if (observation !== 'cleanup_intended' || evidence.length < 1 ||
        evidence.some(({ kind }) => kind !== 'operation') ||
        !operationEvidence(evidence[0], 'cleanup_workspace', 'intended') ||
        evidence.slice(1).some((record) => !operationEvidence(record, 'cleanup_resource', 'intended')) ||
        evidence.some((record) => record.value.subject.kind !== 'attempt' ||
          record.value.subject.id !== attempt.attemptId) ||
        operations.slice(1).some((operation, index, values) =>
          index > 0 && values[index - 1].operationId >= operation.operationId)) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'cleanup intent evidence is invalid');
    }
    return;
  }
  if (edge === 'cleanup_pending>cleaned') {
    const processRequired = attempt.launchRequestId !== null || attempt.processDomainId !== null;
    const prefixLength = processRequired ? 3 : 2;
    const prefixKinds = processRequired
      ? ['operation', 'resource_receipt', 'process_receipt']
      : ['operation', 'resource_receipt'];
    if ((attempt.launchRequestId === null) !== (attempt.processDomainId === null) ||
        observation !== 'cleanup_observed' || evidence.length < prefixLength ||
        !exactEvidenceKinds(evidence.slice(0, prefixLength), prefixKinds) ||
        !operationEvidence(evidence[0], 'cleanup_workspace', 'observed_succeeded') ||
        evidence[0].value.subject.kind !== 'attempt' ||
        evidence[0].value.subject.id !== attempt.attemptId ||
        !workspaceResourceMatches(evidence[1], attempt, 'cleanup') ||
        !operationReceiptMatches(evidence[0], evidence[1]) ||
        (processRequired &&
          !processReceiptMatches(replay, evidence[2], attempt,
            { state: 'empty', provedEmpty: true })) ||
        (evidence.length - prefixLength) % 2 !== 0) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'workspace cleanup evidence is invalid');
    }
    let previousKey = null;
    for (let index = prefixLength; index < evidence.length; index += 2) {
      const operation = evidence[index];
      const receipt = evidence[index + 1];
      if (!operationEvidence(operation, 'cleanup_resource', 'observed_succeeded') ||
          operation.value.subject.kind !== 'attempt' ||
          operation.value.subject.id !== attempt.attemptId ||
          receipt.kind !== 'resource_receipt' || receipt.value.attemptId !== attempt.attemptId ||
          receipt.value.action !== 'cleanup' || receipt.value.outcome !== 'succeeded' ||
          receipt.value.ownershipTokenDigest === null ||
          receipt.value.resourceKey === `workspace:${attempt.workspace.workspaceId}` ||
          !operationReceiptMatches(operation, receipt) ||
          (previousKey !== null && previousKey >= receipt.value.resourceKey)) {
        reconciliation('ATTEMPT_TRANSITION_INVALID', 'resource cleanup evidence is invalid');
      }
      previousKey = receipt.value.resourceKey;
    }
    return;
  }
  reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt state edge is unsupported');
}

function validateAttemptTransitionDetail(replay, snapshot, event, subject, payload) {
  exactKeys(payload.value, [
    'schemaVersion', 'recordType', 'attempt', 'previousAttempt', 'observation',
    'evidence', 'observedAt',
  ], 'attempt transition detail');
  const detail = payload.value;
  if (detail.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION ||
      detail.recordType !== 'attempt_transition' || !sameRef(detail.attempt, event.subject) ||
      !sameRef(event.payload, { kind: payload.kind, id: payload.id, digest: payload.digest }) ||
      detail.observedAt !== event.observedAt || subject.kind !== 'attempt' ||
      subject.value.observedAt !== event.observedAt || typeof detail.observation !== 'string') {
    reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt transition detail is invalid');
  }
  const attempt = subject.value;
  if (!sameBinding(attempt.binding, bindingFor(snapshot, replay))) {
    reconciliation('ATTEMPT_TRANSITION_INVALID',
      'new attempt version is not bound to the exact current snapshot');
  }
  const records = replay.records.filter(({ kind, id, version }) =>
    kind === 'attempt' && id === attempt.attemptId && version <= attempt.recordVersion)
    .sort((left, right) => left.version - right.version);
  if (subject.version !== attempt.recordVersion || records.length !== attempt.recordVersion ||
      records.some((record, index) => record.version !== index + 1)) {
    reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt record versions are not contiguous');
  }
  let previous = null;
  if (attempt.recordVersion === 1) {
    if (attempt.previousDigest !== null || detail.previousAttempt !== null ||
        snapshot.attempts.some(({ id }) => id === attempt.attemptId) ||
        attempt.state !== 'allocated' || attempt.launchRequestId !== null ||
        attempt.processDomainId !== null || attempt.result !== null || attempt.candidateId !== null ||
        attempt.terminalReason !== null) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'initial attempt state is invalid');
    }
  } else {
    try { validateRef(detail.previousAttempt, 'previous attempt reference'); } catch {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'previous attempt reference is invalid');
    }
    const priorRecord = records.at(-2);
    const currentRef = snapshot.attempts.find(({ id }) => id === attempt.attemptId);
    if (detail.previousAttempt.kind !== 'attempt' || !sameRef(detail.previousAttempt, {
      kind: priorRecord.kind, id: priorRecord.id, digest: priorRecord.digest,
    }) || currentRef === undefined || !sameRef(currentRef, detail.previousAttempt) ||
        attempt.previousDigest !== priorRecord.digest) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt previous record is invalid');
    }
    previous = Object.freeze({ ...priorRecord.value, __ref: detail.previousAttempt });
    if (!stableAttemptFields(previous, attempt, attempt.state) ||
        Date.parse(attempt.observedAt) < Date.parse(previous.observedAt)) {
      reconciliation('ATTEMPT_TRANSITION_INVALID', 'attempt stable identity or fields changed');
    }
  }
  const evidence = attemptEvidence(replay, bindingFor(snapshot, replay), detail);
  validateAttemptEdgeEvidence(replay, snapshot, previous, attempt, detail.observation, evidence,
    event);
  return detail;
}

function validateActivationLifecycle(replay, snapshot, event, operationRecord, receiptRecord) {
  if (snapshot.phase !== 'preflight' || event.sequence !== 1 ||
      operationRecord.kind !== 'operation' || receiptRecord.kind !== 'detail') {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'task activation completion is not the first preflight transition');
  }
  const durable = durableActivationJournal(replay, { allowAbsent: false });
  const operationRef = durable.operation === null ? null : {
    kind: 'operation',
    id: durable.operation.operationId,
    digest: canonicalDigest(durable.operation),
  };
  if (operationRef === null || durable.receiptRef === null ||
      !sameRef(event.subject, operationRef) || !sameRef(event.payload, durable.receiptRef)) {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'task activation event does not bind Operation v2 and its exact receipt');
  }
  const expected = activationStartEvent(replay, snapshot, durable.operation, durable.receiptRef);
  const actual = { ...event };
  delete actual.__digest;
  if (canonicalDigest(actual) !== canonicalDigest(expected)) {
    reconciliation('TASK_ACTIVATION_EVIDENCE_INVALID',
      'task activation event differs from the deterministic causal event');
  }
}

function lifecycleEvidence(replay, snapshot, event) {
  const expectedBinding = bindingFor(snapshot, replay);
  const subject = recordForRef(replay, event.subject, 'lifecycle event subject');
  const payload = recordForRef(replay, event.payload, 'lifecycle event payload');
  switch (event.kind) {
    case 'orientation_published': {
      if (subject.kind !== 'detail' || !sameRef(event.subject, event.payload)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'orientation event must name one exact detail record');
      }
      try { validateOrientation(payload.value); } catch {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'orientation detail is invalid');
      }
      if (!sameBinding(payload.value.binding, expectedBinding) ||
          payload.value.snapshotDigest !== canonicalDigest(snapshot)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'orientation detail is stale');
      }
      break;
    }
    case 'root_decision_accepted':
      if (subject.kind !== 'decision' || !sameRef(event.subject, event.payload)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'root decision event must name one exact decision record');
      }
      {
        const launchIntent = recordForRef(replay, payload.value.source?.launchIntent,
          'root launch intent');
        const launch = recordForRef(replay, payload.value.source?.launchReceipt,
          'root launch receipt');
        const result = recordForRef(replay, payload.value.source?.modelResult,
          'root model result');
        const process = plainObject(launch.value?.providerHandleRef)
          ? recordForRef(replay, launch.value.providerHandleRef, 'root process receipt')
          : null;
        const attemptReference = process === null ? null : snapshot.attempts
          .find(({ id }) => id === process.value.attemptId);
        const attempt = attemptReference === null || attemptReference === undefined
          ? null
          : recordForRef(replay, attemptReference, 'root terminal attempt');
        const assignment = attempt === null
          ? null
          : immutableRecordForId(replay, 'assignment', attempt.value.assignmentId,
            'root assignment');
        const orientation = latestOrientationBefore(replay, event.sequence);
        try {
          validateRootModelResult(result.value);
        } catch {
          reconciliation('LIFECYCLE_EVIDENCE_INVALID',
            'root model result envelope is invalid');
        }
        const intent = attempt === null || assignment === null
          ? null
          : rootLaunchIntentEvidence(replay, launchIntent, {
            attempt: attempt.value,
            assignment,
            orientation,
            expectedBinding,
          });
        if (launch.kind !== 'launch_receipt' || result.kind !== 'model_result' ||
            intent === null ||
            !launchIntentPrecedesDecision(replay, attempt.value,
              payload.value.source.launchIntent, event.sequence) ||
            launch.value.outcome !== 'exited' || !plainObject(launch.value.modelResult) ||
            !sameRef(launch.value.modelResult, payload.value.source.modelResult) ||
            !recordValueBindingIsCurrent('launch_receipt', launch.value, expectedBinding) ||
            process?.kind !== 'process_receipt' || attempt?.kind !== 'attempt' ||
            attempt.value.state !== 'terminal_observed' ||
            !plainObject(attempt.value.result) ||
            !sameRef(attempt.value.result, payload.value.source.modelResult) ||
            launch.value.requestId !== intent.request.requestId ||
            launch.value.environmentDigest !== intent.request.environmentDigest ||
            result.value.orientationDigest !== orientation.ref.digest ||
            result.value.orientationDigest !== intent.orientationDigest ||
            payload.value.orientationDigest !== orientation.ref.digest ||
            result.value.promptDigest !== intent.request.promptDigest ||
            canonicalDigest(result.value.proposal) !== payload.value.proposalDigest ||
            !launchReceiptMatches(launch, attempt.value, 'exited', process) ||
            !processReceiptMatches(replay, process, attempt.value,
              { state: 'empty', provedEmpty: true })) {
          reconciliation('LIFECYCLE_EVIDENCE_INVALID',
            'root decision source provenance or process emptiness is invalid or stale');
        }
        if (payload.value.proposal.kind === 'reject_candidate') {
          for (const reference of payload.value.proposal.evidence) {
            const rejectionEvidence = recordForRef(replay, reference,
              'candidate rejection evidence');
            if (TYPED_RECORD_KINDS.has(rejectionEvidence.kind)) {
              try {
                validatePersistedRecord(rejectionEvidence.kind, rejectionEvidence.value,
                  { expectedRunId: replay.runId });
              } catch {
                reconciliation('LIFECYCLE_EVIDENCE_INVALID',
                  'candidate rejection evidence is invalid');
              }
            }
          }
        }
      }
      break;
    case 'attempt_transition':
      if (subject.kind !== 'attempt' || payload.kind !== 'detail') {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'attempt transition must bind one attempt and detail');
      }
      validateAttemptTransitionDetail(replay, snapshot, event, subject, payload);
      break;
    case 'operation_transition':
      if (subject.kind !== 'operation' || ![
        'operation', 'attempt', 'candidate', 'check_receipt', 'resource_receipt',
        'launch_receipt', 'model_result', 'terminal_receipt', 'detail',
      ].includes(payload.kind)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'operation event has unsupported subject or receipt evidence');
      }
      if ((payload.kind === 'operation' && !sameRef(event.subject, event.payload)) ||
          (payload.kind !== 'operation' &&
            (!plainObject(subject.value.receipt) || !sameRef(subject.value.receipt, event.payload)))) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'operation event payload is not the exact operation receipt');
      }
      if (subject.value.kind === 'activate_task') {
        validateActivationLifecycle(replay, snapshot, event, subject, payload);
      } else if (payload.kind === 'detail') {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'detail receipts are reserved for the exact task activation transition');
      }
      break;
    case 'provider_observed':
      if (subject.kind !== 'attempt' || payload.kind !== 'launch_receipt') {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'provider event must bind one attempt and launch receipt');
      }
      if (subject.value.launchRequestId !== payload.value.requestId ||
          subject.value.processDomainId !== payload.value.processDomainId) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'provider receipt does not name the attempt process identity');
      }
      break;
    case 'result_observed':
      if (subject.kind !== 'attempt' || payload.kind !== 'model_result') {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'result event must bind one attempt and model result');
      }
      if (!plainObject(subject.value.result) || !sameRef(subject.value.result, event.payload)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'result event payload is not the attempt result');
      }
      break;
    case 'wake_due':
      if (subject.kind !== 'detail' || !sameRef(event.subject, event.payload)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'wake event must name one exact detail');
      }
      validateWakeDetail(payload.value, expectedBinding, event);
      break;
    case 'terminal_published':
      if (subject.kind !== 'terminal_receipt' || !sameRef(event.subject, event.payload)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'terminal event must name one exact terminal receipt');
      }
      break;
    default:
      reconciliation('LIFECYCLE_EVENT_UNSUPPORTED', 'lifecycle event kind is unsupported');
  }
  for (const record of new Set([subject, payload])) {
    if (TYPED_RECORD_KINDS.has(record.kind)) {
      try {
        validatePersistedRecord(record.kind, record.value, { expectedRunId: replay.runId });
      } catch {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'lifecycle typed evidence is invalid');
      }
      if (plainObject(record.value.binding) && record.kind !== 'model_result' &&
          !recordValueBindingIsCurrent(record.kind, record.value, expectedBinding)) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'lifecycle typed evidence is stale');
      }
    }
  }
  return { subject, payload };
}

function exactCompletionWake(replay, event, { reason, operationKind, payloadKind }) {
  if (event.kind !== 'wake_due' || event.sequence < 2) return false;
  const detail = recordForRef(replay, event.payload, 'completion wake detail').value;
  if (detail.deadlineAt !== null || detail.reasons.length !== 1 ||
      detail.reasons[0] !== reason) return false;
  const preceding = replay.events.find(({ value }) => value.sequence === event.sequence - 1)?.value;
  if (preceding?.kind !== 'operation_transition' || preceding.payload.kind !== payloadKind) {
    return false;
  }
  const operation = recordForRef(replay, preceding.subject, 'completion operation').value;
  return operation.kind === operationKind && operation.state === 'observed_succeeded';
}

function exactAttemptCleanupWake(replay, event) {
  if (event.kind !== 'wake_due' || event.sequence < 2) return false;
  const wake = recordForRef(replay, event.payload, 'attempt cleanup wake detail').value;
  if (wake.deadlineAt !== null || wake.reasons.length !== 1 ||
      wake.reasons[0] !== 'attempt_cleanup_complete') return false;
  const preceding = replay.events.find(({ value }) => value.sequence === event.sequence - 1)?.value;
  if (preceding?.kind !== 'attempt_transition') return false;
  const attempt = recordForRef(replay, preceding.subject, 'cleaned attempt').value;
  const transition = recordForRef(replay, preceding.payload, 'cleaned attempt transition').value;
  return attempt.state === 'cleaned' && transition.recordType === 'attempt_transition' &&
    transition.observation === 'cleanup_observed' && sameRef(transition.attempt, preceding.subject);
}

function lifecyclePhase(replay, snapshot, event, evidence) {
  if (snapshot.stop.requested || snapshot.phase === 'stopping') return 'stopping';
  if (TERMINAL_PHASES.has(snapshot.phase)) {
    reconciliation('LIFECYCLE_TERMINAL_CONFLICT', 'a terminal run gained lifecycle evidence');
  }
  switch (event.kind) {
    case 'orientation_published':
      if (!['dormant', 'waiting'].includes(snapshot.phase)) {
        reconciliation('LIFECYCLE_PHASE_INVALID', 'orientation is invalid in the current phase');
      }
      return 'orienting';
    case 'root_decision_accepted':
      if (!['orienting', 'judgment_required'].includes(snapshot.phase)) {
        reconciliation('LIFECYCLE_PHASE_INVALID', 'root decision is invalid in the current phase');
      }
      if (evidence.payload.value.proposal.kind === 'wait') return 'waiting';
      if (evidence.payload.value.proposal.kind === 'stop') return 'stopping';
      if (evidence.payload.value.proposal.kind === 'finalize') return 'finalizing';
      return 'intent_published';
    case 'attempt_transition':
      return snapshot.phase;
    case 'operation_transition': {
      const operation = evidence.subject.value;
      if (snapshot.phase === 'preflight' && operation.kind === 'activate_task' &&
          operation.state === 'observed_succeeded') {
        return 'dormant';
      }
      if (snapshot.phase === 'orienting' && operation.kind === 'launch_job') {
        return 'judgment_required';
      }
      if (snapshot.phase === 'intent_published') {
        if (operation.kind === 'run_check') return 'verifying';
        if (['publish_candidate', 'close_task', 'create_completion_commit',
          'advance_target_ref'].includes(operation.kind)) return 'finalizing';
        return 'executing';
      }
      return snapshot.phase;
    }
    case 'provider_observed':
      return snapshot.phase;
    case 'result_observed':
      return snapshot.phase === 'executing' ? 'dormant' : snapshot.phase;
    case 'wake_due':
      if (snapshot.phase === 'waiting') return 'dormant';
      if (['intent_published', 'executing'].includes(snapshot.phase) &&
          exactAttemptCleanupWake(replay, event)) {
        return 'dormant';
      }
      if (snapshot.phase === 'executing' && exactCompletionWake(replay, event, {
        reason: 'candidate_integrated',
        operationKind: 'integrate_candidate',
        payloadKind: 'candidate',
      })) return 'dormant';
      if (snapshot.phase === 'verifying' && exactCompletionWake(replay, event, {
        reason: 'verification_complete',
        operationKind: 'run_check',
        payloadKind: 'check_receipt',
      })) return 'dormant';
      reconciliation('LIFECYCLE_PHASE_INVALID',
        'wake is invalid outside stable waiting or an exact completed operation');
      break;
    case 'terminal_published':
      return evidence.payload.value.disposition;
    default:
      reconciliation('LIFECYCLE_EVENT_UNSUPPORTED', 'lifecycle event kind is unsupported');
  }
}

function reduceLifecycleEvent(replay, snapshot, event) {
  const evidence = lifecycleEvidence(replay, snapshot, event);
  let assignments = snapshot.assignments;
  let attempts = snapshot.attempts;
  let operations = snapshot.operations;
  let checks = snapshot.checks;
  let resources = snapshot.resources;
  let integration = snapshot.integration;
  let pendingWakeReasons = snapshot.pendingWakeReasons;
  let taskRecordVersion = snapshot.taskRecordVersion;
  let correctionGeneration = snapshot.correctionGeneration;
  let stop = snapshot.stop;

  if (event.kind === 'root_decision_accepted') {
    const correction = evidence.payload.value.proposal.kind === 'request_correction';
    const correctionPolicy = correction ? {
      refs: evidence.payload.value.derivedAssignments,
      decisionId: evidence.payload.value.decisionId,
      proposalIds: evidence.payload.value.proposal.assignments.map(({ proposalId }) => proposalId),
    } : null;
    for (const reference of evidence.payload.value.derivedAssignments) {
      const assignment = recordForRef(replay, reference, 'derived assignment');
      if (assignment.kind !== 'assignment') {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID',
          'root decision derived a non-assignment record');
      }
      try {
        validatePersistedRecord('assignment', assignment.value, { expectedRunId: replay.runId });
      } catch {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'derived assignment is invalid');
      }
      const bindingCurrent = correction
        ? correctionAssignmentIsCurrent(assignment.value, bindingFor(snapshot, replay),
          correctionPolicy)
        : sameBinding(assignment.value.binding, bindingFor(snapshot, replay));
      if (!bindingCurrent) {
        reconciliation('LIFECYCLE_EVIDENCE_INVALID', 'derived assignment is stale');
      }
      assignments = upsertRef(assignments, reference);
    }
  }
  if (event.kind === 'operation_transition') {
    operations = upsertRef(operations, event.subject);
    if (snapshot.phase === 'preflight' && evidence.subject.value.kind === 'activate_task') {
      pendingWakeReasons = ['start'];
    }
  }
  if (['attempt_transition', 'provider_observed', 'result_observed'].includes(event.kind)) {
    attempts = upsertRef(attempts, event.subject);
  }
  if (evidence.payload.kind === 'attempt') attempts = upsertRef(attempts, event.payload);
  if (evidence.payload.kind === 'check_receipt') checks = upsertRef(checks, event.payload);
  if (evidence.payload.kind === 'resource_receipt') resources = upsertRef(resources, event.payload);
  if (evidence.payload.kind === 'candidate') {
    const candidate = evidence.payload.value;
    integration = Object.freeze({
      candidateId: candidate.candidateId,
      tree: candidate.tree,
      privateHead: candidate.privateCommit,
    });
  }
  if (event.kind === 'wake_due') pendingWakeReasons = evidence.payload.value.reasons;
  else if (event.kind === 'orientation_published') pendingWakeReasons = [];
  else if (event.kind === 'result_observed') pendingWakeReasons = ['provider_result'];
  if (event.kind === 'root_decision_accepted') {
    const proposal = evidence.payload.value.proposal;
    pendingWakeReasons = [];
    if (proposal.kind === 'request_correction') correctionGeneration += 1;
    if (proposal.kind === 'stop') {
      stop = Object.freeze({
        requested: true,
        mode: proposal.mode,
        reasonDigest: sha256Digest(Buffer.from(proposal.reason, 'utf8')),
      });
    }
  }
  if (event.kind === 'terminal_published' && evidence.payload.value.disposition === 'succeeded') {
    taskRecordVersion = evidence.payload.value.taskRecordVersion;
  }

  return nextSnapshot(snapshot, event, {
    phase: lifecyclePhase(replay, snapshot, event, evidence),
    assignments,
    attempts,
    operations,
    checks,
    resources,
    integration,
    pendingWakeReasons,
    taskRecordVersion,
    correctionGeneration,
    stop,
  });
}

/**
 * Reduce immutable run evidence. The replaceable snapshot is deliberately absent from
 * the input and never contributes authority.
 */
export function deriveImplementationRuntimeState(replay) {
  if (!plainObject(replay) || !Array.isArray(replay.events) || !Array.isArray(replay.records) ||
      !Array.isArray(replay.controls)) {
    fail('ARGUMENT_INVALID', 'runtime replay input is invalid');
  }
  const initial = deriveImplementationInitialSnapshot({
    manifest: replay.manifest,
    capsule: replay.capsule,
  });
  const history = [initial];
  const acceptedControls = [];
  let snapshot = initial;

  for (const entry of replay.events) {
    const event = Object.freeze({ ...entry.value, __digest: entry.digest });
    if (event.sequence !== snapshot.eventCursor + 1) {
      reconciliation('REPLAY_SEQUENCE', 'runtime replay event sequence is not contiguous');
    }
    if (event.sequence === 1 && event.kind === 'snapshot_published') {
      const record = replay.records.find(({ kind, id, digest }) =>
        kind === 'detail' && id === event.payload.id && digest === event.payload.digest);
      let publicationValid = record !== undefined && event.payload.kind === 'detail';
      if (publicationValid) {
        try {
          exactKeys(record.value, [
            'schemaVersion', 'recordType', 'snapshotRevision', 'snapshotDigest',
          ], 'snapshot publication detail');
          publicationValid = record.value.schemaVersion === IMPLEMENTATION_RUNTIME_VERSION &&
            record.value.recordType === 'snapshot_publication' &&
            record.value.snapshotRevision === initial.revision &&
            record.value.snapshotDigest === canonicalDigest(initial);
        } catch (error) {
          if (!(error instanceof ImplementationRuntimeError) || !error.reconciliationRequired) throw error;
          publicationValid = false;
        }
      }
      const expected = publicationValid
        ? startEvent(replay, initial, event.payload)
        : null;
      const actualWithoutDigest = { ...event };
      delete actualWithoutDigest.__digest;
      if (expected === null || canonicalDigest(actualWithoutDigest) !== canonicalDigest(expected)) {
        snapshot = reconciliationSnapshot(snapshot, event, 'start_event_invalid');
      } else {
        snapshot = nextSnapshot(snapshot, event, {
          phase: 'dormant',
          pendingWakeReasons: ['start'],
        });
      }
      history.push(snapshot);
      continue;
    }
    if (LIFECYCLE_EVENT_KINDS.has(event.kind)) {
      const eventValue = { ...event };
      delete eventValue.__digest;
      try {
        validateEvent(eventValue, { expectedBinding: bindingFor(snapshot, replay) });
        snapshot = reduceLifecycleEvent(replay, snapshot, event);
      } catch (error) {
        if (error instanceof ImplementationRuntimeError && error.reconciliationRequired) {
          snapshot = reconciliationSnapshot(snapshot, event, error.code.toLowerCase());
        } else {
          snapshot = reconciliationSnapshot(snapshot, event, 'lifecycle_event_invalid');
        }
      }
      history.push(snapshot);
      continue;
    }
    if (event.kind !== 'control_accepted' || !sameBinding(event.binding, bindingFor(snapshot, replay))) {
      snapshot = reconciliationSnapshot(snapshot, event, 'event_unsupported');
      history.push(snapshot);
      continue;
    }
    let accepted;
    try {
      accepted = lookupControl(replay, event);
    } catch (error) {
      if (!(error instanceof ImplementationRuntimeError) || !error.reconciliationRequired) throw error;
      snapshot = reconciliationSnapshot(snapshot, event, 'control_evidence_invalid');
      history.push(snapshot);
      continue;
    }
    const { detail, control } = accepted;
    const expectedEvent = controlEvent(replay, snapshot, control.value, event.payload,
      detail.acceptedAt);
    const actualEvent = { ...event };
    delete actualEvent.__digest;
    if (canonicalDigest(actualEvent) !== canonicalDigest(expectedEvent) ||
        (detail.kind === 'stop' &&
          detail.reasonDigest !== sha256Digest(Buffer.from(control.value.reason, 'utf8')))) {
      snapshot = reconciliationSnapshot(snapshot, event, 'control_event_invalid');
      history.push(snapshot);
      continue;
    }
    if (detail.expectedEpoch !== snapshot.epoch ||
        detail.expectedControlGeneration !== snapshot.controlGeneration) {
      snapshot = reconciliationSnapshot(snapshot, event, 'control_cas_invalid');
      history.push(snapshot);
      continue;
    }
    const changes = {
      controlGeneration: snapshot.controlGeneration + 1,
      pendingWakeReasons: [],
    };
    if (detail.kind === 'stop') {
      changes.phase = TERMINAL_PHASES.has(snapshot.phase) ? snapshot.phase : 'stopping';
      changes.stop = {
        requested: true,
        mode: detail.mode,
        reasonDigest: detail.reasonDigest,
      };
    } else {
      if (TERMINAL_PHASES.has(snapshot.phase)) {
        snapshot = reconciliationSnapshot(snapshot, event, 'resume_terminal');
        history.push(snapshot);
        continue;
      }
      changes.epoch = snapshot.epoch + 1;
      // Only an explicit, exact-CAS resume event may revoke a sticky stop. Ordinary
      // results and wake events never clear it.
      changes.stop = { requested: false, mode: null, reasonDigest: null };
      changes.phase = 'dormant';
      changes.pendingWakeReasons = ['resume'];
    }
    snapshot = nextSnapshot(snapshot, event, changes);
    acceptedControls.push(Object.freeze({
      requestId: detail.requestId,
      kind: detail.kind,
      eventId: event.eventId,
      controlGeneration: snapshot.controlGeneration,
      epoch: snapshot.epoch,
      acceptedAt: detail.acceptedAt,
      detailRef: Object.freeze({ ...event.payload }),
      detail: Object.freeze(structuredClone(detail)),
      request: Object.freeze(structuredClone(control.value)),
    }));
    history.push(snapshot);
  }

  const acceptedIds = new Set(acceptedControls.map(({ requestId }) => requestId));
  const pendingControls = replay.controls
    .filter(({ id }) => !acceptedIds.has(id))
    .map(({ value }) => Object.freeze(structuredClone(value)));
  return frozen({
    runId: replay.runId,
    snapshot,
    history,
    acceptedControls,
    pendingControls,
    reconciliationRequired: snapshot.reconciliation.required,
  });
}

function controlDetailId(request) {
  return `ctl_${canonicalDigest(request).slice(7, 31)}`;
}

function findAcceptedControlDetail(replay, request, expectedEpoch) {
  const requestDigest = canonicalDigest(request);
  const detailId = controlDetailId(request);
  const records = replay.records.filter(({ kind, id }) =>
    kind === 'detail' && id === detailId);
  if (records.length === 0) return null;
  if (records.length !== 1 || records[0].version !== 1) {
    reconciliation('CONTROL_DETAIL_CONFLICT',
      'accepted control detail has an unsupported version history');
  }
  let detail;
  try {
    detail = acceptedControlDetail(records[0]);
  } catch (error) {
    if (error instanceof ImplementationRuntimeError && error.reconciliationRequired) {
      reconciliation('CONTROL_DETAIL_CONFLICT',
        'accepted control detail is malformed or unsupported');
    }
    throw error;
  }
  const expectedReasonDigest = request.kind === 'stop'
    ? sha256Digest(Buffer.from(request.reason, 'utf8'))
    : null;
  if (detail.requestId !== request.requestId ||
      detail.requestDigest !== requestDigest ||
      detail.expectedEpoch !== expectedEpoch ||
      detail.expectedControlGeneration !== request.expectedControlGeneration ||
      detail.kind !== request.kind ||
      detail.mode !== (request.kind === 'stop' ? 'checkpoint' : null) ||
      detail.reasonDigest !== expectedReasonDigest) {
    reconciliation('CONTROL_DETAIL_CONFLICT',
      'accepted control detail does not match the exact durable request and CAS inputs');
  }
  return Object.freeze({
    detail,
    ref: Object.freeze({
      kind: 'detail',
      id: detailId,
      digest: records[0].digest,
    }),
  });
}

function controlEventId(request) {
  return `evt_${canonicalDigest(request).slice(7, 31)}`;
}

function resumeIntentId(request) {
  return `rsi_${canonicalDigest(request).slice(7, 31)}`;
}

function controlEvent(replay, snapshot, request, detailRef, acceptedAt) {
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
    eventId: controlEventId(request),
    sequence: snapshot.eventCursor + 1,
    binding: bindingFor(snapshot, replay),
    kind: 'control_accepted',
    subject: detailRef,
    causationId: null,
    correlationId: request.requestId,
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `control:${request.requestId}`,
    observedAt: acceptedAt,
    payload: detailRef,
  });
}

function fence(lock) {
  return { lockToken: lock.token, epoch: lock.epoch };
}

function assertRuntime(runtime) {
  if (!RUNTIMES.has(runtime)) fail('RUNTIME_INVALID', 'runtime receiver is invalid');
}

export function createImplementationRuntime({
  ledger,
  taskPort = null,
  clock = () => new Date().toISOString(),
} = {}) {
  if (ledger === null || (typeof ledger !== 'object' && typeof ledger !== 'function')) {
    fail('ARGUMENT_INVALID', 'runtime ledger is required');
  }
  if (taskPort !== null && (!plainObject(taskPort) ||
      typeof taskPort.activateTask !== 'function' || typeof taskPort.observeTask !== 'function')) {
    fail('ARGUMENT_INVALID', 'runtime task port is invalid');
  }
  if (typeof clock !== 'function') fail('ARGUMENT_INVALID', 'runtime clock must be a function');
  const locks = new Map();
  const controlWakeReceivers = new Map();

  async function replay(runId) {
    validateControllerId(runId, 'run ID');
    const durable = await replayRun(ledger, runId);
    return deriveImplementationRuntimeState(durable);
  }

  async function currentLock(runId, expectedEpoch) {
    const lock = locks.get(runId);
    if (lock === undefined || lock.epoch !== expectedEpoch) {
      fail('LOCK_REQUIRED', 'runtime does not hold the expected run lock');
    }
    const observed = await inspectRunLock(ledger, runId);
    if (!observed.held || observed.state !== 'owned' || observed.owner.token !== lock.token ||
        observed.owner.epoch !== expectedEpoch) {
      fail('LOCK_STALE', 'runtime run lock is no longer current');
    }
    return lock;
  }

  async function closeControlWake(runId) {
    const receiver = controlWakeReceivers.get(runId);
    if (receiver === undefined) return;
    controlWakeReceivers.delete(runId);
    await receiver.close();
  }

  async function installControlWake(runId, lock) {
    const existing = controlWakeReceivers.get(runId);
    if (existing !== undefined) return existing;
    const receiver = await createImplementationControlWakeReceiver({
      ledgerRootIdentity: ledger.rootIdentity,
      runId,
      lockToken: lock.token,
      epoch: lock.epoch,
    });
    controlWakeReceivers.set(runId, receiver);
    return receiver;
  }

  async function ensureLock(runId, epoch, acquiredAt) {
    const held = locks.get(runId);
    if (held !== undefined) {
      const current = await currentLock(runId, epoch);
      await installControlWake(runId, current);
      return current;
    }
    const observed = await inspectRunLock(ledger, runId);
    if (observed.held) fail('LOCK_REQUIRED', 'another owner holds the run lock');
    const lock = await acquireRunLock(ledger, runId, { epoch, acquiredAt });
    locks.set(runId, lock);
    try {
      await installControlWake(runId, lock);
      return lock;
    } catch (error) {
      locks.delete(runId);
      await lock.release().catch(() => {});
      throw error;
    }
  }

  async function advanceCache(runId, history, lock) {
    const cached = await readRunStatus(ledger, runId);
    let revision = cached.snapshot?.revision ?? 0;
    let repairRequired = cached.state === 'reconciliation_required';
    if (cached.snapshot !== null) {
      const derivedAtRevision = history.find((value) => value.revision === revision);
      if (derivedAtRevision === undefined ||
          canonicalDigest(derivedAtRevision) !== canonicalDigest(cached.snapshot)) {
        repairRequired = true;
      }
    }
    if (repairRequired) {
      const authoritative = history.at(-1);
      if (authoritative === undefined) {
        reconciliation('SNAPSHOT_REPAIR_INVALID', 'immutable replay produced no snapshot cache');
      }
      await repairSnapshotCache(ledger, runId, authoritative, fence(lock), {
        expectedDigest: cached.snapshotDigest,
      });
      return;
    }
    for (const snapshot of history.filter((value) => value.revision > revision)) {
      await publishSnapshot(ledger, runId, snapshot, fence(lock));
      revision = snapshot.revision;
    }
  }

  async function publishActivationIntent(runId, durable, lock) {
    let activation = durableActivationJournal(durable);
    const journal = activation?.journal ?? deriveReadyTaskActivationJournal({
      manifest: durable.manifest,
      capsule: durable.capsule,
      hypothetical: false,
    });
    if (activation === null) {
      await publishRecord(ledger, runId, {
        kind: 'detail', id: journal.detailRef.id, version: 1, value: journal.detail,
      }, fence(lock));
      durable = await replayRun(ledger, runId);
      activation = durableActivationJournal(durable, { allowAbsent: false });
    }
    if (!activation.intentOperationPublished) {
      await publishRecord(ledger, runId, {
        kind: 'operation', id: journal.operation.operationId, version: 1,
        value: journal.operation,
      }, fence(lock));
      durable = await replayRun(ledger, runId);
      activation = durableActivationJournal(durable, { allowAbsent: false });
    }
    return { durable, activation };
  }

  async function completeTaskActivation(runId, durable, lock) {
    if (taskPort === null) {
      fail('TASK_PORT_REQUIRED', 'ready-task activation requires exact activate and observe ports');
    }
    let prepared = await publishActivationIntent(runId, durable, lock);
    durable = prepared.durable;
    let activation = prepared.activation;
    const { journal } = activation;
    const observe = () => taskPort.observeTask(Object.freeze({
      taskId: journal.taskIntent.taskId,
      taskRevision: journal.taskIntent.taskRevision,
    }));
    let observed = await observe();
    if (activation.receipt === null) {
      if (!taskObservation(observed, journal, 'active',
        journal.taskIntent.resultingRecordVersion)) {
        if (!taskObservation(observed, journal, 'ready',
          journal.taskIntent.expectedRecordVersion)) {
          reconciliation('TASK_ACTIVATION_CONFLICT',
            'task activation precondition conflicts with the durable activation intent');
        }
        let activationFailure = null;
        try {
          await taskPort.activateTask(journal.taskIntent);
        } catch (error) {
          activationFailure = error;
        }
        observed = await observe();
        if (taskObservation(observed, journal, 'ready',
          journal.taskIntent.expectedRecordVersion)) {
          fail('TASK_ACTIVATION_INCOMPLETE', activationFailure === null
            ? 'task activation did not reach its planned postcondition'
            : 'task activation response was lost and its postcondition remains unchanged');
        }
      }
      if (!taskObservation(observed, journal, 'active',
        journal.taskIntent.resultingRecordVersion)) {
        reconciliation('TASK_ACTIVATION_MISMATCH',
          'task activation observation does not match the exact planned postcondition');
      }
      const receipt = activationReceipt(journal, nowFrom(clock));
      await publishRecord(ledger, runId, {
        kind: 'detail', id: 'activation_receipt', version: 1, value: receipt,
      }, fence(lock));
      durable = await replayRun(ledger, runId);
      activation = durableActivationJournal(durable, { allowAbsent: false });
    } else if (!taskObservation(observed, journal, 'active',
      journal.taskIntent.resultingRecordVersion)) {
      reconciliation('TASK_ACTIVATION_CONFLICT',
        'task no longer satisfies its durable activation receipt');
    }
    if (!activation.operationPublished) {
      await publishRecord(ledger, runId, {
        kind: 'operation', id: activation.operation.operationId, version: 2,
        value: activation.operation,
      }, fence(lock));
      durable = await replayRun(ledger, runId);
      activation = durableActivationJournal(durable, { allowAbsent: false });
    }
    await publishEvent(ledger, runId, activationStartEvent(
      durable,
      deriveImplementationInitialSnapshot({ manifest: durable.manifest, capsule: durable.capsule }),
      activation.operation,
      activation.receiptRef,
    ), fence(lock));
    return replayRun(ledger, runId);
  }

  function validateExpectedBinding(runId, expectedBinding) {
    try { validateBinding(expectedBinding, 'expected runtime binding'); } catch (error) {
      fail('ARGUMENT_INVALID', `expected runtime binding is invalid: ${error.message}`);
    }
    if (expectedBinding.runId !== runId) {
      fail('ARGUMENT_INVALID', 'expected runtime binding names another run');
    }
    return expectedBinding;
  }

  function validateRecordSpecification(specification, expectedBinding, {
    typedOnly = false,
    correctionAssignmentPolicy = null,
  } = {}) {
    if (!plainObject(specification)) fail('ARGUMENT_INVALID', 'record specification is invalid');
    exactKeys(specification, ['kind', 'id', 'version', 'value'], 'record specification');
    validateControllerId(specification.id, 'record ID');
    positiveInteger(specification.version, 'record version');
    if (typedOnly && !TYPED_RECORD_KINDS.has(specification.kind)) {
      fail('ARGUMENT_INVALID', 'pipeline journal accepts only typed records');
    }
    if (!TYPED_RECORD_KINDS.has(specification.kind) && specification.kind !== 'detail') {
      fail('ARGUMENT_INVALID', 'runtime record kind is unsupported');
    }
    if (!plainObject(specification.value)) fail('ARGUMENT_INVALID', 'record value is invalid');
    if (Object.hasOwn(specification.value, 'recordVersion')) {
      if (specification.value.recordVersion !== specification.version) {
        fail('ARGUMENT_INVALID', 'record version differs from its typed value');
      }
    } else if (specification.version !== 1) {
      fail('ARGUMENT_INVALID', 'immutable record must use version 1');
    }
    if (TYPED_RECORD_KINDS.has(specification.kind)) {
      try {
        validatePersistedRecord(specification.kind, specification.value, {
          expectedRunId: expectedBinding.runId,
        });
      } catch (error) {
        fail('ARGUMENT_INVALID', `typed record is invalid: ${error.message}`);
      }
      const bindingCurrent = specification.kind === 'assignment' &&
        correctionAssignmentIsCurrent(specification.value, expectedBinding, correctionAssignmentPolicy)
        ? true
        : recordValueBindingIsCurrent(specification.kind, specification.value, expectedBinding);
      if (plainObject(specification.value.binding) && !bindingCurrent) {
        fail('BINDING_STALE', 'typed record is not bound to the current runtime state');
      }
    } else if (specification.value.schemaVersion !== IMPLEMENTATION_RUNTIME_VERSION) {
      fail('ARGUMENT_INVALID', 'detail record version is unsupported');
    }
    return specification;
  }

  function latestRecord(replayValue, kind, id) {
    const records = replayValue.records.filter((record) => record.kind === kind && record.id === id)
      .sort((left, right) => left.version - right.version);
    return records.at(-1) ?? null;
  }

  async function currentWriterState(runId, expectedBinding) {
    validateExpectedBinding(runId, expectedBinding);
    const lock = await currentLock(runId, expectedBinding.epoch);
    const durable = await replayRun(ledger, runId);
    const state = deriveImplementationRuntimeState(durable);
    if (state.reconciliationRequired) {
      reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
        'runtime writer cannot advance reconciliation-required state');
    }
    if (!sameAuthorityBinding(bindingFor(state.snapshot, durable), expectedBinding)) {
      fail('BINDING_STALE', 'runtime writer binding is stale');
    }
    return { lock, durable, state };
  }

  function validateCausalRefs(durable, event) {
    for (const [label, reference] of [
      ['transition subject', event.subject], ['transition payload', event.payload],
    ]) {
      const matches = durable.records.filter(({ kind, id, digest }) =>
        kind === reference.kind && id === reference.id && digest === reference.digest);
      if (matches.length !== 1) {
        reconciliation('TRANSITION_EVIDENCE_MISSING',
          `${label} does not resolve to one exact durable record`);
      }
    }
  }

  function exactPublishedEvent(durable, event) {
    const bySequence = durable.events.find(({ value }) => value.sequence === event.sequence);
    const byDedupe = durable.events.find(({ value }) => value.dedupeKey === event.dedupeKey);
    if (bySequence === undefined && byDedupe === undefined) return null;
    if (bySequence === undefined || byDedupe === undefined || bySequence !== byDedupe ||
        canonicalDigest(bySequence.value) !== canonicalDigest(event)) {
      reconciliation('TRANSITION_EVENT_CONFLICT',
        'transition sequence or dedupe key has conflicting durable evidence');
    }
    return bySequence;
  }

  function withProposedRecords(durable, specifications) {
    const records = [...durable.records];
    for (const specification of specifications) {
      const digest = canonicalDigest(specification.value);
      const existing = records.find(({ kind, id, version }) =>
        kind === specification.kind && id === specification.id &&
        version === specification.version);
      if (existing !== undefined) {
        if (existing.digest !== digest) {
          reconciliation('TRANSITION_RECORD_CONFLICT',
            'transition record version conflicts with durable evidence');
        }
        continue;
      }
      records.push(Object.freeze({
        kind: specification.kind,
        id: specification.id,
        version: specification.version,
        digest,
        value: specification.value,
      }));
    }
    return Object.freeze({ ...durable, records: Object.freeze(records) });
  }

  function preflightTransition(durable, records, event) {
    const proposed = withProposedRecords(durable, records);
    validateCausalRefs(proposed, event);
    const predicted = deriveImplementationRuntimeState({
      ...proposed,
      events: [...proposed.events, Object.freeze({
        kind: 'event',
        id: event.eventId,
        version: 1,
        digest: canonicalDigest(event),
        value: event,
      })],
    });
    if (predicted.reconciliationRequired) {
      reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
        `runtime transition would reduce to reconciliation-required state: ${
          predicted.snapshot.reconciliation.reasonCode ?? 'unknown'}`);
    }
    return proposed;
  }

  function createPipelineJournal(runId, expectedBinding) {
    validateExpectedBinding(runId, expectedBinding);
    const journal = {
      async read(kind, id) {
        if (!PIPELINE_JOURNALS.has(journal)) fail('RUNTIME_INVALID', 'pipeline journal is invalid');
        if (!TYPED_RECORD_KINDS.has(kind)) fail('ARGUMENT_INVALID', 'pipeline record kind is unsupported');
        validateControllerId(id, 'pipeline record ID');
        const { durable } = await currentWriterState(runId, expectedBinding);
        const record = latestRecord(durable, kind, id);
        if (record === null) return null;
        if (plainObject(record.value.binding) &&
            !recordValueBindingIsCurrent(kind, record.value, expectedBinding)) {
          reconciliation('PIPELINE_RECORD_STALE',
            'pipeline record is bound to stale authority');
        }
        return frozen({
          value: Object.freeze(structuredClone(record.value)),
          ref: { kind, id, digest: record.digest },
        });
      },
      async publish(kind, id, value) {
        if (!PIPELINE_JOURNALS.has(journal)) fail('RUNTIME_INVALID', 'pipeline journal is invalid');
        const version = plainObject(value) && Number.isSafeInteger(value.recordVersion)
          ? value.recordVersion : 1;
        const specification = { kind, id, version, value };
        validateRecordSpecification(specification, expectedBinding, { typedOnly: true });
        const { lock } = await currentWriterState(runId, expectedBinding);
        const published = await publishRecord(ledger, runId, specification, fence(lock));
        return frozen({
          value: Object.freeze(structuredClone(value)),
          ref: Object.freeze({ ...published.ref }),
        });
      },
    };
    PIPELINE_JOURNALS.add(journal);
    return Object.freeze(journal);
  }

  const runtime = {
    async attachExisting({
      runId,
      expectedEpoch,
      attachedAt = nowFrom(clock),
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      positiveInteger(expectedEpoch, 'expected epoch');
      validateTimestamp(attachedAt, 'attachment timestamp');
      const durable = await replayRun(ledger, runId);
      const state = deriveImplementationRuntimeState(durable);
      if (state.reconciliationRequired) {
        reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
          'reconciliation-required run cannot be attached automatically');
      }
      if (TERMINAL_PHASES.has(state.snapshot.phase)) {
        fail('RUN_TERMINAL', 'terminal run cannot be attached');
      }
      if (state.snapshot.epoch !== expectedEpoch) {
        fail('CONTROL_STALE', 'attachment epoch is stale');
      }
      const alreadyHeld = locks.get(runId);
      if (alreadyHeld !== undefined) {
        await currentLock(runId, expectedEpoch);
        await advanceCache(runId, state.history, alreadyHeld);
        return frozen({ disposition: 'already_attached', runId,
          lock: { epoch: alreadyHeld.epoch }, state });
      }
      const observed = await inspectRunLock(ledger, runId);
      if (observed.held) {
        if (observed.state !== 'owned') {
          reconciliation('LOCK_NOT_ATTACHABLE',
            'ambiguous run lock cannot be attached or recovered automatically');
        }
        fail('LOCK_REQUIRED', 'held run lock prevents attachment');
      }
      const lock = await ensureLock(runId, expectedEpoch, attachedAt);
      await advanceCache(runId, state.history, lock);
      return frozen({ disposition: 'attached', runId,
        lock: { epoch: lock.epoch }, state });
    },

    async readLifecycle({ runId, after = null, limit = 128 } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      positiveInteger(limit, 'lifecycle read limit');
      if (limit > 128) fail('ARGUMENT_INVALID', 'lifecycle read limit exceeds its bound');
      if (after !== null) {
        const valid = plainObject(after) && Object.keys(after).length === 3 &&
          Object.hasOwn(after, 'kind') && Object.hasOwn(after, 'id') &&
          Object.hasOwn(after, 'version') && TYPED_RECORD_KINDS.has(after.kind) &&
          Number.isSafeInteger(after.version) && after.version >= 1;
        if (!valid) fail('ARGUMENT_INVALID', 'lifecycle read cursor is invalid');
        validateControllerId(after.id, 'lifecycle read cursor ID');
      }
      const durable = await replayRun(ledger, runId);
      const state = deriveImplementationRuntimeState(durable);
      const compare = (left, right) => left.kind.localeCompare(right.kind, 'en') ||
        left.id.localeCompare(right.id, 'en') || left.version - right.version;
      const records = durable.records.filter(({ kind }) => TYPED_RECORD_KINDS.has(kind))
        .sort(compare);
      const remaining = after === null ? records : records.filter((record) => compare(record, after) > 0);
      const page = remaining.slice(0, limit);
      const more = remaining.length > page.length;
      const next = more && page.length > 0
        ? Object.freeze({ kind: page.at(-1).kind, id: page.at(-1).id,
          version: page.at(-1).version })
        : null;
      return frozen({
        runId,
        authority: {
          manifest: structuredClone(durable.manifest),
          capsule: structuredClone(durable.capsule),
          capsuleDigest: durable.capsuleDigest,
        },
        state,
        records: page.map((record) => structuredClone(record)),
        next,
      });
    },

    pipelineJournal({ runId, expectedBinding } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      return createPipelineJournal(runId, expectedBinding);
    },

    async commitTransition({
      runId,
      expectedBinding,
      records = [],
      event,
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      validateExpectedBinding(runId, expectedBinding);
      if (!Array.isArray(records) || records.length > 128 || !plainObject(event)) {
        fail('ARGUMENT_INVALID', 'runtime transition input is invalid');
      }
      try {
        validateEvent(event, { expectedBinding });
      } catch (error) {
        fail('ARGUMENT_INVALID', `runtime transition event is invalid: ${error.message}`);
      }
      if (!LIFECYCLE_EVENT_KINDS.has(event.kind) || event.binding.runId !== runId) {
        fail('ARGUMENT_INVALID', 'runtime transition event kind or run is unsupported');
      }
      const decisionSpecification = records.find((specification) =>
        plainObject(specification) && plainObject(specification.value) &&
        specification.kind === 'decision' && specification.id === event.payload.id &&
        canonicalDigest(specification.value) === event.payload.digest);
      const correctionAssignmentPolicy = event.kind === 'root_decision_accepted' &&
        decisionSpecification?.value?.proposal?.kind === 'request_correction'
        ? {
          refs: decisionSpecification.value.derivedAssignments,
          decisionId: decisionSpecification.value.decisionId,
          proposalIds: decisionSpecification.value.proposal.assignments.map(({ proposalId }) => proposalId),
        }
        : null;
      const recordKeys = new Set();
      for (const specification of records) {
        validateRecordSpecification(specification, expectedBinding, { correctionAssignmentPolicy });
        const key = `${specification.kind}\0${specification.id}\0${specification.version}`;
        if (recordKeys.has(key)) fail('ARGUMENT_INVALID', 'runtime transition repeats a record version');
        recordKeys.add(key);
      }

      const lock = await currentLock(runId, expectedBinding.epoch);
      let durable = await replayRun(ledger, runId);
      const existing = exactPublishedEvent(durable, event);
      if (existing !== null) {
        for (const specification of records) {
          const durableRecord = durable.records.find(({ kind, id, version }) =>
            kind === specification.kind && id === specification.id &&
            version === specification.version);
          if (durableRecord === undefined ||
              canonicalDigest(durableRecord.value) !== canonicalDigest(specification.value)) {
            reconciliation('TRANSITION_RECORD_CONFLICT',
              'published transition event has missing or conflicting causal records');
          }
        }
        validateCausalRefs(durable, event);
        const state = deriveImplementationRuntimeState(durable);
        if (state.reconciliationRequired) {
          reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
            'published transition event reduces to reconciliation-required state');
        }
        await advanceCache(runId, state.history, lock);
        return frozen({
          disposition: 'recovered',
          runId,
          eventRef: { kind: 'event', id: existing.value.eventId, digest: existing.digest },
          recordRefs: records.map(({ kind, id, value }) =>
            ({ kind, id, digest: canonicalDigest(value) })),
          state,
        });
      }

      const before = deriveImplementationRuntimeState(durable);
      if (before.reconciliationRequired) {
        reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
          'runtime transition cannot advance reconciliation-required state');
      }
      if (!sameBinding(bindingFor(before.snapshot, durable), expectedBinding)) {
        fail('BINDING_STALE', 'runtime transition binding is stale');
      }
      if (event.sequence !== before.snapshot.eventCursor + 1) {
        fail('EVENT_STALE', 'runtime transition event sequence is stale');
      }
      preflightTransition(durable, records, event);

      const publishedRecords = [];
      for (const specification of records) {
        const published = await publishRecord(ledger, runId, specification, fence(lock));
        publishedRecords.push(Object.freeze({ ...published.ref }));
      }
      durable = await replayRun(ledger, runId);
      validateCausalRefs(durable, event);
      const publishedEvent = await publishEvent(ledger, runId, event, fence(lock));
      durable = await replayRun(ledger, runId);
      const state = deriveImplementationRuntimeState(durable);
      if (state.reconciliationRequired) {
        reconciliation('RUNTIME_RECONCILIATION_REQUIRED',
          'runtime transition reduced to reconciliation-required state');
      }
      await advanceCache(runId, state.history, lock);
      return frozen({
        disposition: 'committed',
        runId,
        eventRef: Object.freeze({ ...publishedEvent.ref }),
        recordRefs: Object.freeze(publishedRecords),
        state,
      });
    },

    async start(planInput) {
      assertRuntime(runtime);
      const plan = planImplementationStart(planInput);
      const taskRuns = await discoverImplementationRuns(ledger, {
        taskId: plan.manifest.task.id,
      });
      let selected = null;
      for (const discovered of taskRuns) {
        const durable = await replayRun(ledger, discovered.runId);
        const state = deriveImplementationRuntimeState(durable);
        if (discovered.runId === plan.runId) {
          if (selected !== null) {
            fail('RUN_ACTIVE', 'more than one nonterminal durable run owns this task');
          }
          selected = { durable, state, recovery: false };
          continue;
        }
        if (TERMINAL_PHASES.has(state.snapshot.phase)) continue;
        const activation = durableActivationJournal(durable);
        const currentTaskCanCompleteActivation = activation !== null &&
          planInput.task.taskRevision === durable.manifest.task.taskRevision &&
          ((planInput.task.status === 'active' &&
            planInput.task.recordVersion === durable.manifest.task.recordVersion) ||
           (planInput.task.status === 'ready' &&
            planInput.task.recordVersion + 1 === durable.manifest.task.recordVersion));
        if (!currentTaskCanCompleteActivation || selected !== null) {
          fail('RUN_ACTIVE', 'another nonterminal durable run already owns this task');
        }
        selected = { durable, state, recovery: true };
      }
      if (selected !== null && !selected.recovery &&
          selected.state.snapshot.phase !== 'preflight' && !locks.has(plan.runId)) {
        const status = await readRunStatus(ledger, plan.runId);
        return frozen({
          disposition: 'already_started',
          runId: plan.runId,
          created: false,
          lock: status.lock,
          state: selected.state,
        });
      }
      let created = false;
      if (selected === null) {
        const initialized = await initializeRun(ledger, {
          manifest: plan.manifest,
          capsule: plan.capsule,
        });
        created = initialized.created;
        const durable = await replayRun(ledger, plan.runId);
        selected = {
          durable,
          state: deriveImplementationRuntimeState(durable),
          recovery: false,
        };
      }
      const runId = selected.durable.runId;
      let lock = locks.get(runId);
      if (lock === undefined) {
        lock = await ensureLock(runId, 1, selected.durable.manifest.createdAt);
      } else {
        await currentLock(runId, 1);
      }
      let durable = await replayRun(ledger, runId);
      if (durable.events.length === 0) {
        const activation = durableActivationJournal(durable);
        const shouldActivate = activation !== null ||
          (!selected.recovery && runId === plan.runId && plan.taskActivation !== null);
        if (shouldActivate) {
          durable = await completeTaskActivation(runId, durable, lock);
        } else {
          const initialSnapshot = deriveImplementationInitialSnapshot({
            manifest: durable.manifest,
            capsule: durable.capsule,
          });
          await advanceCache(runId, [initialSnapshot], lock);
          const publication = await publishRecord(ledger, runId, {
            kind: 'detail', id: 'snapshot_1', version: 1,
            value: startDetail(initialSnapshot),
          }, fence(lock));
          await publishEvent(ledger, runId,
            startEvent(durable, initialSnapshot, publication.ref), fence(lock));
          durable = await replayRun(ledger, runId);
        }
      }
      const derived = deriveImplementationRuntimeState(durable);
      await advanceCache(runId, derived.history, lock);
      return frozen({
        disposition: selected.recovery ? 'activation_recovered' : 'started',
        runId,
        created,
        lock: { epoch: lock.epoch },
        state: derived,
      });
    },

    async replay(runId) {
      assertRuntime(runtime);
      return replay(runId);
    },

    async deriveStatus(runId) {
      assertRuntime(runtime);
      const derived = await replay(runId);
      const cached = await readRunStatus(ledger, runId);
      return frozen({
        ...derived,
        cache: cached.snapshot === null ? null : Object.freeze(structuredClone(cached.snapshot)),
        cacheState: cached.state,
        lock: cached.lock,
      });
    },

    async status(runId) {
      assertRuntime(runtime);
      return runtime.deriveStatus(runId);
    },

    async publishStopRequest({
      runId,
      requestId,
      expectedControlGeneration,
      reason,
      requestedAt = nowFrom(clock),
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      validateControllerId(requestId, 'control request ID');
      nonNegativeInteger(expectedControlGeneration, 'expected control generation');
      const derived = await replay(runId);
      if (derived.snapshot.controlGeneration !== expectedControlGeneration) {
        fail('CONTROL_STALE', 'stop request control generation is stale');
      }
      const request = {
        schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
        requestId,
        runId,
        expectedControlGeneration,
        kind: 'stop',
        requestedAt,
        reason,
      };
      const result = await publishControlRequest(ledger, runId, request);
      return frozen({ ...result, request });
    },

    async publishResumeRequest({
      runId,
      requestId,
      expectedEpoch,
      expectedControlGeneration,
      requestedAt = nowFrom(clock),
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      validateControllerId(requestId, 'control request ID');
      positiveInteger(expectedEpoch, 'expected epoch');
      nonNegativeInteger(expectedControlGeneration, 'expected control generation');
      const derived = await replay(runId);
      if (derived.snapshot.epoch !== expectedEpoch ||
          derived.snapshot.controlGeneration !== expectedControlGeneration) {
        fail('CONTROL_STALE', 'resume request epoch or control generation is stale');
      }
      const request = {
        schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
        requestId,
        runId,
        expectedEpoch,
        expectedControlGeneration,
        kind: 'resume',
        requestedAt,
      };
      const lock = await ensureLock(runId, expectedEpoch, requestedAt);
      const result = await publishControlRequest(ledger, runId, request);
      const intent = {
        schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
        recordType: 'resume_intent',
        requestId,
        requestDigest: canonicalDigest(request),
        expectedEpoch,
        expectedControlGeneration,
        publishedAt: requestedAt,
      };
      const persistedIntent = await publishRecord(ledger, runId, {
        kind: 'detail', id: resumeIntentId(request), version: 1, value: intent,
      }, fence(lock));
      return frozen({ ...result, expectedEpoch, request, intentRef: persistedIntent.ref });
    },

    async waitForControl({
      runId,
      expectedEpoch,
      expectedControlGeneration,
      signal = null,
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      positiveInteger(expectedEpoch, 'expected epoch');
      nonNegativeInteger(expectedControlGeneration, 'expected control generation');
      if (signal !== null && (typeof signal !== 'object' ||
          typeof signal.addEventListener !== 'function' ||
          typeof signal.removeEventListener !== 'function' ||
          typeof signal.aborted !== 'boolean')) {
        fail('ARGUMENT_INVALID', 'control wait abort signal is invalid');
      }
      const lock = await currentLock(runId, expectedEpoch);
      const receiver = await installControlWake(runId, lock);
      for (;;) {
        if (signal?.aborted === true) fail('CONTROL_WAIT_ABORTED', 'control wait was aborted');
        let wake;
        let resolveWake;
        let rejectWake;
        const promise = new Promise((resolve, reject) => {
          resolveWake = resolve;
          rejectWake = reject;
        });
        const unsubscribe = receiver.subscribe((requestId) => resolveWake(requestId));
        const onAbort = () => rejectWake(new ImplementationRuntimeError(
          'CONTROL_WAIT_ABORTED', 'control wait was aborted'));
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          const durable = await replayRun(ledger, runId);
          const derived = deriveImplementationRuntimeState(durable);
          if (derived.snapshot.epoch !== expectedEpoch ||
              derived.snapshot.controlGeneration !== expectedControlGeneration) {
            fail('CONTROL_STALE', 'control wait authority is stale');
          }
          const accepted = new Set(derived.acceptedControls.map(({ requestId }) => requestId));
          const controls = derived.pendingControls
            .filter((request) => !accepted.has(request.requestId) &&
              request.expectedControlGeneration === expectedControlGeneration)
            .sort((left, right) => {
              if (left.kind !== right.kind) return left.kind === 'stop' ? -1 : 1;
              return left.requestedAt.localeCompare(right.requestedAt, 'en') ||
                left.requestId.localeCompare(right.requestId, 'en');
            });
          if (controls.length > 0) {
            return frozen({
              disposition: 'control_observed',
              runId,
              request: Object.freeze(structuredClone(controls[0])),
            });
          }
          wake = await promise;
          void wake;
        } finally {
          unsubscribe();
          signal?.removeEventListener('abort', onAbort);
        }
      }
    },

    async acceptControls({ runId, expectedEpoch } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      positiveInteger(expectedEpoch, 'expected epoch');
      let durable = await replayRun(ledger, runId);
      let derived = deriveImplementationRuntimeState(durable);
      const lastAccepted = derived.acceptedControls.at(-1);
      if (derived.snapshot.epoch === expectedEpoch + 1 && lastAccepted?.kind === 'resume' &&
          lastAccepted.request.expectedControlGeneration + 1 ===
            derived.snapshot.controlGeneration) {
        const lock = await ensureLock(runId, derived.snapshot.epoch,
          lastAccepted.request.requestedAt);
        await advanceCache(runId, derived.history, lock);
        return frozen({
          disposition: 'recovered', runId, requestId: lastAccepted.requestId,
          kind: 'resume', state: derived,
        });
      }
      if (derived.snapshot.epoch !== expectedEpoch) {
        fail('CONTROL_STALE', 'control acceptance epoch is stale');
      }
      const accepted = new Set(derived.acceptedControls.map(({ requestId }) => requestId));
      const current = derived.pendingControls
        .filter((request) => !accepted.has(request.requestId) &&
          request.expectedControlGeneration === derived.snapshot.controlGeneration);
      const stopCandidates = current.filter(({ kind }) => kind === 'stop');
      const incompleteResume = current.find((request) =>
        request.kind === 'resume' && findResumeIntent(durable, request, expectedEpoch) === null);
      if (stopCandidates.length === 0 && incompleteResume !== undefined) {
        reconciliation('RESUME_INTENT_INCOMPLETE',
          'resume request lacks exact durable epoch evidence');
      }
      const candidates = current
        .filter((request) => request.kind !== 'resume' ||
          findResumeIntent(durable, request, expectedEpoch) !== null)
        .sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'stop' ? -1 : 1;
          return left.requestedAt.localeCompare(right.requestedAt, 'en') ||
            left.requestId.localeCompare(right.requestId, 'en');
        });
      if (candidates.length === 0) {
        const lock = locks.get(runId);
        if (lock !== undefined) {
          await currentLock(runId, expectedEpoch);
          await advanceCache(runId, derived.history, lock);
        }
        return frozen({ disposition: 'quiesced', runId, state: derived });
      }
      const request = candidates[0];
      let durableDetail = findAcceptedControlDetail(durable, request, expectedEpoch);
      const acceptedAt = durableDetail?.detail.acceptedAt ?? nowFrom(clock);
      let lock;
      if (request.kind === 'resume') {
        const alreadyRotated = locks.get(runId);
        if (alreadyRotated?.epoch === expectedEpoch + 1) {
          lock = await currentLock(runId, expectedEpoch + 1);
        } else {
          lock = await ensureLock(runId, expectedEpoch, acceptedAt);
          await closeControlWake(runId);
          await lock.release();
          locks.delete(runId);
          lock = await acquireRunLock(ledger, runId, {
            epoch: expectedEpoch + 1,
            acquiredAt: acceptedAt,
          });
          locks.set(runId, lock);
          try {
            await installControlWake(runId, lock);
          } catch (error) {
            locks.delete(runId);
            await lock.release().catch(() => {});
            throw error;
          }
        }
      } else {
        lock = await ensureLock(runId, expectedEpoch, acceptedAt);
      }
      durable = await replayRun(ledger, runId);
      durableDetail = findAcceptedControlDetail(durable, request, expectedEpoch);
      if (durableDetail === null) {
        const detail = Object.freeze({
          schemaVersion: IMPLEMENTATION_RUNTIME_VERSION,
          recordType: 'accepted_control',
          requestId: request.requestId,
          requestDigest: canonicalDigest(request),
          expectedEpoch,
          expectedControlGeneration: request.expectedControlGeneration,
          kind: request.kind,
          mode: request.kind === 'stop' ? 'checkpoint' : null,
          reasonDigest: request.kind === 'stop'
            ? sha256Digest(Buffer.from(request.reason, 'utf8'))
            : null,
          acceptedAt,
        });
        const publishedDetail = await publishRecord(ledger, runId, {
          kind: 'detail', id: controlDetailId(request), version: 1, value: detail,
        }, fence(lock));
        durableDetail = Object.freeze({ detail, ref: publishedDetail.ref });
        durable = await replayRun(ledger, runId);
      }
      await publishEvent(ledger, runId,
        controlEvent(durable, derived.snapshot, request, durableDetail.ref,
          durableDetail.detail.acceptedAt),
        fence(lock));
      derived = await replay(runId);
      await advanceCache(runId, derived.history, lock);
      return frozen({
        disposition: 'accepted',
        runId,
        requestId: request.requestId,
        kind: request.kind,
        state: derived,
      });
    },

    async runUntilQuiescent({
      runId,
      expectedEpoch,
      maximumTransitions = 16,
    } = {}) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      positiveInteger(expectedEpoch, 'expected epoch');
      positiveInteger(maximumTransitions, 'maximum transitions');
      if (maximumTransitions > 128) {
        fail('ARGUMENT_INVALID', 'maximum transitions exceeds the runtime bound');
      }
      let epoch = expectedEpoch;
      let transitions = 0;
      while (transitions < maximumTransitions) {
        const state = await replay(runId);
        if (transitions === 0 && state.snapshot.epoch !== expectedEpoch) {
          fail('CONTROL_STALE', 'runtime loop epoch is stale');
        }
        epoch = state.snapshot.epoch;
        if (state.reconciliationRequired) {
          return frozen({ disposition: 'reconciliation_required', runId, transitions, state });
        }
        if (TERMINAL_PHASES.has(state.snapshot.phase)) {
          return frozen({ disposition: 'terminal', runId, transitions, state });
        }
        const currentControls = state.pendingControls.filter(({ expectedControlGeneration }) =>
          expectedControlGeneration === state.snapshot.controlGeneration);
        if (currentControls.length > 0) {
          let accepted;
          try {
            accepted = await runtime.acceptControls({ runId, expectedEpoch: epoch });
          } catch (error) {
            if (!(error instanceof ImplementationRuntimeError) || !error.reconciliationRequired) {
              throw error;
            }
            return frozen({
              disposition: 'reconciliation_required', runId, transitions, state,
              issue: { code: error.code, message: error.message },
            });
          }
          if (accepted.disposition === 'accepted' || accepted.disposition === 'recovered') {
            transitions += 1;
            continue;
          }
        } else {
          await runtime.acceptControls({ runId, expectedEpoch: epoch });
        }
        const settled = await replay(runId);
        const disposition = settled.snapshot.phase === 'stopping' ? 'stopping' : 'quiescent';
        return frozen({ disposition, runId, transitions, state: settled });
      }
      const state = await replay(runId);
      if (state.reconciliationRequired) {
        return frozen({ disposition: 'reconciliation_required', runId, transitions, state });
      }
      if (TERMINAL_PHASES.has(state.snapshot.phase)) {
        return frozen({ disposition: 'terminal', runId, transitions, state });
      }
      const currentControls = state.pendingControls.filter(({ expectedControlGeneration }) =>
        expectedControlGeneration === state.snapshot.controlGeneration);
      if (currentControls.length === 0) {
        return frozen({
          disposition: state.snapshot.phase === 'stopping' ? 'stopping' : 'quiescent',
          runId,
          transitions,
          state,
        });
      }
      return frozen({ disposition: 'transition_limit', runId, transitions, state });
    },

    async doctor(runId) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      const derived = await replay(runId);
      const cached = await readRunStatus(ledger, runId);
      const issues = [];
      if (derived.reconciliationRequired) issues.push('immutable_reconciliation_required');
      if (cached.snapshot === null) {
        issues.push(cached.state === 'reconciliation_required' ? 'cache_corrupt' : 'cache_missing');
      } else if (canonicalDigest(cached.snapshot) !== canonicalDigest(derived.snapshot)) {
        issues.push('cache_lag_or_divergence');
      }
      return frozen({
        runId,
        ok: issues.length === 0,
        issues,
        derived: derived.snapshot,
        cached: cached.snapshot,
        lock: cached.lock,
      });
    },

    async release(runId) {
      assertRuntime(runtime);
      validateControllerId(runId, 'run ID');
      const lock = locks.get(runId);
      if (lock === undefined) return frozen({ released: false });
      await closeControlWake(runId);
      try {
        return await lock.release();
      } finally {
        locks.delete(runId);
      }
    },
  };
  RUNTIMES.add(runtime);
  return Object.freeze(runtime);
}
