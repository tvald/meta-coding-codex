import {
  RISKS,
  ROUTES,
  TERMINAL_STATUSES,
  fail,
  normalizeControl,
  normalizeTask,
} from "./schema.mjs";
import {
  activeTask,
  nextTaskId,
  taskIsCandidate,
  validateState,
  validateTaskTransition,
} from "./task-domain.mjs";
import {
  TASK_STORE_PROTOCOL_VERSION,
  normalizeStoreSnapshot,
  normalizeTaskChangeSet,
} from "./task-store.mjs";

const TERMINAL = new Set(TERMINAL_STATUSES);

function contextFor(snapshot) {
  const normalized = normalizeStoreSnapshot(snapshot);
  return {
    snapshot: normalized,
    tasks: new Map(normalized.tasks.map((task) => [task.id, structuredClone(task)])),
    control: structuredClone(normalized.control),
  };
}

function positiveVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("ARGUMENT_INVALID", "expected recordVersion must be a positive integer", 2);
  }
  return value;
}

function mutableTask(context, id, expectedRecordVersion) {
  const expected = positiveVersion(expectedRecordVersion);
  const task = context.tasks.get(id);
  if (!task) fail("TASK_NOT_FOUND", "task does not exist", 4);
  if (TERMINAL.has(task.status)) fail("TRANSITION_INVALID", "terminal task cannot use this mutation", 4);
  if (task.recordVersion !== expected) fail("STALE_RECORD", "task recordVersion is stale", 4);
  return task;
}

function recordPrecondition(task) {
  return { id: task.id, recordVersion: task.recordVersion };
}

function readSetFor(context, ids) {
  const unique = [...new Set(ids)];
  return unique.map((id) => {
    const task = context.tasks.get(id);
    if (!task) fail("DEPENDENCY_MISSING", "task dependency does not exist");
    return recordPrecondition(task);
  });
}

function validateTaskUpdate(context, current, next) {
  const normalized = normalizeTask(next);
  validateTaskTransition(current, normalized);
  const prospective = new Map(context.tasks);
  prospective.set(normalized.id, normalized);
  validateState(context.control, prospective);
  return normalized;
}

function taskChangeSet(context, operation, current, next, {
  readSet = [],
  readsControl = false,
  readsGlobal = false,
} = {}) {
  return normalizeTaskChangeSet({
    protocolVersion: TASK_STORE_PROTOCOL_VERSION,
    storeId: context.snapshot.metadata.storeId,
    operation,
    preconditions: {
      target: recordPrecondition(current),
      readSet,
      control: readsControl ? { recordVersion: context.control.recordVersion } : null,
      global: readsGlobal ? { generation: context.snapshot.generation } : null,
    },
    changes: {
      create: null,
      taskUpdates: [next],
      controlUpdate: null,
    },
  });
}

function controlChangeSet(context, operation, next, { readsGlobal = false } = {}) {
  return normalizeTaskChangeSet({
    protocolVersion: TASK_STORE_PROTOCOL_VERSION,
    storeId: context.snapshot.metadata.storeId,
    operation,
    preconditions: {
      target: null,
      readSet: [],
      control: { recordVersion: context.control.recordVersion },
      global: readsGlobal ? { generation: context.snapshot.generation } : null,
    },
    changes: {
      create: null,
      taskUpdates: [],
      controlUpdate: next,
    },
  });
}

export function planAddTask(snapshot, command) {
  const context = contextFor(snapshot);
  const status = command.status ?? "pending";
  if (!["pending", "ready"].includes(status)) {
    fail("ARGUMENT_INVALID", "new task status must be pending or ready", 2);
  }
  const task = normalizeTask({
    schemaVersion: 1,
    id: nextTaskId(context.tasks),
    recordVersion: 1,
    taskRevision: 1,
    outcome: command.outcome,
    authority: {
      reference: command.authorityReference,
      acceptedDate: command.acceptedDate ?? null,
    },
    status,
    dependencies: [...(command.dependencies ?? [])],
    route: command.route ?? "unrouted",
    risk: command.risk ?? null,
    tags: [...(command.tags ?? [])],
    gate: { kind: "none" },
    nextSafeAction: command.nextSafeAction ?? null,
    details: structuredClone(command.details ?? []),
    completion: null,
  });
  const prospective = new Map(context.tasks);
  prospective.set(task.id, task);
  validateState(context.control, prospective);
  return normalizeTaskChangeSet({
    protocolVersion: TASK_STORE_PROTOCOL_VERSION,
    storeId: context.snapshot.metadata.storeId,
    operation: "add",
    preconditions: {
      target: null,
      readSet: [],
      control: null,
      global: { generation: context.snapshot.generation },
    },
    changes: {
      create: { allocation: "next-task-id", task },
      taskUpdates: [],
      controlUpdate: null,
    },
  });
}

