import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkReceiptSatisfies,
  deriveResourceNamespace,
  evaluateCollisionEvidence,
  evaluateVerificationGate,
  planCorrectionGeneration,
  resourceCleanupAuthorizesEffect,
  validateCheckReceipt,
  validateResourceReceipt,
} from '../lib/implementation-verification.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const tree = (character) => character.repeat(40);
const binding = Object.freeze({
  runId: 'run_54', epoch: 1, snapshotRevision: 4, taskId: 'T-0054', taskRevision: 2,
  taskRecordVersion: 5, capsuleDigest: digest('a'), controlGeneration: 0,
  correctionGeneration: 0,
});
const evidence = Object.freeze({ kind: 'evidence', id: 'evidence_1', digest: digest('e') });

function requirement(overrides = {}) {
  return {
    checkId: 'unit_tests', catalogDigest: digest('b'), candidateId: 'candidate_1',
    candidateTree: tree('1'), inputScopeDigest: digest('c'), commandDigest: digest('d'),
    environmentDigest: digest('e'), resourcesDigest: digest('f'), ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1, receiptId: 'check_receipt_1', binding: { ...binding },
    ...requirement(), outcome: 'pass', exitCode: 0, evidence: [{ ...evidence }],
    startedAt: '2026-08-14T10:00:00Z', completedAt: '2026-08-14T10:00:01Z',
    ...overrides,
  };
}

function resourceReceipt(overrides = {}) {
  return {
    schemaVersion: 1, receiptId: 'resource_receipt_1', binding: { ...binding },
    attemptId: 'attempt_1', resourceKey: 'database:test', action: 'allocate',
    ownershipTokenDigest: digest('1'), observedIdentityDigest: digest('2'),
    outcome: 'succeeded', evidence: [{ ...evidence }], observedAt: '2026-08-14T10:00:00Z',
    ...overrides,
  };
}

test('check receipts are closed, candidate-bound, and chronologically valid', () => {
  const value = receipt();
  assert.equal(validateCheckReceipt(value), value);
  assert.equal(checkReceiptSatisfies(value, requirement(), binding), true);
  assert.equal(checkReceiptSatisfies(value, requirement({ candidateTree: tree('2') }), binding), false);
  assert.equal(checkReceiptSatisfies(value, requirement(), { ...binding, taskRevision: 3 }), false);
  assert.throws(() => validateCheckReceipt({ ...value, modelVerdict: 'trusted' }), /unknown or missing/u);
  assert.throws(() => validateCheckReceipt({ ...value, outcome: 'pass', exitCode: 1 }), /exit code zero/u);
  assert.throws(() => validateCheckReceipt({
    ...value, startedAt: '2026-08-14T10:00:02Z', completedAt: '2026-08-14T10:00:01Z',
  }), /completed before/u);
});

test('verification gates separate passing, missing, stale, and correction evidence', () => {
  const required = [requirement(), requirement({ checkId: 'package_tests', commandDigest: digest('1') })];
  const first = receipt();
  assert.deepEqual(evaluateVerificationGate({ requirements: required, receipts: [first], currentBinding: binding }), {
    disposition: 'incomplete', passed: ['unit_tests'], failed: [], missing: ['package_tests'], stale: [],
    gateDigest: evaluateVerificationGate({ requirements: required, receipts: [first], currentBinding: binding }).gateDigest,
  });
  const stale = receipt({ receiptId: 'check_receipt_2', checkId: 'package_tests', commandDigest: digest('9') });
  const staleGate = evaluateVerificationGate({ requirements: required, receipts: [first, stale], currentBinding: binding });
  assert.equal(staleGate.disposition, 'incomplete');
  assert.deepEqual(staleGate.stale, ['package_tests']);
  const failed = receipt({ receiptId: 'check_receipt_2', checkId: 'package_tests', commandDigest: digest('1'), outcome: 'fail', exitCode: 1 });
  const failedGate = evaluateVerificationGate({ requirements: required, receipts: [first, failed], currentBinding: binding });
  assert.equal(failedGate.disposition, 'correction_required');
  assert.deepEqual(planCorrectionGeneration({
    currentGeneration: 0, gate: failedGate, affectedCheckIds: ['package_tests'],
  }), { correctionGeneration: 1, staleCheckIds: ['package_tests'] });
  assert.throws(() => planCorrectionGeneration({
    currentGeneration: 0, gate: failedGate, affectedCheckIds: ['unit_tests'],
  }), /stale every failed check/u);
});

test('exact matching pass receipts complete the candidate gate and duplicates fail closed', () => {
  const requirements = [requirement(), requirement({ checkId: 'package_tests', commandDigest: digest('1') })];
  const receipts = [receipt(), receipt({ receiptId: 'check_receipt_2', checkId: 'package_tests', commandDigest: digest('1') })];
  assert.equal(evaluateVerificationGate({ requirements, receipts, currentBinding: binding }).disposition, 'passed');
  assert.throws(() => evaluateVerificationGate({
    requirements, receipts: [receipts[0], { ...receipts[0], receiptId: 'check_receipt_3' }], currentBinding: binding,
  }), /duplicated/u);
});

test('resource receipts and namespaces bind exact controller-created identities', () => {
  const value = resourceReceipt();
  assert.equal(validateResourceReceipt(value), value);
  const namespace = deriveResourceNamespace({
    runId: 'run_54', assignmentId: 'assignment_1', attemptId: 'attempt_1', resourceKey: 'database:test',
  });
  assert.match(namespace, /^mf_run_54_assignment_1_attempt_1_[0-9a-f]{12}$/u);
  assert.equal(namespace, deriveResourceNamespace({
    runId: 'run_54', assignmentId: 'assignment_1', attemptId: 'attempt_1', resourceKey: 'database:test',
  }));
  const expected = {
    attemptId: 'attempt_1', resourceKey: 'database:test', ownershipTokenDigest: digest('1'),
    observedIdentityDigest: digest('2'), processDomainEmpty: true,
  };
  assert.equal(resourceCleanupAuthorizesEffect({ receipt: value, currentBinding: binding, expected }), true);
  assert.equal(resourceCleanupAuthorizesEffect({
    receipt: value, currentBinding: binding, expected: { ...expected, processDomainEmpty: false },
  }), false);
  assert.equal(resourceCleanupAuthorizesEffect({
    receipt: value, currentBinding: binding, expected: { ...expected, observedIdentityDigest: digest('3') },
  }), false);
});

test('collision evidence serializes only proved keys and escalates repeated classes or severe events', () => {
  const event = {
    resourceKey: 'database:test', resourceClass: 'database', kind: 'collision',
    concurrentFailed: true, sequentialPassed: true, corroborated: true,
  };
  assert.deepEqual(evaluateCollisionEvidence([event]), {
    serializedKeys: ['database:test'], policyReviewRequired: false,
  });
  assert.deepEqual(evaluateCollisionEvidence([
    event,
    { ...event, resourceKey: 'database:other' },
  ]), {
    serializedKeys: ['database:other', 'database:test'], policyReviewRequired: true,
  });
  assert.equal(evaluateCollisionEvidence([{
    ...event, kind: 'security', concurrentFailed: false, sequentialPassed: false,
  }]).policyReviewRequired, true);
  assert.deepEqual(evaluateCollisionEvidence([{ ...event, corroborated: false }]).serializedKeys, []);
});
