import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  createImplementationCommandAdapter,
  executeImplementationCommand,
  parseImplementationCommand,
} = await import('../lib/implementation-cli.mjs');
const {
  openImplementationLedger,
  publishControlRequest,
  readRunStatus,
  replayRun,
} = await import('../lib/implementation-ledger.mjs');
const { createImplementationOperatorAdapter } = await import('../lib/implementation-operator.mjs');
const { canonicalBytes, canonicalDigest } = await import('../lib/implementation-protocol.mjs');
const { createImplementationRuntime } = await import('../lib/implementation-runtime.mjs');
const { planImplementationStart } = await import('../lib/implementation-supervisor.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');

const NOW = '2026-08-15T03:00:00Z';
const LATER = '2026-08-15T03:05:00Z';
const packageIdentity = Object.freeze({ name: '@tvald/meta-framework', version: '1.0.0' });
const digest = (label) => canonicalDigest({ label });
const oid = (character) => character.repeat(40);

function planInput() {
  return {
    command: {
      command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
      harness: 'codex', maxConcurrency: 2, shadow: false,
    },
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the package operator boundary.',
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

async function seeded(t) {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-operator-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const input = planInput();
  const plan = planImplementationStart(input);
  const writeCapability = issueSourceInstrumentedEffectCapability('journal_write');
  const ledger = await openImplementationLedger(common, { create: true, writeCapability });
  const runtime = createImplementationRuntime({ ledger, clock: () => NOW });
  await runtime.start(input);
  t.after(() => runtime.release(plan.runId).catch(() => {}));
  return { common, input, plan, ledger, runtime };
}

function stopId(runId, expectedControlGeneration, reason) {
  return `stop_${canonicalDigest({
    runId, generation: expectedControlGeneration, reason,
  }).slice(7, 39)}`;
}

test('installed-shaped stop is exact, idempotent across instances, and remains idempotent after acceptance', async (t) => {
  const { common, plan, runtime } = await seeded(t);
  const reason = 'Checkpoint the exact live run.';
  const args = ['stop', plan.runId, '--expected-control-generation', '0', '--reason', reason];
  const beforeReplay = await replayRun(await openImplementationLedger(common), plan.runId);
  const beforeStatus = await readRunStatus(await openImplementationLedger(common), plan.runId);
  const firstAdapter = createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    clock: () => NOW,
  });
  const firstWake = runtime.waitForControl({
    runId: plan.runId, expectedEpoch: 1, expectedControlGeneration: 0,
  });
  const first = await executeImplementationCommand(parseImplementationCommand(args), {
    packageIdentity, adapter: firstAdapter,
  });
  assert.equal((await firstWake).request.requestId, first.requestId);
  assert.deepEqual(first, {
    schemaVersion: 1,
    disposition: 'stop_requested',
    runId: plan.runId,
    requestId: stopId(plan.runId, 0, reason),
    expectedControlGeneration: 0,
    created: true,
  });
  const controlPath = path.join(common, 'meta-framework', 'implementation', 'v1',
    'runs', plan.runId, 'control', `${first.requestId}.json`);
  const firstBytes = await fs.readFile(controlPath);
  const afterReplay = await replayRun(await openImplementationLedger(common), plan.runId);
  const afterStatus = await readRunStatus(await openImplementationLedger(common), plan.runId);
  assert.equal(afterReplay.controls.length, beforeReplay.controls.length + 1);
  assert.equal(afterReplay.records.length, beforeReplay.records.length);
  assert.equal(afterReplay.events.length, beforeReplay.events.length);
  assert.deepEqual(afterStatus.snapshot, beforeStatus.snapshot);
  assert.deepEqual(firstBytes, canonicalBytes(afterReplay.controls.at(-1).value));

  const secondAdapter = createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    clock: () => LATER,
  });
  const duplicateWake = runtime.waitForControl({
    runId: plan.runId, expectedEpoch: 1, expectedControlGeneration: 0,
  });
  const duplicate = await executeImplementationCommand(parseImplementationCommand(args), {
    packageIdentity, adapter: secondAdapter,
  });
  assert.equal((await duplicateWake).request.requestId, first.requestId);
  assert.deepEqual(duplicate, { ...first, disposition: 'stop_already_requested', created: false });
  assert.deepEqual(await fs.readFile(controlPath), firstBytes);

  const accepted = await runtime.acceptControls({ runId: plan.runId, expectedEpoch: 1 });
  assert.equal(accepted.kind, 'stop');
  assert.equal(accepted.state.snapshot.controlGeneration, 1);
  const postAcceptanceAdapter = createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    clock: () => '2026-08-15T03:09:00Z',
  });
  const postAcceptanceRetry = await executeImplementationCommand(parseImplementationCommand(args), {
    packageIdentity, adapter: postAcceptanceAdapter,
  });
  assert.deepEqual(postAcceptanceRetry,
    { ...first, disposition: 'stop_already_requested', created: false });
  assert.deepEqual(await fs.readFile(controlPath), firstBytes);

  const controlsBeforeStale = (await replayRun(await openImplementationLedger(common), plan.runId)).controls;
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', plan.runId, '--expected-control-generation', '0', '--reason', 'A different stale request.',
  ]), { packageIdentity, adapter: postAcceptanceAdapter }),
  (error) => error.code === 'CONTROL_STALE');
  assert.deepEqual((await replayRun(await openImplementationLedger(common), plan.runId)).controls,
    controlsBeforeStale);
});

