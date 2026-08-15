import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const IMPLEMENTATION_PROTOCOL_VERSION = 1;

export const IMPLEMENTATION_PROTOCOL_LIMITS = Object.freeze({
  recordBytes: 256 * 1024,
  arrayItems: 128,
  proseBytes: 4_096,
  orientationBytes: 96 * 1024,
  modelResultBytes: 128 * 1024,
  eventsPerRun: 10_000,
  diagnosticBytesPerRun: 64 * 1024 * 1024,
  nestingDepth: 64,
});

export const REF_KINDS = Object.freeze([
  'assignment',
  'attempt',
  'operation',
  'event',
  'candidate',
  'check_receipt',
  'resource_receipt',
  'process_receipt',
  'launch_receipt',
  'model_result',
  'terminal_receipt',
  'evidence',
  'detail',
  'decision',
]);

export const RESOURCE_CLAIM_MODES = Object.freeze([
  'shared_read',
  'namespaced_write',
  'exclusive',
]);

export const OPERATION_KINDS = Object.freeze([
  'activate_task',
  'launch_job',
  'allocate_workspace',
  'interrupt_job',
  'freeze_attempt',
  'ingest_attempt',
  'create_candidate',
  'integrate_candidate',
  'run_check',
  'allocate_resource',
  'cleanup_resource',
  'publish_candidate',
  'close_task',
  'create_completion_commit',
  'advance_target_ref',
  'cleanup_workspace',
]);

export const EVENT_KINDS = Object.freeze([
  'control_accepted',
  'orientation_published',
  'root_decision_accepted',
  'attempt_transition',
  'operation_transition',
  'provider_observed',
  'result_observed',
  'wake_due',
  'snapshot_published',
  'terminal_published',
]);

export const RUN_PHASES = Object.freeze([
  'preflight',
  'dormant',
  'orienting',
  'judgment_required',
  'intent_published',
  'executing',
  'verifying',
  'waiting',
  'stopping',
  'finalizing',
  'reconciliation_required',
  'succeeded',
  'failed',
  'stopped',
  'superseded',
]);

export const ATTEMPT_STATES = Object.freeze([
  'allocated',
  'launch_intended',
  'running',
  'ambiguous',
  'terminal_observed',
  'frozen',
  'ingested',
  'accepted',
  'rejected',
  'stale',
  'cleanup_pending',
  'cleaned',
  'quarantined',
]);

export const OPERATION_STATES = Object.freeze([
  'intended',
  'started',
  'observed_succeeded',
  'observed_failed',
  'ambiguous',
  'abandoned',
]);

export const ASSIGNMENT_ROLES = Object.freeze([
  'root_analysis',
  'root_decision',
  'implementer',
  'reviewer',
  'qa',
  'security',
]);

export const ASSIGNMENT_PROPOSAL_ROLES = Object.freeze(
  ASSIGNMENT_ROLES.filter((role) => role !== 'root_decision'),
);

export const ROOT_DECISION_KINDS = Object.freeze([
  'declare_assignments',
  'integrate_candidate',
  'reject_candidate',
  'request_correction',
  'schedule_gates',
  'checkpoint_task',
  'request_approval',
  'wait',
  'finalize',
  'stop',
  'fail',
]);

export const CHECK_OUTCOMES = Object.freeze([
  'pass',
  'fail',
  'not_run',
  'not_applicable',
]);

export const RESOURCE_RECEIPT_ACTIONS = Object.freeze([
  'allocate',
  'observe_collision',
  'cleanup',
]);

export const RESOURCE_RECEIPT_OUTCOMES = Object.freeze([
  'succeeded',
  'failed',
  'ambiguous',
]);

export const TERMINAL_DISPOSITIONS = Object.freeze([
  'succeeded',
  'failed',
  'stopped',
  'superseded',
]);

export const CONTROL_REQUEST_KINDS = Object.freeze([
  'stop',
  'resume',
]);

export const PERSISTED_RECORD_KINDS = Object.freeze([
  'assignment',
  'attempt',
  'operation',
  'candidate',
  'check_receipt',
  'resource_receipt',
  'process_receipt',
  'launch_receipt',
  'model_result',
  'terminal_receipt',
  'decision',
]);

export const IMPLEMENTATION_PROTOCOL_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  protocolVersions: Object.freeze([IMPLEMENTATION_PROTOCOL_VERSION]),
  recordSchemaVersions: Object.freeze([1]),
  canonicalization: 'RFC8785',
  digestAlgorithm: 'sha256',
});

const DEPENDENCY_TARGET_KINDS = Object.freeze(['assignment', 'proposal']);
const DEPENDENCY_CONDITIONS = Object.freeze(['result', 'integrated', 'gate_pass']);
const RESTART_POLICIES = Object.freeze(['fresh_attempt', 'never']);
const CHECKPOINT_STATUSES = Object.freeze(['active', 'needs_verification']);
const STOP_MODES = Object.freeze(['checkpoint', 'cancel']);
const SANDBOX_MODES = Object.freeze(['read-only', 'workspace-write']);
const ATTEMPT_WORKSPACE_KINDS = Object.freeze([
  'linked_worktree',
  'isolated_clone',
  'mount',
  'overlay',
]);
const EVENT_PRODUCER_KINDS = Object.freeze(['controller', 'launcher', 'operator', 'provider']);
const LAUNCH_RECEIPT_OUTCOMES = Object.freeze(['running', 'exited', 'ambiguous']);
const PROCESS_RECEIPT_ACTIONS = Object.freeze(['observe', 'interrupt']);
const PROCESS_RECEIPT_STATES = Object.freeze(['running', 'empty', 'ambiguous']);
const WORKER_DISPOSITIONS = Object.freeze(['completed', 'partial', 'blocked', 'failed']);
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const CONTROLLER_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TASK_ID = /^T-(?:\d{4}|[1-9]\d{4,})$/u;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u;

export class ImplementationProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationProtocolError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationProtocolError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function boundedInteger(value, label, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('SCHEMA_INVALID', `${label} must be an interoperable integer`);
  }
}

export function validateBoundedString(value, label = 'value', {
  allowEmpty = false,
  maxBytes = IMPLEMENTATION_PROTOCOL_LIMITS.proseBytes,
} = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) ||
      !validUnicode(value) || byteLength(value) > maxBytes) {
    fail('SCHEMA_INVALID', `${label} must be a bounded valid Unicode string`);
  }
  return value;
}

export function validateBoundedArray(value, label = 'value', {
  minimumItems = 0,
  maximumItems = IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
} = {}) {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    fail('SCHEMA_INVALID', `${label} must be a bounded array`);
  }
  return value;
}

export function validateControllerId(value, label = 'controller identifier') {
  if (typeof value !== 'string' || !CONTROLLER_ID.test(value)) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
  return value;
}

export function validateTaskId(value, label = 'task ID') {
  if (typeof value !== 'string' || !TASK_ID.test(value)) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
  const numeric = Number(value.slice(2));
  if (!Number.isSafeInteger(numeric) || numeric < 1 ||
      `T-${String(numeric).padStart(4, '0')}` !== value) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
  return value;
}

export function validateDigest(value, label = 'digest') {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
  return value;
}

export function validateGitOid(value, label = 'Git object ID') {
  if (typeof value !== 'string' || !GIT_OID.test(value)) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
  return value;
}

export function validateTimestamp(value, label = 'timestamp') {
  if (typeof value !== 'string') fail('SCHEMA_INVALID', `${label} is not UTC RFC 3339`);
  const match = RFC3339_UTC.exec(value);
  if (match === null) fail('SCHEMA_INVALID', `${label} is not UTC RFC 3339`);
  const [, year, month, day, hour, minute, second] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const leapYear = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 ||
      numericDay > daysPerMonth[numericMonth - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 60) {
    fail('SCHEMA_INVALID', `${label} is not UTC RFC 3339`);
  }
  return value;
}

export function validateRepositoryPath(value, label = 'repository path') {
  validateBoundedString(value, label);
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0') ||
      value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('SCHEMA_INVALID', `${label} must be a normalized repository-relative POSIX path`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('SCHEMA_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('SCHEMA_INVALID', `${label} has unknown or missing fields`);
  }
}

function schemaVersion(value, label) {
  if (value !== IMPLEMENTATION_PROTOCOL_VERSION) {
    fail('SCHEMA_UNSUPPORTED', `${label} schemaVersion is unsupported`);
  }
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) fail('SCHEMA_INVALID', `${label} is unsupported`);
}

function unique(values, key, label) {
  const seen = new Set();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) fail('SCHEMA_INVALID', `${label} contains a duplicate`);
    seen.add(identity);
  }
}

function stringArray(value, label, validator = validateBoundedString, options = {}) {
  validateBoundedArray(value, label, options);
  for (const [index, item] of value.entries()) validator(item, `${label}[${index}]`);
  unique(value, (item) => item, label);
}

function pathArray(value, label) {
  stringArray(value, label, validateRepositoryPath);
  if (value.some((item, index) => index > 0 && value[index - 1] >= item)) {
    fail('SCHEMA_INVALID', `${label} must be sorted and unique`);
  }
}

