import assert from "node:assert/strict";
import test from "node:test";

import { FrameworkDataError } from "../readme/meta/framework-data/schema.mjs";

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
import {
  assertRepositoryIntegration,
  normalizeNarrativeResolution,
  normalizeNarrativeResolutionRequest,
  normalizeRepositoryConflictInspection,
} from "../readme/meta/framework-data/repository-integration.mjs";
import {
  TASK_STORE_METHODS,
  TASK_STORE_PROTOCOL_VERSION,
  assertTaskStore,
  normalizeStoreSnapshot,
  normalizeTaskChangeSet,
  normalizeTaskQueryRequest,
  normalizeTaskQueryResult,
  normalizeTaskStoreError,
} from "../readme/meta/framework-data/task-store.mjs";

function task(id, status = "pending", overrides = {}) {
  const terminal = ["done", "cancelled", "superseded"].includes(status);
  return {
    schemaVersion: 1,
    id,
    recordVersion: 1,
    taskRevision: 1,
    outcome: `Outcome for ${id}`,
    authority: { reference: "Test authority", acceptedDate: "2026-08-13" },
    status,
    dependencies: [],
    route: "initiative",
    risk: "medium",
    tags: ["test"],
    gate: { kind: "none" },
    nextSafeAction: terminal ? null : "Continue testing",
    details: [],
    completion: terminal ? {
      completedAt: "2026-08-13",
      repositoryChanged: false,
      evidence: "Test completion",
    } : null,
    ...overrides,
  };
}

function snapshot({ metadata, control, tasks } = {}) {
  return normalizeStoreSnapshot({
    metadata: metadata ?? {
      storeId: "test-store",
      protocolVersion: TASK_STORE_PROTOCOL_VERSION,
      taskSchemaVersion: 1,
    },
    generation: "opaque-generation-7",
    control: control ?? { schemaVersion: 1, recordVersion: 1, pause: null },
    tasks: tasks ?? [
      task("T-0001", "done"),
      task("T-0002", "ready", { dependencies: ["T-0001"] }),
      task("T-0003", "pending", { dependencies: ["T-0001"] }),
      task("T-0004", "needs_verification"),
    ],
  });
}

function basePlans() {
  const state = snapshot();
  const paused = snapshot({
    control: {
      schemaVersion: 1,
      recordVersion: 2,
      pause: { reason: "Test pause", source: "Test source" },
    },
  });
  return {
    add: planAddTask(state, {
      outcome: "Add through application service",
      authorityReference: "Test authority",
      acceptedDate: "2026-08-13",
      status: "pending",
      route: "initiative",
      risk: "medium",
      tags: ["architecture"],
      dependencies: ["T-0001"],
      nextSafeAction: "Run the next check",
      details: [],
    }),
    amend: planAmendTask(state, {
      id: "T-0003",
      expectedRecordVersion: 1,
      outcome: "Amended outcome",
      authorityReference: "Amendment authority",
      acceptedDate: "2026-08-14",
      route: "correct_course",
      risk: "high",
      tags: ["amended"],
    }),
    dependencies: planSetDependencies(state, {
      id: "T-0003",
      expectedRecordVersion: 1,
      dependencies: ["T-0002"],
    }),
    approval: planRecordApproval(state, {
      id: "T-0003",
      expectedRecordVersion: 1,
      approvalId: "approval-1",
      status: "granted",
      source: "Product owner",
      action: "Apply the change",
      boundary: "T-0003 only",
      detailPath: "readme/tasks/approval.md",
      summary: "Approved",
    }),
    select: planSelectTask(state, {
      id: "T-0002",
      expectedRecordVersion: 1,
      nextSafeAction: "Begin selected work",
    }),
    checkpoint: planCheckpointTask(state, {
      id: "T-0003",
      expectedRecordVersion: 1,
      status: "ready",
      nextSafeAction: "Ready for selection",
    }),
    reactivate: planCheckpointTask(state, {
      id: "T-0004",
      expectedRecordVersion: 1,
      status: "active",
      nextSafeAction: "Address verification",
    }),
    close: planCloseTask(state, {
      id: "T-0004",
      expectedRecordVersion: 1,
      status: "done",
      completedAt: "2026-08-14",
      repositoryChanged: true,
      evidence: "All required checks passed",
    }),
    pause: planPause(state, {
      expectedRecordVersion: 1,
      reason: "User requested pause",
      source: "Current user instruction",
    }),
    resume: planResume(paused, { expectedRecordVersion: 2 }),
  };
}