test('stop rejects no-run, stale, and conflicting evidence without publishing bytes', async (t) => {
  const { common, plan, ledger } = await seeded(t);
  const operator = createImplementationOperatorAdapter({ gitCommonDirectory: common, clock: () => NOW });
  const runRoot = path.join(common, 'meta-framework', 'implementation', 'v1', 'runs');
  const runsBefore = await fs.readdir(runRoot);
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', 'missing_run', '--expected-control-generation', '0', '--reason', 'Do not create it.',
  ]), { packageIdentity, adapter: operator }), (error) => error.code === 'RUN_NOT_FOUND');
  assert.deepEqual(await fs.readdir(runRoot), runsBefore);

  const controls = path.join(runRoot, plan.runId, 'control');
  assert.deepEqual(await fs.readdir(controls), []);
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', plan.runId, '--expected-control-generation', '1', '--reason', 'Stale generation.',
  ]), { packageIdentity, adapter: operator }), (error) => error.code === 'CONTROL_STALE');
  assert.deepEqual(await fs.readdir(controls), []);

  const desiredReason = 'Desired exact stop request.';
  const requestId = stopId(plan.runId, 0, desiredReason);
  const conflict = {
    schemaVersion: 1,
    requestId,
    runId: plan.runId,
    expectedControlGeneration: 0,
    kind: 'stop',
    requestedAt: NOW,
    reason: 'Conflicting valid bytes.',
  };
  await publishControlRequest(ledger, plan.runId, conflict);
  const conflictBytes = await fs.readFile(path.join(controls, `${requestId}.json`));
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', plan.runId, '--expected-control-generation', '0', '--reason', desiredReason,
  ]), { packageIdentity, adapter: operator }), (error) => error.code === 'CONTROL_CONFLICT');
  assert.deepEqual(await fs.readFile(path.join(controls, `${requestId}.json`)), conflictBytes);
  assert.deepEqual(await fs.readdir(controls), [`${requestId}.json`]);
});

test('stop normalizes immutable replay failures to one bounded typed CLI error', async (t) => {
  const { common, plan } = await seeded(t);
  const eventPath = path.join(common, 'meta-framework', 'implementation', 'v1',
    'runs', plan.runId, 'events', '1.json');
  await fs.writeFile(eventPath, '{"secret":"must-not-escape"}', { mode: 0o600 });
  const operator = createImplementationOperatorAdapter({ gitCommonDirectory: common });
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', plan.runId, '--expected-control-generation', '0', '--reason', 'Safe failure.',
  ]), { packageIdentity, adapter: operator }), (error) => {
    assert.equal(error.name, 'ImplementationCliError');
    assert.match(error.code, /^[A-Z][A-Z0-9_]{0,63}$/u);
    assert.equal(error.message, 'implementation stop state could not be derived safely');
    assert.doesNotMatch(error.message, /secret|events|\.json/u);
    return true;
  });
  const controls = path.join(common, 'meta-framework', 'implementation', 'v1',
    'runs', plan.runId, 'control');
  assert.deepEqual(await fs.readdir(controls), []);
});

test('default operator denies all forward mutations before touching an absent ledger', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-operator-disabled-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const operator = createImplementationOperatorAdapter({ gitCommonDirectory: common });
  const forward = [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex'],
    ['resume', 'run_54', '--expected-epoch', '1', '--expected-control-generation', '0'],
    ['clean', 'run_54'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
  ];
  for (const args of forward) {
    await assert.rejects(executeImplementationCommand(parseImplementationCommand(args), {
      packageIdentity, adapter: operator,
    }), (error) => error.code === 'ACTIVATION_DISABLED');
  }
  assert.deepEqual(await fs.readdir(common), []);
  await assert.rejects(executeImplementationCommand(parseImplementationCommand([
    'stop', 'run_54', '--expected-control-generation', '0', '--reason', 'No ledger exists.',
  ]), { packageIdentity, adapter: operator }), (error) => error.code === 'LEDGER_MISSING');
  assert.deepEqual(await fs.readdir(common), []);
});

