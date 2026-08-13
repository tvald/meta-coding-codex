import {
  DEFAULT_LIMIT,
  DEFAULT_QUERY_BYTES,
  MAX_LIMIT,
  MAX_QUERY_BYTES,
  SCHEMA_VERSION,
  FrameworkDataError,
  canonicalJson,
  fail,
  normalizeControl,
  normalizeTask,
  safeText,
} from "./schema.mjs";
import { compareTaskIds, validateState } from "./task-domain.mjs";

export const TASK_STORE_PROTOCOL_VERSION = 1;

export const TASK_STORE_METHODS = Object.freeze([
  "metadata",
  "readSnapshot",
  "query",
  "publish",
  "initialize",
  "exportLogical",
  "importLogical",
]);

export const TASK_STORE_ERROR_CATEGORIES = Object.freeze([
  "target_conflict",
  "read_set_conflict",
  "control_conflict",
  "global_conflict",
  "id_allocation_conflict",
  "unavailable",
  "timeout",
  "authorization",
  "corruption",
  "unsupported_schema",
]);

const ERROR_DEFINITIONS = Object.freeze({
  target_conflict: ["TASK_STORE_TARGET_CONFLICT", "target record precondition failed", 4],
  read_set_conflict: ["TASK_STORE_READ_SET_CONFLICT", "read-set precondition failed", 4],
  control_conflict: ["TASK_STORE_CONTROL_CONFLICT", "control precondition failed", 4],
  global_conflict: ["TASK_STORE_GLOBAL_CONFLICT", "global generation precondition failed", 4],
  id_allocation_conflict: ["TASK_STORE_ID_ALLOCATION_CONFLICT", "next task ID allocation conflicted", 4],
  unavailable: ["TASK_STORE_UNAVAILABLE", "task store is unavailable", 5],
  timeout: ["TASK_STORE_TIMEOUT", "task store operation timed out", 5],
  authorization: ["TASK_STORE_AUTHORIZATION", "task store operation is not authorized", 5],
  corruption: ["TASK_STORE_CORRUPTION", "task store state is corrupt", 1],
  unsupported_schema: ["TASK_STORE_SCHEMA_UNSUPPORTED", "task store schema is unsupported", 1],
});
const ERROR_DEFINITION_BY_CODE = new Map(
  Object.entries(ERROR_DEFINITIONS).map(([category, definition]) => [definition[0], { category, definition }]),
);

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!plainObject(value) || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)) {
    fail("TASK_STORE_CONTRACT", `${label} has an invalid shape`);
  }
}

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail("TASK_STORE_CONTRACT", `${label} must be a bounded positive integer`);
  }
  return value;
}

function opaqueText(value, label, { nullable = false } = {}) {
  safeText(value, label, { nullable, max: 4096 });
  return value;
}

function normalizeStoreId(value, label = "store identity") {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value)) {
    fail("TASK_STORE_CONTRACT", `${label} is invalid`);
  }
  return value;
}

