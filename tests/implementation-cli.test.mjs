import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeImplementationCommand,
  implementationHelp,
  parseImplementationCommand,
} from '../lib/implementation-cli.mjs';

const packageIdentity = Object.freeze({ name: '@tvald/meta-framework', version: '1.0.0' });

test('implementation CLI parses the closed operator grammar', () => {
  assert.deepEqual(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--max-concurrency', '2', '--shadow',
  ]), {
    command: 'start', taskId: 'T-0054', expectedTaskRevision: 2, harness: 'codex', maxConcurrency: 2, shadow: true,
  });
  assert.deepEqual(parseImplementationCommand(['status', 'run_54', '--json']), {
    command: 'status', runId: 'run_54', json: true,
  });
  assert.deepEqual(parseImplementationCommand(['events', 'run_54', '--after', '7', '--limit', '10']), {
    command: 'events', runId: 'run_54', afterSequence: 7, limit: 10,
  });
  assert.deepEqual(parseImplementationCommand([
    'stop', 'run_54', '--expected-control-generation', '3', '--reason', 'operator requested stop',
  ]), {
    command: 'stop', runId: 'run_54', expectedControlGeneration: 3, reason: 'operator requested stop',
  });
  assert.deepEqual(parseImplementationCommand(['resume', 'run_54', '--expected-epoch', '4']), {
    command: 'resume', runId: 'run_54', expectedEpoch: 4,
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

test('shadow start is effect-free and every live lifecycle command fails closed before adapters', async () => {
  const shadow = await executeImplementationCommand(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--shadow',
  ]), { packageIdentity });
  assert.equal(shadow.disposition, 'shadow');
  assert.equal(shadow.effectAuthority, false);
  let called = false;
  const adapter = new Proxy({}, { get: () => () => { called = true; } });
  const live = [
    ['T-0054', '--expected-task-revision', '2', '--harness', 'codex'],
    ['stop', 'run_54', '--expected-control-generation', '0', '--reason', 'stop'],
    ['resume', 'run_54', '--expected-epoch', '1'],
    ['clean', 'run_54'],
    ['lock', 'recover', 'run_54', '--expected-token', 'incomplete', '--confirm-owner-not-live'],
  ];
  for (const args of live) {
    await assert.rejects(() => executeImplementationCommand(parseImplementationCommand(args), {
      packageIdentity, adapter,
    }), (error) => error.code === 'ACTIVATION_DISABLED');
  }
  assert.equal(called, false);
});

test('read-only lifecycle commands delegate without broadening their options', async () => {
  const calls = [];
  const adapter = {
    async status(runId) { calls.push(['status', runId]); return { runId, state: 'nonterminal' }; },
    async events(runId, options) { calls.push(['events', runId, options]); return { runId, events: [] }; },
    async doctor(runId) { calls.push(['doctor', runId]); return { runId, ok: true }; },
    async lockInspect(runId) { calls.push(['lockInspect', runId]); return { runId, held: false }; },
  };
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
  assert.equal(version.implementationController.liveEffects, 'disabled_without_activation_receipt');
  assert.match(implementationHelp(), /implement TASK/u);
  assert.match(implementationHelp(), /--shadow/u);
});
