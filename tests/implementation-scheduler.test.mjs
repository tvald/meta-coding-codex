import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  planDispatch,
  planShadowDispatch,
  resourceClaimsConflict,
  writeOwnershipConflicts,
} from '../lib/implementation-scheduler.mjs';

function assignment(id, {
  role = 'implementer',
  writes = [`src/${id}.mjs`],
  resources = [],
  dependencies = [],
} = {}) {
  return {
    assignmentId: id,
    role,
    generation: 1,
    dependencies,
    ownership: { writePaths: writes, readPaths: [] },
    resources,
  };
}

test('path ownership treats segment prefixes as conflicts without string-prefix false positives', () => {
  assert.equal(writeOwnershipConflicts(assignment('a', { writes: ['lib/core'] }),
    assignment('b', { writes: ['lib/core/file.mjs'] })), true);
  assert.equal(writeOwnershipConflicts(assignment('a', { writes: ['lib/core'] }),
    assignment('b', { writes: ['lib/core-next/file.mjs'] })), false);
  assert.throws(() => writeOwnershipConflicts(assignment('a', { writes: ['../escape'] }), assignment('b')),
    /path is invalid/u);
});

test('resource claims preserve overlap except exact exclusive, namespace, or evidence-serialized keys', () => {
  const read = [{ key: 'cache:npm', mode: 'shared_read', namespace: null }];
  const first = [{ key: 'database:test', mode: 'namespaced_write', namespace: 'attempt_1' }];
  const second = [{ key: 'database:test', mode: 'namespaced_write', namespace: 'attempt_2' }];
  assert.equal(resourceClaimsConflict(read, first), false);
  assert.equal(resourceClaimsConflict(first, second), false);
  assert.equal(resourceClaimsConflict(first, [{ ...first[0] }]), true);
  assert.equal(resourceClaimsConflict(first, [{ key: 'database:test', mode: 'exclusive', namespace: null }]), true);
  assert.equal(resourceClaimsConflict(first, second, new Set(['database:test'])), true);
});

test('deterministic scheduler overlaps independent work within separate background and Root caps', () => {
  const pending = [
    assignment('work_b'),
    assignment('root_1', { role: 'root_decision', writes: [] }),
    assignment('work_a'),
    assignment('work_c'),
    assignment('work_d'),
    assignment('root_2', { role: 'root_decision', writes: [] }),
  ];
  const plan = planDispatch({ pending, caps: { background: 3, root: 1 } });
  assert.deepEqual(plan.dispatch, ['root_1', 'work_a', 'work_b', 'work_c']);
  assert.deepEqual(plan.observedConcurrency, { background: 3, root: 1 });
  assert.deepEqual(plan.waiting, [
    { assignmentId: 'root_2', reason: 'lane_wip' },
    { assignmentId: 'work_d', reason: 'lane_wip' },
  ]);
});

test('a planned independent batch can occupy real child-process barriers concurrently', async (t) => {
  const plan = planDispatch({
    pending: [assignment('barrier_a'), assignment('barrier_b')],
    caps: { background: 2, root: 0 },
  });
  assert.deepEqual(plan.dispatch, ['barrier_a', 'barrier_b']);
  const script = [
    "process.send({ type: 'ready', pid: process.pid });",
    "process.on('message', (message) => { if (message?.type === 'release') process.exit(0); });",
    'setTimeout(() => process.exit(2), 5000).unref();',
  ].join('\n');
  const children = plan.dispatch.map(() => spawn(process.execPath, ['--eval', script], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: {},
  }));
  t.after(() => children.forEach((child) => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }));
  const ready = await Promise.all(children.map((child) => new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`barrier child exited before release: ${code}`)));
  })));
  assert.equal(new Set(ready.map(({ pid }) => pid)).size, 2);
  assert.equal(children.every((child) => child.exitCode === null), true);
  const exitPromises = children.map((child) => new Promise((resolve) => {
    child.once('exit', resolve);
  }));
  children.forEach((child) => child.send({ type: 'release' }));
  const exits = await Promise.all(exitPromises);
  assert.deepEqual(exits, [0, 0]);
});

test('dependencies, path/resource conflicts, quota, approvals, and stop block only affected dispatch', () => {
  const integrated = assignment('dependent', { dependencies: [
    { assignmentId: 'base', condition: 'integrated', generation: 2 },
  ] });
  assert.deepEqual(planDispatch({ pending: [integrated], assignmentStates: {
    base: { generation: 2, integrated: false },
  } }).waiting, [{ assignmentId: 'dependent', reason: 'dependency_wait' }]);
  assert.deepEqual(planDispatch({ pending: [integrated], assignmentStates: {
    base: { generation: 2, integrated: true },
  } }).dispatch, ['dependent']);

  const running = [assignment('active', { writes: ['lib/controller'] })];
  const pending = [assignment('blocked', { writes: ['lib/controller/child.mjs'] }), assignment('free')];
  assert.deepEqual(planDispatch({ pending, running }).dispatch, ['free']);
  assert.deepEqual(planDispatch({ pending: [assignment('free')], quotaDisposition: 'suspend' }).waiting,
    [{ assignmentId: 'free', reason: 'quota_unavailable' }]);
  assert.deepEqual(planDispatch({ pending: [assignment('free')], approvalsCurrent: false }).waiting,
    [{ assignmentId: 'free', reason: 'approval_unavailable' }]);
  assert.deepEqual(planDispatch({ pending: [assignment('free')], stopRequested: true }).waiting,
    [{ assignmentId: 'free', reason: 'stop_requested' }]);
});

test('role caps can only lower WIP and evidence serialization affects only the exact key', () => {
  const database = (id, key, namespace) => assignment(id, { resources: [
    { key, mode: 'namespaced_write', namespace },
  ] });
  const pending = [
    database('db_a', 'database:test', 'a'),
    database('db_b', 'database:test', 'b'),
    database('cache', 'cache:test', 'c'),
  ];
  const roleLimited = planDispatch({ pending, caps: { background: 3, root: 1, roles: { implementer: 1 } } });
  assert.deepEqual(roleLimited.dispatch, ['cache']);
  const serialized = planDispatch({ pending, serializedResourceKeys: ['database:test'] });
  assert.deepEqual(serialized.dispatch, ['cache', 'db_a']);
  assert.deepEqual(serialized.waiting, [{ assignmentId: 'db_b', reason: 'ownership_or_resource_conflict' }]);
});

test('shadow plans are structurally non-authoritative', () => {
  const shadow = planShadowDispatch({ pending: [assignment('work')] });
  assert.equal(shadow.effectAuthority, false);
  assert.deepEqual(shadow.hypotheticalIntents, [
    { kind: 'launch_job', assignmentId: 'work', hypothetical: true },
  ]);
  assert.equal(Object.hasOwn(shadow, 'execute'), false);
});
