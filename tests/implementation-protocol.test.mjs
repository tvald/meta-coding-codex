import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ASSIGNMENT_PROPOSAL_ROLES,
  ASSIGNMENT_ROLES,
  ATTEMPT_STATES,
  EVENT_KINDS,
  IMPLEMENTATION_PROTOCOL_COMPATIBILITY,
  IMPLEMENTATION_PROTOCOL_LIMITS,
  ImplementationProtocolError,
  OPERATION_KINDS,
  OPERATION_STATES,
  REF_KINDS,
  RESOURCE_CLAIM_MODES,
  ROOT_DECISION_KINDS,
  RUN_PHASES,
  canonicalBytes,
  canonicalDigest,
  canonicalJson,
  parseCanonicalJson,
  sha256Digest,
  validateAssignmentProposal,
  validateBinding,
  validateRef,
  validateRepositoryPath,
  validateResourceClaim,
  validateRootDecision,
  validateRootDecisionProposal,
  validateTimestamp,
} from '../lib/implementation-protocol.mjs';

const digest = (character = 'a') => `sha256:${character.repeat(64)}`;

const binding = Object.freeze({
  runId: 'run_0054',
  epoch: 1,
  snapshotRevision: 7,
  taskId: 'T-0054',
  taskRevision: 2,
  taskRecordVersion: 3,
  capsuleDigest: digest('a'),
  controlGeneration: 0,
  correctionGeneration: 1,
});

const ref = (kind, id, character = 'b') => ({ kind, id, digest: digest(character) });

function assignmentProposal(proposalId = 'proposal_a', dependencies = []) {
  return {
    proposalId,
    role: 'implementer',
    goal: 'Implement one isolated slice.',
    scope: ['The assigned protocol surface'],
    nonGoals: ['Provider effects'],
    dependencies,
    ownership: {
      writePaths: ['lib/assigned.mjs', 'tests/assigned.test.mjs'],
      readPaths: ['readme/project/protocol.md'],
    },
    resources: [{ key: 'fixture-cache', mode: 'namespaced_write', namespace: proposalId }],
    checks: ['unit_test'],
    restartPolicy: 'fresh_attempt',
  };
}

function waitProposal() {
  return {
    schemaVersion: 1,
    rationale: 'No current observation warrants an effect.',
    kind: 'wait',
    reasonCode: 'stable_state',
    wakeOn: ['control_change', 'result_observed'],
    deadlineAt: null,
  };
}

function protocolError(code) {
  return (error) => error instanceof ImplementationProtocolError && error.code === code;
}

test('compatibility metadata and every protocol enum are frozen closed inventories', () => {
  assert.deepEqual(IMPLEMENTATION_PROTOCOL_COMPATIBILITY, {
    version: '1.0.0',
    protocolVersions: [1],
    recordSchemaVersions: [1],
    canonicalization: 'RFC8785',
    digestAlgorithm: 'sha256',
  });
  assert.equal(Object.isFrozen(IMPLEMENTATION_PROTOCOL_COMPATIBILITY), true);
  for (const values of [
    REF_KINDS,
    RESOURCE_CLAIM_MODES,
    OPERATION_KINDS,
    EVENT_KINDS,
    RUN_PHASES,
    ATTEMPT_STATES,
    OPERATION_STATES,
    ASSIGNMENT_ROLES,
    ASSIGNMENT_PROPOSAL_ROLES,
    ROOT_DECISION_KINDS,
  ]) assert.equal(Object.isFrozen(values), true);
  assert.equal(REF_KINDS.includes('decision'), true);
  assert.equal(RESOURCE_CLAIM_MODES.includes('global_write'), false);
  assert.equal(ASSIGNMENT_ROLES.includes('root_decision'), true);
  assert.equal(ASSIGNMENT_PROPOSAL_ROLES.includes('root_decision'), false);
  assert.equal(ROOT_DECISION_KINDS.includes('grant_approval'), false);
});

