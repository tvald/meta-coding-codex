import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { canonicalDigest } from '../lib/implementation-protocol.mjs';
import {
  ImplementationGitError,
  applyCandidateTree,
  authorizeProtectedImplementationEffect,
  changedPathsBetweenTrees,
  compareAndSwapRef,
  createCompletionCommit,
  indexMatchesTree,
  integratePrivateCandidate,
  observeCandidateFacts,
  observeRef,
  stageExactPaths,
  worktreePathsMatchTree,
} from '../lib/implementation-git.mjs';

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

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-git-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet', '--initial-branch=main']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.txt'), 'a0\n');
  writeFileSync(join(root, 'src', 'b.txt'), 'b0\n');
  writeFileSync(join(root, 'task.json'), '{"status":"active","version":5}\n');
  command(root, ['add', '--', 'src/a.txt', 'src/b.txt', 'task.json']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  return { root, baseCommit: command(root, ['rev-parse', 'HEAD']), baseTree: command(root, ['rev-parse', 'HEAD^{tree}']) };
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
  const current = {
    receiptId: receipt.receiptId,
    binding: { ...activationBinding },
    policyDigest: receipt.policyDigest,
    evidenceDigest: receipt.evidenceDigest,
    mechanism: { ...receipt.mechanism },
    taskApproval: null,
  };
  return authorizeProtectedImplementationEffect({
    effectKind,
    receipt,
    current,
    now: '2026-08-14T10:05:00Z',
  });
}