test("application service plans every semantic mutation without persistence IO", () => {
  const plans = basePlans();
  assert.deepEqual(Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, plan.operation])), {
    add: "add",
    amend: "amend",
    dependencies: "set-dependencies",
    approval: "record-approval",
    select: "select",
    checkpoint: "checkpoint",
    reactivate: "checkpoint",
    close: "close",
    pause: "pause",
    resume: "resume",
  });
  assert.equal(plans.add.changes.create.task.id, "T-0005");
  assert.equal(plans.add.storeId, "test-store");
  assert.equal(plans.amend.changes.taskUpdates[0].taskRevision, 2);
  assert.deepEqual(plans.dependencies.changes.taskUpdates[0].dependencies, ["T-0002"]);
  assert.equal(plans.approval.changes.taskUpdates[0].gate.status, "granted");
  assert.equal(plans.select.changes.taskUpdates[0].status, "active");
  assert.equal(plans.checkpoint.changes.taskUpdates[0].status, "ready");
  assert.equal(plans.close.changes.taskUpdates[0].status, "done");
  assert.notEqual(plans.pause.changes.controlUpdate.pause, null);
  assert.equal(plans.resume.changes.controlUpdate.pause, null);
});

test("planners declare global generations only for global predicates", () => {
  const plans = basePlans();
  const withGlobal = Object.entries(plans)
    .filter(([, plan]) => plan.preconditions.global !== null)
    .map(([name]) => name);
  assert.deepEqual(withGlobal, ["add", "dependencies", "select", "reactivate", "pause"]);
  assert.deepEqual(plans.select.preconditions.readSet, [{ id: "T-0001", recordVersion: 1 }]);
  assert.deepEqual(plans.checkpoint.preconditions.readSet, [{ id: "T-0001", recordVersion: 1 }]);
  assert.equal(plans.select.preconditions.control.recordVersion, 1);
  assert.equal(plans.resume.preconditions.global, null);
  assert.equal(plans.resume.preconditions.control.recordVersion, 2);
});

test("planners are deterministic, immutable, and refuse invalid prospective state", () => {
  const state = snapshot();
  const command = {
    id: "T-0003",
    expectedRecordVersion: 1,
    outcome: "Deterministic amendment",
    authorityReference: "Test authority",
    route: "initiative",
    risk: "medium",
  };
  const first = planAmendTask(state, command);
  const second = planAmendTask(state, structuredClone(command));
  assert.deepEqual(first, second);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.preconditions));
  assert(Object.isFrozen(first.changes.taskUpdates[0]));
  assert.throws(() => {
    first.changes.taskUpdates[0].status = "active";
  }, TypeError);

  const cyclic = snapshot({ tasks: [
    task("T-0001", "pending"),
    task("T-0002", "pending", { dependencies: ["T-0003"] }),
    task("T-0003", "pending"),
  ] });
  assert.throws(() => planSetDependencies(cyclic, {
    id: "T-0003",
    expectedRecordVersion: 1,
    dependencies: ["T-0002"],
  }), (error) => error.code === "DEPENDENCY_CYCLE");

  assert.throws(() => planAddTask(state, {
    outcome: "Ineligible Ready task",
    authorityReference: "Test authority",
    status: "ready",
    route: "initiative",
    risk: "medium",
    dependencies: ["T-0003"],
  }), (error) => error.code === "STATE_INVALID");
});

