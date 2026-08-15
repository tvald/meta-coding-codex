import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  discoverImplementationRuns,
  openImplementationLedger,
  readRunStatus,
  replayRun,
} = await import('../lib/implementation-ledger.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');
const { notifyImplementationControlWake } =
  await import('../lib/implementation-control-wake.mjs');
import {
  canonicalDigest,
  canonicalJson,
  createRootLaunchIntent,
} from '../lib/implementation-protocol.mjs';
const {
  createImplementationRuntime,
  deriveImplementationRuntimeState,
} = await import('../lib/implementation-runtime.mjs');
const { planImplementationStart } = await import('../lib/implementation-supervisor.mjs');

const NOW = '2026-08-15T00:30:00Z';
const LATER = '2026-08-15T00:31:00Z';
const LATEST = '2026-08-15T00:32:00Z';
const oid = (character) => character.repeat(40);
const digest = (label) => canonicalDigest({ label });

function planInput() {
  return {
    command: {
      command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
      harness: 'codex', maxConcurrency: 2, shadow: false,
    },
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the bounded implementation runtime.',
      authority: 'User authorized T-0054.', route: 'initiative', risk: 'critical',
      gateDigest: digest('gate'), acceptance: [], nonGoals: [], assumptions: [],
      decisions: [], detailDigests: [], checkCatalogDigest: digest('checks'),
    },
    activeTaskId: 'T-0054',
    store: { storeId: 'task_store', storeGeneration: digest('store') },
    repository: {
      rootIdentity: digest('root'), objectFormat: 'sha1', baseCommit: oid('1'),
      head: oid('1'), tree: oid('2'), statusDigest: digest('status'),
      canonicalWorktreeIdentity: digest('worktree'),
    },
    provider: {
      adapter: 'codex_exec_v1', adapterVersion: '1.0.0', harness: 'codex',
      executableRealpath: '/opt/codex', executableVersion: '0.147.0',
    },
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0' },
    policies: {
      promptRegistry: digest('prompts'), checks: digest('checks'), resources: digest('resources'),
    },
    quota: { disposition: 'proceed' }, approvals: { current: true }, observedAt: NOW,
  };
}

function readyPlanInput() {
  const value = planInput();
  value.task.status = 'ready';
  value.task.recordVersion = 7;
  value.activeTaskId = null;
  return value;
}

function taskPortState({
  loseFirstResponse = false,
  losePostActivationObservation = false,
  conflict = null,
} = {}) {
  let task = conflict ?? {
    taskId: 'T-0054', taskRevision: 2, recordVersion: 7, status: 'ready',
  };
  const calls = [];
  let loseResponse = loseFirstResponse;
  let loseObservation = losePostActivationObservation;
  return {
    calls,
    current() { return { ...task }; },
    port: {
      async observeTask(request) {
        calls.push({ kind: 'observe', request: { ...request } });
        if (loseObservation && task.status === 'active') {
          loseObservation = false;
          throw new Error('activation observation lost');
        }
        return { ...task };
      },
      async activateTask(intent) {
        calls.push({ kind: 'activate', intent: { ...intent } });
        task = {
          taskId: intent.taskId,
          taskRevision: intent.taskRevision,
          recordVersion: intent.resultingRecordVersion,
          status: 'active',
        };
        if (loseResponse) {
          loseResponse = false;
          throw new Error('activation response lost');
        }
        return { ...task };
      },
    },
  };
}

function activation(common, plan) {
  const binding = {
    runId: plan.runId,
    epoch: 1,
    taskId: plan.capsule.taskId,
    taskRevision: plan.capsule.taskRevision,
    taskRecordVersion: plan.capsule.taskRecordVersion,
    capsuleDigest: canonicalDigest(plan.capsule),
    controlGeneration: 0,
    correctionGeneration: 0,
  };
  const receipt = {
    schemaVersion: 1,
    receiptId: 'activation_runtime_ledger',
    effectKind: 'ledger_write',
    binding,
    policyDigest: digest('activation-policy'),
    evidenceDigest: digest('activation-evidence'),
    mechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
    issuedAt: '2026-08-15T00:20:00Z',
    expiresAt: '2026-08-15T00:40:00Z',
    taskApproval: null,
  };
  return {
    gitCommonDirectory: common,
    receipt,
    current: {
      receiptId: receipt.receiptId,
      binding: { ...binding },
      policyDigest: receipt.policyDigest,
      evidenceDigest: receipt.evidenceDigest,
      mechanism: { ...receipt.mechanism },
      taskApproval: null,
    },
    now: NOW,
  };
}

async function fixture(t, publicationCut = null, clock = () => LATER, {
  input: providedInput = null,
  taskPort = null,
} = {}) {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-runtime-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const input = providedInput ?? planInput();
  const plan = planImplementationStart(input);
  const capability = issueSourceInstrumentedEffectCapability('journal_write');
  const ledger = await openImplementationLedger(common, {
    create: true,
    writeCapability: capability,
    hooks: publicationCut === null ? null : { publicationCut },
  });
  const runtime = createImplementationRuntime({ ledger, taskPort, clock });
  t.after(() => runtime.release(plan.runId).catch(() => {}));
  return { common, input, plan, ledger, runtime };
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function acceptedControlRecord(replay, request) {
  const id = `ctl_${canonicalDigest(request).slice(7, 31)}`;
  return replay.records.find((record) =>
    record.kind === 'detail' && record.id === id && record.version === 1);
}

function acceptedControlPath(common, runId, request) {
  const id = `ctl_${canonicalDigest(request).slice(7, 31)}`;
  return path.join(common, 'meta-framework', 'implementation', 'v1', 'runs', runId,
    'records', 'detail', id, '1.json');
}

function currentBinding(plan, state) {
  return Object.freeze({
    runId: plan.runId,
    epoch: state.snapshot.epoch,
    snapshotRevision: state.snapshot.revision,
    taskId: plan.capsule.taskId,
    taskRevision: plan.capsule.taskRevision,
    taskRecordVersion: state.snapshot.taskRecordVersion,
    capsuleDigest: canonicalDigest(plan.capsule),
    controlGeneration: state.snapshot.controlGeneration,
    correctionGeneration: state.snapshot.correctionGeneration,
  });
}

function ref(kind, id, value) {
  return Object.freeze({ kind, id, digest: canonicalDigest(value) });
}

function lifecycleEvent({ id, sequence, binding, kind, subject, payload = subject, observedAt = LATER }) {
  return Object.freeze({
    schemaVersion: 1,
    eventId: id,
    sequence,
    binding: Object.freeze({ ...binding }),
    kind,
    subject,
    causationId: null,
    correlationId: id,
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `lifecycle:${id}`,
    observedAt,
    payload,
  });
}

function orientationTransition(plan, state, id = 'orientation_runtime') {
  const value = {
    ...structuredClone(plan.orientation),
    binding: currentBinding(plan, state),
    snapshotDigest: canonicalDigest(state.snapshot),
  };
  const reference = ref('detail', id, value);
  return {
    record: { kind: 'detail', id, version: 1, value },
    event: lifecycleEvent({ id: 'event_orientation', sequence: state.snapshot.eventCursor + 1,
      binding: value.binding, kind: 'orientation_published', subject: reference }),
    ref: reference,
  };
}

function rootModelResult(proposal, decisionId, {
  orientationDigest = digest(`orientation ${decisionId}`),
  promptDigest = digest(`prompt ${decisionId}`),
  workerOverrides = {},
} = {}) {
  const worker = Object.freeze({
    schemaVersion: 1,
    disposition: 'completed',
    summary: `Root proposed ${proposal.kind}.`,
    changedPathsClaim: [], checks: [], findings: [], risks: [],
    knowledgeProposals: [], followUp: [],
    ...workerOverrides,
  });
  return Object.freeze({
    schemaVersion: 1,
    recordType: 'root_decision_result',
    worker,
    proposal,
    orientationDigest,
    promptDigest,
    rawResultDigest: digest(`raw result ${decisionId}`),
  });
}

function rootLaunchRequest({ binding, id, assignmentId, attemptId, requestId, ...overrides }) {
  return Object.freeze({
    schemaVersion: 1,
    requestId,
    jobId: `job_${id}`,
    binding,
    assignmentId,
    attemptId,
    role: 'root_decision',
    providerAdapter: 'codex_exec_v1',
    executableVersion: '0.147.0',
    cwdIdentity: digest(`cwd ${id}`),
    baseTree: oid('2'),
    profileDigest: digest(`profile ${id}`),
    promptDigest: digest(`prompt ${id}`),
    outputSchemaDigest: digest(`schema ${id}`),
    sandbox: 'read-only',
    approvalPolicy: 'never',
    network: false,
    nestedAgents: false,
    environmentDigest: digest(`environment ${id}`),
    deadlineAt: LATEST,
    ...overrides,
  });
}

function decisionTransition(plan, state, proposal, id, assignments = [], sourceAttempt = null) {
  const binding = currentBinding(plan, state);
  const fallbackOrientation = ref('detail', `orientation_${id}`, digest(`orientation ${id}`));
  const fallbackRequest = rootLaunchRequest({
    binding,
    id,
    assignmentId: `assignment_${id}`,
    attemptId: `attempt_${id}`,
    requestId: `request_${id}`,
  });
  const fallbackIntent = createRootLaunchIntent({
    request: fallbackRequest,
    orientation: fallbackOrientation,
  });
  const launchIntent = sourceAttempt?.launchIntent?.value ?? fallbackIntent;
  const launchIntentRef = sourceAttempt?.launchIntent?.ref ??
    ref('detail', `root_launch_${id}`, launchIntent);
  const modelResult = sourceAttempt?.result?.value ?? rootModelResult(proposal, id, {
    orientationDigest: launchIntent.orientationDigest,
    promptDigest: launchIntent.request.promptDigest,
  });
  const modelRef = sourceAttempt?.result?.ref ?? ref('model_result', `result_${id}`, modelResult);
  const launchReceipt = sourceAttempt?.terminalLaunch?.value ?? Object.freeze({
    schemaVersion: 1,
    receiptId: `launch_${id}`,
    recordVersion: 1,
    previousDigest: null,
    requestId: `request_${id}`,
    binding,
    launcherConnectionId: `launcher_${id}`,
    processDomainId: `process_${id}`,
    providerHandleRef: null,
    argvDigest: digest(`argv ${id}`),
    environmentDigest: digest(`environment ${id}`),
    startedAt: NOW,
    completedAt: LATER,
    exitCode: 0,
    signal: null,
    stdoutDigest: digest(`stdout ${id}`),
    stderrDigest: digest(`stderr ${id}`),
    modelResult: modelRef,
    outcome: 'exited',
  });
  const launchRef = ref('launch_receipt', launchReceipt.receiptId, launchReceipt);
  const assignmentRecords = assignments.map((value) => ({
    kind: 'assignment', id: value.assignmentId, version: 1, value,
  }));
  const assignmentRefs = assignments.map((value) => ref('assignment', value.assignmentId, value));
  const decision = Object.freeze({
    schemaVersion: 1,
    decisionId: id,
    binding,
    orientationDigest: launchIntent.orientationDigest,
    proposalDigest: canonicalDigest(proposal),
    source: { launchIntent: launchIntentRef, launchReceipt: launchRef, modelResult: modelRef },
    proposal,
    derivedAssignments: assignmentRefs,
    acceptedAt: LATER,
  });
  const decisionRef = ref('decision', id, decision);
  return {
    ref: decisionRef,
    records: [
      ...(sourceAttempt === null ? [
        { kind: 'detail', id: launchIntentRef.id, version: 1, value: launchIntent },
        { kind: 'model_result', id: modelRef.id, version: 1, value: modelResult },
        { kind: 'launch_receipt', id: launchRef.id, version: 1, value: launchReceipt },
      ] : []),
      ...assignmentRecords,
      { kind: 'decision', id, version: 1, value: decision },
    ],
    event: lifecycleEvent({ id: `event_${id}`, sequence: state.snapshot.eventCursor + 1,
      binding, kind: 'root_decision_accepted', subject: decisionRef }),
  };
}

function record(kind, id, value, { version = value.recordVersion ?? 1, publish = true } = {}) {
  return { kind, id, version, value, publish, ref: ref(kind, id, value) };
}

function attemptTransition(plan, state, attempt, previousAttempt, observation, evidence,
  additional = [], id = `${attempt.attemptId}_${attempt.recordVersion}`) {
  const attemptRecord = record('attempt', attempt.attemptId, attempt,
    { version: attempt.recordVersion });
  const detail = Object.freeze({
    schemaVersion: 1,
    recordType: 'attempt_transition',
    attempt: attemptRecord.ref,
    previousAttempt,
    observation,
    evidence: evidence.map(({ ref: reference }) => reference),
    observedAt: attempt.observedAt,
  });
  const detailRecord = record('detail', `transition_${id}`, detail);
  return {
    ref: attemptRecord.ref,
    detail: detailRecord,
    records: [
      ...additional,
      ...evidence.filter(({ publish }) => publish).map(({ ref: ignored, publish, ...specification }) =>
        specification),
      { kind: attemptRecord.kind, id: attemptRecord.id, version: attemptRecord.version,
        value: attemptRecord.value },
      { kind: detailRecord.kind, id: detailRecord.id, version: detailRecord.version,
        value: detailRecord.value },
    ],
    event: lifecycleEvent({ id: `event_${id}`, sequence: state.snapshot.eventCursor + 1,
      binding: currentBinding(plan, state), kind: 'attempt_transition', subject: attemptRecord.ref,
      payload: detailRecord.ref, observedAt: attempt.observedAt }),
  };
}

function processReceiptFor(attempt, binding, id, {
  state = 'empty', descendantsComplete = true, action = 'observe', observedAt = LATEST,
} = {}) {
  return Object.freeze({
    schemaVersion: 1,
    receiptId: id,
    binding,
    attemptId: attempt.attemptId,
    requestId: attempt.launchRequestId,
    launcherConnectionId: `launcher_${attempt.attemptId}`,
    processDomainId: attempt.processDomainId,
    processIdentityDigest: digest(`process identity ${attempt.attemptId}`),
    action,
    state,
    descendantsComplete,
    membersDigest: digest(`process members ${id}`),
    evidence: [],
    observedAt,
  });
}

async function driveAttempt(runtime, plan, state, id, target = 'terminal_observed',
  resultOverride = null, rootContext = null) {
  let binding = currentBinding(plan, state);
  const attemptId = `attempt_${id}`;
  const assignmentId = `assignment_${id}`;
  const rootAssignment = rootContext === null ? null : Object.freeze({
    schemaVersion: 1,
    assignmentId,
    generation: 1,
    binding,
    sourceDecisionId: null,
    sourceProposalId: null,
    role: 'root_decision',
    profileDigest: digest(`profile ${rootContext.decisionId}`),
    goal: 'Make one exact Root decision.',
    scope: [],
    nonGoals: [],
    dependencies: [],
    ownership: { writePaths: [], readPaths: [] },
    resources: [],
    baseCandidateId: 'candidate_base',
    baseTree: plan.manifest.repository.baseTree,
    permissions: { sandbox: 'read-only', network: false,
      approvalPolicy: 'never', nestedAgents: false },
    checks: [],
    deadlineAt: LATEST,
    restartPolicy: 'never',
  });
  const assignmentRecord = rootAssignment === null
    ? null
    : record('assignment', assignmentId, rootAssignment);
  const base = {
    schemaVersion: 1,
    attemptId,
    assignmentId,
    attemptNumber: 1,
    binding,
    workspace: { workspaceId: `workspace_${id}`, rootIdentity: digest(`workspace ${id}`),
      kind: 'isolated_clone', baseTree: plan.manifest.repository.baseTree },
    launchRequestId: null,
    processDomainId: null,
    result: null,
    candidateId: null,
    observedAt: LATEST,
    terminalReason: null,
  };
  let attempt = Object.freeze({ ...base, recordVersion: 1, previousDigest: null,
    state: 'allocated' });
  const allocationReceipt = Object.freeze({
    schemaVersion: 1,
    receiptId: `workspace_allocate_${id}`,
    binding,
    attemptId,
    resourceKey: `workspace:${attempt.workspace.workspaceId}`,
    action: 'allocate',
    ownershipTokenDigest: attempt.workspace.rootIdentity,
    observedIdentityDigest: attempt.workspace.rootIdentity,
    outcome: 'succeeded',
    evidence: [],
    observedAt: LATEST,
  });
  const allocationReceiptRecord = record('resource_receipt', allocationReceipt.receiptId,
    allocationReceipt);
  const allocationOperation = Object.freeze({
    schemaVersion: 1,
    operationId: `operation_allocate_${id}`,
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: `allocate_workspace:${id}`,
    kind: 'allocate_workspace',
    subject: assignmentRecord?.ref ??
      { kind: 'assignment', id: assignmentId, digest: digest(`assignment ${id}`) },
    binding,
    inputDigest: digest(`allocation input ${id}`),
    expected: [],
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: allocationReceiptRecord.ref,
    observedAt: LATEST,
    failureCode: null,
  });
  let transition = attemptTransition(plan, state, attempt, null, 'workspace_allocated', [
    record('operation', allocationOperation.operationId, allocationOperation),
    allocationReceiptRecord,
  ], assignmentRecord === null ? [] : [{
    kind: assignmentRecord.kind, id: assignmentRecord.id, version: assignmentRecord.version,
    value: assignmentRecord.value,
  }], `${id}_allocated`);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  let previousRef = transition.ref;
  if (target === 'allocated') return { state, attempt, ref: previousRef };

  binding = currentBinding(plan, state);
  attempt = Object.freeze({ ...attempt, recordVersion: 2, previousDigest: previousRef.digest,
    binding, state: 'launch_intended', launchRequestId: `request_${id}`,
    processDomainId: `process_${id}` });
  const rootRequest = rootContext === null ? null : rootLaunchRequest({
    binding,
    id: rootContext.decisionId,
    assignmentId,
    attemptId,
    requestId: attempt.launchRequestId,
    cwdIdentity: attempt.workspace.rootIdentity,
    ...rootContext.requestOverrides,
  });
  const rootIntent = rootRequest === null ? null : createRootLaunchIntent({
    request: rootRequest,
    orientation: rootContext.orientation.ref,
  });
  const rootIntentRecord = rootIntent === null
    ? null
    : record('detail', `root_launch_${id}`, rootIntent);
  const launchOperation = Object.freeze({ ...allocationOperation,
    operationId: `operation_launch_${id}`, idempotencyKey: `launch_job:${id}`,
    kind: 'launch_job', binding,
    inputDigest: rootIntent?.requestDigest ?? digest(`launch input ${id}`),
    expected: rootIntentRecord === null
      ? []
      : [assignmentRecord.ref, previousRef, rootIntentRecord.ref],
    state: 'intended', attemptNumber: 0, receipt: null });
  transition = attemptTransition(plan, state, attempt, previousRef, 'launch_intended',
    [record('operation', launchOperation.operationId, launchOperation),
      ...(rootIntentRecord === null ? [] : [rootIntentRecord])], [], `${id}_intended`);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  if (target === 'launch_intended') return { state, attempt, ref: previousRef };

  binding = currentBinding(plan, state);
  attempt = Object.freeze({ ...attempt, recordVersion: 3, previousDigest: previousRef.digest,
    binding, state: 'running' });
  const runningProcess = processReceiptFor(attempt, binding, `process_running_${id}`,
    { state: 'running', descendantsComplete: false });
  const runningProcessRecord = record('process_receipt', runningProcess.receiptId, runningProcess);
  const runningLaunch = Object.freeze({
    schemaVersion: 1,
    receiptId: `launch_${id}`,
    recordVersion: 1,
    previousDigest: null,
    requestId: attempt.launchRequestId,
    binding,
    launcherConnectionId: runningProcess.launcherConnectionId,
    processDomainId: attempt.processDomainId,
    providerHandleRef: runningProcessRecord.ref,
    argvDigest: digest(`argv ${id}`),
    environmentDigest: rootRequest?.environmentDigest ?? digest(`environment ${id}`),
    startedAt: NOW,
    completedAt: null,
    exitCode: null,
    signal: null,
    stdoutDigest: digest(`stdout ${id}`),
    stderrDigest: digest(`stderr ${id}`),
    modelResult: null,
    outcome: 'running',
  });
  const runningLaunchRecord = record('launch_receipt', runningLaunch.receiptId, runningLaunch);
  transition = attemptTransition(plan, state, attempt, previousRef, 'process_running',
    [runningLaunchRecord, runningProcessRecord], [], `${id}_running`);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  if (target === 'running') {
    return { state, attempt, ref: previousRef, runningProcess, runningLaunch };
  }

  binding = currentBinding(plan, state);
  const result = resultOverride ?? Object.freeze({ schemaVersion: 1, disposition: 'completed',
    summary: `Attempt ${id} completed.`, changedPathsClaim: [], checks: [], findings: [],
    risks: [], knowledgeProposals: [], followUp: [] });
  const resultRecord = record('model_result', `result_${id}`, result);
  attempt = Object.freeze({ ...attempt, recordVersion: 4, previousDigest: previousRef.digest,
    binding, state: 'terminal_observed', result: resultRecord.ref,
    terminalReason: 'provider_exited' });
  const terminalProcess = processReceiptFor(attempt, binding, `process_terminal_${id}`);
  const terminalProcessRecord = record('process_receipt', terminalProcess.receiptId, terminalProcess);
  const terminalLaunch = Object.freeze({ ...runningLaunch,
    recordVersion: 2,
    previousDigest: canonicalDigest(runningLaunch),
    binding,
    providerHandleRef: terminalProcessRecord.ref,
    completedAt: LATEST,
    exitCode: 0,
    modelResult: resultRecord.ref,
    outcome: 'exited',
  });
  const terminalLaunchRecord = record('launch_receipt', terminalLaunch.receiptId, terminalLaunch,
    { version: 2 });
  transition = attemptTransition(plan, state, attempt, previousRef, 'process_terminal',
    [terminalLaunchRecord, terminalProcessRecord], [{ kind: resultRecord.kind,
      id: resultRecord.id, version: resultRecord.version, value: resultRecord.value }],
  `${id}_terminal`);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  return { state, attempt, ref: transition.ref, result: resultRecord,
    launchIntent: rootIntentRecord,
    runningProcess, runningLaunch, terminalProcess: terminalProcessRecord,
    terminalLaunch: terminalLaunchRecord, allocationReceipt };
}

function driveRootAttempt(runtime, plan, state, id, proposal, decisionId, orientation) {
  return driveAttempt(runtime, plan, state, id, 'terminal_observed',
    rootModelResult(proposal, decisionId, {
      orientationDigest: orientation.ref.digest,
      promptDigest: digest(`prompt ${decisionId}`),
    }), { decisionId, orientation });
}

test('start publishes the causal preflight sequence and replay derives ready state', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  const started = await runtime.start(input);
  assert.equal(started.runId, plan.runId);
  assert.equal(started.state.snapshot.phase, 'dormant');
  assert.equal(started.state.snapshot.revision, 2);
  assert.equal(started.state.snapshot.eventCursor, 1);

  const durable = await replayRun(ledger, plan.runId);
  assert.equal(durable.events.length, 1);
  assert.equal(durable.events[0].value.kind, 'snapshot_published');
  assert.equal(durable.events[0].value.binding.snapshotRevision, 1);
  assert.equal((await runtime.doctor(plan.runId)).ok, true);

  const repeated = await runtime.start(input);
  assert.equal(repeated.state.snapshot.revision, 2);
  assert.equal((await replayRun(ledger, plan.runId)).events.length, 1);
});