function assertCanonicalInputShape(value, state, depth) {
  if (depth > state.maximumDepth) fail('VALUE_INVALID', 'protocol data exceeds the nesting bound');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!validUnicode(value)) fail('VALUE_INVALID', 'protocol data contains invalid Unicode');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      fail('VALUE_INVALID', 'protocol data contains a non-interoperable integer');
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > state.maximumArrayItems || Object.keys(value).length !== value.length ||
        Reflect.ownKeys(value).length !== value.length + 1) {
      fail('VALUE_INVALID', 'protocol data contains an invalid or oversized array');
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('VALUE_INVALID', 'protocol data contains an invalid array member');
      }
      assertCanonicalInputShape(descriptor.value, state, depth + 1);
    }
    return;
  }
  if (!plainObject(value)) fail('VALUE_INVALID', 'protocol data contains an unsupported value');
  const keys = Object.keys(value);
  if (Reflect.ownKeys(value).length !== keys.length) {
    fail('VALUE_INVALID', 'protocol data contains non-JSON object properties');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !validUnicode(key)) {
      fail('VALUE_INVALID', 'protocol data contains an invalid object member');
    }
    assertCanonicalInputShape(descriptor.value, state, depth + 1);
  }
}

function serializeCanonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' ||
      typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${serializeCanonical(value[key])}`).join(',')}}`;
}

export function canonicalJson(value, {
  maxBytes = IMPLEMENTATION_PROTOCOL_LIMITS.recordBytes,
  maximumArrayItems = IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
  maximumDepth = IMPLEMENTATION_PROTOCOL_LIMITS.nestingDepth,
} = {}) {
  boundedInteger(maxBytes, 'canonical byte limit', { minimum: 1 });
  boundedInteger(maximumArrayItems, 'canonical array limit', { minimum: 0 });
  boundedInteger(maximumDepth, 'canonical nesting limit', { minimum: 0 });
  assertCanonicalInputShape(value, { maximumArrayItems, maximumDepth }, 0);
  const result = serializeCanonical(value);
  if (byteLength(result) > maxBytes) fail('RECORD_SIZE', 'canonical protocol data exceeds its byte bound');
  return result;
}

export function canonicalBytes(value, options) {
  return Buffer.from(canonicalJson(value, options), 'utf8');
}

export function validateProtocolValue(value, options) {
  canonicalJson(value, options);
  return value;
}

function inputBytes(input) {
  if (typeof input === 'string') {
    if (!validUnicode(input)) fail('JSON_INVALID', 'protocol JSON contains invalid Unicode');
    return Buffer.from(input, 'utf8');
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  fail('JSON_INVALID', 'protocol JSON must be UTF-8 bytes or a string');
}

function decodeUtf8(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail('JSON_INVALID', 'protocol JSON must not contain a BOM');
  }
  try {
    return UTF8.decode(bytes);
  } catch {
    fail('JSON_INVALID', 'protocol JSON is not valid UTF-8');
  }
}

function parseJson(text, { maximumArrayItems, maximumDepth }) {
  let cursor = 0;

  function invalid(message = 'protocol JSON is invalid') {
    fail('JSON_INVALID', message);
  }

  function whitespace() {
    while (cursor < text.length && [' ', '\t', '\n', '\r'].includes(text[cursor])) cursor += 1;
  }

  function string() {
    if (text[cursor] !== '"') invalid();
    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < text.length) {
      const character = text[cursor];
      cursor += 1;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        let parsed;
        try {
          parsed = JSON.parse(text.slice(start, cursor));
        } catch {
          invalid();
        }
        if (!validUnicode(parsed)) invalid('protocol JSON contains invalid Unicode');
        return parsed;
      } else if (character.charCodeAt(0) <= 0x1f) {
        invalid();
      }
    }
    invalid();
  }

  function value(depth = 0) {
    if (depth > maximumDepth) invalid('protocol JSON exceeds the nesting bound');
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1;
      whitespace();
      const result = {};
      const keys = new Set();
      if (text[cursor] === '}') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) invalid('protocol JSON contains a duplicate object key');
        keys.add(key);
        whitespace();
        if (text[cursor] !== ':') invalid();
        cursor += 1;
        const parsed = value(depth + 1);
        Object.defineProperty(result, key, {
          value: parsed,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        whitespace();
        if (text[cursor] === '}') {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ',') invalid();
        cursor += 1;
      }
      invalid();
    }
    if (character === '[') {
      cursor += 1;
      whitespace();
      const result = [];
      if (text[cursor] === ']') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        if (result.length >= maximumArrayItems) invalid('protocol JSON contains an oversized array');
        result.push(value(depth + 1));
        whitespace();
        if (text[cursor] === ']') {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ',') invalid();
        cursor += 1;
      }
      invalid();
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, cursor)) {
        cursor += token.length;
        return parsed;
      }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(cursor));
    if (match === null) invalid();
    cursor += match[0].length;
    const parsed = Number(match[0]);
    if (!Number.isSafeInteger(parsed)) invalid('protocol JSON contains a non-interoperable integer');
    return parsed;
  }

  const parsed = value();
  whitespace();
  if (cursor !== text.length) invalid();
  return parsed;
}

export function parseCanonicalJson(input, {
  maxBytes = IMPLEMENTATION_PROTOCOL_LIMITS.recordBytes,
  maximumArrayItems = IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
  maximumDepth = IMPLEMENTATION_PROTOCOL_LIMITS.nestingDepth,
} = {}) {
  boundedInteger(maxBytes, 'JSON byte limit', { minimum: 1 });
  boundedInteger(maximumArrayItems, 'JSON array limit', { minimum: 0 });
  boundedInteger(maximumDepth, 'JSON nesting limit', { minimum: 0 });
  const bytes = inputBytes(input);
  if (bytes.length === 0 || bytes.length > maxBytes) fail('RECORD_SIZE', 'protocol JSON exceeds its byte bound');
  const text = decodeUtf8(bytes);
  const parsed = parseJson(text, { maximumArrayItems, maximumDepth });
  const canonical = canonicalJson(parsed, { maxBytes, maximumArrayItems, maximumDepth });
  if (canonical !== text) fail('JSON_NONCANONICAL', 'protocol JSON is not RFC 8785 canonical JSON');
  return parsed;
}

