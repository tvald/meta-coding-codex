import path from "node:path";
import {
  TASK_CLI_VERSION,
  TASK_STORE_SCHEMA_VERSION,
} from "../../../lib/task-compatibility.mjs";

export const SCHEMA_VERSION = TASK_STORE_SCHEMA_VERSION;
export const CLI_VERSION = TASK_CLI_VERSION;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_QUERY_BYTES = 131_072;
export const MAX_QUERY_BYTES = 1_048_576;
export const MAX_RECORDS = 100_000;
export const MAX_RECORD_BYTES = 65_536;
export const MAX_CONTEXT_BYTES = 1_048_576;
export const MAX_STORE_BYTES = 67_108_864;
export const MAX_TOTAL_DEPENDENCIES = 1_000_000;

export const STATUSES = Object.freeze([
  "pending",
  "ready",
  "active",
  "parked",
  "blocked",
  "needs_verification",
  "done",
  "cancelled",
  "superseded",
]);
export const TERMINAL_STATUSES = new Set(["done", "cancelled", "superseded"]);
export const ROUTES = Object.freeze([
  "unrouted",
  "quick_change",
  "clarify",
  "discover",
  "decide",
  "initiative",
  "correct_course",
]);
export const RISKS = Object.freeze(["low", "medium", "high", "critical"]);

const TASK_KEYS = Object.freeze([
  "schemaVersion",
  "id",
  "recordVersion",
  "taskRevision",
  "outcome",
  "authority",
  "status",
  "dependencies",
  "route",
  "risk",
  "tags",
  "gate",
  "nextSafeAction",
  "details",
  "completion",
]);
const CONTROL_KEYS = Object.freeze(["schemaVersion", "recordVersion", "pause"]);

export class FrameworkDataError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "FrameworkDataError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function fail(code, message, exitCode = 1) {
  throw new FrameworkDataError(code, message, exitCode);
}

