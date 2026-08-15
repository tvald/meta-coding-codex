import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ASSIGNMENT_PROPOSAL_ROLES,
  ASSIGNMENT_ROLES,
  ATTEMPT_STATES,
  CHECK_OUTCOMES,
  CONTROL_REQUEST_KINDS,
  EVENT_KINDS,
  IMPLEMENTATION_PROTOCOL_COMPATIBILITY,
  IMPLEMENTATION_PROTOCOL_LIMITS,
  ImplementationProtocolError,
  OPERATION_KINDS,
  OPERATION_STATES,
  PERSISTED_RECORD_KINDS,
  REF_KINDS,
  RESOURCE_CLAIM_MODES,
  ROOT_DECISION_KINDS,
  RUN_PHASES,
  TERMINAL_DISPOSITIONS,
  canonicalBytes,
  canonicalDigest,
  canonicalJson,
  createRootLaunchIntent,
  parseCanonicalJson,
  rootLaunchRequestDigest,
  sha256Digest,
  validateAssignmentProposal,
  validateAssignment,
  validateAttempt,
  validateBinding,
  validateCandidate,
  validateCheckReceipt,
  validateControlRequest,
  validateEvent,
  validateImplementationCapsule,
  validateLaunchReceipt,
  validateModelResult,
  validateOperation,
  validatePersistedRecord,
  validateProcessReceipt,
  validateRef,
  validateRepositoryPath,
  validateResourceClaim,
  validateResourceReceipt,
  validateRootDecision,
  validateRootDecisionProposal,
  validateRootLaunchIntent,
  validateRootLaunchRequest,
  validateRootModelResult,
  validateRunManifest,
  validateRunSnapshot,
  validateTerminalReceipt,
  validateTimestamp,
  validateWorkerResult,
} from '../lib/implementation-protocol.mjs';

const digest = (character = 'a') => `sha256:${character.repeat(64)}`;
const oid = (character = '1') => character.repeat(40);
const now = '2026-08-14T12:00:00Z';

const binding = Object.freeze({
  runId: 'run_0054',
  epoch: 1,
  snapshotRevision: 7,
  taskId: 'T-0054',
  taskRevision: 2,
  taskRecordVersion: 3,
  capsuleDigest: digest('a'),
  controlGeneration: 0,
  correctionGeneration: 1,
});

const ref = (kind, id, character = 'b') => ({ kind, id, digest: digest(character) });

function assignmentProposal(proposalId = 'proposal_a', dependencies = []) {
  return {
    proposalId,
    role: 'implementer',
    goal: 'Implement one isolated slice.',
    scope: ['The assigned protocol surface'],
    nonGoals: ['Provider effects'],
    dependencies,
    ownership: {
      writePaths: ['lib/assigned.mjs', 'tests/assigned.test.mjs'],
      readPaths: ['readme/project/protocol.md'],
    },
    resources: [{ key: 'fixture-cache', mode: 'namespaced_write', namespace: proposalId }],
    checks: ['unit_test'],
    restartPolicy: 'fresh_attempt',
  };
}

function waitProposal() {
  return {
    schemaVersion: 1,
    rationale: 'No current observation warrants an effect.',
    kind: 'wait',
    reasonCode: 'stable_state',
    wakeOn: ['control_change', 'result_observed'],
    deadlineAt: null,
  };
}

function capsuleValue() {
  return {
    schemaVersion: 1,
    taskId: binding.taskId,
    taskRevision: binding.taskRevision,
    taskRecordVersion: binding.taskRecordVersion,
    storeId: 'task_store',
    storeGeneration: 'generation_1',
    createdAt: now,
    authority: 'Implement the accepted protocol slice.',
    outcome: 'Persist only exact version-one controller records.',
    acceptance: [ref('evidence', 'acceptance_a')],
    nonGoals: ['Provider execution'],
    assumptions: ['The repository uses SHA-1 Git object identifiers.'],
    decisions: [ref('decision', 'decision_a')],
    route: 'initiative',
    risk: 'critical',
    gateDigest: digest('c'),
    checkCatalogDigest: digest('d'),
    detailDigests: [ref('detail', 'detail_a')],
    baseCommit: oid('1'),
    baseStatusDigest: digest('e'),
  };
}

function manifestValue(capsule = capsuleValue()) {
  return {
    schemaVersion: 1,
    runId: binding.runId,
    createdAt: now,
    task: {
      id: capsule.taskId,
      taskRevision: capsule.taskRevision,
      recordVersion: capsule.taskRecordVersion,
      storeId: capsule.storeId,
      storeGeneration: capsule.storeGeneration,
    },
    capsuleDigest: canonicalDigest(capsule),
    controller: {
      packageName: '@tvald/meta-framework',
      packageVersion: '1.0.0',
      protocolVersion: 1,
    },
    provider: {
      adapter: 'codex_exec_v1',
      adapterVersion: '1.0.0',
      harness: 'codex',
      executableRealpath: '/usr/bin/codex',
      executableVersion: '0.147.0',
    },
    repository: {
      rootIdentity: digest('f'),
      objectFormat: 'sha1',
      baseCommit: capsule.baseCommit,
      baseTree: oid('2'),
      canonicalWorktreeIdentity: digest('0'),
    },
    limits: {
      backgroundWip: 3,
      rootWip: 1,
      maxEvents: 10_000,
      maxDiagnosticBytes: 64 * 1024 * 1024,
      orientationBytes: 96 * 1024,
    },
    policyDigests: {
      promptRegistry: digest('1'),
      checks: digest('2'),
      resources: digest('3'),
    },
  };
}