export function sha256Digest(input) {
  const bytes = inputBytes(input);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function canonicalDigest(value, options) {
  return sha256Digest(canonicalBytes(value, options));
}

export function validateBinding(value, label = 'binding') {
  exactKeys(value, [
    'runId',
    'epoch',
    'snapshotRevision',
    'taskId',
    'taskRevision',
    'taskRecordVersion',
    'capsuleDigest',
    'controlGeneration',
    'correctionGeneration',
  ], label);
  validateControllerId(value.runId, `${label}.runId`);
  boundedInteger(value.epoch, `${label}.epoch`, { minimum: 0 });
  boundedInteger(value.snapshotRevision, `${label}.snapshotRevision`, { minimum: 0 });
  validateTaskId(value.taskId, `${label}.taskId`);
  boundedInteger(value.taskRevision, `${label}.taskRevision`, { minimum: 1 });
  boundedInteger(value.taskRecordVersion, `${label}.taskRecordVersion`, { minimum: 1 });
  validateDigest(value.capsuleDigest, `${label}.capsuleDigest`);
  boundedInteger(value.controlGeneration, `${label}.controlGeneration`, { minimum: 0 });
  boundedInteger(value.correctionGeneration, `${label}.correctionGeneration`, { minimum: 0 });
  return value;
}

export function validateRef(value, label = 'reference') {
  exactKeys(value, ['kind', 'id', 'digest'], label);
  enumValue(value.kind, REF_KINDS, `${label}.kind`);
  validateControllerId(value.id, `${label}.id`);
  validateDigest(value.digest, `${label}.digest`);
  return value;
}

export function validateResourceClaim(value, label = 'resource claim') {
  exactKeys(value, ['key', 'mode', 'namespace'], label);
  validateBoundedString(value.key, `${label}.key`);
  if (value.key.includes('\0')) fail('SCHEMA_INVALID', `${label}.key contains NUL`);
  enumValue(value.mode, RESOURCE_CLAIM_MODES, `${label}.mode`);
  if (value.mode === 'namespaced_write') {
    validateControllerId(value.namespace, `${label}.namespace`);
  } else if (value.namespace !== null) {
    fail('SCHEMA_INVALID', `${label}.namespace must be null for ${value.mode}`);
  }
  return value;
}

function validateDependency(value, label) {
  exactKeys(value, ['targetKind', 'targetId', 'condition'], label);
  enumValue(value.targetKind, DEPENDENCY_TARGET_KINDS, `${label}.targetKind`);
  validateControllerId(value.targetId, `${label}.targetId`);
  enumValue(value.condition, DEPENDENCY_CONDITIONS, `${label}.condition`);
}

function validateOwnership(value, label) {
  exactKeys(value, ['writePaths', 'readPaths'], label);
  pathArray(value.writePaths, `${label}.writePaths`);
  pathArray(value.readPaths, `${label}.readPaths`);
}

export function validateAssignmentProposal(value, label = 'assignment proposal') {
  exactKeys(value, [
    'proposalId',
    'role',
    'goal',
    'scope',
    'nonGoals',
    'dependencies',
    'ownership',
    'resources',
    'checks',
    'restartPolicy',
  ], label);
  validateControllerId(value.proposalId, `${label}.proposalId`);
  enumValue(value.role, ASSIGNMENT_PROPOSAL_ROLES, `${label}.role`);
  validateBoundedString(value.goal, `${label}.goal`);
  stringArray(value.scope, `${label}.scope`);
  stringArray(value.nonGoals, `${label}.nonGoals`);
  validateBoundedArray(value.dependencies, `${label}.dependencies`);
  value.dependencies.forEach((dependency, index) =>
    validateDependency(dependency, `${label}.dependencies[${index}]`));
  unique(value.dependencies, (dependency) => `${dependency.targetKind}\0${dependency.targetId}`,
    `${label}.dependencies`);
  validateOwnership(value.ownership, `${label}.ownership`);
  validateBoundedArray(value.resources, `${label}.resources`);
  value.resources.forEach((claim, index) =>
    validateResourceClaim(claim, `${label}.resources[${index}]`));
  unique(value.resources, (claim) => claim.key, `${label}.resources`);
  stringArray(value.checks, `${label}.checks`, validateControllerId);
  enumValue(value.restartPolicy, RESTART_POLICIES, `${label}.restartPolicy`);
  return value;
}

function validateAssignmentBatch(assignments, label, knownAssignmentIds) {
  validateBoundedArray(assignments, label);
  assignments.forEach((assignment, index) => validateAssignmentProposal(assignment, `${label}[${index}]`));
  unique(assignments, (assignment) => assignment.proposalId, label);
  const proposalIds = new Set(assignments.map((assignment) => assignment.proposalId));
  const graph = new Map(assignments.map((assignment) => [assignment.proposalId, []]));
  for (const assignment of assignments) {
    for (const dependency of assignment.dependencies) {
      if (dependency.targetKind === 'proposal') {
        if (!proposalIds.has(dependency.targetId)) {
          fail('SCHEMA_INVALID', `${label} contains an unresolved proposal dependency`);
        }
        graph.get(assignment.proposalId).push(dependency.targetId);
      } else if (knownAssignmentIds !== null && !knownAssignmentIds.has(dependency.targetId)) {
        fail('SCHEMA_INVALID', `${label} contains an unresolved assignment dependency`);
      }
    }
  }
  const active = new Set();
  const complete = new Set();
  function visit(id) {
    if (active.has(id)) fail('SCHEMA_INVALID', `${label} contains a dependency cycle`);
    if (complete.has(id)) return;
    active.add(id);
    for (const target of graph.get(id)) visit(target);
    active.delete(id);
    complete.add(id);
  }
  for (const id of graph.keys()) visit(id);
}

function identifierArray(value, label) {
  stringArray(value, label, validateControllerId);
}

function refArray(value, label, requiredKind = null) {
  validateBoundedArray(value, label);
  value.forEach((ref, index) => {
    validateRef(ref, `${label}[${index}]`);
    if (requiredKind !== null && ref.kind !== requiredKind) {
      fail('SCHEMA_INVALID', `${label}[${index}] has the wrong reference kind`);
    }
  });
  unique(value, (ref) => `${ref.kind}\0${ref.id}`, label);
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') fail('SCHEMA_INVALID', `${label} must be a boolean`);
}

function nullableControllerId(value, label) {
  if (value !== null) validateControllerId(value, label);
}

function nullableDigest(value, label) {
  if (value !== null) validateDigest(value, label);
}

function nullableGitOid(value, label) {
  if (value !== null) validateGitOid(value, label);
}

function nullableTimestamp(value, label) {
  if (value !== null) validateTimestamp(value, label);
}

function nullableRef(value, label, requiredKind = null) {
  if (value === null) return;
  validateRef(value, label);
  if (requiredKind !== null && value.kind !== requiredKind) {
    fail('SCHEMA_INVALID', `${label} has the wrong reference kind`);
  }
}

function proseArray(value, label) {
  validateBoundedArray(value, label);
  value.forEach((entry, index) => validateBoundedString(entry, `${label}[${index}]`));
}

function resourceClaimArray(value, label) {
  validateBoundedArray(value, label);
  value.forEach((claim, index) => validateResourceClaim(claim, `${label}[${index}]`));
  unique(value, (claim) => claim.key, label);
}

function validateAbsolutePosixPath(value, label) {
  validateBoundedString(value, label);
  if (!value.startsWith('/') || value.includes('\0') ||
      value.split('/').slice(1).some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail('SCHEMA_INVALID', `${label} must be a normalized absolute POSIX path`);
  }
}

function validateRecordBinding(value, label, {
  expectedBinding = null,
  expectedRunId = null,
  expectedTask = null,
  expectedCapsuleDigest = null,
  receipt = false,
} = {}) {
  validateBinding(value, label);
  if (expectedBinding !== null) {
    validateBinding(expectedBinding, 'expected binding');
    const matches = receipt
      ? sameReceiptAuthorityBinding(value, expectedBinding)
      : sameBinding(value, expectedBinding);
    if (!matches) fail('PROVENANCE_INVALID', `${label} is not current`);
  }
  if (expectedRunId !== null && value.runId !== expectedRunId) {
    fail('PROVENANCE_INVALID', `${label} names another run`);
  }
  if (expectedTask !== null) {
    const taskKeys = Object.hasOwn(expectedTask, 'recordVersion')
      ? ['id', 'taskRevision', 'recordVersion']
      : ['id', 'taskRevision'];
    exactKeys(expectedTask, taskKeys, 'expected task binding');
    validateTaskId(expectedTask.id, 'expected task binding.id');
    boundedInteger(expectedTask.taskRevision, 'expected task binding.taskRevision', { minimum: 1 });
    if (Object.hasOwn(expectedTask, 'recordVersion')) {
      boundedInteger(expectedTask.recordVersion, 'expected task binding.recordVersion', { minimum: 1 });
    }
    if (value.taskId !== expectedTask.id || value.taskRevision !== expectedTask.taskRevision ||
        (Object.hasOwn(expectedTask, 'recordVersion') &&
         value.taskRecordVersion !== expectedTask.recordVersion)) {
      fail('PROVENANCE_INVALID', `${label} names another task revision`);
    }
  }
  if (expectedCapsuleDigest !== null) {
    validateDigest(expectedCapsuleDigest, 'expected capsule digest');
    if (value.capsuleDigest !== expectedCapsuleDigest) {
      fail('PROVENANCE_INVALID', `${label} names another capsule`);
    }
  }
}

function validateTaskBinding(value, label) {
  exactKeys(value, [
    'id', 'taskRevision', 'recordVersion', 'storeId', 'storeGeneration',
  ], label);
  validateTaskId(value.id, `${label}.id`);
  boundedInteger(value.taskRevision, `${label}.taskRevision`, { minimum: 1 });
  boundedInteger(value.recordVersion, `${label}.recordVersion`, { minimum: 1 });
  validateControllerId(value.storeId, `${label}.storeId`);
  validateBoundedString(value.storeGeneration, `${label}.storeGeneration`);
}

function validateRepositoryIdentity(value, label) {
  exactKeys(value, [
    'rootIdentity', 'objectFormat', 'baseCommit', 'baseTree', 'canonicalWorktreeIdentity',
  ], label);
  validateDigest(value.rootIdentity, `${label}.rootIdentity`);
  enumValue(value.objectFormat, ['sha1', 'sha256'], `${label}.objectFormat`);
  validateGitOid(value.baseCommit, `${label}.baseCommit`);
  validateGitOid(value.baseTree, `${label}.baseTree`);
  const oidLength = value.objectFormat === 'sha1' ? 40 : 64;
  if (value.baseCommit.length !== oidLength || value.baseTree.length !== oidLength) {
    fail('PROVENANCE_INVALID', `${label} object IDs do not match objectFormat`);
  }
  validateDigest(value.canonicalWorktreeIdentity, `${label}.canonicalWorktreeIdentity`);
}

export function validateRunManifest(value) {
  exactKeys(value, [
    'schemaVersion', 'runId', 'createdAt', 'task', 'capsuleDigest', 'controller',
    'provider', 'repository', 'limits', 'policyDigests',
  ], 'run manifest');
  schemaVersion(value.schemaVersion, 'run manifest');
  validateControllerId(value.runId, 'run manifest.runId');
  validateTimestamp(value.createdAt, 'run manifest.createdAt');
  validateTaskBinding(value.task, 'run manifest.task');
  validateDigest(value.capsuleDigest, 'run manifest.capsuleDigest');
  exactKeys(value.controller, [
    'packageName', 'packageVersion', 'protocolVersion',
  ], 'run manifest.controller');
  validateBoundedString(value.controller.packageName, 'run manifest.controller.packageName');
  validateBoundedString(value.controller.packageVersion, 'run manifest.controller.packageVersion');
  if (value.controller.protocolVersion !== IMPLEMENTATION_PROTOCOL_VERSION) {
    fail('SCHEMA_UNSUPPORTED', 'run manifest controller protocolVersion is unsupported');
  }
  exactKeys(value.provider, [
    'adapter', 'adapterVersion', 'harness', 'executableRealpath', 'executableVersion',
  ], 'run manifest.provider');
  validateControllerId(value.provider.adapter, 'run manifest.provider.adapter');
  validateBoundedString(value.provider.adapterVersion, 'run manifest.provider.adapterVersion');
  validateControllerId(value.provider.harness, 'run manifest.provider.harness');
  validateAbsolutePosixPath(value.provider.executableRealpath,
    'run manifest.provider.executableRealpath');
  validateBoundedString(value.provider.executableVersion,
    'run manifest.provider.executableVersion');
  validateRepositoryIdentity(value.repository, 'run manifest.repository');
  exactKeys(value.limits, [
    'backgroundWip', 'rootWip', 'maxEvents', 'maxDiagnosticBytes', 'orientationBytes',
  ], 'run manifest.limits');
  boundedInteger(value.limits.backgroundWip, 'run manifest.limits.backgroundWip', { minimum: 1 });
  if (value.limits.backgroundWip > IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems) {
    fail('SCHEMA_INVALID', 'run manifest.limits.backgroundWip exceeds its bound');
  }
  if (value.limits.rootWip !== 1) fail('SCHEMA_INVALID', 'run manifest.limits.rootWip must be 1');
  boundedInteger(value.limits.maxEvents, 'run manifest.limits.maxEvents', { minimum: 1 });
  boundedInteger(value.limits.maxDiagnosticBytes, 'run manifest.limits.maxDiagnosticBytes', { minimum: 1 });
  boundedInteger(value.limits.orientationBytes, 'run manifest.limits.orientationBytes', { minimum: 1 });
  if (value.limits.maxEvents > IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun ||
      value.limits.maxDiagnosticBytes > IMPLEMENTATION_PROTOCOL_LIMITS.diagnosticBytesPerRun ||
      value.limits.orientationBytes > IMPLEMENTATION_PROTOCOL_LIMITS.orientationBytes) {
    fail('SCHEMA_INVALID', 'run manifest limits exceed protocol bounds');
  }
  exactKeys(value.policyDigests, ['promptRegistry', 'checks', 'resources'],
    'run manifest.policyDigests');
  for (const field of ['promptRegistry', 'checks', 'resources']) {
    validateDigest(value.policyDigests[field], `run manifest.policyDigests.${field}`);
  }
  canonicalJson(value);
  return value;
}

export function validateImplementationCapsule(value) {
  exactKeys(value, [
    'schemaVersion', 'taskId', 'taskRevision', 'taskRecordVersion', 'storeId',
    'storeGeneration', 'createdAt', 'authority', 'outcome', 'acceptance', 'nonGoals',
    'assumptions', 'decisions', 'route', 'risk', 'gateDigest', 'checkCatalogDigest',
    'detailDigests', 'baseCommit', 'baseStatusDigest',
  ], 'implementation capsule');
  schemaVersion(value.schemaVersion, 'implementation capsule');
  validateTaskId(value.taskId, 'implementation capsule.taskId');
  boundedInteger(value.taskRevision, 'implementation capsule.taskRevision', { minimum: 1 });
  boundedInteger(value.taskRecordVersion, 'implementation capsule.taskRecordVersion', { minimum: 1 });
  validateControllerId(value.storeId, 'implementation capsule.storeId');
  validateBoundedString(value.storeGeneration, 'implementation capsule.storeGeneration');
  validateTimestamp(value.createdAt, 'implementation capsule.createdAt');
  validateBoundedString(value.authority, 'implementation capsule.authority');
  validateBoundedString(value.outcome, 'implementation capsule.outcome');
  refArray(value.acceptance, 'implementation capsule.acceptance');
  proseArray(value.nonGoals, 'implementation capsule.nonGoals');
  proseArray(value.assumptions, 'implementation capsule.assumptions');
  refArray(value.decisions, 'implementation capsule.decisions', 'decision');
  validateBoundedString(value.route, 'implementation capsule.route');
  validateBoundedString(value.risk, 'implementation capsule.risk');
  validateDigest(value.gateDigest, 'implementation capsule.gateDigest');
  validateDigest(value.checkCatalogDigest, 'implementation capsule.checkCatalogDigest');
  refArray(value.detailDigests, 'implementation capsule.detailDigests', 'detail');
  validateGitOid(value.baseCommit, 'implementation capsule.baseCommit');
  validateDigest(value.baseStatusDigest, 'implementation capsule.baseStatusDigest');
  canonicalJson(value);
  return value;
}

export function validateRunSnapshot(value, {
  expectedRunId = null,
  minimumTaskRecordVersion = null,
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'runId', 'revision', 'previousDigest', 'epoch', 'controlGeneration',
    'phase', 'taskRecordVersion', 'correctionGeneration', 'integration', 'eventCursor',
    'assignments', 'attempts', 'operations', 'checks', 'resources', 'pendingWakeReasons',
    'stop', 'reconciliation', 'updatedAt',
  ], 'run snapshot');
  schemaVersion(value.schemaVersion, 'run snapshot');
  validateControllerId(value.runId, 'run snapshot.runId');
  if (expectedRunId !== null && value.runId !== expectedRunId) {
    fail('PROVENANCE_INVALID', 'run snapshot names another run');
  }
  boundedInteger(value.revision, 'run snapshot.revision', { minimum: 1 });
  nullableDigest(value.previousDigest, 'run snapshot.previousDigest');
  boundedInteger(value.epoch, 'run snapshot.epoch', { minimum: 0 });
  boundedInteger(value.controlGeneration, 'run snapshot.controlGeneration', { minimum: 0 });
  enumValue(value.phase, RUN_PHASES, 'run snapshot.phase');
  boundedInteger(value.taskRecordVersion, 'run snapshot.taskRecordVersion', { minimum: 1 });
  if (minimumTaskRecordVersion !== null) {
    boundedInteger(minimumTaskRecordVersion, 'minimum task record version', { minimum: 1 });
    if (value.taskRecordVersion < minimumTaskRecordVersion) {
      fail('PROVENANCE_INVALID', 'run snapshot task record version predates its capsule');
    }
  }
  boundedInteger(value.correctionGeneration, 'run snapshot.correctionGeneration', { minimum: 0 });
  exactKeys(value.integration, ['candidateId', 'tree', 'privateHead'], 'run snapshot.integration');
  nullableControllerId(value.integration.candidateId, 'run snapshot.integration.candidateId');
  validateGitOid(value.integration.tree, 'run snapshot.integration.tree');
  validateGitOid(value.integration.privateHead, 'run snapshot.integration.privateHead');
  boundedInteger(value.eventCursor, 'run snapshot.eventCursor', { minimum: 0 });
  refArray(value.assignments, 'run snapshot.assignments', 'assignment');
  refArray(value.attempts, 'run snapshot.attempts', 'attempt');
  refArray(value.operations, 'run snapshot.operations', 'operation');
  refArray(value.checks, 'run snapshot.checks', 'check_receipt');
  refArray(value.resources, 'run snapshot.resources', 'resource_receipt');
  stringArray(value.pendingWakeReasons, 'run snapshot.pendingWakeReasons', validateControllerId);
  exactKeys(value.stop, ['requested', 'mode', 'reasonDigest'], 'run snapshot.stop');
  booleanValue(value.stop.requested, 'run snapshot.stop.requested');
  if (value.stop.mode !== null) enumValue(value.stop.mode, STOP_MODES, 'run snapshot.stop.mode');
  nullableDigest(value.stop.reasonDigest, 'run snapshot.stop.reasonDigest');
  if (value.stop.requested !== (value.stop.mode !== null && value.stop.reasonDigest !== null)) {
    fail('PROVENANCE_INVALID', 'run snapshot stop fields are inconsistent');
  }
  exactKeys(value.reconciliation, ['required', 'reasonCode', 'refs'], 'run snapshot.reconciliation');
  booleanValue(value.reconciliation.required, 'run snapshot.reconciliation.required');
  nullableControllerId(value.reconciliation.reasonCode, 'run snapshot.reconciliation.reasonCode');
  refArray(value.reconciliation.refs, 'run snapshot.reconciliation.refs');
  if (value.reconciliation.required !== (value.reconciliation.reasonCode !== null)) {
    fail('PROVENANCE_INVALID', 'run snapshot reconciliation fields are inconsistent');
  }
  validateTimestamp(value.updatedAt, 'run snapshot.updatedAt');
  canonicalJson(value);
  return value;
}