test('canonical bytes match the RFC 8785 UTF-16 key-order fixture without normalization', () => {
  const fixture = {
    '\u20ac': 'Euro Sign',
    '\r': 'Carriage Return',
    '\ufb33': 'Hebrew Letter Dalet With Dagesh',
    1: 'One',
    '\ud83d\ude00': 'Emoji: Grinning Face',
    '\u0080': 'Control',
    '\u00f6': 'Latin Small Letter O With Diaeresis',
  };
  const expected = '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
    '"ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
    '"😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}';
  assert.equal(canonicalJson(fixture), expected);
  assert.deepEqual(canonicalBytes(fixture), Buffer.from(expected, 'utf8'));
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: [3, true, null] } }),
    '{"a":{"x":[3,true,null],"y":2},"z":1}');

  const composed = canonicalJson({ '\u00e9': 'composed' });
  const decomposed = canonicalJson({ 'e\u0301': 'decomposed' });
  assert.notEqual(composed, decomposed);
  assert.notEqual(sha256Digest(composed), sha256Digest(decomposed));
});

test('SHA-256 covers exact canonical file bytes and canonical files have no framing bytes', () => {
  const value = { schemaVersion: 1, message: 'exact bytes' };
  const bytes = canonicalBytes(value);
  const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.equal(bytes.at(0), '{'.charCodeAt(0));
  assert.equal(bytes.at(-1), '}'.charCodeAt(0));
  assert.equal(bytes.includes(0xef), false);
  assert.equal(sha256Digest(bytes), expected);
  assert.equal(canonicalDigest(value), expected);
  assert.notEqual(sha256Digest(Buffer.concat([bytes, Buffer.from('\n')])), expected);
});

test('canonicalization rejects values outside the bounded restricted JSON domain', () => {
  for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 9_007_199_254_740_992,
    1n, undefined, new Date(0), '\ud800']) {
    assert.throws(() => canonicalJson(value), protocolError('VALUE_INVALID'));
  }
  assert.equal(canonicalJson(-0), '0');
  assert.throws(() => canonicalJson({ '\udfff': 'invalid key' }), protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson(Array(1)), protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson(Array.from({ length: 129 }, () => null)),
    protocolError('VALUE_INVALID'));
  assert.throws(() => canonicalJson('x'.repeat(256), { maxBytes: 16 }), protocolError('RECORD_SIZE'));
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle, { maximumDepth: 4 }), protocolError('VALUE_INVALID'));
});

test('strict parsing rejects duplicate, malformed, noncanonical, and non-integer inputs', () => {
  const canonical = '{"a":1,"nested":{"b":true}}';
  assert.deepEqual(parseCanonicalJson(Buffer.from(canonical)), { a: 1, nested: { b: true } });
  assert.equal(Object.hasOwn(parseCanonicalJson('{"__proto__":1}'), '__proto__'), true);

  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"b":1,"a":2}',
    '{ "a":1}',
    '{"a":1}\n',
    '{"a":1.0}',
    '{"a":1e0}',
    '{"a":9007199254740992}',
    '"\\ud800"',
  ]) assert.throws(() => parseCanonicalJson(text), (error) =>
    error instanceof ImplementationProtocolError && ['JSON_INVALID', 'JSON_NONCANONICAL'].includes(error.code));

  assert.throws(() => parseCanonicalJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    protocolError('JSON_INVALID'));
  assert.throws(() => parseCanonicalJson(Buffer.from([0x22, 0xff, 0x22])), protocolError('JSON_INVALID'));
  assert.throws(() => parseCanonicalJson('{}', { maxBytes: 1 }), protocolError('RECORD_SIZE'));
});

