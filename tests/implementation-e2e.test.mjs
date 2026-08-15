import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  createReadOnlyImplementationAdapter,
  executeImplementationCommand,
  parseImplementationCommand,
} = await import('../lib/implementation-cli.mjs');
const {
  openImplementationLedger,
  readRunStatus,
} = await import('../lib/implementation-ledger.mjs');
const { canonicalDigest } = await import('../lib/implementation-protocol.mjs');
const { createImplementationRuntime } = await import('../lib/implementation-runtime.mjs');
const { planImplementationShadowStart, planImplementationStart } =
  await import('../lib/implementation-supervisor.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');

const NOW = '2026-08-15T00:30:00Z';
const digest = (label) => canonicalDigest({ label });
const oid = (character) => character.repeat(40);
const packageIdentity = Object.freeze({ name: '@tvald/meta-framework', version: '1.0.0' });

function planInput(command = {
  command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
  harness: 'codex', maxConcurrency: 2, shadow: false,
}) {
  return {
    command,
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the installed offline controller lifecycle.',
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
    provider: { adapter: 'codex_exec_v1', adapterVersion: '1.0.0', harness: 'codex',
      executableRealpath: '/opt/codex', executableVersion: '0.147.0' },
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0' },
    policies: { promptRegistry: digest('prompts'), checks: digest('checks'),
      resources: digest('resources') },
    quota: { disposition: 'proceed' }, approvals: { current: true }, observedAt: NOW,
  };
}

async function captureByteTree(root) {
  const captured = [];
  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        captured.push({ path: `${childRelative}/`, kind: 'directory' });
        await visit(target, childRelative);
      } else if (entry.isFile()) {
        captured.push({
          path: childRelative,
          kind: 'file',
          bytes: (await fs.readFile(target)).toString('base64'),
        });
      } else {
        captured.push({ path: childRelative, kind: 'unsupported' });
      }
    }
  }
  await visit(root, '');
  return captured;
}

test('offline runtime, operator reads, shadow planning, disable, and recovery preserve one run', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-e2e-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const input = planInput();
  const planned = planImplementationStart(input);
  const capability = issueSourceInstrumentedEffectCapability('journal_write');
  const ledger = await openImplementationLedger(common, { create: true, writeCapability: capability });
  const runtime = createImplementationRuntime({ ledger, clock: () => NOW });
  await runtime.start(input);

  const adapter = createReadOnlyImplementationAdapter(common, {
    shadowStart(command) { return planImplementationShadowStart(planInput(command)); },
  });
  const before = await executeImplementationCommand(parseImplementationCommand([
    'status', planned.runId, '--json',
  ]), { packageIdentity, adapter });
  assert.equal(before.state, 'nonterminal');
  assert.equal(before.phase, 'dormant');
  assert.equal(before.snapshotRevision, 2);
  assert.equal(before.epoch, 1);
  assert.equal(before.controlGeneration, 0);
  assert.equal(before.correctionGeneration, 0);
  assert.equal(before.taskRecordVersion, 8);
  assert.equal(before.counts.events, 1);
  assert.equal(before.cacheMatches, true);
  assert.equal(before.issue, null);
  assert.deepEqual(before.stop, { requested: false, mode: null, reasonDigest: null });
  assert.deepEqual(before.reconciliation, { required: false, reasonCode: null });
  assert.deepEqual(before, await executeImplementationCommand(parseImplementationCommand([
    'status', planned.runId,
  ]), { packageIdentity, adapter }));

  const lock = await executeImplementationCommand(parseImplementationCommand([
    'lock', 'inspect', planned.runId,
  ]), { packageIdentity, adapter });
  assert.equal(lock.held, true);
  assert.equal(typeof lock.recoveryToken, 'string');
  assert.equal(Object.hasOwn(before, 'manifest'), false);
  assert.equal(Object.hasOwn(before, 'snapshot'), false);
  assert.equal(Object.hasOwn(before, 'lock'), false);
  assert.equal(JSON.stringify(before).includes(lock.recoveryToken), false);
  assert.equal(JSON.stringify(before).includes('/opt/codex'), false);
  const events = await executeImplementationCommand(parseImplementationCommand([
    'events', planned.runId,
  ]), { packageIdentity, adapter });
  assert.equal(events.events.length, 1);
  const doctor = await executeImplementationCommand(parseImplementationCommand([
    'doctor', planned.runId,
  ]), { packageIdentity, adapter });
  assert.deepEqual({ ok: doctor.ok, eventCount: doctor.eventCount }, { ok: true, eventCount: 1 });

  const shadow = await executeImplementationCommand(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--shadow',
  ]), { packageIdentity, adapter });
  assert.equal(shadow.effectAuthority, false);
  assert.equal(shadow.runId, planned.runId);
  await runtime.release(planned.runId);
  const ledgerRoot = path.join(common, 'meta-framework', 'implementation', 'v1');
  const bytesBeforeDenial = await captureByteTree(ledgerRoot);
  await assert.rejects(() => executeImplementationCommand(parseImplementationCommand([
    'stop', planned.runId, '--expected-control-generation', '0', '--reason', 'offline disable proof',
  ]), { packageIdentity, adapter }), (error) => error.code === 'ACTIVATION_DISABLED');
  assert.deepEqual(await captureByteTree(ledgerRoot), bytesBeforeDenial);

  const reopened = await openImplementationLedger(common);
  const after = await readRunStatus(reopened, planned.runId);
  assert.equal(after.snapshot.revision, before.snapshotRevision);
  assert.equal(after.snapshot.phase, before.phase);
  assert.equal(after.lock.held, false);
});

test('operator status derives immutable state when the snapshot cache lags a durable event', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-status-replay-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const input = planInput();
  const planned = planImplementationStart(input);
  const capability = issueSourceInstrumentedEffectCapability('journal_write');
  let snapshotStages = 0;
  const ledger = await openImplementationLedger(common, {
    create: true,
    writeCapability: capability,
    hooks: {
      publicationCut(cut, details) {
        if (cut === 'after-stage-sync' && details.label === 'run snapshot' &&
            ++snapshotStages === 2) {
          throw new Error('cut:ready-cache');
        }
      },
    },
  });
  const runtime = createImplementationRuntime({ ledger, clock: () => NOW });
  await assert.rejects(runtime.start(input), /cut:ready-cache/u);
  await runtime.release(planned.runId);

  const adapter = createReadOnlyImplementationAdapter(common);
  const status = await executeImplementationCommand(parseImplementationCommand([
    'status', planned.runId, '--json',
  ]), { packageIdentity, adapter });
  assert.equal(status.state, 'nonterminal');
  assert.equal(status.phase, 'dormant');
  assert.equal(status.snapshotRevision, 2);
  assert.equal(status.counts.events, 1);
  assert.equal(status.cachedSnapshotRevision, 1);
  assert.equal(status.cacheMatches, false);
  assert.deepEqual(status.issue, { code: 'SNAPSHOT_CACHE_MISMATCH' });
  assert.equal(Object.hasOwn(status, 'manifest'), false);
  assert.equal(Object.hasOwn(status, 'snapshot'), false);
  assert.equal(Object.hasOwn(status, 'lock'), false);
});