export function validateAssignment(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'assignmentId', 'generation', 'binding', 'sourceDecisionId',
    'sourceProposalId', 'role', 'profileDigest', 'goal', 'scope', 'nonGoals',
    'dependencies', 'ownership', 'resources', 'baseCandidateId', 'baseTree',
    'permissions', 'checks', 'deadlineAt', 'restartPolicy',
  ], 'assignment');
  schemaVersion(value.schemaVersion, 'assignment');
  validateControllerId(value.assignmentId, 'assignment.assignmentId');
  boundedInteger(value.generation, 'assignment.generation', { minimum: 1 });
  validateRecordBinding(value.binding, 'assignment.binding', options);
  nullableControllerId(value.sourceDecisionId, 'assignment.sourceDecisionId');
  nullableControllerId(value.sourceProposalId, 'assignment.sourceProposalId');
  if ((value.sourceDecisionId === null) !== (value.sourceProposalId === null) ||
      (value.role === 'root_decision' && value.sourceDecisionId !== null)) {
    fail('PROVENANCE_INVALID', 'assignment source provenance is inconsistent');
  }
  enumValue(value.role, ASSIGNMENT_ROLES, 'assignment.role');
  validateDigest(value.profileDigest, 'assignment.profileDigest');
  validateBoundedString(value.goal, 'assignment.goal');
  proseArray(value.scope, 'assignment.scope');
  proseArray(value.nonGoals, 'assignment.nonGoals');
  validateBoundedArray(value.dependencies, 'assignment.dependencies');
  value.dependencies.forEach((dependency, index) => {
    const label = `assignment.dependencies[${index}]`;
    exactKeys(dependency, ['assignmentId', 'condition', 'generation'], label);
    validateControllerId(dependency.assignmentId, `${label}.assignmentId`);
    enumValue(dependency.condition, DEPENDENCY_CONDITIONS, `${label}.condition`);
    boundedInteger(dependency.generation, `${label}.generation`, { minimum: 1 });
  });
  unique(value.dependencies, (dependency) => dependency.assignmentId, 'assignment.dependencies');
  validateOwnership(value.ownership, 'assignment.ownership');
  resourceClaimArray(value.resources, 'assignment.resources');
  validateControllerId(value.baseCandidateId, 'assignment.baseCandidateId');
  validateGitOid(value.baseTree, 'assignment.baseTree');
  exactKeys(value.permissions, [
    'sandbox', 'network', 'approvalPolicy', 'nestedAgents',
  ], 'assignment.permissions');
  enumValue(value.permissions.sandbox, SANDBOX_MODES, 'assignment.permissions.sandbox');
  booleanValue(value.permissions.network, 'assignment.permissions.network');
  if (value.permissions.approvalPolicy !== 'never' || value.permissions.nestedAgents !== false) {
    fail('SCHEMA_INVALID', 'assignment permissions exceed the closed policy');
  }
  stringArray(value.checks, 'assignment.checks', validateControllerId);
  validateTimestamp(value.deadlineAt, 'assignment.deadlineAt');
  enumValue(value.restartPolicy, RESTART_POLICIES, 'assignment.restartPolicy');
  canonicalJson(value);
  return value;
}