function assertExpectedStoreId(actual, expected) {
  if (expected === null) return;
  if (actual !== normalizeStoreId(expected, "expected store identity")) {
    fail("TASK_STORE_IDENTITY_MISMATCH", "task change belongs to a different store", 4);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function canonicalData(value, label, depth = 0) {
  if (depth > 8) fail("TASK_STORE_CONTRACT", `${label} exceeds the supported nesting depth`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("TASK_STORE_CONTRACT", `${label} contains an unsupported number`);
    return value;
  }
  if (typeof value === "string") {
    safeText(value, label, { max: 4096 });
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) fail("TASK_STORE_CONTRACT", `${label} contains too many array items`);
    return value.map((item, index) => canonicalData(item, `${label}[${index}]`, depth + 1));
  }
  if (!plainObject(value)) fail("TASK_STORE_CONTRACT", `${label} must contain only plain data`);
  const keys = Object.keys(value).sort();
  if (keys.length > 128) fail("TASK_STORE_CONTRACT", `${label} contains too many fields`);
  return Object.fromEntries(keys.map((key) => {
    safeText(key, `${label} field`, { max: 128 });
    return [key, canonicalData(value[key], `${label}.${key}`, depth + 1)];
  }));
}

export function normalizeStoreMetadata(value) {
  exactKeys(value, ["storeId", "protocolVersion", "taskSchemaVersion"], "store metadata");
  const storeId = normalizeStoreId(value.storeId);
  if (value.protocolVersion !== TASK_STORE_PROTOCOL_VERSION) {
    fail("TASK_STORE_SCHEMA_UNSUPPORTED", "TaskStore protocol version is unsupported");
  }
  if (value.taskSchemaVersion !== SCHEMA_VERSION) {
    fail("TASK_STORE_SCHEMA_UNSUPPORTED", "task schema version is unsupported");
  }
  return deepFreeze({
    storeId,
    protocolVersion: value.protocolVersion,
    taskSchemaVersion: value.taskSchemaVersion,
  });
}

function normalizedTaskArray(values, label = "snapshot tasks") {
  if (!Array.isArray(values)) fail("TASK_STORE_CONTRACT", `${label} must be an array`);
  const tasks = values.map((task) => normalizeTask(task)).sort((left, right) => compareTaskIds(left.id, right.id));
  for (let index = 1; index < tasks.length; index += 1) {
    if (tasks[index - 1].id === tasks[index].id) fail("TASK_STORE_CONTRACT", `${label} contains duplicate IDs`);
  }
  return tasks;
}

export function normalizeStoreSnapshot(value) {
  exactKeys(value, ["metadata", "generation", "control", "tasks"], "store snapshot");
  const metadata = normalizeStoreMetadata(value.metadata);
  const generation = opaqueText(value.generation, "store generation");
  const control = normalizeControl(value.control);
  const tasks = normalizedTaskArray(value.tasks);
  validateState(control, new Map(tasks.map((task) => [task.id, task])));
  return deepFreeze({ metadata, generation, control, tasks });
}

export function normalizeTaskQueryRequest(value) {
  exactKeys(value, ["kind", "filters", "limit", "maxBytes", "cursor"], "task query request");
  if (typeof value.kind !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.kind)) {
    fail("TASK_STORE_CONTRACT", "task query kind is invalid");
  }
  const filters = canonicalData(value.filters, "task query filters");
  if (!plainObject(filters)) fail("TASK_STORE_CONTRACT", "task query filters must be an object");
  const limit = positiveInteger(value.limit ?? DEFAULT_LIMIT, "task query limit", MAX_LIMIT);
  const maxBytes = positiveInteger(value.maxBytes ?? DEFAULT_QUERY_BYTES, "task query byte limit", MAX_QUERY_BYTES);
  const cursor = opaqueText(value.cursor, "task query cursor", { nullable: true });
  return deepFreeze({ kind: value.kind, filters, limit, maxBytes, cursor });
}

export function normalizeTaskQueryResult(value, request) {
  const normalizedRequest = normalizeTaskQueryRequest(request);
  exactKeys(value, ["generation", "items", "nextCursor", "truncated"], "task query result");
  const generation = opaqueText(value.generation, "query generation");
  const items = normalizedTaskArray(value.items, "query items");
  if (items.length > normalizedRequest.limit) fail("TASK_STORE_CONTRACT", "query result exceeds its item limit");
  const nextCursor = opaqueText(value.nextCursor, "next query cursor", { nullable: true });
  if (typeof value.truncated !== "boolean" || value.truncated !== (nextCursor !== null)) {
    fail("TASK_STORE_CONTRACT", "query truncation and cursor state are inconsistent");
  }
  const result = { generation, items, nextCursor, truncated: value.truncated };
  if (Buffer.byteLength(canonicalJson(result), "utf8") > normalizedRequest.maxBytes) {
    fail("TASK_STORE_CONTRACT", "query result exceeds its byte limit");
  }
  return deepFreeze(result);
}

function normalizeRecordPrecondition(value, label) {
  exactKeys(value, ["id", "recordVersion"], label);
  const task = { id: value.id, recordVersion: positiveInteger(value.recordVersion, `${label} recordVersion`) };
  if (typeof task.id !== "string" || !/^T-(?:\d{4}|[1-9]\d{4,})$/u.test(task.id)) {
    fail("TASK_STORE_CONTRACT", `${label} task ID is invalid`);
  }
  return task;
}

function normalizePreconditions(value) {
  exactKeys(value, ["target", "readSet", "control", "global"], "change-set preconditions");
  const target = value.target === null ? null : normalizeRecordPrecondition(value.target, "target precondition");
  if (!Array.isArray(value.readSet)) fail("TASK_STORE_CONTRACT", "read-set preconditions must be an array");
  const readSet = value.readSet.map((item) => normalizeRecordPrecondition(item, "read-set precondition"))
    .sort((left, right) => compareTaskIds(left.id, right.id));
  const ids = new Set();
  for (const item of readSet) {
    if (item.id === target?.id || ids.has(item.id)) {
      fail("TASK_STORE_CONTRACT", "read-set preconditions must be unique and exclude the target");
    }
    ids.add(item.id);
  }
  let control = null;
  if (value.control !== null) {
    exactKeys(value.control, ["recordVersion"], "control precondition");
    control = { recordVersion: positiveInteger(value.control.recordVersion, "control precondition recordVersion") };
  }
  let global = null;
  if (value.global !== null) {
    exactKeys(value.global, ["generation"], "global precondition");
    global = { generation: opaqueText(value.global.generation, "global precondition generation") };
  }
  return { target, readSet, control, global };
}

