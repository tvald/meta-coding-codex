import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  MAX_RECORD_BYTES,
  MAX_RECORDS,
  MAX_STORE_BYTES,
  MAX_TOTAL_DEPENDENCIES,
  TERMINAL_STATUSES,
  canonicalJson,
  fail,
  normalizeTask,
  parseTaskId,
  safeText,
  validateDetailPath,
} from "./schema.mjs";
import {
  compareTaskIds,
  loadStore,
  taskRecordRelativePath,
  validateState,
} from "./store.mjs";

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const MAX_MIGRATION_SOURCES = 64;
const MAX_MIGRATION_BYTES = 64 * 1024 * 1024;
const HEADER = [
  "ID",
  "Outcome",
  "Authority / Rev",
  "Status",
  "Depends On",
  "Route / Risk",
  "Approval Or Blocker",
  "Next Safe Action",
  "Details",
  "Result",
];

const STATUS_MAP = new Map([
  ["Pending", "pending"],
  ["Ready", "ready"],
  ["Active", "active"],
  ["Parked", "parked"],
  ["Blocked", "blocked"],
  ["Needs verification", "needs_verification"],
  ["Done", "done"],
  ["Cancelled", "cancelled"],
  ["Superseded", "superseded"],
]);
const ROUTE_MAP = new Map([
  ["Quick change", "quick_change"],
  ["Clarify", "clarify"],
  ["Discover", "discover"],
  ["Decide", "decide"],
  ["Initiative", "initiative"],
  ["Correct course", "correct_course"],
]);
const RISK_MAP = new Map([
  ["Low", "low"],
  ["Medium", "medium"],
  ["High", "high"],
  ["Critical", "critical"],
]);

function decodeEscapedPipes(value) {
  return value.replace(/(\\+)\|/gu, (_match, slashes) => `${"\\".repeat(slashes.length - 1)}|`);
}

export function splitFormat1Row(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) fail("FORMAT1_ROW", "Format 1 row must begin and end with a divider");
  const cells = [];
  let current = "";
  for (const character of line) {
    if (character === "|") {
      let backslashes = 0;
      for (let index = current.length - 1; index >= 0 && current[index] === "\\"; index -= 1) backslashes += 1;
      if (backslashes % 2 === 0) {
        cells.push(current);
        if (cells.length > HEADER.length + 1) {
          fail("FORMAT1_ROW", "Format 1 row contains too many divider-separated cells");
        }
        current = "";
        continue;
      }
    }
    current += character;
  }
  cells.push(current);
  if (cells.length > HEADER.length + 2) {
    fail("FORMAT1_ROW", "Format 1 row contains too many divider-separated cells");
  }
  if (cells[0] !== "" || cells.at(-1) !== "") fail("FORMAT1_ROW", "Format 1 row has malformed outer dividers");
  return cells.slice(1, -1).map((cell) => decodeEscapedPipes(cell.trim()));
}

function textLines(text) {
  return {
    *[Symbol.iterator]() {
      let start = 0;
      while (start <= text.length) {
        const end = text.indexOf("\n", start);
        if (end === -1) {
          yield text.slice(start);
          break;
        }
        yield text.slice(start, end);
        start = end + 1;
      }
    },
  };
}

