import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  observeImplementationRepository,
  planImplementationShadowStart,
  planProjectImplementationShadowStart,
  resolveImplementationGitExecutable,
} from '../lib/implementation-supervisor.mjs';
import { canonicalDigest } from '../lib/implementation-protocol.mjs';

const oid = (character) => character.repeat(40);
const digest = (label) => canonicalDigest({ label });
const git = fs.realpathSync(path.resolve(execFileSync('sh', ['-c', 'command -v git'], {
  encoding: 'utf8',
}).trim()));

function runGit(root, args) {
  return execFileSync(git, args, { cwd: root, encoding: 'utf8' }).trim();
}

function input(overrides = {}) {
  const policyDigest = digest('policy');
  return {
    command: {
      command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
      harness: 'codex', maxConcurrency: 2, shadow: true,
    },
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the deterministic implementation planner.',
      authority: 'User authorized T-0054.', route: 'initiative', risk: 'critical',
      gateDigest: digest('gate'),
      acceptance: [], nonGoals: [], assumptions: [], decisions: [], detailDigests: [],
      checkCatalogDigest: digest('checks'),
    },
    activeTaskId: 'T-0054',
    store: { storeId: 'task_store', storeGeneration: digest('store') },
    repository: {
      rootIdentity: digest('root'), objectFormat: 'sha1',
      baseCommit: oid('1'), head: oid('1'), tree: oid('2'), statusDigest: digest('status'),
      canonicalWorktreeIdentity: digest('worktree'),
    },
    provider: {
      adapter: 'codex_exec_v1', adapterVersion: '1.0.0', harness: 'codex',
      executableRealpath: '/opt/codex', executableVersion: '0.147.0',
    },
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0' },
    policies: { promptRegistry: policyDigest, checks: digest('checks'), resources: digest('resources') },
    quota: { disposition: 'proceed' },
    approvals: { current: true },
    observedAt: '2026-08-14T19:30:00Z',
    ...overrides,
  };
}

function assignment(id, writePath) {
  return {
    assignmentId: id,
    role: 'implementer',
    generation: 1,
    dependencies: [],
    ownership: { writePaths: [writePath], readPaths: [] },
    resources: [],
  };
}

test('shadow start runs the deterministic controller and scheduler with no effect authority', () => {
  const plan = planImplementationShadowStart(input({
    pendingAssignments: [
      assignment('work_b', 'lib/b.mjs'),
      assignment('work_a', 'lib/a.mjs'),
    ],
  }));
  assert.equal(plan.disposition, 'shadow_planned');
  assert.equal(plan.effectAuthority, false);
  assert.equal(plan.plan.effectAuthority, false);
  assert.deepEqual(plan.plan.background.hypotheticalIntents.map(({ assignmentId }) => assignmentId),
    ['work_a', 'work_b']);
  assert.deepEqual(plan.hypotheticalIntents.map(({ kind }) => kind), [
    'initialize_run', 'acquire_run_lock', 'publish_snapshot', 'accept_preflight', 'root_tick',
    'launch_job', 'launch_job',
  ]);
  assert.ok(plan.hypotheticalIntents.every(({ hypothetical }) => hypothetical === true));
  assert.equal(plan.initialSnapshot.phase, 'preflight');
  assert.equal(plan.readySnapshot.phase, 'dormant');
  assert.equal(plan.manifest.capsuleDigest, canonicalDigest(plan.capsule));
  assert.ok(Object.isFrozen(plan));
});

test('Ready-task shadow journals run, lock, detail, and Operation v1 before hypothetical activation', () => {
  const task = {
    id: 'T-0054', taskRevision: 2, recordVersion: 7, status: 'ready',
    outcome: 'Exercise the deterministic implementation planner.',
    authority: 'User authorized T-0054.', route: 'initiative', risk: 'critical',
    gateDigest: digest('gate'),
    acceptance: [], nonGoals: [], assumptions: [], decisions: [], detailDigests: [],
    checkCatalogDigest: digest('checks'),
  };
  const plan = planImplementationShadowStart(input({ task, activeTaskId: null }));
  assert.equal(plan.binding.taskRecordVersion, 8);
  assert.deepEqual(plan.hypotheticalIntents.slice(0, 9).map(({ kind }) => kind), [
    'initialize_run',
    'acquire_run_lock',
    'publish_activation_detail',
    'publish_activation_operation',
    'activate_task',
    'observe_task_activation',
    'publish_activation_receipt',
    'publish_activation_operation',
    'publish_activation_event',
  ]);
  assert.deepEqual(plan.hypotheticalIntents[4], {
    kind: 'activate_task', hypothetical: true, taskId: 'T-0054',
    taskRevision: 2, intentOnly: true, expectedRecordVersion: 7, resultingRecordVersion: 8,
  });
  assert.equal(plan.taskActivation.detail.recordType, 'task_activation_intent');
  assert.equal(plan.taskActivation.operation.recordVersion, 1);
  assert.equal(plan.taskActivation.operation.state, 'intended');
  assert.equal(plan.taskActivation.operation.receipt, null);
  assert.equal(task.status, 'ready');
  assert.equal(task.recordVersion, 7);
});