export function planAmendTask(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  const hasRoute = Object.hasOwn(command, "route");
  const hasRisk = Object.hasOwn(command, "risk");
  if (hasRoute !== hasRisk) fail("ARGUMENT_INVALID", "an amendment must provide route and risk together", 2);
  const route = hasRoute ? command.route : "unrouted";
  const risk = hasRisk ? command.risk : null;
  if (!ROUTES.includes(route) || (risk !== null && !RISKS.includes(risk))) {
    fail("ARGUMENT_INVALID", "amended route or risk is invalid", 2);
  }
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    taskRevision: current.taskRevision + 1,
    outcome: command.outcome,
    authority: {
      reference: command.authorityReference,
      acceptedDate: command.acceptedDate ?? null,
    },
    route,
    risk,
    tags: Object.hasOwn(command, "tags") ? [...command.tags] : current.tags,
    status: "pending",
    gate: { kind: "none" },
    nextSafeAction: command.nextSafeAction ?? current.nextSafeAction,
    details: Object.hasOwn(command, "details") ? structuredClone(command.details) : current.details,
    completion: null,
  });
  return taskChangeSet(context, "amend", current, next);
}

export function planSetDependencies(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  if (current.status === "active") fail("TRANSITION_INVALID", "Active task dependencies cannot be changed", 4);
  if (current.gate.kind === "approval") {
    fail("TRANSITION_INVALID", "dependency changes require a separate semantic amendment before approval", 4);
  }
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    taskRevision: current.taskRevision + 1,
    dependencies: [...(command.dependencies ?? [])],
    status: "pending",
    gate: { kind: "none" },
    completion: null,
  });
  return taskChangeSet(context, "set-dependencies", current, next, { readsGlobal: true });
}

export function planRecordApproval(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  if (!["pending", "granted", "denied", "expired"].includes(command.status)) {
    fail("ARGUMENT_INVALID", "approval status is invalid", 2);
  }
  if (current.status === "blocked" || current.status === "active") {
    fail("TRANSITION_INVALID", "approval cannot be recorded in the current task status", 4);
  }
  const scope = {
    id: command.approvalId,
    source: command.source,
    action: command.action,
    boundary: command.boundary,
    detailPath: command.detailPath,
  };
  if (current.gate.kind === "approval" &&
      ["id", "source", "action", "boundary", "detailPath"].some((field) => current.gate[field] !== scope[field])) {
    fail("TRANSITION_INVALID", "approval identity or boundary changes require a semantic task amendment", 4);
  }
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    status: command.status === "granted" ? current.status : "pending",
    gate: {
      kind: "approval",
      summary: command.summary ?? null,
      id: scope.id,
      status: command.status,
      boundTaskRevision: current.taskRevision,
      source: scope.source,
      action: scope.action,
      boundary: scope.boundary,
      detailPath: scope.detailPath,
    },
  });
  return taskChangeSet(context, "record-approval", current, next);
}

export function planSelectTask(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  if (!taskIsCandidate(current, context)) {
    fail("TRANSITION_INVALID", "task is not mechanically eligible for selection", 4);
  }
  if (activeTask(context.tasks) !== null) fail("STATE_INVALID", "another task is already Active", 4);
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    status: "active",
    nextSafeAction: command.nextSafeAction ?? current.nextSafeAction,
  });
  return taskChangeSet(context, "select", current, next, {
    readSet: readSetFor(context, current.dependencies),
    readsControl: true,
    readsGlobal: true,
  });
}

