import {
  canonicalDigest,
  validateBinding,
  validateBoundedArray,
  validateControllerId,
  validateDigest,
  validateRef,
  validateResourceClaim,
  validateTimestamp,
} from './implementation-protocol.mjs';
import { bindingAuthorizesEffect } from './implementation-reducer.mjs';

export const CHECK_OUTCOMES = Object.freeze(['pass', 'fail', 'not_run', 'not_applicable']);
export const RESOURCE_ACTIONS = Object.freeze(['allocate', 'observe_collision', 'cleanup']);
export const RESOURCE_OUTCOMES = Object.freeze(['succeeded', 'failed', 'ambiguous']);

const CHECK_KEYS = Object.freeze([
  'schemaVersion', 'receiptId', 'binding', 'checkId', 'catalogDigest', 'candidateId',
  'candidateTree', 'inputScopeDigest', 'commandDigest', 'environmentDigest',
  'resourcesDigest', 'outcome', 'exitCode', 'evidence', 'startedAt', 'completedAt',
]);
const REQUIREMENT_KEYS = Object.freeze([
  'checkId', 'catalogDigest', 'candidateId', 'candidateTree', 'inputScopeDigest',
  'commandDigest', 'environmentDigest', 'resourcesDigest',
]);
const RESOURCE_KEYS = Object.freeze([
  'schemaVersion', 'receiptId', 'binding', 'attemptId', 'resourceKey', 'action',
  'ownershipTokenDigest', 'observedIdentityDigest', 'outcome', 'evidence', 'observedAt',
]);

export class ImplementationVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationVerificationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationVerificationError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('VERIFICATION_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('VERIFICATION_INVALID', `${label} has unknown or missing fields`);
  }
}

function oid(value, label) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    fail('VERIFICATION_INVALID', `${label} is not a Git object ID`);
  }
}

function nullableDigest(value, label) {
  if (value !== null) validateDigest(value, label);
}

function exitCode(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 255)) {
    fail('VERIFICATION_INVALID', 'check receipt.exitCode is invalid');
  }
}

function refs(value, label) {
  validateBoundedArray(value, label, { maximumItems: 128 });
  value.forEach((entry, index) => validateRef(entry, `${label}[${index}]`));
}

export function validateCheckReceipt(value) {
  exactKeys(value, CHECK_KEYS, 'check receipt');
  if (value.schemaVersion !== 1) fail('VERIFICATION_UNSUPPORTED', 'check receipt version is unsupported');
  validateControllerId(value.receiptId, 'check receipt.receiptId');
  validateBinding(value.binding, 'check receipt.binding');
  validateControllerId(value.checkId, 'check receipt.checkId');
  validateDigest(value.catalogDigest, 'check receipt.catalogDigest');
  validateControllerId(value.candidateId, 'check receipt.candidateId');
  oid(value.candidateTree, 'check receipt.candidateTree');
  for (const field of ['inputScopeDigest', 'commandDigest', 'environmentDigest', 'resourcesDigest']) {
    validateDigest(value[field], `check receipt.${field}`);
  }
  if (!CHECK_OUTCOMES.includes(value.outcome)) fail('VERIFICATION_INVALID', 'check receipt.outcome is invalid');
  exitCode(value.exitCode);
  if (value.outcome === 'pass' && value.exitCode !== 0) {
    fail('VERIFICATION_INVALID', 'passing check receipt requires exit code zero');
  }
  if (value.outcome === 'not_run' || value.outcome === 'not_applicable') {
    if (value.exitCode !== null) fail('VERIFICATION_INVALID', 'unexecuted check receipt cannot have an exit code');
  }
  refs(value.evidence, 'check receipt.evidence');
  const startedAt = Date.parse(validateTimestamp(value.startedAt, 'check receipt.startedAt'));
  const completedAt = Date.parse(validateTimestamp(value.completedAt, 'check receipt.completedAt'));
  if (completedAt < startedAt) fail('VERIFICATION_INVALID', 'check receipt completed before it started');
  return value;
}

