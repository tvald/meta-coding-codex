export const IMPLEMENTATION_ACTIVATION_VERSION = 1;

export const IMPLEMENTATION_EFFECT_KINDS = Object.freeze([
  'ledger_write',
  'provider_launch',
  'workspace_write',
  'git_admin',
  'signal',
  'task_mutation',
  'cleanup',
  'final_ref',
  'live_canary',
]);

export const IMPLEMENTATION_NON_EFFECT_OPERATIONS = Object.freeze([
  'read',
  'status',
  'events',
  'doctor',
  'shadow',
]);

export const IMPLEMENTATION_ACTIVATION_CODES = Object.freeze({
  authorized: 'ACTIVATION_AUTHORIZED',
  nonEffect: 'NON_EFFECT_OPERATION',
  disabled: 'ACTIVATION_DISABLED',
  operationUnknown: 'ACTIVATION_OPERATION_UNKNOWN',
  receiptInvalid: 'ACTIVATION_RECEIPT_INVALID',
  receiptUnsupported: 'ACTIVATION_RECEIPT_UNSUPPORTED',
  receiptUnrecognized: 'ACTIVATION_RECEIPT_UNRECOGNIZED',
  contextInvalid: 'ACTIVATION_CONTEXT_INVALID',
  stale: 'ACTIVATION_STALE',
  policyConflict: 'ACTIVATION_POLICY_CONFLICT',
  evidenceConflict: 'ACTIVATION_EVIDENCE_CONFLICT',
  mechanismUnsupported: 'ACTIVATION_MECHANISM_UNSUPPORTED',
  mechanismConflict: 'ACTIVATION_MECHANISM_CONFLICT',
  notYetValid: 'ACTIVATION_NOT_YET_VALID',
  expired: 'ACTIVATION_EXPIRED',
  approvalRequired: 'ACTIVATION_APPROVAL_REQUIRED',
  approvalConflict: 'ACTIVATION_APPROVAL_CONFLICT',
});

export const IMPLEMENTATION_ACTIVATION_DISPOSITION = Object.freeze({
  schemaVersion: IMPLEMENTATION_ACTIVATION_VERSION,
  mode: 'offline_fail_closed',
  defaultEffectAuthorization: 'disabled',
  operationsWithoutReceipt: IMPLEMENTATION_NON_EFFECT_OPERATIONS,
  supportedMechanism: Object.freeze({
    platform: 'linux',
    filesystem: 'local',
    process: 'pidfd',
  }),
});

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'receiptId',
  'effectKind',
  'binding',
  'policyDigest',
  'evidenceDigest',
  'mechanism',
  'issuedAt',
  'expiresAt',
  'taskApproval',
]);
const BINDING_KEYS = Object.freeze([
  'runId',
  'epoch',
  'taskId',
  'taskRevision',
  'taskRecordVersion',
  'capsuleDigest',
  'controlGeneration',
  'correctionGeneration',
]);
const MECHANISM_KEYS = Object.freeze(['platform', 'filesystem', 'process']);
const APPROVAL_KEYS = Object.freeze([
  'approvalId',
  'status',
  'source',
  'action',
  'boundary',
  'boundTaskRevision',
  'gateDigest',
]);
const CONTEXT_KEYS = Object.freeze([
  'receiptId',
  'binding',
  'policyDigest',
  'evidenceDigest',
  'mechanism',
  'taskApproval',
]);
const CONTROLLER_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const TASK_ID = /^T-(?:\d{4}|[1-9]\d{4,})$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u;

export class ImplementationActivationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationActivationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationActivationError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label, code) {
  if (!plainObject(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, `${label} has unknown or missing fields`);
  }
}

function boundedString(value, label, code, maximumBytes = 4_096) {
  if (typeof value !== 'string' || value.length === 0 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes) {
    fail(code, `${label} must be a bounded string`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(code, `${label} contains invalid Unicode`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(code, `${label} contains invalid Unicode`);
    }
  }
}

function controllerId(value, label, code) {
  if (typeof value !== 'string' || !CONTROLLER_ID.test(value)) fail(code, `${label} is invalid`);
}

function taskId(value, label, code) {
  if (typeof value !== 'string' || !TASK_ID.test(value)) fail(code, `${label} is invalid`);
  const numeric = Number(value.slice(2));
  if (!Number.isSafeInteger(numeric) || numeric < 1 ||
      `T-${String(numeric).padStart(4, '0')}` !== value) {
    fail(code, `${label} is invalid`);
  }
}

function digest(value, label, code) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(code, `${label} is invalid`);
}