function snapshotValue() {
  return {
    schemaVersion: 1,
    runId: binding.runId,
    revision: binding.snapshotRevision,
    previousDigest: digest('4'),
    epoch: binding.epoch,
    controlGeneration: binding.controlGeneration,
    phase: 'executing',
    taskRecordVersion: binding.taskRecordVersion,
    correctionGeneration: binding.correctionGeneration,
    integration: { candidateId: 'candidate_a', tree: oid('2'), privateHead: oid('3') },
    eventCursor: 4,
    assignments: [ref('assignment', 'assignment_a')],
    attempts: [ref('attempt', 'attempt_a')],
    operations: [ref('operation', 'operation_a')],
    checks: [ref('check_receipt', 'check_receipt_a')],
    resources: [ref('resource_receipt', 'resource_receipt_a')],
    pendingWakeReasons: ['result_observed'],
    stop: { requested: false, mode: null, reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
    updatedAt: now,
  };
}

function assignmentValue() {
  return {
    schemaVersion: 1,
    assignmentId: 'assignment_a',
    generation: 1,
    binding: { ...binding },
    sourceDecisionId: 'decision_a',
    sourceProposalId: 'proposal_a',
    role: 'implementer',
    profileDigest: digest('5'),
    goal: 'Implement the protocol record validator.',
    scope: ['Closed persisted records'],
    nonGoals: ['Provider execution'],
    dependencies: [{ assignmentId: 'assignment_prior', condition: 'integrated', generation: 1 }],
    ownership: { writePaths: ['lib/a.mjs'], readPaths: ['readme/protocol.md'] },
    resources: [{ key: 'fixture', mode: 'namespaced_write', namespace: 'assignment_a' }],
    baseCandidateId: 'candidate_base',
    baseTree: oid('2'),
    permissions: {
      sandbox: 'workspace-write', network: false, approvalPolicy: 'never', nestedAgents: false,
    },
    checks: ['unit_test'],
    deadlineAt: '2026-08-14T12:10:00Z',
    restartPolicy: 'fresh_attempt',
  };
}

function attemptValue() {
  return {
    schemaVersion: 1,
    attemptId: 'attempt_a',
    assignmentId: 'assignment_a',
    attemptNumber: 1,
    recordVersion: 1,
    previousDigest: null,
    binding: { ...binding },
    state: 'running',
    workspace: {
      workspaceId: 'workspace_a', rootIdentity: digest('6'), kind: 'linked_worktree', baseTree: oid('2'),
    },
    launchRequestId: 'launch_request_a',
    processDomainId: 'process_a',
    result: null,
    candidateId: null,
    observedAt: now,
    terminalReason: null,
  };
}

function operationValue() {
  return {
    schemaVersion: 1,
    operationId: 'operation_a',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'launch:attempt_a',
    kind: 'launch_job',
    subject: ref('attempt', 'attempt_a'),
    binding: { ...binding },
    inputDigest: digest('7'),
    expected: [ref('launch_receipt', 'launch_receipt_a')],
    state: 'started',
    attemptNumber: 1,
    receipt: null,
    observedAt: now,
    failureCode: null,
  };
}

function eventValue() {
  return {
    schemaVersion: 1,
    eventId: 'event_a',
    sequence: 4,
    binding: { ...binding },
    kind: 'provider_observed',
    subject: ref('launch_receipt', 'launch_receipt_a'),
    causationId: 'operation_a',
    correlationId: 'assignment_a',
    producer: { kind: 'launcher', connectionId: 'connection_a' },
    dedupeKey: 'provider:launch_request_a:4',
    observedAt: now,
    payload: ref('evidence', 'provider_event_a'),
  };
}

function candidateValue() {
  return {
    schemaVersion: 1,
    candidateId: 'candidate_a',
    binding: { ...binding },
    parentCandidateId: 'candidate_base',
    baseTree: oid('2'),
    tree: oid('3'),
    privateCommit: oid('4'),
    producerAttempts: ['attempt_a'],
    changedPaths: ['lib/a.mjs', 'tests/a.test.mjs'],
    ownershipDigest: digest('8'),
    patchDigest: digest('9'),
    createdAt: now,
  };
}

function checkReceiptValue() {
  return {
    schemaVersion: 1,
    receiptId: 'check_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    checkId: 'unit_test',
    catalogDigest: digest('a'),
    candidateId: 'candidate_a',
    candidateTree: oid('3'),
    inputScopeDigest: digest('b'),
    commandDigest: digest('c'),
    environmentDigest: digest('d'),
    resourcesDigest: digest('e'),
    outcome: 'pass',
    exitCode: 0,
    evidence: [ref('evidence', 'check_output_a')],
    startedAt: '2026-08-14T12:00:00Z',
    completedAt: '2026-08-14T12:00:01Z',
  };
}

function resourceReceiptValue() {
  return {
    schemaVersion: 1,
    receiptId: 'resource_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    attemptId: 'attempt_a',
    resourceKey: 'fixture:database',
    action: 'allocate',
    ownershipTokenDigest: digest('f'),
    observedIdentityDigest: digest('0'),
    outcome: 'succeeded',
    evidence: [],
    observedAt: now,
  };
}

function processReceiptValue(overrides = {}) {
  return {
    schemaVersion: 1,
    receiptId: 'process_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    attemptId: 'attempt_a',
    requestId: 'launch_request_a',
    launcherConnectionId: 'connection_a',
    processDomainId: 'process_a',
    processIdentityDigest: digest('7'),
    action: 'observe',
    state: 'empty',
    descendantsComplete: true,
    membersDigest: digest('8'),
    evidence: [ref('evidence', 'process_snapshot_a')],
    observedAt: now,
    ...overrides,
  };
}

function launchReceiptValue() {
  return {
    schemaVersion: 1,
    receiptId: 'launch_receipt_a',
    recordVersion: 1,
    previousDigest: null,
    requestId: 'launch_request_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    launcherConnectionId: 'connection_a',
    processDomainId: 'process_a',
    providerHandleRef: ref('evidence', 'provider_handle_a'),
    argvDigest: digest('1'),
    environmentDigest: digest('2'),
    startedAt: '2026-08-14T12:00:00Z',
    completedAt: '2026-08-14T12:00:02Z',
    exitCode: 0,
    signal: null,
    stdoutDigest: digest('3'),
    stderrDigest: digest('4'),
    modelResult: ref('model_result', 'model_result_a'),
    outcome: 'exited',
  };
}

function rootLaunchRequestValue(overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: 'launch_request_root',
    jobId: 'job_root',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    assignmentId: 'assignment_root',
    attemptId: 'attempt_root',
    role: 'root_decision',
    providerAdapter: 'codex_exec_v1',
    executableVersion: '0.147.0',
    cwdIdentity: digest('1'),
    baseTree: oid('2'),
    profileDigest: digest('3'),
    promptDigest: digest('4'),
    outputSchemaDigest: digest('5'),
    sandbox: 'read-only',
    approvalPolicy: 'never',
    network: false,
    nestedAgents: false,
    environmentDigest: digest('6'),
    deadlineAt: now,
    ...overrides,
  };
}