test('Ready start journals activation before mutation and publishes receipt, Operation v2, and event before cache', async (t) => {
  const tasks = taskPortState();
  const input = readyPlanInput();
  const { plan, ledger, runtime } = await fixture(t, null, () => LATER, {
    input,
    taskPort: tasks.port,
  });
  const started = await runtime.start(input);
  assert.equal(started.runId, plan.runId);
  assert.equal(started.state.snapshot.phase, 'dormant');
  assert.equal(started.state.snapshot.revision, 2);
  assert.deepEqual(tasks.calls.map(({ kind }) => kind), ['observe', 'activate', 'observe']);
  assert.deepEqual(tasks.current(), {
    taskId: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
  });

  const durable = await replayRun(ledger, plan.runId);
  const operations = durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task');
  assert.deepEqual(operations.map(({ version, value }) => [version, value.state]), [
    [1, 'intended'],
    [2, 'observed_succeeded'],
  ]);
  assert.equal(operations[1].value.previousDigest, operations[0].digest);
  assert.equal(operations[1].value.receipt.kind, 'detail');
  assert.equal(durable.events.length, 1);
  assert.equal(durable.events[0].value.kind, 'operation_transition');
  assert.equal(durable.events[0].value.subject.digest, operations[1].digest);
  assert.deepEqual(started.state.snapshot.operations, [durable.events[0].value.subject]);
  const status = await readRunStatus(ledger, plan.runId);
  assert.equal(status.snapshot.revision, 2);
  assert.equal(status.snapshot.eventCursor, 1);
});

test('Ready start retries the same durable activation after a crash publishing Operation v1', async (t) => {
  const tasks = taskPortState();
  const input = readyPlanInput();
  const value = await fixture(t, (cut, details) => {
    if (cut === 'after-directory-sync' &&
        details.label === 'operation record activate_task version 1') {
      throw new Error('cut:activation-operation-v1');
    }
  }, () => LATER, { input, taskPort: tasks.port });
  await assert.rejects(value.runtime.start(input), /cut:activation-operation-v1/u);
  assert.deepEqual(tasks.calls, []);
  let durable = await replayRun(value.ledger, value.plan.runId);
  assert.equal(durable.events.length, 0);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1]);

  const recovered = await value.runtime.start(input);
  assert.equal(recovered.state.snapshot.phase, 'dormant');
  durable = await replayRun(value.ledger, value.plan.runId);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1, 2]);
  assert.equal(durable.events.length, 1);
});

test('activation response loss is recovered by the mandatory postcondition observation', async (t) => {
  const tasks = taskPortState({ loseFirstResponse: true });
  const input = readyPlanInput();
  const value = await fixture(t, null, () => LATER, { input, taskPort: tasks.port });
  const started = await value.runtime.start(input);
  assert.equal(started.runId, value.plan.runId);
  assert.equal(started.state.snapshot.phase, 'dormant');
  assert.deepEqual(tasks.calls.map(({ kind }) => kind), ['observe', 'activate', 'observe']);
  const durable = await replayRun(value.ledger, value.plan.runId);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1, 2]);
  assert.equal(durable.events.length, 1);
});

test('post-mutation observation loss reuses the pre-mutation run across an Active replan', async (t) => {
  const tasks = taskPortState({
    loseFirstResponse: true,
    losePostActivationObservation: true,
  });
  const input = readyPlanInput();
  const value = await fixture(t, null, () => LATER, { input, taskPort: tasks.port });
  await assert.rejects(value.runtime.start(input), /activation observation lost/u);
  assert.equal(tasks.current().status, 'active');
  let durable = await replayRun(value.ledger, value.plan.runId);
  assert.equal(durable.events.length, 0);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1]);

  const activeInput = planInput();
  activeInput.store.storeGeneration = digest('store after activation');
  activeInput.observedAt = LATEST;
  const postMutationPlan = planImplementationStart(activeInput);
  assert.notEqual(postMutationPlan.runId, value.plan.runId);
  const recovered = await value.runtime.start(activeInput);
  assert.equal(recovered.disposition, 'activation_recovered');
  assert.equal(recovered.runId, value.plan.runId);
  assert.equal(recovered.created, false);
  assert.deepEqual(tasks.calls.map(({ kind }) => kind), [
    'observe', 'activate', 'observe', 'observe',
  ]);
  assert.deepEqual((await discoverImplementationRuns(value.ledger, { taskId: 'T-0054' }))
    .map(({ runId }) => runId), [value.plan.runId]);
  durable = await replayRun(value.ledger, value.plan.runId);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1, 2]);
  assert.equal(durable.events.length, 1);
  assert.equal(recovered.state.snapshot.phase, 'dormant');
});

test('Ready activation conflict preserves the intended operation and emits no causal event or cache', async (t) => {
  const tasks = taskPortState({ conflict: {
    taskId: 'T-0054', taskRevision: 2, recordVersion: 9, status: 'active',
  } });
  const input = readyPlanInput();
  const value = await fixture(t, null, () => LATER, { input, taskPort: tasks.port });
  await assert.rejects(value.runtime.start(input), (error) =>
    error?.code === 'TASK_ACTIVATION_CONFLICT' && error.reconciliationRequired === true);
  assert.deepEqual(tasks.calls.map(({ kind }) => kind), ['observe']);
  const durable = await replayRun(value.ledger, value.plan.runId);
  assert.equal(durable.events.length, 0);
  assert.deepEqual(durable.records.filter(({ kind, id }) =>
    kind === 'operation' && id === 'activate_task').map(({ version }) => version), [1]);
  const status = await readRunStatus(value.ledger, value.plan.runId);
  assert.equal(status.snapshot, null);
});

test('a crash after the causal event leaves detectable cache lag and retry repairs it', async (t) => {
  let snapshotStages = 0;
  let cutEnabled = true;
  const value = await fixture(t, (cut, details) => {
    if (cutEnabled && cut === 'after-stage-sync' && details.label === 'run snapshot' &&
        ++snapshotStages === 2) {
      throw new Error('cut:ready-cache');
    }
  });
  await assert.rejects(value.runtime.start(value.input), /cut:ready-cache/u);
  const lagged = await value.runtime.doctor(value.plan.runId);
  assert.equal(lagged.ok, false);
  assert.deepEqual(lagged.issues, ['cache_lag_or_divergence']);
  assert.equal(lagged.derived.revision, 2);
  assert.equal(lagged.cached.revision, 1);

  cutEnabled = false;
  const resumed = await value.runtime.start(value.input);
  assert.equal(resumed.state.snapshot.revision, 2);
  assert.equal((await value.runtime.doctor(value.plan.runId)).ok, true);
});

