import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMPLEMENTATION_ACTIVATION_CODES,
  IMPLEMENTATION_ACTIVATION_DISPOSITION,
  IMPLEMENTATION_ACTIVATION_VERSION,
  IMPLEMENTATION_EFFECT_KINDS,
  IMPLEMENTATION_NON_EFFECT_OPERATIONS,
  ImplementationActivationError,
  authorizeImplementationOperation,
  validateActivationReceipt,
} from '../lib/implementation-activation.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({
  runId: 'run_0054',
  epoch: 3,
  taskId: 'T-0054',
  taskRevision: 2,
  taskRecordVersion: 4,
  capsuleDigest: digest('a'),
  controlGeneration: 1,
  correctionGeneration: 2,
});
const mechanism = IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism;

function approval() {
  return {
    approvalId: 'canary_approval_1',
    status: 'granted',
    source: 'Product owner instruction recorded in the task store.',
    action: 'live_canary',
    boundary: 'One effect-bounded disposable canary for T-0054 revision 2.',
    boundTaskRevision: binding.taskRevision,
    gateDigest: digest('d'),
  };
}

function receipt(effectKind = 'ledger_write', overrides = {}) {
  return {
    schemaVersion: 1,
    receiptId: `activation_${effectKind}`,
    effectKind,
    binding: { ...binding },
    policyDigest: digest('b'),
    evidenceDigest: digest('c'),
    mechanism: { ...mechanism },
    issuedAt: '2026-08-14T10:00:00Z',
    expiresAt: '2026-08-14T10:15:00Z',
    taskApproval: effectKind === 'live_canary' ? approval() : null,
    ...overrides,
  };
}

function context(value) {
  return {
    receiptId: value.receiptId,
    binding: { ...value.binding },
    policyDigest: value.policyDigest,
    evidenceDigest: value.evidenceDigest,
    mechanism: { ...value.mechanism },
    taskApproval: value.taskApproval === null ? null : { ...value.taskApproval },
  };
}

function authorize(value, overrides = {}) {
  return authorizeImplementationOperation({
    operationKind: value.effectKind,
    receipt: value,
    current: context(value),
    now: '2026-08-14T10:05:00Z',
    ...overrides,
  });
}

test('offline disposition is a frozen closed inventory with no default effect authorization', () => {
  assert.equal(IMPLEMENTATION_ACTIVATION_VERSION, 1);
  assert.deepEqual(IMPLEMENTATION_ACTIVATION_DISPOSITION, {
    schemaVersion: 1,
    mode: 'offline_fail_closed',
    defaultEffectAuthorization: 'disabled',
    operationsWithoutReceipt: ['read', 'status', 'events', 'doctor', 'shadow'],
    supportedMechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
  });
  assert.equal(Object.isFrozen(IMPLEMENTATION_ACTIVATION_DISPOSITION), true);
  assert.equal(Object.isFrozen(IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism), true);
  assert.equal(Object.isFrozen(IMPLEMENTATION_EFFECT_KINDS), true);
  assert.equal(Object.isFrozen(IMPLEMENTATION_NON_EFFECT_OPERATIONS), true);
  assert.deepEqual(IMPLEMENTATION_EFFECT_KINDS, [
    'ledger_write', 'provider_launch', 'workspace_write', 'git_admin', 'signal',
    'task_mutation', 'cleanup', 'final_ref', 'live_canary',
  ]);
});

test('only explicit non-effect operations are reachable without a receipt', () => {
  for (const operationKind of IMPLEMENTATION_NON_EFFECT_OPERATIONS) {
    assert.deepEqual(authorizeImplementationOperation({ operationKind }), {
      authorized: true,
      code: 'NON_EFFECT_OPERATION',
      operationKind,
      effectKind: null,
    });
  }
  for (const operationKind of IMPLEMENTATION_EFFECT_KINDS) {
    assert.deepEqual(authorizeImplementationOperation({ operationKind }), {
      authorized: false,
      code: 'ACTIVATION_DISABLED',
      operationKind,
      effectKind: operationKind,
    });
  }
  assert.equal(authorizeImplementationOperation({ operationKind: 'start' }).code,
    IMPLEMENTATION_ACTIVATION_CODES.operationUnknown);
  assert.equal(authorizeImplementationOperation().code,
    IMPLEMENTATION_ACTIVATION_CODES.operationUnknown);
});