function rootLaunchIntentValue() {
  return createRootLaunchIntent({
    request: rootLaunchRequestValue(),
    orientation: ref('detail', 'orientation_root', '7'),
  });
}

function workerResultValue() {
  return {
    schemaVersion: 1,
    disposition: 'completed',
    summary: 'Implemented and verified the assigned slice.',
    changedPathsClaim: ['lib/a.mjs', 'tests/a.test.mjs'],
    checks: [{ id: 'unit_test', outcome: 'pass', evidenceDigest: digest('5') }],
    findings: [{ severity: 'none', summary: 'No findings.', evidenceDigest: null }],
    risks: ['Live execution remains disabled.'],
    knowledgeProposals: [],
    followUp: ['Integrate through the single writer.'],
  };
}

function rootModelResultValue() {
  return {
    schemaVersion: 1,
    recordType: 'root_decision_result',
    worker: workerResultValue(),
    proposal: waitProposal(),
    orientationDigest: digest('7'),
    promptDigest: digest('8'),
    rawResultDigest: digest('9'),
  };
}

function terminalReceiptValue() {
  return {
    schemaVersion: 1,
    receiptId: 'terminal_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    disposition: 'succeeded',
    candidateId: 'candidate_a',
    finalTree: oid('3'),
    finalCommit: oid('4'),
    taskStatus: 'done',
    taskRecordVersion: binding.taskRecordVersion,
    checkReceipts: [ref('check_receipt', 'check_receipt_a')],
    completionEvidenceDigest: digest('6'),
    emittedAt: now,
  };
}

function protocolError(code) {
  return (error) => error instanceof ImplementationProtocolError && error.code === code;
}

