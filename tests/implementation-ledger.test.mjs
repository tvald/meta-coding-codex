import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  IMPLEMENTATION_LEDGER_LIMITS,
  ImplementationLedgerError,
  acquireRunLock,
  authorizeImplementationLedgerWrite,
  initializeRun,
  inspectRunLock,
  openImplementationLedger,
  publishControlRequest,
  publishEvent,
  publishRecord,
  publishSnapshot,
  readEvents,
  readRunStatus,
  rebuildSnapshot,
  recoverRunLock,
  replayRun,
} from '../lib/implementation-ledger.mjs';
import {
  canonicalBytes,
  canonicalDigest,
} from '../lib/implementation-protocol.mjs';

const NOW = '2026-08-14T12:00:00Z';
const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const OID_A = 'a'.repeat(40);
const OID_B = 'b'.repeat(40);

function activationInput(common, capsule, overrides = {}) {
  const receipt = {
    schemaVersion: 1,
    receiptId: 'activation_ledger_write',
    effectKind: 'ledger_write',
    binding: {
      runId: 'run-1',
      epoch: 1,
      taskId: capsule.taskId,
      taskRevision: capsule.taskRevision,
      taskRecordVersion: capsule.taskRecordVersion,
      capsuleDigest: canonicalDigest(capsule),
      controlGeneration: 0,
      correctionGeneration: 0,
    },
    policyDigest: DIGEST_A,
    evidenceDigest: DIGEST_B,
    mechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
    issuedAt: '2026-08-14T11:55:00Z',
    expiresAt: '2026-08-14T12:15:00Z',
    taskApproval: null,
  };
  const current = {
    receiptId: receipt.receiptId,
    binding: { ...receipt.binding },
    policyDigest: receipt.policyDigest,
    evidenceDigest: receipt.evidenceDigest,
    mechanism: { ...receipt.mechanism },
    taskApproval: null,
  };
  return {
    gitCommonDirectory: common,
    receipt,
    current,
    now: '2026-08-14T12:00:00Z',
    ...overrides,
  };
}

function capsuleValue() {
  return {
    schemaVersion: 1,
    taskId: 'T-0054',
    taskRevision: 2,
    taskRecordVersion: 2,
    storeId: 'task-store',
    storeGeneration: 'generation-1',
    createdAt: NOW,
    authority: 'implement the bounded ledger slice',
    outcome: 'durable execution state',
    acceptance: [],
    nonGoals: [],
    assumptions: [],
    decisions: [],
    route: 'initiative',
    risk: 'critical',
    gateDigest: DIGEST_A,
    checkCatalogDigest: DIGEST_B,
    detailDigests: [],
    baseCommit: OID_A,
    baseStatusDigest: DIGEST_A,
  };
}

async function fixture(t, { publicationCut = null } = {}) {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const capsule = capsuleValue();
  const manifest = {
    schemaVersion: 1,
    runId: 'run-1',
    createdAt: NOW,
    task: {
      id: capsule.taskId,
      taskRevision: capsule.taskRevision,
      recordVersion: capsule.taskRecordVersion,
      storeId: capsule.storeId,
      storeGeneration: capsule.storeGeneration,
    },
    capsuleDigest: canonicalDigest(capsule),
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0', protocolVersion: 1 },
    provider: {
      adapter: 'fake',
      adapterVersion: '1',
      harness: 'codex',
      executableRealpath: '/bin/false',
      executableVersion: '0.147.0',
    },
    repository: {
      rootIdentity: DIGEST_A,
      objectFormat: 'sha1',
      baseCommit: OID_A,
      baseTree: OID_B,
      canonicalWorktreeIdentity: DIGEST_B,
    },
    limits: {
      backgroundWip: 3,
      rootWip: 1,
      maxEvents: 10_000,
      maxDiagnosticBytes: 64 * 1024 * 1024,
      orientationBytes: 96 * 1024,
    },
    policyDigests: { promptRegistry: DIGEST_A, checks: DIGEST_B, resources: DIGEST_A },
  };
  const writeCapability = await authorizeImplementationLedgerWrite(
    activationInput(common, capsule),
  );
  const ledger = await openImplementationLedger(common, {
    hooks: publicationCut === null ? null : { publicationCut },
    create: true,
    writeCapability,
  });
  return { common, ledger, manifest, capsule, writeCapability };
}