test('closed versioned receipt validation rejects partial, unknown, and unsupported shapes', () => {
  const valid = receipt();
  assert.equal(validateActivationReceipt(valid), valid);
  assert.throws(() => validateActivationReceipt({}), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
  assert.throws(() => validateActivationReceipt({ ...valid, modelClaim: 'authorized' }), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
  assert.throws(() => validateActivationReceipt({ ...valid, schemaVersion: 2 }), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptUnsupported);
  assert.throws(() => validateActivationReceipt({ ...valid, effectKind: 'shell' }), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
  assert.throws(() => validateActivationReceipt({ ...valid, expiresAt: null }), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
  assert.throws(() => validateActivationReceipt({ ...valid, expiresAt: valid.issuedAt }), (error) =>
    error instanceof ImplementationActivationError &&
    error.code === IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
});

test('a current recognized receipt authorizes only its exact effect kind', () => {
  for (const effectKind of IMPLEMENTATION_EFFECT_KINDS) {
    const value = receipt(effectKind);
    assert.deepEqual(authorize(value), {
      authorized: true,
      code: 'ACTIVATION_AUTHORIZED',
      operationKind: effectKind,
      effectKind,
    });
  }
  const value = receipt('ledger_write');
  assert.equal(authorize(value, { operationKind: 'git_admin' }).code,
    IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
});

test('every authority binding field is current and stale evidence fails closed', () => {
  const mutations = {
    runId: 'another_run',
    epoch: binding.epoch + 1,
    taskId: 'T-0055',
    taskRevision: binding.taskRevision + 1,
    taskRecordVersion: binding.taskRecordVersion + 1,
    capsuleDigest: digest('e'),
    controlGeneration: binding.controlGeneration + 1,
    correctionGeneration: binding.correctionGeneration + 1,
  };
  for (const [field, staleValue] of Object.entries(mutations)) {
    const value = receipt();
    const current = context(value);
    current.binding[field] = staleValue;
    assert.equal(authorize(value, { current }).code, IMPLEMENTATION_ACTIVATION_CODES.stale, field);
  }
});

test('unrecognized, conflicting, and unsupported evidence cannot activate an effect', () => {
  const value = receipt();
  assert.equal(authorize(value, { current: { ...context(value), receiptId: 'activation_other' } }).code,
    IMPLEMENTATION_ACTIVATION_CODES.receiptUnrecognized);
  assert.equal(authorize(value, { current: { ...context(value), policyDigest: digest('e') } }).code,
    IMPLEMENTATION_ACTIVATION_CODES.policyConflict);
  assert.equal(authorize(value, { current: { ...context(value), evidenceDigest: digest('f') } }).code,
    IMPLEMENTATION_ACTIVATION_CODES.evidenceConflict);

  const unsupported = receipt('ledger_write', {
    mechanism: { ...mechanism, filesystem: 'network' },
  });
  assert.equal(authorize(unsupported).code, IMPLEMENTATION_ACTIVATION_CODES.mechanismUnsupported);

  const current = context(value);
  current.mechanism = { ...mechanism, process: 'cgroup_v2' };
  assert.equal(authorize(value, { current }).code, IMPLEMENTATION_ACTIVATION_CODES.mechanismUnsupported);
  assert.equal(authorize(value, { current: null }).code,
    IMPLEMENTATION_ACTIVATION_CODES.contextInvalid);
});

test('receipts fail closed before issuance and at or after exact expiry', () => {
  const value = receipt();
  assert.equal(authorize(value, { now: '2026-08-14T09:59:59Z' }).code,
    IMPLEMENTATION_ACTIVATION_CODES.notYetValid);
  assert.equal(authorize(value, { now: value.expiresAt }).code,
    IMPLEMENTATION_ACTIVATION_CODES.expired);
  assert.equal(authorize(value, { now: '2026-08-14T10:15:01Z' }).code,
    IMPLEMENTATION_ACTIVATION_CODES.expired);
  assert.equal(authorize(value, { now: null }).code,
    IMPLEMENTATION_ACTIVATION_CODES.contextInvalid);
});

test('live canary requires matching explicit current task approval for the exact revision', () => {
  const value = receipt('live_canary');
  assert.equal(authorize(value).authorized, true);
  assert.equal(authorize(value, {
    current: { ...context(value), taskApproval: null },
  }).code, IMPLEMENTATION_ACTIVATION_CODES.approvalRequired);

  const withoutApproval = receipt('live_canary', { taskApproval: null });
  assert.equal(authorize(withoutApproval).code, IMPLEMENTATION_ACTIVATION_CODES.approvalRequired);

  const changedApproval = context(value);
  changedApproval.taskApproval.gateDigest = digest('e');
  assert.equal(authorize(value, { current: changedApproval }).code,
    IMPLEMENTATION_ACTIVATION_CODES.approvalConflict);

  const wrongRevision = receipt('live_canary');
  wrongRevision.taskApproval.boundTaskRevision += 1;
  assert.equal(authorize(wrongRevision).code, IMPLEMENTATION_ACTIVATION_CODES.approvalConflict);

  assert.equal(authorize(value, {
    current: { ...context(value), taskApproval: { ...approval(), status: 'pending' } },
  }).code, IMPLEMENTATION_ACTIVATION_CODES.contextInvalid);
});

test('unknown fields in current evidence and receipt-shaped model claims fail closed', () => {
  const value = receipt();
  assert.equal(authorize(value, {
    current: { ...context(value), modelOutput: { authorized: true } },
  }).code, IMPLEMENTATION_ACTIVATION_CODES.contextInvalid);
  assert.equal(authorize({ ...value, promptAuthorization: true }).code,
    IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
  assert.equal(authorizeImplementationOperation({
    operationKind: 'ledger_write',
    receipt: { modelSays: 'approved' },
    current: context(value),
    now: '2026-08-14T10:05:00Z',
  }).code, IMPLEMENTATION_ACTIVATION_CODES.receiptInvalid);
});