test('controls use generation CAS, stop dominates competitors, and acceptance is idempotent', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  await runtime.start(input);
  await runtime.publishResumeRequest({
    runId: plan.runId,
    requestId: 'resume_competing',
    expectedEpoch: 1,
    expectedControlGeneration: 0,
  });
  await runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_dominant',
    expectedControlGeneration: 0,
    reason: 'Checkpoint before another effect.',
  });
  await assert.rejects(runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_future',
    expectedControlGeneration: 1,
    reason: 'Stale generation.',
  }), hasCode('CONTROL_STALE'));

  const accepted = await runtime.acceptControls({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(accepted.requestId, 'stop_dominant');
  assert.equal(accepted.state.snapshot.phase, 'stopping');
  assert.equal(accepted.state.snapshot.controlGeneration, 1);
  assert.equal(accepted.state.snapshot.stop.requested, true);

  const repeated = await runtime.acceptControls({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(repeated.disposition, 'quiesced');
  assert.equal(repeated.state.acceptedControls.length, 1);
  assert.deepEqual(repeated.state.pendingControls.map(({ requestId }) => requestId),
    ['resume_competing']);
});

test('control wait registers before replay and resolves only a durable current-generation request', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  await runtime.start(input);
  const controller = new AbortController();
  const waiting = runtime.waitForControl({
    runId: plan.runId,
    expectedEpoch: 1,
    expectedControlGeneration: 0,
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const status = await readRunStatus(ledger, plan.runId);
  assert.equal(status.lock.state, 'owned');
  await notifyImplementationControlWake({
    ledgerRootIdentity: ledger.rootIdentity,
    runId: plan.runId,
    lockToken: status.lock.owner.token,
    epoch: status.lock.owner.epoch,
    requestId: 'stop_spurious_hint',
  });

  const published = await runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_durable_wake',
    expectedControlGeneration: 0,
    reason: 'Wake only after durable replay sees this request.',
  });
  await notifyImplementationControlWake({
    ledgerRootIdentity: ledger.rootIdentity,
    runId: plan.runId,
    lockToken: status.lock.owner.token,
    epoch: status.lock.owner.epoch,
    requestId: published.request.requestId,
  });
  const observed = await waiting;
  assert.equal(observed.disposition, 'control_observed');
  assert.deepEqual(observed.request, published.request);
});

test('control wait observes already-durable controls and supports bounded cancellation', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  await runtime.start(input);
  const published = await runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_before_wait',
    expectedControlGeneration: 0,
    reason: 'Replay must close the pre-notification race.',
  });
  assert.deepEqual((await runtime.waitForControl({
    runId: plan.runId,
    expectedEpoch: 1,
    expectedControlGeneration: 0,
  })).request, published.request);

  await runtime.acceptControls({ runId: plan.runId, expectedEpoch: 1 });
  const controller = new AbortController();
  const waiting = runtime.waitForControl({
    runId: plan.runId,
    expectedEpoch: 1,
    expectedControlGeneration: 1,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(waiting, hasCode('CONTROL_WAIT_ABORTED'));
});

for (const cutPoint of ['after-publication', 'after-directory-sync']) {
  test(`stop retry reuses durable accepted-control detail after ${cutPoint}`, async (t) => {
    let cutEnabled = false;
    let currentTime = LATER;
    const value = await fixture(t, (cut, details) => {
      if (cutEnabled && cut === cutPoint && details.label.startsWith('detail record ctl_')) {
        throw new Error(`cut:accepted-control-detail:${cutPoint}`);
      }
    }, () => currentTime);
    await value.runtime.start(value.input);
    const published = await value.runtime.publishStopRequest({
      runId: value.plan.runId,
      requestId: `stop_detail_${cutPoint.replaceAll('-', '_')}`,
      expectedControlGeneration: 0,
      reason: 'Recover the missing stop event.',
    });

    cutEnabled = true;
    await assert.rejects(value.runtime.acceptControls({
      runId: value.plan.runId, expectedEpoch: 1,
    }), new RegExp(`cut:accepted-control-detail:${cutPoint}`, 'u'));
    const afterCut = await replayRun(value.ledger, value.plan.runId);
    const detail = acceptedControlRecord(afterCut, published.request);
    assert.equal(detail.value.acceptedAt, LATER);
    assert.equal(afterCut.events.filter(({ value: event }) =>
      event.kind === 'control_accepted').length, 0);

    cutEnabled = false;
    currentTime = LATEST;
    const recovered = await value.runtime.acceptControls({
      runId: value.plan.runId, expectedEpoch: 1,
    });
    assert.equal(recovered.disposition, 'accepted');
    assert.equal(recovered.state.snapshot.phase, 'stopping');
    const durable = await replayRun(value.ledger, value.plan.runId);
    const details = durable.records.filter(({ kind, id }) =>
      kind === 'detail' && id === detail.id);
    assert.equal(details.length, 1);
    assert.equal(details[0].digest, detail.digest);
    const event = durable.events.find(({ value }) => value.kind === 'control_accepted').value;
    assert.equal(event.observedAt, LATER);
    assert.deepEqual(event.payload, { kind: 'detail', id: detail.id, digest: detail.digest });
  });
}

test('resume retry reuses its durable acceptance time after rotating the lock epoch', async (t) => {
  let cutEnabled = false;
  let currentTime = LATER;
  const value = await fixture(t, (cut, details) => {
    if (cutEnabled && cut === 'after-directory-sync' &&
        details.label.startsWith('detail record ctl_')) {
      throw new Error('cut:accepted-resume-detail');
    }
  }, () => currentTime);
  await value.runtime.start(value.input);
  await value.runtime.publishStopRequest({
    runId: value.plan.runId,
    requestId: 'stop_before_resume_cut',
    expectedControlGeneration: 0,
    reason: 'Prepare the resume recovery fixture.',
  });
  await value.runtime.acceptControls({ runId: value.plan.runId, expectedEpoch: 1 });
  const published = await value.runtime.publishResumeRequest({
    runId: value.plan.runId,
    requestId: 'resume_detail_cut',
    expectedEpoch: 1,
    expectedControlGeneration: 1,
  });

  cutEnabled = true;
  await assert.rejects(value.runtime.acceptControls({
    runId: value.plan.runId, expectedEpoch: 1,
  }), /cut:accepted-resume-detail/u);
  const afterCut = await replayRun(value.ledger, value.plan.runId);
  const detail = acceptedControlRecord(afterCut, published.request);
  assert.equal(detail.value.acceptedAt, LATER);
  assert.equal((await value.runtime.doctor(value.plan.runId)).lock.owner.epoch, 2);

  cutEnabled = false;
  currentTime = LATEST;
  const recovered = await value.runtime.acceptControls({
    runId: value.plan.runId, expectedEpoch: 1,
  });
  assert.equal(recovered.state.snapshot.epoch, 2);
  assert.equal(recovered.state.snapshot.controlGeneration, 2);
  const durable = await replayRun(value.ledger, value.plan.runId);
  const details = durable.records.filter(({ kind, id }) =>
    kind === 'detail' && id === detail.id);
  assert.equal(details.length, 1);
  assert.equal(details[0].digest, detail.digest);
  const event = durable.events.find(({ value }) =>
    value.correlationId === published.request.requestId).value;
  assert.equal(event.observedAt, LATER);
});

test('a conflicting durable accepted-control detail reconciles instead of being replaced', async (t) => {
  let cutEnabled = false;
  const value = await fixture(t, (cut, details) => {
    if (cutEnabled && cut === 'after-directory-sync' &&
        details.label.startsWith('detail record ctl_')) {
      throw new Error('cut:tamper-detail');
    }
  });
  await value.runtime.start(value.input);
  const published = await value.runtime.publishStopRequest({
    runId: value.plan.runId,
    requestId: 'stop_tampered_detail',
    expectedControlGeneration: 0,
    reason: 'The durable reason must remain exact.',
  });
  cutEnabled = true;
  await assert.rejects(value.runtime.acceptControls({
    runId: value.plan.runId, expectedEpoch: 1,
  }), /cut:tamper-detail/u);
  cutEnabled = false;

  const replay = await replayRun(value.ledger, value.plan.runId);
  const record = acceptedControlRecord(replay, published.request);
  const tampered = { ...record.value, reasonDigest: digest('different reason') };
  await fs.writeFile(acceptedControlPath(value.common, value.plan.runId, published.request),
    canonicalJson(tampered));
  await assert.rejects(value.runtime.acceptControls({
    runId: value.plan.runId, expectedEpoch: 1,
  }), (error) => error?.code === 'CONTROL_DETAIL_CONFLICT' &&
    error.reconciliationRequired === true);
  assert.equal((await replayRun(value.ledger, value.plan.runId)).events.filter(({ value: event }) =>
    event.kind === 'control_accepted').length, 0);
});

test('runUntilQuiescent accepts a pending stop and settles without model effects or polling', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  await runtime.start(input);
  await runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_loop',
    expectedControlGeneration: 0,
    reason: 'Stop at the next safe boundary.',
  });
  const settled = await runtime.runUntilQuiescent({
    runId: plan.runId,
    expectedEpoch: 1,
    maximumTransitions: 4,
  });
  assert.equal(settled.disposition, 'stopping');
  assert.equal(settled.transitions, 1);
  assert.equal(settled.state.snapshot.controlGeneration, 1);
  assert.equal(settled.state.snapshot.stop.requested, true);
  assert.equal((await runtime.doctor(plan.runId)).ok, true);
});

test('resume persists both CAS inputs across restart, rotates epoch, and explicitly clears stop', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  await runtime.start(input);
  await runtime.publishStopRequest({
    runId: plan.runId,
    requestId: 'stop_first',
    expectedControlGeneration: 0,
    reason: 'Checkpoint now.',
  });
  await runtime.acceptControls({ runId: plan.runId, expectedEpoch: 1 });

  await assert.rejects(runtime.publishResumeRequest({
    runId: plan.runId,
    requestId: 'resume_wrong_epoch',
    expectedEpoch: 2,
    expectedControlGeneration: 1,
  }), hasCode('CONTROL_STALE'));
  await assert.rejects(runtime.publishResumeRequest({
    runId: plan.runId,
    requestId: 'resume_wrong_generation',
    expectedEpoch: 1,
    expectedControlGeneration: 0,
  }), hasCode('CONTROL_STALE'));
  const published = await runtime.publishResumeRequest({
    runId: plan.runId,
    requestId: 'resume_exact',
    expectedEpoch: 1,
    expectedControlGeneration: 1,
  });
  assert.equal(published.expectedEpoch, 1);
  assert.equal(published.request.expectedControlGeneration, 1);
  assert.equal(published.intentRef.kind, 'detail');

  await runtime.release(plan.runId);
  const restarted = createImplementationRuntime({ ledger, clock: () => LATER });
  t.after(() => restarted.release(plan.runId).catch(() => {}));
  const accepted = await restarted.acceptControls({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(accepted.state.snapshot.epoch, 2);
  assert.equal(accepted.state.snapshot.controlGeneration, 2);
  assert.equal(accepted.state.snapshot.phase, 'dormant');
  assert.deepEqual(accepted.state.snapshot.stop,
    { requested: false, mode: null, reasonDigest: null });
  assert.equal((await restarted.doctor(plan.runId)).lock.owner.epoch, 2);
});

test('a repeated observation resolves to the existing nonterminal run for the same task', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  await runtime.start(input);
  await runtime.release(plan.runId);
  const different = structuredClone(input);
  different.observedAt = '2026-08-15T00:30:01Z';
  const repeated = await runtime.start(different);
  assert.equal(repeated.disposition, 'already_started');
  assert.equal(repeated.runId, plan.runId);
});

test('an exact duplicate start is read-only when the original runtime released its lock', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  await runtime.start(input);
  await runtime.release(plan.runId);
  const restarted = createImplementationRuntime({ ledger, clock: () => LATER });
  const duplicate = await restarted.start(input);
  assert.equal(duplicate.disposition, 'already_started');
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.lock.held, false);
  assert.equal((await replayRun(ledger, plan.runId)).events.length, 1);
});

test('fresh runtime attaches only to an unlocked exact epoch and paginates durable lifecycle evidence', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  const started = await runtime.start(input);
  const binding = currentBinding(plan, started.state);
  const operation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_rehydrate',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'rehydrate:operation',
    kind: 'launch_job',
    subject: ref('detail', 'snapshot_1', {
      schemaVersion: 1, recordType: 'snapshot_publication', snapshotRevision: 1,
      snapshotDigest: canonicalDigest(plan.initialSnapshot),
    }),
    binding,
    inputDigest: digest('rehydrate input'),
    expected: [],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATER,
    failureCode: null,
  });
  const journal = runtime.pipelineJournal({ runId: plan.runId, expectedBinding: binding });
  await journal.publish('operation', operation.operationId, operation);
  const startedOperation = Object.freeze({ ...operation, recordVersion: 2,
    previousDigest: canonicalDigest(operation), state: 'started', attemptNumber: 1 });
  await journal.publish('operation', operation.operationId, startedOperation);
  await runtime.release(plan.runId);

  const restarted = createImplementationRuntime({ ledger, clock: () => LATEST });
  t.after(() => restarted.release(plan.runId).catch(() => {}));
  const attached = await restarted.attachExisting({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(attached.disposition, 'attached');
  assert.equal(attached.state.snapshot.phase, 'dormant');
  const first = await restarted.readLifecycle({ runId: plan.runId, limit: 1 });
  assert.equal(first.records.length, 1);
  assert.notEqual(first.next, null);
  const second = await restarted.readLifecycle({ runId: plan.runId, after: first.next, limit: 128 });
  assert.equal([...first.records, ...second.records].some(({ kind, id }) =>
    kind === 'operation' && id === operation.operationId), true);
  assert.equal(first.authority.capsuleDigest, canonicalDigest(plan.capsule));

  const competitor = createImplementationRuntime({ ledger, clock: () => LATEST });
  await assert.rejects(competitor.attachExisting({ runId: plan.runId, expectedEpoch: 1 }),
    hasCode('LOCK_REQUIRED'));
});