function sectionRows(text, heading) {
  let headingCount = 0;
  let phase = "before";
  let header = null;
  let separator = null;
  const rows = [];
  for (const line of textLines(text)) {
    if (line === heading) {
      headingCount += 1;
      if (headingCount > 1) fail("FORMAT1_SECTION", `legacy input must contain exactly one ${heading} section`);
      phase = "leading_blanks";
      continue;
    }
    if (phase === "before" || phase === "done") continue;
    if (phase === "leading_blanks" && line === "") continue;
    if (phase === "leading_blanks") {
      header = splitFormat1Row(line);
      phase = "separator";
      continue;
    }
    if (phase === "separator") {
      separator = splitFormat1Row(line);
      phase = "rows";
      continue;
    }
    if (line === "") {
      phase = "done";
      continue;
    }
    if (!line.startsWith("|")) fail("FORMAT1_ROW", "legacy task table contains a row without its leading divider");
    const cells = splitFormat1Row(line);
    if (cells.length !== HEADER.length) fail("FORMAT1_ROW", "legacy task row does not contain exactly ten cells");
    rows.push(cells);
    if (rows.length > MAX_RECORDS) fail("STORE_SIZE", "legacy task table exceeds the task-count limit");
  }
  if (headingCount !== 1) fail("FORMAT1_SECTION", `legacy input must contain exactly one ${heading} section`);
  if (header === null || separator === null) fail("FORMAT1_HEADER", "legacy task table header is missing");
  if (header.length !== HEADER.length || header.some((cell, cellIndex) => cell !== HEADER[cellIndex])) {
    fail("FORMAT1_HEADER", "legacy task table header is not the exact Format 1 header");
  }
  if (separator.length !== HEADER.length || separator.some((cell) => !/^:?-{3,}:?$/u.test(cell))) {
    fail("FORMAT1_HEADER", "legacy task table separator is invalid");
  }
  return rows;
}

function metadataValue(text, name) {
  const expression = new RegExp(`^- ${name}: (.+)$`, "gmu");
  let value = null;
  for (const match of text.matchAll(expression)) {
    if (value !== null) fail("FORMAT1_METADATA", `legacy catalog ${name} metadata is missing or duplicated`);
    value = match[1];
  }
  if (value === null) fail("FORMAT1_METADATA", `legacy catalog ${name} metadata is missing or duplicated`);
  return decodeEscapedPipes(value);
}

function archivedMetadataPaths(cell) {
  if (cell === "None") return [];
  const paths = [];
  let remaining = cell;
  while (remaining.length > 0) {
    const match = /^\[([^\]\n]+)\]\(([^)\n]+)\)/u.exec(remaining);
    if (!match) fail("FORMAT1_METADATA", "Archived task rows metadata is not an exact Markdown-link list");
    const resolved = path.posix.normalize(path.posix.join("readme/tasks", match[2]));
    if (!resolved.startsWith("readme/archive/tasks/") || !resolved.endsWith(".md") ||
        resolved.includes("\\") || path.posix.isAbsolute(match[2])) {
      fail("FORMAT1_METADATA", "Archived task rows metadata contains an unsafe source");
    }
    paths.push(resolved);
    if (paths.length + 1 > MAX_MIGRATION_SOURCES) {
      fail("STORE_SIZE", "Archived task rows metadata exceeds the migration source-count limit");
    }
    remaining = remaining.slice(match[0].length);
    if (remaining === "") break;
    if (!remaining.startsWith(", ")) fail("FORMAT1_METADATA", "Archived task rows metadata requires comma-space separators");
    remaining = remaining.slice(2);
  }
  return paths;
}

function parseAuthority(cell) {
  const match = /^(.*) \/ r([1-9]\d*)$/u.exec(cell);
  if (!match) fail("FORMAT1_AUTHORITY", "legacy authority/revision cell is ambiguous");
  safeText(match[1], "legacy authority reference");
  const date = match[1].match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0] ?? null;
  return {
    authority: { reference: match[1], acceptedDate: date },
    taskRevision: Number(match[2]),
  };
}

function parseDependencies(cell) {
  if (cell === "None") return [];
  const dependencies = [];
  let start = 0;
  while (start <= cell.length) {
    const comma = cell.indexOf(",", start);
    const end = comma === -1 ? cell.length : comma;
    const dependency = cell.slice(start, end);
    parseTaskId(dependency);
    dependencies.push(dependency);
    if (dependencies.length > 1000) fail("SCHEMA_INVALID", "legacy task has too many dependencies");
    if (comma === -1) break;
    start = comma + 1;
    while (start < cell.length && /\s/u.test(cell[start])) start += 1;
  }
  return dependencies;
}

function parseRouteRisk(cell) {
  if (cell === "Unrouted") return { route: "unrouted", risk: null };
  const match = /^(.*) \/ (Low|Medium|High|Critical)$/u.exec(cell);
  if (!match || !ROUTE_MAP.has(match[1])) fail("FORMAT1_ROUTE", "legacy route/risk cell is ambiguous");
  return { route: ROUTE_MAP.get(match[1]), risk: RISK_MAP.get(match[2]) };
}

