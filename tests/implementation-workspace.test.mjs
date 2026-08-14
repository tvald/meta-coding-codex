import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  changedPathsWithinOwnership,
  inspectAttemptChanges,
  planAttemptWorkspace,
  workspaceIdentity,
} from '../lib/implementation-workspace.mjs';

const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()));

function command(root, args) {
  return execFileSync(git, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim();
}

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'implementation-workspace-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'base.txt'), 'base\n');
  writeFileSync(join(root, 'src', 'deleted.txt'), 'delete me\n');
  command(root, ['add', 'src/base.txt', 'src/deleted.txt']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

test('ownership validation is segment-aware and protects controller/task/Git paths', () => {
  assert.equal(changedPathsWithinOwnership(['src/a.mjs', 'src/nested/b.mjs'], { writePaths: ['src'] }), true);
  assert.equal(changedPathsWithinOwnership(['src-next/a.mjs'], { writePaths: ['src'] }), false);
  assert.equal(changedPathsWithinOwnership(['.git/config'], { writePaths: ['.git'] }), false);
  assert.equal(changedPathsWithinOwnership(['readme/tasks/store/control.json'], { writePaths: ['readme'] }), false);
  assert.throws(() => changedPathsWithinOwnership(['../escape'], { writePaths: ['src'] }), /path is invalid/u);
});

test('workspace inspection derives tracked, staged, untracked, and deleted paths after process emptiness', (t) => {
  const root = repository(t);
  const expectedWorkspaceDigest = workspaceIdentity(root).digest;
  writeFileSync(join(root, 'src', 'base.txt'), 'changed\n');
  writeFileSync(join(root, 'src', 'new.txt'), 'new\n');
  rmSync(join(root, 'src', 'deleted.txt'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'staged.txt'), 'staged\n');
  command(root, ['add', 'docs/staged.txt']);
  const inspected = inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src', 'docs'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  });
  assert.deepEqual(inspected.changedPaths, ['docs/staged.txt', 'src/base.txt', 'src/deleted.txt', 'src/new.txt']);
  assert.deepEqual(inspected.entries.map(({ kind }) => kind), ['file', 'file', 'deleted', 'file']);
  assert.throws(() => inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }), (error) => error.code === 'OWNERSHIP_VIOLATION');
  assert.throws(() => inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src', 'docs'], readPaths: [] },
    processDomainEmpty: false,
    gitExecutable: git,
  }), (error) => error.code === 'PROCESS_NOT_EMPTY');
});

test('changed symlinks, hardlinks, and special files are quarantined as unsafe', (t) => {
  const root = repository(t);
  const expectedWorkspaceDigest = workspaceIdentity(root).digest;
  symlinkSync('/etc/passwd', join(root, 'src', 'escape'));
  assert.throws(() => inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }), (error) => error.code === 'WORKSPACE_UNSAFE');
  rmSync(join(root, 'src', 'escape'));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'implementation-workspace-outside-'));
  t.after(() => rmSync(outsideRoot, { recursive: true, force: true }));
  const outside = join(outsideRoot, 'outside.txt');
  writeFileSync(outside, 'outside\n');
  linkSync(outside, join(root, 'src', 'linked.txt'));
  assert.throws(() => inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }), (error) => error.code === 'WORKSPACE_UNSAFE');
});

test('workspace write planning remains disabled without an external isolation attestation', () => {
  const plan = planAttemptWorkspace({
    runId: 'run_1', assignmentId: 'assignment_1', attemptId: 'attempt_1',
    baseCommit: 'a'.repeat(40), workspaceKind: 'linked_worktree',
  });
  assert.equal(plan.writeActivation, 'disabled');
  assert.equal(plan.reason, 'isolation_unproved');
  assert.equal(planAttemptWorkspace({ ...plan, isolationAttested: true }).writeActivation,
    'attestation_required_by_effect_gate');
});

test('Git inspection ignores hostile repository hooks and external diff configuration', (t) => {
  const root = repository(t);
  const sentinel = join(root, 'sentinel');
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(root, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\n: > "${sentinel}"\n`);
  chmodSync(join(root, '.git', 'hooks', 'pre-commit'), 0o755);
  command(root, ['config', 'diff.external', `sh -c ': > "${sentinel}"'`]);
  writeFileSync(join(root, 'src', 'base.txt'), 'changed\n');
  const inspected = inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest: workspaceIdentity(root).digest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  });
  assert.deepEqual(inspected.changedPaths, ['src/base.txt']);
  assert.equal(existsSync(sentinel), false);
});
