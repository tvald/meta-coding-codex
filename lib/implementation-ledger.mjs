import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { authorizeImplementationOperation } from './implementation-activation.mjs';
import {
  IMPLEMENTATION_PROTOCOL_LIMITS,
  IMPLEMENTATION_PROTOCOL_VERSION,
  REF_KINDS,
  canonicalBytes,
  canonicalDigest,
  parseCanonicalJson,
  sha256Digest,
  validateBinding,
  validateControllerId,
  validateRef,
  validateTimestamp,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_LEDGER_RELATIVE = 'meta-framework/implementation/v1';

export const IMPLEMENTATION_LEDGER_LIMITS = Object.freeze({
  recordFiles: 10_000,
  controlRequests: IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
  eventReadLimit: IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
  directoryEntries: 10_001,
  lockBytes: 4_096,
});

const DIRECTORY_FLAGS = FS_CONSTANTS.O_RDONLY |
  (FS_CONSTANTS.O_DIRECTORY ?? 0) |
  (FS_CONSTANTS.O_NOFOLLOW ?? 0);
const READ_FLAGS = FS_CONSTANTS.O_RDONLY | (FS_CONSTANTS.O_NOFOLLOW ?? 0);
const WRITE_EXCLUSIVE_FLAGS = FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT |
  FS_CONSTANTS.O_EXCL | (FS_CONSTANTS.O_NOFOLLOW ?? 0);
const LEDGERS = new WeakSet();
const LEDGER_WRITE_CAPABILITIES = new WeakSet();
const LEDGER_WRITE_SCOPES = new WeakMap();
const LEDGER_WRITE_AUTHORITY = new WeakSet();
const RECORD_KINDS = new Set(REF_KINDS.filter((kind) => kind !== 'event'));
const INTERNAL_RUN_ENTRIES = new Set([
  'manifest.json',
  'capsule.json',
  'records',
  'events',
  'control',
  'snapshot.json',
  'spool',
  '.staging',
]);
const INTERNAL_RUN_DIRECTORIES = ['records', 'events', 'control', 'spool', '.staging'];
const TERMINAL_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const VERSION_FILE = /^([1-9]\d*)\.json$/u;
const EVENT_FILE = /^([1-9]\d*)\.json$/u;

const RECORD_ID_FIELDS = Object.freeze({
  assignment: 'assignmentId',
  attempt: 'attemptId',
  operation: 'operationId',
  candidate: 'candidateId',
  check_receipt: 'receiptId',
  resource_receipt: 'receiptId',
  launch_receipt: 'receiptId',
  terminal_receipt: 'receiptId',
  decision: 'decisionId',
});

const RECORD_VERSION_FIELDS = Object.freeze({
  assignment: 'generation',
  attempt: 'recordVersion',
  operation: 'recordVersion',
  launch_receipt: 'recordVersion',
});

export class ImplementationLedgerError extends Error {
  constructor(code, message, { reconciliationRequired = false, activationCode = null } = {}) {
    super(message);
    this.name = 'ImplementationLedgerError';
    this.code = code;
    this.reconciliationRequired = reconciliationRequired;
    this.activationCode = activationCode;
  }
}

function fail(code, message, options) {
  throw new ImplementationLedgerError(code, message, options);
}

function reconciliation(code, message) {
  fail(code, message, { reconciliationRequired: true });
}

function ordinaryObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('ARGUMENT_INVALID', `${label} is invalid`);
  }
  return value;
}

function validateVersionOne(value, label) {
  if (!ordinaryObject(value)) fail('RECORD_INVALID', `${label} must be an object`);
  if (value.schemaVersion !== IMPLEMENTATION_PROTOCOL_VERSION) {
    fail('VERSION_UNSUPPORTED', `${label} uses an unsupported schema version`);
  }
  return value;
}

function identity(info) {
  return Object.freeze({ dev: String(info.dev), ino: String(info.ino) });
}

function sameIdentity(info, expected) {
  return String(info.dev) === expected.dev && String(info.ino) === expected.ino;
}

function safeOwnedMode(info, kind) {
  const permissions = info.mode & 0o777;
  return kind === 'directory'
    ? permissions === 0o700
    : permissions === 0o600;
}

async function syncHandle(handle) {
  try {
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF', 'EISDIR'].includes(error?.code)) throw error;
  }
}

async function publicationCut(ledger, cut, details) {
  if (typeof ledger.hooks?.publicationCut === 'function') {
    await ledger.hooks.publicationCut(cut, Object.freeze({ ...details }));
  }
}

function anchored(directory, name = '') {
  if (typeof name !== 'string' || name.includes('/') || name === '.' || name === '..' ||
      name.includes('\0')) {
    fail('PATH_UNSAFE', 'an anchored path component is invalid');
  }
  return name === '' ? directory.anchor : `${directory.anchor}/${name}`;
}

async function verifyDirectory(directory, { requireName = true } = {}) {
  const opened = await directory.handle.stat().catch(() => null);
  if (opened === null || !opened.isDirectory() || !sameIdentity(opened, directory.identity)) return false;
  if (directory.owned && !safeOwnedMode(opened, 'directory')) return false;
  if (!requireName) return true;
  const named = await fs.lstat(directory.lexical).catch(() => null);
  if (named === null || named.isSymbolicLink() || !named.isDirectory() ||
      !sameIdentity(named, directory.identity)) return false;
  return await fs.realpath(directory.anchor).catch(() => null) === directory.lexical;
}

async function openDirectory(lexical, label, { owned = false } = {}) {
  const resolved = path.resolve(lexical);
  let handle;
  try {
    handle = await fs.open(resolved, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const named = await fs.lstat(resolved);
    const anchor = `/proc/self/fd/${handle.fd}`;
    const real = await fs.realpath(anchor);
    if (!opened.isDirectory() || named.isSymbolicLink() || !named.isDirectory() ||
        opened.dev !== named.dev || opened.ino !== named.ino || real !== resolved ||
        (owned && !safeOwnedMode(opened, 'directory'))) {
      fail('PATH_UNSAFE', `${label} is not a safe ordinary directory`);
    }
    return { handle, anchor, lexical: resolved, identity: identity(opened), owned };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ImplementationLedgerError) throw error;
    fail('PATH_UNSAFE', `${label} cannot be descriptor-anchored`);
  }
}

async function openChildDirectory(parent, name, label, {
  create = false,
  missingCode = 'LEDGER_MISSING',
} = {}) {
  if (!await verifyDirectory(parent)) fail('PATH_UNSAFE', `${label} parent identity changed`);
  const lexical = path.join(parent.lexical, name);
  if (create) {
    try {
      await fs.mkdir(anchored(parent, name), { mode: 0o700 });
      await syncHandle(parent.handle);
    } catch (error) {
      if (error?.code !== 'EEXIST') fail('PATH_UNSAFE', `${label} cannot be created safely`);
    }
  } else {
    const present = await fs.lstat(anchored(parent, name)).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      fail('PATH_UNSAFE', `${label} cannot be inspected`);
    });
    if (present === null) fail(missingCode, `${label} is absent`);
  }
  return openDirectory(lexical, label, { owned: true });
}

async function closeDirectory(directory) {
  await directory?.handle?.close().catch(() => {});
}

async function withChildDirectory(parent, name, label, options, operation) {
  const child = await openChildDirectory(parent, name, label, options);
  try {
    return await operation(child);
  } finally {
    await closeDirectory(child);
  }
}

