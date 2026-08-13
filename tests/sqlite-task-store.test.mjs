import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { planAddTask } from "../readme/meta/framework-data/task-application.mjs";
import { SQLiteTaskStore } from "../readme/meta/framework-data/sqlite-task-store.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-task-store-test-"));
  const target = path.join(root, "tasks.sqlite");
  const store = new SQLiteTaskStore(target);
  await store.initialize();
  return { root, target, store };
}

function addCommand(outcome) {
  return {
    outcome,
    authorityReference: "SQLiteTaskStore focused test",
    acceptedDate: "2026-08-13",
    status: "pending",
    route: "initiative",
    risk: "medium",
    tags: ["sqlite"],
    dependencies: [],
    nextSafeAction: "Continue the focused test",
    details: [],
  };
}

test("SQLiteTaskStore binds hostile record text and keeps its private schema intact", async () => {
  const current = await fixture();
  try {
    const hostile = "SQLite value '); DROP TABLE tasks; -- remains data";
    const plan = planAddTask(await current.store.readSnapshot(), addCommand(hostile));
    await current.store.publish(plan);
    assert.equal((await current.store.readSnapshot()).tasks[0].outcome, hostile);

    const inspection = new DatabaseSync(current.target, { readOnly: true, allowExtension: false });
    try {
      const objects = inspection.prepare(`
        SELECT type, name FROM sqlite_schema
        WHERE type IN ('table', 'index', 'view', 'trigger') AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `).all().map(({ type, name }) => ({ type, name }));
      assert.deepEqual(objects, [
        { type: "table", name: "control" },
        { type: "table", name: "metadata" },
        { type: "table", name: "tasks" },
      ]);
    } finally {
      inspection.close();
    }
  } finally {
    current.store.close();
    await fs.rm(current.root, { recursive: true, force: true });
  }
});

test("SQLiteTaskStore rejects metadata identity and schema tampering canonically", async () => {
  const identity = await fixture();
  const schema = await fixture();
  try {
    const identityWriter = new DatabaseSync(identity.target, { allowExtension: false });
    identityWriter.prepare("UPDATE metadata SET store_id = ? WHERE singleton = 1").run("sqlite:tampered");
    identityWriter.close();
    await assert.rejects(() => identity.store.readSnapshot(), (error) => {
      assert.equal(error.code, "TASK_STORE_CORRUPTION");
      assert.equal(error.message, "task store state is corrupt");
      return true;
    });

    const schemaWriter = new DatabaseSync(schema.target, { allowExtension: false });
    schemaWriter.prepare("UPDATE metadata SET protocol_version = ? WHERE singleton = 1").run(999);
    schemaWriter.close();
    await assert.rejects(() => schema.store.readSnapshot(), (error) => {
      assert.equal(error.code, "TASK_STORE_SCHEMA_UNSUPPORTED");
      assert.equal(error.message, "task store schema is unsupported");
      return true;
    });
  } finally {
    identity.store.close();
    schema.store.close();
    await fs.rm(identity.root, { recursive: true, force: true });
    await fs.rm(schema.root, { recursive: true, force: true });
  }
});

test("SQLiteTaskStore rejects replaced schemas and duplicate singleton rows before materialization", async () => {
  const current = await fixture();
  try {
    current.store.close();
    const writer = new DatabaseSync(current.target, { allowExtension: false });
    writer.exec(`
      ALTER TABLE metadata RENAME TO original_metadata;
      CREATE TABLE metadata (
        singleton INTEGER,
        store_id TEXT,
        protocol_version INTEGER,
        task_schema_version INTEGER,
        generation INTEGER
      );
      INSERT INTO metadata SELECT * FROM original_metadata;
      INSERT INTO metadata SELECT * FROM original_metadata;
      DROP TABLE original_metadata;
    `);
    writer.close();

    const reopened = new SQLiteTaskStore(current.target);
    await assert.rejects(() => reopened.readSnapshot(), (error) => {
      assert.equal(error.code, "TASK_STORE_CORRUPTION");
      assert.equal(error.message, "task store state is corrupt");
      return true;
    });
    reopened.close();
  } finally {
    try {
      current.store.close();
    } catch {
      // The fixture closes the original handle before corrupting the schema.
    }
    await fs.rm(current.root, { recursive: true, force: true });
  }
});

test("SQLiteTaskStore normalizes setup path failures", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-task-store-path-test-"));
  try {
    assert.throws(() => new SQLiteTaskStore(path.join(root, "absent", "tasks.sqlite")), (error) => {
      assert.equal(error.code, "TASK_STORE_UNAVAILABLE");
      assert.equal(error.message, "task store is unavailable");
      assert.equal(error.exitCode, 5);
      return true;
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("SQLiteTaskStore normalizes closed-driver failures without leaking internals", async () => {
  const current = await fixture();
  try {
    current.store.close();
    await assert.rejects(() => current.store.readSnapshot(), (error) => {
      assert.equal(error.code, "TASK_STORE_CORRUPTION");
      assert.equal(error.message, "task store state is corrupt");
      assert.equal(error.exitCode, 1);
      return true;
    });
  } finally {
    try {
      current.store.close();
    } catch {
      // The assertion intentionally closes this handle before the operation.
    }
    await fs.rm(current.root, { recursive: true, force: true });
  }
});