test('fresh attachment repairs a corrupt derived cache from immutable replay', async (t) => {
  const { common, input, plan, ledger, runtime } = await fixture(t);
  const started = await runtime.start(input);
  await runtime.release(plan.runId);
  const snapshotPath = path.join(common, 'meta-framework', 'implementation', 'v1', 'runs',
    plan.runId, 'snapshot.json');
  await fs.writeFile(snapshotPath, '{"schemaVersion":1', { mode: 0o600 });
  assert.equal((await readRunStatus(ledger, plan.runId)).state, 'reconciliation_required');

  const restarted = createImplementationRuntime({ ledger, clock: () => LATEST });
  t.after(() => restarted.release(plan.runId).catch(() => {}));
  const attached = await restarted.attachExisting({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(attached.disposition, 'attached');
  assert.deepEqual(attached.state.snapshot, started.state.snapshot);
  const repaired = await readRunStatus(ledger, plan.runId);
  assert.equal(repaired.state, 'nonterminal');
  assert.deepEqual(repaired.snapshot, started.state.snapshot);
});

test('fresh attachment replaces a valid but divergent derived cache', async (t) => {
  const { common, input, plan, ledger, runtime } = await fixture(t);
  const started = await runtime.start(input);
  await runtime.release(plan.runId);
  const snapshotPath = path.join(common, 'meta-framework', 'implementation', 'v1', 'runs',
    plan.runId, 'snapshot.json');
  const divergent = { ...structuredClone(started.state.snapshot), phase: 'waiting' };
  await fs.writeFile(snapshotPath, canonicalJson(divergent), { mode: 0o600 });
  const before = await readRunStatus(ledger, plan.runId);
  assert.equal(before.state, 'nonterminal');
  assert.equal(before.snapshot.phase, 'waiting');

  const restarted = createImplementationRuntime({ ledger, clock: () => LATEST });
  t.after(() => restarted.release(plan.runId).catch(() => {}));
  const attached = await restarted.attachExisting({ runId: plan.runId, expectedEpoch: 1 });
  assert.deepEqual(attached.state.snapshot, started.state.snapshot);
  assert.deepEqual((await readRunStatus(ledger, plan.runId)).snapshot, started.state.snapshot);
});

test('wait decision and durable due wake recover across event and record crash cuts', async (t) => {
  let failure = null;
  const value = await fixture(t, (cut, details) => {
    if (cut !== 'after-directory-sync') return;
    if (failure === 'wait_event' && details.label === 'event 7') throw new Error('cut:wait-event');
    if (failure === 'wake_record' && details.label === 'detail record wake_recovered version 1') {
      throw new Error('cut:wake-record');
    }
  });
  let state = (await value.runtime.start(value.input)).state;
  const orientation = orientationTransition(value.plan, state, 'orientation_wait');
  state = (await value.runtime.commitTransition({ runId: value.plan.runId,
    expectedBinding: currentBinding(value.plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const waitProposal = Object.freeze({ schemaVersion: 1, rationale: 'Sleep without polling.',
    kind: 'wait', reasonCode: 'stable_wait', wakeOn: ['deadline_due'], deadlineAt: NOW });
  const waitSource = await driveRootAttempt(value.runtime, value.plan, state,
    'decision_wait_source', waitProposal, 'decision_wait_recovery', orientation);
  state = waitSource.state;
  const wait = decisionTransition(value.plan, state, waitProposal, 'decision_wait_recovery',
    [], waitSource);
  const waitBinding = currentBinding(value.plan, state);
  failure = 'wait_event';
  await assert.rejects(value.runtime.commitTransition({ runId: value.plan.runId,
    expectedBinding: waitBinding, records: wait.records, event: wait.event }), /cut:wait-event/u);
  failure = null;
  const recoveredWait = await value.runtime.commitTransition({ runId: value.plan.runId,
    expectedBinding: waitBinding, records: wait.records, event: wait.event });
  assert.equal(recoveredWait.disposition, 'recovered');
  assert.equal(recoveredWait.state.snapshot.phase, 'waiting');

  await value.runtime.release(value.plan.runId);
  const restarted = createImplementationRuntime({ ledger: value.ledger, clock: () => LATEST });
  t.after(() => restarted.release(value.plan.runId).catch(() => {}));
  state = (await restarted.attachExisting({ runId: value.plan.runId, expectedEpoch: 1 })).state;
  const binding = currentBinding(value.plan, state);
  const wake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['deadline_due', 'provider_result'], deadlineAt: NOW, observedAt: LATEST });
  const wakeRef = ref('detail', 'wake_recovered', wake);
  const wakeEvent = lifecycleEvent({ id: 'event_wake_recovered',
    sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due', subject: wakeRef,
    observedAt: LATEST });
  failure = 'wake_record';
  await assert.rejects(restarted.commitTransition({ runId: value.plan.runId,
    expectedBinding: binding, records: [{ kind: 'detail', id: wakeRef.id, version: 1, value: wake }],
    event: wakeEvent }), /cut:wake-record/u);
  failure = null;
  const recoveredWake = await restarted.commitTransition({ runId: value.plan.runId,
    expectedBinding: binding, records: [{ kind: 'detail', id: wakeRef.id, version: 1, value: wake }],
    event: wakeEvent });
  assert.equal(recoveredWake.state.snapshot.phase, 'dormant');
  assert.deepEqual(recoveredWake.state.snapshot.pendingWakeReasons,
    ['deadline_due', 'provider_result']);
});

test('Root decision rejects standalone launch and result evidence without a proved-empty attempt',
  async (t) => {
    const { input, plan, ledger, runtime } = await fixture(t);
    let state = (await runtime.start(input)).state;
    const orientation = orientationTransition(plan, state, 'orientation_unproved_root');
    state = (await runtime.commitTransition({ runId: plan.runId,
      expectedBinding: currentBinding(plan, state), records: [orientation.record],
      event: orientation.event })).state;
    const proposal = Object.freeze({ schemaVersion: 1, rationale: 'Unproved provider result.',
      kind: 'checkpoint_task', status: 'active', nextSafeAction: 'Refuse this decision.' });
    const decision = decisionTransition(plan, state, proposal, 'decision_unproved_root');
    await assert.rejects(runtime.commitTransition({ runId: plan.runId,
      expectedBinding: currentBinding(plan, state), records: decision.records,
      event: decision.event }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
    const durable = await replayRun(ledger, plan.runId);
    assert.equal(durable.events.length, 2);
    assert.equal(durable.records.some(({ kind, id }) =>
      kind === 'decision' && id === decision.ref.id), false);
  });

test('Root decision acceptance rejects wrong prompt, orientation, and request provenance', async (t) => {
  for (const mismatch of ['prompt', 'orientation', 'request']) {
    await t.test(mismatch, async (t) => {
      const value = await fixture(t);
      let state = (await value.runtime.start(value.input)).state;
      const orientation = orientationTransition(value.plan, state,
        `orientation_wrong_${mismatch}`);
      state = (await value.runtime.commitTransition({ runId: value.plan.runId,
        expectedBinding: currentBinding(value.plan, state), records: [orientation.record],
        event: orientation.event })).state;
      const proposal = Object.freeze({
        schemaVersion: 1,
        rationale: `Reject the ${mismatch}-stale Root result.`,
        kind: 'checkpoint_task',
        status: 'active',
        nextSafeAction: 'Retain the exact durable orientation and launch intent.',
      });
      const decisionId = `decision_wrong_${mismatch}`;
      const result = rootModelResult(proposal, decisionId, {
        orientationDigest: mismatch === 'orientation'
          ? digest('stale root orientation')
          : orientation.ref.digest,
        promptDigest: mismatch === 'prompt'
          ? digest('wrong root prompt')
          : digest(`prompt ${decisionId}`),
      });
      const source = await driveAttempt(value.runtime, value.plan, state,
        `${decisionId}_source`, 'terminal_observed', result, { decisionId, orientation });
      state = source.state;
      let transition = decisionTransition(value.plan, state, proposal, decisionId, [], source);
      if (mismatch === 'request') {
        const staleIntent = createRootLaunchIntent({
          request: { ...source.launchIntent.value.request,
            requestId: 'request_from_another_root_tick' },
          orientation: orientation.ref,
        });
        const staleIntentRef = ref('detail', 'root_launch_stale_request', staleIntent);
        const original = transition.records.find(({ kind }) => kind === 'decision').value;
        const decision = Object.freeze({ ...original,
          source: Object.freeze({ ...original.source, launchIntent: staleIntentRef }) });
        const decisionRef = ref('decision', decision.decisionId, decision);
        transition = {
          records: [
            { kind: 'detail', id: staleIntentRef.id, version: 1, value: staleIntent },
            { kind: 'decision', id: decision.decisionId, version: 1, value: decision },
          ],
          event: lifecycleEvent({ id: `event_${decisionId}`,
            sequence: state.snapshot.eventCursor + 1,
            binding: currentBinding(value.plan, state), kind: 'root_decision_accepted',
            subject: decisionRef }),
        };
      }
      await assert.rejects(value.runtime.commitTransition({ runId: value.plan.runId,
        expectedBinding: currentBinding(value.plan, state), records: transition.records,
        event: transition.event }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
      assert.equal((await replayRun(value.ledger, value.plan.runId)).events
        .some(({ value: event }) => event.kind === 'root_decision_accepted'), false);
    });
  }
});

test('Root launch intent rejects wrong manifest provider, executable version, and workspace cwd',
  async (t) => {
    const cases = [
      ['provider', { providerAdapter: 'another_provider' }],
      ['version', { executableVersion: '0.146.0' }],
      ['cwd', { cwdIdentity: digest('another workspace root') }],
    ];
    for (const [label, requestOverrides] of cases) {
      await t.test(label, async (t) => {
        const value = await fixture(t);
        let state = (await value.runtime.start(value.input)).state;
        const orientation = orientationTransition(value.plan, state,
          `orientation_wrong_${label}`);
        state = (await value.runtime.commitTransition({ runId: value.plan.runId,
          expectedBinding: currentBinding(value.plan, state), records: [orientation.record],
          event: orientation.event })).state;
        const proposal = Object.freeze({
          schemaVersion: 1,
          rationale: `Reject the wrong Root ${label} launch identity.`,
          kind: 'checkpoint_task',
          status: 'active',
          nextSafeAction: 'Preserve the current manifest and workspace identity.',
        });
        const decisionId = `decision_wrong_${label}`;
        await assert.rejects(driveAttempt(value.runtime, value.plan, state,
          `${decisionId}_source`, 'launch_intended', rootModelResult(proposal, decisionId, {
            orientationDigest: orientation.ref.digest,
            promptDigest: digest(`prompt ${decisionId}`),
          }), { decisionId, orientation, requestOverrides }),
        hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
        const durable = await replayRun(value.ledger, value.plan.runId);
        assert.equal(durable.events.some(({ value: event }) =>
          event.kind === 'provider_observed' || event.kind === 'root_decision_accepted'), false);
      });
    }
  });

test('correction decision advances one generation and accepts only named exact post-state assignments', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  let state = (await runtime.start(input)).state;
  const orientation = orientationTransition(plan, state, 'orientation_correction');
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const proposalEntry = Object.freeze({
    proposalId: 'proposal_correction',
    role: 'implementer',
    goal: 'Apply the bounded correction.',
    scope: ['Correct the candidate.'],
    nonGoals: [],
    dependencies: [],
    ownership: { writePaths: ['lib'], readPaths: [] },
    resources: [],
    checks: ['check_runtime'],
    restartPolicy: 'fresh_attempt',
  });
  const proposal = Object.freeze({
    schemaVersion: 1,
    rationale: 'The exact candidate gate failed.',
    kind: 'request_correction',
    supersededAssignmentIds: [],
    assignments: [proposalEntry],
    affectedCheckIds: ['check_runtime'],
  });
  const correctionSource = await driveRootAttempt(runtime, plan, state,
    'decision_correction_source', proposal, 'decision_correction', orientation);
  state = correctionSource.state;
  const before = currentBinding(plan, state);
  const postBinding = Object.freeze({ ...before,
    snapshotRevision: before.snapshotRevision + 1,
    correctionGeneration: before.correctionGeneration + 1 });
  const assignmentFor = (assignmentId, binding = postBinding,
    sourceProposalId = proposalEntry.proposalId, sourceDecisionId = 'decision_correction') =>
    Object.freeze({
      schemaVersion: 1,
      assignmentId,
      generation: 1,
      binding,
      sourceDecisionId,
      sourceProposalId,
      role: 'implementer',
      profileDigest: digest('implementer profile'),
      goal: proposalEntry.goal,
      scope: proposalEntry.scope,
      nonGoals: proposalEntry.nonGoals,
      dependencies: [],
      ownership: proposalEntry.ownership,
      resources: [],
      baseCandidateId: 'candidate_base',
      baseTree: plan.manifest.repository.baseTree,
      permissions: { sandbox: 'workspace-write', network: false,
        approvalPolicy: 'never', nestedAgents: false },
      checks: proposalEntry.checks,
      deadlineAt: LATEST,
      restartPolicy: proposalEntry.restartPolicy,
    });
  const acceptedAssignment = assignmentFor('assignment_correction');
  const correction = decisionTransition(plan, state, proposal, 'decision_correction',
    [acceptedAssignment], correctionSource);
  const committed = await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: before, records: correction.records, event: correction.event });
  assert.equal(committed.state.snapshot.correctionGeneration, before.correctionGeneration + 1);
  assert.equal(committed.state.snapshot.revision, before.snapshotRevision + 1);
  assert.deepEqual(committed.state.snapshot.assignments,
    [ref('assignment', acceptedAssignment.assignmentId, acceptedAssignment)]);

  await runtime.release(plan.runId);
  const separateCases = [
    ['plus_two', (binding) => ({ ...binding, correctionGeneration: binding.correctionGeneration + 1 })],
    ['wrong_control', (binding) => ({ ...binding, controlGeneration: binding.controlGeneration + 1 })],
    ['wrong_task', (binding) => ({ ...binding, taskRecordVersion: binding.taskRecordVersion + 1 })],
    ['wrong_epoch', (binding) => ({ ...binding, epoch: binding.epoch + 1 })],
  ];
  for (const [label, mutate] of separateCases) {
    const other = await fixture(t);
    let otherState = (await other.runtime.start(other.input)).state;
    const otherOrientation = orientationTransition(other.plan, otherState, `orientation_${label}`);
    otherState = (await other.runtime.commitTransition({ runId: other.plan.runId,
      expectedBinding: currentBinding(other.plan, otherState), records: [otherOrientation.record],
      event: otherOrientation.event })).state;
    const otherSource = await driveRootAttempt(other.runtime, other.plan, otherState,
      `decision_${label}_source`, proposal, `decision_${label}`, otherOrientation);
    otherState = otherSource.state;
    const otherBefore = currentBinding(other.plan, otherState);
    const otherPost = { ...otherBefore, snapshotRevision: otherBefore.snapshotRevision + 1,
      correctionGeneration: otherBefore.correctionGeneration + 1 };
    const invalid = assignmentFor(`assignment_${label}`, mutate(otherPost),
      proposalEntry.proposalId, `decision_${label}`);
    const invalidDecision = decisionTransition(other.plan, otherState, proposal,
      `decision_${label}`, [invalid], otherSource);
    await assert.rejects(other.runtime.commitTransition({ runId: other.plan.runId,
      expectedBinding: otherBefore, records: invalidDecision.records, event: invalidDecision.event }),
    hasCode('BINDING_STALE'));
  }

  const other = await fixture(t);
  let otherState = (await other.runtime.start(other.input)).state;
  const otherOrientation = orientationTransition(other.plan, otherState, 'orientation_unnamed');
  otherState = (await other.runtime.commitTransition({ runId: other.plan.runId,
    expectedBinding: currentBinding(other.plan, otherState), records: [otherOrientation.record],
    event: otherOrientation.event })).state;
  const unnamedSource = await driveRootAttempt(other.runtime, other.plan, otherState,
    'decision_unnamed_source', proposal, 'decision_unnamed', otherOrientation);
  otherState = unnamedSource.state;
  const otherBefore = currentBinding(other.plan, otherState);
  const named = assignmentFor('assignment_named', { ...otherBefore,
    snapshotRevision: otherBefore.snapshotRevision + 1,
    correctionGeneration: otherBefore.correctionGeneration + 1 },
  proposalEntry.proposalId, 'decision_unnamed');
  const unnamed = assignmentFor('assignment_unnamed', named.binding,
    proposalEntry.proposalId, 'decision_unnamed');
  const invalidDecision = decisionTransition(other.plan, otherState, proposal,
    'decision_unnamed', [named], unnamedSource);
  await assert.rejects(other.runtime.commitTransition({ runId: other.plan.runId,
    expectedBinding: otherBefore, records: [
      ...invalidDecision.records,
      { kind: 'assignment', id: unnamed.assignmentId, version: 1, value: unnamed },
    ], event: invalidDecision.event }), hasCode('BINDING_STALE'));
  assert.equal((await replayRun(ledger, plan.runId)).events.at(-1).value.kind,
    'root_decision_accepted');
});

test('completion wakes are closed to exact candidate and verification evidence', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  let state = (await runtime.start(input)).state;
  const orientation = orientationTransition(plan, state, 'orientation_completion');
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const proposal = Object.freeze({ schemaVersion: 1, rationale: 'Integrate the candidate.',
    kind: 'integrate_candidate', candidateId: 'candidate_completion' });
  const completionSource = await driveRootAttempt(runtime, plan, state,
    'decision_completion_source', proposal, 'decision_completion', orientation);
  state = completionSource.state;
  const decision = decisionTransition(plan, state, proposal, 'decision_completion', [],
    completionSource);
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: decision.records,
    event: decision.event })).state;

  let binding = currentBinding(plan, state);
  const candidate = Object.freeze({
    schemaVersion: 1,
    candidateId: 'candidate_completion',
    binding,
    parentCandidateId: null,
    baseTree: plan.manifest.repository.baseTree,
    tree: oid('3'),
    privateCommit: oid('4'),
    producerAttempts: ['attempt_completion'],
    changedPaths: ['lib/completion.mjs'],
    ownershipDigest: digest('completion ownership'),
    patchDigest: digest('completion patch'),
    createdAt: LATER,
  });
  const candidateRef = ref('candidate', candidate.candidateId, candidate);
  const operation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_completion',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'integrate_candidate:completion',
    kind: 'integrate_candidate',
    subject: decision.ref,
    binding,
    inputDigest: digest('completion input'),
    expected: [decision.ref],
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: candidateRef,
    observedAt: LATER,
    failureCode: null,
  });
  const operationRef = ref('operation', operation.operationId, operation);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [
      { kind: 'operation', id: operation.operationId, version: 1, value: operation },
      { kind: 'candidate', id: candidate.candidateId, version: 1, value: candidate },
    ],
    event: lifecycleEvent({ id: 'event_candidate_completion',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'operation_transition',
      subject: operationRef, payload: candidateRef }),
  })).state;
  assert.equal(state.snapshot.phase, 'executing');

  const rejectWake = async (id, reasons, deadlineAt) => {
    binding = currentBinding(plan, state);
    const detail = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
      reasons, deadlineAt, observedAt: LATEST });
    const detailRef = ref('detail', id, detail);
    await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
      records: [{ kind: 'detail', id, version: 1, value: detail }],
      event: lifecycleEvent({ id: `event_${id}`, sequence: state.snapshot.eventCursor + 1,
        binding, kind: 'wake_due', subject: detailRef, observedAt: LATEST }),
    }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  };
  await rejectWake('wake_wrong_reason', ['verification_complete'], null);
  await rejectWake('wake_wrong_deadline', ['candidate_integrated'], NOW);
  assert.equal((await replayRun(ledger, plan.runId)).events.at(-1).value.eventId,
    'event_candidate_completion');

  binding = currentBinding(plan, state);
  const wake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['candidate_integrated'], deadlineAt: null, observedAt: LATEST });
  const wakeRef = ref('detail', 'wake_candidate_completion', wake);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: wakeRef.id, version: 1, value: wake }],
    event: lifecycleEvent({ id: 'event_wake_candidate_completion',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due', subject: wakeRef,
      observedAt: LATEST }),
  })).state;
  assert.equal(state.snapshot.phase, 'dormant');

  await rejectWake('wake_wrong_phase', ['candidate_integrated'], null);
  assert.equal((await replayRun(ledger, plan.runId)).events.at(-1).value.eventId,
    'event_wake_candidate_completion');
});