export function validateCheckRequirement(value) {
  exactKeys(value, REQUIREMENT_KEYS, 'check requirement');
  validateControllerId(value.checkId, 'check requirement.checkId');
  validateDigest(value.catalogDigest, 'check requirement.catalogDigest');
  validateControllerId(value.candidateId, 'check requirement.candidateId');
  oid(value.candidateTree, 'check requirement.candidateTree');
  for (const field of ['inputScopeDigest', 'commandDigest', 'environmentDigest', 'resourcesDigest']) {
    validateDigest(value[field], `check requirement.${field}`);
  }
  return value;
}

export function checkReceiptSatisfies(receipt, requirement, currentBinding) {
  validateCheckReceipt(receipt);
  validateCheckRequirement(requirement);
  validateBinding(currentBinding, 'current binding');
  if (!bindingAuthorizesEffect(currentBinding, receipt.binding)) return false;
  return receipt.outcome === 'pass' && REQUIREMENT_KEYS.every((field) => receipt[field] === requirement[field]);
}

export function evaluateVerificationGate({ requirements, receipts, currentBinding }) {
  validateBoundedArray(requirements, 'verification requirements', { maximumItems: 128 });
  validateBoundedArray(receipts, 'verification receipts', { maximumItems: 128 });
  validateBinding(currentBinding, 'current binding');
  const expected = new Map();
  for (const requirement of requirements) {
    validateCheckRequirement(requirement);
    if (expected.has(requirement.checkId)) fail('VERIFICATION_CONFLICT', 'check requirement is duplicated');
    expected.set(requirement.checkId, requirement);
  }
  const observed = new Map();
  for (const receipt of receipts) {
    validateCheckReceipt(receipt);
    if (observed.has(receipt.checkId)) fail('VERIFICATION_CONFLICT', 'check receipt is duplicated');
    observed.set(receipt.checkId, receipt);
  }
  const missing = [];
  const stale = [];
  const failed = [];
  const passed = [];
  for (const [checkId, requirement] of expected) {
    const receipt = observed.get(checkId);
    if (receipt === undefined || ['not_run', 'not_applicable'].includes(receipt.outcome)) {
      missing.push(checkId);
    } else if (!bindingAuthorizesEffect(currentBinding, receipt.binding) ||
        !REQUIREMENT_KEYS.every((field) => receipt[field] === requirement[field])) {
      stale.push(checkId);
    } else if (receipt.outcome === 'fail') {
      failed.push(checkId);
    } else if (receipt.outcome === 'pass') {
      passed.push(checkId);
    }
  }
  const disposition = failed.length > 0 ? 'correction_required' :
    missing.length > 0 || stale.length > 0 ? 'incomplete' : 'passed';
  return Object.freeze({
    disposition,
    passed: Object.freeze(passed.sort()),
    failed: Object.freeze(failed.sort()),
    missing: Object.freeze(missing.sort()),
    stale: Object.freeze(stale.sort()),
    gateDigest: canonicalDigest({ requirements, passed, failed, missing, stale }),
  });
}

export function planCorrectionGeneration({ currentGeneration, gate, affectedCheckIds }) {
  if (!Number.isSafeInteger(currentGeneration) || currentGeneration < 0 ||
      !plainObject(gate) || gate.disposition !== 'correction_required') {
    fail('CORRECTION_INVALID', 'correction generation requires a failed verification gate');
  }
  validateBoundedArray(affectedCheckIds, 'affected check IDs', { maximumItems: 128 });
  const affected = [...new Set(affectedCheckIds)].sort();
  for (const checkId of affected) validateControllerId(checkId, 'affected check ID');
  if (affected.length === 0 || gate.failed.some((checkId) => !affected.includes(checkId))) {
    fail('CORRECTION_INVALID', 'correction must stale every failed check');
  }
  return Object.freeze({
    correctionGeneration: currentGeneration + 1,
    staleCheckIds: Object.freeze(affected),
  });
}