async function initialized(t, options) {
  const value = await fixture(t, options);
  await initializeRun(value.ledger, { manifest: value.manifest, capsule: value.capsule });
  return value;
}

function runRoot(common) {
  return path.join(common, 'meta-framework', 'implementation', 'v1', 'runs', 'run-1');
}

function binding(capsule, overrides = {}) {
  return {
    runId: 'run-1',
    epoch: 1,
    snapshotRevision: 1,
    taskId: capsule.taskId,
    taskRevision: capsule.taskRevision,
    taskRecordVersion: capsule.taskRecordVersion,
    capsuleDigest: canonicalDigest(capsule),
    controlGeneration: 0,
    correctionGeneration: 0,
    ...overrides,
  };
}

function event(capsule, sequence, overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: `event-${sequence}`,
    sequence,
    binding: binding(capsule),
    kind: 'snapshot_published',
    subject: { kind: 'detail', id: 'subject-1', digest: DIGEST_A },
    causationId: null,
    correlationId: 'correlation-1',
    producer: { kind: 'controller', connectionId: null },
    dedupeKey: `dedupe-${sequence}`,
    observedAt: NOW,
    payload: { kind: 'detail', id: 'payload-1', digest: DIGEST_B },
    ...overrides,
  };
}

function initialSnapshot() {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    revision: 1,
    previousDigest: null,
    epoch: 1,
    controlGeneration: 0,
    phase: 'preflight',
  };
}

async function heldLock(ledger, epoch = 1) {
  const lock = await acquireRunLock(ledger, 'run-1', { epoch, acquiredAt: NOW });
  return { lock, fence: { lockToken: lock.token, epoch: lock.epoch } };
}

function hasCode(code) {
  return (error) => error instanceof ImplementationLedgerError && error.code === code;
}

test('read-only open is non-mutating and cleanly reports an absent ledger', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-readonly-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  assert.deepEqual(await fs.readdir(common), []);
  await assert.rejects(openImplementationLedger(common), hasCode('LEDGER_MISSING'));
  assert.deepEqual(await fs.readdir(common), []);
  await assert.rejects(openImplementationLedger(common, { create: true }),
    hasCode('WRITE_CAPABILITY_REQUIRED'));
  assert.deepEqual(await fs.readdir(common), []);
});

test('missing, expired, and stale activation receipts cannot create ledger authority', async (t) => {
  const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-denied-'));
  t.after(() => fs.rm(common, { recursive: true, force: true }));
  const capsule = capsuleValue();
  await assert.rejects(authorizeImplementationLedgerWrite({ gitCommonDirectory: common }), (error) =>
    hasCode('ACTIVATION_DENIED')(error) && error.activationCode === 'ACTIVATION_DISABLED');

  const expired = activationInput(common, capsule, { now: '2026-08-14T12:15:00Z' });
  await assert.rejects(authorizeImplementationLedgerWrite(expired), (error) =>
    hasCode('ACTIVATION_DENIED')(error) && error.activationCode === 'ACTIVATION_EXPIRED');

  const stale = activationInput(common, capsule);
  stale.current.binding.epoch += 1;
  await assert.rejects(authorizeImplementationLedgerWrite(stale), (error) =>
    hasCode('ACTIVATION_DENIED')(error) && error.activationCode === 'ACTIVATION_STALE');
  assert.deepEqual(await fs.readdir(common), []);
});