export function validateAttempt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'attemptId', 'assignmentId', 'attemptNumber', 'recordVersion',
    'previousDigest', 'binding', 'state', 'workspace', 'launchRequestId',
    'processDomainId', 'result', 'candidateId', 'observedAt', 'terminalReason',
  ], 'attempt');
  schemaVersion(value.schemaVersion, 'attempt');
  validateControllerId(value.attemptId, 'attempt.attemptId');
  validateControllerId(value.assignmentId, 'attempt.assignmentId');
  boundedInteger(value.attemptNumber, 'attempt.attemptNumber', { minimum: 1 });
  boundedInteger(value.recordVersion, 'attempt.recordVersion', { minimum: 1 });
  nullableDigest(value.previousDigest, 'attempt.previousDigest');
  validateRecordBinding(value.binding, 'attempt.binding', options);
  enumValue(value.state, ATTEMPT_STATES, 'attempt.state');
  exactKeys(value.workspace, [
    'workspaceId', 'rootIdentity', 'kind', 'baseTree',
  ], 'attempt.workspace');
  validateControllerId(value.workspace.workspaceId, 'attempt.workspace.workspaceId');
  validateDigest(value.workspace.rootIdentity, 'attempt.workspace.rootIdentity');
  enumValue(value.workspace.kind, ATTEMPT_WORKSPACE_KINDS, 'attempt.workspace.kind');
  validateGitOid(value.workspace.baseTree, 'attempt.workspace.baseTree');
  nullableControllerId(value.launchRequestId, 'attempt.launchRequestId');
  nullableControllerId(value.processDomainId, 'attempt.processDomainId');
  nullableRef(value.result, 'attempt.result', 'model_result');
  nullableControllerId(value.candidateId, 'attempt.candidateId');
  validateTimestamp(value.observedAt, 'attempt.observedAt');
  if (value.terminalReason !== null) validateBoundedString(value.terminalReason, 'attempt.terminalReason');
  canonicalJson(value);
  return value;
}

export function validateOperation(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'operationId', 'recordVersion', 'previousDigest', 'idempotencyKey',
    'kind', 'subject', 'binding', 'inputDigest', 'expected', 'state', 'attemptNumber',
    'receipt', 'observedAt', 'failureCode',
  ], 'operation');
  schemaVersion(value.schemaVersion, 'operation');
  validateControllerId(value.operationId, 'operation.operationId');
  boundedInteger(value.recordVersion, 'operation.recordVersion', { minimum: 1 });
  nullableDigest(value.previousDigest, 'operation.previousDigest');
  validateBoundedString(value.idempotencyKey, 'operation.idempotencyKey');
  enumValue(value.kind, OPERATION_KINDS, 'operation.kind');
  validateRef(value.subject, 'operation.subject');
  validateRecordBinding(value.binding, 'operation.binding', options);
  validateDigest(value.inputDigest, 'operation.inputDigest');
  refArray(value.expected, 'operation.expected');
  enumValue(value.state, OPERATION_STATES, 'operation.state');
  boundedInteger(value.attemptNumber, 'operation.attemptNumber', { minimum: 0 });
  nullableRef(value.receipt, 'operation.receipt');
  validateTimestamp(value.observedAt, 'operation.observedAt');
  nullableControllerId(value.failureCode, 'operation.failureCode');
  canonicalJson(value);
  return value;
}

export function validateEvent(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'eventId', 'sequence', 'binding', 'kind', 'subject',
    'causationId', 'correlationId', 'producer', 'dedupeKey', 'observedAt', 'payload',
  ], 'event');
  schemaVersion(value.schemaVersion, 'event');
  validateControllerId(value.eventId, 'event.eventId');
  boundedInteger(value.sequence, 'event.sequence', {
    minimum: 1,
  });
  if (value.sequence > IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun) {
    fail('SCHEMA_INVALID', 'event.sequence exceeds the run event bound');
  }
  validateRecordBinding(value.binding, 'event.binding', options);
  enumValue(value.kind, EVENT_KINDS, 'event.kind');
  validateRef(value.subject, 'event.subject');
  nullableControllerId(value.causationId, 'event.causationId');
  validateControllerId(value.correlationId, 'event.correlationId');
  exactKeys(value.producer, ['kind', 'connectionId'], 'event.producer');
  enumValue(value.producer.kind, EVENT_PRODUCER_KINDS, 'event.producer.kind');
  nullableControllerId(value.producer.connectionId, 'event.producer.connectionId');
  const connectionRequired = ['launcher', 'provider'].includes(value.producer.kind);
  if (connectionRequired !== (value.producer.connectionId !== null)) {
    fail('PROVENANCE_INVALID', 'event producer connection provenance is inconsistent');
  }
  validateBoundedString(value.dedupeKey, 'event.dedupeKey');
  validateTimestamp(value.observedAt, 'event.observedAt');
  validateRef(value.payload, 'event.payload');
  canonicalJson(value);
  return value;
}

export function validateCandidate(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'candidateId', 'binding', 'parentCandidateId', 'baseTree', 'tree',
    'privateCommit', 'producerAttempts', 'changedPaths', 'ownershipDigest', 'patchDigest',
    'createdAt',
  ], 'candidate');
  schemaVersion(value.schemaVersion, 'candidate');
  validateControllerId(value.candidateId, 'candidate.candidateId');
  validateRecordBinding(value.binding, 'candidate.binding', options);
  nullableControllerId(value.parentCandidateId, 'candidate.parentCandidateId');
  validateGitOid(value.baseTree, 'candidate.baseTree');
  validateGitOid(value.tree, 'candidate.tree');
  validateGitOid(value.privateCommit, 'candidate.privateCommit');
  identifierArray(value.producerAttempts, 'candidate.producerAttempts');
  pathArray(value.changedPaths, 'candidate.changedPaths');
  validateDigest(value.ownershipDigest, 'candidate.ownershipDigest');
  validateDigest(value.patchDigest, 'candidate.patchDigest');
  validateTimestamp(value.createdAt, 'candidate.createdAt');
  canonicalJson(value);
  return value;
}

function validateExitCode(value, label) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 255)) {
    fail('SCHEMA_INVALID', `${label} is invalid`);
  }
}

export function validateCheckReceipt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'receiptId', 'binding', 'checkId', 'catalogDigest', 'candidateId',
    'candidateTree', 'inputScopeDigest', 'commandDigest', 'environmentDigest',
    'resourcesDigest', 'outcome', 'exitCode', 'evidence', 'startedAt', 'completedAt',
  ], 'check receipt');
  schemaVersion(value.schemaVersion, 'check receipt');
  validateControllerId(value.receiptId, 'check receipt.receiptId');
  validateRecordBinding(value.binding, 'check receipt.binding', { ...options, receipt: true });
  validateControllerId(value.checkId, 'check receipt.checkId');
  validateDigest(value.catalogDigest, 'check receipt.catalogDigest');
  validateControllerId(value.candidateId, 'check receipt.candidateId');
  validateGitOid(value.candidateTree, 'check receipt.candidateTree');
  for (const field of ['inputScopeDigest', 'commandDigest', 'environmentDigest', 'resourcesDigest']) {
    validateDigest(value[field], `check receipt.${field}`);
  }
  enumValue(value.outcome, CHECK_OUTCOMES, 'check receipt.outcome');
  validateExitCode(value.exitCode, 'check receipt.exitCode');
  if (value.outcome === 'pass' && value.exitCode !== 0) {
    fail('PROVENANCE_INVALID', 'passing check receipt requires exit code zero');
  }
  if (['not_run', 'not_applicable'].includes(value.outcome) && value.exitCode !== null) {
    fail('PROVENANCE_INVALID', 'unexecuted check receipt cannot have an exit code');
  }
  refArray(value.evidence, 'check receipt.evidence');
  validateTimestamp(value.startedAt, 'check receipt.startedAt');
  validateTimestamp(value.completedAt, 'check receipt.completedAt');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('PROVENANCE_INVALID', 'check receipt completed before it started');
  }
  canonicalJson(value);
  return value;
}