export function planCheckpointTask(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  const status = command.status;
  if (!["pending", "ready", "active", "parked", "blocked", "needs_verification"].includes(status)) {
    fail("ARGUMENT_INVALID", "checkpoint status is not a supported nonterminal state", 2);
  }
  if (status === "blocked" && !command.blocker) {
    fail("ARGUMENT_INVALID", "blocked checkpoint requires blocker evidence", 2);
  }
  if (status !== "blocked" && command.blocker) fail("ARGUMENT_INVALID", "blocker evidence requires blocked status", 2);
  if (status === "active" && current.status !== "needs_verification") {
    fail("TRANSITION_INVALID", "Active checkpoint requires a Needs verification task", 4);
  }
  if (status === "active" && command.nextSafeAction == null) {
    fail("ARGUMENT_INVALID", "Active checkpoint requires a next safe action", 2);
  }
  if (status === "active" && context.control.pause !== null) {
    fail("STATE_INVALID", "paused scheduling cannot reactivate a task", 4);
  }
  if (status === "active" && activeTask(context.tasks) !== null) {
    fail("STATE_INVALID", "another task is already Active", 4);
  }
  if (status === "needs_verification" && !["active", "needs_verification"].includes(current.status)) {
    fail("TRANSITION_INVALID", "Needs verification requires an Active task", 4);
  }
  if (status === "blocked" && current.gate.kind === "approval") {
    fail("TRANSITION_INVALID", "a checkpoint cannot replace approval evidence with a blocker", 4);
  }
  if (status === "ready" && current.gate.kind === "approval" && current.gate.status !== "granted") {
    fail("TRANSITION_INVALID", "Ready requires no unresolved approval", 4);
  }
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    status,
    gate: status === "blocked" ? { kind: "blocker", summary: command.blocker } :
      current.gate.kind === "blocker" ? { kind: "none" } : current.gate,
    nextSafeAction: command.nextSafeAction ?? current.nextSafeAction,
  });
  return taskChangeSet(context, "checkpoint", current, next, {
    readSet: status === "ready" ? readSetFor(context, current.dependencies) : [],
    readsControl: status === "active",
    readsGlobal: status === "active",
  });
}

export function planCloseTask(snapshot, command) {
  const context = contextFor(snapshot);
  const current = mutableTask(context, command.id, command.expectedRecordVersion);
  if (!["done", "cancelled", "superseded"].includes(command.status)) {
    fail("ARGUMENT_INVALID", "close status must be terminal", 2);
  }
  if (command.status === "done" && !["active", "needs_verification"].includes(current.status)) {
    fail("TRANSITION_INVALID", "Done requires Active or Needs verification state", 4);
  }
  if (command.status === "done" && current.gate.kind === "approval" && current.gate.status !== "granted") {
    fail("TRANSITION_INVALID", "Done requires complete granted approval evidence", 4);
  }
  const next = validateTaskUpdate(context, current, {
    ...current,
    recordVersion: current.recordVersion + 1,
    status: command.status,
    gate: command.status !== "done" || (current.gate.kind === "approval" && current.gate.status === "granted") ?
      current.gate : { kind: "none" },
    nextSafeAction: null,
    completion: {
      completedAt: command.completedAt,
      repositoryChanged: command.repositoryChanged,
      evidence: command.evidence,
    },
  });
  return taskChangeSet(context, "close", current, next);
}

export function planPause(snapshot, command) {
  const context = contextFor(snapshot);
  const expected = positiveVersion(command.expectedRecordVersion);
  if (context.control.recordVersion !== expected) fail("STALE_RECORD", "control recordVersion is stale", 4);
  if (context.control.pause !== null) fail("TRANSITION_INVALID", "scheduling is already paused", 4);
  if (activeTask(context.tasks) !== null) fail("TRANSITION_INVALID", "checkpoint the Active task before pausing", 4);
  const next = normalizeControl({
    ...context.control,
    recordVersion: context.control.recordVersion + 1,
    pause: { reason: command.reason, source: command.source },
  });
  validateState(next, context.tasks);
  return controlChangeSet(context, "pause", next, { readsGlobal: true });
}

export function planResume(snapshot, command) {
  const context = contextFor(snapshot);
  const expected = positiveVersion(command.expectedRecordVersion);
  if (context.control.recordVersion !== expected) fail("STALE_RECORD", "control recordVersion is stale", 4);
  if (context.control.pause === null) fail("TRANSITION_INVALID", "scheduling is not paused", 4);
  const next = normalizeControl({
    ...context.control,
    recordVersion: context.control.recordVersion + 1,
    pause: null,
  });
  validateState(next, context.tasks);
  return controlChangeSet(context, "resume", next);
}