test('common Binding, Ref, path, time, and ResourceClaim validators are exact and bounded', () => {
  assert.equal(validateBinding(binding), binding);
  const candidateRef = ref('candidate', 'candidate_a');
  assert.equal(validateRef(candidateRef), candidateRef);
  assert.equal(validateRepositoryPath('lib/protocol/record.mjs'), 'lib/protocol/record.mjs');
  assert.equal(validateTimestamp('2026-08-14T12:34:56.123456Z'), '2026-08-14T12:34:56.123456Z');
  assert.equal(validateTimestamp('0001-01-01T00:00:00Z'), '0001-01-01T00:00:00Z');
  assert.deepEqual(validateResourceClaim({
    key: 'cache:fixture', mode: 'namespaced_write', namespace: 'attempt_a',
  }), { key: 'cache:fixture', mode: 'namespaced_write', namespace: 'attempt_a' });
  assert.deepEqual(validateResourceClaim({ key: 'network', mode: 'exclusive', namespace: null }),
    { key: 'network', mode: 'exclusive', namespace: null });

  assert.throws(() => validateBinding({ ...binding, executable: '/bin/sh' }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateBinding({ ...binding, taskRevision: 1.5 }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRef({ ...ref('candidate', 'candidate_a'), kind: 'workspace' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRef({ ...ref('candidate', 'candidate_a'), digest: `sha256:${'A'.repeat(64)}` }),
    protocolError('SCHEMA_INVALID'));
  for (const path of ['', '/absolute', 'a\\b', 'a//b', 'a/./b', 'a/../b', 'a\0b']) {
    assert.throws(() => validateRepositoryPath(path), protocolError('SCHEMA_INVALID'));
  }
  assert.throws(() => validateTimestamp('2026-02-30T00:00:00Z'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateTimestamp('1900-02-29T00:00:00Z'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateTimestamp('2026-08-14T00:00:00+00:00'), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateResourceClaim({
    key: 'cache', mode: 'namespaced_write', namespace: null,
  }), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateResourceClaim({
    key: 'cache', mode: 'shared_read', namespace: 'attempt_a',
  }), protocolError('SCHEMA_INVALID'));
});

test('AssignmentProposal is closed, path-canonical, and excludes supervisor authority', () => {
  const proposal = assignmentProposal();
  assert.equal(validateAssignmentProposal(proposal), proposal);
  for (const mutation of [
    { ...proposal, assignmentId: 'assignment_a' },
    { ...proposal, binding },
    { ...proposal, role: 'root_decision' },
    { ...proposal, permissions: { sandbox: 'workspace-write' } },
    { ...proposal, shell: 'node test.mjs' },
    { ...proposal, ownership: { ...proposal.ownership, writePaths: ['z', 'a'] } },
  ]) assert.throws(() => validateAssignmentProposal(mutation), protocolError('SCHEMA_INVALID'));
});

test('every RootDecisionProposal variant is closed and proposal data cannot carry Binding', () => {
  const assignment = assignmentProposal();
  const variants = [
    { schemaVersion: 1, rationale: 'Delegate.', kind: 'declare_assignments', assignments: [assignment] },
    { schemaVersion: 1, rationale: 'Integrate.', kind: 'integrate_candidate', candidateId: 'candidate_a' },
    {
      schemaVersion: 1,
      rationale: 'Correct.',
      kind: 'request_correction',
      supersededAssignmentIds: ['assignment_a'],
      assignments: [assignment],
      affectedCheckIds: ['unit_test'],
    },
    {
      schemaVersion: 1,
      rationale: 'Verify.',
      kind: 'schedule_gates',
      candidateId: 'candidate_a',
      assignments: [assignment],
    },
    {
      schemaVersion: 1,
      rationale: 'Checkpoint.',
      kind: 'checkpoint_task',
      status: 'needs_verification',
      nextSafeAction: 'Run the offline gate.',
    },
    {
      schemaVersion: 1,
      rationale: 'Ask.',
      kind: 'request_approval',
      action: 'Run a live canary.',
      boundary: 'One local disposable repository.',
      detailRef: ref('detail', 'approval_detail'),
    },
    waitProposal(),
    {
      schemaVersion: 1,
      rationale: 'Finish.',
      kind: 'finalize',
      candidateId: 'candidate_a',
      requiredCheckReceiptIds: ['check_a'],
      completionEvidenceDigest: digest('c'),
    },
    { schemaVersion: 1, rationale: 'Stop.', kind: 'stop', mode: 'checkpoint', reason: 'Operator request.' },
    { schemaVersion: 1, rationale: 'Fail.', kind: 'fail', reasonCode: 'invalid_state', evidence: [] },
  ];
  for (const variant of variants) assert.equal(validateRootDecisionProposal(variant), variant);

  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), binding }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), kind: 'grant_approval' }),
    protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecisionProposal({ ...waitProposal(), taskMutation: { status: 'done' } }),
    protocolError('SCHEMA_INVALID'));
});

