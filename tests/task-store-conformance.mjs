import assert from "node:assert/strict";
import test from "node:test";

import {
  planAddTask,
  planAmendTask,
  planPause,
} from "../readme/meta/framework-data/task-application.mjs";
import {
  TASK_STORE_PROTOCOL_VERSION,
  assertTaskStore,
  normalizeStoreSnapshot,
} from "../readme/meta/framework-data/task-store.mjs";
import { canonicalJson } from "../readme/meta/framework-data/schema.mjs";

const ERROR_SHAPES = Object.freeze({
  TASK_STORE_TARGET_CONFLICT: ["target record precondition failed", 4],
  TASK_STORE_READ_SET_CONFLICT: ["read-set precondition failed", 4],
  TASK_STORE_CONTROL_CONFLICT: ["control precondition failed", 4],
  TASK_STORE_GLOBAL_CONFLICT: ["global generation precondition failed", 4],
  TASK_STORE_ID_ALLOCATION_CONFLICT: ["next task ID allocation conflicted", 4],
  TASK_STORE_UNAVAILABLE: ["task store is unavailable", 5],
  TASK_STORE_CORRUPTION: ["task store state is corrupt", 1],
  TASK_STORE_SCHEMA_UNSUPPORTED: ["task store schema is unsupported", 1],
  TASK_STORE_IDENTITY_MISMATCH: ["task change belongs to a different store", 4],
});

function addCommand(outcome) {
  return {
    outcome,
    authorityReference: "TaskStore conformance authority",
    acceptedDate: "2026-08-13",
    status: "pending",
    route: "initiative",
    risk: "medium",
    tags: ["conformance", "adapter"],
    dependencies: [],
    nextSafeAction: "Continue the conformance trace",
    details: [],
  };
}

function assertStableError(error, code) {
  assert.equal(error?.code, code);
  const shape = ERROR_SHAPES[code];
  if (shape !== undefined) {
    assert.equal(error.message, shape[0]);
    assert.equal(error.exitCode, shape[1]);
  }
  return true;
}

function assertFixture(value) {
  assert(value !== null && typeof value === "object", "fixture must be an object");
  assertTaskStore(value.store);
  assert.equal(typeof value.reopen, "function", "fixture.reopen must create another backend handle");
  assert.equal(typeof value.cleanup, "function", "fixture.cleanup must release adapter resources");
  return value;
}

function fixtureManager(t, createFixture) {
  const fixtures = [];
  t.after(async () => {
    for (const fixture of fixtures.reverse()) await fixture.cleanup();
  });
  return async () => {
    const fixture = assertFixture(await createFixture());
    fixtures.push(fixture);
    return fixture;
  };
}

async function add(store, outcome) {
  const snapshot = await store.readSnapshot();
  return store.publish(planAddTask(snapshot, addCommand(outcome)));
}

/**
 * Register the adapter-neutral TaskStore contract against one backend.
 *
 * createFixture returns an uninitialized isolated backend with:
 * - store: the first TaskStore handle;
 * - reopen(): another handle bound to the same physical backend; and
 * - cleanup(): idempotent resource cleanup.
 */
