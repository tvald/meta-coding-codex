import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  authorizeProtectedImplementationEffect,
  changedPathsBetweenTrees,
  protectedImplementationCapabilityAllows,
} from '../lib/implementation-git.mjs';
import {
  FINALIZATION_BOUNDARIES,
  ImplementationFinalizationError,
  observeFinalizationPostconditions,
  runFinalization,
  selectFinalizationBoundary,
  validateFinalizationPlan,
} from '../lib/implementation-finalization.mjs';

const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()));
const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({
  runId: 'run_54', epoch: 1, snapshotRevision: 3, taskId: 'T-0054', taskRevision: 2,
  taskRecordVersion: 5, capsuleDigest: digest('a'), controlGeneration: 0,
  correctionGeneration: 0,
});

function command(root, args, { input = undefined } = {}) {
  return execFileSync(git, args, {
    cwd: root,
    input,
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

function patchDigest(root, fromTree, toTree) {
  const bytes = execFileSync(git, [
    'diff-tree', '--binary', '--full-index', '--no-ext-diff', '-r', '--no-renames',
    fromTree, toTree, '--',
  ], { cwd: root });
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function activation(effectKind) {
  const activationBinding = {
    runId: binding.runId,
    epoch: binding.epoch,
    taskId: binding.taskId,
    taskRevision: binding.taskRevision,
    taskRecordVersion: binding.taskRecordVersion,
    capsuleDigest: binding.capsuleDigest,
    controlGeneration: binding.controlGeneration,
    correctionGeneration: binding.correctionGeneration,
  };
  const receipt = {
    schemaVersion: 1,
    receiptId: `activation_${effectKind}`,
    effectKind,
    binding: activationBinding,
    policyDigest: digest('b'),
    evidenceDigest: digest('c'),
    mechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
    issuedAt: '2026-08-14T10:00:00Z',
    expiresAt: '2026-08-14T10:15:00Z',
    taskApproval: null,
  };
  return authorizeProtectedImplementationEffect({
    effectKind,
    receipt,
    current: {
      receiptId: receipt.receiptId,
      binding: { ...activationBinding },
      policyDigest: receipt.policyDigest,
      evidenceDigest: receipt.evidenceDigest,
      mechanism: { ...receipt.mechanism },
      taskApproval: null,
    },
    now: '2026-08-14T10:05:00Z',
  });
}

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-finalization-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet', '--initial-branch=main']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'feature.txt'), 'before\n');
  writeFileSync(join(root, 'task.json'), '{"status":"active","version":5}\n');
  command(root, ['add', '--', 'src/feature.txt', 'task.json']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  const baseCommit = command(root, ['rev-parse', 'HEAD']);
  const baseTree = command(root, ['rev-parse', 'HEAD^{tree}']);
  command(root, ['checkout', '--quiet', '--detach', baseCommit]);
  writeFileSync(join(root, 'src', 'feature.txt'), 'after\n');
  command(root, ['add', 'src/feature.txt']);
  command(root, ['commit', '--quiet', '-m', 'candidate']);
  const candidateCommit = command(root, ['rev-parse', 'HEAD']);
  const candidateTree = command(root, ['rev-parse', 'HEAD^{tree}']);
  command(root, ['checkout', '--quiet', 'main']);
  const candidate = Object.freeze({
    schemaVersion: 1,
    candidateId: 'candidate_final',
    binding: { ...binding },
    parentCandidateId: null,
    baseTree,
    tree: candidateTree,
    privateCommit: candidateCommit,
    producerAttempts: ['attempt_1'],
    changedPaths: ['src/feature.txt'],
    ownershipDigest: digest('d'),
    patchDigest: patchDigest(root, baseTree, candidateTree),
    createdAt: '2026-08-14T10:01:00Z',
  });
  const plan = Object.freeze({
    schemaVersion: 1,
    finalizationId: 'finalize_54',
    binding: { ...binding },
    candidate,
    repository: {
      targetRef: 'refs/heads/main',
      expectedParentCommit: baseCommit,
      expectedParentTree: baseTree,
    },
    publicationPaths: ['src/feature.txt'],
    task: {
      taskId: 'T-0054',
      taskRevision: 2,
      expectedRecordVersion: 5,
      completedRecordVersion: 6,
      expectedStatus: 'active',
      completedStatus: 'done',
      completionEvidenceDigest: digest('e'),
      taskPaths: ['task.json'],
    },
    requiredCheckReceipts: [
      { kind: 'check_receipt', id: 'check_qa', digest: digest('1') },
      { kind: 'check_receipt', id: 'check_security', digest: digest('2') },
    ],
    completion: {
      authorName: 'Meta Framework',
      authorEmail: 'meta@example.invalid',
      committerName: 'Meta Framework',
      committerEmail: 'meta@example.invalid',
      timestamp: '2026-08-14T10:06:00Z',
      message: 'feat(controller): finish T-0054\n',
    },
    terminal: { receiptId: 'terminal_54', emittedAt: '2026-08-14T10:07:00Z' },
  });

  let task = {
    taskId: 'T-0054', taskRevision: 2, recordVersion: 5, status: 'active',
    completionEvidenceDigest: null, changedPaths: [],
  };
  const taskPort = {
    closeCalls: 0,
    observe() {
      return { ...task, changedPaths: [...task.changedPaths] };
    },
    close(request, capability) {
      assert.equal(protectedImplementationCapabilityAllows(capability, 'task_mutation'), true);
      assert.deepEqual(request, {
        schemaVersion: 1,
        operation: 'close_task',
        taskId: 'T-0054',
        taskRevision: 2,
        expectedRecordVersion: 5,
        completedRecordVersion: 6,
        completionEvidenceDigest: digest('e'),
        expectedChangedPaths: ['task.json'],
      });
      if (task.recordVersion === 6) return;
      assert.equal(task.recordVersion, 5);
      taskPort.closeCalls += 1;
      writeFileSync(join(root, 'task.json'), '{"status":"done","version":6}\n');
      task = {
        taskId: 'T-0054', taskRevision: 2, recordVersion: 6, status: 'done',
        completionEvidenceDigest: digest('e'), changedPaths: ['task.json'],
      };
    },
    replace(value) {
      task = value;
    },
  };
  const records = new Map();
  const journalPort = {
    appendCalls: 0,
    read(finalizationId) {
      assert.equal(finalizationId, plan.finalizationId);
      return [...records.values()];
    },
    append(record, capability) {
      assert.equal(protectedImplementationCapabilityAllows(capability, 'ledger_write'), true);
      journalPort.appendCalls += 1;
      const previous = records.get(record.idempotencyKey);
      if (previous !== undefined) {
        assert.deepEqual(previous, record);
        return;
      }
      records.set(record.idempotencyKey, record);
    },
  };
  const capabilities = {
    gitAdmin: activation('git_admin'),
    taskMutation: activation('task_mutation'),
    finalRef: activation('final_ref'),
    ledgerWrite: activation('ledger_write'),
  };
  return { root, baseCommit, baseTree, candidateTree, plan, taskPort, journalPort, capabilities };
}

test('a validated finalization applies, closes through the injected CAS port, commits, CAS-publishes, and receipts', (t) => {
  const value = fixture(t);
  assert.equal(validateFinalizationPlan(value.plan), value.plan);
  const initial = observeFinalizationPostconditions({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort,
    gitAdminCapability: value.capabilities.gitAdmin,
  });
  assert.equal(selectFinalizationBoundary(value.plan, initial), 'candidate_apply');
  const result = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(result.disposition, 'succeeded');
  assert.deepEqual(result.boundariesApplied, FINALIZATION_BOUNDARIES);
  assert.equal(result.receipt.disposition, 'succeeded');
  assert.equal(result.receipt.taskRecordVersion, 6);
  assert.equal(value.taskPort.closeCalls, 1);
  assert.equal(command(value.root, ['rev-parse', 'HEAD']), result.receipt.finalCommit);
  assert.equal(command(value.root, ['rev-parse', 'HEAD^{tree}']), result.receipt.finalTree);
  assert.equal(command(value.root, ['status', '--porcelain']), '');
  assert.equal(readFileSync(join(value.root, 'src', 'feature.txt'), 'utf8'), 'after\n');
  assert.equal(readFileSync(join(value.root, 'task.json'), 'utf8'), '{"status":"done","version":6}\n');
});

for (const crashBoundary of FINALIZATION_BOUNDARIES) {
  test(`recovery advances from observed postconditions after response loss at ${crashBoundary}`, (t) => {
    const value = fixture(t);
    const effects = [];
    let crashPending = true;
    assert.throws(() => runFinalization({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
      hooks: {
        beforeEffect(boundary) { effects.push(boundary); },
        afterEffect(boundary) {
          if (crashPending && boundary === crashBoundary) {
            crashPending = false;
            throw new Error(`simulated response loss after ${boundary}`);
          }
        },
      },
    }), new RegExp(crashBoundary, 'u'));
    const recovered = runFinalization({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
      hooks: { beforeEffect(boundary) { effects.push(boundary); } },
    });
    assert.equal(recovered.disposition, 'succeeded');
    assert.equal(effects.filter((boundary) => boundary === crashBoundary).length, 1,
      'an effect whose response was lost must not be repeated');
    assert.equal(value.taskPort.closeCalls, 1);
    assert.equal(command(value.root, ['status', '--porcelain']), '');
  });
}

test('stale task CAS, stale target ref, unknown worktree dirt, and fake capabilities fail before effects', (t) => {
  const staleTask = fixture(t);
  staleTask.taskPort.replace({
    taskId: 'T-0054', taskRevision: 2, recordVersion: 7, status: 'active',
    completionEvidenceDigest: null, changedPaths: [],
  });
  assert.throws(() => runFinalization({
    plan: staleTask.plan, repositoryRoot: staleTask.root, gitExecutable: git,
    taskPort: staleTask.taskPort, journalPort: staleTask.journalPort,
    capabilities: staleTask.capabilities,
  }), (error) => error instanceof ImplementationFinalizationError &&
    error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');
  assert.equal(staleTask.taskPort.closeCalls, 0);

  const staleRef = fixture(t);
  const foreign = command(staleRef.root, [
    'commit-tree', staleRef.baseTree, '-p', staleRef.baseCommit,
  ], { input: 'foreign ref move\n' });
  command(staleRef.root, ['update-ref', 'refs/heads/main', foreign, staleRef.baseCommit]);
  assert.throws(() => runFinalization({
    plan: staleRef.plan, repositoryRoot: staleRef.root, gitExecutable: git,
    taskPort: staleRef.taskPort, journalPort: staleRef.journalPort,
    capabilities: staleRef.capabilities,
  }), (error) => error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');
  assert.equal(staleRef.taskPort.closeCalls, 0);

  const dirty = fixture(t);
  writeFileSync(join(dirty.root, 'unexpected.txt'), 'unknown\n');
  assert.throws(() => runFinalization({
    plan: dirty.plan, repositoryRoot: dirty.root, gitExecutable: git,
    taskPort: dirty.taskPort, journalPort: dirty.journalPort, capabilities: dirty.capabilities,
  }), (error) => error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');

  const fakeCapability = fixture(t);
  assert.throws(() => runFinalization({
    plan: fakeCapability.plan, repositoryRoot: fakeCapability.root, gitExecutable: git,
    taskPort: fakeCapability.taskPort, journalPort: fakeCapability.journalPort,
    capabilities: { ...fakeCapability.capabilities, finalRef: {} },
  }), (error) => error.code === 'ACTIVATION_DENIED');
});

test('known open-task dirt is preserved until the injected close port replaces it', (t) => {
  const value = fixture(t);
  writeFileSync(join(value.root, 'task.json'), '{"status":"active","version":5,"handoff":true}\n');
  const result = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(result.disposition, 'succeeded');
  assert.equal(value.taskPort.closeCalls, 1);
  assert.equal(command(value.root, ['status', '--porcelain']), '');
});

test('task close response loss is observed and never invokes the close port twice', (t) => {
  const value = fixture(t);
  let lost = true;
  const originalClose = value.taskPort.close.bind(value.taskPort);
  value.taskPort.close = (request, capability) => {
    originalClose(request, capability);
    if (lost) {
      lost = false;
      throw new Error('task CLI response lost');
    }
  };
  assert.throws(() => runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  }), /response lost/u);
  const recovered = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(recovered.disposition, 'succeeded');
  assert.equal(value.taskPort.closeCalls, 1);
});
