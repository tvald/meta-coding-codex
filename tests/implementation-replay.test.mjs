import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ImplementationReplayError,
  replayImplementationTrace,
  replayImplementationTraces,
} from '../lib/implementation-replay.mjs';

const fixtureUrl = new URL('./fixtures/implementation-traces-v1.json', import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function byId(results, id) {
  return results.find(({ traceId }) => traceId === id);
}

test('minimized implementation traces replay to the normalized safe outcomes', async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.traces.length, 8);
  const before = structuredClone(fixture.traces);
  const results = replayImplementationTraces(fixture.traces);

  assert.deepEqual(fixture.traces, before, 'replay must not mutate trace evidence');
  assert.deepEqual(byId(results, 'handoff').run, {
    phase: 'waiting', revision: 5, stopRequested: false,
  });
  assert.deepEqual(byId(results, 'handoff').observations.at(-1).result, {
    action: 'none', reason: 'stable_wait',
  });

  const increments = byId(results, 'concurrent_increments');
  assert.deepEqual(increments.run, { phase: 'orienting', revision: 8, stopRequested: false });
  assert.deepEqual(increments.observations.at(-1), {
    index: 1, action: 'transition_run', outcome: 'rejected', code: 'STALE_STATE',
  });

  const notifications = byId(results, 'duplicate_reordered_notifications');
  assert.deepEqual(notifications.eventReplay, { cursor: 3, dedupeKeys: ['first', 'second'] });
  assert.equal(notifications.observations.at(-1).code, 'EVENT_GAP');

  const stopped = byId(results, 'stop_divergence');
  assert.equal(stopped.observations[0].result, false);
  assert.equal(stopped.observations[1].code, 'STOP_DOMINATES');
  assert.deepEqual(stopped.run, { phase: 'stopping', revision: 4, stopRequested: true });

  const fences = byId(results, 'fence_and_revision_divergence');
  assert.deepEqual(fences.observations.map(({ result }) => result), [true, false, true, false]);

  const acknowledgement = byId(results, 'acknowledgement_boundary');
  assert.equal(acknowledgement.observations[0].result, false);
  assert.equal(acknowledgement.observations.at(-1).result, true);
  assert.deepEqual(acknowledgement.operation, {
    state: 'observed_succeeded', recordVersion: 2, acknowledged: true,
  });

  assert.deepEqual(byId(results, 'quota_divergence').run, {
    phase: 'failed', revision: 2, stopRequested: false,
  });
  assert.deepEqual(byId(results, 'ownership_divergence').attempt, {
    state: 'quarantined', recordVersion: 7,
  });
  assert.equal(Object.isFrozen(results), true);
  assert.equal(Object.isFrozen(results[0].observations), true);
});

test('event replay is invariant to notification order and identical duplicate position', async () => {
  const fixture = await loadFixture();
  const original = fixture.traces.find(({ id }) => id === 'duplicate_reordered_notifications');
  const ordered = structuredClone(original);
  ordered.steps[0].events.sort((left, right) => left.sequence - right.sequence);
  const reordered = structuredClone(original);
  reordered.steps[0].events = [
    reordered.steps[0].events[1],
    reordered.steps[0].events[2],
    reordered.steps[0].events[0],
  ];
  assert.deepEqual(replayImplementationTrace(ordered), replayImplementationTrace(original));
  assert.deepEqual(replayImplementationTrace(reordered), replayImplementationTrace(original));
});

test('replay bounds steps and fails closed on an unmet expected rejection', async () => {
  const fixture = await loadFixture();
  const oversized = structuredClone(fixture.traces[0]);
  oversized.steps = Array.from({ length: 129 }, () => ({
    action: 'plan_orientation', stateChanged: false, deadlineDue: false,
  }));
  assert.throws(() => replayImplementationTrace(oversized),
    (error) => error instanceof ImplementationReplayError && error.code === 'REPLAY_LIMIT');

  const unmet = structuredClone(fixture.traces.find(({ id }) => id === 'concurrent_increments'));
  unmet.steps = [unmet.steps[0]];
  unmet.steps[0].expectedError = 'STALE_STATE';
  assert.throws(() => replayImplementationTrace(unmet),
    (error) => error instanceof ImplementationReplayError && error.code === 'REPLAY_EXPECTATION_FAILED');
});