test('opaque capabilities reject forgeries and bind activation to one physical ledger', async (t) => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-scope-a-'));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-scope-b-'));
  t.after(() => Promise.all([
    fs.rm(first, { recursive: true, force: true }),
    fs.rm(second, { recursive: true, force: true }),
  ]));
  const capsule = capsuleValue();
  const activation = activationInput(first, capsule);
  const capability = await authorizeImplementationLedgerWrite(activation);
  assert.deepEqual(Object.keys(capability), []);

  for (const forged of [true, {}, activation.receipt, { authorized: true }]) {
    await assert.rejects(openImplementationLedger(first, {
      create: true,
      writeCapability: forged,
    }), hasCode('WRITE_CAPABILITY_REQUIRED'));
  }
  assert.deepEqual(await fs.readdir(first), []);
  await assert.rejects(openImplementationLedger(second, {
    create: true,
    writeCapability: capability,
  }), hasCode('WRITE_CAPABILITY_SCOPE'));
  assert.deepEqual(await fs.readdir(second), []);

  await openImplementationLedger(first, { create: true, writeCapability: capability });
  const readOnly = await openImplementationLedger(first);
  const mutationAttempts = [
    () => initializeRun(readOnly, { manifest: {}, capsule: {} }),
    () => publishRecord(readOnly, 'run-1', {}),
    () => publishEvent(readOnly, 'run-1', {}),
    () => publishControlRequest(readOnly, 'run-1', {}),
    () => publishSnapshot(readOnly, 'run-1', {}),
    () => acquireRunLock(readOnly, 'run-1', { epoch: 1 }),
    () => recoverRunLock(readOnly, 'run-1', {
      expectedToken: 'incomplete',
      confirmOwnerNotLive: true,
    }),
  ];
  for (const attempt of mutationAttempts) {
    await assert.rejects(attempt(), hasCode('WRITE_CAPABILITY_REQUIRED'));
  }
  await assert.rejects(openImplementationLedger(first, {
    writeCapability: activation.receipt,
  }), hasCode('WRITE_CAPABILITY_REQUIRED'));
});

