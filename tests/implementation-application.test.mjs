import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  canonicalDigest,
  validateEvent,
  validatePersistedRecord,
  validateRootLaunchIntent,
} from '../lib/implementation-protocol.mjs';
import { workspaceIdentity } from '../lib/implementation-workspace.mjs';
import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const { createImplementationApplicationService } =
  await import('../lib/implementation-application.mjs');
const { planImplementationStart } = await import('../lib/implementation-supervisor.mjs');
const { changedPathsBetweenTrees, issueSourceInstrumentedTestCapability } =
  await import('../lib/implementation-git.mjs');

const NOW = '2026-08-15T03:00:00Z';
const DONE = '2026-08-15T03:05:00Z';
const oid = (character) => character.repeat(40);
const digest = (label) => canonicalDigest({ label });
const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'],
  { encoding: 'utf8' }).trim()));

function command(root, args, { input = undefined } = {}) {
  return execFileSync(git, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: NOW, GIT_COMMITTER_DATE: NOW,
    },
  }).trim();
}

function repositoryFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-app-repo-')));
  command(root, ['init', '--quiet', '--initial-branch=main']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'base.mjs'), 'export const base = true;\n');
  command(root, ['add', '--', 'src/base.mjs']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  return { root, baseCommit: command(root, ['rev-parse', 'HEAD']),
    baseTree: command(root, ['rev-parse', 'HEAD^{tree}']) };
}

function activation(effectKind, binding) {
  return issueSourceInstrumentedTestCapability(effectKind);
}

