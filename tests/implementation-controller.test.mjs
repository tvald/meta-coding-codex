import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOrientation,
  coalesceWakeReasons,
  convergeRootProposal,
  doctorControllerState,
  planControllerTick,
  validateOrientation,
} from '../lib/implementation-controller.mjs';
import { canonicalDigest } from '../lib/implementation-protocol.mjs';

const digest = (label) => canonicalDigest({ label });
const oid = (character) => character.repeat(40);
const binding = Object.freeze({
  runId: 'run_54', epoch: 1, snapshotRevision: 2, taskId: 'T-0054', taskRevision: 2,
  taskRecordVersion: 5, capsuleDigest: digest('capsule'), controlGeneration: 0,
  correctionGeneration: 0,
});

function snapshot(phase = 'waiting') {
  return {
    schemaVersion: 1, runId: 'run_54', revision: 2, phase,
    stop: { requested: false, mode: null, reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
    updatedAt: '2026-08-14T10:00:00Z',
  };
}

function assignment(id) {
  return {
    assignmentId: id, role: 'implementer', generation: 1, dependencies: [],
    ownership: { writePaths: [`lib/${id}.mjs`], readPaths: [] }, resources: [],
  };
}

function orientation(overrides = {}) {
  const current = overrides.snapshot ?? snapshot();
  return buildOrientation({
    binding,
    snapshot: current,
    task: { id: 'T-0054', taskRevision: 2, recordVersion: 5, status: 'active' },
    repository: { baseCommit: oid('1'), head: oid('1'), tree: oid('2'), statusDigest: digest('status') },
    pendingAssignments: [], runningAssignments: [], assignmentStates: {}, verification: {}, controls: {},
    deadlines: {}, quota: { disposition: 'proceed' }, approvals: { current: true },
    observedAt: '2026-08-14T10:00:00Z',
    ...overrides,
  }).value;
}

test('orientations are bounded, closed, digest-bound snapshots', () => {
  const value = orientation();
  assert.equal(validateOrientation(value), value);
  assert.throws(() => validateOrientation({ ...value, rawProviderOutput: 'untrusted' }), /unknown or missing/u);
  assert.throws(() => orientation({ verification: { payload: 'x'.repeat(100_000) } }),
    /canonical protocol data exceeds/u);
  assert.deepEqual(coalesceWakeReasons(['provider_result', 'deadline_due', 'provider_result']),
    ['deadline_due', 'provider_result']);
});

test('stable waiting launches no Root tick while changed state coalesces one tick', () => {
  const current = snapshot();
  const value = orientation({ snapshot: current });
  const stable = planControllerTick({ snapshot: current, orientation: value });
  assert.equal(stable.disposition, 'waiting');
  assert.equal(stable.root, null);
  const changed = planControllerTick({ snapshot: current, orientation: value, stateChanged: true });
  assert.equal(changed.disposition, 'planned');
  assert.equal(changed.root.kind, 'root_tick');
  assert.equal(changed.effectAuthority, false);
});

test('background scheduling overlaps with a Root tick but remains hypothetical in shadow mode', () => {
  const current = snapshot();
  const value = orientation({
    snapshot: current,
    pendingAssignments: [assignment('work_b'), assignment('work_a')],
  });
  const plan = planControllerTick({ snapshot: current, orientation: value, stateChanged: true, caps: { background: 2, root: 1 } });
  assert.deepEqual(plan.background.hypotheticalIntents.map(({ assignmentId }) => assignmentId), ['work_a', 'work_b']);
  assert.equal(plan.root.kind, 'root_tick');
  assert.equal(plan.background.effectAuthority, false);
});

test('task revision, sticky stop, reconciliation, and stale snapshots dominate planning', () => {
  const current = snapshot();
  const value = orientation({ snapshot: current });
  assert.equal(planControllerTick({
    snapshot: current,
    orientation: { ...value, task: { ...value.task, taskRevision: 3 } },
  }).disposition, 'supersede');
  const stopped = snapshot();
  stopped.stop = { requested: true, mode: 'checkpoint', reasonDigest: digest('stop') };
  assert.equal(planControllerTick({ snapshot: stopped, orientation: orientation({ snapshot: stopped }) }).disposition, 'stop');
  const reconcile = snapshot('reconciliation_required');
  reconcile.reconciliation = { required: true, reasonCode: 'ambiguous', refs: [] };
  assert.equal(planControllerTick({
    snapshot: reconcile, orientation: orientation({ snapshot: reconcile }),
  }).disposition, 'quiesced');
  assert.throws(() => planControllerTick({ snapshot: { ...current, revision: 3 }, orientation: value }), /current snapshot/u);
});

test('Root proposals converge only against the exact orientation and never carry effect authority', () => {
  const value = orientation();
  const proposal = {
    schemaVersion: 1,
    rationale: 'Independent implementation slices are ready.',
    kind: 'declare_assignments',
    assignments: [{
      proposalId: 'proposal_1', role: 'implementer', goal: 'Implement one module.',
      scope: ['lib/module.mjs'], nonGoals: [], dependencies: [],
      ownership: { writePaths: ['lib/module.mjs'], readPaths: [] }, resources: [], checks: ['unit'],
      restartPolicy: 'fresh_attempt',
    }],
  };
  const converged = convergeRootProposal({
    proposal, orientation: value, expectedOrientationDigest: canonicalDigest(value),
  });
  assert.equal(converged.decisionKind, 'declare_assignments');
  assert.equal(converged.effectAuthority, false);
  assert.deepEqual(converged.intents.map(({ proposalId }) => proposalId), ['proposal_1']);
  assert.throws(() => convergeRootProposal({
    proposal, orientation: value, expectedOrientationDigest: digest('stale'),
  }), /stale orientation/u);
});

test('controller doctor reports exact reconciliation conditions', () => {
  const current = snapshot();
  const value = orientation({ snapshot: current });
  assert.deepEqual(doctorControllerState({ snapshot: current, orientation: value }), {
    ok: true, disposition: 'healthy', issues: [],
  });
  assert.equal(doctorControllerState({ snapshot: { ...current, revision: 3 }, orientation: value }).disposition,
    'reconciliation_required');
});