async function listDirectory(directory, limit, label) {
  if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', `${label} identity changed`);
  const entries = [];
  let handle;
  try {
    handle = await fs.opendir(directory.anchor);
    for await (const entry of handle) {
      entries.push(entry);
      if (entries.length > limit) fail('LEDGER_BOUNDS', `${label} exceeds its entry bound`);
    }
  } catch (error) {
    if (error instanceof ImplementationLedgerError) throw error;
    fail('PATH_UNSAFE', `${label} cannot be enumerated safely`);
  } finally {
    await handle?.close().catch((error) => {
      if (error?.code !== 'ERR_DIR_CLOSED') throw error;
    });
  }
  return entries;
}

async function writeExclusiveFile(directory, name, bytes, label) {
  if (!Buffer.isBuffer(bytes)) fail('ARGUMENT_INVALID', `${label} bytes are invalid`);
  if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', `${label} parent identity changed`);
  let handle;
  let created = false;
  try {
    handle = await fs.open(anchored(directory, name), WRITE_EXCLUSIVE_FLAGS, 0o600);
    created = true;
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    const opened = await handle.stat();
    const named = await fs.lstat(anchored(directory, name));
    if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || !named.isFile() ||
        opened.dev !== named.dev || opened.ino !== named.ino || opened.size !== bytes.length ||
        named.size !== bytes.length || !safeOwnedMode(opened, 'file') || !safeOwnedMode(named, 'file')) {
      fail('PATH_UNSAFE', `${label} changed during exclusive creation`);
    }
    return { identity: identity(opened), size: opened.size, digest: sha256Digest(bytes) };
  } catch (error) {
    if (error?.code === 'EEXIST') fail('DESTINATION_EXISTS', `${label} already exists`);
    if (error instanceof ImplementationLedgerError) throw error;
    fail('PUBLICATION_FAILED', `${label} cannot be written durably`);
  } finally {
    if (!created) await handle?.close().catch(() => {});
    else await handle?.close().catch(() => {});
  }
}

async function readFile(directory, name, label, {
  maxBytes = IMPLEMENTATION_PROTOCOL_LIMITS.recordBytes,
  requireMode = true,
} = {}) {
  if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', `${label} parent identity changed`);
  const before = await fs.lstat(anchored(directory, name)).catch((error) => {
    if (error?.code === 'ENOENT') fail('RECORD_MISSING', `${label} is missing`);
    fail('PATH_UNSAFE', `${label} cannot be inspected`);
  });
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1 || before.size < 1 ||
      before.size > maxBytes || (requireMode && !safeOwnedMode(before, 'file'))) {
    fail('PATH_UNSAFE', `${label} is not one bounded ordinary file`);
  }
  let handle;
  try {
    handle = await fs.open(anchored(directory, name), READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev ||
        opened.ino !== before.ino || opened.size !== before.size ||
        (requireMode && !safeOwnedMode(opened, 'file'))) {
      fail('PATH_UNSAFE', `${label} changed while it was opened`);
    }
    const bytes = await handle.readFile();
    const after = await fs.lstat(anchored(directory, name)).catch(() => null);
    if (after === null || after.isSymbolicLink() || !after.isFile() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        bytes.length !== opened.size || (requireMode && !safeOwnedMode(after, 'file'))) {
      fail('PATH_UNSAFE', `${label} changed while it was read`);
    }
    return Object.freeze({ bytes, digest: sha256Digest(bytes), identity: identity(opened) });
  } catch (error) {
    if (error instanceof ImplementationLedgerError) throw error;
    fail('PATH_UNSAFE', `${label} cannot be read safely`);
  } finally {
    await handle?.close().catch(() => {});
  }
}

function parseRecord(read, label) {
  try {
    return parseCanonicalJson(read.bytes);
  } catch (error) {
    if (error?.code === 'SCHEMA_UNSUPPORTED') {
      fail('VERSION_UNSUPPORTED', `${label} uses an unsupported schema version`);
    }
    reconciliation('RECORD_CORRUPT', `${label} is not exact canonical protocol JSON`);
  }
}

async function readCanonicalFile(directory, name, label, options) {
  const read = await readFile(directory, name, label, options);
  const value = parseRecord(read, label);
  if (ordinaryObject(value) && Object.hasOwn(value, 'schemaVersion') &&
      value.schemaVersion !== IMPLEMENTATION_PROTOCOL_VERSION) {
    fail('VERSION_UNSUPPORTED', `${label} uses an unsupported schema version`);
  }
  return Object.freeze({ ...read, value });
}

function validateRunIdentity(manifest, capsule, expectedRunId) {
  validateVersionOne(manifest, 'run manifest');
  validateVersionOne(capsule, 'implementation capsule');
  validateControllerId(expectedRunId, 'run ID');
  if (manifest.runId !== expectedRunId) reconciliation('RUN_ID_CONFLICT', 'manifest runId differs from its directory');
  if (manifest.capsuleDigest !== canonicalDigest(capsule)) {
    reconciliation('CAPSULE_DIGEST_CONFLICT', 'manifest capsuleDigest does not bind capsule bytes');
  }
  if (!ordinaryObject(manifest.task) || manifest.task.id !== capsule.taskId ||
      manifest.task.taskRevision !== capsule.taskRevision ||
      manifest.task.recordVersion !== capsule.taskRecordVersion) {
    reconciliation('TASK_BINDING_CONFLICT', 'manifest and capsule task bindings differ');
  }
}

function validateRecordIdentity(kind, id, version, value, previousDigest) {
  validateVersionOne(value, `${kind} record`);
  const idField = RECORD_ID_FIELDS[kind];
  if (idField !== undefined && value[idField] !== id) {
    reconciliation('RECORD_ID_CONFLICT', `${kind} record ID differs from its path`);
  }
  const versionField = RECORD_VERSION_FIELDS[kind];
  if (versionField !== undefined && value[versionField] !== version) {
    reconciliation('RECORD_VERSION_CONFLICT', `${kind} record version differs from its path`);
  }
  if (version === 1) {
    if (Object.hasOwn(value, 'previousDigest') && value.previousDigest !== null) {
      reconciliation('RECORD_CHAIN_CONFLICT', `${kind} initial record has a previous digest`);
    }
  } else {
    if (!Object.hasOwn(value, 'previousDigest') || value.previousDigest !== previousDigest) {
      reconciliation('RECORD_CHAIN_CONFLICT', `${kind} record digest chain is broken`);
    }
  }
}

async function openLedgerRoot(ledger) {
  if (!LEDGERS.has(ledger)) fail('ARGUMENT_INVALID', 'a validated implementation ledger is required');
  const common = await openDirectory(ledger.gitCommonDirectory, 'Git common directory');
  if (!sameIdentity(await common.handle.stat(), ledger.commonIdentity)) {
    await closeDirectory(common);
    fail('PATH_UNSAFE', 'Git common directory identity changed');
  }
  const opened = [];
  try {
    let current = common;
    for (const [name, label] of [
      ['meta-framework', 'implementation metadata directory'],
      ['implementation', 'implementation ledger parent'],
      ['v1', 'implementation ledger v1 root'],
    ]) {
      const child = await openChildDirectory(current, name, label);
      opened.push(child);
      current = child;
    }
    if (!sameIdentity(await current.handle.stat(), ledger.rootIdentity)) {
      fail('PATH_UNSAFE', 'implementation ledger root identity changed');
    }
    return { common, opened, root: current };
  } catch (error) {
    for (const directory of opened.reverse()) await closeDirectory(directory);
    await closeDirectory(common);
    throw error;
  }
}

async function closeLedgerRoot(opened) {
  for (const directory of opened.opened.reverse()) await closeDirectory(directory);
  await closeDirectory(opened.common);
}

async function withLedgerRoot(ledger, operation) {
  const opened = await openLedgerRoot(ledger);
  try {
    return await operation(opened.root);
  } finally {
    await closeLedgerRoot(opened);
  }
}