function parseGate(cell, status, taskRevision) {
  if (cell === "None") return { kind: "none" };
  safeText(cell, "legacy approval or blocker");
  if (status === "blocked") return { kind: "blocker", summary: cell };
  return {
    kind: "approval",
    summary: cell,
    id: null,
    status: null,
    boundTaskRevision: taskRevision,
    source: null,
    action: null,
    boundary: null,
    detailPath: null,
  };
}

function resolveLegacyDetail(target) {
  if (target.includes("\\") || target.includes(":") || target.includes("#") || path.posix.isAbsolute(target)) {
    fail("FORMAT1_DETAILS", "legacy detail link target is unsafe or unsupported");
  }
  const resolved = path.posix.normalize(path.posix.join("readme/tasks", target));
  validateDetailPath(resolved, "legacy detail path");
  return resolved;
}

function parseDetails(cell) {
  if (cell === "None") return [];
  const details = [];
  let remaining = cell;
  while (remaining.length > 0) {
    const match = /^\[([^\]\n]+)\]\(([^)\n]+)\)/u.exec(remaining);
    if (!match) fail("FORMAT1_DETAILS", "legacy details cell is not an exact Markdown-link list");
    safeText(match[1], "legacy detail label", { max: 256 });
    details.push({ label: match[1], path: resolveLegacyDetail(match[2]) });
    if (details.length > 32) fail("SCHEMA_INVALID", "legacy task has too many detail links");
    remaining = remaining.slice(match[0].length);
    if (remaining === "") break;
    if (!remaining.startsWith(", ")) fail("FORMAT1_DETAILS", "legacy detail links require comma-space separators");
    remaining = remaining.slice(2);
  }
  return details;
}

function parseTask(cells) {
  const [id, outcome, authorityCell, statusCell, dependenciesCell, routeRiskCell,
    gateCell, nextCell, detailsCell, resultCell] = cells;
  parseTaskId(id);
  safeText(outcome, "legacy outcome");
  const status = STATUS_MAP.get(statusCell);
  if (!status) fail("FORMAT1_STATUS", "legacy task status is unsupported");
  const { authority, taskRevision } = parseAuthority(authorityCell);
  const { route, risk } = parseRouteRisk(routeRiskCell);
  const terminal = TERMINAL_STATUSES.has(status);
  if (!terminal && resultCell !== "Pending" && resultCell !== "None") {
    fail("FORMAT1_RESULT", "nonterminal legacy task has an ambiguous result");
  }
  const task = {
    schemaVersion: 1,
    id,
    recordVersion: 1,
    taskRevision,
    outcome,
    authority,
    status,
    dependencies: parseDependencies(dependenciesCell),
    route,
    risk,
    tags: [],
    gate: parseGate(gateCell, status, taskRevision),
    nextSafeAction: nextCell === "None" ? null : nextCell,
    details: parseDetails(detailsCell),
    completion: terminal ? {
      completedAt: null,
      repositoryChanged: null,
      evidence: resultCell === "None" || resultCell === "Pending" ? null : resultCell,
    } : null,
  };
  return normalizeTask(task);
}

