import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { canonicalDigest } from '../lib/implementation-protocol.mjs';
import { workspaceIdentity } from '../lib/implementation-workspace.mjs';
import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  ImplementationPipelineError,
  createImplementationPipeline,
} = await import('../lib/implementation-pipeline.mjs');
const { issueSourceInstrumentedTestCapability } = await import('../lib/implementation-git.mjs');

const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({ runId: 'run_1', epoch: 1, snapshotRevision: 2,
  taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 8, capsuleDigest: digest('a'),
  controlGeneration: 0, correctionGeneration: 0 });
const candidate = Object.freeze({ schemaVersion: 1, candidateId: 'candidate_1', binding,
  parentCandidateId: null, baseTree: '1'.repeat(40), tree: '2'.repeat(40),
  privateCommit: '3'.repeat(40), producerAttempts: ['attempt_1'], changedPaths: ['src/a.mjs'],
  ownershipDigest: digest('b'), patchDigest: digest('c'), createdAt: '2026-08-14T10:00:00Z' });
const observedPass = Object.freeze({ outcome: 'pass', exitCode: 0, evidence: [],
  startedAt: '2026-08-14T10:01:00Z', completedAt: '2026-08-14T10:02:00Z' });
const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'],
  { encoding: 'utf8' }).trim()));

function command(root, args) {
  return execFileSync(git, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      LANG: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-08-14T09:00:00Z',
      GIT_COMMITTER_DATE: '2026-08-14T09:00:00Z',
    },
  }).trim();
}

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-pipeline-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet', '--initial-branch=main']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.txt'), 'base\n');
  command(root, ['add', '--', 'src/a.txt']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  return { root, baseCommit: command(root, ['rev-parse', 'HEAD']) };
}

function gitCapability() {
  return issueSourceInstrumentedTestCapability('git_admin');
}

function requirement(overrides = {}) {
  return { checkId: 'unit', catalogDigest: digest('d'), candidateId: candidate.candidateId,
    candidateTree: candidate.tree, inputScopeDigest: digest('e'), commandDigest: digest('f'),
    environmentDigest: digest('1'), resourcesDigest: digest('2'), ...overrides };
}

function receipt(value = requirement(), observed = observedPass) {
  return Object.freeze({
    schemaVersion: 1,
    receiptId: `check_${canonicalDigest({ requirement: value, binding }).slice(7, 31)}`,
    binding,
    ...value,
    outcome: observed.outcome,
    exitCode: observed.exitCode,
    evidence: observed.evidence,
    startedAt: observed.startedAt,
    completedAt: observed.completedAt,
  });
}

function journal({ beforePublish = null, afterPublish = null } = {}) {
  const values = [];
  const records = new Map();
  const service = {
    async read(kind, id) {
      return records.get(`${kind}:${id}`) ?? null;
    },
    async publish(kind, id, value) {
      if (beforePublish !== null) await beforePublish({ kind, id, value, values, records });
      const key = `${kind}:${id}`;
      const current = records.get(key);
      if (kind === 'operation') {
        if (current !== undefined && value.recordVersion !== current.value.recordVersion + 1) {
          throw new Error('operation version conflict');
        }
      } else if (current !== undefined && canonicalDigest(current.value) !== canonicalDigest(value)) {
        throw new Error('immutable record conflict');
      }
      const result = Object.freeze({ value, ref: Object.freeze({ kind, id, digest: canonicalDigest(value) }) });
      records.set(key, result);
      values.push({ kind, id, value });
      if (afterPublish !== null) await afterPublish({ kind, id, value, values, records });
      return result;
    },
  };
  return { service, values, records };
}

function pipeline({ outcome = 'pass', heldJournal = journal(), observePostcondition = null,
  onRun = null } = {}) {
  let runs = 0;
  const service = createImplementationPipeline({
    journal: heldJournal.service,
    observePostcondition,
    now: (() => {
      let seconds = 0;
      return () => `2026-08-14T10:00:${String(seconds++).padStart(2, '0')}Z`;
    })(),
    async checkRunner(input) {
      runs += 1;
      if (onRun !== null) await onRun(input);
      return { ...observedPass, outcome, exitCode: outcome === 'pass' ? 0 : 1 };
    },
  });
  return { values: heldJournal.values, records: heldJournal.records, service,
    runs: () => runs };
}