async function withRunDirectory(ledger, runId, operation) {
  validateControllerId(runId, 'run ID');
  return withLedgerRoot(ledger, async (root) =>
    withChildDirectory(root, 'runs', 'implementation runs directory', {}, async (runs) =>
      withChildDirectory(runs, runId, 'implementation run directory', {
        missingCode: 'RUN_NOT_FOUND',
      }, operation)));
}

function assertLedgerWriteAuthority(ledger) {
  if (!LEDGERS.has(ledger)) fail('ARGUMENT_INVALID', 'a validated implementation ledger is required');
  if (!LEDGER_WRITE_AUTHORITY.has(ledger)) {
    fail('WRITE_CAPABILITY_REQUIRED', 'implementation ledger mutation requires an authorized write capability');
  }
}

async function runExists(runs, runId) {
  const info = await fs.lstat(anchored(runs, runId)).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    fail('PATH_UNSAFE', 'run destination cannot be inspected');
  });
  if (info === null) return false;
  if (info.isSymbolicLink() || !info.isDirectory()) fail('PATH_UNSAFE', 'run destination is unsafe');
  return true;
}

async function readRunIdentity(run, runId) {
  try {
    const [manifestRead, capsuleRead] = await Promise.all([
      readCanonicalFile(run, 'manifest.json', 'run manifest'),
      readCanonicalFile(run, 'capsule.json', 'implementation capsule'),
    ]);
    validateRunIdentity(manifestRead.value, capsuleRead.value, runId);
    return { manifestRead, capsuleRead };
  } catch (error) {
    if (error instanceof ImplementationLedgerError &&
        ['PATH_UNSAFE', 'VERSION_UNSUPPORTED'].includes(error.code)) throw error;
    if (error instanceof ImplementationLedgerError && error.reconciliationRequired) throw error;
    reconciliation('RUN_CORRUPT', 'run manifest or capsule is incomplete or corrupt');
  }
}

async function durableImmutablePublication(ledger, directory, name, bytes, label, lockCheck = null) {
  const existing = await fs.lstat(anchored(directory, name)).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    fail('PATH_UNSAFE', `${label} destination cannot be inspected`);
  });
  if (existing !== null) {
    const read = await readFile(directory, name, label);
    if (Buffer.compare(read.bytes, bytes) === 0) {
      return Object.freeze({ created: false, digest: read.digest });
    }
    reconciliation('DUPLICATE_CONFLICT', `${label} conflicts with an immutable publication`);
  }

  const stageName = `.publish-${randomUUID()}.tmp`;
  await writeExclusiveFile(directory, stageName, bytes, `${label} stage`);
  let published = false;
  try {
    await publicationCut(ledger, 'after-stage-sync', { label, name });
    if (lockCheck !== null) await lockCheck();
    if (lockCheck !== null) {
      // Supervisor-owned immutable records have an exact token/epoch single-writer
      // fence, so their flushed temporary file follows the protocol's rename boundary.
      // Node has no rename-no-replace flag; repeat the immutable collision check as
      // close to rename as its API permits.
      const appeared = await fs.lstat(anchored(directory, name)).catch((error) => {
        if (error?.code === 'ENOENT') return null;
        fail('PATH_UNSAFE', `${label} destination cannot be inspected before rename`);
      });
      if (appeared !== null) {
        const read = await readFile(directory, name, label);
        if (Buffer.compare(read.bytes, bytes) === 0) {
          return Object.freeze({ created: false, digest: read.digest });
        }
        reconciliation('DUPLICATE_CONFLICT', `${label} conflicts with a competing publication`);
      }
      await fs.rename(anchored(directory, stageName), anchored(directory, name));
      published = true;
    } else {
      // Control requests are the sole multi-writer files. link(2) is the available
      // dependency-free Node primitive that publishes a fully-flushed file atomically
      // without replacing a competing request with the same identity.
      await fs.link(anchored(directory, stageName), anchored(directory, name));
      published = true;
      await fs.unlink(anchored(directory, stageName));
    }
    await publicationCut(ledger, 'after-publication', { label, name });
    await syncHandle(directory.handle);
    await publicationCut(ledger, 'after-directory-sync', { label, name });
    const read = await readFile(directory, name, label);
    if (Buffer.compare(read.bytes, bytes) !== 0) {
      reconciliation('PUBLICATION_CONFLICT', `${label} changed during publication`);
    }
    return Object.freeze({ created: true, digest: read.digest });
  } catch (error) {
    if (!published && error?.code === 'EEXIST') {
      const read = await readFile(directory, name, label);
      if (Buffer.compare(read.bytes, bytes) === 0) {
        return Object.freeze({ created: false, digest: read.digest });
      }
      reconciliation('DUPLICATE_CONFLICT', `${label} conflicts with a competing publication`);
    }
    throw error;
  } finally {
    if (!published) await fs.unlink(anchored(directory, stageName)).catch(() => {});
  }
}

async function currentLock(ledger, runId) {
  return inspectRunLock(ledger, runId);
}

async function assertLockFence(ledger, runId, lockToken, epoch) {
  if (typeof lockToken !== 'string' || !UUID.test(lockToken)) fail('LOCK_STALE', 'run lock token is invalid');
  safeInteger(epoch, 'run lock epoch', { minimum: 1 });
  const inspected = await currentLock(ledger, runId);
  if (!inspected.held || inspected.state !== 'owned' || inspected.owner.token !== lockToken ||
      inspected.owner.epoch !== epoch) {
    fail('LOCK_STALE', 'run lock token or epoch is no longer current');
  }
  return inspected.owner;
}

function publicationFence(ledger, runId, options) {
  if (!ordinaryObject(options)) fail('LOCK_REQUIRED', 'publication requires a held run lock');
  return () => assertLockFence(ledger, runId, options.lockToken, options.epoch);
}

async function openRecordVersionDirectory(run, kind, id, { create = false } = {}) {
  return withChildDirectory(run, 'records', 'run records directory', {}, async (records) =>
    withChildDirectory(records, kind, `${kind} record directory`, { create }, async (kinds) =>
      openChildDirectory(kinds, id, `${kind} record identity directory`, { create })));
}

async function listVersionFiles(directory, label) {
  const entries = await listDirectory(directory, IMPLEMENTATION_LEDGER_LIMITS.directoryEntries, label);
  const versions = [];
  for (const entry of entries) {
    const match = VERSION_FILE.exec(entry.name);
    if (match === null || !entry.isFile() || entry.isSymbolicLink()) {
      reconciliation('LAYOUT_INVALID', `${label} contains an unsupported entry`);
    }
    const version = Number(match[1]);
    safeInteger(version, `${label} version`, { minimum: 1 });
    versions.push(version);
  }
  versions.sort((left, right) => left - right);
  for (let index = 0; index < versions.length; index += 1) {
    if (versions[index] !== index + 1) reconciliation('RECORD_VERSION_GAP', `${label} has a version gap`);
  }
  return versions;
}

function validateEvent(value, runId) {
  validateVersionOne(value, 'event');
  validateControllerId(value.eventId, 'event.eventId');
  safeInteger(value.sequence, 'event.sequence', {
    minimum: 1,
    maximum: IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun,
  });
  validateBinding(value.binding, 'event.binding');
  if (value.binding.runId !== runId) reconciliation('RUN_ID_CONFLICT', 'event binding names another run');
  if (typeof value.dedupeKey !== 'string' || value.dedupeKey.length < 1 ||
      Buffer.byteLength(value.dedupeKey, 'utf8') > IMPLEMENTATION_PROTOCOL_LIMITS.proseBytes) {
    fail('RECORD_INVALID', 'event.dedupeKey is invalid');
  }
  validateRef(value.subject, 'event.subject');
  validateRef(value.payload, 'event.payload');
  return value;
}