test('run initialization publishes exact JCS atomically and is idempotent', async (t) => {
  const { common, ledger, manifest, capsule } = await fixture(t);
  const first = await initializeRun(ledger, { manifest, capsule });
  assert.equal(first.created, true);
  const root = runRoot(common);
  assert.deepEqual(await fs.readFile(path.join(root, 'manifest.json')), canonicalBytes(manifest));
  assert.deepEqual(await fs.readFile(path.join(root, 'capsule.json')), canonicalBytes(capsule));
  assert.equal((await fs.stat(path.join(root, 'manifest.json'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700);

  const duplicate = await initializeRun(ledger, { manifest, capsule });
  assert.equal(duplicate.created, false);
  const conflict = structuredClone(manifest);
  conflict.createdAt = '2026-08-14T12:00:01Z';
  await assert.rejects(initializeRun(ledger, { manifest: conflict, capsule }), hasCode('RUN_CONFLICT'));
  assert.deepEqual(await fs.readFile(path.join(root, 'manifest.json')), canonicalBytes(manifest));
});

test('run initialization publication cuts are retry-safe', async (t) => {
  let cut = null;
  const { common, ledger, manifest, capsule } = await fixture(t, {
    publicationCut(name, details) {
      if (cut === name && details.label === 'run initialization') throw new Error(`cut:${name}`);
    },
  });
  cut = 'after-stage-sync';
  await assert.rejects(initializeRun(ledger, { manifest, capsule }), /cut:after-stage-sync/u);
  await assert.rejects(fs.access(runRoot(common)), { code: 'ENOENT' });

  cut = 'after-publication';
  await assert.rejects(initializeRun(ledger, { manifest, capsule }), /cut:after-publication/u);
  assert.deepEqual(await fs.readFile(path.join(runRoot(common), 'manifest.json')), canonicalBytes(manifest));
  cut = null;
  assert.equal((await initializeRun(ledger, { manifest, capsule })).created, false);
});

test('descriptor anchoring rejects symlinked common roots and linked record files', async (t) => {
  const actual = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-real-'));
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-ledger-link-'));
  t.after(() => Promise.all([
    fs.rm(actual, { recursive: true, force: true }),
    fs.rm(parent, { recursive: true, force: true }),
  ]));
  const linkedCommon = path.join(parent, 'common');
  await fs.symlink(actual, linkedCommon, 'dir');
  await assert.rejects(openImplementationLedger(linkedCommon), hasCode('PATH_UNSAFE'));

  const { common, ledger } = await initialized(t);
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  await publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-1', version: 1,
    value: { schemaVersion: 1, note: 'immutable' },
  }, fence);
  const record = path.join(runRoot(common), 'records', 'detail', 'detail-1', '1.json');
  await fs.link(record, path.join(common, 'external-hardlink.json'));
  await assert.rejects(replayRun(ledger, 'run-1'), hasCode('PATH_UNSAFE'));
});

test('exclusive run locks expose token and epoch without inferring owner death', async (t) => {
  const { ledger } = await initialized(t);
  const results = await Promise.allSettled([
    acquireRunLock(ledger, 'run-1', { epoch: 4, acquiredAt: NOW }),
    acquireRunLock(ledger, 'run-1', { epoch: 4, acquiredAt: NOW }),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = results.find(({ status }) => status === 'rejected');
  assert.equal(rejected.reason.code, 'LOCK_BUSY');
  const lock = results.find(({ status }) => status === 'fulfilled').value;
  const inspected = await inspectRunLock(ledger, 'run-1');
  assert.equal(inspected.state, 'owned');
  assert.equal(inspected.owner.token, lock.token);
  assert.equal(inspected.owner.epoch, 4);
  assert.equal(typeof inspected.owner.pid, 'number');
  assert.equal(typeof inspected.owner.host, 'string');
  assert.equal(Object.hasOwn(inspected, 'ownerDead'), false);
  await lock.release();
  assert.equal((await inspectRunLock(ledger, 'run-1')).state, 'absent');
});

test('lock recovery requires confirmation and the exact observed token', async (t) => {
  const { ledger } = await initialized(t);
  const lock = await acquireRunLock(ledger, 'run-1', { epoch: 2, acquiredAt: NOW });
  await assert.rejects(recoverRunLock(ledger, 'run-1', {
    expectedToken: lock.token,
  }), hasCode('LOCK_RECOVERY_CONFIRMATION'));
  await assert.rejects(recoverRunLock(ledger, 'run-1', {
    expectedToken: '00000000-0000-4000-8000-000000000000',
    confirmOwnerNotLive: true,
  }), hasCode('LOCK_RECOVERY_STALE'));
  const recovered = await recoverRunLock(ledger, 'run-1', {
    expectedToken: lock.token,
    confirmOwnerNotLive: true,
  });
  assert.equal(recovered.owner.epoch, 2);
  assert.equal((await inspectRunLock(ledger, 'run-1')).held, false);
});

test('record publication is fenced, chained, idempotent, and conflict preserving', async (t) => {
  const { common, ledger } = await initialized(t);
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  const firstValue = {
    schemaVersion: 1,
    attemptId: 'attempt-1',
    recordVersion: 1,
    previousDigest: null,
    state: 'allocated',
  };
  const first = await publishRecord(ledger, 'run-1', {
    kind: 'attempt', id: 'attempt-1', version: 1, value: firstValue,
  }, fence);
  assert.equal(first.created, true);
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'wrong-epoch', version: 1, value: { schemaVersion: 1 },
  }, { lockToken: lock.token, epoch: lock.epoch + 1 }), hasCode('LOCK_STALE'));
  assert.equal((await publishRecord(ledger, 'run-1', {
    kind: 'attempt', id: 'attempt-1', version: 1, value: firstValue,
  }, fence)).created, false);

  const conflicting = { ...firstValue, state: 'running' };
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'attempt', id: 'attempt-1', version: 1, value: conflicting,
  }, fence), (error) => hasCode('DUPLICATE_CONFLICT')(error) && error.reconciliationRequired);

  const secondValue = {
    ...firstValue,
    recordVersion: 2,
    previousDigest: canonicalDigest(firstValue),
    state: 'launch_intended',
  };
  await publishRecord(ledger, 'run-1', {
    kind: 'attempt', id: 'attempt-1', version: 2, value: secondValue,
  }, fence);
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'attempt', id: 'attempt-1', version: 4,
    value: { ...secondValue, recordVersion: 4 },
  }, fence), hasCode('RECORD_VERSION_GAP'));
  assert.deepEqual(await fs.readFile(path.join(runRoot(common), 'records', 'attempt', 'attempt-1', '1.json')),
    canonicalBytes(firstValue));

  await lock.release();
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-2', version: 1, value: { schemaVersion: 1 },
  }, fence), hasCode('LOCK_STALE'));
});

