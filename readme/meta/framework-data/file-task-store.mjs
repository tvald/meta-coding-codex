import { createHash } from "node:crypto";

import {
  SCHEMA_VERSION,
  TERMINAL_STATUSES,
  FrameworkDataError,
  canonicalJson,
  fail,
} from "./schema.mjs";
import { nextTaskId, taskIsCandidate } from "./task-domain.mjs";
import {
  TASK_STORE_PROTOCOL_VERSION,
  assertTaskStore,
  normalizeMutationReceipt,
  normalizeStoreMetadata,
  normalizeStoreSnapshot,
  normalizeTaskChangeSet,
  normalizeTaskQueryRequest,
  normalizeTaskQueryResult,
  normalizeTaskStoreError,
  throwTaskStoreError,
} from "./task-store.mjs";
import {
  addTask,
  assertRepositoryContext,
  initializeStore,
  loadStore,
  mutateControl,
  mutateTask,
  withLock,
} from "./store.mjs";

const TERMINAL = new Set(TERMINAL_STATUSES);
const QUERY_FILTERS = new Set([
  "acceptedAfter",
  "acceptedBefore",
  "authority",
  "completedAfter",
  "completedBefore",
  "dependsOn",
  "id",
  "includeTerminal",
  "mechanicallyEligible",
  "repositoryChanged",
  "risk",
  "route",
  "status",
  "statuses",
  "tag",
  "tags",
]);

function derivedStoreId(context) {
  const digest = createHash("sha256")
    .update("file-task-store\0", "utf8")
    .update(context.storeRoot, "utf8")
    .digest("hex");
  return `file:${digest}`;
}

function loadedSnapshot(loaded, metadata) {
  return normalizeStoreSnapshot({
    metadata,
    generation: loaded.digest,
    control: loaded.control,
    tasks: [...loaded.tasks.values()],
  });
}

function legacyConflict(code, message) {
  fail(code, message, 4);
}

function conflict(category, legacyErrors, legacyCode, legacyMessage) {
  if (legacyErrors) legacyConflict(legacyCode, legacyMessage);
  throwTaskStoreError(category);
}

function validatePreconditions(loaded, changeSet, { legacyErrors = false } = {}) {
  const { target, readSet, control, global } = changeSet.preconditions;
  if (target !== null) {
    const current = loaded.tasks.get(target.id);
    if (current === undefined) {
      conflict("target_conflict", legacyErrors, "TASK_NOT_FOUND", "task does not exist");
    }
    if (current.recordVersion !== target.recordVersion) {
      conflict("target_conflict", legacyErrors, "STALE_RECORD", "task recordVersion is stale");
    }
  }
  for (const expected of readSet) {
    if (loaded.tasks.get(expected.id)?.recordVersion !== expected.recordVersion) {
      conflict("read_set_conflict", legacyErrors, "STALE_STORE", "store digest is stale");
    }
  }
  if (control !== null && loaded.control.recordVersion !== control.recordVersion) {
    conflict("control_conflict", legacyErrors, "STALE_RECORD", "control recordVersion is stale");
  }
  if (global !== null && loaded.digest !== global.generation) {
    conflict("global_conflict", legacyErrors, "STALE_STORE", "store digest is stale");
  }
}

function normalizeFilterList(value, label) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => typeof item !== "string")) {
    fail("TASK_STORE_CONTRACT", `${label} query filter must contain strings`);
  }
  return values;
}

function matchesQuery(task, filters, snapshot) {
  const statuses = normalizeFilterList(filters.status ?? filters.statuses, "status");
  const tags = normalizeFilterList(filters.tag ?? filters.tags, "tag");
  if (statuses.length > 0 && !statuses.includes(task.status)) return false;
  if (filters.includeTerminal === false && TERMINAL.has(task.status)) return false;
  if (filters.id !== undefined && task.id !== filters.id) return false;
  if (filters.route !== undefined && task.route !== filters.route) return false;
  if (filters.risk !== undefined && task.risk !== filters.risk) return false;
  if (filters.authority !== undefined && task.authority.reference !== filters.authority) return false;
  if (tags.length > 0 && !tags.every((tag) => task.tags.includes(tag))) return false;
  if (filters.dependsOn !== undefined && !task.dependencies.includes(filters.dependsOn)) return false;
  if (filters.acceptedAfter !== undefined &&
      !(task.authority.acceptedDate !== null && task.authority.acceptedDate > filters.acceptedAfter)) return false;
  if (filters.acceptedBefore !== undefined &&
      !(task.authority.acceptedDate !== null && task.authority.acceptedDate < filters.acceptedBefore)) return false;
  if (filters.repositoryChanged !== undefined &&
      task.completion?.repositoryChanged !== filters.repositoryChanged) return false;
  if (filters.completedAfter !== undefined &&
      !(task.completion?.completedAt !== undefined && task.completion.completedAt > filters.completedAfter)) return false;
  if (filters.completedBefore !== undefined &&
      !(task.completion?.completedAt !== undefined && task.completion.completedAt < filters.completedBefore)) return false;
  if (filters.mechanicallyEligible === true) {
    const taskMap = new Map(snapshot.tasks.map((item) => [item.id, item]));
    if (!taskIsCandidate(task, { control: snapshot.control, tasks: taskMap })) return false;
  }
  return true;
}