test('same observed state produces an identical shadow run and plan', () => {
  const first = planImplementationShadowStart(input());
  const second = planImplementationShadowStart(input());
  assert.deepEqual(second, first);
});

test('shadow start rejects stale task authority, another active task, and repository drift', () => {
  assert.throws(() => planImplementationShadowStart(input({
    command: {
      command: 'start', taskId: 'T-0054', expectedTaskRevision: 3,
      harness: 'codex', maxConcurrency: 2, shadow: true,
    },
  })), (error) => error.code === 'TASK_REVISION_STALE');
  assert.throws(() => planImplementationShadowStart(input({
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'ready',
      outcome: 'Exercise the deterministic implementation planner.',
      authority: 'User authorized T-0054.', route: 'initiative', risk: 'critical',
      gateDigest: digest('gate'),
      acceptance: [], nonGoals: [], assumptions: [], decisions: [], detailDigests: [],
      checkCatalogDigest: digest('checks'),
    },
    activeTaskId: 'T-0053',
  })), (error) => error.code === 'TASK_AUTHORITY_CONFLICT');
  assert.throws(() => planImplementationShadowStart(input({
    repository: {
      rootIdentity: digest('root'), objectFormat: 'sha1',
      baseCommit: oid('1'), head: oid('3'), tree: oid('2'), statusDigest: digest('status'),
      canonicalWorktreeIdentity: digest('worktree'),
    },
  })), (error) => error.code === 'REPOSITORY_STALE');
});

test('quota and approval observations flow through the scheduler and quiesce launches', () => {
  const plan = planImplementationShadowStart(input({
    pendingAssignments: [assignment('work_a', 'lib/a.mjs')],
    quota: { disposition: 'unavailable' },
    approvals: { current: false },
  }));
  assert.deepEqual(plan.plan.background.hypotheticalIntents, []);
  assert.deepEqual(plan.plan.background.waiting, [
    { assignmentId: 'work_a', reason: 'quota_unavailable' },
  ]);
  assert.ok(plan.hypotheticalIntents.every(({ kind }) => kind !== 'launch_job'));
});

test('repository start observation requires a clean canonical worktree without writing state', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'implementation-shadow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  runGit(root, ['init', '-q', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Test']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  await writeFile(path.join(root, 'tracked.txt'), 'base\n');
  runGit(root, ['add', 'tracked.txt']);
  runGit(root, ['commit', '-qm', 'base']);
  const clean = observeImplementationRepository({ repositoryRoot: root, gitExecutable: git });
  await writeFile(path.join(root, 'tracked.txt'), 'staged\n');
  runGit(root, ['add', 'tracked.txt']);
  await writeFile(path.join(root, 'tracked.txt'), 'working\n');
  await writeFile(path.join(root, 'untracked.txt'), 'untracked\n');
  assert.equal(clean.objectFormat, 'sha1');
  assert.throws(() => observeImplementationRepository({ repositoryRoot: root, gitExecutable: git }),
    (error) => error.code === 'REPOSITORY_DIRTY');
  assert.equal(runGit(root, ['status', '--porcelain']).split('\n').length, 2);
});

test('Git executable resolution returns the physical PATH-selected executable', () => {
  assert.equal(resolveImplementationGitExecutable({ PATH: path.dirname(git) }), git);
  assert.throws(() => resolveImplementationGitExecutable({ PATH: '/nonexistent' }),
    (error) => error.code === 'GIT_EXECUTABLE_UNAVAILABLE');
});

test('project shadow adapter derives gate, store, and repository facts from read-only inputs', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'implementation-project-shadow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  runGit(root, ['init', '-q', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Test']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  await writeFile(path.join(root, 'tracked.txt'), 'base\n');
  runGit(root, ['add', 'tracked.txt']);
  runGit(root, ['commit', '-qm', 'base']);
  const plan = planProjectImplementationShadowStart({
    command: input().command,
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise project shadow planning.',
      authority: { reference: 'Fixture authority.', acceptedDate: '2026-08-14' },
      route: 'quick_change', risk: 'low', gate: { kind: 'none' }, details: [],
    },
    activeTaskId: 'T-0054',
    storeGeneration: digest('store'),
    repositoryRoot: root,
    gitExecutable: git,
    provider: input().provider,
    observedAt: '2026-08-14T19:30:00Z',
  });
  assert.equal(plan.capsulePreview.storeGeneration, digest('store'));
  assert.equal(plan.capsulePreview.gateDigest, canonicalDigest({ kind: 'none' }));
  assert.equal(plan.effectAuthority, false);
  assert.throws(() => planProjectImplementationShadowStart({
    command: input().command,
    task: {
      id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise project shadow planning.',
      authority: { reference: 'Fixture authority.', acceptedDate: '2026-08-14' },
      route: 'quick_change', risk: 'low', gate: { kind: 'none' }, details: [],
    },
    activeTaskId: 'T-0054', taskStorePaused: true,
    storeGeneration: digest('store'), repositoryRoot: root, gitExecutable: git,
    provider: input().provider, observedAt: '2026-08-14T19:30:00Z',
  }), (error) => error.code === 'TASK_STORE_PAUSED');
});
