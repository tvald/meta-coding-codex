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
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  changedPathsWithinOwnership,
  cleanupAttemptWorkspace,
  allocateAttemptWorkspace,
  inspectAttemptChanges,
  planAttemptWorkspace,
  workspaceIdentity,
} = await import('../lib/implementation-workspace.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');

const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()));
const NOW = '2026-08-14T12:00:00Z';

function activation(effectKind, runId = 'run_1') {
  const binding = {
    runId, epoch: 1, taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 8,
    capsuleDigest: `sha256:${'a'.repeat(64)}`, controlGeneration: 0, correctionGeneration: 0,
  };
  const receipt = {
    schemaVersion: 1,
    receiptId: `${effectKind}_receipt`,
    effectKind,
    binding,
    policyDigest: `sha256:${'b'.repeat(64)}`,
    evidenceDigest: `sha256:${'c'.repeat(64)}`,
    mechanism: { platform: 'linux', filesystem: 'local', process: 'pidfd' },
    issuedAt: '2026-08-14T11:55:00Z',
    expiresAt: '2026-08-14T12:05:00Z',
    taskApproval: null,
  };
  return {
    activationReceipt: receipt,
    activationContext: {
      receiptId: receipt.receiptId,
      binding: { ...binding },
      policyDigest: receipt.policyDigest,
      evidenceDigest: receipt.evidenceDigest,
      mechanism: { ...receipt.mechanism },
      taskApproval: null,
    },
    now: NOW,
    effectCapability: issueSourceInstrumentedEffectCapability(effectKind),
  };
}

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

test('mandatory agent, framework, task, package, prompt, bin, and library paths cannot be subtracted', () => {
  const protectedPaths = [
    '.agents/skills/task-recovery/SKILL.md',
    '.claude/agents/meta_implementer.md',
    '.codex/agents/meta_implementer.toml',
    '.git/config',
    'AGENTS.md',
    'CLAUDE.md',
    'bin/meta-framework.mjs',
    'lib/implementation-workspace.mjs',
    'package-files.json',
    'package-lock.json',
    'package.json',
    'prompts/agent-profiles/root.md',
    'readme/README.md',
    'readme/meta/root-loop.md',
    'readme/tasks/README.md',
    'readme/tasks/store/records/0000/T-0054.json',
    'scripts/check-npm-package.mjs',
  ];
  for (const protectedPath of protectedPaths) {
    assert.equal(changedPathsWithinOwnership([protectedPath], { writePaths: [protectedPath] }, {
      protectedPaths: [],
    }), false, `${protectedPath} must remain protected`);
  }
  assert.equal(changedPathsWithinOwnership(['src/private.txt'], { writePaths: ['src'] }, {
    protectedPaths: ['src/private.txt'],
  }), false);
  assert.equal(changedPathsWithinOwnership(['src/public.txt'], { writePaths: ['src'] }, {
    protectedPaths: [],
  }), true);
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
  assert.ok(inspected.entries.filter(({ kind }) => kind === 'file')
    .every(({ contentDigest }) => /^sha256:[0-9a-f]{64}$/u.test(contentDigest)));
  assert.equal(inspected.entries.find(({ kind }) => kind === 'deleted').contentDigest, null);
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

test('workspace inspection binds exact changed bytes independently of size and inode identity', (t) => {
  const root = repository(t);
  const expectedWorkspaceDigest = workspaceIdentity(root).digest;
  writeFileSync(join(root, 'src', 'base.txt'), 'left\n');
  const first = inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }).entries.find(({ path }) => path === 'src/base.txt');
  writeFileSync(join(root, 'src', 'base.txt'), 'next\n');
  const second = inspectAttemptChanges({
    workspaceRoot: root,
    expectedWorkspaceDigest,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }).entries.find(({ path }) => path === 'src/base.txt');
  assert.equal(first.identity, second.identity);
  assert.notEqual(first.contentDigest, second.contentDigest);
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

test('isolated-clone allocation, inspection, and exact cleanup stay activation gated', (t) => {
  const source = repository(t);
  const baseCommit = command(source, ['rev-parse', 'HEAD']);
  const workspaceParent = mkdtempSync(join(tmpdir(), 'implementation-attempts-'));
  chmodSync(workspaceParent, 0o700);
  t.after(() => rmSync(workspaceParent, { recursive: true, force: true }));
  const plan = planAttemptWorkspace({
    runId: 'run_1', assignmentId: 'assignment_1', attemptId: 'attempt_1',
    baseCommit, workspaceKind: 'isolated_clone', isolationAttested: true,
  });
  assert.throws(() => allocateAttemptWorkspace({
    plan, repositoryRoot: source, workspaceParent, gitExecutable: git,
  }), (error) => error.code === 'ACTIVATION_REQUIRED');
  assert.equal(existsSync(join(workspaceParent, 'attempt_1')), false);

  const allocation = allocateAttemptWorkspace({
    plan, repositoryRoot: source, workspaceParent, gitExecutable: git,
    ...activation('workspace_write'),
  });
  assert.equal(allocation.workspaceKind, 'isolated_clone');
  assert.equal(workspaceIdentity(allocation.workspaceRoot).digest, allocation.rootIdentity);
  assert.equal(command(allocation.workspaceRoot, ['rev-parse', 'HEAD']), baseCommit);
  assert.equal(fsMode(join(allocation.workspaceRoot, '.git')), 0o500);
  writeFileSync(join(allocation.workspaceRoot, 'src', 'base.txt'), 'isolated change\n');
  assert.deepEqual(inspectAttemptChanges({
    workspaceRoot: allocation.workspaceRoot,
    expectedWorkspaceDigest: allocation.rootIdentity,
    ownership: { writePaths: ['src'], readPaths: [] },
    processDomainEmpty: true,
    gitExecutable: git,
  }).changedPaths, ['src/base.txt']);
  assert.throws(() => cleanupAttemptWorkspace({
    allocation, workspaceParent, processDomainEmpty: false, ...activation('cleanup'),
  }), (error) => error.code === 'PROCESS_NOT_EMPTY');
  assert.equal(existsSync(allocation.workspaceRoot), true);
  assert.equal(cleanupAttemptWorkspace({
    allocation, workspaceParent, processDomainEmpty: true, ...activation('cleanup'),
  }).outcome, 'removed');
  assert.equal(existsSync(allocation.workspaceRoot), false);
});

test('linked-worktree allocation remains disabled even with a write-shaped receipt', (t) => {
  const source = repository(t);
  const workspaceParent = mkdtempSync(join(tmpdir(), 'implementation-attempts-'));
  chmodSync(workspaceParent, 0o700);
  t.after(() => rmSync(workspaceParent, { recursive: true, force: true }));
  const plan = planAttemptWorkspace({
    runId: 'run_1', assignmentId: 'assignment_1', attemptId: 'attempt_1',
    baseCommit: command(source, ['rev-parse', 'HEAD']), workspaceKind: 'linked_worktree',
    isolationAttested: true,
  });
  assert.throws(() => allocateAttemptWorkspace({
    plan, repositoryRoot: source, workspaceParent, gitExecutable: git,
    ...activation('workspace_write'),
  }), (error) => error.code === 'ISOLATION_UNPROVED');
});

function fsMode(target) {
  return realpathSync(target) === target ? (statSync(target).mode & 0o777) : null;
}