test('attempt transitions enforce the exact durable lifecycle and recover detail/event cuts', async (t) => {
  let failure = null;
  const value = await fixture(t, (cut, details) => {
    if (cut !== 'after-directory-sync') return;
    if (failure === 'detail' &&
        details.label === 'detail record transition_attempt_chain_1 version 1') {
      throw new Error('cut:attempt-detail');
    }
    if (failure === 'event' && details.label === 'event 2') throw new Error('cut:attempt-event');
  });
  const { input, plan, runtime, ledger } = value;
  let state = (await runtime.start(input)).state;
  let binding = currentBinding(plan, state);
  const base = {
    schemaVersion: 1,
    attemptId: 'attempt_chain',
    assignmentId: 'assignment_chain',
    attemptNumber: 1,
    binding,
    workspace: { workspaceId: 'workspace_chain', rootIdentity: digest('workspace chain'),
      kind: 'isolated_clone', baseTree: plan.manifest.repository.baseTree },
    launchRequestId: null,
    processDomainId: null,
    result: null,
    candidateId: null,
    observedAt: LATER,
    terminalReason: null,
  };
  const allocated = Object.freeze({ ...base, recordVersion: 1, previousDigest: null,
    state: 'allocated' });
  const invalidInitial = Object.freeze({ ...allocated,
    attemptId: 'attempt_invalid_initial',
    state: 'launch_intended',
    launchRequestId: 'request_invalid_initial',
    processDomainId: 'process_invalid_initial',
  });
  const invalidInitialTransition = attemptTransition(plan, state, invalidInitial, null,
    'launch_intended', [], [], 'attempt_invalid_initial');
  const initialRecordCount = (await replayRun(ledger, plan.runId)).records.length;
  const initialEventCount = (await replayRun(ledger, plan.runId)).events.length;
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: invalidInitialTransition.records, event: invalidInitialTransition.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  assert.equal((await replayRun(ledger, plan.runId)).records.length, initialRecordCount);
  assert.equal((await replayRun(ledger, plan.runId)).events.length, initialEventCount);
  const allocationReceipt = Object.freeze({
    schemaVersion: 1,
    receiptId: 'workspace_allocation_chain',
    binding,
    attemptId: allocated.attemptId,
    resourceKey: `workspace:${allocated.workspace.workspaceId}`,
    action: 'allocate',
    ownershipTokenDigest: allocated.workspace.rootIdentity,
    observedIdentityDigest: allocated.workspace.rootIdentity,
    outcome: 'succeeded',
    evidence: [],
    observedAt: LATER,
  });
  const allocationReceiptRecord = record('resource_receipt', allocationReceipt.receiptId,
    allocationReceipt);
  const allocationOperation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_allocate_chain',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'allocate_workspace:attempt_chain',
    kind: 'allocate_workspace',
    subject: { kind: 'assignment', id: allocated.assignmentId,
      digest: digest('assignment chain') },
    binding,
    inputDigest: digest('allocate workspace input'),
    expected: [],
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: allocationReceiptRecord.ref,
    observedAt: LATER,
    failureCode: null,
  });
  const allocatedTransition = attemptTransition(plan, state, allocated, null,
    'workspace_allocated', [record('operation', allocationOperation.operationId,
      allocationOperation), allocationReceiptRecord]);
  failure = 'detail';
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: allocatedTransition.records, event: allocatedTransition.event }), /cut:attempt-detail/u);
  failure = 'event';
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: allocatedTransition.records, event: allocatedTransition.event }), /cut:attempt-event/u);
  failure = null;
  let committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: allocatedTransition.records, event: allocatedTransition.event });
  assert.equal(committed.disposition, 'recovered');
  state = committed.state;
  assert.deepEqual(state.snapshot.attempts, [allocatedTransition.ref]);

  const invalidRecordCount = (await replayRun(ledger, plan.runId)).records.length;
  const invalidEventCount = (await replayRun(ledger, plan.runId)).events.length;
  const invalidAttempt = Object.freeze({ ...allocated,
    recordVersion: 2,
    previousDigest: allocatedTransition.ref.digest,
    state: 'frozen',
    binding: currentBinding(plan, state),
    observedAt: LATEST,
  });
  const invalidTransition = attemptTransition(plan, state, invalidAttempt,
    allocatedTransition.ref, 'workspace_frozen', [], [], 'attempt_invalid_skip');
  await assert.rejects(runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: invalidTransition.records,
    event: invalidTransition.event }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  let durable = await replayRun(ledger, plan.runId);
  assert.equal(durable.records.length, invalidRecordCount);
  assert.equal(durable.events.length, invalidEventCount);

  binding = currentBinding(plan, state);
  const launchIntended = Object.freeze({ ...allocated,
    recordVersion: 2,
    previousDigest: allocatedTransition.ref.digest,
    binding,
    state: 'launch_intended',
    launchRequestId: 'request_attempt_chain',
    processDomainId: 'process_attempt_chain',
    observedAt: LATEST,
  });
  const launchOperation = Object.freeze({
    ...allocationOperation,
    operationId: 'operation_launch_chain',
    idempotencyKey: 'launch_job:attempt_chain',
    kind: 'launch_job',
    binding,
    inputDigest: digest('launch input'),
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATEST,
  });
  const launchOperationRecord = record('operation', launchOperation.operationId, launchOperation);
  const intendedTransition = attemptTransition(plan, state, launchIntended,
    allocatedTransition.ref, 'launch_intended', [launchOperationRecord]);

  for (const [label, mutate] of [
    ['previous_digest', (attempt) => ({ ...attempt, previousDigest: digest('wrong previous') })],
    ['workspace', (attempt) => ({ ...attempt, workspace: {
      ...attempt.workspace, rootIdentity: digest('wrong workspace'),
    } })],
    ['stale_binding', (attempt) => ({ ...attempt, binding: {
      ...attempt.binding, controlGeneration: attempt.binding.controlGeneration + 1,
    } })],
  ]) {
    const wrong = Object.freeze(mutate(launchIntended));
    const transition = attemptTransition(plan, state, wrong, allocatedTransition.ref,
      'launch_intended', [launchOperationRecord], [], `attempt_wrong_${label}`);
    await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
      records: transition.records, event: transition.event }), (error) =>
      ['RUNTIME_RECONCILIATION_REQUIRED', 'BINDING_STALE'].includes(error.code));
  }
  const missingEvidence = attemptTransition(plan, state, launchIntended,
    allocatedTransition.ref, 'launch_intended', [], [], 'attempt_missing_evidence');
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: missingEvidence.records, event: missingEvidence.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  durable = await replayRun(ledger, plan.runId);
  assert.equal(durable.records.length, invalidRecordCount);
  assert.equal(durable.events.length, invalidEventCount);

  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: intendedTransition.records, event: intendedTransition.event })).state;
  let previousRef = intendedTransition.ref;
  let previousAttempt = launchIntended;

  binding = currentBinding(plan, state);
  const runningAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 3,
    previousDigest: previousRef.digest,
    binding,
    state: 'running',
    observedAt: LATEST,
  });
  const runningProcess = processReceiptFor(runningAttempt, binding, 'process_running_chain',
    { state: 'running', descendantsComplete: false });
  const runningProcessRecord = record('process_receipt', runningProcess.receiptId, runningProcess);
  const runningLaunch = Object.freeze({
    schemaVersion: 1,
    receiptId: 'launch_attempt_chain',
    recordVersion: 1,
    previousDigest: null,
    requestId: runningAttempt.launchRequestId,
    binding,
    launcherConnectionId: runningProcess.launcherConnectionId,
    processDomainId: runningAttempt.processDomainId,
    providerHandleRef: runningProcessRecord.ref,
    argvDigest: digest('attempt argv'),
    environmentDigest: digest('attempt environment'),
    startedAt: NOW,
    completedAt: null,
    exitCode: null,
    signal: null,
    stdoutDigest: digest('attempt stdout'),
    stderrDigest: digest('attempt stderr'),
    modelResult: null,
    outcome: 'running',
  });
  const runningLaunchRecord = record('launch_receipt', runningLaunch.receiptId, runningLaunch);
  const wrongProcess = Object.freeze({ ...runningProcess,
    processIdentityDigest: digest('wrong process identity') });
  const wrongLaunch = Object.freeze({ ...runningLaunch,
    providerHandleRef: ref('process_receipt', wrongProcess.receiptId, wrongProcess) });
  const wrongProcessTransition = attemptTransition(plan, state, runningAttempt, previousRef,
    'process_running', [record('launch_receipt', wrongLaunch.receiptId, wrongLaunch),
      runningProcessRecord], [], 'attempt_wrong_process_identity');
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: wrongProcessTransition.records, event: wrongProcessTransition.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  assert.equal((await replayRun(ledger, plan.runId)).records.some(({ id }) =>
    id === runningProcess.receiptId), false);

  let transition = attemptTransition(plan, state, runningAttempt, previousRef,
    'process_running', [runningLaunchRecord, runningProcessRecord]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = runningAttempt;

  binding = currentBinding(plan, state);
  const result = Object.freeze({
    schemaVersion: 1,
    disposition: 'completed',
    summary: 'Attempt completed.',
    changedPathsClaim: ['lib/attempt.mjs'],
    checks: [], findings: [], risks: [], knowledgeProposals: [], followUp: [],
  });
  const resultRecord = record('model_result', 'result_attempt_chain', result);
  const terminalAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 4,
    previousDigest: previousRef.digest,
    binding,
    state: 'terminal_observed',
    result: resultRecord.ref,
    observedAt: LATEST,
    terminalReason: 'provider_exited',
  });
  const terminalProcess = processReceiptFor(terminalAttempt, binding, 'process_terminal_chain');
  const terminalProcessRecord = record('process_receipt', terminalProcess.receiptId, terminalProcess);
  const terminalLaunch = Object.freeze({ ...runningLaunch,
    recordVersion: 2,
    previousDigest: runningLaunchRecord.ref.digest,
    binding,
    providerHandleRef: terminalProcessRecord.ref,
    completedAt: LATEST,
    exitCode: 0,
    modelResult: resultRecord.ref,
    outcome: 'exited',
  });
  const terminalLaunchRecord = record('launch_receipt', terminalLaunch.receiptId, terminalLaunch,
    { version: 2 });
  transition = attemptTransition(plan, state, terminalAttempt, previousRef, 'process_terminal',
    [terminalLaunchRecord, terminalProcessRecord], [
      { kind: resultRecord.kind, id: resultRecord.id, version: resultRecord.version,
        value: resultRecord.value },
    ]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = terminalAttempt;

  binding = currentBinding(plan, state);
  const frozenAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 5, previousDigest: previousRef.digest, binding,
    state: 'frozen', observedAt: LATEST });
  const incompleteProcess = Object.freeze({ ...terminalProcess,
    receiptId: 'process_incomplete_chain', binding, descendantsComplete: false });
  const incompleteTransition = attemptTransition(plan, state, frozenAttempt, previousRef,
    'workspace_frozen', [record('process_receipt', incompleteProcess.receiptId,
      incompleteProcess)], [], 'attempt_incomplete_empty');
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: incompleteTransition.records, event: incompleteTransition.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  assert.equal((await replayRun(ledger, plan.runId)).records.some(({ id }) =>
    id === incompleteProcess.receiptId), false);
  transition = attemptTransition(plan, state, frozenAttempt, previousRef, 'workspace_frozen',
    [{ ...terminalProcessRecord, publish: false }]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = frozenAttempt;

  binding = currentBinding(plan, state);
  const candidate = Object.freeze({
    schemaVersion: 1,
    candidateId: 'candidate_attempt_chain',
    binding,
    parentCandidateId: null,
    baseTree: plan.manifest.repository.baseTree,
    tree: oid('5'),
    privateCommit: oid('6'),
    producerAttempts: [previousAttempt.attemptId],
    changedPaths: ['lib/attempt.mjs'],
    ownershipDigest: digest('attempt ownership'),
    patchDigest: digest('attempt patch'),
    createdAt: LATEST,
  });
  const candidateRecord = record('candidate', candidate.candidateId, candidate);
  const ingestOperation = Object.freeze({ ...launchOperation,
    operationId: 'operation_ingest_chain', idempotencyKey: 'ingest_attempt:attempt_chain',
    kind: 'ingest_attempt', subject: previousRef, binding,
    inputDigest: digest('ingest attempt input'), state: 'observed_succeeded', attemptNumber: 1,
    receipt: candidateRecord.ref });
  const ingestOperationRecord = record('operation', ingestOperation.operationId, ingestOperation);
  const ingestedAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 6, previousDigest: previousRef.digest, binding,
    state: 'ingested', candidateId: candidate.candidateId });
  transition = attemptTransition(plan, state, ingestedAttempt, previousRef, 'candidate_ingested',
    [ingestOperationRecord, candidateRecord]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = ingestedAttempt;

  const orientation = orientationTransition(plan, state, 'orientation_attempt_accept');
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const proposal = Object.freeze({ schemaVersion: 1, rationale: 'Accept exact candidate.',
    kind: 'integrate_candidate', candidateId: candidate.candidateId });
  const acceptanceSource = await driveRootAttempt(runtime, plan, state,
    'decision_attempt_accept_source', proposal, 'decision_attempt_accept', orientation);
  state = acceptanceSource.state;
  const decision = decisionTransition(plan, state, proposal, 'decision_attempt_accept', [],
    acceptanceSource);
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: decision.records,
    event: decision.event })).state;
  binding = currentBinding(plan, state);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    event: lifecycleEvent({ id: 'event_candidate_ingestion_observed',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'operation_transition',
      subject: ingestOperationRecord.ref, payload: candidateRecord.ref,
      observedAt: LATEST }),
  })).state;
  assert.equal(state.snapshot.phase, 'executing');

  binding = currentBinding(plan, state);
  const acceptedAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 7, previousDigest: previousRef.digest, binding,
    state: 'accepted', observedAt: LATEST });
  transition = attemptTransition(plan, state, acceptedAttempt, previousRef, 'candidate_accepted',
    [{ kind: 'decision', id: decision.ref.id, version: 1, value: null,
      publish: false, ref: decision.ref }]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = acceptedAttempt;

  binding = currentBinding(plan, state);
  const cleanupIntendedOperation = Object.freeze({ ...launchOperation,
    operationId: 'operation_cleanup_workspace_chain',
    idempotencyKey: 'cleanup_workspace:attempt_chain', kind: 'cleanup_workspace',
    subject: previousRef, binding, inputDigest: digest('cleanup workspace input'),
    state: 'intended', attemptNumber: 0, receipt: null });
  const cleanupIntendedRecord = record('operation', cleanupIntendedOperation.operationId,
    cleanupIntendedOperation);
  const cleanupPendingAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 8, previousDigest: previousRef.digest, binding,
    state: 'cleanup_pending' });
  transition = attemptTransition(plan, state, cleanupPendingAttempt, previousRef,
    'cleanup_intended', [cleanupIntendedRecord]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;
  previousAttempt = cleanupPendingAttempt;

  binding = currentBinding(plan, state);
  const earlyCleanupWake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['attempt_cleanup_complete'], deadlineAt: null, observedAt: LATEST });
  const earlyCleanupWakeRef = ref('detail', 'wake_attempt_cleanup_early', earlyCleanupWake);
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: earlyCleanupWakeRef.id, version: 1,
      value: earlyCleanupWake }],
    event: lifecycleEvent({ id: 'event_wake_attempt_cleanup_early',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due',
      subject: earlyCleanupWakeRef, observedAt: LATEST }),
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  binding = currentBinding(plan, state);
  const cleanupReceipt = Object.freeze({ ...allocationReceipt,
    receiptId: 'workspace_cleanup_chain', binding, action: 'cleanup', observedAt: LATEST });
  const cleanupReceiptRecord = record('resource_receipt', cleanupReceipt.receiptId, cleanupReceipt);
  const cleanupObservedOperation = Object.freeze({ ...cleanupIntendedOperation,
    recordVersion: 2,
    previousDigest: cleanupIntendedRecord.ref.digest,
    binding,
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: cleanupReceiptRecord.ref,
    observedAt: LATEST,
  });
  const cleanedAttempt = Object.freeze({ ...previousAttempt,
    recordVersion: 9, previousDigest: previousRef.digest, binding,
    state: 'cleaned', observedAt: LATEST });
  transition = attemptTransition(plan, state, cleanedAttempt, previousRef, 'cleanup_observed', [
    record('operation', cleanupObservedOperation.operationId, cleanupObservedOperation,
      { version: 2 }),
    cleanupReceiptRecord,
    { ...terminalProcessRecord, publish: false },
  ]);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  assert.deepEqual(state.snapshot.attempts, [transition.ref, acceptanceSource.ref]);
  assert.equal(state.reconciliationRequired, false);

  binding = currentBinding(plan, state);
  for (const [id, reasons, deadlineAt] of [
    ['wrong_reason', ['candidate_integrated'], null],
    ['wrong_deadline', ['attempt_cleanup_complete'], NOW],
  ]) {
    const invalidWake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
      reasons, deadlineAt, observedAt: LATEST });
    const invalidWakeRef = ref('detail', `wake_attempt_cleanup_${id}`, invalidWake);
    await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
      records: [{ kind: 'detail', id: invalidWakeRef.id, version: 1, value: invalidWake }],
      event: lifecycleEvent({ id: `event_wake_attempt_cleanup_${id}`,
        sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due',
        subject: invalidWakeRef, observedAt: LATEST }),
    }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  }
  const cleanupWake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['attempt_cleanup_complete'], deadlineAt: null, observedAt: LATEST });
  const cleanupWakeRef = ref('detail', 'wake_attempt_cleanup_complete', cleanupWake);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: cleanupWakeRef.id, version: 1, value: cleanupWake }],
    event: lifecycleEvent({ id: 'event_wake_attempt_cleanup_complete',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due',
      subject: cleanupWakeRef, observedAt: LATEST }),
  })).state;
  assert.equal(state.snapshot.phase, 'dormant');
  const lifecycle = await runtime.readLifecycle({ runId: plan.runId });
  assert.equal(lifecycle.records.some(({ kind, id }) =>
    kind === 'attempt' && id === cleanedAttempt.attemptId && id === transition.ref.id), true);
  assert.equal(lifecycle.records.some(({ kind, id }) =>
    kind === 'process_receipt' && id === terminalProcess.receiptId), true);
});