async function sourceFile(context, relative, expectedKind) {
  if (typeof relative !== "string" || relative.includes("\\") || path.posix.isAbsolute(relative) ||
      path.posix.normalize(relative) !== relative || relative.split("/").some((part) => part === "" || part === "." || part === "..") ||
      !relative.endsWith(".md")) {
    fail("PATH_UNSAFE", "migration source path is not normalized repository-relative Markdown");
  }
  if (expectedKind === "catalog" && relative !== "readme/tasks/README.md") {
    fail("PATH_UNSAFE", "Format 1 catalog source must be readme/tasks/README.md");
  }
  if (expectedKind === "archive" && !relative.startsWith("readme/archive/tasks/")) {
    fail("PATH_UNSAFE", "Format 1 archive source must be beneath readme/archive/tasks/");
  }
  const file = path.join(context.root, ...relative.split("/"));
  let ancestor = context.root;
  for (const component of relative.split("/").slice(0, -1)) {
    ancestor = path.join(ancestor, component);
    const ancestorInfo = await fs.lstat(ancestor).catch(() => fail("PATH_UNSAFE", "migration source parent is missing"));
    if (!ancestorInfo.isDirectory() || ancestorInfo.isSymbolicLink()) {
      fail("PATH_UNSAFE", "migration source parent is not a safe directory");
    }
  }
  const info = await fs.lstat(file).catch(() => fail("MIGRATION_SOURCE", "migration source is missing"));
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size < 1 || info.size > 5_000_000) {
    fail("MIGRATION_SOURCE", "migration source must be one bounded regular file");
  }
  const real = await fs.realpath(file);
  const relativeReal = path.relative(context.root, real);
  if (relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) fail("PATH_UNSAFE", "migration source escapes repository root");
  const bytes = await fs.readFile(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("UTF8_INVALID", "migration source must not begin with a UTF-8 byte-order mark");
  }
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    fail("UTF8_INVALID", "migration source is not valid UTF-8");
  }
  return {
    relative,
    file,
    bytes,
    text,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function combinedSourceDigest(sources) {
  const hash = createHash("sha256");
  for (const source of [...sources].sort((left, right) => left.relative.localeCompare(right.relative))) {
    hash.update(`${source.relative}\0`, "utf8");
    hash.update(source.bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

function countTransformations(sources, tasks, archivedDetailLinks, scheduling, pauseReason) {
  const countMatches = (text, expression) => {
    let count = 0;
    for (const _match of text.matchAll(expression)) count += 1;
    return count;
  };
  let escapedPipeCount = 0;
  let nonePendingCount = 0;
  for (const source of sources) {
    escapedPipeCount += countMatches(source.text, /(?:^|[^\\])(?:\\\\)*\\\|/gu);
    nonePendingCount += countMatches(source.text, /\| (?:None|Pending) (?=\|)/gu);
  }
  const unknownCompletionCount = [...tasks.values()].filter((task) => task.completion !== null &&
    (task.completion.completedAt === null || task.completion.repositoryChanged === null)).length;
  return [
    { kind: "escaped-pipe-to-text", count: escapedPipeCount },
    { kind: "none-pending-to-null", count: nonePendingCount },
    { kind: "authority-revision-split", count: tasks.size },
    { kind: "route-risk-split", count: [...tasks.values()].filter((task) => task.route !== "unrouted").length },
    { kind: "legacy-tags-default-empty", count: tasks.size },
    { kind: "archive-link-original-catalog-base", count: archivedDetailLinks },
    { kind: "unknown-legacy-completion-metadata", count: unknownCompletionCount },
    { kind: "scheduling-to-pause-control", count: 1 },
    { kind: "missing-pause-reason-defaulted", count: scheduling === "Paused" && pauseReason === "None" ? 1 : 0 },
  ];
}

function validatePreparedSizes(migration) {
  const controlBytes = Buffer.byteLength(canonicalJson(migration.control), "utf8");
  if (controlBytes > MAX_RECORD_BYTES) fail("RECORD_SIZE", "migrated control record exceeds the byte limit");
  let aggregateBytes = controlBytes;
  for (const task of migration.tasks.values()) {
    const taskBytes = Buffer.byteLength(canonicalJson(task), "utf8");
    if (taskBytes > MAX_RECORD_BYTES) fail("RECORD_SIZE", "migrated task record exceeds the byte limit");
    aggregateBytes += taskBytes;
    if (aggregateBytes > MAX_STORE_BYTES) {
      fail("STORE_SIZE", "migrated task store exceeds the aggregate byte limit");
    }
  }
  return aggregateBytes;
}

export async function prepareFormat1Migration(context, catalogPath, archivePaths) {
  if (!Array.isArray(archivePaths)) fail("ARGUMENT_INVALID", "archive paths must be a list", 2);
  if (archivePaths.length + 1 > MAX_MIGRATION_SOURCES) fail("STORE_SIZE", "migration has too many source files");
  const catalog = await sourceFile(context, catalogPath, "catalog");
  let aggregateBytes = catalog.bytes.length;
  const archives = [];
  const seenPaths = new Set([catalogPath]);
  for (const archivePath of archivePaths) {
    if (seenPaths.has(archivePath)) fail("ARGUMENT_INVALID", "migration source paths must be unique", 2);
    seenPaths.add(archivePath);
    const archive = await sourceFile(context, archivePath, "archive");
    aggregateBytes += archive.bytes.length;
    if (aggregateBytes > MAX_MIGRATION_BYTES) fail("STORE_SIZE", "migration sources exceed the aggregate byte limit");
    archives.push(archive);
  }
  const tasks = new Map();
  let archivedDetailLinks = 0;
  let totalDependencies = 0;
  const addRows = (rows, archived = false) => {
    for (const cells of rows) {
      const task = parseTask(cells);
      if (tasks.has(task.id)) fail("TASK_ID_COLLISION", "legacy inputs contain a duplicate task ID");
      tasks.set(task.id, task);
      if (tasks.size > MAX_RECORDS) fail("STORE_SIZE", "migration exceeds the task-count limit");
      totalDependencies += task.dependencies.length;
      if (totalDependencies > MAX_TOTAL_DEPENDENCIES) {
        fail("STORE_SIZE", "migration exceeds the aggregate dependency limit");
      }
      if (archived) archivedDetailLinks += task.details.length;
    }
  };
  addRows(sectionRows(catalog.text, "## Tasks"));
  for (const archive of archives) addRows(sectionRows(archive.text, "## Archived Rows"), true);
  const sortedTasks = new Map([...tasks].sort(([left], [right]) => compareTaskIds(left, right)));
  const format = metadataValue(catalog.text, "Format");
  if (format !== "1") fail("FORMAT1_METADATA", "legacy catalog Format is not 1");
  const primary = metadataValue(catalog.text, "Primary task");
  const nextId = metadataValue(catalog.text, "Next task ID");
  const scheduling = metadataValue(catalog.text, "Scheduling");
  const pauseReason = metadataValue(catalog.text, "Global pause source or reason");
  const archivedMetadata = archivedMetadataPaths(metadataValue(catalog.text, "Archived task rows"));
  const providedArchives = archives.map((archive) => archive.relative).sort();
  if (JSON.stringify([...archivedMetadata].sort()) !== JSON.stringify(providedArchives)) {
    fail("FORMAT1_METADATA", "Archived task rows metadata does not match the explicit archive inputs");
  }
  if (!["Active", "Idle", "Running", "Paused"].includes(scheduling)) {
    fail("FORMAT1_METADATA", "legacy Scheduling value is unsupported");
  }
  const active = [...sortedTasks.values()].filter((task) => task.status === "active");
  if (primary === "None") {
    if (active.length !== 0) fail("FORMAT1_METADATA", "legacy primary metadata disagrees with Active task state");
  } else {
    parseTaskId(primary);
    if (active.length !== 1 || active[0].id !== primary) {
      fail("FORMAT1_METADATA", "legacy primary metadata disagrees with Active task state");
    }
  }
  if (["Idle", "Paused"].includes(scheduling) && (primary !== "None" || active.length !== 0)) {
    fail("FORMAT1_METADATA", `legacy ${scheduling} scheduling disagrees with primary or Active task state`);
  }
  if (scheduling === "Active" && (primary === "None" || active.length !== 1)) {
    fail("FORMAT1_METADATA", "legacy Active scheduling requires one matching primary task");
  }
  const pause = scheduling === "Paused" ? {
    reason: pauseReason === "None" ? "Legacy catalog pause" : pauseReason,
    source: pauseReason === "None" ? "Format 1 migration" : pauseReason,
  } : null;
  if (scheduling !== "Paused" && pauseReason !== "None") {
    fail("FORMAT1_METADATA", "unpaused legacy catalog has a pause reason");
  }
  const control = { schemaVersion: 1, recordVersion: 1, pause };
  validateState(control, sortedTasks);
  const preparedBytes = validatePreparedSizes({ control, tasks: sortedTasks });
  let highestTaskNumber = 0;
  for (const id of sortedTasks.keys()) highestTaskNumber = Math.max(highestTaskNumber, parseTaskId(id));
  const derivedNext = `T-${String(highestTaskNumber + 1).padStart(4, "0")}`;
  if (nextId !== derivedNext) fail("FORMAT1_METADATA", "legacy Next task ID does not match the derived next ID");
  const sources = [catalog, ...archives];
  const statusCounts = Object.fromEntries([...new Set([...sortedTasks.values()].map((task) => task.status))]
    .sort().map((status) => [status, [...sortedTasks.values()].filter((task) => task.status === status).length]));
  return {
    control,
    tasks: sortedTasks,
    sourceDigest: combinedSourceDigest(sources),
    sources,
    report: {
      sourceFormat: 1,
      taskCount: sortedTasks.size,
      firstTaskId: sortedTasks.keys().next().value ?? null,
      lastTaskId: [...sortedTasks.keys()].at(-1) ?? null,
      primaryTaskId: active[0]?.id ?? null,
      paused: pause !== null,
      statusCounts,
      sources: sources.map((source) => ({ path: source.relative, bytes: source.bytes.length, sha256: source.sha256 })),
      archivedRowSources: archivedMetadata,
      transformations: countTransformations(sources, sortedTasks, archivedDetailLinks, scheduling, pauseReason),
      preparedBytes,
    },
  };
}

async function durableExclusiveWrite(file, text) {
  let handle;
  try {
    handle = await fs.open(file, "wx", 0o644);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeStagedStore(stage, migration) {
  await fs.mkdir(stage, { mode: 0o755 });
  await fs.mkdir(path.join(stage, "records"), { mode: 0o755 });
  await durableExclusiveWrite(path.join(stage, "control.json"), canonicalJson(migration.control));
  let currentShard = null;
  for (const task of migration.tasks.values()) {
    const relative = taskRecordRelativePath(task.id);
    const shard = relative.split("/")[1];
    if (shard !== currentShard) {
      if (currentShard !== null) await syncDirectory(path.join(stage, "records", currentShard));
      await fs.mkdir(path.join(stage, "records", shard), { mode: 0o755 });
      currentShard = shard;
    }
    await durableExclusiveWrite(path.join(stage, ...relative.split("/")), canonicalJson(task));
  }
  if (currentShard !== null) await syncDirectory(path.join(stage, "records", currentShard));
  await syncDirectory(path.join(stage, "records"));
  await syncDirectory(stage);
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EBADF", "EISDIR"].includes(error.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function applyFormat1Migration(context, prepared, expectedSourceDigest, catalogPath, archivePaths) {
  if (expectedSourceDigest !== prepared.sourceDigest) fail("STALE_SOURCE", "expected migration source digest is stale", 4);
  validatePreparedSizes(prepared);
  const destinationExists = await fs.lstat(context.storeRoot).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
  if (destinationExists) fail("DESTINATION_COLLISION", "canonical task store already exists", 4);
  const parent = path.dirname(context.storeRoot);
  const readme = path.join(context.root, "readme");
  for (const [directory, label] of [[readme, "readme"], [parent, "task store parent"]]) {
    const info = await fs.lstat(directory).catch(() => fail("PATH_UNSAFE", `${label} is missing`));
    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(directory) !== directory) {
      fail("PATH_UNSAFE", `${label} must be a physical repository directory`);
    }
  }
  const stage = path.join(parent, `.framework-data-migration-${randomUUID()}`);
  try {
    await writeStagedStore(stage, prepared);
    await loadStore(context, { storeRoot: stage, checkGit: false });
    const rechecked = await prepareFormat1Migration(context, catalogPath, archivePaths);
    if (rechecked.sourceDigest !== expectedSourceDigest) fail("STALE_SOURCE", "migration source changed before cutover", 4);
    const collision = await fs.lstat(context.storeRoot).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
    if (collision) fail("DESTINATION_COLLISION", "canonical task store appeared before cutover", 4);
    const parentInfo = await fs.lstat(parent);
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || await fs.realpath(parent) !== parent) {
      fail("PATH_UNSAFE", "task store parent changed before cutover");
    }
    await fs.rename(stage, context.storeRoot);
    await syncDirectory(parent);
    const loaded = await loadStore(context);
    return { loaded, report: prepared.report };
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
