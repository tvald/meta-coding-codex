import {
  ingestAttemptCandidate,
  integratePrivateCandidate,
  validateImplementationCandidate,
} from './implementation-git.mjs';
import { validateFinalizationPlan } from './implementation-finalization.mjs';
import {
  canonicalDigest,
  validateBinding,
  validateDigest,
  validateOperation,
  validateRef,
  validateRepositoryPath,
  validateProtocolValue,
} from './implementation-protocol.mjs';
import {
  evaluateVerificationGate,
  planCorrectionGeneration,
  validateCheckReceipt,
  validateCheckRequirement,
} from './implementation-verification.mjs';
import { classifyProcessDomain } from './implementation-provider.mjs';
import {
  DEFAULT_PROTECTED_PATHS,
  effectiveProtectedPaths,
  inspectAttemptChangesWithProcessEvidence,
} from './implementation-workspace.mjs';

export const IMPLEMENTATION_PIPELINE_VERSION = 1;

export class ImplementationPipelineError extends Error {
  constructor(code, message, { reconciliationRequired = false } = {}) {
    super(message);
    this.name = 'ImplementationPipelineError';
    this.code = code;
    this.reconciliationRequired = reconciliationRequired;
  }
}

function fail(code, message, options) {
  throw new ImplementationPipelineError(code, message, options);
}