test('immutable publication cuts leave either no record or the exact final record', async (t) => {
  let cut = null;
  const { common, ledger } = await initialized(t, {
    publicationCut(name, details) {
      if (cut === name && details.label.startsWith('detail record')) throw new Error(`cut:${name}`);
    },
  });
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  const value = { schemaVersion: 1, note: 'crash safe' };
  const record = path.join(runRoot(common), 'records', 'detail', 'detail-1', '1.json');

  cut = 'after-stage-sync';
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-1', version: 1, value,
  }, fence), /cut:after-stage-sync/u);
  await assert.rejects(fs.access(record), { code: 'ENOENT' });

  cut = 'after-publication';
  await assert.rejects(publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-1', version: 1, value,
  }, fence), /cut:after-publication/u);
  assert.deepEqual(await fs.readFile(record), canonicalBytes(value));
  cut = null;
  assert.equal((await publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-1', version: 1, value,
  }, fence)).created, false);
});

test('events enforce sequence and semantic dedupe and expose bounded reads', async (t) => {
  const { ledger, capsule } = await initialized(t);
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  const first = event(capsule, 1);
  await publishEvent(ledger, 'run-1', first, fence);
  assert.equal((await publishEvent(ledger, 'run-1', first, fence)).created, false);
  const duplicateSemantic = event(capsule, 2, { eventId: 'event-2', dedupeKey: first.dedupeKey });
  const duplicate = await publishEvent(ledger, 'run-1', duplicateSemantic, fence);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.sequence, 1);
  await assert.rejects(publishEvent(ledger, 'run-1', event(capsule, 2, {
    dedupeKey: first.dedupeKey,
    payload: { kind: 'detail', id: 'payload-1', digest: DIGEST_A },
  }), fence), hasCode('EVENT_DEDUPE_CONFLICT'));
  await assert.rejects(publishEvent(ledger, 'run-1', event(capsule, 3), fence), hasCode('EVENT_GAP'));
  await publishEvent(ledger, 'run-1', event(capsule, 2), fence);
  const read = await readEvents(ledger, 'run-1', { afterSequence: 0, limit: 1 });
  assert.equal(read.events.length, 1);
  assert.equal(read.hasMore, true);
  await assert.rejects(readEvents(ledger, 'run-1', {
    limit: IMPLEMENTATION_LEDGER_LIMITS.eventReadLimit + 1,
  }), hasCode('ARGUMENT_INVALID'));
});

test('control requests are exact append-only multi-writer records', async (t) => {
  const { common, ledger } = await initialized(t);
  const request = {
    schemaVersion: 1,
    requestId: 'stop-1',
    runId: 'run-1',
    expectedControlGeneration: 0,
    kind: 'stop',
    requestedAt: NOW,
    reason: 'operator requested checkpoint',
  };
  assert.equal((await publishControlRequest(ledger, 'run-1', request)).created, true);
  assert.equal((await publishControlRequest(ledger, 'run-1', request)).created, false);
  await assert.rejects(publishControlRequest(ledger, 'run-1', {
    ...request,
    reason: 'conflicting request',
  }), hasCode('DUPLICATE_CONFLICT'));
  assert.deepEqual(await fs.readFile(path.join(runRoot(common), 'control', 'stop-1.json')),
    canonicalBytes(request));

  const competing = { ...request, requestId: 'resume-1', kind: 'resume' };
  const results = await Promise.all([
    publishControlRequest(ledger, 'run-1', competing),
    publishControlRequest(ledger, 'run-1', competing),
  ]);
  assert.deepEqual(results.map(({ created }) => created).sort(), [false, true]);
});

test('snapshot publication uses a stale-safe digest chain and atomic replacement', async (t) => {
  const { common, ledger } = await initialized(t);
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  const first = initialSnapshot();
  const firstResult = await publishSnapshot(ledger, 'run-1', first, fence);
  assert.equal(firstResult.created, true);
  assert.equal((await publishSnapshot(ledger, 'run-1', first, fence)).created, false);
  const second = {
    ...first,
    revision: 2,
    previousDigest: canonicalDigest(first),
    phase: 'dormant',
  };
  await publishSnapshot(ledger, 'run-1', second, fence);
  await assert.rejects(publishSnapshot(ledger, 'run-1', {
    ...second,
    revision: 3,
    previousDigest: DIGEST_A,
  }, fence), hasCode('SNAPSHOT_STALE'));
  assert.deepEqual(await fs.readFile(path.join(runRoot(common), 'snapshot.json')), canonicalBytes(second));
});

