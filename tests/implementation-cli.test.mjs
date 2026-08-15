import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createImplementationCommandAdapter,
  executeImplementationCommand,
  implementationHelp,
  parseImplementationCommand,
} from '../lib/implementation-cli.mjs';

const packageIdentity = Object.freeze({ name: '@tvald/meta-framework', version: '1.0.0' });
const cliPath = fileURLToPath(new URL('../bin/meta-framework.mjs', import.meta.url));

test('implementation CLI parses the closed operator grammar', () => {
  assert.deepEqual(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--max-concurrency', '2', '--shadow',
  ]), {
    command: 'start', taskId: 'T-0054', expectedTaskRevision: 2, harness: 'codex', maxConcurrency: 2, shadow: true,
  });
  assert.deepEqual(parseImplementationCommand(['status', 'run_54', '--json']), {
    command: 'status', runId: 'run_54',
  });
  assert.deepEqual(parseImplementationCommand(['status', 'run_54']),
    parseImplementationCommand(['status', 'run_54', '--json']));
  assert.deepEqual(parseImplementationCommand(['events', 'run_54', '--after', '7', '--limit', '10']), {
    command: 'events', runId: 'run_54', afterSequence: 7, limit: 10,
  });
  assert.deepEqual(parseImplementationCommand([
    'stop', 'run_54', '--expected-control-generation', '3', '--reason', 'operator requested stop',
  ]), {
    command: 'stop', runId: 'run_54', expectedControlGeneration: 3, reason: 'operator requested stop',
  });
  assert.deepEqual(parseImplementationCommand(['resume', 'run_54', '--expected-epoch', '4',
    '--expected-control-generation', '2']), {
    command: 'resume', runId: 'run_54', expectedEpoch: 4, expectedControlGeneration: 2,
  });
  assert.deepEqual(parseImplementationCommand(['clean', 'run_54']), { command: 'clean', runId: 'run_54' });
  assert.deepEqual(parseImplementationCommand(['doctor', 'run_54']), { command: 'doctor', runId: 'run_54' });
  assert.deepEqual(parseImplementationCommand(['lock', 'inspect', 'run_54']), {
    command: 'lock_inspect', runId: 'run_54',
  });
  assert.deepEqual(parseImplementationCommand([
    'lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live',
  ]), {
    command: 'lock_recover', runId: 'run_54', expectedToken: 'incomplete', confirmOwnerNotLive: true,
  });
});

test('invalid, duplicated, oversized, or authority-like options are rejected', () => {
  for (const args of [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--max-concurrency', '4'],
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--harness', 'codex'],
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--approval', 'granted'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete'],
    ['status', '../escape'],
  ]) assert.throws(() => parseImplementationCommand(args), /invalid|unknown|duplicate|required/u);
});

test('shadow start is effect-free and unbranded adapter lookalikes are never called', async () => {
  const shadowAdapter = createImplementationCommandAdapter({
    async shadow(command) {
      return {
        schemaVersion: 1,
        disposition: 'shadow_planned',
        effectAuthority: false,
        taskId: command.taskId,
        hypotheticalIntents: [{ kind: 'initialize_run', hypothetical: true }],
      };
    },
  });
  const shadow = await executeImplementationCommand(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--shadow',
  ]), { packageIdentity, adapter: shadowAdapter });
  assert.equal(shadow.disposition, 'shadow_planned');
  assert.equal(shadow.effectAuthority, false);
  await assert.rejects(() => executeImplementationCommand(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--shadow',
  ]), { packageIdentity }), (error) => error.code === 'RUNTIME_INVALID');
  let called = false;
  const lookalike = new Proxy({}, { get: () => () => { called = true; } });
  const live = [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex'],
    ['stop', 'run_54', '--expected-control-generation', '0', '--reason', 'stop'],
    ['resume', 'run_54', '--expected-epoch', '1', '--expected-control-generation', '0'],
    ['clean', 'run_54'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
  ];
  for (const args of live) {
    await assert.rejects(() => executeImplementationCommand(parseImplementationCommand(args), {
      packageIdentity, adapter: lookalike,
    }), (error) => error.code === 'RUNTIME_INVALID');
  }
  assert.equal(called, false);
});