test('compatibility metadata and every protocol enum are frozen closed inventories', () => {
  assert.deepEqual(IMPLEMENTATION_PROTOCOL_COMPATIBILITY, {
    version: '1.0.0',
    protocolVersions: [1],
    recordSchemaVersions: [1],
    canonicalization: 'RFC8785',
    digestAlgorithm: 'sha256',
  });
  assert.equal(Object.isFrozen(IMPLEMENTATION_PROTOCOL_COMPATIBILITY), true);
  for (const values of [
    REF_KINDS,
    RESOURCE_CLAIM_MODES,
    OPERATION_KINDS,
    EVENT_KINDS,
    RUN_PHASES,
    ATTEMPT_STATES,
    OPERATION_STATES,
    ASSIGNMENT_ROLES,
    ASSIGNMENT_PROPOSAL_ROLES,
    ROOT_DECISION_KINDS,
    CHECK_OUTCOMES,
    CONTROL_REQUEST_KINDS,
    TERMINAL_DISPOSITIONS,
    PERSISTED_RECORD_KINDS,
  ]) assert.equal(Object.isFrozen(values), true);
  assert.equal(REF_KINDS.includes('decision'), true);
  assert.equal(RESOURCE_CLAIM_MODES.includes('global_write'), false);
  assert.equal(ASSIGNMENT_ROLES.includes('root_decision'), true);
  assert.equal(ASSIGNMENT_PROPOSAL_ROLES.includes('root_decision'), false);
  assert.equal(ROOT_DECISION_KINDS.includes('grant_approval'), false);
  assert.equal(OPERATION_KINDS.includes('allocate_workspace'), true);
  assert.equal(EVENT_KINDS.includes('attempt_transition'), true);
  assert.equal(REF_KINDS.includes('process_receipt'), true);
  assert.equal(PERSISTED_RECORD_KINDS.includes('process_receipt'), true);
});

test('every defined persisted v1 controller record has one closed positive validator', () => {
  const capsule = capsuleValue();
  const manifest = manifestValue(capsule);
  const snapshot = snapshotValue();
  const typed = [
    ['run manifest', validateRunManifest, manifest],
    ['implementation capsule', validateImplementationCapsule, capsule],
    ['run snapshot', validateRunSnapshot, snapshot],
    ['assignment', validateAssignment, assignmentValue()],
    ['attempt', validateAttempt, attemptValue()],
    ['operation', validateOperation, operationValue()],
    ['event', validateEvent, eventValue()],
    ['candidate', validateCandidate, candidateValue()],
    ['check receipt', validateCheckReceipt, checkReceiptValue()],
    ['resource receipt', validateResourceReceipt, resourceReceiptValue()],
    ['process receipt', validateProcessReceipt, processReceiptValue()],
    ['launch receipt', validateLaunchReceipt, launchReceiptValue()],
    ['Root launch request', validateRootLaunchRequest, rootLaunchRequestValue()],
    ['Root launch intent', validateRootLaunchIntent, rootLaunchIntentValue()],
    ['worker result', validateWorkerResult, workerResultValue()],
    ['Root model result', validateRootModelResult, rootModelResultValue()],
    ['terminal receipt', validateTerminalReceipt, terminalReceiptValue()],
  ];
  for (const [label, validator, value] of typed) {
    assert.equal(validator(value), value, label);
  }
  const stop = {
    schemaVersion: 1, requestId: 'stop_a', runId: binding.runId,
    expectedControlGeneration: binding.controlGeneration, kind: 'stop', requestedAt: now,
    reason: 'Checkpoint at the next safe boundary.',
  };
  const resume = {
    schemaVersion: 1, requestId: 'resume_a', runId: binding.runId,
    expectedEpoch: binding.epoch, expectedControlGeneration: binding.controlGeneration,
    kind: 'resume', requestedAt: now,
  };
  assert.equal(validateControlRequest(stop, { expectedRunId: binding.runId }), stop);
  assert.equal(validateControlRequest(resume, { expectedRunId: binding.runId }), resume);

  const persisted = new Map([
    ['assignment', assignmentValue()],
    ['attempt', attemptValue()],
    ['operation', operationValue()],
    ['candidate', candidateValue()],
    ['check_receipt', checkReceiptValue()],
    ['resource_receipt', resourceReceiptValue()],
    ['process_receipt', processReceiptValue()],
    ['launch_receipt', launchReceiptValue()],
    ['model_result', workerResultValue()],
    ['model_result', rootModelResultValue()],
    ['terminal_receipt', terminalReceiptValue()],
  ]);
  for (const [kind, value] of persisted) {
    assert.equal(validatePersistedRecord(kind, value), value, kind);
  }
});