export function validateResourceReceipt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'receiptId', 'binding', 'attemptId', 'resourceKey', 'action',
    'ownershipTokenDigest', 'observedIdentityDigest', 'outcome', 'evidence', 'observedAt',
  ], 'resource receipt');
  schemaVersion(value.schemaVersion, 'resource receipt');
  validateControllerId(value.receiptId, 'resource receipt.receiptId');
  validateRecordBinding(value.binding, 'resource receipt.binding', { ...options, receipt: true });
  validateControllerId(value.attemptId, 'resource receipt.attemptId');
  validateBoundedString(value.resourceKey, 'resource receipt.resourceKey');
  if (value.resourceKey.includes('\0')) fail('SCHEMA_INVALID', 'resource receipt.resourceKey contains NUL');
  enumValue(value.action, RESOURCE_RECEIPT_ACTIONS, 'resource receipt.action');
  nullableDigest(value.ownershipTokenDigest, 'resource receipt.ownershipTokenDigest');
  nullableDigest(value.observedIdentityDigest, 'resource receipt.observedIdentityDigest');
  enumValue(value.outcome, RESOURCE_RECEIPT_OUTCOMES, 'resource receipt.outcome');
  refArray(value.evidence, 'resource receipt.evidence');
  validateTimestamp(value.observedAt, 'resource receipt.observedAt');
  canonicalJson(value);
  return value;
}

export function validateProcessReceipt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'receiptId', 'binding', 'attemptId', 'requestId',
    'launcherConnectionId', 'processDomainId', 'processIdentityDigest', 'action',
    'state', 'descendantsComplete', 'membersDigest', 'evidence', 'observedAt',
  ], 'process receipt');
  schemaVersion(value.schemaVersion, 'process receipt');
  validateControllerId(value.receiptId, 'process receipt.receiptId');
  validateRecordBinding(value.binding, 'process receipt.binding', { ...options, receipt: true });
  validateControllerId(value.attemptId, 'process receipt.attemptId');
  validateControllerId(value.requestId, 'process receipt.requestId');
  validateControllerId(value.launcherConnectionId, 'process receipt.launcherConnectionId');
  validateControllerId(value.processDomainId, 'process receipt.processDomainId');
  validateDigest(value.processIdentityDigest, 'process receipt.processIdentityDigest');
  enumValue(value.action, PROCESS_RECEIPT_ACTIONS, 'process receipt.action');
  enumValue(value.state, PROCESS_RECEIPT_STATES, 'process receipt.state');
  booleanValue(value.descendantsComplete, 'process receipt.descendantsComplete');
  validateDigest(value.membersDigest, 'process receipt.membersDigest');
  refArray(value.evidence, 'process receipt.evidence');
  validateTimestamp(value.observedAt, 'process receipt.observedAt');
  canonicalJson(value);
  return value;
}

export function validateTerminalReceipt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'receiptId', 'binding', 'disposition', 'candidateId', 'finalTree',
    'finalCommit', 'taskStatus', 'taskRecordVersion', 'checkReceipts',
    'completionEvidenceDigest', 'emittedAt',
  ], 'terminal receipt');
  schemaVersion(value.schemaVersion, 'terminal receipt');
  validateControllerId(value.receiptId, 'terminal receipt.receiptId');
  validateRecordBinding(value.binding, 'terminal receipt.binding', { ...options, receipt: true });
  enumValue(value.disposition, TERMINAL_DISPOSITIONS, 'terminal receipt.disposition');
  nullableControllerId(value.candidateId, 'terminal receipt.candidateId');
  nullableGitOid(value.finalTree, 'terminal receipt.finalTree');
  nullableGitOid(value.finalCommit, 'terminal receipt.finalCommit');
  validateControllerId(value.taskStatus, 'terminal receipt.taskStatus');
  boundedInteger(value.taskRecordVersion, 'terminal receipt.taskRecordVersion', { minimum: 1 });
  if (value.taskRecordVersion !== value.binding.taskRecordVersion) {
    fail('PROVENANCE_INVALID', 'terminal receipt task record version differs from its binding');
  }
  refArray(value.checkReceipts, 'terminal receipt.checkReceipts', 'check_receipt');
  nullableDigest(value.completionEvidenceDigest, 'terminal receipt.completionEvidenceDigest');
  validateTimestamp(value.emittedAt, 'terminal receipt.emittedAt');
  if (value.disposition === 'succeeded' &&
      (value.candidateId === null || value.finalTree === null || value.finalCommit === null ||
       value.taskStatus !== 'done' || value.completionEvidenceDigest === null)) {
    fail('PROVENANCE_INVALID', 'successful terminal receipt lacks completion provenance');
  }
  canonicalJson(value);
  return value;
}

export function validateLaunchReceipt(value, options = {}) {
  exactKeys(value, [
    'schemaVersion', 'receiptId', 'recordVersion', 'previousDigest', 'requestId',
    'binding', 'launcherConnectionId', 'processDomainId', 'providerHandleRef',
    'argvDigest', 'environmentDigest', 'startedAt', 'completedAt', 'exitCode', 'signal',
    'stdoutDigest', 'stderrDigest', 'modelResult', 'outcome',
  ], 'launch receipt');
  schemaVersion(value.schemaVersion, 'launch receipt');
  validateControllerId(value.receiptId, 'launch receipt.receiptId');
  boundedInteger(value.recordVersion, 'launch receipt.recordVersion', { minimum: 1 });
  nullableDigest(value.previousDigest, 'launch receipt.previousDigest');
  validateControllerId(value.requestId, 'launch receipt.requestId');
  validateRecordBinding(value.binding, 'launch receipt.binding', { ...options, receipt: true });
  validateControllerId(value.launcherConnectionId, 'launch receipt.launcherConnectionId');
  validateControllerId(value.processDomainId, 'launch receipt.processDomainId');
  nullableRef(value.providerHandleRef, 'launch receipt.providerHandleRef');
  validateDigest(value.argvDigest, 'launch receipt.argvDigest');
  validateDigest(value.environmentDigest, 'launch receipt.environmentDigest');
  validateTimestamp(value.startedAt, 'launch receipt.startedAt');
  nullableTimestamp(value.completedAt, 'launch receipt.completedAt');
  validateExitCode(value.exitCode, 'launch receipt.exitCode');
  if (value.signal !== null) validateBoundedString(value.signal, 'launch receipt.signal', { maxBytes: 64 });
  validateDigest(value.stdoutDigest, 'launch receipt.stdoutDigest');
  validateDigest(value.stderrDigest, 'launch receipt.stderrDigest');
  nullableRef(value.modelResult, 'launch receipt.modelResult', 'model_result');
  enumValue(value.outcome, LAUNCH_RECEIPT_OUTCOMES, 'launch receipt.outcome');
  if (value.outcome === 'running' &&
      (value.completedAt !== null || value.exitCode !== null || value.signal !== null || value.modelResult !== null)) {
    fail('PROVENANCE_INVALID', 'running launch receipt contains terminal evidence');
  }
  if (value.outcome === 'exited' &&
      (value.completedAt === null || (value.exitCode === null) === (value.signal === null))) {
    fail('PROVENANCE_INVALID', 'exited launch receipt lacks one exact exit cause');
  }
  canonicalJson(value);
  return value;
}

/**
 * The Root launch request is persisted as data before provider execution. This closed
 * projection intentionally matches the provider-neutral LaunchRequest protocol rather
 * than accepting an opaque digest whose preimage cannot be replayed.
 */
export function validateRootLaunchRequest(value) {
  exactKeys(value, [
    'schemaVersion', 'requestId', 'jobId', 'binding', 'assignmentId', 'attemptId', 'role',
    'providerAdapter', 'executableVersion', 'cwdIdentity', 'baseTree', 'profileDigest',
    'promptDigest', 'outputSchemaDigest', 'sandbox', 'approvalPolicy', 'network',
    'nestedAgents', 'environmentDigest', 'deadlineAt',
  ], 'root launch request');
  schemaVersion(value.schemaVersion, 'root launch request');
  validateControllerId(value.requestId, 'root launch request.requestId');
  validateControllerId(value.jobId, 'root launch request.jobId');
  validateBinding(value.binding, 'root launch request.binding');
  validateControllerId(value.assignmentId, 'root launch request.assignmentId');
  validateControllerId(value.attemptId, 'root launch request.attemptId');
  if (value.role !== 'root_decision') {
    fail('PROVENANCE_INVALID', 'root launch request role is not root_decision');
  }
  validateControllerId(value.providerAdapter, 'root launch request.providerAdapter');
  validateBoundedString(value.executableVersion, 'root launch request.executableVersion', {
    maxBytes: 64,
  });
  validateDigest(value.cwdIdentity, 'root launch request.cwdIdentity');
  validateGitOid(value.baseTree, 'root launch request.baseTree');
  for (const field of [
    'profileDigest', 'promptDigest', 'outputSchemaDigest', 'environmentDigest',
  ]) validateDigest(value[field], `root launch request.${field}`);
  if (value.sandbox !== 'read-only' || value.approvalPolicy !== 'never' ||
      value.network !== false || value.nestedAgents !== false) {
    fail('PROVENANCE_INVALID', 'root launch request permissions are not read-only and closed');
  }
  validateTimestamp(value.deadlineAt, 'root launch request.deadlineAt');
  canonicalJson(value);
  return value;
}