function patchDigest(root, fromTree, toTree) {
  const bytes = execFileSync(git, [
    'diff-tree', '--binary', '--full-index', '--no-ext-diff', '-r', '--no-renames',
    fromTree, toTree, '--',
  ], { cwd: root });
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function candidate(root, candidateId, commit, baseCommit, producerAttempt) {
  const baseTree = command(root, ['rev-parse', `${baseCommit}^{tree}`]);
  const tree = command(root, ['rev-parse', `${commit}^{tree}`]);
  const changedPaths = changedPathsBetweenTrees({ repositoryRoot: root, gitExecutable: git, fromTree: baseTree, toTree: tree });
  return Object.freeze({
    schemaVersion: 1,
    candidateId,
    binding: { ...binding },
    parentCandidateId: null,
    baseTree,
    tree,
    privateCommit: commit,
    producerAttempts: producerAttempt === null ? [] : [producerAttempt],
    changedPaths,
    ownershipDigest: digest('d'),
    patchDigest: patchDigest(root, baseTree, tree),
    createdAt: '2026-08-14T10:01:00Z',
  });
}

function branchCandidate(root, name, baseCommit, relativePath, contents, attemptId) {
  command(root, ['checkout', '--quiet', '--detach', baseCommit]);
  writeFileSync(join(root, ...relativePath.split('/')), contents);
  command(root, ['add', '--', relativePath]);
  command(root, ['commit', '--quiet', '-m', name]);
  const commit = command(root, ['rev-parse', 'HEAD']);
  return candidate(root, name, commit, baseCommit, attemptId);
}

function integrationBase(root, baseCommit, baseTree) {
  const commit = command(root, ['commit-tree', baseTree, '-p', baseCommit], { input: 'integration base\n' });
  return candidate(root, 'candidate_base', commit, baseCommit, null);
}

const metadata = Object.freeze({
  authorName: 'Meta Framework',
  authorEmail: 'meta@example.invalid',
  committerName: 'Meta Framework',
  committerEmail: 'meta@example.invalid',
  timestamp: '2026-08-14T10:06:00Z',
  message: 'Integrate private candidate\n',
});

test('private candidates integrate two disjoint changes without moving the canonical ref', (t) => {
  const { root, baseCommit, baseTree } = repository(t);
  const first = branchCandidate(root, 'candidate_a', baseCommit, 'src/a.txt', 'a1\n', 'attempt_1');
  const second = branchCandidate(root, 'candidate_b', baseCommit, 'src/b.txt', 'b1\n', 'attempt_2');
  command(root, ['checkout', '--quiet', 'main']);
  const initial = integrationBase(root, baseCommit, baseTree);
  const capability = activation('git_admin');
  const integratedA = integratePrivateCandidate({
    repositoryRoot: root, gitExecutable: git, currentCandidate: initial,
    incomingCandidate: first, expectedPrivateHead: initial.privateCommit, binding,
    candidateId: 'candidate_integrated_a', producerAttempts: ['attempt_1'],
    allowedPaths: ['src'], ownershipDigest: digest('d'),
    createdAt: '2026-08-14T10:06:00Z', commitMetadata: metadata, capability,
  }).candidate;
  const integratedB = integratePrivateCandidate({
    repositoryRoot: root, gitExecutable: git, currentCandidate: integratedA,
    incomingCandidate: second, expectedPrivateHead: integratedA.privateCommit, binding,
    candidateId: 'candidate_integrated_b', producerAttempts: ['attempt_1', 'attempt_2'],
    allowedPaths: ['src'], ownershipDigest: digest('d'),
    createdAt: '2026-08-14T10:07:00Z',
    commitMetadata: { ...metadata, timestamp: '2026-08-14T10:07:00Z' }, capability,
  }).candidate;
  assert.deepEqual(integratedB.changedPaths, ['src/b.txt']);
  assert.equal(command(root, ['show', `${integratedB.tree}:src/a.txt`]), 'a1');
  assert.equal(command(root, ['show', `${integratedB.tree}:src/b.txt`]), 'b1');
  assert.equal(observeRef({ repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main' }), baseCommit);
  assert.deepEqual(observeCandidateFacts({ repositoryRoot: root, gitExecutable: git, candidate: integratedB }).changedPaths,
    ['src/b.txt']);
  assert.equal(integratePrivateCandidate({
    repositoryRoot: root, gitExecutable: git, currentCandidate: integratedB,
    incomingCandidate: first, expectedPrivateHead: integratedB.privateCommit, binding,
    candidateId: 'candidate_duplicate', producerAttempts: ['attempt_1', 'attempt_2'],
    allowedPaths: ['src'], ownershipDigest: digest('d'), createdAt: '2026-08-14T10:08:00Z',
    commitMetadata: { ...metadata, timestamp: '2026-08-14T10:08:00Z' }, capability,
  }).outcome, 'already_integrated');
});

test('integration rejects stale private heads, stale bases, conflicts, and forged candidate facts', (t) => {
  const { root, baseCommit, baseTree } = repository(t);
  const first = branchCandidate(root, 'candidate_a', baseCommit, 'src/a.txt', 'left\n', 'attempt_1');
  const conflict = branchCandidate(root, 'candidate_conflict', baseCommit, 'src/a.txt', 'right\n', 'attempt_2');
  command(root, ['checkout', '--quiet', 'main']);
  const initial = integrationBase(root, baseCommit, baseTree);
  const capability = activation('git_admin');
  const common = {
    repositoryRoot: root, gitExecutable: git, currentCandidate: initial, incomingCandidate: first,
    binding, candidateId: 'candidate_integrated', producerAttempts: ['attempt_1'],
    allowedPaths: ['src'], ownershipDigest: digest('d'), createdAt: '2026-08-14T10:06:00Z',
    commitMetadata: metadata, capability,
  };
  assert.throws(() => integratePrivateCandidate({ ...common, expectedPrivateHead: baseCommit }),
    (error) => error instanceof ImplementationGitError && error.code === 'GIT_STALE_PRIVATE_HEAD');
  assert.throws(() => observeCandidateFacts({
    repositoryRoot: root, gitExecutable: git,
    candidate: { ...first, changedPaths: ['src/b.txt'] },
  }), (error) => error.code === 'GIT_CANDIDATE_MISMATCH');
  const integrated = integratePrivateCandidate({ ...common, expectedPrivateHead: initial.privateCommit }).candidate;
  assert.throws(() => integratePrivateCandidate({
    ...common, currentCandidate: integrated, incomingCandidate: conflict,
    expectedPrivateHead: integrated.privateCommit, candidateId: 'candidate_conflicted',
    producerAttempts: ['attempt_1', 'attempt_2'],
  }), (error) => error.code === 'GIT_CONFLICT');

  command(root, ['checkout', '--quiet', '--detach', baseCommit]);
  writeFileSync(join(root, 'src', 'b.txt'), 'stale-base\n');
  command(root, ['add', 'src/b.txt']);
  command(root, ['commit', '--quiet', '-m', 'stale base']);
  const staleBaseCommit = command(root, ['rev-parse', 'HEAD']);
  const stale = branchCandidate(root, 'candidate_stale', staleBaseCommit, 'src/a.txt', 'stale\n', 'attempt_3');
  assert.throws(() => integratePrivateCandidate({
    ...common, currentCandidate: integrated, incomingCandidate: stale,
    expectedPrivateHead: integrated.privateCommit, candidateId: 'candidate_stale_result',
    producerAttempts: ['attempt_1', 'attempt_3'],
  }), (error) => error.code === 'GIT_STALE_BASE');
});

test('effects deny serializable lookalikes and target refs use expected-old-OID CAS', (t) => {
  const { root, baseCommit, baseTree } = repository(t);
  const nextCommit = command(root, ['commit-tree', baseTree, '-p', baseCommit], { input: 'next\n' });
  assert.throws(() => compareAndSwapRef({
    repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main',
    expectedOldOid: baseCommit, newOid: nextCommit, capability: {},
  }), (error) => error.code === 'ACTIVATION_DENIED');
  const capability = activation('final_ref');
  assert.equal(compareAndSwapRef({
    repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main',
    expectedOldOid: baseCommit, newOid: nextCommit, capability,
  }).outcome, 'advanced');
  assert.equal(compareAndSwapRef({
    repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main',
    expectedOldOid: baseCommit, newOid: nextCommit, capability,
  }).outcome, 'already_applied');
  const another = command(root, ['commit-tree', baseTree, '-p', nextCommit], { input: 'another\n' });
  assert.throws(() => compareAndSwapRef({
    repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main',
    expectedOldOid: baseCommit, newOid: another, capability,
  }), (error) => error.code === 'GIT_STALE_REF');
});

test('candidate apply, exact staging, and commit-tree preserve exact repository facts', (t) => {
  const { root, baseCommit, baseTree } = repository(t);
  const source = branchCandidate(root, 'candidate_a', baseCommit, 'src/a.txt', 'a1\n', 'attempt_1');
  command(root, ['checkout', '--quiet', 'main']);
  const gitCapability = activation('git_admin');
  assert.throws(() => applyCandidateTree({
    repositoryRoot: root, gitExecutable: git, operationId: 'apply_1', expectedTree: baseTree,
    targetTree: source.tree, allowedPaths: ['src'], capability: {},
  }), (error) => error.code === 'ACTIVATION_DENIED');
  assert.equal(applyCandidateTree({
    repositoryRoot: root, gitExecutable: git, operationId: 'apply_1', expectedTree: baseTree,
    targetTree: source.tree, allowedPaths: ['src'], capability: gitCapability,
  }).outcome, 'applied');
  assert.equal(indexMatchesTree({ repositoryRoot: root, gitExecutable: git, tree: source.tree }), true);
  assert.equal(worktreePathsMatchTree({
    repositoryRoot: root, gitExecutable: git, tree: source.tree, paths: ['src/a.txt'],
  }), true);
  assert.equal(applyCandidateTree({
    repositoryRoot: root, gitExecutable: git, operationId: 'apply_1', expectedTree: baseTree,
    targetTree: source.tree, allowedPaths: ['src'], capability: gitCapability,
  }).outcome, 'already_applied');

  writeFileSync(join(root, 'task.json'), '{"status":"done","version":6}\n');
  const stagedTree = stageExactPaths({
    repositoryRoot: root, gitExecutable: git, baseTree: source.tree,
    paths: ['task.json'], capability: gitCapability,
  });
  assert.deepEqual(changedPathsBetweenTrees({
    repositoryRoot: root, gitExecutable: git, fromTree: source.tree, toTree: stagedTree,
  }), ['task.json']);
  const completion = createCompletionCommit({
    repositoryRoot: root, gitExecutable: git, tree: stagedTree, parentCommit: baseCommit,
    metadata: { ...metadata, message: 'feat(controller): complete disposable run\n' },
    capability: gitCapability,
  });
  compareAndSwapRef({
    repositoryRoot: root, gitExecutable: git, refName: 'refs/heads/main',
    expectedOldOid: baseCommit, newOid: completion.commit, capability: activation('final_ref'),
  });
  assert.equal(command(root, ['status', '--porcelain']), '');
  assert.equal(command(root, ['rev-parse', 'HEAD^{tree}']), stagedTree);
});

test('plumbing integration does not execute repository hooks or configured external diff', (t) => {
  const { root, baseCommit, baseTree } = repository(t);
  const source = branchCandidate(root, 'candidate_a', baseCommit, 'src/a.txt', 'a1\n', 'attempt_1');
  command(root, ['checkout', '--quiet', 'main']);
  const sentinel = join(root, 'sentinel');
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(root, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\n: > "${sentinel}"\n`);
  chmodSync(join(root, '.git', 'hooks', 'pre-commit'), 0o755);
  command(root, ['config', 'diff.external', `sh -c ': > "${sentinel}"'`]);
  const initial = integrationBase(root, baseCommit, baseTree);
  integratePrivateCandidate({
    repositoryRoot: root, gitExecutable: git, currentCandidate: initial,
    incomingCandidate: source, expectedPrivateHead: initial.privateCommit, binding,
    candidateId: 'candidate_integrated', producerAttempts: ['attempt_1'],
    allowedPaths: ['src'], ownershipDigest: canonicalDigest({ writePaths: ['src'] }),
    createdAt: '2026-08-14T10:06:00Z', commitMetadata: metadata,
    capability: activation('git_admin'),
  });
  assert.equal(existsSync(sentinel), false);
});

test('overlapping text integration bypasses repository-configured merge drivers', (t) => {
  const fixture = repository(t);
  writeFileSync(join(fixture.root, 'src', 'a.txt'), 'line one\nkeep two\nkeep three\nkeep four\nline five\n');
  writeFileSync(join(fixture.root, '.gitattributes'), 'src/a.txt merge=hostile\n');
  command(fixture.root, ['add', '--', '.gitattributes', 'src/a.txt']);
  command(fixture.root, ['commit', '--quiet', '--amend', '--no-edit']);
  const baseCommit = command(fixture.root, ['rev-parse', 'HEAD']);
  const baseTree = command(fixture.root, ['rev-parse', 'HEAD^{tree}']);
  const first = branchCandidate(fixture.root, 'candidate_left', baseCommit,
    'src/a.txt', 'LINE ONE\nkeep two\nkeep three\nkeep four\nline five\n', 'attempt_1');
  const second = branchCandidate(fixture.root, 'candidate_right', baseCommit,
    'src/a.txt', 'line one\nkeep two\nkeep three\nkeep four\nLINE FIVE\n', 'attempt_2');
  command(fixture.root, ['checkout', '--quiet', 'main']);
  const sentinel = join(fixture.root, 'merge-driver-ran');
  command(fixture.root, ['config', 'merge.hostile.driver', `sh -c ': > "${sentinel}"; exit 1'`]);
  const initial = integrationBase(fixture.root, baseCommit, baseTree);
  const capability = activation('git_admin');
  const integratedA = integratePrivateCandidate({
    repositoryRoot: fixture.root, gitExecutable: git, currentCandidate: initial,
    incomingCandidate: first, expectedPrivateHead: initial.privateCommit, binding,
    candidateId: 'candidate_merged_left', producerAttempts: ['attempt_1'],
    allowedPaths: ['src'], ownershipDigest: digest('d'),
    createdAt: '2026-08-14T10:06:00Z', commitMetadata: metadata, capability,
  }).candidate;
  const integratedB = integratePrivateCandidate({
    repositoryRoot: fixture.root, gitExecutable: git, currentCandidate: integratedA,
    incomingCandidate: second, expectedPrivateHead: integratedA.privateCommit, binding,
    candidateId: 'candidate_merged_right', producerAttempts: ['attempt_1', 'attempt_2'],
    allowedPaths: ['src'], ownershipDigest: digest('d'),
    createdAt: '2026-08-14T10:07:00Z',
    commitMetadata: { ...metadata, timestamp: '2026-08-14T10:07:00Z' }, capability,
  }).candidate;
  assert.equal(command(fixture.root, ['show', `${integratedB.tree}:src/a.txt`]),
    'LINE ONE\nkeep two\nkeep three\nkeep four\nLINE FIVE');
  assert.equal(existsSync(sentinel), false);
});