function nonNegativeInteger(value, label, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, `${label} must be a non-negative integer`);
}

function positiveInteger(value, label, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(code, `${label} must be a positive integer`);
}

function timestamp(value, label, code) {
  if (typeof value !== 'string') fail(code, `${label} is not UTC RFC 3339`);
  const match = RFC3339_UTC.exec(value);
  if (match === null) fail(code, `${label} is not UTC RFC 3339`);
  const [, year, month, day, hour, minute, second] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const leapYear = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 ||
      numericDay > daysPerMonth[numericMonth - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 59) {
    fail(code, `${label} is not UTC RFC 3339`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(code, `${label} is not UTC RFC 3339`);
  return milliseconds;
}

function validateBinding(value, label, code) {
  exactKeys(value, BINDING_KEYS, label, code);
  controllerId(value.runId, `${label}.runId`, code);
  positiveInteger(value.epoch, `${label}.epoch`, code);
  taskId(value.taskId, `${label}.taskId`, code);
  positiveInteger(value.taskRevision, `${label}.taskRevision`, code);
  positiveInteger(value.taskRecordVersion, `${label}.taskRecordVersion`, code);
  digest(value.capsuleDigest, `${label}.capsuleDigest`, code);
  nonNegativeInteger(value.controlGeneration, `${label}.controlGeneration`, code);
  nonNegativeInteger(value.correctionGeneration, `${label}.correctionGeneration`, code);
}

function validateMechanism(value, label, code) {
  exactKeys(value, MECHANISM_KEYS, label, code);
  for (const field of MECHANISM_KEYS) boundedString(value[field], `${label}.${field}`, code, 64);
  const supported = IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism;
  if (MECHANISM_KEYS.some((field) => value[field] !== supported[field])) {
    fail(IMPLEMENTATION_ACTIVATION_CODES.mechanismUnsupported,
      `${label} is not a supported activation mechanism`);
  }
}

function validateTaskApproval(value, label, code) {
  if (value === null) return;
  exactKeys(value, APPROVAL_KEYS, label, code);
  boundedString(value.approvalId, `${label}.approvalId`, code, 256);
  if (value.status !== 'granted') fail(code, `${label}.status is not granted`);
  boundedString(value.source, `${label}.source`, code);
  if (value.action !== 'live_canary') fail(code, `${label}.action is unsupported`);
  boundedString(value.boundary, `${label}.boundary`, code);
  positiveInteger(value.boundTaskRevision, `${label}.boundTaskRevision`, code);
  digest(value.gateDigest, `${label}.gateDigest`, code);
}

function sameObjectFields(left, right, fields) {
  return fields.every((field) => left[field] === right[field]);
}

function validateContext(value) {
  const code = IMPLEMENTATION_ACTIVATION_CODES.contextInvalid;
  exactKeys(value, CONTEXT_KEYS, 'activation context', code);
  controllerId(value.receiptId, 'activation context.receiptId', code);
  validateBinding(value.binding, 'activation context.binding', code);
  digest(value.policyDigest, 'activation context.policyDigest', code);
  digest(value.evidenceDigest, 'activation context.evidenceDigest', code);
  validateMechanism(value.mechanism, 'activation context.mechanism', code);
  validateTaskApproval(value.taskApproval, 'activation context.taskApproval', code);
  return value;
}

export function validateActivationReceipt(value) {
  const code = IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid;
  exactKeys(value, RECEIPT_KEYS, 'activation receipt', code);
  if (value.schemaVersion !== IMPLEMENTATION_ACTIVATION_VERSION) {
    fail(IMPLEMENTATION_ACTIVATION_CODES.receiptUnsupported,
      'activation receipt schemaVersion is unsupported');
  }
  controllerId(value.receiptId, 'activation receipt.receiptId', code);
  if (!IMPLEMENTATION_EFFECT_KINDS.includes(value.effectKind)) {
    fail(code, 'activation receipt.effectKind is unsupported');
  }
  validateBinding(value.binding, 'activation receipt.binding', code);
  digest(value.policyDigest, 'activation receipt.policyDigest', code);
  digest(value.evidenceDigest, 'activation receipt.evidenceDigest', code);
  validateMechanism(value.mechanism, 'activation receipt.mechanism', code);
  const issuedAt = timestamp(value.issuedAt, 'activation receipt.issuedAt', code);
  const expiresAt = timestamp(value.expiresAt, 'activation receipt.expiresAt', code);
  if (expiresAt <= issuedAt) fail(code, 'activation receipt expiry must follow issuance');
  validateTaskApproval(value.taskApproval, 'activation receipt.taskApproval', code);
  if (value.effectKind !== 'live_canary' && value.taskApproval !== null) {
    fail(code, 'only a live canary receipt may carry task approval');
  }
  return value;
}

function result(authorized, code, operationKind, effectKind = null) {
  return Object.freeze({ authorized, code, operationKind, effectKind });
}

function validateCurrentTime(now) {
  try {
    return timestamp(now, 'current time', IMPLEMENTATION_ACTIVATION_CODES.contextInvalid);
  } catch (error) {
    if (error instanceof ImplementationActivationError) throw error;
    fail(IMPLEMENTATION_ACTIVATION_CODES.contextInvalid, 'current time is invalid');
  }
}

// The caller must supply context reconstructed from the current protected ledger and
// task record. Model output, prompt text, and receipt-shaped proposal data are not such
// context. This module validates or authorizes; it deliberately has no minting surface.
export function authorizeImplementationOperation({ operationKind, receipt = null, current = null, now = null } = {}) {
  if (IMPLEMENTATION_NON_EFFECT_OPERATIONS.includes(operationKind)) {
    return result(true, IMPLEMENTATION_ACTIVATION_CODES.nonEffect, operationKind);
  }
  if (!IMPLEMENTATION_EFFECT_KINDS.includes(operationKind)) {
    return result(false, IMPLEMENTATION_ACTIVATION_CODES.operationUnknown, operationKind ?? null);
  }
  if (receipt === null || receipt === undefined) {
    return result(false, IMPLEMENTATION_ACTIVATION_CODES.disabled, operationKind, operationKind);
  }

  try {
    validateActivationReceipt(receipt);
    validateContext(current);
    const nowMilliseconds = validateCurrentTime(now);

    if (receipt.effectKind !== operationKind) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid, operationKind, operationKind);
    }
    if (receipt.receiptId !== current.receiptId) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.receiptUnrecognized, operationKind, operationKind);
    }
    if (!sameObjectFields(receipt.binding, current.binding, BINDING_KEYS)) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.stale, operationKind, operationKind);
    }
    if (receipt.policyDigest !== current.policyDigest) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.policyConflict, operationKind, operationKind);
    }
    if (receipt.evidenceDigest !== current.evidenceDigest) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.evidenceConflict, operationKind, operationKind);
    }
    if (!sameObjectFields(receipt.mechanism, current.mechanism, MECHANISM_KEYS)) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.mechanismConflict, operationKind, operationKind);
    }

    const issuedAt = timestamp(receipt.issuedAt, 'activation receipt.issuedAt',
      IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
    const expiresAt = timestamp(receipt.expiresAt, 'activation receipt.expiresAt',
      IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
    if (nowMilliseconds < issuedAt) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.notYetValid, operationKind, operationKind);
    }
    if (nowMilliseconds >= expiresAt) {
      return result(false, IMPLEMENTATION_ACTIVATION_CODES.expired, operationKind, operationKind);
    }

    if (operationKind === 'live_canary') {
      if (receipt.taskApproval === null || current.taskApproval === null) {
        return result(false, IMPLEMENTATION_ACTIVATION_CODES.approvalRequired,
          operationKind, operationKind);
      }
      if (receipt.taskApproval.boundTaskRevision !== receipt.binding.taskRevision ||
          !sameObjectFields(receipt.taskApproval, current.taskApproval, APPROVAL_KEYS)) {
        return result(false, IMPLEMENTATION_ACTIVATION_CODES.approvalConflict,
          operationKind, operationKind);
      }
    }

    return result(true, IMPLEMENTATION_ACTIVATION_CODES.authorized, operationKind, operationKind);
  } catch (error) {
    if (error instanceof ImplementationActivationError) {
      return result(false, error.code, operationKind, operationKind);
    }
    throw error;
  }
}