export function validateResourceReceipt(value) {
  exactKeys(value, RESOURCE_KEYS, 'resource receipt');
  if (value.schemaVersion !== 1) fail('VERIFICATION_UNSUPPORTED', 'resource receipt version is unsupported');
  validateControllerId(value.receiptId, 'resource receipt.receiptId');
  validateBinding(value.binding, 'resource receipt.binding');
  validateControllerId(value.attemptId, 'resource receipt.attemptId');
  validateResourceClaim({ key: value.resourceKey, mode: 'exclusive', namespace: null },
    'resource receipt resource');
  if (!RESOURCE_ACTIONS.includes(value.action) || !RESOURCE_OUTCOMES.includes(value.outcome)) {
    fail('VERIFICATION_INVALID', 'resource receipt action or outcome is invalid');
  }
  nullableDigest(value.ownershipTokenDigest, 'resource receipt.ownershipTokenDigest');
  nullableDigest(value.observedIdentityDigest, 'resource receipt.observedIdentityDigest');
  refs(value.evidence, 'resource receipt.evidence');
  validateTimestamp(value.observedAt, 'resource receipt.observedAt');
  return value;
}

export function deriveResourceNamespace({ runId, assignmentId, attemptId, resourceKey }) {
  for (const [label, value] of Object.entries({ runId, assignmentId, attemptId })) {
    validateControllerId(value, label);
  }
  validateResourceClaim({ key: resourceKey, mode: 'exclusive', namespace: null }, 'resource key');
  const suffix = canonicalDigest({ runId, assignmentId, attemptId, resourceKey }).slice(7, 19);
  return `mf_${runId}_${assignmentId}_${attemptId}_${suffix}`;
}

export function evaluateCollisionEvidence(events) {
  validateBoundedArray(events, 'resource collision evidence', { maximumItems: 128 });
  const serializedKeys = new Set();
  const classCounts = new Map();
  let policyReviewRequired = false;
  for (const event of events) {
    exactKeys(event, ['resourceKey', 'resourceClass', 'kind', 'concurrentFailed', 'sequentialPassed', 'corroborated'],
      'resource collision evidence');
    validateResourceClaim({ key: event.resourceKey, mode: 'exclusive', namespace: null }, 'collision resource');
    validateControllerId(event.resourceClass, 'resource class');
    if (!['collision', 'corruption', 'security', 'external_data'].includes(event.kind) ||
        typeof event.concurrentFailed !== 'boolean' || typeof event.sequentialPassed !== 'boolean' ||
        typeof event.corroborated !== 'boolean') {
      fail('VERIFICATION_INVALID', 'resource collision evidence is invalid');
    }
    if (!event.corroborated) continue;
    if (event.kind !== 'collision') policyReviewRequired = true;
    if (event.kind === 'collision' && event.concurrentFailed && event.sequentialPassed) {
      serializedKeys.add(event.resourceKey);
      const count = (classCounts.get(event.resourceClass) ?? 0) + 1;
      classCounts.set(event.resourceClass, count);
      if (count >= 2) policyReviewRequired = true;
    }
  }
  return Object.freeze({
    serializedKeys: Object.freeze([...serializedKeys].sort()),
    policyReviewRequired,
  });
}

export function resourceCleanupAuthorizesEffect({ receipt, currentBinding, expected }) {
  validateResourceReceipt(receipt);
  validateBinding(currentBinding, 'current binding');
  exactKeys(expected, ['attemptId', 'resourceKey', 'ownershipTokenDigest', 'observedIdentityDigest', 'processDomainEmpty'],
    'resource cleanup expectation');
  validateControllerId(expected.attemptId, 'resource cleanup attemptId');
  validateResourceClaim({ key: expected.resourceKey, mode: 'exclusive', namespace: null }, 'cleanup resource');
  validateDigest(expected.ownershipTokenDigest, 'resource cleanup ownershipTokenDigest');
  validateDigest(expected.observedIdentityDigest, 'resource cleanup observedIdentityDigest');
  if (typeof expected.processDomainEmpty !== 'boolean') fail('VERIFICATION_INVALID', 'cleanup process state is invalid');
  return bindingAuthorizesEffect(currentBinding, receipt.binding) && receipt.action === 'allocate' &&
    receipt.outcome === 'succeeded' && receipt.attemptId === expected.attemptId &&
    receipt.resourceKey === expected.resourceKey &&
    receipt.ownershipTokenDigest === expected.ownershipTokenDigest &&
    receipt.observedIdentityDigest === expected.observedIdentityDigest && expected.processDomainEmpty;
}