function encodeCursor(generation, request, lastId) {
  return Buffer.from(JSON.stringify({
    v: 1,
    generation,
    kind: request.kind,
    filters: request.filters,
    lastId,
  }), "utf8").toString("base64url");
}

function decodeCursor(value, generation, request) {
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    fail("CURSOR_INVALID", "continuation cursor is malformed", 2);
  }
  const keys = cursor !== null && typeof cursor === "object" && !Array.isArray(cursor) ?
    Object.keys(cursor).sort().join(",") : "";
  if (keys !== "filters,generation,kind,lastId,v" || cursor.v !== 1 ||
      cursor.kind !== request.kind ||
      JSON.stringify(cursor.filters) !== JSON.stringify(request.filters)) {
    fail("CURSOR_INVALID", "continuation cursor does not match this query", 4);
  }
  if (cursor.generation !== generation) {
    fail("CURSOR_STALE", "continuation cursor belongs to a stale store", 4);
  }
  if (typeof cursor.lastId !== "string") fail("CURSOR_INVALID", "continuation cursor is malformed", 2);
  return cursor.lastId;
}

function logicalState(value, metadata) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      JSON.stringify(Object.keys(value)) !== JSON.stringify(["taskSchemaVersion", "control", "tasks"])) {
    fail("TASK_STORE_CONTRACT", "logical task store export has an invalid shape");
  }
  if (value.taskSchemaVersion !== SCHEMA_VERSION) {
    fail("TASK_STORE_SCHEMA_UNSUPPORTED", "logical task store schema version is unsupported");
  }
  const snapshot = normalizeStoreSnapshot({
    metadata,
    generation: "logical-import-validation",
    control: value.control,
    tasks: value.tasks,
  });
  return { taskSchemaVersion: SCHEMA_VERSION, control: snapshot.control, tasks: snapshot.tasks };
}

/** The sole production TaskStore adapter. Its default identity is bound to one physical store root. */
export class FileTaskStore {
  #context;
  #metadata;