test('a read-only Root attempt uses an exact decision result disposition before cleanup', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  let state = (await runtime.start(input)).state;
  const proposal = Object.freeze({ schemaVersion: 1, rationale: 'Reject the Root result.',
    kind: 'fail', reasonCode: 'root_result_rejected', evidence: [] });
  const orientation = orientationTransition(plan, state, 'orientation_root_read_only');
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const driven = await driveRootAttempt(runtime, plan, state, 'root_read_only', proposal,
    'decision_root_read_only', orientation);
  state = driven.state;
  let binding = currentBinding(plan, state);
  const decision = decisionTransition(plan, state, proposal, 'decision_root_read_only', [], driven);
  const decisionRecord = decision.records.at(-1);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: decision.records, event: decision.event,
  })).state;
  assert.equal(state.snapshot.phase, 'intent_published');

  binding = currentBinding(plan, state);
  const rejected = Object.freeze({ ...driven.attempt,
    recordVersion: 5,
    previousDigest: driven.ref.digest,
    binding,
    state: 'rejected',
  });
  const missing = attemptTransition(plan, state, rejected, driven.ref,
    'result_rejected', [], [], 'root_result_missing_decision');
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: missing.records, event: missing.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  let transition = attemptTransition(plan, state, rejected, driven.ref,
    'result_rejected', [{ ...decisionRecord, publish: false, ref: decision.ref }], [],
  'root_result_rejected');
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  let previousRef = transition.ref;

  binding = currentBinding(plan, state);
  const cleanupIntent = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_cleanup_root_read_only',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'cleanup_workspace:root_read_only',
    kind: 'cleanup_workspace',
    subject: previousRef,
    binding,
    inputDigest: digest('root cleanup input'),
    expected: [previousRef],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATEST,
    failureCode: null,
  });
  const cleanupIntentRecord = record('operation', cleanupIntent.operationId, cleanupIntent);
  const cleanupPending = Object.freeze({ ...rejected,
    recordVersion: 6, previousDigest: previousRef.digest, binding,
    state: 'cleanup_pending' });
  transition = attemptTransition(plan, state, cleanupPending, previousRef,
    'cleanup_intended', [cleanupIntentRecord], [], 'root_cleanup_pending');
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  previousRef = transition.ref;

  binding = currentBinding(plan, state);
  const cleanupReceipt = Object.freeze({
    ...driven.allocationReceipt,
    receiptId: 'workspace_cleanup_root_read_only',
    binding,
    action: 'cleanup',
    observedAt: LATEST,
  });
  const cleanupReceiptRecord = record('resource_receipt', cleanupReceipt.receiptId, cleanupReceipt);
  const cleanupObserved = Object.freeze({ ...cleanupIntent,
    recordVersion: 2,
    previousDigest: cleanupIntentRecord.ref.digest,
    binding,
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: cleanupReceiptRecord.ref,
  });
  const cleaned = Object.freeze({ ...cleanupPending,
    recordVersion: 7, previousDigest: previousRef.digest, binding, state: 'cleaned' });
  transition = attemptTransition(plan, state, cleaned, previousRef, 'cleanup_observed', [
    record('operation', cleanupObserved.operationId, cleanupObserved, { version: 2 }),
    cleanupReceiptRecord,
    { ...driven.terminalProcess, publish: false },
  ], [], 'root_cleaned');
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: transition.records, event: transition.event })).state;
  assert.deepEqual(state.snapshot.attempts, [transition.ref]);
  binding = currentBinding(plan, state);
  const cleanupWake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['attempt_cleanup_complete'], deadlineAt: null, observedAt: LATEST });
  const cleanupWakeRef = ref('detail', 'wake_root_cleanup_complete', cleanupWake);
  state = (await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: cleanupWakeRef.id, version: 1, value: cleanupWake }],
    event: lifecycleEvent({ id: 'event_wake_root_cleanup_complete',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due',
      subject: cleanupWakeRef, observedAt: LATEST }),
  })).state;
  assert.equal(state.snapshot.phase, 'dormant');
});