function eventSemanticDigest(event) {
  return canonicalDigest({
    binding: event.binding,
    kind: event.kind,
    subject: event.subject,
    causationId: event.causationId,
    correlationId: event.correlationId,
    producer: event.producer,
    payload: event.payload,
  });
}

async function readAllEventsFromRun(run, runId) {
  return withChildDirectory(run, 'events', 'run events directory', {}, async (eventsDirectory) => {
    const entries = await listDirectory(eventsDirectory,
      IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun + 1, 'run events directory');
    const sequences = [];
    for (const entry of entries) {
      const match = EVENT_FILE.exec(entry.name);
      if (match === null || !entry.isFile() || entry.isSymbolicLink()) {
        reconciliation('LAYOUT_INVALID', 'run events directory contains an unsupported entry');
      }
      const sequence = Number(match[1]);
      safeInteger(sequence, 'event file sequence', { minimum: 1 });
      sequences.push(sequence);
    }
    sequences.sort((left, right) => left - right);
    if (sequences.length > IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun) {
      reconciliation('EVENT_LIMIT', 'run event limit was exceeded');
    }
    const result = [];
    const dedupe = new Map();
    for (let index = 0; index < sequences.length; index += 1) {
      const sequence = sequences[index];
      if (sequence !== index + 1) reconciliation('EVENT_GAP', 'event sequence is not contiguous');
      const read = await readCanonicalFile(eventsDirectory, `${sequence}.json`, `event ${sequence}`);
      validateEvent(read.value, runId);
      if (read.value.sequence !== sequence) reconciliation('EVENT_SEQUENCE_CONFLICT', 'event sequence differs from its path');
      const semantic = eventSemanticDigest(read.value);
      const prior = dedupe.get(read.value.dedupeKey);
      if (prior !== undefined && prior.semantic !== semantic) {
        reconciliation('EVENT_DEDUPE_CONFLICT', 'event dedupe key has conflicting evidence');
      }
      if (prior === undefined) dedupe.set(read.value.dedupeKey, { semantic, sequence });
      result.push(Object.freeze({ sequence, value: read.value, digest: read.digest }));
    }
    return result;
  });
}

function validateControlRequest(value, runId) {
  validateVersionOne(value, 'control request');
  validateControllerId(value.requestId, 'control request.requestId');
  if (value.runId !== runId) reconciliation('RUN_ID_CONFLICT', 'control request names another run');
  safeInteger(value.expectedControlGeneration, 'control request.expectedControlGeneration');
  if (typeof value.kind !== 'string') fail('RECORD_INVALID', 'control request.kind is invalid');
  validateControllerId(value.kind, 'control request.kind');
  if (Object.hasOwn(value, 'requestedAt')) validateTimestamp(value.requestedAt, 'control request.requestedAt');
  return value;
}

async function readControlsFromRun(run, runId) {
  return withChildDirectory(run, 'control', 'run control directory', {}, async (controlDirectory) => {
    const entries = await listDirectory(controlDirectory,
      IMPLEMENTATION_LEDGER_LIMITS.controlRequests + 1, 'run control directory');
    if (entries.length > IMPLEMENTATION_LEDGER_LIMITS.controlRequests) {
      reconciliation('CONTROL_LIMIT', 'run control request limit was exceeded');
    }
    const result = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      if (!entry.name.endsWith('.json') || !entry.isFile() || entry.isSymbolicLink()) {
        reconciliation('LAYOUT_INVALID', 'run control directory contains an unsupported entry');
      }
      const id = entry.name.slice(0, -'.json'.length);
      validateControllerId(id, 'control request path ID');
      const read = await readCanonicalFile(controlDirectory, entry.name, `control request ${id}`);
      validateControlRequest(read.value, runId);
      if (read.value.requestId !== id) reconciliation('RECORD_ID_CONFLICT', 'control request ID differs from its path');
      result.push(Object.freeze({ id, value: read.value, digest: read.digest }));
    }
    return result;
  });
}

async function replayRecordsFromRun(run) {
  return withChildDirectory(run, 'records', 'run records directory', {}, async (recordsDirectory) => {
    const kindEntries = await listDirectory(recordsDirectory, RECORD_KINDS.size, 'run records directory');
    const records = [];
    for (const kindEntry of kindEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      if (!kindEntry.isDirectory() || kindEntry.isSymbolicLink() || !RECORD_KINDS.has(kindEntry.name)) {
        reconciliation('LAYOUT_INVALID', 'run records directory contains an unsupported kind');
      }
      await withChildDirectory(recordsDirectory, kindEntry.name, `${kindEntry.name} record directory`, {}, async (kindDirectory) => {
        const idEntries = await listDirectory(kindDirectory,
          IMPLEMENTATION_LEDGER_LIMITS.recordFiles + 1, `${kindEntry.name} record directory`);
        for (const idEntry of idEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
          if (!idEntry.isDirectory() || idEntry.isSymbolicLink()) {
            reconciliation('LAYOUT_INVALID', `${kindEntry.name} record directory contains an unsupported entry`);
          }
          validateControllerId(idEntry.name, `${kindEntry.name} record ID`);
          await withChildDirectory(kindDirectory, idEntry.name, `${kindEntry.name} record identity directory`, {}, async (versions) => {
            const numbers = await listVersionFiles(versions, `${kindEntry.name}/${idEntry.name}`);
            let previousDigest = null;
            for (const version of numbers) {
              if (records.length >= IMPLEMENTATION_LEDGER_LIMITS.recordFiles) {
                reconciliation('RECORD_LIMIT', 'run record count exceeds its bound');
              }
              const read = await readCanonicalFile(versions, `${version}.json`,
                `${kindEntry.name}/${idEntry.name}/${version}`);
              validateRecordIdentity(kindEntry.name, idEntry.name, version, read.value, previousDigest);
              records.push(Object.freeze({
                kind: kindEntry.name,
                id: idEntry.name,
                version,
                digest: read.digest,
                value: read.value,
              }));
              previousDigest = read.digest;
            }
          });
        }
      });
    }
    return records;
  });
}

function validateManifestInput(manifest, capsule) {
  validateVersionOne(manifest, 'run manifest');
  validateVersionOne(capsule, 'implementation capsule');
  validateControllerId(manifest.runId, 'run manifest.runId');
  validateRunIdentity(manifest, capsule, manifest.runId);
  return {
    manifestBytes: canonicalBytes(manifest),
    capsuleBytes: canonicalBytes(capsule),
  };
}

async function validateLedgerPlatform() {
  if (process.platform !== 'linux') {
    fail('PLATFORM_UNSUPPORTED', 'implementation ledger descriptor anchoring requires Linux');
  }
  const proc = await fs.lstat('/proc/self/fd').catch(() => null);
  if (proc === null || !proc.isDirectory() || proc.isSymbolicLink()) {
    fail('PLATFORM_UNSUPPORTED', 'Linux descriptor paths are unavailable');
  }
}

async function inspectGitCommonDirectory(gitCommonDirectory) {
  await validateLedgerPlatform();
  if (typeof gitCommonDirectory !== 'string' || !path.isAbsolute(gitCommonDirectory)) {
    fail('PATH_UNSAFE', 'Git common directory must be an absolute validated path');
  }
  const common = await openDirectory(gitCommonDirectory, 'Git common directory');
  try {
    return {
      lexical: common.lexical,
      identity: identity(await common.handle.stat()),
    };
  } finally {
    await closeDirectory(common);
  }
}