test('a branded adapter without an effect method preserves default activation denial', async () => {
  const adapter = createImplementationCommandAdapter({});
  const live = [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex'],
    ['stop', 'run_54', '--expected-control-generation', '0', '--reason', 'stop'],
    ['resume', 'run_54', '--expected-epoch', '1', '--expected-control-generation', '0'],
    ['clean', 'run_54'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
  ];
  for (const args of live) {
    await assert.rejects(() => executeImplementationCommand(parseImplementationCommand(args), {
      packageIdentity, adapter,
    }), (error) => error.code === 'ACTIVATION_DISABLED');
  }
});

test('a branded future operator receives exact bounded effect arguments with deterministic retries', async () => {
  const calls = [];
  const method = (name) => async (input) => {
    calls.push([name, input]);
    return { schemaVersion: 1, disposition: `${name}_accepted`, input };
  };
  const adapter = createImplementationCommandAdapter({
    start: method('start'),
    stop: method('stop'),
    resume: method('resume'),
    clean: method('clean'),
    lockRecover: method('lockRecover'),
  });
  const cases = [
    {
      args: ['T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--max-concurrency', '2'],
      method: 'start',
      expected: { taskId: 'T-0054', expectedTaskRevision: 2, harness: 'codex', maxConcurrency: 2 },
    },
    {
      args: ['stop', 'run_54', '--expected-control-generation', '3', '--reason', 'exact reason'],
      method: 'stop',
      expected: { runId: 'run_54', expectedControlGeneration: 3, reason: 'exact reason' },
    },
    {
      args: ['resume', 'run_54', '--expected-epoch', '4', '--expected-control-generation', '3'],
      method: 'resume',
      expected: { runId: 'run_54', expectedEpoch: 4, expectedControlGeneration: 3 },
    },
    {
      args: ['clean', 'run_54'],
      method: 'clean',
      expected: { runId: 'run_54' },
    },
    {
      args: ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
      method: 'lockRecover',
      expected: { runId: 'run_54', expectedToken: 'incomplete', confirmOwnerNotLive: true },
    },
  ];
  for (const entry of cases) {
    const command = parseImplementationCommand(entry.args);
    const result = await executeImplementationCommand(command, { packageIdentity, adapter });
    assert.deepEqual(result, {
      schemaVersion: 1,
      disposition: `${entry.method}_accepted`,
      input: entry.expected,
    });
    assert.equal(Object.isFrozen(calls.at(-1)[1]), true);
    assert.deepEqual(calls.at(-1), [entry.method, entry.expected]);
  }

  for (const entry of cases.filter(({ method: name }) => ['stop', 'resume'].includes(name))) {
    const first = await executeImplementationCommand(parseImplementationCommand(entry.args), {
      packageIdentity, adapter,
    });
    const second = await executeImplementationCommand(parseImplementationCommand(entry.args), {
      packageIdentity, adapter,
    });
    assert.deepEqual(second, first);
    assert.deepEqual(calls.at(-2), calls.at(-1));
  }
});

test('read-only lifecycle commands delegate without broadening their options', async () => {
  const calls = [];
  const adapter = createImplementationCommandAdapter({
    async status(runId) { calls.push(['status', runId]); return { runId, state: 'nonterminal' }; },
    async events(runId, options) { calls.push(['events', runId, options]); return { runId, events: [] }; },
    async doctor(runId) { calls.push(['doctor', runId]); return { runId, ok: true }; },
    async lockInspect(runId) { calls.push(['lockInspect', runId]); return { runId, held: false }; },
  });
  assert.equal((await executeImplementationCommand(parseImplementationCommand(['status', 'run_54']), {
    packageIdentity, adapter,
  })).state, 'nonterminal');
  await executeImplementationCommand(parseImplementationCommand(['events', 'run_54']), { packageIdentity, adapter });
  await executeImplementationCommand(parseImplementationCommand(['doctor', 'run_54']), { packageIdentity, adapter });
  await executeImplementationCommand(parseImplementationCommand(['lock', 'inspect', 'run_54']), { packageIdentity, adapter });
  assert.deepEqual(calls, [
    ['status', 'run_54'],
    ['events', 'run_54', { afterSequence: 0, limit: 128 }],
    ['doctor', 'run_54'],
    ['lockInspect', 'run_54'],
  ]);
});

test('version and help expose the disabled-compatible controller surface', async () => {
  const version = await executeImplementationCommand(parseImplementationCommand(['--version']), { packageIdentity });
  assert.equal(version.implementationController.liveEffects, 'disabled_no_protected_issuer');
  assert.match(implementationHelp(), /implement TASK/u);
  assert.match(implementationHelp(), /--shadow/u);
  assert.match(implementationHelp(),
    /resume RUN --expected-epoch N --expected-control-generation N/u);
  for (const args of [['--help'], ['implement', 'help']]) {
    const invoked = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.match(invoked.stdout,
      /implement resume RUN --expected-epoch N --expected-control-generation N/u);
  }
});