function ingestionFixture(t, candidateId = 'candidate_frozen') {
  const { root, baseCommit } = repository(t);
  writeFileSync(join(root, 'src', 'a.txt'), 'attempt change\n');
  const heldJournal = journal();
  const current = pipeline({ heldJournal });
  const expectation = {
    processDomainId: 'process_pipeline',
    launcherConnectionId: 'launcher_pipeline',
    processIdentityDigest: digest('5'),
  };
  const processEvidence = {
    schemaVersion: 1,
    ...expectation,
    state: 'empty',
    descendantsComplete: true,
    members: [],
    observedAt: '2026-08-14T10:05:00Z',
  };
  const inspectionInput = {
    workspaceRoot: root,
    expectedWorkspaceDigest: workspaceIdentity(root).digest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processExpectation: expectation,
    processEvidence,
    gitExecutable: git,
  };
  const candidateInput = {
    repositoryRoot: root,
    workspaceRoot: root,
    gitExecutable: git,
    binding,
    candidateId,
    attemptId: 'attempt_frozen',
    baseCommit,
    allowedPaths: ['src'],
    createdAt: '2026-08-14T10:06:00Z',
    commitMetadata: {
      authorName: 'Meta Framework',
      authorEmail: 'meta@example.invalid',
      committerName: 'Meta Framework',
      committerEmail: 'meta@example.invalid',
      timestamp: '2026-08-14T10:06:00Z',
      message: 'Ingest frozen attempt\n',
    },
    capability: gitCapability(),
  };
  const attemptRef = { kind: 'attempt', id: candidateInput.attemptId,
    digest: canonicalDigest({ attemptId: candidateInput.attemptId, state: 'frozen' }) };
  return { root, heldJournal, current, inspectionInput, candidateInput, attemptRef };
}

test('candidate-bound checks persist typed intent, started, receipt, and observed success', async () => {
  const current = pipeline();
  const result = await current.service.verify({ binding, candidate, requirements: [requirement()] });
  assert.equal(result.gate.disposition, 'passed');
  assert.deepEqual(current.values.filter(({ kind }) => kind === 'operation')
    .map(({ value }) => value.state), ['intended', 'started', 'observed_succeeded']);
  const intended = current.values[0].value;
  assert.equal(current.values[0].kind, 'operation');
  assert.equal(intended.kind, 'run_check');
  assert.equal(intended.inputDigest, canonicalDigest(requirement()));
  assert.deepEqual(intended.subject, {
    kind: 'candidate', id: candidate.candidateId, digest: canonicalDigest(candidate),
  });
  assert.deepEqual(intended.expected, [intended.subject]);
  assert.equal(current.values.at(-1).value.receipt.digest,
    canonicalDigest(result.receipts[0]));
});

test('same idempotency key and input reuses the durable terminal receipt without rerunning', async () => {
  const current = pipeline();
  const first = await current.service.verify({ binding, candidate, requirements: [requirement()] });
  const publicationCount = current.values.length;
  const second = await current.service.verify({ binding, candidate, requirements: [requirement()] });
  assert.equal(current.runs(), 1);
  assert.equal(current.values.length, publicationCount);
  assert.deepEqual(second.receipts, first.receipts);
  assert.equal(second.operations[0].state, 'observed_succeeded');
});

test('receipt publication cut is recovered from durable receipt without repeating effect', async () => {
  let cut = true;
  const heldJournal = journal({
    beforePublish({ kind, value }) {
      if (cut && kind === 'operation' && value.state === 'observed_succeeded') {
        cut = false;
        throw new Error('simulated crash cut');
      }
    },
  });
  const current = pipeline({ heldJournal });
  const recovered = await current.service.verify({ binding, candidate,
    requirements: [requirement()] });
  assert.equal(current.runs(), 1);
  assert.equal(recovered.gate.disposition, 'passed');
  assert.equal(recovered.operations[0].state, 'observed_succeeded');
});

test('crash after effect before receipt uses observer evidence and never blindly repeats', async () => {
  let cut = true;
  let observations = 0;
  const heldJournal = journal({
    beforePublish({ kind }) {
      if (cut && kind === 'check_receipt') {
        cut = false;
        throw new Error('simulated receipt publication loss');
      }
    },
  });
  const current = pipeline({
    heldJournal,
    observePostcondition({ context, expectedReceipt }) {
      observations += 1;
      if (observations === 1) return { outcome: 'ambiguous' };
      const value = receipt(context.requirement);
      return { outcome: 'succeeded', record: { ...expectedReceipt, value } };
    },
  });
  await assert.rejects(current.service.verify({ binding, candidate,
    requirements: [requirement()] }), (error) =>
    error instanceof ImplementationPipelineError && error.reconciliationRequired === true);
  assert.equal(current.runs(), 1);
  const recovered = await current.service.verify({ binding, candidate,
    requirements: [requirement()] });
  assert.equal(current.runs(), 1);
  assert.equal(observations, 2);
  assert.equal(recovered.gate.disposition, 'passed');
  assert.deepEqual(current.values.filter(({ kind }) => kind === 'operation')
    .map(({ value }) => value.state),
  ['intended', 'started', 'ambiguous', 'observed_succeeded']);
});