function assertCapabilityScope(writeCapability, common) {
  if ((typeof writeCapability !== 'object' && typeof writeCapability !== 'function') ||
      writeCapability === null || !LEDGER_WRITE_CAPABILITIES.has(writeCapability)) {
    fail('WRITE_CAPABILITY_REQUIRED', 'a recognized opaque ledger write capability is required');
  }
  const scope = LEDGER_WRITE_SCOPES.get(writeCapability);
  if (scope.lexical !== common.lexical || scope.identity.dev !== common.identity.dev ||
      scope.identity.ino !== common.identity.ino) {
    fail('WRITE_CAPABILITY_SCOPE', 'ledger write capability belongs to another Git common directory');
  }
}

async function loadLedgerDirectories(gitCommonDirectory, { create }) {
  await validateLedgerPlatform();
  const common = await openDirectory(gitCommonDirectory, 'Git common directory');
  const opened = [];
  try {
    let current = common;
    for (const [name, label] of [
      ['meta-framework', 'implementation metadata directory'],
      ['implementation', 'implementation ledger parent'],
      ['v1', 'implementation ledger v1 root'],
    ]) {
      const child = await openChildDirectory(current, name, label, { create });
      opened.push(child);
      current = child;
    }
    for (const name of ['runs', 'locks']) {
      const child = await openChildDirectory(current, name, `implementation ${name} directory`, { create });
      await closeDirectory(child);
    }
    return {
      commonIdentity: identity(await common.handle.stat()),
      rootIdentity: identity(await current.handle.stat()),
      root: current.lexical,
    };
  } finally {
    for (const directory of opened.reverse()) await closeDirectory(directory);
    await closeDirectory(common);
  }
}

export async function authorizeImplementationLedgerWrite({
  gitCommonDirectory,
  receipt = null,
  current = null,
  now = null,
} = {}) {
  const authorization = authorizeImplementationOperation({
    operationKind: 'ledger_write',
    receipt,
    current,
    now,
  });
  if (authorization.authorized !== true) {
    fail('ACTIVATION_DENIED', 'implementation ledger write activation was denied', {
      activationCode: authorization.code,
    });
  }
  const common = await inspectGitCommonDirectory(gitCommonDirectory);
  const capability = Object.freeze(Object.create(null));
  LEDGER_WRITE_CAPABILITIES.add(capability);
  LEDGER_WRITE_SCOPES.set(capability, Object.freeze({
    lexical: common.lexical,
    identity: common.identity,
  }));
  return capability;
}

export async function openImplementationLedger(gitCommonDirectory, {
  hooks = null,
  create = false,
  writeCapability = null,
} = {}) {
  if (hooks !== null && !ordinaryObject(hooks)) fail('ARGUMENT_INVALID', 'ledger hooks must be an object');
  if (typeof create !== 'boolean') fail('ARGUMENT_INVALID', 'ledger create option must be a boolean');
  if (typeof gitCommonDirectory !== 'string' || !path.isAbsolute(gitCommonDirectory)) {
    fail('PATH_UNSAFE', 'Git common directory must be an absolute validated path');
  }
  const resolvedCommon = path.resolve(gitCommonDirectory);
  const common = await inspectGitCommonDirectory(resolvedCommon);
  const writeAuthorized = writeCapability !== null;
  if (writeAuthorized) assertCapabilityScope(writeCapability, common);
  if (create && !writeAuthorized) {
    fail('WRITE_CAPABILITY_REQUIRED', 'creating an implementation ledger requires an authorized write capability');
  }
  const created = await loadLedgerDirectories(resolvedCommon, { create });
  const ledger = {
    gitCommonDirectory: resolvedCommon,
    root: created.root,
    commonIdentity: created.commonIdentity,
    rootIdentity: created.rootIdentity,
    hooks,
  };
  LEDGERS.add(ledger);
  if (writeAuthorized) LEDGER_WRITE_AUTHORITY.add(ledger);
  return Object.freeze(ledger);
}

export async function initializeRun(ledger, { manifest, capsule }) {
  assertLedgerWriteAuthority(ledger);
  const { manifestBytes, capsuleBytes } = validateManifestInput(manifest, capsule);
  const runId = manifest.runId;
  return withLedgerRoot(ledger, async (root) =>
    withChildDirectory(root, 'runs', 'implementation runs directory', {}, async (runs) => {
      if (await runExists(runs, runId)) {
        return withChildDirectory(runs, runId, 'implementation run directory', {}, async (run) => {
          const existing = await readRunIdentity(run, runId);
          if (Buffer.compare(existing.manifestRead.bytes, manifestBytes) !== 0 ||
              Buffer.compare(existing.capsuleRead.bytes, capsuleBytes) !== 0) {
            reconciliation('RUN_CONFLICT', 'run ID already binds another manifest or capsule');
          }
          return Object.freeze({ created: false, runId, manifestDigest: existing.manifestRead.digest,
            capsuleDigest: existing.capsuleRead.digest });
        });
      }

      const stageName = `.initialize-${runId}-${randomUUID()}`;
      await fs.mkdir(anchored(runs, stageName), { mode: 0o700 }).catch(() =>
        fail('PUBLICATION_FAILED', 'run initialization stage cannot be created'));
      await syncHandle(runs.handle);
      const stage = await openChildDirectory(runs, stageName, 'run initialization stage');
      let published = false;
      try {
        for (const name of INTERNAL_RUN_DIRECTORIES) {
          const child = await openChildDirectory(stage, name, `run ${name} directory`, { create: true });
          await syncHandle(child.handle);
          await closeDirectory(child);
        }
        await writeExclusiveFile(stage, 'manifest.json', manifestBytes, 'run manifest');
        await writeExclusiveFile(stage, 'capsule.json', capsuleBytes, 'implementation capsule');
        await syncHandle(stage.handle);
        await publicationCut(ledger, 'after-stage-sync', { label: 'run initialization', name: runId });
        if (await runExists(runs, runId)) {
          return withChildDirectory(runs, runId, 'implementation run directory', {}, async (run) => {
            const existing = await readRunIdentity(run, runId);
            if (Buffer.compare(existing.manifestRead.bytes, manifestBytes) === 0 &&
                Buffer.compare(existing.capsuleRead.bytes, capsuleBytes) === 0) {
              return Object.freeze({ created: false, runId, manifestDigest: existing.manifestRead.digest,
                capsuleDigest: existing.capsuleRead.digest });
            }
            reconciliation('RUN_CONFLICT', 'run ID gained a conflicting initialization');
          });
        }
        await fs.rename(anchored(runs, stageName), anchored(runs, runId));
        published = true;
        await publicationCut(ledger, 'after-publication', { label: 'run initialization', name: runId });
        await syncHandle(runs.handle);
        await publicationCut(ledger, 'after-directory-sync', { label: 'run initialization', name: runId });
        return Object.freeze({ created: true, runId, manifestDigest: sha256Digest(manifestBytes),
          capsuleDigest: sha256Digest(capsuleBytes) });
      } catch (error) {
        if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
          return withChildDirectory(runs, runId, 'implementation run directory', {}, async (run) => {
            const existing = await readRunIdentity(run, runId);
            if (Buffer.compare(existing.manifestRead.bytes, manifestBytes) === 0 &&
                Buffer.compare(existing.capsuleRead.bytes, capsuleBytes) === 0) {
              return Object.freeze({ created: false, runId, manifestDigest: existing.manifestRead.digest,
                capsuleDigest: existing.capsuleRead.digest });
            }
            reconciliation('RUN_CONFLICT', 'run ID has competing initialization evidence');
          });
        }
        throw error;
      } finally {
        await closeDirectory(stage);
        if (!published) {
          const staged = await fs.lstat(anchored(runs, stageName)).catch(() => null);
          if (staged?.isDirectory() && !staged.isSymbolicLink()) {
            await fs.rm(anchored(runs, stageName), { recursive: true }).catch(() => {});
            await syncHandle(runs.handle).catch(() => {});
          }
        }
      }
    }));
}