function emptyPatchDigest(root, tree) {
  const bytes = execFileSync(git, [
    'diff-tree', '--binary', '--full-index', '--no-ext-diff', '-r', '--no-renames',
    tree, tree, '--',
  ], { cwd: root });
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function planInput(repository = null) {
  return {
    command: {
      command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
      harness: 'codex', maxConcurrency: 2, shadow: false,
    },
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the leaf application service.',
      authority: 'T-0054 revision 2 authorizes offline composition.',
      route: 'initiative', risk: 'critical', gateDigest: digest('gate'),
      acceptance: [], nonGoals: [], assumptions: [], decisions: [], detailDigests: [],
      checkCatalogDigest: digest('checks'),
    },
    activeTaskId: 'T-0054',
    store: { storeId: 'task_store', storeGeneration: digest('store') },
    repository: {
      rootIdentity: digest('root'), objectFormat: 'sha1',
      baseCommit: repository?.baseCommit ?? oid('1'),
      head: repository?.baseCommit ?? oid('1'), tree: repository?.baseTree ?? oid('2'),
      statusDigest: digest('status'),
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

function bindingFrom(plan, snapshot) {
  return {
    runId: plan.runId,
    epoch: snapshot.epoch,
    snapshotRevision: snapshot.revision,
    taskId: plan.capsule.taskId,
    taskRevision: plan.capsule.taskRevision,
    taskRecordVersion: snapshot.taskRecordVersion,
    capsuleDigest: canonicalDigest(plan.capsule),
    controlGeneration: snapshot.controlGeneration,
    correctionGeneration: snapshot.correctionGeneration,
  };
}

function fakeRuntime(input, { firstDisposition = 'started' } = {}) {
  const plan = planImplementationStart(input);
  const histories = new Map();
  const controls = { stop: null };
  const acceptedControls = [];
  let released = false;
  const snapshot = {
    schemaVersion: 1,
    runId: plan.runId,
    revision: 2,
    previousDigest: digest('snapshot-1'),
    epoch: 1,
    controlGeneration: 0,
    phase: 'dormant',
    taskRecordVersion: plan.capsule.taskRecordVersion,
    correctionGeneration: 0,
    integration: { candidateId: null, tree: plan.capsule.baseCommit, privateHead: plan.capsule.baseCommit },
    eventCursor: 1,
    assignments: [], attempts: [], operations: [], checks: [], resources: [],
    pendingWakeReasons: ['start'],
    stop: { requested: false, mode: null, reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
    updatedAt: NOW,
  };
  const events = [];
  let startedOnce = false;
  let loseRootCas = false;
  const controlWaiters = new Set();

  function key(kind, id) { return `${kind}\0${id}`; }
  function state() {
    return { runId: plan.runId, snapshot: structuredClone(snapshot),
      acceptedControls: structuredClone(acceptedControls), pendingControls: [], history: [],
      reconciliationRequired: snapshot.reconciliation.required };
  }
  function currentBinding() { return bindingFrom(plan, snapshot); }
  function assertBinding(expected) {
    assert.equal(canonicalDigest(expected), canonicalDigest(currentBinding()));
  }
  function assertAuthority(expected) {
    const current = currentBinding();
    for (const key of ['runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion',
      'capsuleDigest', 'controlGeneration', 'correctionGeneration']) {
      assert.equal(expected[key], current[key]);
    }
  }
  function versions(kind, id) { return histories.get(key(kind, id)) ?? []; }
  function put(kind, id, version, value) {
    const list = versions(kind, id);
    const prior = list.find((item) => item.version === version);
    if (prior !== undefined) {
      assert.equal(canonicalDigest(prior.value), canonicalDigest(value));
      return prior;
    }
    if (kind !== 'detail') validatePersistedRecord(kind, value);
    const record = { kind, id, version, value: structuredClone(value), digest: canonicalDigest(value) };
    histories.set(key(kind, id), [...list, record].sort((a, b) => a.version - b.version));
    return record;
  }

  return {
    plan,
    events,
    records: histories,
    loseNextRootCas() { loseRootCas = true; },
    get released() { return released; },
    publishExternalStop(request) {
      controls.stop = structuredClone(request);
      for (const wake of [...controlWaiters]) wake(structuredClone(request));
    },
    async start() {
      const disposition = startedOnce ? 'already_started' : firstDisposition;
      startedOnce = true;
      return { disposition, runId: plan.runId, state: state() };
    },
    async attachExisting({ expectedEpoch }) {
      assert.equal(expectedEpoch, snapshot.epoch);
      return { disposition: 'attached', runId: plan.runId,
        lock: { epoch: snapshot.epoch }, state: state() };
    },
    async readLifecycle({ after = null, limit = 128 }) {
      const all = [...histories.values()].flat()
        .sort((left, right) => left.kind.localeCompare(right.kind, 'en') ||
          left.id.localeCompare(right.id, 'en') || left.version - right.version);
      const offset = after === null ? 0 : all.findIndex((record) =>
        record.kind === after.kind && record.id === after.id && record.version === after.version) + 1;
      const records = all.slice(offset, offset + limit).map((record) => structuredClone(record));
      const last = records.at(-1);
      return {
        runId: plan.runId,
        authority: { manifest: structuredClone(plan.manifest), capsule: structuredClone(plan.capsule),
          capsuleDigest: canonicalDigest(plan.capsule) },
        state: state(),
        records,
        next: offset + records.length < all.length
          ? { kind: last.kind, id: last.id, version: last.version }
          : null,
      };
    },
    async status() { return state(); },
    pipelineJournal({ expectedBinding }) {
      assertAuthority(expectedBinding);
      return Object.freeze({
        async read(kind, id) {
          assertAuthority(expectedBinding);
          const found = versions(kind, id).at(-1);
          return found === undefined ? null : {
            value: structuredClone(found.value),
            ref: { kind, id, digest: found.digest },
          };
        },
        async publish(kind, id, value) {
          assertAuthority(expectedBinding);
          const version = Number.isSafeInteger(value.recordVersion) ? value.recordVersion : 1;
          const record = put(kind, id, version, value);
          return { value: structuredClone(value), ref: { kind, id, digest: record.digest } };
        },
      });
    },
    async commitTransition({ expectedBinding, records = [], event }) {
      assertBinding(expectedBinding);
      if (event.kind === 'root_decision_accepted' && loseRootCas) {
        loseRootCas = false;
        const error = new Error('competing Root decision won');
        error.code = 'BINDING_STALE';
        throw error;
      }
      validateEvent(event, { expectedBinding });
      assert.equal(event.sequence, snapshot.eventCursor + 1);
      for (const record of records) put(record.kind, record.id, record.version, record.value);
      events.push(structuredClone(event));
      snapshot.revision += 1;
      snapshot.eventCursor += 1;
      snapshot.previousDigest = digest(`snapshot-${snapshot.revision - 1}`);
      snapshot.updatedAt = event.observedAt;
      snapshot.pendingWakeReasons = [];
      if (event.kind === 'orientation_published') snapshot.phase = 'orienting';
      if (event.kind === 'root_decision_accepted') {
        const decision = versions('decision', event.payload.id).at(-1).value;
        snapshot.phase = decision.proposal.kind === 'wait' ? 'waiting'
          : decision.proposal.kind === 'stop' ? 'stopping'
            : decision.proposal.kind === 'finalize' ? 'finalizing' : 'intent_published';
        snapshot.assignments = [
          ...snapshot.assignments.filter((existing) =>
            !decision.derivedAssignments.some((added) => added.id === existing.id)),
          ...decision.derivedAssignments,
        ];
        if (decision.proposal.kind === 'request_correction') snapshot.correctionGeneration += 1;
      }
      if (event.kind === 'result_observed') {
        snapshot.attempts = [...snapshot.attempts.filter((ref) => ref.id !== event.subject.id),
          event.subject];
        if (snapshot.phase === 'executing') snapshot.phase = 'dormant';
      }
      if (event.kind === 'attempt_transition') {
        snapshot.attempts = [...snapshot.attempts.filter((ref) => ref.id !== event.subject.id),
          event.subject];
      }
      if (event.kind === 'operation_transition') {
        const operation = versions('operation', event.subject.id).at(-1).value;
        if (snapshot.phase === 'orienting' && operation.kind === 'launch_job') {
          snapshot.phase = 'judgment_required';
        } else if (snapshot.phase === 'intent_published') {
          snapshot.phase = operation.kind === 'run_check' ? 'verifying' : 'executing';
        }
        snapshot.operations = [...snapshot.operations.filter((ref) => ref.id !== event.subject.id),
          event.subject];
        if (event.payload.kind === 'check_receipt') {
          snapshot.checks = [...snapshot.checks.filter((ref) => ref.id !== event.payload.id),
            event.payload];
        }
        if (event.payload.kind === 'candidate') {
          const candidate = versions('candidate', event.payload.id).at(-1).value;
          snapshot.integration = {
            candidateId: candidate.candidateId,
            tree: candidate.tree,
            privateHead: candidate.privateCommit,
          };
        }
      }
      if (event.kind === 'wake_due') {
        snapshot.phase = 'dormant';
        snapshot.pendingWakeReasons = versions('detail', event.payload.id).at(-1).value.reasons;
      }
      if (event.kind === 'terminal_published') {
        const receipt = versions('terminal_receipt', event.payload.id).at(-1).value;
        snapshot.phase = receipt.disposition;
        snapshot.taskRecordVersion = receipt.taskRecordVersion;
      }
      return { disposition: 'committed', runId: plan.runId, state: state(),
        eventRef: { kind: 'event', id: event.eventId, digest: canonicalDigest(event) },
        recordRefs: records.map(({ kind, id, value }) => ({ kind, id, digest: canonicalDigest(value) })) };
    },
    async runUntilQuiescent() {
      if (controls.stop !== null && !snapshot.stop.requested) {
        snapshot.revision += 1;
        snapshot.eventCursor += 1;
        snapshot.controlGeneration += 1;
        snapshot.phase = 'stopping';
        snapshot.stop = { requested: true, mode: 'checkpoint', reasonDigest: digest(controls.stop.reason) };
        const detail = {
          schemaVersion: 1, recordType: 'accepted_control', requestId: controls.stop.requestId,
          requestDigest: canonicalDigest({ kind: 'stop', ...controls.stop }),
          expectedEpoch: snapshot.epoch,
          expectedControlGeneration: controls.stop.expectedControlGeneration,
          kind: 'stop', mode: 'checkpoint', reasonDigest: digest(controls.stop.reason), acceptedAt: DONE,
        };
        const id = `ctl_${canonicalDigest({ kind: 'stop', ...controls.stop }).slice(7, 31)}`;
        put('detail', id, 1, detail);
        acceptedControls.push({ requestId: controls.stop.requestId, kind: 'stop',
          eventId: `event_${id}`, controlGeneration: snapshot.controlGeneration,
          epoch: snapshot.epoch, request: { kind: 'stop', ...controls.stop },
          acceptedAt: DONE, detailRef: { kind: 'detail', id, digest: canonicalDigest(detail) },
          detail });
      }
      return { disposition: snapshot.stop.requested ? 'stopping' : 'quiescent', state: state() };
    },
    async publishStopRequest(request) {
      assert.equal(request.expectedControlGeneration, snapshot.controlGeneration);
      controls.stop = request;
      return { disposition: 'published' };
    },
    async publishResumeRequest(request) {
      assert.equal(request.expectedEpoch, snapshot.epoch);
      assert.equal(request.expectedControlGeneration, snapshot.controlGeneration);
      return { disposition: 'published' };
    },
    async waitForControl({ expectedEpoch, expectedControlGeneration, signal }) {
      assert.equal(expectedEpoch, snapshot.epoch);
      assert.equal(expectedControlGeneration, snapshot.controlGeneration);
      if (controls.stop !== null) {
        return { disposition: 'control_observed', runId: plan.runId,
          request: structuredClone(controls.stop) };
      }
      return new Promise((resolve, reject) => {
        const wake = (request) => {
          cleanup();
          resolve({ disposition: 'control_observed', runId: plan.runId, request });
        };
        const abort = () => {
          cleanup();
          const error = new Error('control wait aborted');
          error.code = 'CONTROL_WAIT_ABORTED';
          reject(error);
        };
        const cleanup = () => {
          controlWaiters.delete(wake);
          signal?.removeEventListener('abort', abort);
        };
        controlWaiters.add(wake);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted === true) abort();
      });
    },
    async doctor() { return { ok: true, issues: [] }; },
    async release() { released = true; return { released: true }; },
  };
}

function assignmentProposal(proposalId, writePath, dependencies = [], resources = []) {
  return {
    proposalId,
    role: 'implementer',
    goal: `Implement ${proposalId}.`,
    scope: [writePath],
    nonGoals: [],
    dependencies,
    ownership: { writePaths: [writePath], readPaths: [] },
    resources,
    checks: [`check_${proposalId.slice(-1)}`],
    restartPolicy: 'never',
  };
}

function rootProposal() {
  return {
    schemaVersion: 1,
    rationale: 'Two independent jobs may overlap; the third waits for A gate evidence.',
    kind: 'declare_assignments',
    assignments: [
      assignmentProposal('proposal_a', 'src/a.mjs', [], [{
        key: 'fixture-cache', mode: 'namespaced_write', namespace: 'proposal_a',
      }]),
      assignmentProposal('proposal_b', 'src/b.mjs'),
      assignmentProposal('proposal_c', 'src/c.mjs', [{
        targetKind: 'proposal', targetId: 'proposal_a', condition: 'gate_pass',
      }]),
    ],
  };
}

function proposalForSemantic(orientation) {
  const semantic = orientation.verification.semantic;
  assert.notEqual(semantic, null);
  if (semantic.kind === 'declare_assignments') return rootProposal();
  if (semantic.kind === 'integrate_candidate') {
    return {
      schemaVersion: 1,
      rationale: 'Select one exact current candidate for integration.',
      kind: 'integrate_candidate',
      candidateId: semantic.candidates[0].candidateId,
    };
  }
  if (semantic.kind === 'schedule_gates') {
    return {
      schemaVersion: 1,
      rationale: 'Run the current candidate gate set.',
      kind: 'schedule_gates',
      candidateId: semantic.candidateId,
      assignments: [],
    };
  }
  if (semantic.kind === 'finalize') {
    return {
      schemaVersion: 1,
      rationale: 'Finalize only the exact verified candidate and receipt set.',
      kind: 'finalize',
      candidateId: semantic.candidateId,
      requiredCheckReceiptIds: semantic.requiredCheckReceiptIds,
      completionEvidenceDigest: digest('completion-evidence'),
    };
  }
  if (semantic.kind === 'wait') {
    return {
      schemaVersion: 1,
      rationale: 'Wait durably for dependency evidence.',
      kind: 'wait',
      reasonCode: 'dependency_wait',
      wakeOn: ['deadline_due'],
      deadlineAt: '2026-08-15T04:00:00Z',
    };
  }
  assert.fail(`unsupported semantic point ${semantic.kind}`);
}

function workerResult(changedPathsClaim = []) {
  return {
    schemaVersion: 1,
    disposition: 'completed',
    summary: 'Proposal only; the supervisor observes all effects.',
    changedPathsClaim,
    checks: [], findings: [], risks: [], knowledgeProposals: [], followUp: [],
  };
}

function fixture({
  proposal = null,
  ambiguousProvider = false,
  holdBackground = false,
  ambiguousInterrupt = false,
  loseAllocationResponse = false,
  loseSpawnResponse = false,
  loseCleanupResponse = false,
  ownershipViolation = false,
  wrongProcessIdentity = false,
  wrongRootPrompt = false,
  wrongRootRequestField = null,
  checkOutcome = () => 'pass',
  initialNow = DONE,
  recoverReadyActivation = false,
} = {}) {
  const repository = repositoryFixture();
  const input = planInput(repository);
  let runtimeInput = input;
  let runtimeFirstDisposition = 'started';
  if (recoverReadyActivation) {
    runtimeInput = structuredClone(input);
    runtimeInput.task.status = 'ready';
    runtimeInput.task.recordVersion = input.task.recordVersion - 1;
    runtimeInput.activeTaskId = null;
    runtimeInput.store.storeGeneration = digest('pre-activation-store');
    input.store.storeGeneration = digest('post-activation-store');
    runtimeFirstDisposition = 'activation_recovered';
  }
  const runtime = fakeRuntime(runtimeInput, { firstDisposition: runtimeFirstDisposition });
  const task = { id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active' };
  const providerEvidence = new Map();
  const providerStarts = new Map();
  const workspaces = new Map();
  const attemptWorkspaces = new Map();
  const workspaceCleanupReceipts = new Map();
  const resources = new Map();
  const candidates = new Map();
  const calls = {
    provider: 0, providerActive: 0, providerMaximum: 0, checks: 0,
    root: 0, finalization: 0, workspaceCleanup: 0, resourceCleanup: 0,
    providerInterrupt: 0, processInterrupt: 0, boundaryAuthorizations: 0,
    workspaceAllocate: 0,
  };
  let firstWaveRelease;
  const firstWave = new Promise((resolve) => { firstWaveRelease = resolve; });
  let backgroundStarted = 0;
  let backgroundReadyResolve;
  const backgroundReady = new Promise((resolve) => { backgroundReadyResolve = resolve; });
  const pendingProviders = new Map();
  const interruptEvidence = new Map();
  const interruptedProcesses = new Set();
  let crashAfterStore = true;
  let allocationResponseLost = false;
  let spawnResponseLost = false;
  let cleanupResponseLost = false;
  let observedNow = initialNow;
  let baseCandidate = null;

  const providerPort = {
    async observe({ attemptId }) {
      const value = providerEvidence.get(attemptId);
      return value === undefined ? { outcome: 'absent' } : { outcome: 'succeeded', value };
    },
    async prepare({ binding, assignment, attempt, mode, requestId }) {
      assert.equal(mode, 'root_decision');
      return {
        schemaVersion: 1,
        requestId,
        jobId: `job_${attempt.attemptId.slice(8)}`,
        binding: { ...binding },
        assignmentId: assignment.assignmentId,
        attemptId: attempt.attemptId,
        role: 'root_decision',
        providerAdapter: wrongRootRequestField === 'provider'
          ? 'another_provider'
          : input.provider.adapter,
        executableVersion: wrongRootRequestField === 'version' ? '0.146.0' : '0.147.0',
        cwdIdentity: wrongRootRequestField === 'cwd'
          ? digest(`wrong-cwd-${attempt.attemptId}`)
          : attempt.workspace.rootIdentity,
        baseTree: assignment.baseTree,
        profileDigest: assignment.profileDigest,
        promptDigest: digest(`root-prompt-${attempt.attemptId}`),
        outputSchemaDigest: digest('root-output-schema'),
        sandbox: assignment.permissions.sandbox,
        approvalPolicy: assignment.permissions.approvalPolicy,
        network: assignment.permissions.network,
        nestedAgents: assignment.permissions.nestedAgents,
        environmentDigest: digest(`environment-${attempt.attemptId}`),
        deadlineAt: assignment.deadlineAt,
      };
    },
    async start({ binding, assignment, attempt, resultId, mode, orientation }) {
      const attemptId = attempt.attemptId;
      calls.provider += 1;
      if (mode === 'root_decision') calls.root += 1;
      const handleProcessIdentityDigest = digest(`process-identity-${attemptId}`);
      const processIdentityDigest = wrongProcessIdentity
        ? digest(`wrong-process-identity-${attemptId}`)
        : handleProcessIdentityDigest;
      const processReceipt = {
        schemaVersion: 1,
        receiptId: `process_running_${attemptId.slice(8)}`,
        binding: { ...binding },
        attemptId,
        requestId: attempt.launchRequestId,
        launcherConnectionId: 'launcher_offline',
        processDomainId: attempt.processDomainId,
        processIdentityDigest,
        action: 'observe',
        state: 'running',
        descendantsComplete: false,
        membersDigest: canonicalDigest([attempt.processDomainId]),
        evidence: [],
        observedAt: NOW,
      };
      const processRef = { kind: 'process_receipt', id: processReceipt.receiptId,
        digest: canonicalDigest(processReceipt) };
      const launchReceipt = {
        schemaVersion: 1,
        receiptId: `launch_${attemptId.slice(8)}`,
        recordVersion: 1,
        previousDigest: null,
        requestId: attempt.launchRequestId,
        binding: { ...binding },
        launcherConnectionId: processReceipt.launcherConnectionId,
        processDomainId: attempt.processDomainId,
        providerHandleRef: processRef,
        argvDigest: digest(`argv-${attemptId}`),
        environmentDigest: digest(`environment-${attemptId}`),
        startedAt: NOW,
        completedAt: null,
        exitCode: null,
        signal: null,
        stdoutDigest: digest(`stdout-${attemptId}`),
        stderrDigest: digest(`stderr-${attemptId}`),
        modelResult: null,
        outcome: 'running',
      };
      interruptEvidence.set(attemptId, { launchReceipt, processReceipt });
      const handle = Object.freeze({
        identity: Object.freeze({ requestId: attempt.launchRequestId,
          launcherConnectionId: processReceipt.launcherConnectionId,
          processDomainId: attempt.processDomainId,
          processIdentityDigest: handleProcessIdentityDigest }),
        expectation: Object.freeze({ launcherConnectionId: processReceipt.launcherConnectionId,
          processDomainId: attempt.processDomainId,
          processIdentityDigest: handleProcessIdentityDigest }),
        async wait() { return {}; }, async observe() { return {}; },
        async interrupt() { return { disposition: 'interrupted' }; },
      });
      const value = { handle, launchReceipt, processReceipt, mode, orientation,
        assignment, attempt, resultId, binding };
      providerStarts.set(attemptId, value);
      if (loseSpawnResponse && !spawnResponseLost) {
        spawnResponseLost = true;
        throw new Error('spawn response lost after exact handle capture');
      }
      return value;
    },
    async recover({ attempt }) { return providerStarts.get(attempt.attemptId) ?? null; },
    async wait({ binding, assignment, attempt, resultId, mode, orientation }) {
      const attemptId = attempt.attemptId;
      const started = providerStarts.get(attemptId);
      if (started === undefined) throw new Error('provider was not started');
      if (mode !== 'root_decision') {
        calls.providerActive += 1;
        calls.providerMaximum = Math.max(calls.providerMaximum, calls.providerActive);
        backgroundStarted += 1;
        if (backgroundStarted === 2) {
          firstWaveRelease();
          backgroundReadyResolve();
        }
        if (!holdBackground && backgroundStarted <= 2) await firstWave;
        const root = attemptWorkspaces.get(attemptId).root;
        const changedPath = ownershipViolation
          ? 'src/outside-owned-path.mjs'
          : assignment.ownership.writePaths[0];
        const target = join(root, ...changedPath.split('/'));
        mkdirSync(resolve(target, '..'), { recursive: true });
        writeFileSync(target, `change from ${assignment.assignmentId}\n`);
      }
      const worker = workerResult(mode === 'root_decision' ? [] : assignment.ownership.writePaths);
      const rootProposalValue = mode === 'root_decision'
        ? (typeof proposal === 'function' ? proposal(orientation)
          : proposal ?? proposalForSemantic(orientation))
        : null;
      const result = mode === 'root_decision' ? {
        schemaVersion: 1,
        recordType: 'root_decision_result',
        worker,
        proposal: rootProposalValue,
        orientationDigest: canonicalDigest(orientation),
        promptDigest: wrongRootPrompt
          ? digest(`wrong-root-prompt-${attemptId}`)
          : digest(`root-prompt-${attemptId}`),
        rawResultDigest: digest(`root-result-${attemptId}`),
      } : worker;
      const resultRef = { kind: 'model_result', id: resultId, digest: canonicalDigest(result) };
      const processEvidence = {
        schemaVersion: 1,
        launcherConnectionId: started.handle.expectation.launcherConnectionId,
        processDomainId: started.handle.expectation.processDomainId,
        processIdentityDigest: started.handle.expectation.processIdentityDigest,
        state: 'empty', descendantsComplete: true, members: [], observedAt: DONE,
      };
      const processReceipt = {
        schemaVersion: 1,
        receiptId: `process_terminal_${attemptId.slice(8)}`,
        binding: { ...binding }, attemptId, requestId: attempt.launchRequestId,
        launcherConnectionId: processEvidence.launcherConnectionId,
        processDomainId: processEvidence.processDomainId,
        processIdentityDigest: processEvidence.processIdentityDigest,
        action: 'observe', state: 'empty', descendantsComplete: true,
        membersDigest: canonicalDigest(processEvidence.members), evidence: [], observedAt: DONE,
      };
      const processRef = { kind: 'process_receipt', id: processReceipt.receiptId,
        digest: canonicalDigest(processReceipt) };
      const launchReceipt = {
        ...started.launchReceipt,
        recordVersion: 2,
        previousDigest: canonicalDigest(started.launchReceipt),
        binding: { ...binding },
        providerHandleRef: processRef,
        completedAt: DONE,
        exitCode: 0,
        modelResult: resultRef,
        outcome: 'exited',
      };
      const evidence = { result, launchReceipt, processReceipt, processEvidence };
      if (holdBackground && mode !== 'root_decision') {
        await new Promise((resolve) => pendingProviders.set(attemptId, { resolve, evidence }));
      }
      if (!ambiguousProvider) providerEvidence.set(attemptId, evidence);
      if (mode !== 'root_decision') calls.providerActive -= 1;
      if (ambiguousProvider) throw new Error('provider response was lost');
      if (mode !== 'root_decision' && crashAfterStore) {
        crashAfterStore = false;
        throw new Error('crash after provider effect before receipt');
      }
      return evidence;
    },
    async interrupt({ attemptId, binding, processReceipt }) {
      calls.providerInterrupt += 1;
      const started = providerStarts.get(attemptId);
      const processRef = { kind: 'process_receipt', id: processReceipt.receiptId,
        digest: canonicalDigest(processReceipt) };
      const launchReceipt = {
        ...started.launchReceipt, recordVersion: 2,
        previousDigest: canonicalDigest(started.launchReceipt), binding: { ...binding },
        providerHandleRef: processRef, completedAt: DONE, exitCode: null, signal: 'SIGTERM',
        modelResult: null, outcome: 'exited',
      };
      interruptEvidence.set(attemptId, { launchReceipt, processReceipt });
      const pending = pendingProviders.get(attemptId);
      if (pending !== undefined) {
        providerEvidence.set(attemptId, pending.evidence);
        pendingProviders.delete(attemptId);
        pending.resolve();
      }
      return { interrupted: true, launchReceipt, processReceipt };
    },
  };

  const workspacePort = {
    async observeRepository() {
      return { baseCommit: repository.baseCommit, head: repository.baseCommit,
        tree: repository.baseTree, statusDigest: digest('status') };
    },
    async observe({ workspaceId }) {
      return workspaces.has(workspaceId)
        ? { outcome: 'succeeded', value: workspaces.get(workspaceId) }
        : { outcome: 'absent' };
    },
    async allocate({ binding, assignment, attemptId, workspaceId, baseCandidate }) {
      calls.workspaceAllocate += 1;
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-app-attempt-')));
      command(root, ['clone', '--quiet', '--no-hardlinks', repository.root, '.']);
      if (baseCandidate !== null) {
        command(root, ['checkout', '--quiet', '--detach', baseCandidate.privateCommit]);
      }
      const identity = workspaceIdentity(root);
      const workspace = { workspaceId, rootIdentity: identity.digest,
        kind: 'isolated_clone', baseTree: assignment.baseTree };
      const receipt = {
        schemaVersion: 1, receiptId: `workspace_allocate_${attemptId.slice(8)}`,
        binding: { ...binding }, attemptId, resourceKey: `workspace:${workspaceId}`,
        action: 'allocate', ownershipTokenDigest: identity.digest,
        observedIdentityDigest: identity.digest, outcome: 'succeeded', evidence: [], observedAt: NOW,
      };
      const value = { workspace, receipt, root,
        baseCommit: command(root, ['rev-parse', 'HEAD']) };
      workspaces.set(workspaceId, value);
      attemptWorkspaces.set(attemptId, value);
      if (loseAllocationResponse && !allocationResponseLost) {
        allocationResponseLost = true;
        throw new Error('allocation response lost after workspace identity capture');
      }
      return value;
    },
    async prepareIngestion({ assignment, attempt, processExpectation, processEvidence }) {
      const held = attemptWorkspaces.get(attempt.attemptId);
      return {
        inspectionInput: {
          workspaceRoot: held.root,
          expectedWorkspaceDigest: attempt.workspace.rootIdentity,
          ownership: assignment.ownership,
          processExpectation,
          processEvidence,
          gitExecutable: git,
        },
        candidateInput: {
          repositoryRoot: repository.root,
          workspaceRoot: held.root,
          gitExecutable: git,
          baseCommit: held.baseCommit,
          allowedPaths: assignment.ownership.writePaths,
          createdAt: DONE,
          commitMetadata: {
            authorName: 'Fixture', authorEmail: 'fixture@example.invalid',
            committerName: 'Fixture', committerEmail: 'fixture@example.invalid',
            timestamp: DONE, message: `Ingest ${attempt.attemptId}\n`,
          },
          capability: activation('git_admin', attempt.binding),
        },
      };
    },
    async observeIngestion() { return { outcome: 'absent' }; },
    async observeIntegration() { return { outcome: 'absent' }; },
    async observeCollision({ binding, attempt }) {
      return {
        receipt: {
          schemaVersion: 1,
          receiptId: `workspace_collision_${attempt.attemptId.slice(8)}`,
          binding: { ...binding },
          attemptId: attempt.attemptId,
          resourceKey: `workspace:${attempt.workspace.workspaceId}`,
          action: 'observe_collision',
          ownershipTokenDigest: attempt.workspace.rootIdentity,
          observedIdentityDigest: null,
          outcome: 'ambiguous',
          evidence: [],
          observedAt: DONE,
        },
      };
    },
    async integrationInput({ binding, currentCandidate, incomingCandidate }) {
      if (baseCandidate === null) {
        const privateCommit = command(repository.root,
          ['commit-tree', repository.baseTree, '-p', repository.baseCommit],
          { input: 'Integration base\n' });
        baseCandidate = {
        schemaVersion: 1,
        candidateId: 'candidate_base',
        binding: { ...binding },
        parentCandidateId: null,
        baseTree: repository.baseTree,
        tree: repository.baseTree,
        privateCommit,
        producerAttempts: [], changedPaths: [],
        ownershipDigest: digest('base-ownership'),
        patchDigest: emptyPatchDigest(repository.root, repository.baseTree),
        createdAt: NOW,
        };
      }
      const base = currentCandidate !== null &&
          currentCandidate.binding.correctionGeneration === binding.correctionGeneration
        ? currentCandidate
        : incomingCandidate ?? baseCandidate;
      return {
        currentCandidate: base,
        input: {
          repositoryRoot: repository.root,
          gitExecutable: git,
          expectedPrivateHead: base.privateCommit,
          commitMetadata: {
            authorName: 'Fixture', authorEmail: 'fixture@example.invalid',
            committerName: 'Fixture', committerEmail: 'fixture@example.invalid',
            timestamp: DONE, message: 'Integrate candidate\n',
          },
          capability: activation('git_admin', binding),
        },
      };
    },
    async observeCleanup({ receiptId }) {
      const receipt = workspaceCleanupReceipts.get(receiptId);
      return receipt === undefined ? { outcome: 'absent' }
        : { outcome: 'succeeded', value: { receipt } };
    },
    async cleanup({ attempt, receiptId }) {
      calls.workspaceCleanup += 1;
      const receipt = {
        schemaVersion: 1, receiptId, binding: { ...attempt.binding },
        attemptId: attempt.attemptId,
        resourceKey: `workspace:${attempt.workspace.workspaceId}`,
        action: 'cleanup', ownershipTokenDigest: attempt.workspace.rootIdentity,
        observedIdentityDigest: attempt.workspace.rootIdentity,
        outcome: 'succeeded', evidence: [], observedAt: DONE,
      };
      workspaceCleanupReceipts.set(receiptId, receipt);
      if (loseCleanupResponse && !cleanupResponseLost) {
        cleanupResponseLost = true;
        throw new Error('cleanup response lost after exact receipt capture');
      }
      return { receipt };
    },
  };

  const resourcePort = {
    async observe({ attemptId, claim = null, action = 'allocate', allocation = null }) {
      const resourceKey = allocation?.resourceKey ?? (claim === null ? null
        : `${claim.key}:${claim.namespace ?? 'global'}`);
      const key = `${attemptId}\0${action}\0${resourceKey}`;
      return resources.has(key)
        ? { outcome: 'succeeded', value: resources.get(key) }
        : { outcome: 'absent' };
    },
    async allocate({ binding, attempt, claim, receiptId }) {
      const resourceKey = `${claim.key}:${claim.namespace ?? 'global'}`;
      const receipt = {
        schemaVersion: 1, receiptId, binding: { ...binding },
        attemptId: attempt.attemptId, resourceKey, action: 'allocate',
        ownershipTokenDigest: digest(`resource-owner-${attempt.attemptId}-${resourceKey}`),
        observedIdentityDigest: digest(`resource-identity-${attempt.attemptId}-${resourceKey}`),
        outcome: 'succeeded', evidence: [], observedAt: NOW,
      };
      resources.set(`${attempt.attemptId}\0allocate\0${resourceKey}`, receipt);
      return receipt;
    },
    async cleanup({ attempt, allocation, receiptId }) {
      calls.resourceCleanup += 1;
      const receipt = {
        schemaVersion: 1, receiptId, binding: { ...attempt.binding },
        attemptId: attempt.attemptId, resourceKey: allocation.resourceKey, action: 'cleanup',
        ownershipTokenDigest: allocation.ownershipTokenDigest,
        observedIdentityDigest: allocation.observedIdentityDigest,
        outcome: 'succeeded', evidence: [], observedAt: DONE,
      };
      resources.set(`${attempt.attemptId}\0cleanup\0${allocation.resourceKey}`, receipt);
      return receipt;
    },
  };

  const checkPort = {
    async requirements({ assignments, candidate }) {
      return [...new Set(assignments.flatMap(({ checks }) => checks))].sort().map((checkId) => ({
        checkId,
        catalogDigest: digest('checks'),
        candidateId: candidate.candidateId,
        candidateTree: candidate.tree,
        inputScopeDigest: digest(`scope-${checkId}`),
        commandDigest: digest(`command-${checkId}`),
        environmentDigest: digest('check-environment'),
        resourcesDigest: digest('check-resources'),
      }));
    },
    async run() {
      calls.checks += 1;
      const outcome = checkOutcome(calls.checks);
      return { outcome, exitCode: outcome === 'pass' ? 0 : 1, evidence: [],
        startedAt: NOW, completedAt: DONE };
    },
    async observePostcondition() { return { outcome: 'absent' }; },
  };

  const finalizationPort = {
    async prepare({ binding, candidate, receipts }) {
      const checkReceipts = receipts.map((receipt) => ({
        kind: 'check_receipt', id: receipt.receiptId, digest: canonicalDigest(receipt),
      })).sort((a, b) => a.id.localeCompare(b.id, 'en'));
      const completionEvidenceDigest = digest('completion-evidence');
      return {
        plan: {
          schemaVersion: 1,
          finalizationId: 'finalization_offline',
          binding: { ...binding },
          candidate,
          repository: {
            targetRef: 'refs/heads/main', expectedParentCommit: oid('1'),
            expectedParentTree: oid('2'),
          },
          publicationPaths: [...candidate.changedPaths],
          task: {
            taskId: 'T-0054', taskRevision: 2, expectedRecordVersion: 8,
            completedRecordVersion: 9, expectedStatus: 'active', completedStatus: 'done',
            completionEvidenceDigest, taskPaths: ['readme/tasks/T-0054.md'],
          },
          requiredCheckReceipts: checkReceipts,
          completion: {
            authorEmail: 'agent@example.test', authorName: 'Agent',
            committerEmail: 'agent@example.test', committerName: 'Agent',
            message: 'Complete T-0054.\n', timestamp: DONE,
          },
          terminal: { receiptId: 'terminal_offline', emittedAt: DONE },
        },
        options: {},
      };
    },
    async run({ plan, authorizeBoundary }) {
      calls.finalization += 1;
      const boundaries = ['candidate_apply', 'task_close', 'completion_commit',
        'target_ref', 'terminal_receipt'];
      for (const boundary of boundaries) {
        calls.boundaryAuthorizations += 1;
        const closed = task.status === 'done';
        assert.equal(await authorizeBoundary(Object.freeze({
          plan,
          boundary,
          observation: Object.freeze({
            task: Object.freeze({ state: closed ? 'closed' : 'open', value: { ...task } }),
          }),
        })), true);
        if (boundary === 'task_close') {
          task.recordVersion = 9;
          task.status = 'done';
        }
      }
      return {
        disposition: 'succeeded',
        boundariesApplied: boundaries,
        receipt: {
          schemaVersion: 1,
          receiptId: plan.terminal.receiptId,
          binding: { ...plan.binding, taskRecordVersion: plan.task.completedRecordVersion },
          disposition: 'succeeded',
          candidateId: plan.candidate.candidateId,
          finalTree: plan.candidate.tree,
          finalCommit: oid('d'),
          taskStatus: 'done',
          taskRecordVersion: 9,
          checkReceipts: plan.requiredCheckReceipts,
          completionEvidenceDigest: plan.task.completionEvidenceDigest,
          emittedAt: DONE,
        },
      };
    },
  };

  const taskPort = { async observe() { return { ...task }; } };
  const quotaPort = { async observe() { return { disposition: 'proceed' }; } };
  const approvalPort = { async observe() { return { current: true }; } };
  const processPort = {
    async observe({ attemptId }) {
      if (ambiguousInterrupt && interruptedProcesses.has(attemptId)) {
        return { empty: false, ambiguous: true };
      }
      return { empty: true };
    },
    async interrupt({ attemptId, binding }) {
      calls.processInterrupt += 1;
      interruptedProcesses.add(attemptId);
      const started = providerStarts.get(attemptId);
      const processReceipt = {
        schemaVersion: 1, receiptId: `process_interrupt_${attemptId.slice(8)}`,
        binding: { ...binding }, attemptId, requestId: started.attempt.launchRequestId,
        launcherConnectionId: started.handle.expectation.launcherConnectionId,
        processDomainId: started.handle.expectation.processDomainId,
        processIdentityDigest: started.handle.expectation.processIdentityDigest,
        action: 'interrupt', state: ambiguousInterrupt ? 'ambiguous' : 'empty',
        descendantsComplete: !ambiguousInterrupt, membersDigest: canonicalDigest([]),
        evidence: [], observedAt: DONE,
      };
      interruptEvidence.set(attemptId, { processReceipt });
      return { interrupted: true,
        processReceipt };
    },
  };
  const makeService = () => createImplementationApplicationService({
    runtime,
    taskPort,
    quotaPort: { async observe() { return { disposition: 'proceed' }; } },
    approvalPort,
    providerPort,
    processPort,
    workspacePort,
    resourcePort,
    checkPort,
    finalizationPort,
    clock: () => observedNow,
    scheduler: { caps: { background: 2, root: 1 } },
  });
  const service = makeService();
  return { input, runtime, service, makeService, calls, task, providerEvidence, backgroundReady,
    setClock(value) { observedNow = value; } };
}

function rootPolicy() {
  return {
    profileDigest: digest('root-profile'),
    profileDigests: {
      implementer: digest('implementer-profile'), reviewer: digest('reviewer-profile'),
      qa: digest('qa-profile'), security: digest('security-profile'),
      root_analysis: digest('root-analysis-profile'),
    },
    baseCandidateId: 'candidate_base',
    deadlineAt: '2026-08-15T04:00:00Z',
  };
}

test('offline application runs Root semantics, concurrent jobs, dependency, gates, and terminal handoff', async () => {
  const f = fixture();
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal(started.bootstrapOnly, false);

  const root = await f.service.step({ runId: started.runId });
  assert.equal(root.disposition, 'progressed');
  assert.equal(f.calls.root, 1);
  assert.equal(f.runtime.events.some(({ kind }) => kind === 'orientation_published'), true);
  assert.equal(f.runtime.events.some(({ kind }) => kind === 'root_decision_accepted'), true);

  const first = await f.service.step({ runId: started.runId });
  assert.equal(first.disposition, 'progressed', JSON.stringify(first.application.reconciliation));
  assert.equal(f.calls.providerMaximum, 2);
  assert.equal(first.application.waiting.some(({ reason }) => reason === 'dependency_wait'), true);
  assert.equal(first.application.assignments.filter(({ integrated }) => integrated).length, 0,
    'worker results remain proposals until a fresh Root integration decision');

  const terminal = await f.service.runUntilQuiescent({ runId: started.runId });
  assert.equal(terminal.disposition, 'finalization_handoff');
  assert.equal(terminal.application.assignments.every(({ gatePassed }) => gatePassed), true);
  assert.equal(terminal.application.finalization.terminalPublished, true);
  assert.equal(f.calls.finalization, 1);
  assert.equal(f.calls.boundaryAuthorizations, 5,
    'authority is re-read immediately before every finalization boundary');
  assert.ok(f.calls.root >= 7, 'every semantic point used a fresh Root decision');
  assert.equal(f.task.status, 'done');
  assert.equal(f.runtime.events.at(-1).kind, 'terminal_published');
  assert.equal(f.calls.workspaceCleanup, f.calls.root + 3,
    'every Root and worker process receives exact cleanup');
  assert.equal(f.calls.resourceCleanup, 1,
    'the exact declared namespaced resource was cleaned once');
  assert.ok(f.calls.checks >= 3);

  const attemptHistories = [...f.runtime.records.entries()]
    .filter(([key]) => key.startsWith('attempt\0'))
    .map(([, versions]) => versions.map(({ value }) => value));
  const workerHistories = attemptHistories.filter((history) =>
    !history[0].assignmentId.startsWith('root_'));
  assert.ok(workerHistories.length >= 3);
  for (const history of workerHistories) {
    assert.deepEqual(history.map(({ state }) => state), [
      'allocated', 'launch_intended', 'running', 'terminal_observed', 'frozen', 'ingested',
      'accepted', 'cleanup_pending', 'cleaned',
    ]);
    for (let index = 1; index < history.length; index += 1) {
      assert.equal(history[index].recordVersion, history[index - 1].recordVersion + 1);
      assert.equal(history[index].previousDigest, canonicalDigest(history[index - 1]));
    }
  }
  const transitionEvents = f.runtime.events.filter(({ kind }) => kind === 'attempt_transition');
  assert.equal(transitionEvents.length,
    attemptHistories.reduce((total, history) => total + history.length, 0),
  'every Attempt revision has one causal transition event');
  const decisions = [...f.runtime.records.entries()]
    .filter(([key]) => key.startsWith('decision\0'))
    .map(([, versions]) => versions.at(-1).value);
  assert.ok(decisions.length >= 7);
  for (const decision of decisions) {
    const source = decision.source.launchIntent;
    const intent = f.runtime.records.get(`detail\0${source.id}`)?.at(-1)?.value;
    validateRootLaunchIntent(intent);
    assert.equal(source.digest, canonicalDigest(intent));
    assert.equal(intent.orientationDigest, decision.orientationDigest);
    const operation = [...f.runtime.records.entries()]
      .filter(([key]) => key.startsWith('operation\0'))
      .flatMap(([, versions]) => versions.map(({ value }) => value))
      .find((value) => value.kind === 'launch_job' &&
        value.expected.some((reference) => reference.digest === source.digest));
    assert.equal(operation.inputDigest, intent.requestDigest);
  }

  const status = await f.service.status(started.runId);
  assert.equal(status.runtime.snapshot.phase, 'succeeded');
  const doctor = await f.service.doctor(started.runId);
  assert.equal(doctor.ok, true);
  assert.deepEqual(await f.service.release(started.runId), { released: true });
  assert.equal(f.runtime.released, true);
});

test('Root result with a prompt digest outside its durable launch intent is rejected', async () => {
  const f = fixture({ wrongRootPrompt: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  const result = await f.service.step({ runId: started.runId });
  assert.equal(result.disposition, 'reconciliation_required');
  assert.equal(result.application.reconciliation.code, 'APPLICATION_ROOT_PROVENANCE_INVALID');
  assert.equal(f.runtime.events.some(({ kind }) => kind === 'root_decision_accepted'), false);
});

test('Root launch intent rejects provider, executable, and cwd drift before spawn', async (t) => {
  for (const field of ['provider', 'version', 'cwd']) {
    await t.test(field, async () => {
      const f = fixture({ wrongRootRequestField: field });
      const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
      const result = await f.service.step({ runId: started.runId });
      assert.equal(result.disposition, 'reconciliation_required');
      assert.equal(result.application.reconciliation.code,
        'APPLICATION_ROOT_LAUNCH_INTENT_INVALID');
      assert.equal(f.calls.provider, 0);
      assert.equal(f.runtime.events.some(({ kind }) => kind === 'root_decision_accepted'), false);
    });
  }
});

test('stop dominates dispatch and stable dependency waiting performs no provider/model poll', async () => {
  const waiting = fixture();
  const template = {
    schemaVersion: 1,
    assignmentId: 'assignment_waiting',
    generation: 1,
    sourceDecisionId: null,
    sourceProposalId: null,
    role: 'implementer',
    profileDigest: digest('implementer-profile'),
    goal: 'Wait for a missing external prerequisite.', scope: ['src/wait.mjs'], nonGoals: [],
    dependencies: [{ assignmentId: 'assignment_missing', condition: 'gate_pass', generation: 1 }],
    ownership: { writePaths: ['src/wait.mjs'], readPaths: [] },
    resources: [], baseCandidateId: 'candidate_base', baseTree: oid('2'),
    permissions: { sandbox: 'workspace-write', network: false,
      approvalPolicy: 'never', nestedAgents: false },
    checks: ['check_wait'], deadlineAt: '2026-08-15T04:00:00Z', restartPolicy: 'never',
  };
  const started = await waiting.service.start({
    runtimePlan: waiting.input,
    bootstrapAssignments: [template],
  });
  assert.equal(started.bootstrapOnly, true);
  assert.equal((await waiting.service.step({ runId: started.runId })).disposition, 'waiting');
  assert.equal((await waiting.service.step({ runId: started.runId })).disposition, 'waiting');
  assert.equal(waiting.calls.provider, 0);
  assert.equal(waiting.calls.checks, 0);

  await waiting.service.requestStop({
    runId: started.runId, requestId: 'stop_waiting', expectedEpoch: 1,
    expectedControlGeneration: 0, reason: 'Operator checkpoint.',
  });
  assert.equal((await waiting.service.step({ runId: started.runId })).disposition, 'stopping');
  assert.equal(waiting.calls.provider, 0);
});

test('durable stop interrupts two in-flight jobs, proves exact process emptiness, then cleans', async () => {
  const f = fixture({ holdBackground: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'progressed');
  const runningStep = f.service.step({ runId: started.runId });
  await f.backgroundReady;
  assert.equal(f.calls.providerActive, 2);
  const stopped = await f.service.requestStop({
    runId: started.runId,
    requestId: 'stop_in_flight',
    expectedEpoch: 1,
    expectedControlGeneration: 0,
    reason: 'Stop both exact provider attempts.',
  });
  assert.equal(stopped.interrupted.length, 2);
  assert.equal(stopped.reconciliationRequired, false);
  assert.equal(f.calls.providerInterrupt, 2);
  assert.equal(f.calls.processInterrupt, 2);
  assert.equal(f.calls.workspaceCleanup, 3,
    'the completed Root attempt and both stopped workers were cleaned exactly once');
  assert.equal(f.calls.resourceCleanup, 1);
  assert.equal(stopped.terminal?.disposition, 'stopped');
  assert.equal((await runningStep).disposition, 'stopping');
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'stopping');
});

test('external durable stop wakes blocked providers and uses guarded interruption settlement', async () => {
  const f = fixture({ holdBackground: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'progressed');
  const runningStep = f.service.step({ runId: started.runId });
  await f.backgroundReady;
  f.runtime.publishExternalStop({
    schemaVersion: 1,
    requestId: 'stop_external_wake',
    runId: started.runId,
    expectedControlGeneration: 0,
    kind: 'stop',
    requestedAt: NOW,
    reason: 'Wake the blocked provider fanout.',
  });
  const stopped = await runningStep;
  assert.equal(stopped.disposition, 'stopping');
  assert.equal(f.calls.providerInterrupt, 2);
  assert.equal(f.calls.processInterrupt, 2);
  assert.equal(f.calls.workspaceCleanup, 3);
  assert.equal((await f.service.status(started.runId)).runtime.snapshot.phase, 'stopped');
});

test('ambiguous process evidence after stop is retained and never cleaned', async () => {
  const f = fixture({ holdBackground: true, ambiguousInterrupt: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  await f.service.step({ runId: started.runId });
  const runningStep = f.service.step({ runId: started.runId });
  await f.backgroundReady;
  const stopped = await f.service.requestStop({
    runId: started.runId,
    requestId: 'stop_ambiguous',
    expectedEpoch: 1,
    expectedControlGeneration: 0,
    reason: 'Retain ambiguous process ownership.',
  });
  assert.equal(stopped.reconciliationRequired, true);
  assert.deepEqual(stopped.interrupted, []);
  assert.equal(f.calls.workspaceCleanup, 1, 'only the already-proved Root workspace was cleaned');
  assert.equal(f.calls.resourceCleanup, 0);
  assert.equal(stopped.terminal?.disposition, 'stopped');
  await runningStep;
});

test('fresh application service rehydrates durable assignments, attempts, candidate, and gate', async () => {
  const f = fixture();
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  await f.service.step({ runId: started.runId });
  const first = await f.service.step({ runId: started.runId });
  assert.equal(first.application.assignments.filter(({ resultObserved }) => resultObserved).length, 2);
  const callsBeforeRestart = f.calls.provider;

  const replacement = f.makeService();
  const recovered = await replacement.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal(recovered.application.assignments.filter(({ resultObserved }) => resultObserved).length, 2);
  assert.equal(f.calls.provider, callsBeforeRestart, 'rehydration did not poll or relaunch a provider');
  const terminal = await replacement.runUntilQuiescent({ runId: started.runId });
  assert.equal(terminal.disposition, 'finalization_handoff');
  assert.ok(f.calls.root >= 7, 'fresh service continued the closed Root decision loop');
});

test('fresh application service rehydrates exact passed check receipts without rerunning gates', async () => {
  const f = fixture();
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  let checkpoint;
  for (let index = 0; index < 20; index += 1) {
    checkpoint = await f.service.step({ runId: started.runId });
    if (checkpoint.application.gate?.disposition === 'passed') break;
  }
  assert.equal(checkpoint.application.gate?.disposition, 'passed');
  const checksBeforeRestart = f.calls.checks;

  const replacement = f.makeService();
  const recovered = await replacement.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal(recovered.application.gate?.disposition, 'passed');
  assert.equal(f.calls.checks, checksBeforeRestart,
    'rehydration reused exact candidate-tree receipts without rerunning checks');
  const terminal = await replacement.runUntilQuiescent({ runId: started.runId });
  assert.equal(terminal.disposition, 'finalization_handoff');
});

test('application accepts the original Ready activation run after an Active replan', async () => {
  const f = fixture({ recoverReadyActivation: true });
  const activePlan = planImplementationStart(f.input);
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal(started.disposition, 'activation_recovered');
  assert.notEqual(started.runId, activePlan.runId);
  assert.equal(started.application.runId, started.runId);
  assert.equal(started.application.reconciliation, null);
});

test('fresh service recovers exact running handles and stop never respawns them', async () => {
  const f = fixture({ holdBackground: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  await f.service.step({ runId: started.runId });
  const runningStep = f.service.step({ runId: started.runId });
  await f.backgroundReady;
  const callsAtRestart = f.calls.provider;

  const replacement = f.makeService();
  await replacement.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal(f.calls.provider, callsAtRestart, 'attach/recovery did not repeat provider spawn');
  const stopped = await replacement.requestStop({
    runId: started.runId,
    requestId: 'stop_after_restart',
    expectedEpoch: 1,
    expectedControlGeneration: 0,
    reason: 'Stop only the exact rehydrated process handles.',
  });
  assert.equal(stopped.interrupted.length, 2);
  assert.equal(stopped.terminal?.disposition, 'stopped');
  assert.equal(f.calls.provider, callsAtRestart);
  await runningStep;
});

test('allocation, spawn, provider terminal, and cleanup response loss recover without repeats', async () => {
  const f = fixture({
    loseAllocationResponse: true,
    loseSpawnResponse: true,
    loseCleanupResponse: true,
  });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  const terminal = await f.service.runUntilQuiescent({
    runId: started.runId,
    maximumSteps: 32,
  });
  assert.equal(terminal.disposition, 'finalization_handoff');
  const attemptCount = [...f.runtime.records.keys()]
    .filter((key) => key.startsWith('attempt\0')).length;
  assert.equal(f.calls.workspaceAllocate, attemptCount,
    'allocation observer recovered the stored effect without reallocation');
  assert.equal(f.calls.provider, attemptCount,
    'provider handle recovery avoided a second spawn');
  assert.equal(f.calls.workspaceCleanup, attemptCount,
    'cleanup observer recovered the receipt without repeating cleanup');
});

test('wrong process identity fails closed before running and performs no cleanup or relaunch', async () => {
  const f = fixture({ wrongProcessIdentity: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  const first = await f.service.step({ runId: started.runId });
  assert.equal(first.disposition, 'reconciliation_required');
  assert.equal(f.calls.provider, 1);
  assert.equal(f.calls.workspaceCleanup, 0);
  const attemptHistory = [...f.runtime.records.entries()]
    .find(([key]) => key.startsWith('attempt\0'))[1];
  assert.deepEqual(attemptHistory.map(({ value }) => value.state),
    ['allocated', 'launch_intended']);
  await f.service.step({ runId: started.runId });
  assert.equal(f.calls.provider, 1, 'mismatched identity was never relaunched');
});

test('ownership violation is durably quarantined and never ingested or cleaned', async () => {
  const f = fixture({ ownershipViolation: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  await f.service.step({ runId: started.runId });
  const result = await f.service.step({ runId: started.runId });
  assert.equal(result.disposition, 'reconciliation_required');
  const quarantined = [...f.runtime.records.entries()]
    .filter(([key]) => key.startsWith('attempt\0'))
    .map(([, versions]) => versions.at(-1).value)
    .filter(({ state }) => state === 'quarantined');
  assert.ok(quarantined.length >= 1);
  assert.equal(f.calls.workspaceCleanup, 1,
    'only the already accepted Root workspace was cleaned');
  for (const attempt of quarantined) {
    const produced = [...f.runtime.records.entries()]
      .filter(([key]) => key.startsWith('candidate\0'))
      .some(([, versions]) => versions.some(({ value }) =>
        value.producerAttempts.includes(attempt.attemptId)));
    assert.equal(produced, false);
  }
});

test('ambiguous provider crash reconciles and the durable started operation is never repeated', async () => {
  const f = fixture({ ambiguousProvider: true });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  const first = await f.service.step({ runId: started.runId });
  assert.equal(first.disposition, 'reconciliation_required');
  assert.equal(f.calls.provider, 1);
  const second = await f.service.step({ runId: started.runId });
  assert.equal(second.disposition, 'reconciliation_required');
  assert.equal(f.calls.provider, 1, 'uncertain provider effect was not blindly repeated');
});

test('durable Root wait is stable until its exact deadline wake becomes due', async () => {
  const deadline = '2026-08-15T03:06:00Z';
  const f = fixture({
    initialNow: DONE,
    proposal: () => ({
      schemaVersion: 1,
      rationale: 'No safe assignment declaration exists before the bounded deadline.',
      kind: 'wait',
      reasonCode: 'bounded_dependency_wait',
      wakeOn: ['deadline_due'],
      deadlineAt: deadline,
    }),
  });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'waiting');
  const callsAtWait = f.calls.provider;
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'waiting');
  assert.equal(f.calls.provider, callsAtWait, 'stable waiting performs no Root/provider tick');

  f.setClock(deadline);
  assert.equal((await f.service.step({ runId: started.runId })).disposition, 'progressed');
  const wake = f.runtime.events.at(-1);
  assert.equal(wake.kind, 'wake_due');
  const wakeRecord = f.runtime.records.get(`detail\0${wake.payload.id}`).at(-1).value;
  assert.deepEqual(wakeRecord.reasons, ['deadline_due']);
  assert.equal(wakeRecord.deadlineAt, deadline);
});

test('failed gates require a Root correction generation and stale exact affected work', async () => {
  const f = fixture({
    checkOutcome: (call) => call === 1 ? 'fail' : 'pass',
    proposal: (orientation) => {
      const semantic = orientation.verification.semantic;
      if (semantic.kind !== 'request_correction') return proposalForSemantic(orientation);
      return {
        schemaVersion: 1,
        rationale: 'Replace the exact assignments affected by the failed check evidence.',
        kind: 'request_correction',
        supersededAssignmentIds: Object.entries(orientation.assignmentStates)
          .filter(([, state]) => state.stale !== true)
          .map(([id]) => id)
          .sort(),
        assignments: [assignmentProposal('proposal_fix', 'src/fix.mjs')],
        affectedCheckIds: semantic.failedCheckIds,
      };
    },
  });
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  const terminal = await f.service.runUntilQuiescent({
    runId: started.runId,
    maximumSteps: 32,
  });
  assert.equal(terminal.disposition, 'finalization_handoff');
  const stale = terminal.application.assignments.filter(({ stale }) => stale);
  const current = terminal.application.assignments.filter(({ stale }) => !stale);
  assert.equal(stale.length, 3);
  assert.equal(current.length, 1);
  assert.equal(current[0].generation, 2);
  assert.equal(f.runtime.events.some(({ kind, payload }) => kind === 'root_decision_accepted' &&
    f.runtime.records.get(`decision\0${payload.id}`).at(-1).value.proposal.kind ===
      'request_correction'), true);
});

test('a competing Root proposal loses exact CAS and performs zero semantic effect', async () => {
  const f = fixture();
  const started = await f.service.start({ runtimePlan: f.input, rootDecision: rootPolicy() });
  f.runtime.loseNextRootCas();
  await assert.rejects(f.service.step({ runId: started.runId }), (error) =>
    error?.code === 'APPLICATION_ROOT_CAS_LOST');
  assert.equal(f.runtime.events.some(({ kind }) => kind === 'root_decision_accepted'), false);
  assert.equal(f.runtime.events.some(({ kind, payload }) => kind === 'operation_transition' &&
    payload.kind === 'candidate'), false);
  assert.equal(f.calls.checks, 0);
  assert.equal(f.calls.finalization, 0);
});