export function registerTaskStoreConformance({ adapterName, createFixture }) {
  assert.equal(typeof adapterName, "string");
  assert(adapterName.length > 0);
  assert.equal(typeof createFixture, "function");
  const name = (behavior) => `${adapterName} TaskStore conformance: ${behavior}`;

  test(name("identity and compatible metadata are stable and backend-bound"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const first = await fixture();
    const second = await fixture();
    const firstAgain = assertTaskStore(await first.reopen());

    const firstMetadata = await first.store.metadata();
    assert.deepEqual(await firstAgain.metadata(), firstMetadata);
    assert.notEqual((await second.store.metadata()).storeId, firstMetadata.storeId);
    assert.equal(firstMetadata.protocolVersion, TASK_STORE_PROTOCOL_VERSION);
    assert.equal(firstMetadata.taskSchemaVersion, 1);
    assert(Object.isFrozen(firstMetadata));

    await first.store.initialize();
    await second.store.initialize();
    const foreign = planAddTask(await first.store.readSnapshot(), addCommand("Foreign change"));
    await assert.rejects(() => second.store.publish(foreign),
      (error) => assertStableError(error, "TASK_STORE_IDENTITY_MISMATCH"));
    assert.equal((await second.store.readSnapshot()).tasks.length, 0);
  });

  test(name("initialization is atomic and one-time"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    const initialized = await target.store.initialize();
    assert.equal(initialized.tasks.length, 0);
    assert.deepEqual(initialized.control, { schemaVersion: 1, recordVersion: 1, pause: null });
    assert.equal(initialized.metadata.storeId, (await target.store.metadata()).storeId);

    await assert.rejects(() => target.store.initialize(),
      (error) => assertStableError(error, "TASK_STORE_CORRUPTION"));
    assert.deepEqual(await target.store.exportLogical(), {
      taskSchemaVersion: 1,
      control: { schemaVersion: 1, recordVersion: 1, pause: null },
      tasks: [],
    });
  });

  test(name("snapshots and single-change receipts are coherent and immutable"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    const before = await target.store.readSnapshot();
    const receipt = await target.store.publish(planAddTask(before, addCommand("First task")));
    const afterFirst = await target.store.readSnapshot();
    await add(target.store, "Second task");
    const after = await target.store.readSnapshot();

    assert.notEqual(after.generation, before.generation);
    assert.equal(receipt.generation, afterFirst.generation);
    assert.equal(receipt.metadata.storeId, afterFirst.metadata.storeId);
    assert.equal(receipt.control, null);
    assert.deepEqual(receipt.tasks, [afterFirst.tasks[0]]);
    assert.equal(before.tasks.length, 0);
    assert.deepEqual(after.tasks.map(({ id }) => id), ["T-0001", "T-0002"]);
    assert(Object.isFrozen(after));
    assert(Object.isFrozen(after.tasks));
    assert(Object.isFrozen(after.tasks[0]));
    assert.deepEqual(await (await target.reopen()).readSnapshot(), after);

    const query = await target.store.query({
      kind: "tasks",
      filters: { includeTerminal: true },
      limit: 10,
      maxBytes: 32_768,
      cursor: null,
    });
    assert.equal(query.generation, after.generation);
    assert.deepEqual(query.items, after.tasks);
  });

  test(name("concurrent snapshot reads observe only complete publication states"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    await add(target.store, "Concurrent snapshot target");
    const before = await target.store.readSnapshot();
    const update = planAmendTask(before, {
      id: "T-0001",
      expectedRecordVersion: 1,
      outcome: "Concurrent snapshot publication",
      authorityReference: "TaskStore conformance authority",
      route: "initiative",
      risk: "medium",
    });
    const readers = await Promise.all(Array.from({ length: 24 }, () => target.reopen()));
    const publication = target.store.publish(update);
    const observationsPromise = Promise.all(readers.map((reader) => reader.readSnapshot()));
    const [receipt, observations] = await Promise.all([publication, observationsPromise]);
    const after = await target.store.readSnapshot();
    const allowed = new Set([canonicalJson(before), canonicalJson(after)]);

    assert.equal(receipt.generation, after.generation);
    assert.notEqual(after.generation, before.generation);
    for (const observed of observations) {
      assert.deepEqual(normalizeStoreSnapshot(structuredClone(observed)), observed);
      assert.equal(allowed.has(canonicalJson(observed)), true,
        "a concurrent read must be exactly the complete state before or after publication");
    }
  });

  test(name("bounded queries are deterministic, ordered, paginated, and cursor-safe"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    await add(target.store, "First task");
    await add(target.store, "Second task");
    await add(target.store, "Third task");
    const request = {
      kind: "tasks",
      filters: { includeTerminal: true, tags: ["adapter", "conformance"] },
      limit: 2,
      maxBytes: 32_768,
      cursor: null,
    };

    const first = await target.store.query(request);
    assert.deepEqual(await target.store.query(structuredClone(request)), first);
    assert.deepEqual(first.items.map(({ id }) => id), ["T-0001", "T-0002"]);
    assert.equal(first.truncated, true);
    assert.equal(Buffer.byteLength(canonicalJson(first), "utf8") <= request.maxBytes, true);
    const second = await target.store.query({ ...request, cursor: first.nextCursor });
    assert.deepEqual(second.items.map(({ id }) => id), ["T-0003"]);
    assert.equal(second.nextCursor, null);
    assert.equal(second.truncated, false);

    await assert.rejects(() => target.store.query({
      ...request,
      filters: { includeTerminal: false },
      cursor: first.nextCursor,
    }), (error) => assertStableError(error, "CURSOR_INVALID"));
    await assert.rejects(() => target.store.query({ ...request, cursor: "malformed-cursor" }),
      (error) => assertStableError(error, "CURSOR_INVALID"));
    await add(target.store, "Fourth task");
    await assert.rejects(() => target.store.query({ ...request, cursor: first.nextCursor }),
      (error) => assertStableError(error, "CURSOR_STALE"));
    await assert.rejects(() => target.store.query({ ...request, maxBytes: 1 }),
      (error) => assertStableError(error, "OUTPUT_LIMIT"));
    await assert.rejects(() => target.store.query({ ...request, limit: 0 }),
      (error) => assertStableError(error, "TASK_STORE_CONTRACT"));
    await assert.rejects(() => target.store.query({ ...request, maxBytes: 0 }),
      (error) => assertStableError(error, "TASK_STORE_CONTRACT"));
  });

  test(name("target, read-set, and control conflicts are precise"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    await add(target.store, "Mutation target");
    await add(target.store, "Observed task");
    const initial = await target.store.readSnapshot();
    const targetPlan = planAmendTask(initial, {
      id: "T-0001",
      expectedRecordVersion: 1,
      outcome: "Target amended without a global read",
      authorityReference: "TaskStore conformance authority",
      route: "initiative",
      risk: "medium",
    });
    const readSetPlan = structuredClone(targetPlan);
    readSetPlan.preconditions.readSet = [{ id: "T-0002", recordVersion: 1 }];

    const advanceObserved = planAmendTask(initial, {
      id: "T-0002",
      expectedRecordVersion: 1,
      outcome: "Observed task advanced",
      authorityReference: "TaskStore conformance authority",
      route: "initiative",
      risk: "medium",
    });
    await target.store.publish(advanceObserved);
    await assert.rejects(() => target.store.publish(readSetPlan),
      (error) => assertStableError(error, "TASK_STORE_READ_SET_CONFLICT"));

    const committed = await target.store.publish(targetPlan);
    assert.equal(committed.tasks[0].outcome, "Target amended without a global read");
    await assert.rejects(() => target.store.publish(targetPlan),
      (error) => assertStableError(error, "TASK_STORE_TARGET_CONFLICT"));

    const controlSnapshot = await target.store.readSnapshot();
    const stalePause = planPause(controlSnapshot, {
      expectedRecordVersion: controlSnapshot.control.recordVersion,
      reason: "First pause plan",
      source: "TaskStore conformance",
    });
    await target.store.publish(planPause(controlSnapshot, {
      expectedRecordVersion: controlSnapshot.control.recordVersion,
      reason: "Committed pause",
      source: "TaskStore conformance",
    }));
    await assert.rejects(() => target.store.publish(stalePause),
      (error) => assertStableError(error, "TASK_STORE_CONTROL_CONFLICT"));
  });

  test(name("next-display-ID creation is atomic under competing publishers"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    const snapshot = await target.store.readSnapshot();
    const firstPlan = planAddTask(snapshot, addCommand("First contender"));
    const secondPlan = planAddTask(snapshot, addCommand("Second contender"));
    const invalidAllocation = structuredClone(firstPlan);
    invalidAllocation.changes.create.task.id = "T-0002";
    await assert.rejects(() => target.store.publish(invalidAllocation),
      (error) => assertStableError(error, "TASK_STORE_ID_ALLOCATION_CONFLICT"));
    assert.equal((await target.store.readSnapshot()).tasks.length, 0);

    const competingHandle = assertTaskStore(await target.reopen());
    const attempts = await Promise.allSettled([
      target.store.publish(firstPlan),
      competingHandle.publish(secondPlan),
    ]);
    const fulfilled = attempts.filter(({ status }) => status === "fulfilled");
    const rejected = attempts.filter(({ status }) => status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(fulfilled[0].value.tasks[0].id, "T-0001");
    assertStableError(rejected[0].reason, "TASK_STORE_GLOBAL_CONFLICT");
    assert.deepEqual((await target.store.readSnapshot()).tasks.map(({ id }) => id), ["T-0001"]);

    const freshPlan = planAddTask(await target.store.readSnapshot(), addCommand("Replanned contender"));
    const replanned = await target.store.publish(freshPlan);
    assert.equal(replanned.tasks[0].id, "T-0002");
    assert.deepEqual((await target.store.readSnapshot()).tasks.map(({ id }) => id), ["T-0001", "T-0002"]);
  });

  test(name("unsupported schemas fail canonically without a write"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const initialized = await fixture();
    await initialized.store.initialize();
    const snapshot = await initialized.store.readSnapshot();
    const unsupportedChange = structuredClone(planAddTask(snapshot, addCommand("Unsupported protocol")));
    unsupportedChange.protocolVersion = TASK_STORE_PROTOCOL_VERSION + 1;
    const before = await initialized.store.exportLogical();
    await assert.rejects(() => initialized.store.publish(unsupportedChange),
      (error) => assertStableError(error, "TASK_STORE_SCHEMA_UNSUPPORTED"));
    assert.deepEqual(await initialized.store.exportLogical(), before);

    const uninitialized = await fixture();
    await assert.rejects(() => uninitialized.store.importLogical({
      taskSchemaVersion: 2,
      control: { schemaVersion: 1, recordVersion: 1, pause: null },
      tasks: [],
    }), (error) => assertStableError(error, "TASK_STORE_SCHEMA_UNSUPPORTED"));
    const recovered = await uninitialized.store.initialize();
    assert.equal(recovered.tasks.length, 0);
  });

  test(name("invalid and failed publications leave no partial logical state"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const target = await fixture();
    await target.store.initialize();
    const snapshot = await target.store.readSnapshot();
    const addPlan = planAddTask(snapshot, addCommand("Invalid compound change"));
    const invalid = structuredClone(addPlan);
    invalid.preconditions.control = { recordVersion: snapshot.control.recordVersion };
    invalid.changes.controlUpdate = {
      ...snapshot.control,
      recordVersion: snapshot.control.recordVersion + 1,
      pause: { reason: "Must not publish", source: "TaskStore conformance" },
    };
    const before = await target.store.exportLogical();

    await assert.rejects(() => target.store.publish(invalid),
      (error) => assertStableError(error, "TASK_STORE_CONTRACT"));
    assert.deepEqual(await target.store.exportLogical(), before);
    assert.deepEqual(await (await target.reopen()).exportLogical(), before);

    await add(target.store, "Committed state");
    const committed = await target.store.exportLogical();
    await assert.rejects(() => target.store.importLogical(committed),
      (error) => assertStableError(error, "TASK_STORE_CORRUPTION"));
    assert.deepEqual(await target.store.exportLogical(), committed);
    assert.deepEqual(await (await target.reopen()).exportLogical(), committed);
  });

  test(name("competing valid imports publish exactly one complete logical state"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const firstSource = await fixture();
    const secondSource = await fixture();
    const destination = await fixture();
    await firstSource.store.initialize();
    await secondSource.store.initialize();
    await add(firstSource.store, "First import contender");
    await add(secondSource.store, "Second import contender");
    const firstLogical = await firstSource.store.exportLogical();
    const secondLogical = await secondSource.store.exportLogical();
    const competingHandle = assertTaskStore(await destination.reopen());

    const attempts = await Promise.allSettled([
      destination.store.importLogical(structuredClone(firstLogical)),
      competingHandle.importLogical(structuredClone(secondLogical)),
    ]);
    const fulfilled = attempts.filter(({ status }) => status === "fulfilled");
    const rejected = attempts.filter(({ status }) => status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assertStableError(rejected[0].reason, "TASK_STORE_CORRUPTION");

    const final = await destination.store.exportLogical();
    assert([canonicalJson(firstLogical), canonicalJson(secondLogical)].includes(canonicalJson(final)));
    assert.equal(final.tasks.length, 1);
    assert.deepEqual(fulfilled[0].value.control, final.control);
    assert.deepEqual(fulfilled[0].value.tasks, final.tasks);
    assert.deepEqual(await competingHandle.exportLogical(), final);
  });

  test(name("logical export and import are deterministic and identity-neutral"), async (t) => {
    const fixture = fixtureManager(t, createFixture);
    const source = await fixture();
    const destination = await fixture();
    await source.store.initialize();
    await add(source.store, "First exported task");
    await add(source.store, "Second exported task");
    const logical = await source.store.exportLogical();
    const imported = await destination.store.importLogical(structuredClone(logical));
    const destinationSnapshot = await destination.store.readSnapshot();

    assert.notEqual(imported.metadata.storeId, (await source.store.metadata()).storeId);
    assert.equal(imported.metadata.storeId, (await destination.store.metadata()).storeId);
    assert.equal(imported.generation, destinationSnapshot.generation);
    assert.deepEqual(imported.control, logical.control);
    assert.deepEqual(imported.tasks, logical.tasks);
    assert.deepEqual(await destination.store.exportLogical(), logical);
    assert.deepEqual(await (await destination.reopen()).exportLogical(), logical);
  });
}
