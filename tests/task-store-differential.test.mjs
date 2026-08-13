import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileTaskStore } from "../readme/meta/framework-data/file-task-store.mjs";
import { SQLiteTaskStore } from "../readme/meta/framework-data/sqlite-task-store.mjs";
import { repositoryContext } from "../readme/meta/framework-data/store.mjs";
import {
  planAddTask,
  planAmendTask,
  planCheckpointTask,
  planCloseTask,
  planPause,
  planRecordApproval,
  planResume,
  planSelectTask,
  planSetDependencies,
} from "../readme/meta/framework-data/task-application.mjs";

const AUTHORITY = "TaskStore differential authority";
const DATE = "2026-08-13";
const COMMON_SUITE_SHA256 = "73fc2dacbc22d6134eac0177992c977c05041684457c48058976242ecb1d7eac";
const ERROR_SHAPES = Object.freeze({
  TASK_STORE_TARGET_CONFLICT: ["target record precondition failed", 4],
  TASK_STORE_READ_SET_CONFLICT: ["read-set precondition failed", 4],
  TASK_STORE_CONTROL_CONFLICT: ["control precondition failed", 4],
  TASK_STORE_GLOBAL_CONFLICT: ["global generation precondition failed", 4],
  TASK_STORE_ID_ALLOCATION_CONFLICT: ["next task ID allocation conflicted", 4],
  TASK_STORE_IDENTITY_MISMATCH: ["task change belongs to a different store", 4],
  TASK_STORE_SCHEMA_UNSUPPORTED: ["task store schema is unsupported", 1],
  TASK_STORE_CORRUPTION: ["task store state is corrupt", 1],
  TASK_STORE_CONTRACT: ["task creation requires only a global generation precondition", 1],
});

function addCommand(outcome) {
  return {
    outcome,
    authorityReference: AUTHORITY,
    acceptedDate: DATE,
    status: "pending",
    route: "initiative",
    risk: "medium",
    tags: ["differential", "task-store"],
    dependencies: [],
    nextSafeAction: "Continue the differential trace",
    details: [],
  };
}

function receiptProjection(receipt) {
  return {
    metadata: {
      protocolVersion: receipt.metadata.protocolVersion,
      taskSchemaVersion: receipt.metadata.taskSchemaVersion,
    },
    hasGeneration: typeof receipt.generation === "string" && receipt.generation.length > 0,
    control: receipt.control,
    tasks: receipt.tasks,
  };
}

function changeProjection(changeSet) {
  const value = structuredClone(changeSet);
  value.storeId = "<adapter-local>";
  if (value.preconditions.global !== null) value.preconditions.global.generation = "<opaque>";
  return value;
}

function queryProjection(result) {
  return {
    hasGeneration: typeof result.generation === "string" && result.generation.length > 0,
    items: result.items,
    truncated: result.truncated,
    hasNextCursor: result.nextCursor !== null,
  };
}

function errorProjection(error) {
  return { code: error?.code, message: error?.message, exitCode: error?.exitCode };
}

async function rejected(operation) {
  try {
    await operation();
  } catch (error) {
    return errorProjection(error);
  }
  assert.fail("operation unexpectedly succeeded");
}

async function assertMatchingRejection(left, right, code) {
  const [leftError, rightError] = await Promise.all([rejected(left), rejected(right)]);
  assert.deepEqual(leftError, rightError);
  assert.deepEqual(leftError, {
    code,
    message: ERROR_SHAPES[code][0],
    exitCode: ERROR_SHAPES[code][1],
  });
}