export async function publishRecord(ledger, runId, {
  kind,
  id,
  version,
  value,
}, lock) {
  assertLedgerWriteAuthority(ledger);
  if (!RECORD_KINDS.has(kind)) fail('ARGUMENT_INVALID', 'record kind is unsupported');
  validateControllerId(id, 'record ID');
  safeInteger(version, 'record version', { minimum: 1 });
  validateVersionOne(value, `${kind} record`);
  const idField = RECORD_ID_FIELDS[kind];
  if (idField !== undefined && value[idField] !== id) {
    reconciliation('RECORD_ID_CONFLICT', `${kind} record ID differs from its path`);
  }
  const versionField = RECORD_VERSION_FIELDS[kind];
  if (versionField !== undefined && value[versionField] !== version) {
    reconciliation('RECORD_VERSION_CONFLICT', `${kind} record version differs from its path`);
  }
  if (version === 1 && Object.hasOwn(value, 'previousDigest') && value.previousDigest !== null) {
    reconciliation('RECORD_CHAIN_CONFLICT', `${kind} initial record has a previous digest`);
  }
  const bytes = canonicalBytes(value);
  const fence = publicationFence(ledger, runId, lock);
  await fence();
  return withRunDirectory(ledger, runId, async (run) => {
    await readRunIdentity(run, runId);
    const directory = await openRecordVersionDirectory(run, kind, id, { create: true });
    try {
      const versions = await listVersionFiles(directory, `${kind}/${id}`);
      if (versions.includes(version)) {
        const published = await durableImmutablePublication(ledger, directory, `${version}.json`, bytes,
          `${kind} record ${id} version ${version}`, fence);
        return Object.freeze({ ...published, ref: { kind, id, digest: published.digest }, version });
      }
      if (version !== versions.length + 1) reconciliation('RECORD_VERSION_GAP', 'record publication would create a version gap');
      let previousDigest = null;
      if (version > 1) {
        const previous = await readCanonicalFile(directory, `${version - 1}.json`,
          `${kind} record ${id} version ${version - 1}`);
        previousDigest = previous.digest;
      }
      validateRecordIdentity(kind, id, version, value, previousDigest);
      const published = await durableImmutablePublication(ledger, directory, `${version}.json`, bytes,
        `${kind} record ${id} version ${version}`, fence);
      return Object.freeze({ ...published, ref: { kind, id, digest: published.digest }, version });
    } finally {
      await closeDirectory(directory);
    }
  });
}

export async function publishEvent(ledger, runId, event, lock) {
  assertLedgerWriteAuthority(ledger);
  validateEvent(event, runId);
  const bytes = canonicalBytes(event);
  const fence = publicationFence(ledger, runId, lock);
  await fence();
  return withRunDirectory(ledger, runId, async (run) => {
    await readRunIdentity(run, runId);
    const priorEvents = await readAllEventsFromRun(run, runId);
    const exactSequence = priorEvents.find(({ sequence }) => sequence === event.sequence);
    if (exactSequence !== undefined) {
      if (Buffer.compare(canonicalBytes(exactSequence.value), bytes) !== 0) {
        reconciliation('EVENT_SEQUENCE_CONFLICT', 'event sequence has conflicting evidence');
      }
      return Object.freeze({ created: false, sequence: event.sequence,
        ref: { kind: 'event', id: event.eventId, digest: exactSequence.digest } });
    }
    const priorDedupe = priorEvents.find(({ value }) => value.dedupeKey === event.dedupeKey);
    if (priorDedupe !== undefined) {
      if (eventSemanticDigest(priorDedupe.value) !== eventSemanticDigest(event)) {
        reconciliation('EVENT_DEDUPE_CONFLICT', 'event dedupe key has conflicting evidence');
      }
      return Object.freeze({ created: false, sequence: priorDedupe.sequence,
        ref: { kind: 'event', id: priorDedupe.value.eventId, digest: priorDedupe.digest } });
    }
    if (event.sequence !== priorEvents.length + 1) reconciliation('EVENT_GAP', 'event publication would create a sequence gap');
    return withChildDirectory(run, 'events', 'run events directory', {}, async (eventsDirectory) => {
      const published = await durableImmutablePublication(ledger, eventsDirectory,
        `${event.sequence}.json`, bytes, `event ${event.sequence}`, fence);
      return Object.freeze({ created: published.created, sequence: event.sequence,
        ref: { kind: 'event', id: event.eventId, digest: published.digest } });
    });
  });
}

export async function publishControlRequest(ledger, runId, request) {
  assertLedgerWriteAuthority(ledger);
  validateControlRequest(request, runId);
  const bytes = canonicalBytes(request);
  return withRunDirectory(ledger, runId, async (run) => {
    await readRunIdentity(run, runId);
    return withChildDirectory(run, 'control', 'run control directory', {}, async (controlDirectory) => {
      const entries = await listDirectory(controlDirectory,
        IMPLEMENTATION_LEDGER_LIMITS.controlRequests + 1, 'run control directory');
      if (entries.length >= IMPLEMENTATION_LEDGER_LIMITS.controlRequests &&
          !entries.some(({ name }) => name === `${request.requestId}.json`)) {
        reconciliation('CONTROL_LIMIT', 'run control request limit was reached');
      }
      const published = await durableImmutablePublication(ledger, controlDirectory,
        `${request.requestId}.json`, bytes, `control request ${request.requestId}`);
      return Object.freeze({ ...published, requestId: request.requestId });
    });
  });
}

function validateSnapshot(snapshot, runId) {
  validateVersionOne(snapshot, 'run snapshot');
  if (snapshot.runId !== runId) reconciliation('RUN_ID_CONFLICT', 'snapshot names another run');
  safeInteger(snapshot.revision, 'snapshot revision', { minimum: 1 });
  safeInteger(snapshot.epoch, 'snapshot epoch');
  safeInteger(snapshot.controlGeneration, 'snapshot control generation');
  if (typeof snapshot.phase !== 'string') fail('RECORD_INVALID', 'snapshot phase is invalid');
  return snapshot;
}

export async function publishSnapshot(ledger, runId, snapshot, lock) {
  assertLedgerWriteAuthority(ledger);
  validateSnapshot(snapshot, runId);
  const bytes = canonicalBytes(snapshot);
  const fence = publicationFence(ledger, runId, lock);
  await fence();
  return withRunDirectory(ledger, runId, async (run) => {
    await readRunIdentity(run, runId);
    const existingInfo = await fs.lstat(anchored(run, 'snapshot.json')).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      fail('PATH_UNSAFE', 'snapshot destination cannot be inspected');
    });
    let existing = null;
    if (existingInfo !== null) {
      existing = await readCanonicalFile(run, 'snapshot.json', 'run snapshot');
      validateSnapshot(existing.value, runId);
      if (Buffer.compare(existing.bytes, bytes) === 0) {
        return Object.freeze({ created: false, digest: existing.digest, revision: snapshot.revision });
      }
      if (snapshot.revision !== existing.value.revision + 1 || snapshot.previousDigest !== existing.digest) {
        fail('SNAPSHOT_STALE', 'snapshot revision or previous digest is stale');
      }
    } else if (snapshot.revision !== 1 || snapshot.previousDigest !== null) {
      fail('SNAPSHOT_STALE', 'initial snapshot must be revision 1 with no previous digest');
    }

    const stageName = `.snapshot-${randomUUID()}.tmp`;
    await writeExclusiveFile(run, stageName, bytes, 'snapshot stage');
    let renamed = false;
    try {
      await publicationCut(ledger, 'after-stage-sync', { label: 'run snapshot', name: 'snapshot.json' });
      await fence();
      if (existingInfo !== null) await readFile(run, 'snapshot.json', 'run snapshot');
      await fs.rename(anchored(run, stageName), anchored(run, 'snapshot.json'));
      renamed = true;
      await publicationCut(ledger, 'after-publication', { label: 'run snapshot', name: 'snapshot.json' });
      await syncHandle(run.handle);
      await publicationCut(ledger, 'after-directory-sync', { label: 'run snapshot', name: 'snapshot.json' });
      const published = await readFile(run, 'snapshot.json', 'run snapshot');
      if (Buffer.compare(published.bytes, bytes) !== 0) reconciliation('PUBLICATION_CONFLICT', 'snapshot changed during publication');
      return Object.freeze({ created: true, digest: published.digest, revision: snapshot.revision });
    } finally {
      if (!renamed) await fs.unlink(anchored(run, stageName)).catch(() => {});
    }
  });
}