function reconcile(code, message) {
  fail(code, message, { reconciliationRequired: true });
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('PIPELINE_OPERATION_INVALID', `${label} is invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('PIPELINE_OPERATION_INVALID', `${label} has unknown or missing fields`);
  }
}

function frozen(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function validatePort(port) {
  if (!plainObject(port) || typeof port.publish !== 'function' || typeof port.read !== 'function') {
    fail('PIPELINE_PORT_INVALID',
      'implementation pipeline requires an async journal reader and publisher');
  }
}

function validateClock(now) {
  if (typeof now !== 'function') fail('PIPELINE_PORT_INVALID', 'implementation pipeline clock is invalid');
}

function frozenRef(kind, id, value) {
  const ref = Object.freeze({ kind, id, digest: canonicalDigest(value) });
  validateRef(ref);
  return ref;
}

async function publish(journal, kind, id, value) {
  const result = await journal.publish(kind, id, value);
  if (!plainObject(result) || !plainObject(result.ref) || result.ref.kind !== kind ||
      result.ref.id !== id || result.ref.digest !== canonicalDigest(value)) {
    fail('PIPELINE_JOURNAL_MISMATCH',
      'journal publication did not bind the exact pipeline record');
  }
  return Object.freeze({ value, ref: Object.freeze({ ...result.ref }) });
}

async function read(journal, kind, id) {
  const result = await journal.read(kind, id);
  if (result === null) return null;
  if (!plainObject(result) || !plainObject(result.value) || !plainObject(result.ref) ||
      result.ref.kind !== kind || result.ref.id !== id ||
      result.ref.digest !== canonicalDigest(result.value)) {
    reconcile('PIPELINE_JOURNAL_MISMATCH',
      'journal read did not bind the exact pipeline record');
  }
  return Object.freeze({ value: result.value, ref: Object.freeze({ ...result.ref }) });
}

function operationId(kind, idempotencyKey) {
  return `operation_${canonicalDigest({ kind, idempotencyKey }).slice(7, 31)}`;
}

function operationInvariant(operation) {
  return {
    idempotencyKey: operation.idempotencyKey,
    kind: operation.kind,
    subject: operation.subject,
    binding: operation.binding,
    inputDigest: operation.inputDigest,
    expected: operation.expected,
  };
}

function sameOperation(left, right) {
  return canonicalDigest(operationInvariant(left)) === canonicalDigest(operationInvariant(right));
}

function makeOperation(specification, {
  recordVersion,
  previousDigest,
  state,
  attemptNumber,
  receipt = null,
  failureCode = null,
  observedAt,
}) {
  const operation = Object.freeze({
    schemaVersion: IMPLEMENTATION_PIPELINE_VERSION,
    operationId: specification.operationId,
    recordVersion,
    previousDigest,
    idempotencyKey: specification.idempotencyKey,
    kind: specification.kind,
    subject: specification.subject,
    binding: specification.binding,
    inputDigest: specification.inputDigest,
    expected: specification.expected,
    state,
    attemptNumber,
    receipt,
    observedAt,
    failureCode,
  });
  try {
    validateOperation(operation);
  } catch (error) {
    fail('PIPELINE_OPERATION_INVALID', `pipeline operation is invalid: ${error.message}`);
  }
  return operation;
}

async function transition(journal, prior, specification, changes, now) {
  const next = makeOperation(specification, {
    recordVersion: prior.recordVersion + 1,
    previousDigest: canonicalDigest(prior),
    state: changes.state,
    attemptNumber: changes.attemptNumber ?? prior.attemptNumber,
    receipt: changes.receipt ?? null,
    failureCode: changes.failureCode ?? null,
    observedAt: now(),
  });
  return (await publish(journal, 'operation', next.operationId, next)).value;
}

async function beginOperation(journal, specification, now) {
  const existing = await read(journal, 'operation', specification.operationId);
  if (existing !== null) {
    try { validateOperation(existing.value); } catch {
      reconcile('PIPELINE_OPERATION_CORRUPT', 'persisted pipeline operation is invalid');
    }
    const proposed = makeOperation(specification, {
      recordVersion: 1,
      previousDigest: null,
      state: 'intended',
      attemptNumber: 0,
      observedAt: existing.value.observedAt,
    });
    if (!sameOperation(existing.value, proposed)) {
      reconcile('PIPELINE_OPERATION_CONFLICT',
        'idempotency key is already bound to different operation input');
    }
    return existing.value;
  }
  const intended = makeOperation(specification, {
    recordVersion: 1,
    previousDigest: null,
    state: 'intended',
    attemptNumber: 0,
    observedAt: now(),
  });
  return (await publish(journal, 'operation', intended.operationId, intended)).value;
}

async function readReceipt(journal, locator, exactRef = null) {
  const found = await read(journal, locator.kind, locator.id);
  if (found === null) return null;
  if (exactRef !== null && found.ref.digest !== exactRef.digest) {
    reconcile('PIPELINE_RECEIPT_CONFLICT', 'operation receipt changed after publication');
  }
  return found;
}

function validatePostconditionObservation(observation, locator, acceptedReceiptIds) {
  if (!plainObject(observation) ||
      !['succeeded', 'failed', 'absent', 'ambiguous'].includes(observation.outcome)) {
    reconcile('PIPELINE_POSTCONDITION_INVALID',
      'postcondition observer returned an invalid observation');
  }
  if (observation.outcome === 'succeeded') {
    if (!plainObject(observation.record) || observation.record.kind !== locator.kind ||
        !acceptedReceiptIds.includes(observation.record.id) || !plainObject(observation.record.value)) {
      reconcile('PIPELINE_POSTCONDITION_INVALID',
        'successful postcondition observation did not bind the expected receipt');
    }
  } else if (observation.record !== undefined) {
    reconcile('PIPELINE_POSTCONDITION_INVALID',
      'non-successful postcondition observation supplied a receipt');
  }
  return observation;
}

async function classifyUncertainOperation({
  journal,
  operation,
  specification,
  locator,
  context,
  observePostcondition,
  acceptedReceiptIds,
  now,
  effectFailed = false,
}) {
  const durable = await readReceipt(journal, locator);
  if (durable !== null) {
    const terminal = await transition(journal, operation, specification, {
      state: 'observed_succeeded', receipt: durable.ref,
    }, now);
    return Object.freeze({ operation: terminal, output: durable, recovered: true });
  }

  if (typeof observePostcondition !== 'function') {
    if (operation.state !== 'ambiguous') {
      operation = await transition(journal, operation, specification, {
        state: 'ambiguous', failureCode: 'postcondition_unknown',
      }, now);
    }
    reconcile('PIPELINE_OPERATION_RECONCILIATION',
      'operation postcondition is unknown and requires reconciliation');
  }

  let observation;
  try {
    observation = validatePostconditionObservation(await observePostcondition(Object.freeze({
      operation,
      context,
      expectedReceipt: Object.freeze({ ...locator }),
    })), locator, acceptedReceiptIds);
  } catch (error) {
    if (error instanceof ImplementationPipelineError) throw error;
    if (operation.state !== 'ambiguous') {
      await transition(journal, operation, specification, {
        state: 'ambiguous', failureCode: 'postcondition_unknown',
      }, now);
    }
    reconcile('PIPELINE_OPERATION_RECONCILIATION',
      'postcondition observer failed and operation ownership is unknown');
  }

  if (observation.outcome === 'succeeded') {
    const output = await publish(journal, observation.record.kind,
      observation.record.id, Object.freeze(observation.record.value));
    const terminal = await transition(journal, operation, specification, {
      state: 'observed_succeeded', receipt: output.ref,
    }, now);
    return Object.freeze({ operation: terminal, output, recovered: true });
  }

  if (observation.outcome === 'failed') {
    await transition(journal, operation, specification, {
      state: 'observed_failed', failureCode: 'effect_failed',
    }, now);
    fail('PIPELINE_OPERATION_FAILED', 'operation postcondition proves failure');
  }

  if (observation.outcome === 'absent') {
    if (effectFailed) {
      await transition(journal, operation, specification, {
        state: 'observed_failed', failureCode: 'effect_failed',
      }, now);
      fail('PIPELINE_OPERATION_FAILED', 'operation effect failed without a postcondition');
    }
    if (operation.state !== 'ambiguous') {
      operation = await transition(journal, operation, specification, {
        state: 'ambiguous', failureCode: 'effect_not_observed',
      }, now);
    }
    await transition(journal, operation, specification, {
      state: 'abandoned', failureCode: 'effect_not_observed',
    }, now);
    fail('PIPELINE_OPERATION_ABANDONED',
      'operation was proved absent and abandoned instead of being repeated');
  }

  if (operation.state !== 'ambiguous') {
    await transition(journal, operation, specification, {
      state: 'ambiguous', failureCode: 'postcondition_unknown',
    }, now);
  }
  reconcile('PIPELINE_OPERATION_RECONCILIATION',
    'operation postcondition is ambiguous and requires reconciliation');
}

async function executeOperation({
  journal,
  kind,
  binding,
  subject,
  input,
  expected,
  idempotencyKey,
  locator,
  context,
  preflight = null,
  effect,
  observePostcondition,
  acceptedReceiptIds = Object.freeze([locator.id]),
  now,
}) {
  validateBinding(binding);
  validateRef(subject);
  expected.forEach((ref) => validateRef(ref));
  if (!Array.isArray(acceptedReceiptIds) || acceptedReceiptIds.length < 1 ||
      !acceptedReceiptIds.includes(locator.id) || new Set(acceptedReceiptIds).size !== acceptedReceiptIds.length) {
    fail('PIPELINE_OPERATION_INVALID', 'operation receipt identity policy is invalid');
  }
  const specification = Object.freeze({
    operationId: operationId(kind, idempotencyKey),
    idempotencyKey,
    kind,
    subject: Object.freeze({ ...subject }),
    binding: Object.freeze({ ...binding }),
    inputDigest: canonicalDigest(input),
    expected: Object.freeze(expected.map((ref) => Object.freeze({ ...ref }))),
  });

  let operation = await beginOperation(journal, specification, now);
  if (operation.state === 'observed_succeeded') {
    if (operation.receipt === null) {
      reconcile('PIPELINE_OPERATION_CORRUPT', 'successful operation has no receipt');
    }
    if (operation.receipt.kind !== locator.kind ||
        !acceptedReceiptIds.includes(operation.receipt.id)) {
      reconcile('PIPELINE_OPERATION_CORRUPT',
        'successful operation names an unexpected receipt identity');
    }
    const output = await readReceipt(journal, operation.receipt, operation.receipt);
    if (output === null) reconcile('PIPELINE_RECEIPT_MISSING', 'successful operation receipt is missing');
    return Object.freeze({ operation, output, recovered: true });
  }
  if (operation.state === 'observed_failed') {
    fail('PIPELINE_OPERATION_FAILED', 'operation previously reached an observed failure');
  }
  if (operation.state === 'abandoned') {
    fail('PIPELINE_OPERATION_ABANDONED', 'operation was previously abandoned');
  }
  if (operation.state === 'started' || operation.state === 'ambiguous') {
    return classifyUncertainOperation({ journal, operation, specification, locator, context,
      observePostcondition, acceptedReceiptIds, now });
  }
  if (operation.state !== 'intended') {
    reconcile('PIPELINE_OPERATION_CORRUPT', 'operation has an unsupported nonterminal state');
  }

  if (preflight !== null) {
    if (typeof preflight !== 'function') {
      fail('PIPELINE_OPERATION_INVALID', 'operation preflight is invalid');
    }
    await preflight();
  }

  operation = await transition(journal, operation, specification, {
    state: 'started', attemptNumber: operation.attemptNumber + 1,
  }, now);
  let effected;
  try {
    effected = await effect();
    if (!plainObject(effected) || !plainObject(effected.record) ||
        effected.record.kind !== locator.kind ||
        !acceptedReceiptIds.includes(effected.record.id) ||
        !plainObject(effected.record.value)) {
      throw new Error('effect did not produce its exact receipt');
    }
    const output = await publish(journal, effected.record.kind, effected.record.id,
      Object.freeze(effected.record.value));
    const terminal = await transition(journal, operation, specification, {
      state: 'observed_succeeded', receipt: output.ref,
    }, now);
    return Object.freeze({ operation: terminal, output, recovered: false });
  } catch (error) {
    if (error instanceof ImplementationPipelineError && error.reconciliationRequired) throw error;
    return classifyUncertainOperation({ journal, operation, specification, locator, context,
      observePostcondition, acceptedReceiptIds, now, effectFailed: true });
  }
}

function candidateRef(candidate) {
  validateImplementationCandidate(candidate, { oidLength: candidate?.tree?.length });
  return frozenRef('candidate', candidate.candidateId, candidate);
}

function uniqueRefs(refs) {
  const values = [];
  const identities = new Map();
  for (const ref of refs) {
    const identity = `${ref.kind}\0${ref.id}`;
    const prior = identities.get(identity);
    if (prior !== undefined && prior.digest !== ref.digest) {
      reconcile('PIPELINE_OPERATION_CONFLICT',
        'operation prerequisites contain conflicting record identities');
    }
    if (prior === undefined) {
      identities.set(identity, ref);
      values.push(ref);
    }
  }
  return Object.freeze(values);
}

function checkReceipt(requirement, binding, observed) {
  if (!plainObject(observed)) {
    fail('PIPELINE_CHECK_INVALID', 'check runner returned an invalid observation');
  }
  const receipt = Object.freeze({
    schemaVersion: IMPLEMENTATION_PIPELINE_VERSION,
    receiptId: `check_${canonicalDigest({ requirement, binding }).slice(7, 31)}`,
    binding: Object.freeze({ ...binding }),
    ...requirement,
    outcome: observed.outcome,
    exitCode: observed.exitCode,
    evidence: Object.freeze([...(observed.evidence ?? [])]),
    startedAt: observed.startedAt,
    completedAt: observed.completedAt,
  });
  validateCheckReceipt(receipt);
  return receipt;
}

function normalizedPaths(values, label) {
  if (!Array.isArray(values) || values.length > 128) {
    fail('PIPELINE_INSPECTION_INVALID', `${label} is invalid`);
  }
  const result = [...new Set(values)].sort();
  try {
    for (const value of result) validateRepositoryPath(value, label);
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `${label} is invalid: ${error.message}`);
  }
  return Object.freeze(result);
}

function normalizeInspectionAuthority(inspectionInput) {
  if (!plainObject(inspectionInput) || !plainObject(inspectionInput.ownership) ||
      !Array.isArray(inspectionInput.ownership.writePaths) ||
      !Array.isArray(inspectionInput.ownership.readPaths)) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt inspection input is invalid');
  }
  const ownership = frozen({
    writePaths: normalizedPaths(inspectionInput.ownership.writePaths,
      'attempt ownership write path'),
    readPaths: normalizedPaths(inspectionInput.ownership.readPaths,
      'attempt ownership read path'),
  });
  let protectedPaths;
  try {
    protectedPaths = effectiveProtectedPaths(inspectionInput.protectedPaths ?? DEFAULT_PROTECTED_PATHS);
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `attempt protected paths are invalid: ${error.message}`);
  }
  return frozen({
    workspaceRoot: inspectionInput.workspaceRoot,
    expectedWorkspaceDigest: inspectionInput.expectedWorkspaceDigest,
    ownership,
    protectedPaths: structuredClone(protectedPaths),
    allowedPaths: structuredClone(ownership.writePaths),
    gitExecutable: inspectionInput.gitExecutable,
    processExpectation: structuredClone(inspectionInput.processExpectation),
    processEvidence: structuredClone(inspectionInput.processEvidence),
  });
}

function validateInspectionRecord(inspection, authority) {
  exactKeys(inspection, ['workspaceIdentity', 'changedPaths', 'entries', 'ownershipDigest',
    'inspectionDigest'], 'frozen attempt inspection record');
  exactKeys(inspection.workspaceIdentity, ['path', 'dev', 'ino', 'mode', 'digest'],
    'frozen attempt workspace identity');
  if (inspection.workspaceIdentity.path !== authority.workspaceRoot ||
      ![inspection.workspaceIdentity.dev, inspection.workspaceIdentity.ino,
        inspection.workspaceIdentity.mode].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      inspection.workspaceIdentity.digest !== canonicalDigest({
        path: inspection.workspaceIdentity.path,
        dev: inspection.workspaceIdentity.dev,
        ino: inspection.workspaceIdentity.ino,
        mode: inspection.workspaceIdentity.mode,
      })) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt workspace identity is invalid');
  }
  const changedPaths = normalizedPaths(inspection.changedPaths, 'attempt changed path');
  if (canonicalDigest(changedPaths) !== canonicalDigest(inspection.changedPaths) ||
      !Array.isArray(inspection.entries) || inspection.entries.length !== changedPaths.length) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt changed paths or entries are invalid');
  }
  for (const [index, entry] of inspection.entries.entries()) {
    exactKeys(entry, ['path', 'kind', 'identity', 'contentDigest'],
      `frozen attempt entry ${index}`);
    if (entry.path !== changedPaths[index] || !['file', 'deleted'].includes(entry.kind)) {
      fail('PIPELINE_INSPECTION_INVALID', 'attempt entry does not bind its changed path');
    }
    try {
      if (entry.kind === 'file') {
        validateDigest(entry.identity, 'attempt entry identity');
        validateDigest(entry.contentDigest, 'attempt entry content digest');
      } else if (entry.identity !== null || entry.contentDigest !== null) {
        throw new Error('deleted entry contains file evidence');
      }
    } catch (error) {
      fail('PIPELINE_INSPECTION_INVALID', `attempt entry is invalid: ${error.message}`);
    }
  }
  try {
    validateDigest(inspection.ownershipDigest, 'attempt ownership digest');
    validateDigest(inspection.inspectionDigest, 'attempt inspection digest');
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `attempt inspection digest is invalid: ${error.message}`);
  }
  if (inspection.ownershipDigest !== canonicalDigest({
    ownership: authority.ownership,
    protectedPaths: authority.protectedPaths,
  }) || inspection.inspectionDigest !== canonicalDigest({
    workspace: inspection.workspaceIdentity,
    changedPaths: inspection.changedPaths,
    entries: inspection.entries,
  })) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt inspection digests do not bind its exact evidence');
  }
}

function frozenInspectionFor(inspectionInput) {
  const authority = normalizeInspectionAuthority(inspectionInput);
  const inspection = inspectAttemptChangesWithProcessEvidence(authority);
  const value = frozen({
    schemaVersion: IMPLEMENTATION_PIPELINE_VERSION,
    authority,
    inspection: structuredClone(inspection),
    freezeDigest: canonicalDigest({ authority, inspection }),
  });
  return validateFrozenInspection(value, null);
}

function validateFrozenInspection(value, candidateInput) {
  exactKeys(value, ['schemaVersion', 'authority', 'inspection', 'freezeDigest'],
    'frozen attempt inspection');
  exactKeys(value.authority, [
    'workspaceRoot', 'expectedWorkspaceDigest', 'ownership', 'protectedPaths',
    'allowedPaths', 'gitExecutable', 'processExpectation', 'processEvidence',
  ], 'frozen attempt inspection authority');
  exactKeys(value.authority.ownership, ['writePaths', 'readPaths'],
    'frozen attempt ownership');
  try {
    validateProtocolValue(value);
    validateDigest(value.authority.expectedWorkspaceDigest, 'expected workspace digest');
    validateDigest(value.freezeDigest, 'attempt freeze digest');
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `attempt inspection is not canonical: ${error.message}`);
  }
  const writes = normalizedPaths(value.authority.ownership.writePaths,
    'attempt ownership write path');
  const reads = normalizedPaths(value.authority.ownership.readPaths,
    'attempt ownership read path');
  const allowed = normalizedPaths(value.authority.allowedPaths, 'attempt allowed path');
  let protectedPaths;
  try {
    protectedPaths = effectiveProtectedPaths(value.authority.protectedPaths);
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `attempt protected paths are invalid: ${error.message}`);
  }
  if (canonicalDigest(writes) !== canonicalDigest(value.authority.ownership.writePaths) ||
      canonicalDigest(reads) !== canonicalDigest(value.authority.ownership.readPaths) ||
      canonicalDigest(allowed) !== canonicalDigest(writes) ||
      canonicalDigest(protectedPaths) !== canonicalDigest(value.authority.protectedPaths) ||
      typeof value.authority.workspaceRoot !== 'string' ||
      typeof value.authority.gitExecutable !== 'string') {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt authority is not normalized or complete');
  }
  validateInspectionRecord(value.inspection, value.authority);
  if (candidateInput !== null && (!plainObject(candidateInput) || !plainObject(candidateInput.binding) ||
      !Array.isArray(candidateInput.allowedPaths) || !plainObject(candidateInput.commitMetadata))) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt candidate input is invalid');
  }
  if (value.schemaVersion !== IMPLEMENTATION_PIPELINE_VERSION ||
      value.freezeDigest !== canonicalDigest({ authority: value.authority,
        inspection: value.inspection }) || (candidateInput !== null &&
      (candidateInput.workspaceRoot !== value.authority.workspaceRoot ||
      candidateInput.gitExecutable !== value.authority.gitExecutable ||
      canonicalDigest(candidateInput.allowedPaths) !== canonicalDigest(value.authority.allowedPaths))) ||
      value.inspection.workspaceIdentity?.path !== value.authority.workspaceRoot ||
      value.inspection.workspaceIdentity?.digest !== value.authority.expectedWorkspaceDigest ||
      value.inspection.ownershipDigest !== canonicalDigest({
        ownership: value.authority.ownership,
        protectedPaths: value.authority.protectedPaths,
      })) {
    fail('PIPELINE_INSPECTION_INVALID',
      'attempt inspection does not bind the exact ingestion input');
  }
  let process;
  try {
    process = classifyProcessDomain(value.authority.processExpectation,
      value.authority.processEvidence);
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID', `attempt process evidence is invalid: ${error.message}`);
  }
  if (!process.empty) {
    fail('PIPELINE_INSPECTION_INVALID', 'attempt process domain is not proved empty');
  }
  return frozen(structuredClone(value));
}

function revalidateFrozenInspection(value) {
  let current;
  try {
    current = inspectAttemptChangesWithProcessEvidence(value.authority);
  } catch (error) {
    fail('PIPELINE_INSPECTION_INVALID',
      `attempt inspection provenance cannot be re-established: ${error.message}`);
  }
  if (canonicalDigest(current) !== canonicalDigest(value.inspection)) {
    fail('PIPELINE_INSPECTION_INVALID',
      'attempt workspace bytes, identity, paths, ownership, or process evidence changed');
  }
  return current;
}

export function createImplementationPipeline({
  journal,
  checkRunner,
  observePostcondition = null,
  now = () => new Date().toISOString(),
} = {}) {
  validatePort(journal);
  validateClock(now);
  if (typeof checkRunner !== 'function' ||
      (observePostcondition !== null && typeof observePostcondition !== 'function')) {
    fail('PIPELINE_PORT_INVALID',
      'implementation pipeline requires an injected check runner and optional postcondition observer');
  }
  const freezeAttempt = ({ inspectionInput } = {}) => frozenInspectionFor(inspectionInput);
  const ingestFrozen = async ({ inspection, candidateInput, attemptRef } = {}) => {
    validateRef(attemptRef);
    if (attemptRef.kind !== 'attempt' || attemptRef.id !== candidateInput?.attemptId) {
      fail('PIPELINE_OPERATION_INVALID', 'attempt ingestion requires its exact attempt reference');
    }
    const normalizedInspection = validateFrozenInspection(inspection, candidateInput);
    const heldCandidateInput = Object.freeze({
      ...candidateInput,
      binding: frozen(structuredClone(candidateInput.binding)),
      allowedPaths: frozen(structuredClone(candidateInput.allowedPaths)),
      commitMetadata: frozen(structuredClone(candidateInput.commitMetadata)),
    });
    const held = validateFrozenInspection(normalizedInspection, heldCandidateInput);
    const input = Object.freeze({
      freezeDigest: held.freezeDigest,
      inspectionDigest: held.inspection.inspectionDigest,
      candidateId: heldCandidateInput.candidateId,
      attemptId: heldCandidateInput.attemptId,
      baseCommit: heldCandidateInput.baseCommit,
      workspaceRoot: heldCandidateInput.workspaceRoot,
      repositoryRoot: heldCandidateInput.repositoryRoot,
      gitExecutable: heldCandidateInput.gitExecutable,
      allowedPaths: heldCandidateInput.allowedPaths,
      createdAt: heldCandidateInput.createdAt,
      processExpectationDigest: canonicalDigest(held.authority.processExpectation),
      processEvidenceDigest: canonicalDigest(held.authority.processEvidence),
      commitMetadataDigest: canonicalDigest(heldCandidateInput.commitMetadata),
    });
    const locator = Object.freeze({ kind: 'candidate', id: heldCandidateInput.candidateId });
    const executed = await executeOperation({
      journal,
      kind: 'ingest_attempt',
      binding: heldCandidateInput.binding,
      subject: attemptRef,
      input,
      expected: [attemptRef],
      idempotencyKey: `ingest_attempt:${heldCandidateInput.binding.runId}:${heldCandidateInput.attemptId}:${heldCandidateInput.candidateId}`,
      locator,
      context: Object.freeze({ inspection: held, candidateInput: heldCandidateInput }),
      observePostcondition,
      now,
      preflight: async () => { revalidateFrozenInspection(held); },
      effect: async () => {
        const value = ingestAttemptCandidate({ ...heldCandidateInput, inspection: held.inspection,
          processExpectation: held.authority.processExpectation,
          processEvidence: held.authority.processEvidence });
        return { record: { ...locator, value } };
      },
    });
    const value = executed.output.value;
    validateImplementationCandidate(value, { oidLength: value.tree.length });
    return Object.freeze({ inspection: held, candidate: value, ref: executed.output.ref,
      operation: executed.operation, recovered: executed.recovered });
  };
  return Object.freeze({
    freezeAttempt,

    ingestFrozen,

    async freezeAndIngest({ inspectionInput, candidateInput, attemptRef } = {}) {
      const inspection = freezeAttempt({ inspectionInput });
      const ingested = await ingestFrozen({ inspection, candidateInput, attemptRef });
      return Object.freeze({ ...ingested, inspection: inspection.inspection });
    },

    async integrate(input = {}) {
      const currentRef = candidateRef(input.currentCandidate);
      const incomingRef = candidateRef(input.incomingCandidate);
      const operationInput = Object.freeze({
        candidateId: input.candidateId,
        currentCandidateDigest: currentRef.digest,
        incomingCandidateDigest: incomingRef.digest,
        expectedPrivateHead: input.expectedPrivateHead,
        producerAttempts: input.producerAttempts,
        allowedPaths: input.allowedPaths,
        ownershipDigest: input.ownershipDigest,
        createdAt: input.createdAt,
        repositoryRoot: input.repositoryRoot,
        gitExecutable: input.gitExecutable,
        commitMetadataDigest: canonicalDigest(input.commitMetadata),
      });
      const locator = Object.freeze({ kind: 'candidate', id: input.candidateId });
      const executed = await executeOperation({
        journal,
        kind: 'integrate_candidate',
        binding: input.binding,
        subject: incomingRef,
        input: operationInput,
        expected: uniqueRefs([currentRef, incomingRef]),
        idempotencyKey: `integrate_candidate:${input.binding.runId}:${input.incomingCandidate.candidateId}:${input.candidateId}`,
        locator,
        acceptedReceiptIds: Object.freeze([
          ...new Set([input.candidateId, input.currentCandidate.candidateId]),
        ]),
        context: Object.freeze({ input }),
        observePostcondition,
        now,
        effect: async () => {
          const result = integratePrivateCandidate(input);
          const value = result.candidate;
          return { record: { kind: 'candidate', id: value.candidateId, value } };
        },
      });
      const value = executed.output.value;
      validateImplementationCandidate(value, { oidLength: value.tree.length });
      return Object.freeze({
        outcome: value.candidateId === input.candidateId ? 'integrated' : 'already_integrated',
        candidate: value,
        ref: executed.output.ref,
        operation: executed.operation,
        recovered: executed.recovered,
      });
    },

    async verify({ binding, candidate, requirements } = {}) {
      validateBinding(binding);
      const subject = candidateRef(candidate);
      if (!Array.isArray(requirements) || requirements.length > 128) {
        fail('PIPELINE_VERIFICATION_INVALID', 'verification requirements are invalid');
      }
      for (const requirement of requirements) {
        validateCheckRequirement(requirement);
        if (requirement.candidateId !== candidate.candidateId ||
            requirement.candidateTree !== candidate.tree) {
          fail('PIPELINE_VERIFICATION_STALE', 'check requirement names another candidate');
        }
      }
      const results = await Promise.all(requirements.map(async (requirement) => {
        const receiptId = `check_${canonicalDigest({ requirement, binding }).slice(7, 31)}`;
        const locator = Object.freeze({ kind: 'check_receipt', id: receiptId });
        return executeOperation({
          journal,
          kind: 'run_check',
          binding,
          subject,
          input: requirement,
          expected: [subject],
          idempotencyKey: `run_check:${binding.runId}:${candidate.candidateId}:${requirement.checkId}:${binding.correctionGeneration}`,
          locator,
          context: Object.freeze({ requirement, candidate, binding }),
          observePostcondition,
          now,
          effect: async () => {
            const observed = await checkRunner(Object.freeze({ requirement, candidate, binding }));
            const value = checkReceipt(requirement, binding, observed);
            return { record: { ...locator, value } };
          },
        });
      }));
      const receipts = results.map((result) => {
        validateCheckReceipt(result.output.value);
        return result.output.value;
      });
      receipts.sort((left, right) => left.checkId.localeCompare(right.checkId, 'en'));
      const gate = evaluateVerificationGate({ requirements, receipts, currentBinding: binding });
      return Object.freeze({ receipts: Object.freeze(receipts), gate,
        operations: Object.freeze(results.map((result) => result.operation)) });
    },

    correction({ binding, gate, affectedCheckIds } = {}) {
      validateBinding(binding);
      return planCorrectionGeneration({ currentGeneration: binding.correctionGeneration,
        gate, affectedCheckIds });
    },

    authorizeFinalization({ plan, requirements, receipts } = {}) {
      validateFinalizationPlan(plan);
      const gate = evaluateVerificationGate({ requirements, receipts, currentBinding: plan.binding });
      if (gate.disposition !== 'passed') {
        fail('PIPELINE_FINALIZATION_BLOCKED', `verification gate is ${gate.disposition}`);
      }
      const refs = receipts.map((receipt) => ({ kind: 'check_receipt', id: receipt.receiptId,
        digest: canonicalDigest(receipt) })).sort((left, right) => left.id.localeCompare(right.id, 'en'));
      for (const ref of refs) validateRef(ref);
      if (canonicalDigest(refs) !== canonicalDigest(plan.requiredCheckReceipts)) {
        fail('PIPELINE_FINALIZATION_STALE',
          'finalization plan does not bind the exact passing receipts');
      }
      return Object.freeze({ authorized: true, gate, plan });
    },
  });
}