test('proposal dependency validation rejects unresolved, duplicate, conflicting, and cyclic graphs', () => {
  const unresolved = {
    schemaVersion: 1,
    rationale: 'Invalid graph.',
    kind: 'declare_assignments',
    assignments: [assignmentProposal('proposal_a', [{
      targetKind: 'proposal', targetId: 'missing', condition: 'result',
    }])],
  };
  assert.throws(() => validateRootDecisionProposal(unresolved), protocolError('SCHEMA_INVALID'));

  const duplicateIds = structuredClone(unresolved);
  duplicateIds.assignments = [assignmentProposal('proposal_a'), assignmentProposal('proposal_a')];
  assert.throws(() => validateRootDecisionProposal(duplicateIds), protocolError('SCHEMA_INVALID'));

  const conflicting = assignmentProposal('proposal_a', [
    { targetKind: 'assignment', targetId: 'existing_a', condition: 'result' },
    { targetKind: 'assignment', targetId: 'existing_a', condition: 'integrated' },
  ]);
  assert.throws(() => validateAssignmentProposal(conflicting), protocolError('SCHEMA_INVALID'));

  const cyclic = structuredClone(unresolved);
  cyclic.assignments = [
    assignmentProposal('proposal_a', [{ targetKind: 'proposal', targetId: 'proposal_b', condition: 'result' }]),
    assignmentProposal('proposal_b', [{ targetKind: 'proposal', targetId: 'proposal_a', condition: 'result' }]),
  ];
  assert.throws(() => validateRootDecisionProposal(cyclic), protocolError('SCHEMA_INVALID'));

  const external = structuredClone(unresolved);
  external.assignments = [assignmentProposal('proposal_a', [{
    targetKind: 'assignment', targetId: 'existing_a', condition: 'result',
  }])];
  assert.equal(validateRootDecisionProposal(external, { knownAssignmentIds: ['existing_a'] }), external);
  assert.throws(() => validateRootDecisionProposal(external, { knownAssignmentIds: [] }),
    protocolError('SCHEMA_INVALID'));
});

test('RootDecision validation binds proposal bytes, supervisor Binding, and launch provenance', () => {
  const modelResult = ref('model_result', 'model_result_a', 'd');
  const launchReceipt = {
    schemaVersion: 1,
    receiptId: 'launch_receipt_a',
    binding: { ...binding, snapshotRevision: binding.snapshotRevision - 1 },
    modelResult,
  };
  const launchReceiptRef = {
    kind: 'launch_receipt',
    id: launchReceipt.receiptId,
    digest: canonicalDigest(launchReceipt),
  };
  const proposal = waitProposal();
  const orientationDigest = sha256Digest('bounded orientation bytes');
  const decision = {
    schemaVersion: 1,
    decisionId: 'decision_a',
    binding: { ...binding },
    orientationDigest,
    proposalDigest: canonicalDigest(proposal, {
      maxBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes,
    }),
    source: { launchReceipt: launchReceiptRef, modelResult },
    proposal,
    derivedAssignments: [],
    acceptedAt: '2026-08-14T12:00:00Z',
  };
  assert.equal(validateRootDecision(decision, {
    expectedBinding: binding,
    expectedOrientationDigest: orientationDigest,
    launchReceiptRef,
    launchReceipt,
  }), decision);

  const rawProposal = waitProposal();
  assert.throws(() => validateRootDecision(rawProposal), protocolError('SCHEMA_INVALID'));
  assert.throws(() => validateRootDecision({ ...decision, proposalDigest: digest('e') }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, { expectedOrientationDigest: digest('f') }),
    protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    launchReceipt: { ...launchReceipt, modelResult: ref('model_result', 'another_result', 'd') },
  }), protocolError('PROVENANCE_INVALID'));
  const wrongAuthorityReceipt = {
    ...launchReceipt,
    binding: { ...launchReceipt.binding, controlGeneration: binding.controlGeneration + 1 },
  };
  const wrongAuthorityDecision = {
    ...decision,
    source: {
      ...decision.source,
      launchReceipt: {
        kind: 'launch_receipt',
        id: wrongAuthorityReceipt.receiptId,
        digest: canonicalDigest(wrongAuthorityReceipt),
      },
    },
  };
  assert.throws(() => validateRootDecision(wrongAuthorityDecision, {
    launchReceipt: wrongAuthorityReceipt,
  }), protocolError('PROVENANCE_INVALID'));
  assert.throws(() => validateRootDecision(decision, {
    expectedBinding: { ...binding, controlGeneration: 1 },
  }), protocolError('PROVENANCE_INVALID'));

  const declare = {
    schemaVersion: 1,
    rationale: 'Delegate.',
    kind: 'declare_assignments',
    assignments: [assignmentProposal()],
  };
  const missingDerived = {
    ...decision,
    proposal: declare,
    proposalDigest: canonicalDigest(declare),
  };
  assert.throws(() => validateRootDecision(missingDerived), protocolError('PROVENANCE_INVALID'));
});