test('all persisted record validators reject unknown and missing fields', () => {
  const cases = [
    [validateRunManifest, manifestValue()],
    [validateImplementationCapsule, capsuleValue()],
    [validateRunSnapshot, snapshotValue()],
    [validateAssignment, assignmentValue()],
    [validateAttempt, attemptValue()],
    [validateOperation, operationValue()],
    [validateEvent, eventValue()],
    [validateCandidate, candidateValue()],
    [validateCheckReceipt, checkReceiptValue()],
    [validateResourceReceipt, resourceReceiptValue()],
    [validateProcessReceipt, processReceiptValue()],
    [validateLaunchReceipt, launchReceiptValue()],
    [validateRootLaunchRequest, rootLaunchRequestValue()],
    [validateRootLaunchIntent, rootLaunchIntentValue()],
    [validateWorkerResult, workerResultValue()],
    [validateRootModelResult, rootModelResultValue()],
    [validateTerminalReceipt, terminalReceiptValue()],
  ];
  for (const [validator, value] of cases) {
    assert.throws(() => validator({ ...value, untrustedAuthority: true }),
      protocolError('SCHEMA_INVALID'));
    const missing = structuredClone(value);
    delete missing[Object.keys(missing).find((key) => key !== 'schemaVersion')];
    assert.throws(() => validator(missing), protocolError('SCHEMA_INVALID'));
  }
  const stop = {
    schemaVersion: 1, requestId: 'stop_a', runId: binding.runId,
    expectedControlGeneration: 0, kind: 'stop', requestedAt: now, reason: 'Stop.',
  };
  assert.throws(() => validateControlRequest({ ...stop, expectedEpoch: 1 }),
    protocolError('SCHEMA_INVALID'));
  const missingReason = structuredClone(stop);
  delete missingReason.reason;
  assert.throws(() => validateControlRequest(missingReason), protocolError('SCHEMA_INVALID'));
  const resume = {
    schemaVersion: 1, requestId: 'resume_a', runId: binding.runId, expectedEpoch: binding.epoch,
    expectedControlGeneration: 0, kind: 'resume', requestedAt: now,
  };
  const missingEpoch = structuredClone(resume);
  delete missingEpoch.expectedEpoch;
  assert.throws(() => validateControlRequest(missingEpoch), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateControlRequest({ ...resume, expectedEpoch: 0 }),
    protocolError('SCHEMA_INVALID'));
});