function exactKeys(value, keys, label) {
  if (!isPlainObject(value)) fail("SCHEMA_INVALID", `${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    fail("SCHEMA_INVALID", `${label} has unknown, missing, or out-of-order fields`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail("SCHEMA_INVALID", `${label} must be a positive integer`);
}

const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;

export function safeText(value, label, { nullable = false, max = 4096 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > max ||
      UNSAFE_TEXT.test(value) || UNPAIRED_SURROGATE.test(value)) {
    fail("UNSAFE_TEXT", `${label} is empty, oversized, or contains unsafe control text`);
  }
}

export function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateDate(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !isDate(value)) fail("SCHEMA_INVALID", `${label} must be an ISO calendar date`);
}

export function parseTaskId(id) {
  if (typeof id !== "string" || !/^T-(?:\d{4}|[1-9]\d{4,})$/u.test(id)) {
    fail("TASK_ID_INVALID", "task ID is not canonical");
  }
  const numeric = Number(id.slice(2));
  if (!Number.isSafeInteger(numeric) || numeric < 1 || formatTaskId(numeric) !== id) {
    fail("TASK_ID_INVALID", "task ID is outside the supported numeric range or is not canonical");
  }
  return numeric;
}

export function formatTaskId(numeric) {
  if (!Number.isSafeInteger(numeric) || numeric < 1) fail("TASK_ID_INVALID", "task number is invalid");
  return `T-${String(numeric).padStart(4, "0")}`;
}

export function shardForTaskId(id) {
  return String(Math.floor((parseTaskId(id) - 1) / 1000)).padStart(4, "0");
}

const DETAIL_ROOTS = [
  "readme/tasks/",
  "readme/decisions/",
  "readme/quality/",
  "readme/threat-models/",
  "readme/incidents/",
];

export function validateDetailPath(value, label = "detail path") {
  safeText(value, label, { max: 1024 });
  if (value.includes("\\") || value.includes(":") || value.includes("//") ||
      path.posix.isAbsolute(value) || path.posix.normalize(value) !== value ||
      value.split("/").some((part) => part === "" || part === "." || part === "..") ||
      !DETAIL_ROOTS.some((root) => value.startsWith(root)) || !value.endsWith(".md") ||
      !/^[A-Za-z0-9._/-]+$/u.test(value)) {
    fail("PATH_UNSAFE", `${label} must be a normalized repository-relative Markdown path`);
  }
}

function validateAuthority(value) {
  exactKeys(value, ["reference", "acceptedDate"], "authority");
  safeText(value.reference, "authority reference");
  validateDate(value.acceptedDate, "authority acceptedDate", true);
}

function validateGate(value, taskRevision) {
  if (!isPlainObject(value) || typeof value.kind !== "string") fail("SCHEMA_INVALID", "gate is invalid");
  if (value.kind === "none") {
    exactKeys(value, ["kind"], "none gate");
    return;
  }
  if (value.kind === "blocker") {
    exactKeys(value, ["kind", "summary"], "blocker gate");
    safeText(value.summary, "blocker summary");
    return;
  }
  if (value.kind !== "approval") fail("SCHEMA_INVALID", "gate kind is unsupported");
  exactKeys(value, [
    "kind", "summary", "id", "status", "boundTaskRevision", "source", "action",
    "boundary", "detailPath",
  ], "approval gate");
  safeText(value.summary, "approval summary", { nullable: true });
  if (![null, "pending", "granted", "denied", "expired"].includes(value.status)) {
    fail("SCHEMA_INVALID", "approval status is invalid");
  }
  integer(value.boundTaskRevision, "approval boundTaskRevision");
  if (value.boundTaskRevision !== taskRevision) fail("APPROVAL_STALE", "approval is bound to a different task revision");
  if (value.status === null) {
    if (value.id !== null || value.source !== null || value.action !== null ||
        value.boundary !== null || value.detailPath !== null) {
      fail("SCHEMA_INVALID", "legacy approval without status cannot contain asserted evidence");
    }
    return;
  }
  safeText(value.id, "approval id", { max: 256 });
  safeText(value.source, "approval source");
  safeText(value.action, "approval action");
  safeText(value.boundary, "approval boundary");
  validateDetailPath(value.detailPath, "approval detail path");
}

function validateCompletion(value, terminal) {
  if (value === null) {
    if (terminal) fail("SCHEMA_INVALID", "terminal task requires a completion record");
    return;
  }
  if (!terminal) fail("SCHEMA_INVALID", "nonterminal task cannot have a completion record");
  exactKeys(value, ["completedAt", "repositoryChanged", "evidence"], "completion");
  validateDate(value.completedAt, "completion completedAt", true);
  if (value.repositoryChanged !== null && typeof value.repositoryChanged !== "boolean") {
    fail("SCHEMA_INVALID", "completion repositoryChanged must be boolean or null");
  }
  safeText(value.evidence, "completion evidence", { nullable: true, max: 8192 });
}

export function normalizeTask(value) {
  validateTask(value);
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    recordVersion: value.recordVersion,
    taskRevision: value.taskRevision,
    outcome: value.outcome,
    authority: { reference: value.authority.reference, acceptedDate: value.authority.acceptedDate },
    status: value.status,
    dependencies: [...value.dependencies],
    route: value.route,
    risk: value.risk,
    tags: [...value.tags],
    gate: { ...value.gate },
    nextSafeAction: value.nextSafeAction,
    details: value.details.map((detail) => ({ label: detail.label, path: detail.path })),
    completion: value.completion === null ? null : { ...value.completion },
  };
}

export function validateTask(value) {
  exactKeys(value, TASK_KEYS, "task");
  if (value.schemaVersion !== SCHEMA_VERSION) fail("SCHEMA_UNSUPPORTED", "task schemaVersion is unsupported");
  parseTaskId(value.id);
  integer(value.recordVersion, "recordVersion");
  integer(value.taskRevision, "taskRevision");
  safeText(value.outcome, "outcome");
  validateAuthority(value.authority);
  if (!STATUSES.includes(value.status)) fail("SCHEMA_INVALID", "task status is invalid");
  if (!Array.isArray(value.dependencies) || value.dependencies.length > 1000) {
    fail("SCHEMA_INVALID", "dependencies must be a bounded array");
  }
  const seen = new Set();
  for (const dependency of value.dependencies) {
    parseTaskId(dependency);
    if (dependency === value.id || seen.has(dependency)) fail("DEPENDENCY_INVALID", "dependency is self-referential or duplicated");
    seen.add(dependency);
  }
  if (!ROUTES.includes(value.route)) fail("SCHEMA_INVALID", "route is invalid");
  if (value.risk !== null && !RISKS.includes(value.risk)) fail("SCHEMA_INVALID", "risk is invalid");
  if ((value.route === "unrouted") !== (value.risk === null)) {
    fail("SCHEMA_INVALID", "unrouted tasks require null risk and routed tasks require risk");
  }
  if ((value.status === "ready" || value.status === "active") &&
      (value.route === "unrouted" || value.risk === null)) {
    fail("STATE_INVALID", "Ready and Active tasks require a routed risk assessment");
  }
  if (!Array.isArray(value.tags) || value.tags.length > 32) {
    fail("SCHEMA_INVALID", "tags must be a bounded array");
  }
  const tags = new Set();
  for (const tag of value.tags) {
    if (typeof tag !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(tag) || tags.has(tag)) {
      fail("SCHEMA_INVALID", "tags must be unique canonical lowercase values");
    }
    tags.add(tag);
  }
  validateGate(value.gate, value.taskRevision);
  safeText(value.nextSafeAction, "nextSafeAction", { nullable: true, max: 8192 });
  if (!Array.isArray(value.details) || value.details.length > 32) fail("SCHEMA_INVALID", "details must be a bounded array");
  const paths = new Set();
  for (const detail of value.details) {
    exactKeys(detail, ["label", "path"], "detail reference");
    safeText(detail.label, "detail label", { max: 256 });
    validateDetailPath(detail.path);
    if (paths.has(detail.path)) fail("SCHEMA_INVALID", "detail paths must be unique");
    paths.add(detail.path);
  }
  const terminal = TERMINAL_STATUSES.has(value.status);
  validateCompletion(value.completion, terminal);
  if (value.status === "blocked" && value.gate.kind !== "blocker") {
    fail("STATE_INVALID", "blocked task requires a blocker gate");
  }
  if (value.status !== "blocked" && value.gate.kind === "blocker" &&
      value.status !== "cancelled" && value.status !== "superseded") {
    fail("STATE_INVALID", "blocker gate requires Blocked, Cancelled, or Superseded task status");
  }
  if ((value.status === "active" || value.status === "done") && value.gate.kind === "approval" &&
      value.gate.status !== "granted") {
    fail("STATE_INVALID", "Active and Done tasks cannot retain an unresolved approval");
  }
  if (value.status === "ready" && value.gate.kind === "approval" && value.gate.status !== "granted") {
    fail("STATE_INVALID", "Ready tasks cannot retain an unresolved approval");
  }
}

export function normalizeControl(value) {
  validateControl(value);
  return {
    schemaVersion: value.schemaVersion,
    recordVersion: value.recordVersion,
    pause: value.pause === null ? null : { reason: value.pause.reason, source: value.pause.source },
  };
}

export function validateControl(value) {
  exactKeys(value, CONTROL_KEYS, "control");
  if (value.schemaVersion !== SCHEMA_VERSION) fail("SCHEMA_UNSUPPORTED", "control schemaVersion is unsupported");
  integer(value.recordVersion, "control recordVersion");
  if (value.pause === null) return;
  exactKeys(value.pause, ["reason", "source"], "pause");
  safeText(value.pause.reason, "pause reason");
  safeText(value.pause.source, "pause source");
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function displayStatus(status) {
  const labels = {
    pending: "Pending",
    ready: "Ready",
    active: "Active",
    parked: "Parked",
    blocked: "Blocked",
    needs_verification: "Needs verification",
    done: "Done",
    cancelled: "Cancelled",
    superseded: "Superseded",
  };
  return labels[status];
}

export function displayRoute(route) {
  const labels = {
    unrouted: "Unrouted",
    quick_change: "Quick change",
    clarify: "Clarify",
    discover: "Discover",
    decide: "Decide",
    initiative: "Initiative",
    correct_course: "Correct course",
  };
  return labels[route];
}