test('same idempotency key with conflicting input fails reconciliation before execution', async () => {
  const current = pipeline();
  await current.service.verify({ binding, candidate, requirements: [requirement()] });
  await assert.rejects(current.service.verify({ binding, candidate, requirements: [requirement({
    commandDigest: digest('8'),
  })] }), (error) => error.code === 'PIPELINE_OPERATION_CONFLICT' &&
    error.reconciliationRequired === true);
  assert.equal(current.runs(), 1);
});

test('a started operation with an explicitly absent postcondition is abandoned, not repeated', async () => {
  let cut = true;
  const heldJournal = journal({
    afterPublish({ kind, value }) {
      if (cut && kind === 'operation' && value.state === 'started') {
        cut = false;
        throw new Error('simulated crash before effect');
      }
    },
  });
  const current = pipeline({ heldJournal,
    observePostcondition() { return { outcome: 'absent' }; } });
  await assert.rejects(current.service.verify({ binding, candidate,
    requirements: [requirement()] }), /simulated crash before effect/u);
  await assert.rejects(current.service.verify({ binding, candidate,
    requirements: [requirement()] }), (error) => error.code === 'PIPELINE_OPERATION_ABANDONED');
  assert.equal(current.runs(), 0);
  assert.deepEqual(current.values.filter(({ kind }) => kind === 'operation')
    .map(({ value }) => value.state), ['intended', 'started', 'ambiguous', 'abandoned']);
});

test('stale requirements fail before execution and failed checks plan correction', async () => {
  const passing = pipeline().service;
  await assert.rejects(passing.verify({ binding, candidate,
    requirements: [requirement({ candidateTree: '9'.repeat(40) })] }), /another candidate/u);
  const failedPipeline = pipeline({ outcome: 'fail' });
  const failed = await failedPipeline.service.verify({ binding, candidate,
    requirements: [requirement()] });
  assert.equal(failed.gate.disposition, 'correction_required');
  assert.deepEqual(failedPipeline.service.correction({ binding, gate: failed.gate,
    affectedCheckIds: ['unit'] }), { correctionGeneration: 1, staleCheckIds: ['unit'] });
});

test('journal substitution is rejected', async () => {
  const service = createImplementationPipeline({
    journal: {
      async read() { return null; },
      async publish(kind, id) { return { ref: { kind, id, digest: digest('9') } }; },
    },
    async checkRunner() { return observedPass; },
  });
  await assert.rejects(service.verify({ binding, candidate, requirements: [requirement()] }),
    /did not bind the exact pipeline record/u);
});

test('freeze is effect-free until explicit bound ingestion and exact retry is idempotent', async (t) => {
  const { root, heldJournal, current, inspectionInput, candidateInput, attemptRef } =
    ingestionFixture(t);
  const head = command(root, ['rev-parse', 'HEAD']);
  const inspection = current.service.freezeAttempt({ inspectionInput });
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(inspection.inspection), true);
  assert.equal(heldJournal.values.length, 0);
  assert.equal(command(root, ['rev-parse', 'HEAD']), head);

  await assert.rejects(current.service.ingestFrozen({
    inspection, candidateInput: { ...candidateInput, allowedPaths: ['tests'] }, attemptRef,
  }), (error) => error.code === 'PIPELINE_INSPECTION_INVALID');
  assert.equal(heldJournal.values.length, 0);

  const rehydrated = JSON.parse(JSON.stringify(inspection));
  const restarted = pipeline({ heldJournal });
  const first = await restarted.service.ingestFrozen({
    inspection: rehydrated,
    candidateInput: { ...candidateInput, capability: gitCapability() },
    attemptRef,
  });
  assert.equal(first.candidate.candidateId, candidateInput.candidateId);
  assert.deepEqual(first.candidate.changedPaths, ['src/a.txt']);
  assert.equal(command(root, ['rev-parse', 'HEAD']), head);
  const publicationCount = heldJournal.values.length;
  const compatible = await current.service.freezeAndIngest({
    inspectionInput, candidateInput, attemptRef,
  });
  assert.equal(compatible.inspection.inspectionDigest,
    inspection.inspection.inspectionDigest);
  assert.equal(Object.hasOwn(compatible.inspection, 'schemaVersion'), false);
  assert.equal(heldJournal.values.length, publicationCount);

  writeFileSync(join(root, 'src', 'a.txt'), 'post-ingest mutation\n');
  const second = await pipeline({ heldJournal }).service.ingestFrozen({
    inspection: rehydrated,
    candidateInput: { ...candidateInput, capability: gitCapability() },
    attemptRef,
  });
  assert.deepEqual(second.candidate, first.candidate);
  assert.equal(second.recovered, true);
  assert.equal(heldJournal.values.length, publicationCount);
});

