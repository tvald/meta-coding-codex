import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileTaskStore } from "../readme/meta/framework-data/file-task-store.mjs";
import {
  planAddTask,
  planAmendTask,
  planPause,
} from "../readme/meta/framework-data/task-application.mjs";
import { repositoryContext } from "../readme/meta/framework-data/store.mjs";

async function repository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "file-task-store-test-"));
  await fs.mkdir(path.join(root, "readme", "tasks"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

async function initializedStore() {
  const root = await repository();
  const context = await repositoryContext(root);
  const store = new FileTaskStore(context);
  await store.initialize();
  return { root, store };
}

function addCommand(outcome = "Reference adapter task") {
  return {
    outcome,
    authorityReference: "FileTaskStore test authority",
    acceptedDate: "2026-08-13",
    status: "pending",
    route: "initiative",
    risk: "medium",
    tags: ["adapter"],
    dependencies: [],
    nextSafeAction: "Continue the adapter test",
    details: [],
  };
}

test("FileTaskStore binds identity to one physical store and rejects foreign change sets", async () => {
  const first = await initializedStore();
  const second = await initializedStore();
  try {
    const firstAgain = new FileTaskStore(await repositoryContext(first.root));
    assert.deepEqual(await first.store.metadata(), await firstAgain.metadata());
    assert.notEqual((await first.store.metadata()).storeId, (await second.store.metadata()).storeId);

    const foreign = planAddTask(await first.store.readSnapshot(), addCommand());
    await assert.rejects(() => second.store.publish(foreign),
      (error) => error.code === "TASK_STORE_IDENTITY_MISMATCH");
    assert.equal((await second.store.readSnapshot()).tasks.length, 0);
  } finally {
    await fs.rm(first.root, { recursive: true, force: true });
    await fs.rm(second.root, { recursive: true, force: true });
  }
});

test("FileTaskStore executes planners under one lock and normalizes receipts and conflicts", async () => {
  const fixture = await initializedStore();
  try {
    const { receipt } = await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand()));
    assert.equal(receipt.tasks[0].id, "T-0001");
    assert.equal(receipt.tasks[0].recordVersion, 1);

    const snapshot = await fixture.store.readSnapshot();
    const update = planAmendTask(snapshot, {
      id: "T-0001",
      expectedRecordVersion: 1,
      outcome: "Amended through FileTaskStore",
      authorityReference: "FileTaskStore test authority",
      acceptedDate: "2026-08-13",
      route: "initiative",
      risk: "medium",
    });
    const committed = await fixture.store.publish(update);
    assert.equal(committed.tasks[0].recordVersion, 2);
    assert.equal(committed.tasks[0].outcome, "Amended through FileTaskStore");
    await assert.rejects(() => fixture.store.publish(update),
      (error) => error.code === "TASK_STORE_TARGET_CONFLICT");
    assert.equal((await fixture.store.readSnapshot()).tasks[0].recordVersion, 2);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("FileTaskStore enforces precise target, read-set, control, and global preconditions", async () => {
  const fixture = await initializedStore();
  try {
    await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand("Target")));
    await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand("Observed read")));

    const initial = await fixture.store.readSnapshot();
    const targetPlan = planAmendTask(initial, {
      id: "T-0001",
      expectedRecordVersion: 1,
      outcome: "Target plan",
      authorityReference: "Test",
      route: "initiative",
      risk: "medium",
    });
    const readSetPlan = {
      ...structuredClone(targetPlan),
      preconditions: {
        ...structuredClone(targetPlan.preconditions),
        readSet: [{ id: "T-0002", recordVersion: 1 }],
      },
    };
    await fixture.store.execute((snapshot) => planAmendTask(snapshot, {
      id: "T-0002",
      expectedRecordVersion: 1,
      outcome: "Advance observed record",
      authorityReference: "Test",
      route: "initiative",
      risk: "medium",
    }));
    await assert.rejects(() => fixture.store.publish(readSetPlan),
      (error) => error.code === "TASK_STORE_READ_SET_CONFLICT");

    const harmless = await fixture.store.publish(targetPlan);
    assert.equal(harmless.tasks[0].outcome, "Target plan");
    await assert.rejects(() => fixture.store.publish(targetPlan),
      (error) => error.code === "TASK_STORE_TARGET_CONFLICT");

    const beforeControl = await fixture.store.readSnapshot();
    const stalePause = planPause(beforeControl, {
      expectedRecordVersion: 1,
      reason: "Stale control plan",
      source: "Test",
    });
    await fixture.store.execute((snapshot) => planPause(snapshot, {
      expectedRecordVersion: 1,
      reason: "Committed pause",
      source: "Test",
    }));
    await assert.rejects(() => fixture.store.publish(stalePause),
      (error) => error.code === "TASK_STORE_CONTROL_CONFLICT");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("FileTaskStore rejects a stale global plan while unrelated-safe plans can publish", async () => {
  const fixture = await initializedStore();
  try {
    const snapshot = await fixture.store.readSnapshot();
    const staleGlobal = planAddTask(snapshot, addCommand("First allocation"));
    await fixture.store.execute((current) => planAddTask(current, addCommand("Winning allocation")));
    await assert.rejects(() => fixture.store.publish(staleGlobal),
      (error) => error.code === "TASK_STORE_GLOBAL_CONFLICT");
    assert.deepEqual((await fixture.store.readSnapshot()).tasks.map(({ outcome }) => outcome),
      ["Winning allocation"]);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("FileTaskStore query cursors are deterministic and stale after publication", async () => {
  const fixture = await initializedStore();
  try {
    await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand("First")));
    await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand("Second")));
    const request = {
      kind: "tasks",
      filters: { includeTerminal: true, tags: ["adapter"] },
      limit: 1,
      maxBytes: 32_768,
      cursor: null,
    };
    const first = await fixture.store.query(request);
    const repeat = await fixture.store.query(request);
    assert.deepEqual(first, repeat);
    assert.equal(first.items[0].id, "T-0001");
    assert.equal(first.truncated, true);
    const second = await fixture.store.query({ ...request, cursor: first.nextCursor });
    assert.equal(second.items[0].id, "T-0002");
    await assert.rejects(() => fixture.store.query({ ...request, maxBytes: 1 }),
      (error) => error.code === "OUTPUT_LIMIT");

    await fixture.store.execute((snapshot) => planAddTask(snapshot, addCommand("Third")));
    await assert.rejects(() => fixture.store.query({ ...request, cursor: first.nextCursor }),
      (error) => error.code === "CURSOR_STALE");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("FileTaskStore logical export and one-time import round trip without partial state", async () => {
  const source = await initializedStore();
  const destinationRoot = await repository();
  try {
    await source.store.execute((snapshot) => planAddTask(snapshot, addCommand()));
    const logical = await source.store.exportLogical();
    const destination = new FileTaskStore(await repositoryContext(destinationRoot));
    const imported = await destination.importLogical(logical);
    assert.deepEqual(imported.control, logical.control);
    assert.deepEqual(imported.tasks, logical.tasks);
    assert.deepEqual(await destination.exportLogical(), logical);

    await assert.rejects(() => destination.importLogical(logical),
      (error) => error.code === "TASK_STORE_CORRUPTION");
    assert.deepEqual(await destination.exportLogical(), logical);
  } finally {
    await fs.rm(source.root, { recursive: true, force: true });
    await fs.rm(destinationRoot, { recursive: true, force: true });
  }
});

test("TaskStore contract rejects multi-record change sets before FileTaskStore writes", async () => {
  const fixture = await initializedStore();
  try {
    const snapshot = await fixture.store.readSnapshot();
    const add = planAddTask(snapshot, addCommand());
    const invalid = {
      ...add,
      changes: {
        ...add.changes,
        controlUpdate: { ...snapshot.control, recordVersion: snapshot.control.recordVersion + 1 },
      },
      preconditions: {
        ...add.preconditions,
        control: { recordVersion: snapshot.control.recordVersion },
      },
    };
    const before = await fixture.store.exportLogical();
    await assert.rejects(() => fixture.store.publish(invalid),
      (error) => error.code === "TASK_STORE_CONTRACT");
    assert.deepEqual(await fixture.store.exportLogical(), before);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