test('persisted record enums, authority bindings, and derived provenance fail closed', () => {
  assert.throws(() => validateRunManifest({
    ...manifestValue(),
    repository: { ...manifestValue().repository, objectFormat: 'sha512' },
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateImplementationCapsule({
    ...capsuleValue(), decisions: [ref('detail', 'decision_a')],
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRunSnapshot({ ...snapshotValue(), phase: 'paused' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRunSnapshot({
    ...snapshotValue(), stop: { requested: true, mode: null, reasonDigest: null },
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateAssignment({ ...assignmentValue(), role: 'root' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateAssignment(assignmentValue(), {
    expectedBinding: { ...binding, epoch: binding.epoch + 1 },
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateAttempt({ ...attemptValue(), state: 'relaunched' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateOperation({ ...operationValue(), kind: 'shell' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateEvent({
    ...eventValue(), producer: { kind: 'provider', connectionId: null },
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateCandidate({
    ...candidateValue(), changedPaths: ['tests/a.test.mjs', 'lib/a.mjs'],
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateCheckReceipt({ ...checkReceiptValue(), outcome: 'trusted' }),
    protocolError('SCHEMA_INVALID'));
  const earlierCheck = checkReceiptValue();
  assert.equal(validateCheckReceipt(earlierCheck, { expectedBinding: binding }), earlierCheck);
  assert.throws(() => validateResourceReceipt({
    ...resourceReceiptValue(), action: 'delete_unknown',
  }), protocolError('SCHEMA_INVALID'));
  const incompleteEmpty = processReceiptValue({ descendantsComplete: false });
  assert.equal(validateProcessReceipt(incompleteEmpty), incompleteEmpty);
  assert.throws(() => validateProcessReceipt({ ...processReceiptValue(), action: 'kill' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateProcessReceipt({ ...processReceiptValue(), state: 'gone' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateLaunchReceipt({ ...launchReceiptValue(), outcome: 'running' }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateWorkerResult({ ...workerResultValue(), disposition: 'approved' }),
    protocolError('SCHEMA_INVALID'));
  assert.deepEqual(validateModelResult(workerResultValue()), workerResultValue());
  assert.deepEqual(validateModelResult(rootModelResultValue()), rootModelResultValue());
  assert.throws(() => validateRootModelResult({
    ...rootModelResultValue(), orientationDigest: 'unbound',
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateTerminalReceipt({
    ...terminalReceiptValue(), finalCommit: null,
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateControlRequest({
    schemaVersion: 1, requestId: 'pause_a', runId: binding.runId,
    expectedControlGeneration: 0, kind: 'pause', requestedAt: now,
  }), protocolError('SCHEMA_INVALID'));
});

test('Root launch intent closes and recomputes exact role, prompt, orientation, and request identity', () => {
  const request = rootLaunchRequestValue();
  const orientation = ref('detail', 'orientation_exact', '7');
  const intent = createRootLaunchIntent({ request, orientation });
  assert.equal(intent.requestDigest, canonicalDigest(request));
  assert.equal(rootLaunchRequestDigest(request), intent.requestDigest);
  assert.equal(intent.orientationDigest, orientation.digest);
  assert.equal(validateRootLaunchIntent(intent, {
    expectedBinding: request.binding,
    expectedOrientationRef: orientation,
  }), intent);

  assert.throws(() => validateRootLaunchRequest({ ...request, role: 'root_analysis' }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchRequest({ ...request, sandbox: 'workspace-write' }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchIntent({ ...intent, requestDigest: digest('0') }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchIntent({
    ...intent,
    request: { ...intent.request, promptDigest: digest('9') },
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchIntent({ ...intent, orientationDigest: digest('8') }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchIntent(intent, {
    expectedOrientationRef: ref('detail', 'orientation_stale', '7'),
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootLaunchIntent(intent, {
    expectedBinding: { ...request.binding, controlGeneration: 1 },
  }), protocolError('PROVENANCE_INVALID'));
});

test('canonical bytes match the RFC 8785 UTF-16 key-order fixture without normalization', () => {
  const fixture = {
    '\u20ac': 'Euro Sign',
    '\r': 'Carriage Return',
    '\ufb33': 'Hebrew Letter Dalet With Dagesh',
    1: 'One',
    '\ud83d\ude00': 'Emoji: Grinning Face',
    '\u0080': 'Control',
    '\u00f6': 'Latin Small Letter O With Diaeresis',
  };
  const expected = '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
    '"ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
    '"😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}';
  assert.equal(canonicalJson(fixture), expected);
  assert.deepEqual(canonicalBytes(fixture), Buffer.from(expected, 'utf8'));
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: [3, true, null] } }),
    '{"a":{"x":[3,true,null],"y":2},"z":1}');

  const composed = canonicalJson({ '\u00e9': 'composed' });
  const decomposed = canonicalJson({ 'e\u0301': 'decomposed' });
  assert.notEqual(composed, decomposed);
  assert.notEqual(sha256Digest(composed), sha256Digest(decomposed));
});

test('SHA-256 covers exact canonical file bytes and canonical files have no framing bytes', () => {
  const value = { schemaVersion: 1, message: 'exact bytes' };
  const bytes = canonicalBytes(value);
  const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.equal(bytes.at(0), '{'.charCodeAt(0));
  assert.equal(bytes.at(-1), '}'.charCodeAt(0));
  assert.equal(bytes.includes(0xef), false);
  assert.equal(sha256Digest(bytes), expected);
  assert.equal(canonicalDigest(value), expected);
  assert.notEqual(sha256Digest(Buffer.concat([bytes, Buffer.from('\n')])), expected);
});

test('canonicalization rejects values outside the bounded restricted JSON domain', () => {
  for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 9_007_199_254_740_992,
    1n, undefined, new Date(0), '\ud800']) {
    assert.throws(() => canonicalJson(value), protocolError('VALUE_INVALID'));
  }
  assert.equal(canonicalJson(-0), '0');
  assert.throws(() => canonicalJson({ '\udfff': 'invalid key' }), protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson(Array(1)), protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson(Array.from({ length: 129 }, () => null)),
    protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson('x'.repeat(256), { maxBytes: 16 }), protocolError('RECORD_SIZE'));
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle, { maximumDepth: 4 }), protocolError('VALUE_INVALID'));
});

test('strict parsing rejects duplicate, malformed, noncanonical, and non-integer inputs', () => {
  const canonical = '{"a":1,"nested":{"b":true}}';
  assert.deepEqual(parseCanonicalJson(Buffer.from(canonical)), { a: 1, nested: { b: true } });
  assert.equal(Object.hasOwn(parseCanonicalJson('{"__proto__":1}'), '__proto__'), true);

  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"b":1,"a":2}',
    '{ "a":1}',
    '{"a":1}\n',
    '{"a":1.0}',
    '{"a":1e0}',
    '{"a":9007199254740992}',
    '"\\ud800"',
  ]) assert.throws(() => parseCanonicalJson(text), (error) =>
    error instanceof ImplementationProtocolError && ['JSON_INVALID', 'JSON_NONCANONICAL'].includes(error.code));

  assert.throws(() => parseCanonicalJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    protocolError('JSON_INVALID'));
  assert.throws(() => parseCanonicalJson(Buffer.from([0x22, 0xff, 0x22])), protocolError('JSON_INVALID'));
  assert.throws(() => parseCanonicalJson('{}', { maxBytes: 1 }), protocolError('RECORD_SIZE'));
});

test('common Binding, Ref, path, time, and ResourceClaim validators are exact and bounded', () => {
  assert.equal(validateBinding(binding), binding);
  const candidateRef = ref('candidate', 'candidate_a');
  assert.equal(validateRef(candidateRef), candidateRef);
  assert.equal(validateRepositoryPath('lib/protocol/record.mjs'), 'lib/protocol/record.mjs');
  assert.equal(validateTimestamp('2026-08-14T12:34:56.123456Z'), '2026-08-14T12:34:56.123456Z');
  assert.equal(validateTimestamp('0001-01-01T00:00:00Z'), '0001-01-01T00:00:00Z');
  assert.deepEqual(validateResourceClaim({
    key: 'cache:fixture', mode: 'namespaced_write', namespace: 'attempt_a',
  }), { key: 'cache:fixture', mode: 'namespaced_write', namespace: 'attempt_a' });
  assert.deepEqual(validateResourceClaim({ key: 'network', mode: 'exclusive', namespace: null }),
    { key: 'network', mode: 'exclusive', namespace: null });

  assert.throws(() => validateBinding({ ...binding, executable: '/bin/sh' }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateBinding({ ...binding, taskRevision: 1.5 }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRef({ ...ref('candidate', 'candidate_a'), kind: 'workspace' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRef({ ...ref('candidate', 'candidate_a'), digest: `sha256:${'A'.repeat(64)}` }),
    protocolError('SCHEMA_INVALID'));
  for (const path of ['', '/absolute', 'a\\b', 'a//b', 'a/./b', 'a/../b', 'a\0b']) {
    assert.throws(() => validateRepositoryPath(path), protocolError('SCHEMA_INVALID'));
  }
  assert.throws(() => validateTimestamp('2026-02-30T00:00:00Z'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateTimestamp('1900-02-29T00:00:00Z'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateTimestamp('2026-08-14T00:00:00+00:00'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateResourceClaim({
    key: 'cache', mode: 'namespaced_write', namespace: null,
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateResourceClaim({
    key: 'cache', mode: 'shared_read', namespace: 'attempt_a',
  }), protocolError('SCHEMA_INVALID'));
});

test('AssignmentProposal is closed, path-canonical, and excludes supervisor authority', () => {
  const proposal = assignmentProposal();
  assert.equal(validateAssignmentProposal(proposal), proposal);
  for (const mutation of [
    { ...proposal, assignmentId: 'assignment_a' },
    { ...proposal, binding },
    { ...proposal, role: 'root_decision' },
    { ...proposal, permissions: { sandbox: 'workspace-write' } },
    { ...proposal, shell: 'node test.mjs' },
    { ...proposal, ownership: { ...proposal.ownership, writePaths: ['z', 'a'] } },
  ]) assert.throws(() => validateAssignmentProposal(mutation), protocolError('SCHEMA_INVALID'));
});

test('every RootDecisionProposal variant is closed and proposal data cannot carry Binding', () => {
  const assignment = assignmentProposal();
  const variants = [
    { schemaVersion: 1, rationale: 'Delegate.', kind: 'declare_assignments', assignments: [assignment] },
    { schemaVersion: 1, rationale: 'Integrate.', kind: 'integrate_candidate', candidateId: 'candidate_a' },
    {
      schemaVersion: 1,
      rationale: 'Correct.',
      kind: 'request_correction',
      supersededAssignmentIds: ['assignment_a'],
      assignments: [assignment],
      affectedCheckIds: ['unit_test'],
    },
    {
      schemaVersion: 1,
      rationale: 'Verify.',
      kind: 'schedule_gates',
      candidateId: 'candidate_a',
      assignments: [assignment],
    },
    {
      schemaVersion: 1,
      rationale: 'Checkpoint.',
      kind: 'checkpoint_task',
      status: 'needs_verification',
      nextSafeAction: 'Run the offline gate.',
    },
    {
      schemaVersion: 1,
      rationale: 'Reject stale candidate evidence.',
      kind: 'reject_candidate',
      candidateId: 'candidate_a',
      evidence: [ref('check_receipt', 'check_receipt_a')],
    },
    {
      schemaVersion: 1,
      rationale: 'Ask.',
      kind: 'request_approval',
      action: 'Run a live canary.',
      boundary: 'One local disposable repository.',
      detailRef: ref('detail', 'approval_detail'),
    },
    waitProposal(),
    {
      schemaVersion: 1,
      rationale: 'Finish.',
      kind: 'finalize',
      candidateId: 'candidate_a',
      requiredCheckReceiptIds: ['check_a'],
      completionEvidenceDigest: digest('c'),
    },
    { schemaVersion: 1, rationale: 'Stop.', kind: 'stop', mode: 'checkpoint', reason: 'Operator request.' },
    { schemaVersion: 1, rationale: 'Fail.', kind: 'fail', reasonCode: 'invalid_state', evidence: [] },
  ];
  for (const variant of variants) assert.equal(validateRootDecisionProposal(variant), variant);

  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), binding }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), kind: 'grant_approval' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), taskMutation: { status: 'done' } }),
    protocolError('SCHEMA_INVALID'));
});

test('proposal dependency validation rejects unresolved, duplicate, conflicting, and cyclic graphs', () => {
  const unresolved = {
    schemaVersion: 1,
    rationale: 'Invalid graph.',
    kind: 'declare_assignments',
    assignments: [assignmentProposal('proposal_a', [{
      targetKind: 'proposal', targetId: 'missing', condition: 'result',
    }])],
  };
  assert.throws(() => validateRootDecisionProposal(unresolved), protocolError('SCHEMA_INVALID'));

  const duplicateIds = structuredClone(unresolved);
  duplicateIds.assignments = [assignmentProposal('proposal_a'), assignmentProposal('proposal_a')];
  assert.throws(() => validateRootDecisionProposal(duplicateIds), protocolError('SCHEMA_INVALID'));

  const conflicting = assignmentProposal('proposal_a', [
    { targetKind: 'assignment', targetId: 'existing_a', condition: 'result' },
    { targetKind: 'assignment', targetId: 'existing_a', condition: 'integrated' },
  ]);
  assert.throws(() => validateAssignmentProposal(conflicting), protocolError('SCHEMA_INVALID'));

  const cyclic = structuredClone(unresolved);
  cyclic.assignments = [
    assignmentProposal('proposal_a', [{ targetKind: 'proposal', targetId: 'proposal_b', condition: 'result' }]),
    assignmentProposal('proposal_b', [{ targetKind: 'proposal', targetId: 'proposal_a', condition: 'result' }]),
  ];
  assert.throws(() => validateRootDecisionProposal(cyclic), protocolError('SCHEMA_INVALID'));

  const external = structuredClone(unresolved);
  external.assignments = [assignmentProposal('proposal_a', [{
    targetKind: 'assignment', targetId: 'existing_a', condition: 'result',
  }])];
  assert.equal(validateRootDecisionProposal(external, { knownAssignmentIds: ['existing_a'] }), external);
  assert.throws(() => validateRootDecisionProposal(external, { knownAssignmentIds: [] }),
    protocolError('SCHEMA_INVALID'));
});

test('RootDecision validation binds proposal bytes, supervisor Binding, and launch provenance', () => {
  const modelResult = ref('model_result', 'model_result_a', 'd');
  const orientationDigest = sha256Digest('bounded orientation bytes');
  const launchIntent = createRootLaunchIntent({
    request: rootLaunchRequestValue({ promptDigest: digest('8') }),
    orientation: { kind: 'detail', id: 'orientation_a', digest: orientationDigest },
  });
  const launchIntentRef = {
    kind: 'detail', id: 'root_launch_intent_a', digest: canonicalDigest(launchIntent),
  };
  const launchReceipt = {
    schemaVersion: 1,
    receiptId: 'launch_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    modelResult,
  };
  const launchReceiptRef = {
    kind: 'launch_receipt',
    id: launchReceipt.receiptId,
    digest: canonicalDigest(launchReceipt),
  };
  const proposal = waitProposal();
  const decision = {
    schemaVersion: 1,
    decisionId: 'decision_a',
    binding: { ...binding },
    orientationDigest,
    proposalDigest: canonicalDigest(proposal, {
      maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes,
    }),
    source: { launchIntent: launchIntentRef, launchReceipt: launchReceiptRef, modelResult },
    proposal,
    derivedAssignments: [],
    acceptedAt: '2026-08-14T12:00:00Z',
  };
  assert.equal(validateRootDecision(decision, {
    expectedBinding: binding,
    expectedOrientationDigest: orientationDigest,
    launchIntentRef,
    launchIntent,
    launchReceiptRef,
    launchReceipt,
  }), decision);
  assert.equal(validatePersistedRecord('decision', decision), decision);

  const rawProposal = waitProposal();
  assert.throws(() => validateRootDecision(rawProposal), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecision({ ...decision, proposalDigest: digest('e') }),
    protocolError('PROVENANCE_INVALID'));
  const rejection = {
    schemaVersion: 1,
    rationale: 'Reject exact candidate evidence.',
    kind: 'reject_candidate',
    candidateId: 'candidate_a',
    evidence: [ref('check_receipt', 'check_receipt_a')],
  };
  assert.throws(() => validateRootDecision({
    ...decision,
    proposal: rejection,
    proposalDigest: canonicalDigest(rejection),
    derivedAssignments: [ref('assignment', 'assignment_a')],
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, { expectedOrientationDigest: digest('f') }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    launchIntentRef: { ...launchIntentRef, id: 'another_intent' },
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    expectedOrientationDigest: digest('f'), launchIntent,
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    launchReceipt: { ...launchReceipt, modelResult: ref('model_result', 'another_result', 'd') },
  }), protocolError('PROVENANCE_INVALID'));
  const wrongAuthorityReceipt = {
    ...launchReceipt,
    binding: { ...launchReceipt.binding, controlGeneration: binding.controlGeneration + 1 },
  };
  const wrongAuthorityDecision = {
    ...decision,
    source: {
      ...decision.source,
      launchReceipt: {
        kind: 'launch_receipt',
        id: wrongAuthorityReceipt.receiptId,
        digest: canonicalDigest(wrongAuthorityReceipt),
      },
    },
  };
  assert.throws(() => validateRootDecision(wrongAuthorityDecision, {
    launchReceipt: wrongAuthorityReceipt,
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    expectedBinding: { ...binding, controlGeneration: 1 },
  }), protocolError('PROVENANCE_INVALID'));

  const declare = {
    schemaVersion: 1,
    rationale: 'Delegate.',
    kind: 'declare_assignments',
    assignments: [assignmentProposal()],
  };
  const missingDerived = {
    ...decision,
    proposal: declare,
    proposalDigest: canonicalDigest(declare),
  };
  assert.throws(() => validateRootDecision(missingDerived), protocolError('PROVENANCE_INVALID'));
});