export async function replayRun(ledger, runId) {
  return withRunDirectory(ledger, runId, async (run) => {
    const entries = await listDirectory(run, INTERNAL_RUN_ENTRIES.size, 'implementation run directory');
    for (const entry of entries) {
      if (!INTERNAL_RUN_ENTRIES.has(entry.name)) {
        reconciliation('LAYOUT_INVALID', 'implementation run contains an unsupported entry');
      }
    }
    for (const required of ['manifest.json', 'capsule.json', 'records', 'events', 'control', 'spool', '.staging']) {
      if (!entries.some(({ name }) => name === required)) {
        reconciliation('LAYOUT_INVALID', `implementation run is missing ${required}`);
      }
    }
    const { manifestRead, capsuleRead } = await readRunIdentity(run, runId);
    const [records, events, controls] = await Promise.all([
      replayRecordsFromRun(run),
      readAllEventsFromRun(run, runId),
      readControlsFromRun(run, runId),
    ]);
    return Object.freeze({
      runId,
      manifest: structuredClone(manifestRead.value),
      capsule: structuredClone(capsuleRead.value),
      manifestDigest: manifestRead.digest,
      capsuleDigest: capsuleRead.digest,
      records: Object.freeze(records.map((record) => Object.freeze(structuredClone(record)))),
      events: Object.freeze(events.map((event) => Object.freeze(structuredClone(event)))),
      controls: Object.freeze(controls.map((control) => Object.freeze(structuredClone(control)))),
    });
  });
}

export async function rebuildSnapshot(ledger, runId, reducer) {
  if (typeof reducer !== 'function') fail('ARGUMENT_INVALID', 'snapshot rebuild requires a reducer function');
  const replay = await replayRun(ledger, runId);
  const snapshot = await reducer(replay);
  validateSnapshot(snapshot, runId);
  return Object.freeze(structuredClone(snapshot));
}

export async function readRunStatus(ledger, runId) {
  return withRunDirectory(ledger, runId, async (run) => {
    const { manifestRead, capsuleRead } = await readRunIdentity(run, runId);
    const snapshotInfo = await fs.lstat(anchored(run, 'snapshot.json')).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      fail('PATH_UNSAFE', 'run snapshot cannot be inspected');
    });
    let snapshot = null;
    let state = 'no_snapshot';
    let issue = null;
    if (snapshotInfo !== null) {
      try {
        const read = await readCanonicalFile(run, 'snapshot.json', 'run snapshot');
        validateSnapshot(read.value, runId);
        snapshot = structuredClone(read.value);
        state = TERMINAL_PHASES.has(snapshot.phase) ? 'terminal' : 'nonterminal';
      } catch (error) {
        if (error instanceof ImplementationLedgerError && error.code === 'VERSION_UNSUPPORTED') throw error;
        if (error instanceof ImplementationLedgerError && error.code === 'PATH_UNSAFE') throw error;
        state = 'reconciliation_required';
        issue = Object.freeze({ code: error?.code ?? 'RECORD_CORRUPT', message: error?.message ?? 'snapshot is corrupt' });
      }
    }
    const lock = await inspectRunLock(ledger, runId);
    return Object.freeze({
      runId,
      state,
      manifest: structuredClone(manifestRead.value),
      capsuleDigest: capsuleRead.digest,
      snapshot,
      issue,
      lock,
    });
  });
}

export async function readEvents(ledger, runId, {
  afterSequence = 0,
  limit = IMPLEMENTATION_LEDGER_LIMITS.eventReadLimit,
} = {}) {
  safeInteger(afterSequence, 'afterSequence');
  safeInteger(limit, 'event read limit', { minimum: 1, maximum: IMPLEMENTATION_LEDGER_LIMITS.eventReadLimit });
  return withRunDirectory(ledger, runId, async (run) => {
    await readRunIdentity(run, runId);
    const all = await readAllEventsFromRun(run, runId);
    const selected = all.filter(({ sequence }) => sequence > afterSequence).slice(0, limit);
    return Object.freeze({
      runId,
      afterSequence,
      cursor: all.length,
      events: Object.freeze(selected.map(({ value }) => Object.freeze(structuredClone(value)))),
      hasMore: selected.length > 0 && selected.at(-1).sequence < all.length,
    });
  });
}

function validateLockOwner(value, runId) {
  validateVersionOne(value, 'run lock owner');
  const keys = Object.keys(value).sort();
  const expected = ['acquiredAt', 'epoch', 'host', 'pid', 'runId', 'schemaVersion', 'token'].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail('LOCK_OWNERSHIP', 'run lock owner has unknown or missing fields');
  }
  if (value.runId !== runId) fail('LOCK_OWNERSHIP', 'run lock owner names another run');
  if (typeof value.token !== 'string' || !UUID.test(value.token)) fail('LOCK_OWNERSHIP', 'run lock token is invalid');
  safeInteger(value.epoch, 'run lock epoch', { minimum: 1 });
  safeInteger(value.pid, 'run lock owner PID', { minimum: 1 });
  if (typeof value.host !== 'string' || value.host.length < 1 || Buffer.byteLength(value.host, 'utf8') > 256) {
    fail('LOCK_OWNERSHIP', 'run lock owner host is invalid');
  }
  validateTimestamp(value.acquiredAt, 'run lock acquiredAt');
  return value;
}

async function withLocksDirectory(ledger, operation) {
  return withLedgerRoot(ledger, (root) =>
    withChildDirectory(root, 'locks', 'implementation locks directory', {}, operation));
}

async function inspectLockInDirectory(locks, runId) {
  const name = `${runId}.lock`;
  const info = await fs.lstat(anchored(locks, name)).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    fail('LOCK_OWNERSHIP', 'run lock cannot be inspected');
  });
  if (info === null) return Object.freeze({ held: false, state: 'absent', owner: null, recoveryToken: null });
  if (info.isSymbolicLink() || !info.isDirectory()) fail('LOCK_OWNERSHIP', 'run lock path is unsafe');
  const lockDirectory = await openChildDirectory(locks, name, 'run lock directory');
  try {
    const entries = await listDirectory(lockDirectory, 2, 'run lock directory');
    if (entries.length === 0) {
      return Object.freeze({ held: true, state: 'incomplete', owner: null, recoveryToken: 'incomplete' });
    }
    if (entries.length !== 1 || entries[0].name !== 'owner.json' || !entries[0].isFile()) {
      return Object.freeze({ held: true, state: 'incomplete', owner: null, recoveryToken: 'incomplete' });
    }
    let read;
    try {
      read = await readCanonicalFile(lockDirectory, 'owner.json', 'run lock owner', {
        maxBytes: IMPLEMENTATION_LEDGER_LIMITS.lockBytes,
      });
    } catch (error) {
      if (error instanceof ImplementationLedgerError && error.code === 'VERSION_UNSUPPORTED') {
        return Object.freeze({ held: true, state: 'unsupported', owner: null, recoveryToken: null });
      }
      return Object.freeze({ held: true, state: 'incomplete', owner: null, recoveryToken: 'incomplete' });
    }
    try {
      validateLockOwner(read.value, runId);
    } catch (error) {
      if (error instanceof ImplementationLedgerError && error.code === 'VERSION_UNSUPPORTED') {
        return Object.freeze({ held: true, state: 'unsupported', owner: null, recoveryToken: null });
      }
      return Object.freeze({ held: true, state: 'incomplete', owner: null, recoveryToken: 'incomplete' });
    }
    return Object.freeze({ held: true, state: 'owned', owner: Object.freeze(structuredClone(read.value)),
      recoveryToken: read.value.token });
  } finally {
    await closeDirectory(lockDirectory);
  }
}