test('correction stales only with exact decision and emptiness proof; ambiguity quarantines', async (t) => {
  const staleFixture = await fixture(t);
  let staleState = (await staleFixture.runtime.start(staleFixture.input)).state;
  const running = await driveAttempt(staleFixture.runtime, staleFixture.plan, staleState,
    'correction_stale', 'running');
  staleState = running.state;
  const orientation = orientationTransition(staleFixture.plan, staleState,
    'orientation_correction_stale');
  staleState = (await staleFixture.runtime.commitTransition({ runId: staleFixture.plan.runId,
    expectedBinding: currentBinding(staleFixture.plan, staleState), records: [orientation.record],
    event: orientation.event })).state;
  const correctionProposal = Object.freeze({
    schemaVersion: 1,
    rationale: 'Supersede the running assignment.',
    kind: 'request_correction',
    supersededAssignmentIds: [running.attempt.assignmentId],
    assignments: [],
    affectedCheckIds: [],
  });
  const staleDecisionSource = await driveRootAttempt(staleFixture.runtime, staleFixture.plan,
    staleState, 'decision_running_stale_source', correctionProposal,
    'decision_running_stale', orientation);
  staleState = staleDecisionSource.state;
  const correction = decisionTransition(staleFixture.plan, staleState, correctionProposal,
    'decision_running_stale', [], staleDecisionSource);
  staleState = (await staleFixture.runtime.commitTransition({ runId: staleFixture.plan.runId,
    expectedBinding: currentBinding(staleFixture.plan, staleState), records: correction.records,
    event: correction.event })).state;
  let binding = currentBinding(staleFixture.plan, staleState);
  const staleAttempt = Object.freeze({ ...running.attempt,
    recordVersion: 4,
    previousDigest: running.ref.digest,
    binding,
    state: 'stale',
  });
  const decisionEvidence = { kind: 'decision', id: correction.ref.id, version: 1,
    value: null, publish: false, ref: correction.ref };
  const missingProof = attemptTransition(staleFixture.plan, staleState, staleAttempt,
    running.ref, 'correction_stale', [decisionEvidence], [], 'stale_missing_empty_proof');
  await assert.rejects(staleFixture.runtime.commitTransition({ runId: staleFixture.plan.runId,
    expectedBinding: binding, records: missingProof.records, event: missingProof.event }),
  hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  const empty = processReceiptFor(staleAttempt, binding, 'process_empty_correction_stale');
  const staleTransition = attemptTransition(staleFixture.plan, staleState, staleAttempt,
    running.ref, 'correction_stale', [decisionEvidence,
      record('process_receipt', empty.receiptId, empty)], [], 'running_correction_stale');
  staleState = (await staleFixture.runtime.commitTransition({ runId: staleFixture.plan.runId,
    expectedBinding: binding, records: staleTransition.records,
    event: staleTransition.event })).state;
  assert.deepEqual(staleState.snapshot.attempts, [staleTransition.ref, staleDecisionSource.ref]);

  const quarantineFixture = await fixture(t);
  let quarantineState = (await quarantineFixture.runtime.start(quarantineFixture.input)).state;
  const ambiguous = await driveAttempt(quarantineFixture.runtime, quarantineFixture.plan,
    quarantineState, 'quarantine', 'running');
  quarantineState = ambiguous.state;
  binding = currentBinding(quarantineFixture.plan, quarantineState);
  const quarantinedAttempt = Object.freeze({ ...ambiguous.attempt,
    recordVersion: 4,
    previousDigest: ambiguous.ref.digest,
    binding,
    state: 'quarantined',
  });
  const noEvidence = attemptTransition(quarantineFixture.plan, quarantineState,
    quarantinedAttempt, ambiguous.ref, 'process_quarantined', [], [],
    'quarantine_missing_evidence');
  await assert.rejects(quarantineFixture.runtime.commitTransition({
    runId: quarantineFixture.plan.runId, expectedBinding: binding,
    records: noEvidence.records, event: noEvidence.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  const incomplete = processReceiptFor(quarantinedAttempt, binding,
    'process_incomplete_quarantine', { state: 'empty', descendantsComplete: false });
  const quarantineTransition = attemptTransition(quarantineFixture.plan, quarantineState,
    quarantinedAttempt, ambiguous.ref, 'process_quarantined', [
      record('process_receipt', incomplete.receiptId, incomplete),
    ], [], 'running_quarantined');
  quarantineState = (await quarantineFixture.runtime.commitTransition({
    runId: quarantineFixture.plan.runId, expectedBinding: binding,
    records: quarantineTransition.records, event: quarantineTransition.event,
  })).state;
  assert.deepEqual(quarantineState.snapshot.attempts, [quarantineTransition.ref]);
});

test('stop stales attempts only with the latest control and exact process proof', async (t) => {
  const runningFixture = await fixture(t);
  let state = (await runningFixture.runtime.start(runningFixture.input)).state;
  const running = await driveAttempt(runningFixture.runtime, runningFixture.plan, state,
    'stop_stale', 'running');
  state = running.state;

  const firstStop = await runningFixture.runtime.publishStopRequest({
    runId: runningFixture.plan.runId,
    requestId: 'stop_attempt_first',
    expectedControlGeneration: 0,
    reason: 'Stop the running attempt.',
  });
  state = (await runningFixture.runtime.acceptControls({
    runId: runningFixture.plan.runId,
    expectedEpoch: 1,
  })).state;
  const firstDetailRecord = acceptedControlRecord(
    await replayRun(runningFixture.ledger, runningFixture.plan.runId), firstStop.request);
  const firstDetail = { kind: 'detail', id: firstDetailRecord.id, version: 1,
    value: null, publish: false,
    ref: { kind: 'detail', id: firstDetailRecord.id, digest: firstDetailRecord.digest } };

  const latestStop = await runningFixture.runtime.publishStopRequest({
    runId: runningFixture.plan.runId,
    requestId: 'stop_attempt_latest',
    expectedControlGeneration: 1,
    reason: 'Refresh the exact stop boundary.',
  });
  state = (await runningFixture.runtime.acceptControls({
    runId: runningFixture.plan.runId,
    expectedEpoch: 1,
  })).state;
  assert.equal(state.snapshot.phase, 'stopping');
  const durable = await replayRun(runningFixture.ledger, runningFixture.plan.runId);
  const latestDetailRecord = acceptedControlRecord(durable, latestStop.request);
  const latestAccepted = state.acceptedControls.at(-1);
  assert.equal(latestAccepted.acceptedAt, LATER);
  assert.deepEqual(latestAccepted.detailRef, {
    kind: 'detail', id: latestDetailRecord.id, digest: latestDetailRecord.digest,
  });
  assert.equal(latestAccepted.detail.recordType, 'accepted_control');
  assert.equal(latestAccepted.detail.requestId, latestStop.request.requestId);
  const latestDetail = { kind: 'detail', id: latestDetailRecord.id, version: 1,
    value: null, publish: false,
    ref: { kind: 'detail', id: latestDetailRecord.id, digest: latestDetailRecord.digest } };
  const binding = currentBinding(runningFixture.plan, state);
  const stoppedAttempt = Object.freeze({ ...running.attempt,
    recordVersion: 4,
    previousDigest: running.ref.digest,
    binding,
    state: 'stale',
  });

  function stoppedProcess(id, overrides = {}) {
    const process = Object.freeze({
      ...processReceiptFor(stoppedAttempt, binding, id, { action: 'interrupt' }),
      ...overrides,
    });
    const processRecord = record('process_receipt', process.receiptId, process);
    const launch = Object.freeze({
      ...running.runningLaunch,
      recordVersion: 2,
      previousDigest: canonicalDigest(running.runningLaunch),
      binding,
      providerHandleRef: processRecord.ref,
      completedAt: LATEST,
      exitCode: 0,
      outcome: 'exited',
    });
    return { processRecord, launchRecord: record('launch_receipt', launch.receiptId, launch,
      { version: 2 }) };
  }

  const exact = stoppedProcess('process_stop_exact');
  const beforeInvalid = await replayRun(runningFixture.ledger, runningFixture.plan.runId);
  const staleControl = attemptTransition(runningFixture.plan, state, stoppedAttempt, running.ref,
    'stop_stale', [firstDetail, exact.launchRecord, exact.processRecord], [],
    'stop_stale_old_control');
  await assert.rejects(runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: binding,
    records: staleControl.records,
    event: staleControl.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  const wrongIdentity = stoppedProcess('process_stop_wrong_identity', {
    processIdentityDigest: digest('wrong stop process identity'),
  });
  const wrongProcess = attemptTransition(runningFixture.plan, state, stoppedAttempt, running.ref,
    'stop_stale', [latestDetail, wrongIdentity.launchRecord, wrongIdentity.processRecord], [],
    'stop_stale_wrong_process');
  await assert.rejects(runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: binding,
    records: wrongProcess.records,
    event: wrongProcess.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  const wrongAttempt = stoppedProcess('process_stop_wrong_attempt', {
    attemptId: 'attempt_another_process',
  });
  const wrongAttemptTransition = attemptTransition(runningFixture.plan, state, stoppedAttempt,
    running.ref, 'stop_stale', [latestDetail, wrongAttempt.launchRecord,
      wrongAttempt.processRecord], [], 'stop_stale_wrong_attempt');
  await assert.rejects(runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: binding,
    records: wrongAttemptTransition.records,
    event: wrongAttemptTransition.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  const incomplete = stoppedProcess('process_stop_incomplete', { descendantsComplete: false });
  const incompleteTransition = attemptTransition(runningFixture.plan, state, stoppedAttempt,
    running.ref, 'stop_stale', [latestDetail, incomplete.launchRecord,
      incomplete.processRecord], [], 'stop_stale_incomplete');
  await assert.rejects(runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: binding,
    records: incompleteTransition.records,
    event: incompleteTransition.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
  const afterInvalid = await replayRun(runningFixture.ledger, runningFixture.plan.runId);
  assert.equal(afterInvalid.records.length, beforeInvalid.records.length);
  assert.equal(afterInvalid.events.length, beforeInvalid.events.length);

  let transition = attemptTransition(runningFixture.plan, state, stoppedAttempt, running.ref,
    'stop_stale', [latestDetail, exact.launchRecord, exact.processRecord], [],
    'stop_stale_exact');
  state = (await runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: binding,
    records: transition.records,
    event: transition.event,
  })).state;
  assert.equal(state.snapshot.phase, 'stopping');
  assert.deepEqual(state.snapshot.attempts, [transition.ref]);

  const cleanupBinding = currentBinding(runningFixture.plan, state);
  const cleanupOperation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_cleanup_stopped_attempt',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'cleanup_workspace:stop_stale',
    kind: 'cleanup_workspace',
    subject: transition.ref,
    binding: cleanupBinding,
    inputDigest: digest('cleanup stopped attempt'),
    expected: [transition.ref],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATEST,
    failureCode: null,
  });
  const cleanupPending = Object.freeze({ ...stoppedAttempt,
    recordVersion: 5,
    previousDigest: transition.ref.digest,
    binding: cleanupBinding,
    state: 'cleanup_pending',
  });
  transition = attemptTransition(runningFixture.plan, state, cleanupPending, transition.ref,
    'cleanup_intended', [record('operation', cleanupOperation.operationId, cleanupOperation)], [],
    'stop_cleanup_pending');
  state = (await runningFixture.runtime.commitTransition({
    runId: runningFixture.plan.runId,
    expectedBinding: cleanupBinding,
    records: transition.records,
    event: transition.event,
  })).state;
  assert.equal(state.snapshot.phase, 'stopping');

  const terminalFixture = await fixture(t);
  let terminalState = (await terminalFixture.runtime.start(terminalFixture.input)).state;
  const terminal = await driveAttempt(terminalFixture.runtime, terminalFixture.plan, terminalState,
    'stop_terminal');
  terminalState = terminal.state;
  const terminalStop = await terminalFixture.runtime.publishStopRequest({
    runId: terminalFixture.plan.runId,
    requestId: 'stop_terminal_attempt',
    expectedControlGeneration: 0,
    reason: 'Stop after terminal observation.',
  });
  terminalState = (await terminalFixture.runtime.acceptControls({
    runId: terminalFixture.plan.runId,
    expectedEpoch: 1,
  })).state;
  const terminalDetailRecord = acceptedControlRecord(
    await replayRun(terminalFixture.ledger, terminalFixture.plan.runId), terminalStop.request);
  const terminalDetail = { kind: 'detail', id: terminalDetailRecord.id, version: 1,
    value: null, publish: false,
    ref: { kind: 'detail', id: terminalDetailRecord.id, digest: terminalDetailRecord.digest } };
  const terminalBinding = currentBinding(terminalFixture.plan, terminalState);
  const terminalStale = Object.freeze({ ...terminal.attempt,
    recordVersion: 5,
    previousDigest: terminal.ref.digest,
    binding: terminalBinding,
    state: 'stale',
  });
  const terminalTransition = attemptTransition(terminalFixture.plan, terminalState,
    terminalStale, terminal.ref, 'stop_stale', [terminalDetail], [], 'stop_terminal_stale');
  terminalState = (await terminalFixture.runtime.commitTransition({
    runId: terminalFixture.plan.runId,
    expectedBinding: terminalBinding,
    records: terminalTransition.records,
    event: terminalTransition.event,
  })).state;
  assert.equal(terminalState.snapshot.phase, 'stopping');

  const allocatedFixture = await fixture(t);
  let allocatedState = (await allocatedFixture.runtime.start(allocatedFixture.input)).state;
  const neverLaunched = await driveAttempt(allocatedFixture.runtime, allocatedFixture.plan,
    allocatedState, 'stop_allocated_cleanup', 'allocated');
  allocatedState = neverLaunched.state;
  const allocatedStop = await allocatedFixture.runtime.publishStopRequest({
    runId: allocatedFixture.plan.runId,
    requestId: 'stop_allocated_attempt',
    expectedControlGeneration: 0,
    reason: 'Stop before the attempt launches.',
  });
  allocatedState = (await allocatedFixture.runtime.acceptControls({
    runId: allocatedFixture.plan.runId,
    expectedEpoch: 1,
  })).state;
  const allocatedDetailRecord = acceptedControlRecord(
    await replayRun(allocatedFixture.ledger, allocatedFixture.plan.runId), allocatedStop.request);
  const allocatedDetail = { kind: 'detail', id: allocatedDetailRecord.id, version: 1,
    value: null, publish: false,
    ref: { kind: 'detail', id: allocatedDetailRecord.id, digest: allocatedDetailRecord.digest } };
  let allocatedBinding = currentBinding(allocatedFixture.plan, allocatedState);
  const allocatedStale = Object.freeze({ ...neverLaunched.attempt,
    recordVersion: 2,
    previousDigest: neverLaunched.ref.digest,
    binding: allocatedBinding,
    state: 'stale',
  });
  let allocatedTransition = attemptTransition(allocatedFixture.plan, allocatedState,
    allocatedStale, neverLaunched.ref, 'stop_stale', [allocatedDetail], [],
    'stop_allocated_stale');
  allocatedState = (await allocatedFixture.runtime.commitTransition({
    runId: allocatedFixture.plan.runId,
    expectedBinding: allocatedBinding,
    records: allocatedTransition.records,
    event: allocatedTransition.event,
  })).state;
  let allocatedPreviousRef = allocatedTransition.ref;

  allocatedBinding = currentBinding(allocatedFixture.plan, allocatedState);
  const allocatedCleanupIntent = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_cleanup_allocated_attempt',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'cleanup_workspace:allocated_stop',
    kind: 'cleanup_workspace',
    subject: allocatedPreviousRef,
    binding: allocatedBinding,
    inputDigest: digest('cleanup allocated attempt'),
    expected: [allocatedPreviousRef],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATEST,
    failureCode: null,
  });
  const allocatedCleanupIntentRecord = record('operation', allocatedCleanupIntent.operationId,
    allocatedCleanupIntent);
  const allocatedCleanupPending = Object.freeze({ ...allocatedStale,
    recordVersion: 3,
    previousDigest: allocatedPreviousRef.digest,
    binding: allocatedBinding,
    state: 'cleanup_pending',
  });
  allocatedTransition = attemptTransition(allocatedFixture.plan, allocatedState,
    allocatedCleanupPending, allocatedPreviousRef, 'cleanup_intended',
    [allocatedCleanupIntentRecord], [], 'stop_allocated_cleanup_pending');
  allocatedState = (await allocatedFixture.runtime.commitTransition({
    runId: allocatedFixture.plan.runId,
    expectedBinding: allocatedBinding,
    records: allocatedTransition.records,
    event: allocatedTransition.event,
  })).state;
  allocatedPreviousRef = allocatedTransition.ref;

  allocatedBinding = currentBinding(allocatedFixture.plan, allocatedState);
  const allocatedCleanupReceipt = Object.freeze({
    schemaVersion: 1,
    receiptId: 'workspace_cleanup_allocated_attempt',
    binding: allocatedBinding,
    attemptId: allocatedStale.attemptId,
    resourceKey: `workspace:${allocatedStale.workspace.workspaceId}`,
    action: 'cleanup',
    ownershipTokenDigest: allocatedStale.workspace.rootIdentity,
    observedIdentityDigest: null,
    outcome: 'succeeded',
    evidence: [],
    observedAt: LATEST,
  });
  const allocatedCleanupReceiptRecord = record('resource_receipt',
    allocatedCleanupReceipt.receiptId, allocatedCleanupReceipt);
  const allocatedCleanupObserved = Object.freeze({ ...allocatedCleanupIntent,
    recordVersion: 2,
    previousDigest: allocatedCleanupIntentRecord.ref.digest,
    binding: allocatedBinding,
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: allocatedCleanupReceiptRecord.ref,
  });
  const allocatedCleaned = Object.freeze({ ...allocatedCleanupPending,
    recordVersion: 4,
    previousDigest: allocatedPreviousRef.digest,
    binding: allocatedBinding,
    state: 'cleaned',
  });
  allocatedTransition = attemptTransition(allocatedFixture.plan, allocatedState,
    allocatedCleaned, allocatedPreviousRef, 'cleanup_observed', [
      record('operation', allocatedCleanupObserved.operationId, allocatedCleanupObserved,
        { version: 2 }),
      allocatedCleanupReceiptRecord,
    ], [], 'stop_allocated_cleaned');
  allocatedState = (await allocatedFixture.runtime.commitTransition({
    runId: allocatedFixture.plan.runId,
    expectedBinding: allocatedBinding,
    records: allocatedTransition.records,
    event: allocatedTransition.event,
  })).state;
  assert.equal(allocatedState.snapshot.phase, 'stopping');
  assert.deepEqual(allocatedState.snapshot.attempts, [allocatedTransition.ref]);

  const quarantineFixture = await fixture(t);
  let quarantineState = (await quarantineFixture.runtime.start(quarantineFixture.input)).state;
  const quarantineRunning = await driveAttempt(quarantineFixture.runtime, quarantineFixture.plan,
    quarantineState, 'stop_quarantine', 'running');
  quarantineState = quarantineRunning.state;
  const quarantineStop = await quarantineFixture.runtime.publishStopRequest({
    runId: quarantineFixture.plan.runId,
    requestId: 'stop_quarantine_attempt',
    expectedControlGeneration: 0,
    reason: 'Quarantine if emptiness remains unproved.',
  });
  quarantineState = (await quarantineFixture.runtime.acceptControls({
    runId: quarantineFixture.plan.runId,
    expectedEpoch: 1,
  })).state;
  const quarantineDetailRecord = acceptedControlRecord(
    await replayRun(quarantineFixture.ledger, quarantineFixture.plan.runId),
    quarantineStop.request);
  const quarantineDetail = { kind: 'detail', id: quarantineDetailRecord.id, version: 1,
    value: null, publish: false,
    ref: { kind: 'detail', id: quarantineDetailRecord.id,
      digest: quarantineDetailRecord.digest } };
  const quarantineBinding = currentBinding(quarantineFixture.plan, quarantineState);
  const quarantined = Object.freeze({ ...quarantineRunning.attempt,
    recordVersion: 4,
    previousDigest: quarantineRunning.ref.digest,
    binding: quarantineBinding,
    state: 'quarantined',
  });
  const unresolvedProcess = Object.freeze({
    ...processReceiptFor(quarantined, quarantineBinding, 'process_stop_quarantined', {
      action: 'interrupt', descendantsComplete: false,
    }),
  });
  const unresolvedProcessRecord = record('process_receipt', unresolvedProcess.receiptId,
    unresolvedProcess);
  const unresolvedLaunch = Object.freeze({
    ...quarantineRunning.runningLaunch,
    recordVersion: 2,
    previousDigest: canonicalDigest(quarantineRunning.runningLaunch),
    binding: quarantineBinding,
    providerHandleRef: unresolvedProcessRecord.ref,
    completedAt: LATEST,
    exitCode: 0,
    outcome: 'exited',
  });
  const quarantineTransition = attemptTransition(quarantineFixture.plan, quarantineState,
    quarantined, quarantineRunning.ref, 'stop_quarantined', [quarantineDetail,
      record('launch_receipt', unresolvedLaunch.receiptId, unresolvedLaunch, { version: 2 }),
      unresolvedProcessRecord], [], 'stop_process_quarantined');
  quarantineState = (await quarantineFixture.runtime.commitTransition({
    runId: quarantineFixture.plan.runId,
    expectedBinding: quarantineBinding,
    records: quarantineTransition.records,
    event: quarantineTransition.event,
  })).state;
  assert.equal(quarantineState.snapshot.phase, 'stopping');
  assert.deepEqual(quarantineState.snapshot.attempts, [quarantineTransition.ref]);

  const dormantFixture = await fixture(t);
  let dormantState = (await dormantFixture.runtime.start(dormantFixture.input)).state;
  const allocated = await driveAttempt(dormantFixture.runtime, dormantFixture.plan, dormantState,
    'stop_non_stopping', 'allocated');
  dormantState = allocated.state;
  const dormantBinding = currentBinding(dormantFixture.plan, dormantState);
  const invalidStopDetail = Object.freeze({
    schemaVersion: 1,
    recordType: 'accepted_control',
    requestId: 'stop_not_accepted',
    requestDigest: digest('stop not accepted'),
    expectedEpoch: 1,
    expectedControlGeneration: 0,
    kind: 'stop',
    mode: 'checkpoint',
    reasonDigest: digest('not stopping'),
    acceptedAt: LATEST,
  });
  const invalidStopDetailRecord = record('detail', 'control_not_accepted', invalidStopDetail);
  const invalidStale = Object.freeze({ ...allocated.attempt,
    recordVersion: 2,
    previousDigest: allocated.ref.digest,
    binding: dormantBinding,
    state: 'stale',
  });
  const nonStopping = attemptTransition(dormantFixture.plan, dormantState, invalidStale,
    allocated.ref, 'stop_stale', [invalidStopDetailRecord], [], 'stop_not_stopping');
  await assert.rejects(dormantFixture.runtime.commitTransition({
    runId: dormantFixture.plan.runId,
    expectedBinding: dormantBinding,
    records: nonStopping.records,
    event: nonStopping.event,
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));
});

test('writer seam reduces typed lifecycle evidence and pipeline journal versions without effects', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  let state = (await runtime.start(input)).state;

  const orientation = orientationTransition(plan, state);
  let committed = await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record], event: orientation.event });
  state = committed.state;
  assert.equal(state.snapshot.phase, 'orienting');

  let binding = currentBinding(plan, state);
  const launchOperation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_root_launch',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'launch_job:root_tick',
    kind: 'launch_job',
    subject: orientation.ref,
    binding,
    inputDigest: digest('root launch'),
    expected: [orientation.ref],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: LATER,
    failureCode: null,
  });
  const launchOperationRef = ref('operation', launchOperation.operationId, launchOperation);
  const journal = runtime.pipelineJournal({ runId: plan.runId, expectedBinding: binding });
  assert.equal((await journal.publish('operation', launchOperation.operationId,
    launchOperation)).ref.digest, launchOperationRef.digest);
  assert.deepEqual((await journal.read('operation', launchOperation.operationId)).value,
    launchOperation);
  committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    event: lifecycleEvent({ id: 'event_root_launch', sequence: state.snapshot.eventCursor + 1,
      binding, kind: 'operation_transition', subject: launchOperationRef }) });
  state = committed.state;
  assert.equal(state.snapshot.phase, 'judgment_required');
  assert.deepEqual(state.snapshot.operations, [launchOperationRef]);

  const proposal = Object.freeze({ schemaVersion: 1, rationale: 'Checkpoint the active task.',
    kind: 'checkpoint_task', status: 'active', nextSafeAction: 'Run exact verification.' });
  const rootSource = await driveRootAttempt(runtime, plan, state, 'root_tick', proposal,
    'decision_wait', orientation);
  state = rootSource.state;
  const rootDecision = decisionTransition(plan, state, proposal, 'decision_wait', [], rootSource);
  const decisionRef = rootDecision.ref;
  binding = currentBinding(plan, state);
  committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: rootDecision.records, event: rootDecision.event });
  state = committed.state;
  assert.equal(state.snapshot.phase, 'intent_published');

  binding = currentBinding(plan, state);
  const checkReceipt = Object.freeze({
    schemaVersion: 1,
    receiptId: 'check_runtime',
    binding,
    checkId: 'check_runtime',
    catalogDigest: digest('catalog'),
    candidateId: 'candidate_runtime',
    candidateTree: plan.manifest.repository.baseTree,
    inputScopeDigest: digest('scope'),
    commandDigest: digest('command'),
    environmentDigest: digest('check environment'),
    resourcesDigest: digest('check resources'),
    outcome: 'pass',
    exitCode: 0,
    evidence: [],
    startedAt: NOW,
    completedAt: LATEST,
  });
  const checkRef = ref('check_receipt', checkReceipt.receiptId, checkReceipt);
  const checkOperation = Object.freeze({
    schemaVersion: 1,
    operationId: 'operation_check',
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: 'run_check:runtime',
    kind: 'run_check',
    subject: decisionRef,
    binding,
    inputDigest: digest('check input'),
    expected: [decisionRef],
    state: 'observed_succeeded',
    attemptNumber: 1,
    receipt: checkRef,
    observedAt: LATEST,
    failureCode: null,
  });
  const checkOperationRef = ref('operation', checkOperation.operationId, checkOperation);
  committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [
      { kind: 'operation', id: checkOperation.operationId, version: 1, value: checkOperation },
      { kind: 'check_receipt', id: checkReceipt.receiptId, version: 1, value: checkReceipt },
    ],
    event: lifecycleEvent({ id: 'event_check', sequence: state.snapshot.eventCursor + 1,
      binding, kind: 'operation_transition', subject: checkOperationRef, payload: checkRef,
      observedAt: LATEST }) });
  state = committed.state;
  assert.equal(state.snapshot.phase, 'verifying');
  assert.deepEqual(state.snapshot.checks, [checkRef]);

  binding = currentBinding(plan, state);
  const wrongWake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['candidate_integrated'], deadlineAt: null, observedAt: LATEST });
  const wrongWakeRef = ref('detail', 'wake_check_wrong_reason', wrongWake);
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: wrongWakeRef.id, version: 1, value: wrongWake }],
    event: lifecycleEvent({ id: 'event_wake_check_wrong_reason',
      sequence: state.snapshot.eventCursor + 1, binding, kind: 'wake_due',
      subject: wrongWakeRef, observedAt: LATEST }),
  }), hasCode('RUNTIME_RECONCILIATION_REQUIRED'));

  const wake = Object.freeze({ schemaVersion: 1, recordType: 'wake_due', binding,
    reasons: ['verification_complete'], deadlineAt: null, observedAt: LATEST });
  const wakeRef = ref('detail', 'wake_check', wake);
  committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'detail', id: wakeRef.id, version: 1, value: wake }],
    event: lifecycleEvent({ id: 'event_wake', sequence: state.snapshot.eventCursor + 1,
      binding, kind: 'wake_due', subject: wakeRef, observedAt: LATEST }) });
  state = committed.state;
  assert.equal(state.snapshot.phase, 'dormant');
  assert.deepEqual(state.snapshot.pendingWakeReasons, ['verification_complete']);

  binding = currentBinding(plan, state);
  const completedBinding = Object.freeze({
    ...binding,
    taskRecordVersion: binding.taskRecordVersion + 1,
  });
  const terminal = Object.freeze({
    schemaVersion: 1,
    receiptId: 'terminal_runtime',
    binding: completedBinding,
    disposition: 'succeeded',
    candidateId: 'candidate_runtime',
    finalTree: plan.manifest.repository.baseTree,
    finalCommit: plan.manifest.repository.baseCommit,
    taskStatus: 'done',
    taskRecordVersion: completedBinding.taskRecordVersion,
    checkReceipts: [checkRef],
    completionEvidenceDigest: digest('completion evidence'),
    emittedAt: LATEST,
  });
  const terminalRef = ref('terminal_receipt', terminal.receiptId, terminal);
  committed = await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'terminal_receipt', id: terminal.receiptId, version: 1, value: terminal }],
    event: lifecycleEvent({ id: 'event_terminal', sequence: state.snapshot.eventCursor + 1,
      binding, kind: 'terminal_published', subject: terminalRef, observedAt: LATEST }) });
  assert.equal(committed.state.snapshot.phase, 'succeeded');
  assert.equal(committed.state.snapshot.taskRecordVersion, completedBinding.taskRecordVersion);
  assert.equal((await runtime.doctor(plan.runId)).ok, true);
});