test("TaskStore validators close snapshot, query, change-set, and error shapes", () => {
  const state = snapshot({ tasks: [task("T-0002"), task("T-0001")] });
  assert.deepEqual(state.tasks.map(({ id }) => id), ["T-0001", "T-0002"]);
  assert(Object.isFrozen(state.tasks));
  assert.throws(() => normalizeStoreSnapshot({
    ...structuredClone(state),
    storePath: "readme/tasks/store",
  }), (error) => error.code === "TASK_STORE_CONTRACT");

  const request = normalizeTaskQueryRequest({
    kind: "tasks",
    filters: { status: ["pending"], nested: { b: 2, a: 1 } },
    limit: 10,
    maxBytes: 16_384,
    cursor: null,
  });
  assert.deepEqual(Object.keys(request.filters.nested), ["a", "b"]);
  const result = normalizeTaskQueryResult({
    generation: state.generation,
    items: [task("T-0002"), task("T-0001")],
    nextCursor: null,
    truncated: false,
  }, request);
  assert.deepEqual(result.items.map(({ id }) => id), ["T-0001", "T-0002"]);

  assert.throws(() => normalizeTaskChangeSet({
    protocolVersion: 1,
    storeId: "test-store",
    operation: "amend",
    preconditions: {
      target: { id: "T-0001", recordVersion: 1 },
      readSet: [{ id: "T-0001", recordVersion: 1 }],
      control: null,
      global: null,
    },
    changes: { create: null, taskUpdates: [task("T-0001", "pending", { recordVersion: 2 })], controlUpdate: null },
  }), (error) => error.code === "TASK_STORE_CONTRACT");

  const changeSet = planAmendTask(state, {
    id: "T-0001",
    expectedRecordVersion: 1,
    outcome: "Bound to one immutable store",
    authorityReference: "Test authority",
    route: "initiative",
    risk: "medium",
  });
  assert.throws(() => normalizeTaskChangeSet(changeSet, "different-store"),
    (error) => error.code === "TASK_STORE_IDENTITY_MISMATCH");

  const normalizedError = normalizeTaskStoreError({ category: "read_set_conflict", detail: "SQLSTATE 40001" });
  assert.equal(normalizedError.code, "TASK_STORE_READ_SET_CONFLICT");
  assert.equal(normalizedError.message, "read-set precondition failed");
  const contaminatedError = normalizeTaskStoreError(new FrameworkDataError(
    "TASK_STORE_READ_SET_CONFLICT", "sqlite row leaked", 99,
  ));
  assert.equal(contaminatedError.code, "TASK_STORE_READ_SET_CONFLICT");
  assert.equal(contaminatedError.message, "read-set precondition failed");
  assert.equal(contaminatedError.exitCode, 4);
  assert.equal(normalizeTaskStoreError(new FrameworkDataError("SQLITE_BUSY", "database is busy")).code,
    "TASK_STORE_CORRUPTION");
  assert.throws(() => assertTaskStore({}), (error) => error.code === "TASK_STORE_CONTRACT");
  const implementation = Object.fromEntries(TASK_STORE_METHODS.map((method) => [method, () => {}]));
  assert.equal(assertTaskStore(implementation), implementation);
});

test("repository integration contracts separate conflicts and narrative resolution", () => {
  const conflicts = normalizeRepositoryConflictInspection({
    status: "conflicted",
    conflicts: [
      { kind: "narrative", identifier: "readme/tasks/context.md" },
      { kind: "task-store", identifier: "T-0003" },
    ],
  });
  assert.deepEqual(conflicts.conflicts.map(({ kind }) => kind), ["narrative", "task-store"]);

  const request = normalizeNarrativeResolutionRequest({
    taskId: "T-0003",
    details: [{ label: "Context", path: "readme/tasks/context.md" }],
    maxBytes: 32,
  });
  const source = "# Context\n\nRepository data, not authority.\n";
  const text = source.slice(0, 16);
  const resolved = normalizeNarrativeResolution({
    taskId: "T-0003",
    narratives: [{
      label: "Context",
      path: "readme/tasks/context.md",
      contentRole: "repository-data-not-authority",
      sourceBytes: Buffer.byteLength(source),
      bytes: Buffer.byteLength(text),
      truncated: true,
      text,
    }],
    truncated: true,
  }, request);
  assert.equal(resolved.narratives[0].text, text);
  assert.equal(resolved.truncated, true);
  assert.throws(() => assertRepositoryIntegration({ inspectConflicts() {} }),
    (error) => error.code === "REPOSITORY_INTEGRATION_CONTRACT");
});