export async function inspectRunLock(ledger, runId) {
  validateControllerId(runId, 'run ID');
  return withLocksDirectory(ledger, (locks) => inspectLockInDirectory(locks, runId));
}

async function removeQuarantinedLock(locks, quarantineName, runId, expectedToken, expectedEpoch = null) {
  const quarantine = await openChildDirectory(locks, quarantineName, 'quarantined run lock');
  try {
    const inspected = await (async () => {
      const entries = await listDirectory(quarantine, 2, 'quarantined run lock');
      if (expectedToken === 'incomplete') {
        if (entries.length === 0) return { state: 'incomplete' };
        if (entries.length !== 1 || entries[0].name !== 'owner.json') {
          fail('LOCK_RECOVERY_STALE', 'incomplete run lock contents changed');
        }
        try {
          const read = await readCanonicalFile(quarantine, 'owner.json', 'quarantined run lock owner', {
            maxBytes: IMPLEMENTATION_LEDGER_LIMITS.lockBytes,
          });
          validateLockOwner(read.value, runId);
          fail('LOCK_RECOVERY_STALE', 'incomplete run lock became a valid owned lock');
        } catch (error) {
          if (error instanceof ImplementationLedgerError &&
              ['LOCK_RECOVERY_STALE', 'VERSION_UNSUPPORTED'].includes(error.code)) throw error;
          return { state: 'incomplete' };
        }
      }
      if (entries.length !== 1 || entries[0].name !== 'owner.json') {
        fail('LOCK_RECOVERY_STALE', 'run lock contents changed before removal');
      }
      const read = await readCanonicalFile(quarantine, 'owner.json', 'quarantined run lock owner', {
        maxBytes: IMPLEMENTATION_LEDGER_LIMITS.lockBytes,
      });
      validateLockOwner(read.value, runId);
      if (read.value.token !== expectedToken || (expectedEpoch !== null && read.value.epoch !== expectedEpoch)) {
        fail('LOCK_RECOVERY_STALE', 'run lock identity changed before removal');
      }
      return { state: 'owned', owner: read.value };
    })();
    const owner = await fs.lstat(anchored(quarantine, 'owner.json')).catch(() => null);
    if (owner !== null) await fs.unlink(anchored(quarantine, 'owner.json'));
    await syncHandle(quarantine.handle);
    await closeDirectory(quarantine);
    await fs.rmdir(anchored(locks, quarantineName));
    await syncHandle(locks.handle);
    return inspected;
  } finally {
    await closeDirectory(quarantine);
  }
}

async function removeCurrentLock(ledger, runId, expectedToken, expectedEpoch = null) {
  return withLocksDirectory(ledger, async (locks) => {
    const current = await inspectLockInDirectory(locks, runId);
    if (!current.held) fail('LOCK_RECOVERY_STALE', 'run lock is no longer present');
    if (current.state === 'unsupported') fail('VERSION_UNSUPPORTED', 'run lock owner version is unsupported');
    if (current.recoveryToken !== expectedToken ||
        (expectedEpoch !== null && current.owner?.epoch !== expectedEpoch)) {
      fail('LOCK_RECOVERY_STALE', 'run lock token or epoch changed');
    }
    const quarantineName = `.recover-${runId}-${randomUUID()}`;
    try {
      await fs.rename(anchored(locks, `${runId}.lock`), anchored(locks, quarantineName));
      await syncHandle(locks.handle);
    } catch {
      fail('LOCK_RECOVERY_STALE', 'run lock changed before it could be fenced');
    }
    return removeQuarantinedLock(locks, quarantineName, runId, expectedToken, expectedEpoch);
  });
}

export async function acquireRunLock(ledger, runId, {
  epoch,
  token = randomUUID(),
  acquiredAt = new Date().toISOString(),
} = {}) {
  assertLedgerWriteAuthority(ledger);
  validateControllerId(runId, 'run ID');
  safeInteger(epoch, 'run lock epoch', { minimum: 1 });
  if (typeof token !== 'string' || !UUID.test(token)) fail('ARGUMENT_INVALID', 'run lock token is invalid');
  validateTimestamp(acquiredAt, 'run lock acquiredAt');
  await withRunDirectory(ledger, runId, (run) => readRunIdentity(run, runId));
  const owner = {
    schemaVersion: IMPLEMENTATION_PROTOCOL_VERSION,
    runId,
    token,
    epoch,
    pid: process.pid,
    host: os.hostname(),
    acquiredAt,
  };
  const bytes = canonicalBytes(owner, { maxBytes: IMPLEMENTATION_LEDGER_LIMITS.lockBytes });
  await withLocksDirectory(ledger, async (locks) => {
    try {
      await fs.mkdir(anchored(locks, `${runId}.lock`), { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') fail('LOCK_BUSY', 'run lock is already held');
      fail('LOCK_FAILED', 'run lock cannot be acquired');
    }
    const lockDirectory = await openChildDirectory(locks, `${runId}.lock`, 'run lock directory');
    try {
      await writeExclusiveFile(lockDirectory, 'owner.json', bytes, 'run lock owner');
      await syncHandle(lockDirectory.handle);
      await syncHandle(locks.handle);
    } catch (error) {
      // Preserve an incomplete exclusive directory for exact-token recovery. It is
      // unsafe to make another writer live merely because owner publication failed.
      throw error;
    } finally {
      await closeDirectory(lockDirectory);
    }
  });

  let released = false;
  return Object.freeze({
    runId,
    token,
    epoch,
    owner: Object.freeze(structuredClone(owner)),
    async release() {
      if (released) return Object.freeze({ released: false });
      assertLedgerWriteAuthority(ledger);
      await removeCurrentLock(ledger, runId, token, epoch);
      released = true;
      return Object.freeze({ released: true });
    },
  });
}

export async function recoverRunLock(ledger, runId, {
  expectedToken,
  confirmOwnerNotLive = false,
} = {}) {
  assertLedgerWriteAuthority(ledger);
  validateControllerId(runId, 'run ID');
  if (confirmOwnerNotLive !== true) {
    fail('LOCK_RECOVERY_CONFIRMATION', 'lock recovery requires explicit confirmation that no owner is live');
  }
  if (expectedToken !== 'incomplete' && (typeof expectedToken !== 'string' || !UUID.test(expectedToken))) {
    fail('ARGUMENT_INVALID', 'expected run lock token is invalid');
  }
  const inspected = await inspectRunLock(ledger, runId);
  if (!inspected.held) fail('LOCK_RECOVERY_STALE', 'run lock is no longer present');
  if (inspected.state === 'unsupported') fail('VERSION_UNSUPPORTED', 'run lock owner version is unsupported');
  if (inspected.recoveryToken !== expectedToken) fail('LOCK_RECOVERY_STALE', 'run lock token changed');
  await removeCurrentLock(ledger, runId, expectedToken);
  return inspected;
}