export function rootLaunchRequestDigest(value) {
  validateRootLaunchRequest(value);
  return canonicalDigest(value);
}

export function validateRootLaunchIntent(value, {
  expectedBinding = null,
  expectedOrientationRef = null,
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'recordType', 'orientation', 'orientationDigest', 'request',
    'requestDigest',
  ], 'root launch intent');
  schemaVersion(value.schemaVersion, 'root launch intent');
  if (value.recordType !== 'root_launch_intent') {
    fail('SCHEMA_INVALID', 'root launch intent recordType is unsupported');
  }
  validateRef(value.orientation, 'root launch intent.orientation');
  if (value.orientation.kind !== 'detail') {
    fail('SCHEMA_INVALID', 'root launch intent orientation reference kind is invalid');
  }
  validateDigest(value.orientationDigest, 'root launch intent.orientationDigest');
  if (value.orientationDigest !== value.orientation.digest) {
    fail('PROVENANCE_INVALID', 'root launch intent orientation digest differs from its reference');
  }
  validateRootLaunchRequest(value.request);
  validateDigest(value.requestDigest, 'root launch intent.requestDigest');
  if (value.requestDigest !== rootLaunchRequestDigest(value.request)) {
    fail('PROVENANCE_INVALID', 'root launch intent request digest does not bind its request');
  }
  if (expectedBinding !== null) {
    validateBinding(expectedBinding, 'expected root launch binding');
    if (!sameBinding(value.request.binding, expectedBinding)) {
      fail('PROVENANCE_INVALID', 'root launch intent request binding is not current');
    }
  }
  if (expectedOrientationRef !== null) {
    validateRef(expectedOrientationRef, 'expected root orientation reference');
    if (expectedOrientationRef.kind !== 'detail' ||
        !sameRef(value.orientation, expectedOrientationRef)) {
      fail('PROVENANCE_INVALID', 'root launch intent names another orientation');
    }
  }
  canonicalJson(value);
  return value;
}

export function createRootLaunchIntent({ request, orientation } = {}) {
  validateRootLaunchRequest(request);
  validateRef(orientation, 'root launch orientation reference');
  const intent = {
    schemaVersion: IMPLEMENTATION_PROTOCOL_VERSION,
    recordType: 'root_launch_intent',
    orientation: structuredClone(orientation),
    orientationDigest: orientation.digest,
    request: structuredClone(request),
    requestDigest: rootLaunchRequestDigest(request),
  };
  validateRootLaunchIntent(intent);
  const freeze = (item) => {
    if (item !== null && typeof item === 'object' && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(intent);
}

export function validateWorkerResult(value) {
  exactKeys(value, [
    'schemaVersion', 'disposition', 'summary', 'changedPathsClaim', 'checks', 'findings',
    'risks', 'knowledgeProposals', 'followUp',
  ], 'worker result');
  schemaVersion(value.schemaVersion, 'worker result');
  enumValue(value.disposition, WORKER_DISPOSITIONS, 'worker result.disposition');
  validateBoundedString(value.summary, 'worker result.summary');
  pathArray(value.changedPathsClaim, 'worker result.changedPathsClaim');
  validateBoundedArray(value.checks, 'worker result.checks');
  value.checks.forEach((check, index) => {
    const label = `worker result.checks[${index}]`;
    exactKeys(check, ['id', 'outcome', 'evidenceDigest'], label);
    validateControllerId(check.id, `${label}.id`);
    enumValue(check.outcome, CHECK_OUTCOMES, `${label}.outcome`);
    nullableDigest(check.evidenceDigest, `${label}.evidenceDigest`);
  });
  unique(value.checks, (check) => check.id, 'worker result.checks');
  validateBoundedArray(value.findings, 'worker result.findings');
  value.findings.forEach((finding, index) => {
    const label = `worker result.findings[${index}]`;
    exactKeys(finding, ['severity', 'summary', 'evidenceDigest'], label);
    validateBoundedString(finding.severity, `${label}.severity`, { maxBytes: 64 });
    validateBoundedString(finding.summary, `${label}.summary`);
    nullableDigest(finding.evidenceDigest, `${label}.evidenceDigest`);
  });
  proseArray(value.risks, 'worker result.risks');
  proseArray(value.knowledgeProposals, 'worker result.knowledgeProposals');
  proseArray(value.followUp, 'worker result.followUp');
  canonicalJson(value, { maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes });
  return value;
}

export function validateRootModelResult(value) {
  exactKeys(value, [
    'schemaVersion', 'recordType', 'worker', 'proposal', 'orientationDigest',
    'promptDigest', 'rawResultDigest',
  ], 'root model result');
  schemaVersion(value.schemaVersion, 'root model result');
  if (value.recordType !== 'root_decision_result') {
    fail('SCHEMA_INVALID', 'root model result recordType is unsupported');
  }
  validateWorkerResult(value.worker);
  validateRootDecisionProposal(value.proposal);
  validateDigest(value.orientationDigest, 'root model result.orientationDigest');
  validateDigest(value.promptDigest, 'root model result.promptDigest');
  validateDigest(value.rawResultDigest, 'root model result.rawResultDigest');
  canonicalJson(value);
  return value;
}

export function validateModelResult(value) {
  return plainObject(value) && value.recordType === 'root_decision_result'
    ? validateRootModelResult(value)
    : validateWorkerResult(value);
}

export function validateControlRequest(value, { expectedRunId = null } = {}) {
  if (!plainObject(value)) fail('SCHEMA_INVALID', 'control request must be an object');
  schemaVersion(value.schemaVersion, 'control request');
  enumValue(value.kind, CONTROL_REQUEST_KINDS, 'control request.kind');
  const keys = ['schemaVersion', 'requestId', 'runId', 'expectedControlGeneration', 'kind', 'requestedAt'];
  if (value.kind === 'stop') keys.push('reason');
  if (value.kind === 'resume') keys.push('expectedEpoch');
  exactKeys(value, keys, 'control request');
  validateControllerId(value.requestId, 'control request.requestId');
  validateControllerId(value.runId, 'control request.runId');
  if (expectedRunId !== null && value.runId !== expectedRunId) {
    fail('PROVENANCE_INVALID', 'control request names another run');
  }
  boundedInteger(value.expectedControlGeneration, 'control request.expectedControlGeneration', { minimum: 0 });
  if (value.kind === 'resume') {
    boundedInteger(value.expectedEpoch, 'control request.expectedEpoch', { minimum: 1 });
  }
  validateTimestamp(value.requestedAt, 'control request.requestedAt');
  if (value.kind === 'stop') validateBoundedString(value.reason, 'control request.reason');
  canonicalJson(value);
  return value;
}

export function validatePersistedRecord(kind, value, options = {}) {
  enumValue(kind, PERSISTED_RECORD_KINDS, 'persisted record kind');
  switch (kind) {
    case 'assignment': return validateAssignment(value, options);
    case 'attempt': return validateAttempt(value, options);
    case 'operation': return validateOperation(value, options);
    case 'candidate': return validateCandidate(value, options);
    case 'check_receipt': return validateCheckReceipt(value, options);
    case 'resource_receipt': return validateResourceReceipt(value, options);
    case 'process_receipt': return validateProcessReceipt(value, options);
    case 'launch_receipt': return validateLaunchReceipt(value, options);
    case 'model_result': return validateModelResult(value);
    case 'terminal_receipt': return validateTerminalReceipt(value, options);
    case 'decision': {
      validateRecordBinding(value?.binding, 'root decision.binding', options);
      return validateRootDecision(value, { expectedBinding: options.expectedBinding ?? null });
    }
    default: fail('SCHEMA_INVALID', 'persisted record kind is unsupported');
  }
}

export function validateRootDecisionProposal(value, {
  knownAssignmentIds = null,
} = {}) {
  if (!plainObject(value)) fail('SCHEMA_INVALID', 'root decision proposal must be an object');
  schemaVersion(value.schemaVersion, 'root decision proposal');
  validateBoundedString(value.rationale, 'root decision proposal.rationale');
  enumValue(value.kind, ROOT_DECISION_KINDS, 'root decision proposal.kind');
  let assignmentBatch = null;
  switch (value.kind) {
    case 'declare_assignments':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'assignments'], 'root decision proposal');
      assignmentBatch = value.assignments;
      break;
    case 'integrate_candidate':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'candidateId'], 'root decision proposal');
      validateControllerId(value.candidateId, 'root decision proposal.candidateId');
      break;
    case 'reject_candidate':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'candidateId', 'evidence'],
        'root decision proposal');
      validateControllerId(value.candidateId, 'root decision proposal.candidateId');
      refArray(value.evidence, 'root decision proposal.evidence');
      break;
    case 'request_correction':
      exactKeys(value, [
        'schemaVersion', 'rationale', 'kind', 'supersededAssignmentIds', 'assignments', 'affectedCheckIds',
      ], 'root decision proposal');
      identifierArray(value.supersededAssignmentIds, 'root decision proposal.supersededAssignmentIds');
      identifierArray(value.affectedCheckIds, 'root decision proposal.affectedCheckIds');
      assignmentBatch = value.assignments;
      break;
    case 'schedule_gates':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'candidateId', 'assignments'],
        'root decision proposal');
      validateControllerId(value.candidateId, 'root decision proposal.candidateId');
      assignmentBatch = value.assignments;
      break;
    case 'checkpoint_task':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'status', 'nextSafeAction'],
        'root decision proposal');
      enumValue(value.status, CHECKPOINT_STATUSES, 'root decision proposal.status');
      validateBoundedString(value.nextSafeAction, 'root decision proposal.nextSafeAction');
      break;
    case 'request_approval':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'action', 'boundary', 'detailRef'],
        'root decision proposal');
      validateBoundedString(value.action, 'root decision proposal.action');
      validateBoundedString(value.boundary, 'root decision proposal.boundary');
      validateRef(value.detailRef, 'root decision proposal.detailRef');
      if (value.detailRef.kind !== 'detail') {
        fail('SCHEMA_INVALID', 'root decision proposal.detailRef must be a detail reference');
      }
      break;
    case 'wait':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'reasonCode', 'wakeOn', 'deadlineAt'],
        'root decision proposal');
      validateControllerId(value.reasonCode, 'root decision proposal.reasonCode');
      stringArray(value.wakeOn, 'root decision proposal.wakeOn', validateControllerId);
      if (value.deadlineAt !== null) validateTimestamp(value.deadlineAt, 'root decision proposal.deadlineAt');
      break;
    case 'finalize':
      exactKeys(value, [
        'schemaVersion', 'rationale', 'kind', 'candidateId', 'requiredCheckReceiptIds',
        'completionEvidenceDigest',
      ], 'root decision proposal');
      validateControllerId(value.candidateId, 'root decision proposal.candidateId');
      identifierArray(value.requiredCheckReceiptIds, 'root decision proposal.requiredCheckReceiptIds');
      validateDigest(value.completionEvidenceDigest, 'root decision proposal.completionEvidenceDigest');
      break;
    case 'stop':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'mode', 'reason'],
        'root decision proposal');
      enumValue(value.mode, STOP_MODES, 'root decision proposal.mode');
      validateBoundedString(value.reason, 'root decision proposal.reason');
      break;
    case 'fail':
      exactKeys(value, ['schemaVersion', 'rationale', 'kind', 'reasonCode', 'evidence'],
        'root decision proposal');
      validateControllerId(value.reasonCode, 'root decision proposal.reasonCode');
      refArray(value.evidence, 'root decision proposal.evidence');
      break;
    default:
      fail('SCHEMA_INVALID', 'root decision proposal.kind is unsupported');
  }
  if (assignmentBatch !== null) {
    const known = knownAssignmentIds === null ? null : new Set(knownAssignmentIds);
    validateAssignmentBatch(assignmentBatch, 'root decision proposal.assignments', known);
  }
  canonicalJson(value, { maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes });
  return value;
}