for (const cutTarget of ['causal_record', 'event']) {
  test(`transition retry recovers after durable ${cutTarget.replace('_', ' ')}`, async (t) => {
    let enabled = false;
    const value = await fixture(t, (cut, details) => {
      const matches = cutTarget === 'causal_record'
        ? details.label === 'detail record orientation_cut version 1'
        : details.label === 'event 2';
      if (enabled && cut === 'after-directory-sync' && matches) {
        throw new Error(`cut:${cutTarget}`);
      }
    });
    const started = await value.runtime.start(value.input);
    const transition = orientationTransition(value.plan, started.state, 'orientation_cut');
    const binding = currentBinding(value.plan, started.state);
    enabled = true;
    await assert.rejects(value.runtime.commitTransition({ runId: value.plan.runId,
      expectedBinding: binding, records: [transition.record], event: transition.event }),
    new RegExp(`cut:${cutTarget}`, 'u'));
    enabled = false;

    const recovered = await value.runtime.commitTransition({ runId: value.plan.runId,
      expectedBinding: binding, records: [transition.record], event: transition.event });
    assert.equal(recovered.disposition, cutTarget === 'event' ? 'recovered' : 'committed');
    assert.equal(recovered.state.snapshot.phase, 'orienting');
    const durable = await replayRun(value.ledger, value.plan.runId);
    assert.equal(durable.events.length, 2);
    assert.equal(durable.records.filter(({ id }) => id === 'orientation_cut').length, 1);
    assert.equal((await value.runtime.doctor(value.plan.runId)).ok, true);
  });
}

test('two concurrent check receipts from one dispatch binding fan in across snapshot revisions', async (t) => {
  const { input, plan, runtime } = await fixture(t);
  let state = (await runtime.start(input)).state;
  const orientation = orientationTransition(plan, state, 'orientation_fan_in');
  state = (await runtime.commitTransition({ runId: plan.runId,
    expectedBinding: currentBinding(plan, state), records: [orientation.record],
    event: orientation.event })).state;
  const dispatchBinding = currentBinding(plan, state);
  const journal = runtime.pipelineJournal({ runId: plan.runId, expectedBinding: dispatchBinding });
  const entries = [];
  for (const suffix of ['left', 'right']) {
    const receipt = Object.freeze({
      schemaVersion: 1,
      receiptId: `check_${suffix}`,
      binding: dispatchBinding,
      checkId: `check_${suffix}`,
      catalogDigest: digest('fan in catalog'),
      candidateId: 'candidate_fan_in',
      candidateTree: plan.manifest.repository.baseTree,
      inputScopeDigest: digest(`scope ${suffix}`),
      commandDigest: digest(`command ${suffix}`),
      environmentDigest: digest('fan in environment'),
      resourcesDigest: digest('fan in resources'),
      outcome: 'pass',
      exitCode: 0,
      evidence: [],
      startedAt: NOW,
      completedAt: LATER,
    });
    const receiptRef = ref('check_receipt', receipt.receiptId, receipt);
    const operation = Object.freeze({
      schemaVersion: 1,
      operationId: `operation_${suffix}`,
      recordVersion: 1,
      previousDigest: null,
      idempotencyKey: `run_check:${suffix}`,
      kind: 'run_check',
      subject: orientation.ref,
      binding: dispatchBinding,
      inputDigest: digest(`input ${suffix}`),
      expected: [orientation.ref],
      state: 'observed_succeeded',
      attemptNumber: 1,
      receipt: receiptRef,
      observedAt: LATER,
      failureCode: null,
    });
    const operationRef = ref('operation', operation.operationId, operation);
    await journal.publish('operation', operation.operationId, operation);
    await journal.publish('check_receipt', receipt.receiptId, receipt);
    entries.push({ operation, operationRef, receipt, receiptRef });
  }

  for (const [index, entry] of entries.entries()) {
    const eventBinding = currentBinding(plan, state);
    const committed = await runtime.commitTransition({ runId: plan.runId,
      expectedBinding: eventBinding,
      event: lifecycleEvent({ id: `event_fan_in_${index + 1}`,
        sequence: state.snapshot.eventCursor + 1, binding: eventBinding,
        kind: 'operation_transition', subject: entry.operationRef, payload: entry.receiptRef }) });
    state = committed.state;
    assert.equal((await journal.read('operation', entry.operation.operationId)).ref.digest,
      entry.operationRef.digest);
  }
  assert.deepEqual(state.snapshot.checks.map(({ id }) => id), ['check_left', 'check_right']);
  assert.equal(state.reconciliationRequired, false);
});

test('writer seam rejects missing evidence and conflicting retry without publishing an event', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  const state = (await runtime.start(input)).state;
  const transition = orientationTransition(plan, state, 'orientation_conflict');
  const binding = currentBinding(plan, state);
  const missingRef = { ...transition.ref, digest: digest('missing orientation') };
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [transition.record], event: { ...transition.event, subject: missingRef, payload: missingRef } }),
  (error) => error?.code === 'TRANSITION_EVIDENCE_MISSING' && error.reconciliationRequired === true);
  assert.equal((await replayRun(ledger, plan.runId)).events.length, 1);

  await runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [transition.record], event: transition.event });
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [transition.record], event: { ...transition.event, observedAt: LATEST } }),
  (error) => error?.code === 'TRANSITION_EVENT_CONFLICT' && error.reconciliationRequired === true);
  assert.equal((await replayRun(ledger, plan.runId)).events.length, 2);
});

test('successful terminal publication permits only the exact one-version task advance', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  const state = (await runtime.start(input)).state;
  const binding = currentBinding(plan, state);
  const invalidBinding = { ...binding, taskRecordVersion: binding.taskRecordVersion + 2 };
  const receipt = Object.freeze({
    schemaVersion: 1,
    receiptId: 'terminal_skipped_task_version',
    binding: invalidBinding,
    disposition: 'succeeded',
    candidateId: 'candidate_terminal',
    finalTree: plan.manifest.repository.baseTree,
    finalCommit: plan.manifest.repository.baseCommit,
    taskStatus: 'done',
    taskRecordVersion: invalidBinding.taskRecordVersion,
    checkReceipts: [],
    completionEvidenceDigest: digest('terminal completion'),
    emittedAt: LATEST,
  });
  const receiptRef = ref('terminal_receipt', receipt.receiptId, receipt);
  await assert.rejects(runtime.commitTransition({ runId: plan.runId, expectedBinding: binding,
    records: [{ kind: 'terminal_receipt', id: receipt.receiptId, version: 1, value: receipt }],
    event: lifecycleEvent({ id: 'event_terminal_skip', sequence: 2, binding,
      kind: 'terminal_published', subject: receiptRef, observedAt: LATEST }) }),
  hasCode('BINDING_STALE'));
  assert.equal((await replayRun(ledger, plan.runId)).events.length, 1);
});

test('the reducer flags unsupported immutable events without trusting snapshot cache', async (t) => {
  const { input, plan, ledger, runtime } = await fixture(t);
  await runtime.start(input);
  const durable = await replayRun(ledger, plan.runId);
  const unsupported = structuredClone(durable);
  unsupported.events[0].value.kind = 'wake_due';
  unsupported.events[0].digest = canonicalDigest(unsupported.events[0].value);
  const derived = deriveImplementationRuntimeState(unsupported);
  assert.equal(derived.reconciliationRequired, true);
  assert.equal(derived.snapshot.phase, 'reconciliation_required');
  assert.equal(derived.snapshot.reconciliation.reasonCode, 'replay_unsupported');
});