test('offline forward composition authorizes one exact operation with a fresh capability per call', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-operator-forward-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const authorizationCalls = [];
  const forwardCalls = [];
  const capabilities = [];
  const activationPort = {
    async authorize(command) {
      authorizationCalls.push(command);
      const capability = Object.freeze(Object.create(null));
      capabilities.push(capability);
      return {
        schemaVersion: 1,
        operation: command.operation,
        commandDigest: command.commandDigest,
        capability,
      };
    },
  };
  const invoke = (operation) => async (command, capability) => {
    forwardCalls.push({ operation, command, capability });
    return {
      schemaVersion: 1,
      operation,
      commandDigest: command.commandDigest,
      output: { schemaVersion: 1, disposition: `${operation}_forwarded` },
    };
  };
  const forwardPort = {
    start: invoke('start'),
    resume: invoke('resume'),
    clean: invoke('clean'),
    lockRecover: invoke('lockRecover'),
  };
  const operator = createImplementationOperatorAdapter({
    gitCommonDirectory: common, activationPort, forwardPort,
  });
  const commands = [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex'],
    ['resume', 'run_54', '--expected-epoch', '2', '--expected-control-generation', '1'],
    ['clean', 'run_54'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
  ];
  for (const args of commands) {
    const result = await executeImplementationCommand(parseImplementationCommand(args), {
      packageIdentity, adapter: operator,
    });
    assert.match(result.disposition, /_forwarded$/u);
  }
  assert.deepEqual(authorizationCalls.map(({ operation }) => operation),
    ['start', 'resume', 'clean', 'lockRecover']);
  assert.deepEqual(forwardCalls.map(({ operation }) => operation),
    ['start', 'resume', 'clean', 'lockRecover']);
  assert.equal(new Set(capabilities).size, 4);
  for (let index = 0; index < forwardCalls.length; index += 1) {
    assert.equal(forwardCalls[index].capability, capabilities[index]);
    assert.equal(forwardCalls[index].command, authorizationCalls[index]);
  }
  assert.deepEqual(await fs.readdir(common), []);
});

test('offline composition rejects port, capability, cross-effect, reuse, and result lookalikes', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-operator-lookalike-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  assert.throws(() => createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    readOnlyAdapter: { status() {} },
  }), (error) => error.code === 'RUNTIME_INVALID');
  assert.throws(() => createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    activationPort: { authorize() {} },
  }), (error) => error.code === 'RUNTIME_INVALID');

  const sharedCapability = Object.freeze(Object.create(null));
  let authorizationMode = 'cross_effect';
  const activationPort = {
    async authorize(command) {
      return {
        schemaVersion: 1,
        operation: authorizationMode === 'cross_effect' ? 'resume' : command.operation,
        commandDigest: command.commandDigest,
        capability: sharedCapability,
      };
    },
  };
  let forwardCalls = 0;
  const effect = (operation) => async (command) => {
    forwardCalls += 1;
    return authorizationMode === 'bad_result'
      ? { schemaVersion: 1, operation, commandDigest: command.commandDigest, output: {}, extra: true }
      : {
        schemaVersion: 1, operation, commandDigest: command.commandDigest,
        output: { schemaVersion: 1, disposition: 'forwarded' },
      };
  };
  const forwardPort = {
    start: effect('start'), resume: effect('resume'), clean: effect('clean'),
    lockRecover: effect('lockRecover'),
  };
  const operator = createImplementationOperatorAdapter({
    gitCommonDirectory: common, activationPort, forwardPort,
  });
  const clean = parseImplementationCommand(['clean', 'run_54']);
  await assert.rejects(executeImplementationCommand(clean, { packageIdentity, adapter: operator }),
    (error) => error.code === 'ACTIVATION_DENIED');
  assert.equal(forwardCalls, 0);

  authorizationMode = 'valid';
  await executeImplementationCommand(clean, { packageIdentity, adapter: operator });
  assert.equal(forwardCalls, 1);
  await assert.rejects(executeImplementationCommand(clean, { packageIdentity, adapter: operator }),
    (error) => error.code === 'ACTIVATION_DENIED');
  assert.equal(forwardCalls, 1);

  const resultOperator = createImplementationOperatorAdapter({
    gitCommonDirectory: common,
    activationPort: {
      async authorize(command) {
        return {
          schemaVersion: 1, operation: command.operation,
          commandDigest: command.commandDigest,
          capability: Object.freeze(Object.create(null)),
        };
      },
    },
    forwardPort,
  });
  authorizationMode = 'bad_result';
  await assert.rejects(executeImplementationCommand(clean, {
    packageIdentity, adapter: resultOperator,
  }), (error) => error.code === 'RUNTIME_INVALID');

  const brandedReads = createImplementationCommandAdapter({
    shadow: async () => ({}), status: async () => ({}), events: async () => ({}),
    doctor: async () => ({}), lockInspect: async () => ({}),
  });
  assert.doesNotThrow(() => createImplementationOperatorAdapter({
    gitCommonDirectory: common, readOnlyAdapter: brandedReads,
  }));
});