async function createPair(t, label) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${label}-`));
  const fileRoot = path.join(root, "file");
  await fs.mkdir(path.join(fileRoot, "readme", "tasks"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: fileRoot });
  const sqlitePath = path.join(root, "tasks.sqlite");
  const sqliteHandles = [];
  const openSQLite = () => {
    const store = new SQLiteTaskStore(sqlitePath);
    sqliteHandles.push(store);
    return store;
  };
  const pair = {
    root,
    fileRoot,
    sqlitePath,
    file: new FileTaskStore(await repositoryContext(fileRoot)),
    sqlite: openSQLite(),
    reopenFile: async () => new FileTaskStore(await repositoryContext(fileRoot)),
    reopenSQLite: openSQLite,
  };
  t.after(async () => {
    for (const store of sqliteHandles.reverse()) {
      try {
        store.close();
      } catch {
        // A test may already have closed an explicitly reopened handle.
      }
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  return pair;
}

async function assertLogicalParity(pair) {
  assert.deepEqual(await pair.file.exportLogical(), await pair.sqlite.exportLogical());
}

async function publishStep(pair, planner, command) {
  const fileChange = planner(await pair.file.readSnapshot(), structuredClone(command));
  const sqliteChange = planner(await pair.sqlite.readSnapshot(), structuredClone(command));
  assert.deepEqual(changeProjection(fileChange), changeProjection(sqliteChange));
  const [fileReceipt, sqliteReceipt] = await Promise.all([
    pair.file.publish(fileChange),
    pair.sqlite.publish(sqliteChange),
  ]);
  assert.deepEqual(receiptProjection(fileReceipt), receiptProjection(sqliteReceipt));
  await assertLogicalParity(pair);
}

test("TaskStore differential: every semantic planner produces equivalent state and receipts", async (t) => {
  const pair = await createPair(t, "task-store-differential-success");
  const [fileInitial, sqliteInitial] = await Promise.all([pair.file.initialize(), pair.sqlite.initialize()]);
  assert.deepEqual(receiptProjection(fileInitial), receiptProjection(sqliteInitial));
  await assertLogicalParity(pair);

  await publishStep(pair, planAddTask, addCommand("Primary task"));
  await publishStep(pair, planAmendTask, {
    id: "T-0001",
    expectedRecordVersion: 1,
    outcome: "Amended primary task",
    authorityReference: AUTHORITY,
    acceptedDate: DATE,
    route: "initiative",
    risk: "high",
    tags: ["differential", "amended"],
    nextSafeAction: "Obtain approval",
    details: [],
  });
  await publishStep(pair, planRecordApproval, {
    id: "T-0001",
    expectedRecordVersion: 2,
    approvalId: "approval-differential",
    status: "granted",
    source: "TaskStore differential fixture",
    action: "Run the semantic trace",
    boundary: "Fixture only",
    detailPath: "readme/quality/differential-approval.md",
    summary: "Fixture approval",
  });
  await publishStep(pair, planCheckpointTask, {
    id: "T-0001",
    expectedRecordVersion: 3,
    status: "ready",
    nextSafeAction: "Select the primary task",
  });
  await publishStep(pair, planSelectTask, {
    id: "T-0001",
    expectedRecordVersion: 4,
    nextSafeAction: "Verify the primary task",
  });
  await publishStep(pair, planCheckpointTask, {
    id: "T-0001",
    expectedRecordVersion: 5,
    status: "needs_verification",
    nextSafeAction: "Close after verification",
  });
  await publishStep(pair, planCloseTask, {
    id: "T-0001",
    expectedRecordVersion: 6,
    status: "done",
    completedAt: DATE,
    repositoryChanged: false,
    evidence: "Differential primary trace passed",
  });

  await publishStep(pair, planAddTask, addCommand("Dependent task"));
  await publishStep(pair, planSetDependencies, {
    id: "T-0002",
    expectedRecordVersion: 1,
    dependencies: ["T-0001"],
  });
  await publishStep(pair, planCheckpointTask, {
    id: "T-0002",
    expectedRecordVersion: 2,
    status: "ready",
    nextSafeAction: "Select the dependent task",
  });
  await publishStep(pair, planSelectTask, {
    id: "T-0002",
    expectedRecordVersion: 3,
    nextSafeAction: "Complete the dependent task",
  });
  await publishStep(pair, planCloseTask, {
    id: "T-0002",
    expectedRecordVersion: 4,
    status: "done",
    completedAt: DATE,
    repositoryChanged: false,
    evidence: "Differential dependent trace passed",
  });
  await publishStep(pair, planPause, {
    expectedRecordVersion: 1,
    reason: "Exercise control publication",
    source: "TaskStore differential fixture",
  });
  await publishStep(pair, planResume, { expectedRecordVersion: 2 });

  const request = {
    kind: "tasks",
    filters: { includeTerminal: true },
    limit: 1,
    maxBytes: 32_768,
    cursor: null,
  };
  const [fileFirst, sqliteFirst] = await Promise.all([
    pair.file.query(request),
    pair.sqlite.query(request),
  ]);
  assert.deepEqual(queryProjection(fileFirst), queryProjection(sqliteFirst));
  const [fileSecond, sqliteSecond] = await Promise.all([
    pair.file.query({ ...request, cursor: fileFirst.nextCursor }),
    pair.sqlite.query({ ...request, cursor: sqliteFirst.nextCursor }),
  ]);
  assert.deepEqual(queryProjection(fileSecond), queryProjection(sqliteSecond));
});

test("TaskStore differential: conflicts and failed transactions have identical public outcomes", async (t) => {
  const pair = await createPair(t, "task-store-differential-conflicts");
  await Promise.all([pair.file.initialize(), pair.sqlite.initialize()]);
  await publishStep(pair, planAddTask, addCommand("Conflict target"));
  await publishStep(pair, planAddTask, addCommand("Observed task"));

  const fileBase = await pair.file.readSnapshot();
  const sqliteBase = await pair.sqlite.readSnapshot();
  const amendCommand = {
    id: "T-0001",
    expectedRecordVersion: 1,
    outcome: "Target winner",
    authorityReference: AUTHORITY,
    route: "initiative",
    risk: "medium",
  };
  const fileTarget = planAmendTask(fileBase, amendCommand);
  const sqliteTarget = planAmendTask(sqliteBase, amendCommand);
  await Promise.all([pair.file.publish(fileTarget), pair.sqlite.publish(sqliteTarget)]);
  await assertMatchingRejection(
    () => pair.file.publish(fileTarget),
    () => pair.sqlite.publish(sqliteTarget),
    "TASK_STORE_TARGET_CONFLICT",
  );

  const fileReadBase = await pair.file.readSnapshot();
  const sqliteReadBase = await pair.sqlite.readSnapshot();
  const nextAmend = {
    ...amendCommand,
    expectedRecordVersion: 2,
    outcome: "Read-set target",
  };
  const fileReadSet = structuredClone(planAmendTask(fileReadBase, nextAmend));
  const sqliteReadSet = structuredClone(planAmendTask(sqliteReadBase, nextAmend));
  fileReadSet.preconditions.readSet = [{ id: "T-0002", recordVersion: 1 }];
  sqliteReadSet.preconditions.readSet = [{ id: "T-0002", recordVersion: 1 }];
  await publishStep(pair, planAmendTask, {
    ...amendCommand,
    id: "T-0002",
    outcome: "Advance observed task",
  });
  await assertMatchingRejection(
    () => pair.file.publish(fileReadSet),
    () => pair.sqlite.publish(sqliteReadSet),
    "TASK_STORE_READ_SET_CONFLICT",
  );

  const fileControlBase = await pair.file.readSnapshot();
  const sqliteControlBase = await pair.sqlite.readSnapshot();
  const pauseCommand = {
    expectedRecordVersion: 1,
    reason: "Control conflict",
    source: "TaskStore differential fixture",
  };
  const filePause = planPause(fileControlBase, pauseCommand);
  const sqlitePause = planPause(sqliteControlBase, pauseCommand);
  await Promise.all([pair.file.publish(filePause), pair.sqlite.publish(sqlitePause)]);
  await assertMatchingRejection(
    () => pair.file.publish(filePause),
    () => pair.sqlite.publish(sqlitePause),
    "TASK_STORE_CONTROL_CONFLICT",
  );
  await publishStep(pair, planResume, { expectedRecordVersion: 2 });

  const fileGlobalBase = await pair.file.readSnapshot();
  const sqliteGlobalBase = await pair.sqlite.readSnapshot();
  const fileGlobal = planAddTask(fileGlobalBase, addCommand("Global winner"));
  const sqliteGlobal = planAddTask(sqliteGlobalBase, addCommand("Global winner"));
  await Promise.all([pair.file.publish(fileGlobal), pair.sqlite.publish(sqliteGlobal)]);
  const fileStaleGlobal = planAddTask(fileGlobalBase, addCommand("Global loser"));
  const sqliteStaleGlobal = planAddTask(sqliteGlobalBase, addCommand("Global loser"));
  await assertMatchingRejection(
    () => pair.file.publish(fileStaleGlobal),
    () => pair.sqlite.publish(sqliteStaleGlobal),
    "TASK_STORE_GLOBAL_CONFLICT",
  );

  const fileAllocation = structuredClone(
    planAddTask(await pair.file.readSnapshot(), addCommand("Bad allocation")),
  );
  const sqliteAllocation = structuredClone(
    planAddTask(await pair.sqlite.readSnapshot(), addCommand("Bad allocation")),
  );
  fileAllocation.changes.create.task.id = "T-9999";
  sqliteAllocation.changes.create.task.id = "T-9999";
  const beforeInvalid = await pair.file.exportLogical();
  await assertMatchingRejection(
    () => pair.file.publish(fileAllocation),
    () => pair.sqlite.publish(sqliteAllocation),
    "TASK_STORE_ID_ALLOCATION_CONFLICT",
  );
  await assertLogicalParity(pair);
  assert.deepEqual(await pair.file.exportLogical(), beforeInvalid);

  const fileInvalid = structuredClone(planAddTask(await pair.file.readSnapshot(), addCommand("Compound")));
  const sqliteInvalid = structuredClone(planAddTask(await pair.sqlite.readSnapshot(), addCommand("Compound")));
  for (const [change, snapshot] of [
    [fileInvalid, await pair.file.readSnapshot()],
    [sqliteInvalid, await pair.sqlite.readSnapshot()],
  ]) {
    change.preconditions.control = { recordVersion: snapshot.control.recordVersion };
    change.changes.controlUpdate = {
      ...snapshot.control,
      recordVersion: snapshot.control.recordVersion + 1,
      pause: { reason: "Must roll back", source: "Differential fixture" },
    };
  }
  const beforeCompound = await pair.file.exportLogical();
  await assertMatchingRejection(
    () => pair.file.publish(fileInvalid),
    () => pair.sqlite.publish(sqliteInvalid),
    "TASK_STORE_CONTRACT",
  );
  await assertLogicalParity(pair);
  assert.deepEqual(await pair.file.exportLogical(), beforeCompound);
  assert.deepEqual(await (await pair.reopenFile()).exportLogical(), beforeCompound);
  assert.deepEqual(await pair.reopenSQLite().exportLogical(), beforeCompound);

  const foreignFile = planAddTask(await pair.file.readSnapshot(), addCommand("Foreign"));
  const foreignSQLite = planAddTask(await pair.sqlite.readSnapshot(), addCommand("Foreign"));
  await assertMatchingRejection(
    () => pair.sqlite.publish(foreignFile),
    () => pair.file.publish(foreignSQLite),
    "TASK_STORE_IDENTITY_MISMATCH",
  );
  const unsupportedFile = structuredClone(planAddTask(await pair.file.readSnapshot(), addCommand("Schema")));
  const unsupportedSQLite = structuredClone(planAddTask(await pair.sqlite.readSnapshot(), addCommand("Schema")));
  unsupportedFile.protocolVersion += 1;
  unsupportedSQLite.protocolVersion += 1;
  await assertMatchingRejection(
    () => pair.file.publish(unsupportedFile),
    () => pair.sqlite.publish(unsupportedSQLite),
    "TASK_STORE_SCHEMA_UNSUPPORTED",
  );
  await assertMatchingRejection(
    () => pair.file.initialize(),
    () => pair.sqlite.initialize(),
    "TASK_STORE_CORRUPTION",
  );
  await assertMatchingRejection(
    () => pair.file.importLogical(beforeCompound),
    () => pair.sqlite.importLogical(beforeCompound),
    "TASK_STORE_CORRUPTION",
  );
  await assertLogicalParity(pair);
});

const PROCESS_PUBLISH_SCRIPT = String.raw`
import fs from "node:fs/promises";
import { FileTaskStore } from "./readme/meta/framework-data/file-task-store.mjs";
import { SQLiteTaskStore } from "./readme/meta/framework-data/sqlite-task-store.mjs";
import { repositoryContext } from "./readme/meta/framework-data/store.mjs";
import { planAddTask } from "./readme/meta/framework-data/task-application.mjs";
const [kind, location, ready, go, outcome] = process.argv.slice(1);
let store;
try {
  store = kind === "file" ? new FileTaskStore(await repositoryContext(location)) : new SQLiteTaskStore(location);
  const snapshot = await store.readSnapshot();
  const change = planAddTask(snapshot, {
    outcome,
    authorityReference: "TaskStore differential authority",
    acceptedDate: "2026-08-13",
    status: "pending",
    route: "initiative",
    risk: "medium",
    tags: ["process-race"],
    dependencies: [],
    nextSafeAction: "Replan after the race",
    details: [],
  });
  await fs.writeFile(ready, "ready", { flag: "wx" });
  for (;;) {
    try { await fs.access(go); break; } catch { await new Promise((resolve) => setTimeout(resolve, 5)); }
  }
  const receipt = await store.publish(change);
  process.stdout.write(JSON.stringify({ ok: true, id: receipt.tasks[0].id }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: error?.code, message: error?.message, exitCode: error?.exitCode }));
} finally {
  if (kind === "sqlite" && store) store.close();
}
`;

async function waitFor(paths, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const present = await Promise.all(paths.map(async (target) => {
      try {
        await fs.access(target);
        return true;
      } catch {
        return false;
      }
    }));
    if (present.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("process race did not reach the publication barrier");
}

function spawnPublisher(kind, location, ready, go, outcome) {
  const child = spawn(process.execPath, [
    "--input-type=module",
    "--eval",
    PROCESS_PUBLISH_SCRIPT,
    kind,
    location,
    ready,
    go,
    outcome,
  ], { cwd: path.resolve(import.meta.dirname, ".."), stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`publisher exited ${code}: ${stderr}`));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`publisher returned invalid output: ${stdout} ${stderr}`));
        }
      }
    });
  });
}

test("TaskStore differential: separate processes race from one snapshot and recover identically", async (t) => {
  const pair = await createPair(t, "task-store-differential-process");
  await Promise.all([pair.file.initialize(), pair.sqlite.initialize()]);

  for (const [kind, location, store] of [
    ["file", pair.fileRoot, pair.file],
    ["sqlite", pair.sqlitePath, pair.sqlite],
  ]) {
    const barrier = path.join(pair.root, `${kind}-barrier`);
    await fs.mkdir(barrier);
    const ready = [path.join(barrier, "ready-1"), path.join(barrier, "ready-2")];
    const go = path.join(barrier, "go");
    const attempts = [
      spawnPublisher(kind, location, ready[0], go, "Concurrent contender"),
      spawnPublisher(kind, location, ready[1], go, "Concurrent contender"),
    ];
    await waitFor(ready);
    await fs.writeFile(go, "go", { flag: "wx" });
    const results = await Promise.all(attempts);
    const winners = results.filter(({ ok }) => ok);
    const losers = results.filter(({ ok }) => !ok);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].id, "T-0001");
    assert.deepEqual(losers, [{
      ok: false,
      code: "TASK_STORE_GLOBAL_CONFLICT",
      message: "global generation precondition failed",
      exitCode: 4,
    }]);
    assert.deepEqual((await store.readSnapshot()).tasks.map(({ id }) => id), ["T-0001"]);
    const fresh = await store.publish(planAddTask(await store.readSnapshot(), addCommand("Fresh retry")));
    assert.equal(fresh.tasks[0].id, "T-0002");
  }

  const fileLogical = await pair.file.exportLogical();
  const sqliteLogical = await pair.sqlite.exportLogical();
  assert.deepEqual(fileLogical, sqliteLogical);
});

test("TaskStore differential: common conformance suite remains frozen", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = await fs.readFile(new URL("./task-store-conformance.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), COMMON_SUITE_SHA256);
});
