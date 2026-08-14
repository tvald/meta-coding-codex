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
  'request_correction',
  'schedule_gates',
  'checkpoint_task',
  'request_approval',
  'wait',
  'finalize',
  'stop',
  'fail',
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
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const CONTROLLER_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
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

function assignmentCount(proposal) {
  return Array.isArray(proposal.assignments) ? proposal.assignments.length : 0;
}

export function validateRootDecision(value, {
  expectedBinding = null,
  expectedOrientationDigest = null,
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
  exactKeys(value.source, ['launchReceipt', 'modelResult'], 'root decision.source');
  validateRef(value.source.launchReceipt, 'root decision.source.launchReceipt');
  validateRef(value.source.modelResult, 'root decision.source.modelResult');
  if (value.source.launchReceipt.kind !== 'launch_receipt' ||
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
