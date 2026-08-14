import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createReadOnlyImplementationAdapter,
  executeImplementationCommand,
  parseImplementationCommand,
} from '../lib/implementation-cli.mjs';
import {
  acquireRunLock,
  authorizeImplementationLedgerWrite,
  initializeRun,
  openImplementationLedger,
  publishEvent,
  publishSnapshot,
  readRunStatus,
} from '../lib/implementation-ledger.mjs';
import { canonicalDigest } from '../lib/implementation-protocol.mjs';

const NOW = '2026-08-14T12:00:00Z';
const digest = (character) => `sha256:${character.repeat(64)}`;
const oid = (character) => character.repeat(40);
const packageIdentity = Object.freeze({ name: '@tvald/meta-framework', version: '1.0.0' });

function capsule() {
  return {
    schemaVersion: 1, taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 5,
    storeId: 'task_store', storeGeneration: 'generation_1', createdAt: NOW,
    authority: 'User authorized offline controller implementation.',
    outcome: 'Exercise an offline run lifecycle.', acceptance: [], nonGoals: [], assumptions: [], decisions: [],
    route: 'initiative', risk: 'critical', gateDigest: digest('a'), checkCatalogDigest: digest('b'),
    detailDigests: [], baseCommit: oid('1'), baseStatusDigest: digest('c'),
  };
}

function manifest(value) {
  return {
    schemaVersion: 1, runId: 'run_54', createdAt: NOW,
    task: {
      id: value.taskId, taskRevision: value.taskRevision, recordVersion: value.taskRecordVersion,
      storeId: value.storeId, storeGeneration: value.storeGeneration,
    },
    capsuleDigest: canonicalDigest(value),
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0', protocolVersion: 1 },
    provider: {
      adapter: 'codex_exec_v1', adapterVersion: '1.0.0', harness: 'codex',
      executableRealpath: '/bin/false', executableVersion: '0.147.0',
    },
    repository: {
      rootIdentity: digest('d'), objectFormat: 'sha1', baseCommit: oid('1'), baseTree: oid('2'),
      canonicalWorktreeIdentity: digest('e'),
    },
    limits: {
      backgroundWip: 3, rootWip: 1, maxEvents: 10_000,
      maxDiagnosticBytes: 64 * 1024 * 1024, orientationBytes: 96 * 1024,
    },
    policyDigests: { promptRegistry: digest('f'), checks: digest('a'), resources: digest('b') },
  };
}

function activation(common, value) {
  const receipt = {
    schemaVersion: 1, receiptId: 'activation_ledger', effectKind: 'ledger_write',
    binding: {
      runId: 'run_54', epoch: 1, taskId: value.taskId, taskRevision: value.taskRevision,
      taskRecordVersion: value.taskRecordVersion, capsuleDigest: canonicalDigest(value),
      controlGeneration: 0, correctionGeneration: 0,
    },
    policyDigest: digest('a'), evidenceDigest: digest('b'),
    mechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
    issuedAt: '2026-08-14T11:55:00Z', expiresAt: '2026-08-14T12:15:00Z', taskApproval: null,
  };
  return {
    gitCommonDirectory: common,
    receipt,
    current: {
      receiptId: receipt.receiptId, binding: { ...receipt.binding }, policyDigest: receipt.policyDigest,
      evidenceDigest: receipt.evidenceDigest, mechanism: { ...receipt.mechanism }, taskApproval: null,
    },
    now: NOW,
  };
}

test('offline ledger, operator reads, shadow planning, disable, and recovery preserve one run', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-e2e-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const value = capsule();
  const capability = await authorizeImplementationLedgerWrite(activation(common, value));
  const ledger = await openImplementationLedger(common, { create: true, writeCapability: capability });
  await initializeRun(ledger, { manifest: manifest(value), capsule: value });
  const lock = await acquireRunLock(ledger, 'run_54', { epoch: 1, acquiredAt: NOW });
  const fence = { lockToken: lock.token, epoch: lock.epoch };
  const snapshot = {
    schemaVersion: 1, runId: 'run_54', revision: 1, previousDigest: null,
    epoch: 1, controlGeneration: 0, phase: 'waiting',
  };
  await publishSnapshot(ledger, 'run_54', snapshot, fence);
  await publishEvent(ledger, 'run_54', {
    schemaVersion: 1, eventId: 'event_1', sequence: 1,
    binding: {
      runId: 'run_54', epoch: 1, snapshotRevision: 1, taskId: 'T-0054', taskRevision: 2,
      taskRecordVersion: 5, capsuleDigest: canonicalDigest(value), controlGeneration: 0,
      correctionGeneration: 0,
    },
    kind: 'snapshot_published', subject: { kind: 'detail', id: 'snapshot_1', digest: digest('c') },
    causationId: null, correlationId: 'run_54',
    producer: { kind: 'controller', connectionId: null }, dedupeKey: 'snapshot_1', observedAt: NOW,
    payload: { kind: 'detail', id: 'snapshot_1', digest: digest('c') },
  }, fence);
  await lock.release();

  const adapter = createReadOnlyImplementationAdapter(common);
  const statusCommand = parseImplementationCommand(['status', 'run_54', '--json']);
  const before = await executeImplementationCommand(statusCommand, { packageIdentity, adapter });
  assert.equal(before.state, 'nonterminal');
  assert.equal(before.snapshot.phase, 'waiting');
  const events = await executeImplementationCommand(parseImplementationCommand(['events', 'run_54']), {
    packageIdentity, adapter,
  });
  assert.equal(events.events.length, 1);
  const doctor = await executeImplementationCommand(parseImplementationCommand(['doctor', 'run_54']), {
    packageIdentity, adapter,
  });
  assert.deepEqual({ ok: doctor.ok, eventCount: doctor.eventCount }, { ok: true, eventCount: 1 });

  const shadow = await executeImplementationCommand(parseImplementationCommand([
    'T-0054', '--expected-task-revision', '2', '--harness', 'codex', '--shadow',
  ]), { packageIdentity, adapter });
  assert.equal(shadow.effectAuthority, false);
  await assert.rejects(() => executeImplementationCommand(parseImplementationCommand([
    'stop', 'run_54', '--expected-control-generation', '0', '--reason', 'offline disable proof',
  ]), { packageIdentity, adapter }), (error) => error.code === 'ACTIVATION_DISABLED');

  const reopened = await openImplementationLedger(common);
  const after = await readRunStatus(reopened, 'run_54');
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.equal(after.lock.held, false);
});