function sameRef(left, right) {
  return left.kind === right.kind && left.id === right.id && left.digest === right.digest;
}

function sameBinding(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sameReceiptAuthorityBinding(receiptBinding, currentBinding) {
  return receiptBinding.runId === currentBinding.runId &&
    receiptBinding.epoch === currentBinding.epoch &&
    receiptBinding.taskId === currentBinding.taskId &&
    receiptBinding.taskRevision === currentBinding.taskRevision &&
    receiptBinding.taskRecordVersion === currentBinding.taskRecordVersion &&
    receiptBinding.capsuleDigest === currentBinding.capsuleDigest &&
    receiptBinding.controlGeneration === currentBinding.controlGeneration &&
    receiptBinding.correctionGeneration === currentBinding.correctionGeneration;
}

/**
 * Receipts may be produced concurrently from an earlier snapshot revision, but they
 * remain usable only while every effect-authority generation is still current.
 */
export function receiptBindingAuthorizesCurrent(currentBinding, receiptBinding) {
  validateBinding(currentBinding, 'current binding');
  validateBinding(receiptBinding, 'receipt binding');
  return sameReceiptAuthorityBinding(receiptBinding, currentBinding);
}

function assignmentCount(proposal) {
  return Array.isArray(proposal.assignments) ? proposal.assignments.length : 0;
}

export function validateRootDecision(value, {
  expectedBinding = null,
  expectedOrientationDigest = null,
  launchIntentRef = null,
  launchIntent = null,
  launchReceiptRef = null,
  launchReceipt = null,
} = {}) {
  exactKeys(value, [
    'schemaVersion',
    'decisionId',
    'binding',
    'orientationDigest',
    'proposalDigest',
    'source',
    'proposal',
    'derivedAssignments',
    'acceptedAt',
  ], 'root decision');
  schemaVersion(value.schemaVersion, 'root decision');
  validateControllerId(value.decisionId, 'root decision.decisionId');
  validateBinding(value.binding, 'root decision.binding');
  validateDigest(value.orientationDigest, 'root decision.orientationDigest');
  validateDigest(value.proposalDigest, 'root decision.proposalDigest');
  exactKeys(value.source, ['launchIntent', 'launchReceipt', 'modelResult'],
    'root decision.source');
  validateRef(value.source.launchIntent, 'root decision.source.launchIntent');
  validateRef(value.source.launchReceipt, 'root decision.source.launchReceipt');
  validateRef(value.source.modelResult, 'root decision.source.modelResult');
  if (value.source.launchIntent.kind !== 'detail' ||
      value.source.launchReceipt.kind !== 'launch_receipt' ||
      value.source.modelResult.kind !== 'model_result') {
    fail('SCHEMA_INVALID', 'root decision source reference kinds are invalid');
  }
  validateRootDecisionProposal(value.proposal);
  if (value.proposalDigest !== canonicalDigest(value.proposal, {
    maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes,
  })) {
    fail('PROVENANCE_INVALID', 'root decision proposalDigest does not bind its proposal');
  }
  refArray(value.derivedAssignments, 'root decision.derivedAssignments', 'assignment');
  if (value.derivedAssignments.length !== assignmentCount(value.proposal)) {
    fail('PROVENANCE_INVALID', 'root decision derived assignments do not match its proposal batch');
  }
  validateTimestamp(value.acceptedAt, 'root decision.acceptedAt');
  if (expectedBinding !== null) {
    validateBinding(expectedBinding, 'expected binding');
    if (!sameBinding(value.binding, expectedBinding)) {
      fail('PROVENANCE_INVALID', 'root decision binding is not current');
    }
  }
  if (expectedOrientationDigest !== null) {
    validateDigest(expectedOrientationDigest, 'expected orientation digest');
    if (value.orientationDigest !== expectedOrientationDigest) {
      fail('PROVENANCE_INVALID', 'root decision names another orientation');
    }
  }
  if (launchIntentRef !== null) {
    validateRef(launchIntentRef, 'root launch intent reference');
    if (launchIntentRef.kind !== 'detail' ||
        !sameRef(value.source.launchIntent, launchIntentRef)) {
      fail('PROVENANCE_INVALID', 'root decision names another launch intent');
    }
  }
  if (launchIntent !== null) {
    validateRootLaunchIntent(launchIntent);
    if (expectedBinding !== null &&
        !sameReceiptAuthorityBinding(launchIntent.request.binding, expectedBinding)) {
      fail('PROVENANCE_INVALID', 'root decision launch intent authority binding is stale');
    }
    if (expectedOrientationDigest !== null &&
        launchIntent.orientationDigest !== expectedOrientationDigest) {
      fail('PROVENANCE_INVALID', 'root decision launch intent names another orientation');
    }
    const derivedRef = {
      kind: 'detail',
      id: value.source.launchIntent.id,
      digest: canonicalDigest(launchIntent),
    };
    if (!sameRef(value.source.launchIntent, derivedRef)) {
      fail('PROVENANCE_INVALID', 'root decision launch intent digest is invalid');
    }
  }
  if (launchReceiptRef !== null) {
    validateRef(launchReceiptRef, 'launch receipt reference');
    if (launchReceiptRef.kind !== 'launch_receipt' ||
        !sameRef(value.source.launchReceipt, launchReceiptRef)) {
      fail('PROVENANCE_INVALID', 'root decision names another launch receipt');
    }
  }
  if (launchReceipt !== null) {
    if (!plainObject(launchReceipt)) fail('PROVENANCE_INVALID', 'launch receipt provenance is invalid');
    validateControllerId(launchReceipt.receiptId, 'launch receipt.receiptId');
    validateRef(launchReceipt.modelResult, 'launch receipt.modelResult');
    if (launchReceipt.modelResult.kind !== 'model_result' ||
        !sameRef(value.source.modelResult, launchReceipt.modelResult)) {
      fail('PROVENANCE_INVALID', 'root decision model result is not the launch receipt result');
    }
    const derivedRef = {
      kind: 'launch_receipt',
      id: launchReceipt.receiptId,
      digest: canonicalDigest(launchReceipt),
    };
    if (!sameRef(value.source.launchReceipt, derivedRef)) {
      fail('PROVENANCE_INVALID', 'root decision launch receipt digest is invalid');
    }
    if (Object.hasOwn(launchReceipt, 'binding')) {
      validateBinding(launchReceipt.binding, 'launch receipt.binding');
      if (!sameReceiptAuthorityBinding(launchReceipt.binding, value.binding)) {
        fail('PROVENANCE_INVALID', 'root decision and launch receipt authority bindings differ');
      }
    }
  }
  canonicalJson(value);
  return value;
}
