import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  SCHEMA_VERSION,
  MAX_RECORD_BYTES,
  MAX_RECORDS,
  MAX_STORE_BYTES,
  TERMINAL_STATUSES,
  canonicalJson,
  fail,
} from "./schema.mjs";
import { nextTaskId, taskIsCandidate } from "./task-domain.mjs";
import {
  TASK_STORE_PROTOCOL_VERSION,
  assertTaskStore,
  normalizeLogicalTaskStore,
  normalizeMutationReceipt,
  normalizeStoreMetadata,
  normalizeStoreSnapshot,
  normalizeTaskChangeSet,
  normalizeTaskQueryRequest,
  normalizeTaskQueryResult,
  normalizeTaskStoreError,
  throwTaskStoreError,
} from "./task-store.mjs";

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

const TABLE_SQL = Object.freeze({
  metadata: `CREATE TABLE metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    store_id TEXT NOT NULL,
    protocol_version INTEGER NOT NULL,
    task_schema_version INTEGER NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 1)
  ) STRICT`,
  control: `CREATE TABLE control (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    json TEXT NOT NULL
  ) STRICT`,
  tasks: `CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    record_version INTEGER NOT NULL CHECK (record_version >= 1),
    json TEXT NOT NULL
  ) STRICT, WITHOUT ROWID`,
});
const CREATE_SCHEMA = `${Object.values(TABLE_SQL).join(";\n")};`;

function normalizedSql(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

const EXPECTED_SCHEMA = Object.freeze(Object.fromEntries(
  Object.entries(TABLE_SQL).map(([name, sql]) => [name, normalizedSql(sql)]),
));

function databasePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value === ":memory:") {
    fail("TASK_STORE_CONTRACT", "SQLiteTaskStore database path is invalid");
  }
  const absolute = path.resolve(value);
  const parent = realpathSync(path.dirname(absolute));
  const target = path.join(parent, path.basename(absolute));
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      fail("TASK_STORE_CONTRACT", "SQLiteTaskStore database path must be an ordinary file");
    }
  }
  return target;
}

function normalizeSetupError(error) {
  if (error?.code?.startsWith?.("TASK_STORE_")) return error;
  const category = error?.code === "EACCES" || error?.code === "EPERM" ? "authorization" : "unavailable";
  return normalizeTaskStoreError({ category });
}

function derivedStoreId(target) {
  const digest = createHash("sha256")
    .update("sqlite-task-store\0", "utf8")
    .update(target, "utf8")
    .digest("hex");
  return `sqlite:${digest}`;
}

function generationToken(value) {
  if (!Number.isSafeInteger(value) || value < 1) throwTaskStoreError("corruption");
  return `sqlite-generation:${value}`;
}

function generationNumber(value) {
  if (typeof value !== "string" || !/^sqlite-generation:[1-9]\d*$/u.test(value)) {
    throwTaskStoreError("global_conflict");
  }
  const generation = Number(value.slice("sqlite-generation:".length));
  if (!Number.isSafeInteger(generation)) throwTaskStoreError("global_conflict");
  return generation;
}

function schemaObjects(database) {
  return database.prepare(`
    SELECT type, name, sql
    FROM sqlite_schema
    WHERE type IN ('table', 'index', 'view', 'trigger')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
    LIMIT 4
  `).all();
}

function hasNoSchema(database) {
  return schemaObjects(database).length === 0;
}

function assertTrustedSchema(database) {
  const objects = schemaObjects(database);
  if (objects.length !== 3) throwTaskStoreError("corruption");
  for (const { type, name, sql } of objects) {
    if (type !== "table" || EXPECTED_SCHEMA[name] !== normalizedSql(sql)) throwTaskStoreError("corruption");
  }
}

function boundedInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function assertPersistedBounds(database) {
  const cardinality = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM metadata) AS metadata_count,
      (SELECT COUNT(*) FROM control) AS control_count,
      (SELECT COUNT(*) FROM tasks) AS task_count,
      (SELECT COALESCE(MAX(length(CAST(json AS BLOB))), 0) FROM tasks) AS max_task_bytes,
      (SELECT COALESCE(SUM(length(CAST(json AS BLOB)) + length(CAST(id AS BLOB)) + 16), 0) FROM tasks)
        AS task_store_bytes,
      (SELECT COALESCE(MAX(length(CAST(json AS BLOB))), 0) FROM control) AS control_bytes
  `).get();
  if (cardinality.metadata_count !== 1 || cardinality.control_count !== 1 ||
      !boundedInteger(cardinality.task_count, MAX_RECORDS) ||
      !boundedInteger(cardinality.max_task_bytes, MAX_RECORD_BYTES) ||
      !boundedInteger(cardinality.control_bytes, MAX_RECORD_BYTES) ||
      !boundedInteger(cardinality.task_store_bytes + cardinality.control_bytes, MAX_STORE_BYTES)) {
    throwTaskStoreError("corruption");
  }
}

function assertLogicalBounds(logical) {
  if (logical.tasks.length > MAX_RECORDS) fail("TASK_STORE_CONTRACT", "logical task store exceeds its record limit");
  let bytes = Buffer.byteLength(canonicalJson(logical.control), "utf8");
  if (bytes > MAX_RECORD_BYTES) fail("TASK_STORE_CONTRACT", "logical control exceeds its byte limit");
  for (const task of logical.tasks) {
    const taskBytes = Buffer.byteLength(canonicalJson(task), "utf8");
    if (taskBytes > MAX_RECORD_BYTES) fail("TASK_STORE_CONTRACT", "logical task exceeds its byte limit");
    bytes += taskBytes + Buffer.byteLength(task.id, "utf8") + 16;
    if (bytes > MAX_STORE_BYTES) fail("TASK_STORE_CONTRACT", "logical task store exceeds its byte limit");
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throwTaskStoreError("corruption");
  }
}

function normalizeDriverError(error) {
  if (error?.code?.startsWith?.("TASK_STORE_")) return error;
  const busy = error?.errcode === 5 || /(?:database is locked|SQLITE_BUSY)/iu.test(String(error?.message ?? ""));
  return normalizeTaskStoreError({ category: busy ? "unavailable" : "corruption" });
}

function transaction(database, mode, operation) {
  let begun = false;
  try {
    database.exec(mode === "write" ? "BEGIN IMMEDIATE" : "BEGIN");
    begun = true;
    const result = operation();
    database.exec("COMMIT");
    begun = false;
    return result;
  } catch (error) {
    if (begun) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original bounded adapter error.
      }
    }
    throw normalizeDriverError(error);
  }
}

function readMetadata(database, expected) {
  assertTrustedSchema(database);
  assertPersistedBounds(database);
  const row = database.prepare(`
    SELECT store_id, protocol_version, task_schema_version, generation
    FROM metadata WHERE singleton = 1
  `).get();
  if (row === undefined) throwTaskStoreError("corruption");
  if (row.protocol_version !== TASK_STORE_PROTOCOL_VERSION || row.task_schema_version !== SCHEMA_VERSION) {
    throwTaskStoreError("unsupported_schema");
  }
  if (row.store_id !== expected.storeId) throwTaskStoreError("corruption");
  return { metadata: expected, generation: row.generation };
}

function readSnapshotInTransaction(database, expected) {
  const stored = readMetadata(database, expected);
  const controlRow = database.prepare("SELECT json FROM control WHERE singleton = 1").get();
  if (controlRow === undefined) throwTaskStoreError("corruption");
  const tasks = database.prepare("SELECT id, record_version, json FROM tasks ORDER BY id LIMIT ?")
    .all(MAX_RECORDS + 1)
    .map((row) => {
      const task = parseJson(row.json);
      if (task.id !== row.id || task.recordVersion !== row.record_version) throwTaskStoreError("corruption");
      return task;
    });
  return normalizeStoreSnapshot({
    metadata: stored.metadata,
    generation: generationToken(stored.generation),
    control: parseJson(controlRow.json),
    tasks,
  });
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
  if (cursor.generation !== generation) fail("CURSOR_STALE", "continuation cursor belongs to a stale store", 4);
  if (typeof cursor.lastId !== "string") fail("CURSOR_INVALID", "continuation cursor is malformed", 2);
  return cursor.lastId;
}

function validatePreconditions(snapshot, changeSet) {
  const { target, readSet, control, global } = changeSet.preconditions;
  const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
  if (target !== null) {
    const current = tasks.get(target.id);
    if (current === undefined || current.recordVersion !== target.recordVersion) {
      throwTaskStoreError("target_conflict");
    }
  }
  for (const expected of readSet) {
    if (tasks.get(expected.id)?.recordVersion !== expected.recordVersion) {
      throwTaskStoreError("read_set_conflict");
    }
  }
  if (control !== null && snapshot.control.recordVersion !== control.recordVersion) {
    throwTaskStoreError("control_conflict");
  }
  if (global !== null && generationNumber(global.generation) !== generationNumber(snapshot.generation)) {
    throwTaskStoreError("global_conflict");
  }
}

function prospectiveSnapshot(snapshot, changeSet, nextGeneration) {
  const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
  let control = snapshot.control;
  if (changeSet.changes.create !== null) {
    const task = changeSet.changes.create.task;
    if (task.id !== nextTaskId(tasks)) throwTaskStoreError("id_allocation_conflict");
    tasks.set(task.id, task);
  } else if (changeSet.changes.taskUpdates.length === 1) {
    const task = changeSet.changes.taskUpdates[0];
    tasks.set(task.id, task);
  } else {
    control = changeSet.changes.controlUpdate;
  }
  const prospective = normalizeStoreSnapshot({
    metadata: snapshot.metadata,
    generation: generationToken(nextGeneration),
    control,
    tasks: [...tasks.values()],
  });
  assertLogicalBounds({ control: prospective.control, tasks: prospective.tasks });
  return prospective;
}

function initializeDatabase(database, metadata, logical) {
  if (!hasNoSchema(database)) throwTaskStoreError("corruption");
  assertLogicalBounds(logical);
  database.exec(CREATE_SCHEMA);
  database.prepare(`
    INSERT INTO metadata(singleton, store_id, protocol_version, task_schema_version, generation)
    VALUES (1, ?, ?, ?, 1)
  `).run(metadata.storeId, metadata.protocolVersion, metadata.taskSchemaVersion);
  database.prepare("INSERT INTO control(singleton, json) VALUES (1, ?)")
    .run(canonicalJson(logical.control));
  const insertTask = database.prepare("INSERT INTO tasks(id, record_version, json) VALUES (?, ?, ?)");
  for (const task of logical.tasks) insertTask.run(task.id, task.recordVersion, canonicalJson(task));
}

/** Internal reference adapter. It is deliberately absent from production selection. */
export class SQLiteTaskStore {
  #database;
  #metadata;

  constructor(target) {
    let resolved;
    try {
      resolved = databasePath(target);
    } catch (error) {
      throw normalizeSetupError(error);
    }
    this.#metadata = normalizeStoreMetadata({
      storeId: derivedStoreId(resolved),
      protocolVersion: TASK_STORE_PROTOCOL_VERSION,
      taskSchemaVersion: SCHEMA_VERSION,
    });
    try {
      this.#database = new DatabaseSync(resolved, {
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
      });
    } catch (error) {
      throw normalizeDriverError(error);
    }
    assertTaskStore(this);
  }

  async metadata() {
    return this.#metadata;
  }

  async readSnapshot() {
    return transaction(this.#database, "read", () => readSnapshotInTransaction(this.#database, this.#metadata));
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
      const candidate = { generation: snapshot.generation, items: page, nextCursor, truncated };
      if (Buffer.byteLength(canonicalJson(candidate), "utf8") <= request.maxBytes) {
        return normalizeTaskQueryResult(candidate, request);
      }
      if (page.length === 0) fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
      page.pop();
      if (page.length === 0) fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
      truncated = true;
    }
  }

  async publish(value) {
    const changeSet = normalizeTaskChangeSet(value, this.#metadata.storeId);
    return transaction(this.#database, "write", () => {
      const snapshot = readSnapshotInTransaction(this.#database, this.#metadata);
      validatePreconditions(snapshot, changeSet);
      const nextGeneration = generationNumber(snapshot.generation) + 1;
      const prospective = prospectiveSnapshot(snapshot, changeSet, nextGeneration);
      let tasks = [];
      let control = null;
      if (changeSet.changes.create !== null) {
        const task = changeSet.changes.create.task;
        this.#database.prepare("INSERT INTO tasks(id, record_version, json) VALUES (?, ?, ?)")
          .run(task.id, task.recordVersion, canonicalJson(task));
        tasks = [task];
      } else if (changeSet.changes.taskUpdates.length === 1) {
        const task = changeSet.changes.taskUpdates[0];
        const result = this.#database.prepare(`
          UPDATE tasks SET record_version = ?, json = ? WHERE id = ? AND record_version = ?
        `).run(task.recordVersion, canonicalJson(task), task.id, changeSet.preconditions.target.recordVersion);
        if (Number(result.changes) !== 1) throwTaskStoreError("target_conflict");
        tasks = [task];
      } else {
        control = changeSet.changes.controlUpdate;
        const result = this.#database.prepare("UPDATE control SET json = ? WHERE singleton = 1")
          .run(canonicalJson(control));
        if (Number(result.changes) !== 1) throwTaskStoreError("control_conflict");
      }
      const advanced = this.#database.prepare("UPDATE metadata SET generation = ? WHERE singleton = 1 AND generation = ?")
        .run(nextGeneration, generationNumber(snapshot.generation));
      if (Number(advanced.changes) !== 1) throwTaskStoreError("global_conflict");
      return normalizeMutationReceipt({
        metadata: this.#metadata,
        generation: prospective.generation,
        control,
        tasks,
      }, this.#metadata.storeId);
    });
  }

  async initialize() {
    const logical = normalizeLogicalTaskStore({
      taskSchemaVersion: SCHEMA_VERSION,
      control: { schemaVersion: SCHEMA_VERSION, recordVersion: 1, pause: null },
      tasks: [],
    });
    return transaction(this.#database, "write", () => {
      initializeDatabase(this.#database, this.#metadata, logical);
      return readSnapshotInTransaction(this.#database, this.#metadata);
    });
  }

  async exportLogical() {
    const snapshot = await this.readSnapshot();
    return Object.freeze({
      taskSchemaVersion: SCHEMA_VERSION,
      control: snapshot.control,
      tasks: snapshot.tasks,
    });
  }

  async importLogical(value) {
    const logical = normalizeLogicalTaskStore(value);
    return transaction(this.#database, "write", () => {
      initializeDatabase(this.#database, this.#metadata, logical);
      return readSnapshotInTransaction(this.#database, this.#metadata);
    });
  }

  close() {
    this.#database.close();
  }
}

export function createSQLiteTaskStore(target) {
  return new SQLiteTaskStore(target);
}