test('ingestion rejects same-size content mutation and recomputed caller-forged freeze evidence', async (t) => {
  const { root, heldJournal, current, inspectionInput, candidateInput, attemptRef } =
    ingestionFixture(t, 'candidate_same_size');
  const inspection = current.service.freezeAttempt({ inspectionInput });
  const originalSize = Buffer.byteLength('attempt change\n');
  const replacement = `${'x'.repeat(originalSize - 1)}\n`;
  assert.equal(Buffer.byteLength(replacement), originalSize);
  writeFileSync(join(root, 'src', 'a.txt'), replacement);

  await assert.rejects(current.service.ingestFrozen({ inspection, candidateInput, attemptRef }),
    (error) => error.code === 'PIPELINE_INSPECTION_INVALID');
  assert.deepEqual(heldJournal.values.filter(({ kind }) => kind === 'operation')
    .map(({ value }) => value.state), ['intended']);
  assert.equal(heldJournal.values.some(({ kind }) => kind === 'candidate'), false);

  const forged = JSON.parse(JSON.stringify(inspection));
  forged.inspection.entries[0].contentDigest = digest('9');
  forged.inspection.inspectionDigest = canonicalDigest({
    workspace: forged.inspection.workspaceIdentity,
    changedPaths: forged.inspection.changedPaths,
    entries: forged.inspection.entries,
  });
  forged.freezeDigest = canonicalDigest({
    authority: forged.authority,
    inspection: forged.inspection,
  });
  await assert.rejects(current.service.ingestFrozen({
    inspection: forged,
    candidateInput: { ...candidateInput, candidateId: 'candidate_forged' },
    attemptRef,
  }), (error) => error.code === 'PIPELINE_INSPECTION_INVALID');
});

test('ingestion rejects symlink, hardlink, and same-content path replacements after freeze', async (t) => {
  for (const replacementKind of ['symlink', 'hardlink', 'path_swap']) {
    await t.test(replacementKind, async (nested) => {
      const { root, heldJournal, current, inspectionInput, candidateInput, attemptRef } =
        ingestionFixture(nested, `candidate_${replacementKind}`);
      const inspection = current.service.freezeAttempt({ inspectionInput });
      const outside = mkdtempSync(join(tmpdir(), `implementation-pipeline-${replacementKind}-`));
      nested.after(() => rmSync(outside, { recursive: true, force: true }));
      const target = join(root, 'src', 'a.txt');
      const outsideFile = join(outside, 'outside.txt');
      writeFileSync(outsideFile, 'attempt change\n');
      rmSync(target);
      if (replacementKind === 'symlink') {
        symlinkSync(outsideFile, target);
      } else if (replacementKind === 'hardlink') {
        linkSync(outsideFile, target);
      } else {
        renameSync(outsideFile, target);
      }

      await assert.rejects(current.service.ingestFrozen({ inspection, candidateInput, attemptRef }),
        (error) => error.code === 'PIPELINE_INSPECTION_INVALID');
      assert.deepEqual(heldJournal.values.filter(({ kind }) => kind === 'operation')
        .map(({ value }) => value.state), ['intended']);
      assert.equal(heldJournal.values.some(({ kind }) => kind === 'candidate'), false);
    });
  }
});

test('frozen evidence is closed and unknown fields cannot survive restart rehydration', async (t) => {
  const { heldJournal, current, inspectionInput, candidateInput, attemptRef } =
    ingestionFixture(t, 'candidate_unknown_field');
  const inspection = JSON.parse(JSON.stringify(current.service.freezeAttempt({ inspectionInput })));
  inspection.authority.untrusted = true;
  inspection.freezeDigest = canonicalDigest({
    authority: inspection.authority,
    inspection: inspection.inspection,
  });
  await assert.rejects(pipeline({ heldJournal }).service.ingestFrozen({
    inspection,
    candidateInput: { ...candidateInput, capability: gitCapability() },
    attemptRef,
  }), /unknown or missing fields/u);
  assert.equal(heldJournal.values.length, 0);
});