test('replay rebuilds from immutable records and ignores a corrupt snapshot cache', async (t) => {
  const { common, ledger, capsule } = await initialized(t);
  const { lock, fence } = await heldLock(ledger);
  t.after(() => lock.release().catch(() => {}));
  await publishRecord(ledger, 'run-1', {
    kind: 'detail', id: 'detail-1', version: 1,
    value: { schemaVersion: 1, note: 'replayed' },
  }, fence);
  await publishEvent(ledger, 'run-1', event(capsule, 1), fence);
  await publishControlRequest(ledger, 'run-1', {
    schemaVersion: 1,
    requestId: 'resume-1',
    runId: 'run-1',
    expectedControlGeneration: 0,
    kind: 'resume',
    requestedAt: NOW,
  });
  const snapshotPath = path.join(runRoot(common), 'snapshot.json');
  await fs.writeFile(snapshotPath, '{"schemaVersion":1', { mode: 0o600 });
  const readOnly = await openImplementationLedger(common);
  const replay = await replayRun(readOnly, 'run-1');
  assert.equal(replay.records.length, 1);
  assert.equal(replay.events.length, 1);
  assert.equal(replay.controls.length, 1);
  assert.equal((await readEvents(readOnly, 'run-1')).events.length, 1);
  assert.equal((await inspectRunLock(readOnly, 'run-1')).state, 'owned');
  const rebuilt = await rebuildSnapshot(readOnly, 'run-1', (state) => ({
    ...initialSnapshot(),
    phase: state.events.length === 1 ? 'dormant' : 'reconciliation_required',
  }));
  assert.equal(rebuilt.phase, 'dormant');
  const status = await readRunStatus(readOnly, 'run-1');
  assert.equal(status.state, 'reconciliation_required');
  assert.equal(status.snapshot, null);
});

test('unknown v2 state is preserved and fails closed', async (t) => {
  const { common, ledger } = await initialized(t);
  const v2 = path.join(common, 'meta-framework', 'implementation', 'v2');
  await fs.mkdir(v2, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(v2, 'sentinel'), 'preserve me');

  const recordDirectory = path.join(runRoot(common), 'records', 'detail', 'future-1');
  await fs.mkdir(recordDirectory, { recursive: true, mode: 0o700 });
  const future = canonicalBytes({ schemaVersion: 2, future: true });
  const futurePath = path.join(recordDirectory, '1.json');
  await fs.writeFile(futurePath, future, { mode: 0o600 });
  await assert.rejects(replayRun(ledger, 'run-1'), hasCode('VERSION_UNSUPPORTED'));
  assert.deepEqual(await fs.readFile(futurePath), future);
  assert.equal(await fs.readFile(path.join(v2, 'sentinel'), 'utf8'), 'preserve me');
  await openImplementationLedger(common);
  assert.equal(await fs.readFile(path.join(v2, 'sentinel'), 'utf8'), 'preserve me');
});

test('bounded status rejects oversized snapshots and unknown lock versions remain held', async (t) => {
  const { common, ledger } = await initialized(t);
  const snapshotPath = path.join(runRoot(common), 'snapshot.json');
  await fs.writeFile(snapshotPath, Buffer.alloc(256 * 1024 + 1, 0x20), { mode: 0o600 });
  await assert.rejects(readRunStatus(ledger, 'run-1'), hasCode('PATH_UNSAFE'));

  await fs.mkdir(path.join(common, 'meta-framework', 'implementation', 'v1', 'locks', 'run-1.lock'), {
    mode: 0o700,
  });
  const ownerPath = path.join(common, 'meta-framework', 'implementation', 'v1', 'locks',
    'run-1.lock', 'owner.json');
  const owner = canonicalBytes({ schemaVersion: 2, token: 'future' });
  await fs.writeFile(ownerPath, owner, { mode: 0o600 });
  const inspected = await inspectRunLock(ledger, 'run-1');
  assert.equal(inspected.state, 'unsupported');
  await assert.rejects(recoverRunLock(ledger, 'run-1', {
    expectedToken: 'incomplete',
    confirmOwnerNotLive: true,
  }), hasCode('VERSION_UNSUPPORTED'));
  assert.deepEqual(await fs.readFile(ownerPath), owner);
});