function normalizeChanges(value, preconditions) {
  exactKeys(value, ["create", "taskUpdates", "controlUpdate"], "change-set changes");
  let create = null;
  if (value.create !== null) {
    exactKeys(value.create, ["allocation", "task"], "task creation");
    if (value.create.allocation !== "next-task-id") {
      fail("TASK_STORE_CONTRACT", "task creation must use atomic next-task-id allocation");
    }
    create = { allocation: value.create.allocation, task: normalizeTask(value.create.task) };
    if (create.task.recordVersion !== 1 || create.task.taskRevision !== 1) {
      fail("TASK_STORE_CONTRACT", "new task revisions must start at one");
    }
    if (preconditions.global === null || preconditions.target !== null ||
        preconditions.readSet.length !== 0 || preconditions.control !== null) {
      fail("TASK_STORE_CONTRACT", "task creation requires only a global generation precondition");
    }
  }
  const taskUpdates = normalizedTaskArray(value.taskUpdates, "task updates");
  if (taskUpdates.length > 1) fail("TASK_STORE_CONTRACT", "a semantic change set supports one task update");
  if (taskUpdates.length === 1) {
    if (preconditions.target === null || preconditions.target.id !== taskUpdates[0].id ||
        taskUpdates[0].recordVersion !== preconditions.target.recordVersion + 1) {
      fail("TASK_STORE_CONTRACT", "task update does not match its target precondition");
    }
  } else if (preconditions.target !== null) {
    fail("TASK_STORE_CONTRACT", "target precondition requires one task update");
  }
  if (create !== null && taskUpdates.length !== 0) {
    fail("TASK_STORE_CONTRACT", "task creation cannot be combined with a task update");
  }
  const controlUpdate = value.controlUpdate === null ? null : normalizeControl(value.controlUpdate);
  if (controlUpdate !== null && (preconditions.control === null ||
      controlUpdate.recordVersion !== preconditions.control.recordVersion + 1)) {
    fail("TASK_STORE_CONTRACT", "control update does not match its control precondition");
  }
  const mutationCount = (create === null ? 0 : 1) + taskUpdates.length +
    (controlUpdate === null ? 0 : 1);
  if (mutationCount !== 1) {
    fail("TASK_STORE_CONTRACT", "change set must contain exactly one record mutation");
  }
  return { create, taskUpdates, controlUpdate };
}

export function normalizeTaskChangeSet(value, expectedStoreId = null) {
  exactKeys(value, ["protocolVersion", "storeId", "operation", "preconditions", "changes"], "task change set");
  if (value.protocolVersion !== TASK_STORE_PROTOCOL_VERSION) {
    fail("TASK_STORE_SCHEMA_UNSUPPORTED", "change-set protocol version is unsupported");
  }
  if (typeof value.operation !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.operation)) {
    fail("TASK_STORE_CONTRACT", "change-set operation is invalid");
  }
  const storeId = normalizeStoreId(value.storeId);
  assertExpectedStoreId(storeId, expectedStoreId);
  const preconditions = normalizePreconditions(value.preconditions);
  const changes = normalizeChanges(value.changes, preconditions);
  return deepFreeze({
    protocolVersion: value.protocolVersion,
    storeId,
    operation: value.operation,
    preconditions,
    changes,
  });
}

export function normalizeMutationReceipt(value, expectedStoreId = null) {
  exactKeys(value, ["metadata", "generation", "control", "tasks"], "mutation receipt");
  const metadata = normalizeStoreMetadata(value.metadata);
  assertExpectedStoreId(metadata.storeId, expectedStoreId);
  const generation = opaqueText(value.generation, "mutation receipt generation");
  const control = value.control === null ? null : normalizeControl(value.control);
  const tasks = normalizedTaskArray(value.tasks, "committed task records");
  return deepFreeze({ metadata, generation, control, tasks });
}

export function assertTaskStore(value) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    fail("TASK_STORE_CONTRACT", "TaskStore implementation is invalid");
  }
  for (const method of TASK_STORE_METHODS) {
    if (typeof value[method] !== "function") fail("TASK_STORE_CONTRACT", `TaskStore method ${method} is missing`);
  }
  return value;
}

export function normalizeTaskStoreError(error, fallbackCategory = "corruption") {
  const known = error instanceof FrameworkDataError ? ERROR_DEFINITION_BY_CODE.get(error.code) : null;
  const category = known?.category ??
    (plainObject(error) && typeof error.category === "string" ? error.category : fallbackCategory);
  const definition = ERROR_DEFINITIONS[category];
  if (!definition) fail("TASK_STORE_CONTRACT", "TaskStore error category is unsupported");
  return new FrameworkDataError(...definition);
}

export function throwTaskStoreError(category) {
  const error = normalizeTaskStoreError({ category });
  fail(error.code, error.message, error.exitCode);
}