  constructor(context) {
    this.#context = assertRepositoryContext(context);
    this.#metadata = normalizeStoreMetadata({
      storeId: derivedStoreId(context),
      protocolVersion: TASK_STORE_PROTOCOL_VERSION,
      taskSchemaVersion: SCHEMA_VERSION,
    });
    assertTaskStore(this);
  }

  async metadata() {
    return this.#metadata;
  }

  async #loaded({ lockHeld = false } = {}) {
    if (lockHeld) return loadStore(this.#context);
    try {
      return await loadStore(this.#context);
    } catch (error) {
      if (!(error instanceof FrameworkDataError)) throw error;
    }
    return withLock(this.#context, () => loadStore(this.#context));
  }

  async readSnapshot(options = {}) {
    const loaded = await this.#loaded(options);
    return loadedSnapshot(loaded, this.#metadata);
  }

  async readConsistent(operation) {
    if (typeof operation !== "function") fail("TASK_STORE_CONTRACT", "consistent read operation must be a function");
    return operation(await this.readSnapshot());
  }

  async query(value) {
    const request = normalizeTaskQueryRequest(value);
    for (const name of Object.keys(request.filters)) {
      if (!QUERY_FILTERS.has(name)) fail("TASK_STORE_CONTRACT", `task query filter ${name} is unsupported`);
    }
    const snapshot = await this.readSnapshot();
    const matches = snapshot.tasks.filter((task) => matchesQuery(task, request.filters, snapshot));
    let start = 0;
    if (request.cursor !== null) {
      const lastId = decodeCursor(request.cursor, snapshot.generation, request);
      const position = matches.findIndex((task) => task.id === lastId);
      if (position < 0) fail("CURSOR_INVALID", "continuation cursor position is absent", 4);
      start = position + 1;
    }
    const page = matches.slice(start, start + request.limit);
    let truncated = start + page.length < matches.length;
    while (true) {
      const nextCursor = truncated && page.length > 0 ?
        encodeCursor(snapshot.generation, request, page.at(-1).id) : null;
      const candidate = {
        generation: snapshot.generation,
        items: page,
        nextCursor,
        truncated,
      };
      if (Buffer.byteLength(canonicalJson(candidate), "utf8") <= request.maxBytes) {
        return normalizeTaskQueryResult(candidate, request);
      }
      if (page.length === 0) fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
      page.pop();
      if (page.length === 0) fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
      truncated = true;
    }
  }

  async #publishLoaded(loaded, changeSet, { legacyErrors = false } = {}) {
    validatePreconditions(loaded, changeSet, { legacyErrors });
    let committed;
    if (changeSet.changes.create !== null) {
      const task = changeSet.changes.create.task;
      if (task.id !== nextTaskId(loaded.tasks)) {
        conflict("id_allocation_conflict", legacyErrors, "TASK_ID_COLLISION", "derived task ID already exists");
      }
      committed = await addTask(this.#context, loaded, task);
    } else if (changeSet.changes.taskUpdates.length === 1) {
      const task = changeSet.changes.taskUpdates[0];
      committed = await mutateTask(this.#context, loaded, task.id,
        changeSet.preconditions.target.recordVersion, () => task);
    } else {
      const control = changeSet.changes.controlUpdate;
      committed = await mutateControl(this.#context, loaded,
        changeSet.preconditions.control.recordVersion, () => control);
    }
    const changedTasks = changeSet.changes.create !== null ?
      [committed.tasks.get(changeSet.changes.create.task.id)] :
      changeSet.changes.taskUpdates.map((task) => committed.tasks.get(task.id));
    return normalizeMutationReceipt({
      metadata: this.#metadata,
      generation: committed.digest,
      control: changeSet.changes.controlUpdate === null ? null : committed.control,
      tasks: changedTasks,
    }, this.#metadata.storeId);
  }

  async publish(value, { legacyErrors = false } = {}) {
    const changeSet = normalizeTaskChangeSet(value, this.#metadata.storeId);
    try {
      return await withLock(this.#context, async () => this.#publishLoaded(
        await loadStore(this.#context), changeSet, { legacyErrors },
      ));
    } catch (error) {
      if (legacyErrors || error?.code?.startsWith("TASK_STORE_")) throw error;
      throw normalizeTaskStoreError(error, error?.code === "LOCK_BUSY" ? "unavailable" : "corruption");
    }
  }

  async execute(planner, { legacyErrors = false } = {}) {
    if (typeof planner !== "function") fail("TASK_STORE_CONTRACT", "task planner must be a function");
    try {
      return await withLock(this.#context, async () => {
        const loaded = await loadStore(this.#context);
        const snapshot = loadedSnapshot(loaded, this.#metadata);
        const changeSet = normalizeTaskChangeSet(
          await planner(snapshot), this.#metadata.storeId,
        );
        const receipt = await this.#publishLoaded(loaded, changeSet, { legacyErrors });
        return Object.freeze({ changeSet, receipt });
      });
    } catch (error) {
      if (legacyErrors || error?.code?.startsWith("TASK_STORE_")) throw error;
      throw normalizeTaskStoreError(error, error?.code === "LOCK_BUSY" ? "unavailable" : "corruption");
    }
  }

  async initialize({ lockHeld = false, legacyErrors = false, beforeInitialize = null } = {}) {
    if (beforeInitialize !== null && typeof beforeInitialize !== "function") {
      fail("TASK_STORE_CONTRACT", "initialization precondition must be a function");
    }
    try {
      const operation = async () => {
        await beforeInitialize?.();
        return initializeStore(this.#context);
      };
      const loaded = lockHeld ? await operation() : await withLock(this.#context, operation);
      return loadedSnapshot(loaded, this.#metadata);
    } catch (error) {
      if (legacyErrors) throw error;
      throw normalizeTaskStoreError(error, error?.code === "LOCK_BUSY" ? "unavailable" : "corruption");
    }
  }

  async exportLogical() {
    const snapshot = await this.readSnapshot();
    return Object.freeze({
      taskSchemaVersion: SCHEMA_VERSION,
      control: snapshot.control,
      tasks: snapshot.tasks,
    });
  }

  async importLogical(value, { lockHeld = false, legacyErrors = false } = {}) {
    const logical = logicalState(value, this.#metadata);
    try {
      const operation = () => initializeStore(this.#context, logical);
      const loaded = lockHeld ? await operation() : await withLock(this.#context, operation);
      return loadedSnapshot(loaded, this.#metadata);
    } catch (error) {
      if (legacyErrors) throw error;
      throw normalizeTaskStoreError(error, error?.code === "LOCK_BUSY" ? "unavailable" : "corruption");
    }
  }

  async withExclusiveRepositoryOperation(operation) {
    if (typeof operation !== "function") fail("TASK_STORE_CONTRACT", "repository operation must be a function");
    return withLock(this.#context, operation);
  }
}

export function createFileTaskStore(context) {
  return new FileTaskStore(context);
}
