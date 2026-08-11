#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import {
  CLI_VERSION,
  DEFAULT_LIMIT,
  DEFAULT_QUERY_BYTES,
  MAX_CONTEXT_BYTES,
  MAX_LIMIT,
  MAX_QUERY_BYTES,
  RISKS,
  ROUTES,
  STATUSES,
  TERMINAL_STATUSES,
  FrameworkDataError,
  canonicalJson,
  fail,
  isDate,
  normalizeTask,
  parseTaskId,
  safeText,
  validateDate,
  validateDetailPath,
} from "./schema.mjs";
import {
  activeTask,
  addTask,
  assertOrdinaryDirectoryTree,
  assertExpectedDigest,
  compareTaskIds,
  initializeStore,
  inspectLock,
  loadStore,
  mutateControl,
  mutateTask,
  nextTaskId,
  repositoryContext,
  recoverLock,
  taskIsCandidate,
  withLock,
} from "./store.mjs";
import { applyFormat1Migration, prepareFormat1Migration } from "./importer.mjs";
import { runFrameworkChecks } from "./framework-checks.mjs";

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const TERMINAL_FILTER = new Set(TERMINAL_STATUSES);

function outputJson(value) {
  return canonicalJson(value).replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/gu,
    (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`);
}

function writeJson(value, stream = process.stdout) {
  stream.write(outputJson(value));
}

function usage() {
  return `Usage: node readme/meta/framework-data/cli.mjs COMMAND [OPTIONS]

Commands:
  --help | --version
  preflight
  init
  doctor [--staged]
  startup [--limit N] [--max-bytes N] [--cursor CURSOR]
  task get ID [--max-bytes N]
  task list|candidates [--status STATUS]... [--all] [--route ROUTE] [--risk RISK]
      [--authority TEXT] [--tag TAG]... [--accepted-after DATE] [--accepted-before DATE]
      [--depends-on ID] [--repository-changed true|false|unknown]
      [--completed-after DATE] [--completed-before DATE]
      [--limit N] [--max-bytes N] [--cursor CURSOR]
  task deps ID [--direction ancestors|dependents|both] [--limit N]
      [--max-bytes N] [--cursor CURSOR]
  task context ID [--max-bytes N]
  task add --outcome TEXT --authority-reference TEXT [--accepted-date DATE]
      [--status pending|ready] [--route ROUTE --risk RISK] [--tag TAG]...
      [--depends-on ID]... [--next-safe-action TEXT] [--detail LABEL=PATH]...
  task amend ID --expected-record-version N --outcome TEXT --authority-reference TEXT
      [--accepted-date DATE] [--route ROUTE --risk RISK] [--tag TAG]...
      [--next-safe-action TEXT] [--detail LABEL=PATH]...
  task set-dependencies ID --expected-record-version N --expected-store-digest DIGEST
      [--depends-on ID]...
  task record-approval ID --expected-record-version N --id TEXT
      --status pending|granted|denied|expired --source TEXT --action TEXT
      --boundary TEXT --detail-path PATH [--summary TEXT]
  task select ID --expected-record-version N --expected-store-digest DIGEST
      [--next-safe-action TEXT]
  task checkpoint ID --expected-record-version N --status STATUS
      [--next-safe-action TEXT] [--blocker TEXT]
  task close ID --expected-record-version N --status done|cancelled|superseded
      --completed-at DATE --repository-changed true|false --evidence TEXT
  export [task-list filters] [--limit N] [--max-bytes N] [--cursor CURSOR]
  pause --expected-record-version N --expected-store-digest DIGEST --reason TEXT --source TEXT
  resume --expected-record-version N
  lock inspect
  lock recover --expected-token TOKEN --confirm-owner-not-live
  migrate format1 --catalog readme/tasks/README.md [--archive PATH]...
      (--dry-run | --apply --expected-source-digest DIGEST)
`;
}

function parseArguments(tokens, definition = {}) {
  const allowed = definition.options ?? {};
  const values = {};
  const positionals = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const spec = allowed[name];
    if (!spec) fail("ARGUMENT_INVALID", "an unsupported option was supplied", 2);
    if (spec === "flag") {
      if (Object.hasOwn(values, name)) fail("ARGUMENT_INVALID", "a non-repeatable option was repeated", 2);
      values[name] = true;
      continue;
    }
    if (index + 1 >= tokens.length || tokens[index + 1].startsWith("--")) {
      fail("ARGUMENT_INVALID", "an option that requires a value was incomplete", 2);
    }
    const value = tokens[++index];
    if (spec === "repeat") {
      (values[name] ??= []).push(value);
    } else {
      if (Object.hasOwn(values, name)) fail("ARGUMENT_INVALID", "a non-repeatable option was repeated", 2);
      values[name] = value;
    }
  }
  const expected = definition.positionals ?? 0;
  if (positionals.length !== expected) fail("ARGUMENT_INVALID", `expected ${expected} positional argument(s)`, 2);
  return { values, positionals };
}

function required(options, name) {
  if (!Object.hasOwn(options, name)) fail("ARGUMENT_INVALID", `required option --${name} is missing`, 2);
  return options[name];
}

function positiveInteger(value, label, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^[1-9]\d*$/u.test(value ?? "")) fail("ARGUMENT_INVALID", `${label} must be a positive integer`, 2);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) fail("ARGUMENT_INVALID", `${label} is outside the supported range`, 2);
  return parsed;
}

function parseBoolean(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  fail("ARGUMENT_INVALID", `${label} must be true or false`, 2);
}

function parseUnknownBoolean(value) {
  if (value === "unknown") return null;
  return parseBoolean(value, "repository-changed");
}

function parseDetails(values = []) {
  return values.map((value) => {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
      fail("ARGUMENT_INVALID", "detail must use LABEL=REPOSITORY_PATH", 2);
    }
    const label = value.slice(0, separator);
    const detailPath = value.slice(separator + 1);
    safeText(label, "detail label", { max: 256 });
    validateDetailPath(detailPath);
    return { label, path: detailPath };
  });
}

function validateStatus(value) {
  if (!STATUSES.includes(value)) fail("ARGUMENT_INVALID", "status is invalid", 2);
  return value;
}

function envelope(loaded, data, {
  filters = {}, total = Array.isArray(data) ? data.length : data === null ? 0 : 1,
  emitted = Array.isArray(data) ? data.length : data === null ? 0 : 1,
  omittedTerminal = 0, truncated = false, nextCursor = null, byteLimit = null,
  enforceByteLimit = true,
} = {}) {
  const result = {
    meta: {
      schemaVersion: 1,
      integrity: "valid",
      storeDigest: loaded.digest,
      filters,
      total,
      emitted,
      omittedTerminal,
      truncated,
      nextCursor,
      byteLimit,
      emittedBytes: 0,
    },
    data,
  };
  let previous = -1;
  while (result.meta.emittedBytes !== previous) {
    previous = result.meta.emittedBytes;
    result.meta.emittedBytes = Buffer.byteLength(outputJson(result));
  }
  if (enforceByteLimit && byteLimit !== null && result.meta.emittedBytes > byteLimit) {
    fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
  }
  return result;
}

function fitPagedEnvelope({
  loaded,
  page,
  truncated,
  kind,
  filters,
  total,
  omittedTerminal = 0,
  maxBytes,
  buildData = (items) => items,
}) {
  const fitted = [...page];
  let fittedTruncated = truncated;
  while (true) {
    const nextCursor = fittedTruncated && fitted.length > 0 ? cursorEncode({
      v: 1,
      kind,
      digest: loaded.digest,
      filters,
      lastId: fitted.at(-1).id,
    }) : null;
    const result = envelope(loaded, buildData(fitted), {
      filters,
      total,
      emitted: fitted.length,
      omittedTerminal,
      truncated: fittedTruncated,
      nextCursor,
      byteLimit: maxBytes,
      enforceByteLimit: false,
    });
    if (result.meta.emittedBytes <= maxBytes) {
      if (fitted.length === 0 && page.length > 0) {
        fail("OUTPUT_LIMIT", "bounded query cannot fit one complete result within max-bytes", 4);
      }
      return result;
    }
    if (fitted.length === 0) {
      fail("OUTPUT_LIMIT", "bounded query metadata cannot fit within max-bytes", 4);
    }
    fitted.pop();
    fittedTruncated = true;
  }
}

function cursorEncode(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function cursorDecode(value, expected) {
  let parsed;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    parsed = JSON.parse(raw);
  } catch {
    fail("CURSOR_INVALID", "continuation cursor is malformed", 2);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "digest,filters,kind,lastId,v" ||
      parsed.v !== 1 || parsed.kind !== expected.kind || parsed.digest !== expected.digest ||
      JSON.stringify(parsed.filters) !== JSON.stringify(expected.filters)) {
    fail(parsed?.digest !== expected.digest ? "CURSOR_STALE" : "CURSOR_INVALID",
      parsed?.digest !== expected.digest ? "continuation cursor belongs to a stale store" : "continuation cursor does not match this query", 4);
  }
  parseTaskId(parsed.lastId);
  return parsed.lastId;
}

function paginate(tasks, loaded, kind, filters, limit, cursor, maxBytes) {
  let start = 0;
  if (cursor) {
    const lastId = cursorDecode(cursor, { kind, digest: loaded.digest, filters });
    const found = tasks.findIndex((task) => task.id === lastId);
    if (found < 0) fail("CURSOR_INVALID", "continuation cursor position is absent", 4);
    start = found + 1;
  }
  const page = [];
  let estimatedBytes = 8192;
  for (const task of tasks.slice(start)) {
    if (page.length >= limit) break;
    const taskBytes = Buffer.byteLength(canonicalJson(task));
    if (estimatedBytes + taskBytes > maxBytes) {
      if (page.length > 0) break;
    }
    page.push(task);
    estimatedBytes += taskBytes;
  }
  const truncated = start + page.length < tasks.length;
  const nextCursor = truncated && page.length > 0 ? cursorEncode({
    v: 1,
    kind,
    digest: loaded.digest,
    filters,
    lastId: page.at(-1).id,
  }) : null;
  return { page, truncated, nextCursor };
}

function commonPageOptions(tokens, extra = {}) {
  return parseArguments(tokens, {
    positionals: extra.positionals ?? 0,
    options: {
      limit: "value",
      "max-bytes": "value",
      cursor: "value",
      ...extra.options,
    },
  });
}

function pageByteLimit(options) {
  return Object.hasOwn(options, "max-bytes") ?
    positiveInteger(options["max-bytes"], "max-bytes", { max: MAX_QUERY_BYTES }) : DEFAULT_QUERY_BYTES;
}

function pageLimit(options, fallback = DEFAULT_LIMIT) {
  return Object.hasOwn(options, "limit") ? positiveInteger(options.limit, "limit", { max: MAX_LIMIT }) : fallback;
}

function nonterminalOmissionMatch(task, filters) {
  if (filters.route && task.route !== filters.route) return false;
  if (filters.risk && task.risk !== filters.risk) return false;
  if (filters.authority && task.authority.reference !== filters.authority) return false;
  if (filters.tags.length > 0 && !filters.tags.every((tag) => task.tags.includes(tag))) return false;
  if (filters.acceptedAfter && !(task.authority.acceptedDate && task.authority.acceptedDate > filters.acceptedAfter)) return false;
  if (filters.acceptedBefore && !(task.authority.acceptedDate && task.authority.acceptedDate < filters.acceptedBefore)) return false;
  if (filters.dependsOn && !task.dependencies.includes(filters.dependsOn)) return false;
  if (filters.repositoryChanged !== undefined && task.completion?.repositoryChanged !== filters.repositoryChanged) return false;
  if (filters.completedAfter && !(task.completion?.completedAt && task.completion.completedAt > filters.completedAfter)) return false;
  if (filters.completedBefore && !(task.completion?.completedAt && task.completion.completedAt < filters.completedBefore)) return false;
  return true;
}

function validateTag(tag) {
  if (typeof tag !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(tag)) {
    fail("ARGUMENT_INVALID", "tag must be a canonical lowercase tag", 2);
  }
  return tag;
}

function listSelection(loaded, options, { forceAll = false } = {}) {
  const statuses = options.status ?? [];
  for (const status of statuses) validateStatus(status);
  if (options.route && !ROUTES.includes(options.route)) fail("ARGUMENT_INVALID", "route filter is invalid", 2);
  if (options.risk && !RISKS.includes(options.risk)) fail("ARGUMENT_INVALID", "risk filter is invalid", 2);
  if (options["depends-on"]) parseTaskId(options["depends-on"]);
  for (const name of ["accepted-after", "accepted-before", "completed-after", "completed-before"]) {
    if (options[name] && !isDate(options[name])) {
      fail("ARGUMENT_INVALID", `${name} must be an ISO calendar date`, 2);
    }
  }
  if (options.authority) safeText(options.authority, "authority filter");
  const tags = options.tag ?? [];
  for (const tag of tags) validateTag(tag);
  if (new Set(tags).size !== tags.length) fail("ARGUMENT_INVALID", "tag filters must be unique", 2);
  const filters = {
    statuses,
    includeTerminal: forceAll || options.all === true || statuses.length > 0,
    route: options.route ?? null,
    risk: options.risk ?? null,
    authority: options.authority ?? null,
    tags,
    acceptedAfter: options["accepted-after"] ?? null,
    acceptedBefore: options["accepted-before"] ?? null,
    dependsOn: options["depends-on"] ?? null,
    repositoryChanged: Object.hasOwn(options, "repository-changed") ? parseUnknownBoolean(options["repository-changed"]) : undefined,
    completedAfter: options["completed-after"] ?? null,
    completedBefore: options["completed-before"] ?? null,
  };
  const allTasks = [...loaded.tasks.values()];
  const matchesOther = allTasks.filter((task) => nonterminalOmissionMatch(task, filters));
  const omittedTerminal = filters.includeTerminal ? 0 : matchesOther.filter((task) => TERMINAL_FILTER.has(task.status)).length;
  const selected = matchesOther.filter((task) => {
    if (statuses.length > 0 && !statuses.includes(task.status)) return false;
    if (!filters.includeTerminal && TERMINAL_FILTER.has(task.status)) return false;
    return true;
  });
  return { selected, filters, omittedTerminal };
}

async function boundedDirectoryNames(directory, limit, label, { missingIsEmpty = false } = {}) {
  const names = [];
  let handle;
  try {
    handle = await fs.opendir(directory);
    for await (const entry of handle) {
      names.push(entry.name);
      if (names.length > limit) fail("STORE_SIZE", `${label} exceeds its entry-count limit`);
    }
  } catch (error) {
    if (missingIsEmpty && error.code === "ENOENT") return [];
    if (error instanceof FrameworkDataError) throw error;
    fail("PATH_UNSAFE", `${label} cannot be read safely`);
  } finally {
    await handle?.close().catch((error) => {
      if (error.code !== "ERR_DIR_CLOSED") throw error;
    });
  }
  return names;
}

async function preflight(context) {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) fail("NODE_UNSUPPORTED", "Node.js 22 or newer is required");
  if (process.platform === "win32") fail("PLATFORM_UNSUPPORTED", "native Windows filesystems are not supported");
  const schemaDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "schemas");
  const expectedHashes = new Map([
    ["control-v1.schema.json", "7774542f5017efbad110380641ad494627a61069daafbd347e682bf7d7b3bb17"],
    ["task-v1.schema.json", "286d1dfc5abfa617cc1125fed430af4fec41565a5e145addb975e147a5a706ad"],
  ]);
  const expected = [...expectedHashes.keys()];
  const schemaDirectoryInfo = await fs.lstat(schemaDirectory).catch(() => fail("SCHEMA_FILES", "shipped schema directory is unavailable"));
  if (!schemaDirectoryInfo.isDirectory() || schemaDirectoryInfo.isSymbolicLink() ||
      await fs.realpath(schemaDirectory) !== schemaDirectory) {
    fail("SCHEMA_FILES", "shipped schema directory is unsafe");
  }
  const actual = (await boundedDirectoryNames(schemaDirectory, 3, "shipped schema inventory")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("SCHEMA_FILES", "shipped JSON schema inventory is incomplete or unexpected");
  for (const name of expected) {
    let schema;
    try {
      const target = path.join(schemaDirectory, name);
      const info = await fs.lstat(target);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size < 2 || info.size > 1_000_000) {
        fail("SCHEMA_FILES", "shipped JSON schema is unsafe");
      }
      const bytes = await fs.readFile(target);
      if (createHash("sha256").update(bytes).digest("hex") !== expectedHashes.get(name)) {
        fail("SCHEMA_FILES", "shipped JSON schema digest does not match the pinned runtime");
      }
      schema = JSON.parse(UTF8.decode(bytes));
    } catch {
      fail("SCHEMA_FILES", "shipped JSON schema is unreadable");
    }
    if (schema.type !== "object" || schema.additionalProperties !== false) fail("SCHEMA_FILES", "shipped JSON schema is not fail-closed");
  }
  const assertSafeDirectoryIfPresent = async (relative, label) => {
    const target = path.join(context.root, ...relative.split("/"));
    const info = await fs.lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      fail("PATH_UNSAFE", `${label} cannot be inspected`);
    });
    if (info === null) return false;
    await assertOrdinaryDirectoryTree(context.root, target, label);
    return true;
  };
  const readmePresent = await assertSafeDirectoryIfPresent("readme", "readme directory");
  if (readmePresent) await assertSafeDirectoryIfPresent("readme/tasks", "task directory");
  const readArtifact = async (relative, expectedHeadings) => {
    const headings = Array.isArray(expectedHeadings) ? expectedHeadings : [expectedHeadings];
    const target = path.join(context.root, ...relative.split("/"));
    let info;
    try {
      info = await fs.lstat(target);
    } catch (error) {
      if (error.code === "ENOENT") return { kind: "absent" };
      return { kind: "collision" };
    }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1_000_000) {
      return { kind: "collision" };
    }
    let bytes;
    try {
      bytes = await fs.readFile(target);
    } catch {
      return { kind: "collision" };
    }
    if (bytes.length !== info.size ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      return { kind: "collision" };
    }
    let text;
    try {
      text = UTF8.decode(bytes);
    } catch {
      return { kind: "collision" };
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(text)) {
      return { kind: "collision" };
    }
    const heading = headings.find((candidate) => text.startsWith(`${candidate}\n`) || text === candidate);
    if (!heading) return { kind: "collision" };
    return { kind: "recognized", text, heading };
  };
  const cursor = await readArtifact("readme/README.md", "# Project State");
  const entrypoint = await readArtifact("readme/tasks/README.md", ["# Task Catalog", "# Task Store"]);
  const taskDirectory = path.join(context.root, "readme", "tasks");
  const taskEntries = await boundedDirectoryNames(taskDirectory, 100_000, "task directory", { missingIsEmpty: true });
  const prepared = taskEntries.some((name) => /^\.framework-data-(?:init|migration)-/u.test(name));
  const storeInfo = await fs.lstat(context.storeRoot).catch((error) => error.code === "ENOENT" ? null : { unsafe: true });
  let disposition;
  let integrity = "not-checked";
  let issue = null;
  if (cursor.kind === "collision" || entrypoint.kind === "collision") {
    disposition = "collision";
    issue = cursor.kind === "collision" ? "unrelated-project-cursor" : "unrelated-task-entrypoint";
  } else if (storeInfo === null) {
    if (prepared) disposition = "prepared";
    else if (entrypoint.kind === "recognized" && entrypoint.heading === "# Task Catalog" && /^- Format: 1$/mu.test(entrypoint.text)) {
      if (cursor.kind !== "recognized") disposition = "partial";
      else {
        try {
          const archiveCell = /^- Archived task rows: (.+)$/mu.exec(entrypoint.text)?.[1];
          if (!archiveCell) fail("FORMAT1_METADATA", "legacy Archived task rows metadata is missing");
          const archives = [];
          if (archiveCell !== "None") {
            for (const match of archiveCell.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/gu)) {
              archives.push(path.posix.normalize(path.posix.join("readme/tasks", match[1])));
              if (archives.length > 63) fail("STORE_SIZE", "legacy archive metadata exceeds the source-count limit");
            }
          }
          await prepareFormat1Migration(context, "readme/tasks/README.md", archives);
          disposition = "legacy_format1";
        } catch (error) {
          if (!(error instanceof FrameworkDataError)) throw error;
          disposition = "malformed";
          integrity = "invalid";
          issue = error.code;
        }
      }
    } else if (cursor.kind === "recognized" && entrypoint.kind === "recognized" &&
        entrypoint.heading === "# Task Store" &&
        entrypoint.text.includes("node readme/meta/framework-data/cli.mjs")) {
      disposition = "ready_to_initialize";
    } else if (entrypoint.kind === "recognized" || cursor.kind === "recognized") disposition = "partial";
    else disposition = "uninitialized";
  } else if (storeInfo.unsafe || !storeInfo.isDirectory() || storeInfo.isSymbolicLink()) {
    disposition = "malformed";
    integrity = "invalid";
    issue = "unsafe-store-root";
  } else {
    try {
      const loaded = await withLock(context, () => loadStore(context));
      integrity = "valid";
      const staticEntrypoint = entrypoint.kind === "recognized" && entrypoint.heading === "# Task Store" &&
        entrypoint.text.includes("node readme/meta/framework-data/cli.mjs");
      if (cursor.kind === "recognized" && staticEntrypoint) disposition = "valid_current_store";
      else {
        disposition = "partial";
        issue = "store-cutover-artifacts-incomplete";
      }
      issue ??= loaded.tasks.size === 0 ? "empty-valid-store" : null;
    } catch (error) {
      if (!(error instanceof FrameworkDataError)) throw error;
      disposition = error.code === "LOCK_BUSY" ? "busy" : "malformed";
      integrity = "invalid";
      issue = error.code;
    }
  }
  return {
    compatible: true,
    cliVersion: CLI_VERSION,
    nodeMajor: major,
    platform: process.platform,
    gitWorktree: true,
    repositoryRoot: ".",
    disposition,
    integrity,
    issue,
  };
}

async function doctorCommand(context, { staged = false } = {}) {
  try {
    return await withLock(context, async () => {
      const loaded = await loadStore(context);
      const framework = await runFrameworkChecks({ root: context.root, tasks: loaded.tasks, staged });
      if (!framework.ok) process.exitCode = 1;
      return {
        ok: framework.ok,
        schemaVersion: 1,
        integrity: "valid",
        storeDigest: loaded.digest,
        taskCount: loaded.tasks.size,
        activeTaskId: activeTask(loaded.tasks)?.id ?? null,
        paused: loaded.control.pause !== null,
        errors: framework.errors,
        warnings: framework.warnings,
        checks: framework.checks,
      };
    });
  } catch (error) {
    if (!(error instanceof FrameworkDataError)) throw error;
    process.exitCode = error.exitCode;
    return {
      ok: false,
      schemaVersion: 1,
      integrity: "invalid",
      error: { code: error.code, message: error.message },
    };
  }
}

async function startupCommand(context, tokens) {
  const { values } = commonPageOptions(tokens);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const limit = pageLimit(values);
    const maxBytes = pageByteLimit(values);
    const primary = activeTask(loaded.tasks);
    const summarize = (task) => ({
      id: task.id,
      recordVersion: task.recordVersion,
      taskRevision: task.taskRevision,
      outcome: task.outcome,
      status: task.status,
      nextSafeAction: task.nextSafeAction,
    });
    const tasks = [...loaded.tasks.values()]
      .filter((task) => !TERMINAL_FILTER.has(task.status) && task.id !== primary?.id)
      .map(summarize);
    const filters = { terminal: "excluded", primary: "separate-summary", sort: "numeric-id" };
    const { page, truncated } = paginate(tasks, loaded, "startup", filters, limit, values.cursor, maxBytes);
    const counts = {};
    for (const status of STATUSES) counts[status] = [...loaded.tasks.values()].filter((task) => task.status === status).length;
    return fitPagedEnvelope({
      loaded,
      page,
      truncated,
      kind: "startup",
      filters,
      total: tasks.length,
      omittedTerminal: [...loaded.tasks.values()].filter((task) => TERMINAL_FILTER.has(task.status)).length,
      maxBytes,
      buildData: (items) => ({
        paused: loaded.control.pause !== null,
        pause: loaded.control.pause,
        primaryTask: primary === null ? null : summarize(primary),
        counts,
        tasks: items,
      }),
    });
  });
}

async function taskGetCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: { "max-bytes": "value" } });
  const id = positionals[0];
  parseTaskId(id);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const task = loaded.tasks.get(id);
    if (!task) fail("TASK_NOT_FOUND", "task does not exist", 4);
    return envelope(loaded, task, {
      filters: { id, terminal: "included" },
      byteLimit: pageByteLimit(values),
    });
  });
}

const LIST_OPTIONS = {
  status: "repeat",
  all: "flag",
  route: "value",
  risk: "value",
  authority: "value",
  tag: "repeat",
  "accepted-after": "value",
  "accepted-before": "value",
  "depends-on": "value",
  "repository-changed": "value",
  "completed-after": "value",
  "completed-before": "value",
};

async function taskListCommand(context, tokens, { forceAll = false, candidates = false, kind = "task-list" } = {}) {
  const { values } = commonPageOptions(tokens, { options: LIST_OPTIONS });
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const limit = pageLimit(values, forceAll ? MAX_LIMIT : DEFAULT_LIMIT);
    const maxBytes = pageByteLimit(values);
    let { selected, filters, omittedTerminal } = listSelection(loaded, values, { forceAll });
    if (candidates) {
      selected = selected.filter((task) => taskIsCandidate(task, loaded));
      filters = { ...filters, mechanicallyEligible: true };
    }
    const { page, truncated } = paginate(selected, loaded, kind, filters, limit, values.cursor, maxBytes);
    return fitPagedEnvelope({
      loaded,
      page,
      truncated,
      kind,
      filters,
      total: selected.length,
      omittedTerminal,
      maxBytes,
    });
  });
}

function dependencyClosure(loaded, id, direction) {
  const found = new Set();
  const reverse = new Map([...loaded.tasks.keys()].map((taskId) => [taskId, []]));
  if (direction !== "ancestors") {
    for (const task of loaded.tasks.values()) {
      for (const dependency of task.dependencies) reverse.get(dependency).push(task.id);
    }
  }
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop();
    const neighbors = direction === "ancestors" ? loaded.tasks.get(current).dependencies : reverse.get(current);
    for (const neighbor of neighbors) {
      if (found.has(neighbor)) continue;
      found.add(neighbor);
      pending.push(neighbor);
    }
  }
  return [...found].sort(compareTaskIds).map((taskId) => loaded.tasks.get(taskId));
}

async function taskDepsCommand(context, tokens) {
  const { values, positionals } = commonPageOptions(tokens, {
    positionals: 1,
    options: { direction: "value" },
  });
  const id = positionals[0];
  parseTaskId(id);
  const direction = values.direction ?? "both";
  if (!["ancestors", "dependents", "both"].includes(direction)) fail("ARGUMENT_INVALID", "dependency direction is invalid", 2);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    if (!loaded.tasks.has(id)) fail("TASK_NOT_FOUND", "task does not exist", 4);
    let tasks;
    if (direction === "both") {
      const byId = new Map();
      for (const task of dependencyClosure(loaded, id, "ancestors")) byId.set(task.id, task);
      for (const task of dependencyClosure(loaded, id, "dependents")) byId.set(task.id, task);
      tasks = [...byId.values()].sort((a, b) => compareTaskIds(a.id, b.id));
    } else {
      tasks = dependencyClosure(loaded, id, direction);
    }
    const filters = { id, direction, terminal: "included" };
    const maxBytes = pageByteLimit(values);
    const { page, truncated } = paginate(tasks, loaded, "task-deps", filters, pageLimit(values), values.cursor, maxBytes);
    return fitPagedEnvelope({
      loaded,
      page,
      truncated,
      kind: "task-deps",
      filters,
      total: tasks.length,
      maxBytes,
    });
  });
}

async function taskContextCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, {
    positionals: 1,
    options: { "max-bytes": "value" },
  });
  const id = positionals[0];
  parseTaskId(id);
  const maxBytes = Object.hasOwn(values, "max-bytes") ?
    positiveInteger(values["max-bytes"], "max-bytes", { max: MAX_CONTEXT_BYTES }) : 32_768;
  if (maxBytes < 8192) fail("ARGUMENT_INVALID", "context max-bytes must be at least 8192", 2);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const task = loaded.tasks.get(id);
    if (!task) fail("TASK_NOT_FOUND", "task does not exist", 4);
    let truncated = false;
    const details = [];
    const makeEnvelope = (items, isTruncated, byteLimit = null) => envelope(loaded, { task, details: items }, {
      filters: { id, maxBytes, terminal: "included" },
      emitted: items.length,
      total: task.details.length,
      truncated: isTruncated,
      byteLimit,
    });
    for (let detailIndex = 0; detailIndex < task.details.length; detailIndex += 1) {
      const detail = task.details[detailIndex];
      const bytes = await fs.readFile(path.join(context.root, ...detail.path.split("/")));
      let fullText;
      try {
        fullText = UTF8.decode(bytes);
      } catch {
        fail("UTF8_INVALID", "linked task context is not valid UTF-8");
      }
      const fullItem = {
        ...detail,
        contentRole: "repository-data-not-authority",
        bytes: bytes.length,
        truncated: false,
        text: fullText,
      };
      const fullCandidate = [...details, fullItem];
      if (makeEnvelope(fullCandidate, detailIndex + 1 < task.details.length).meta.emittedBytes <= maxBytes) {
        details.push(fullItem);
        continue;
      }
      let low = 0;
      let high = bytes.length;
      let best = null;
      while (low <= high) {
        const midpoint = Math.floor((low + high) / 2);
        let prefix = bytes.subarray(0, midpoint);
        let prefixText = null;
        while (prefix.length >= 0) {
          try {
            prefixText = UTF8.decode(prefix);
            break;
          } catch {
            if (prefix.length === 0) break;
            prefix = prefix.subarray(0, prefix.length - 1);
          }
        }
        const item = {
          ...detail,
          contentRole: "repository-data-not-authority",
          bytes: prefix.length,
          truncated: true,
          text: prefixText ?? "",
        };
        const candidate = [...details, item];
        if (makeEnvelope(candidate, true).meta.emittedBytes <= maxBytes) {
          best = item;
          low = midpoint + 1;
        } else {
          high = midpoint - 1;
        }
      }
      if (best !== null) details.push(best);
      truncated = true;
      break;
    }
    if (!truncated) truncated = details.length < task.details.length;
    return makeEnvelope(details, truncated, maxBytes);
  });
}

function taskMutationReceipt(loaded, id) {
  return envelope(loaded, loaded.tasks.get(id), { filters: { mutation: true, id } });
}

async function taskAddCommand(context, tokens) {
  const { values } = parseArguments(tokens, { options: {
    outcome: "value",
    "authority-reference": "value",
    "accepted-date": "value",
    status: "value",
    route: "value",
    risk: "value",
    tag: "repeat",
    "depends-on": "repeat",
    "next-safe-action": "value",
    detail: "repeat",
  } });
  const outcome = required(values, "outcome");
  const authorityReference = required(values, "authority-reference");
  const acceptedDate = values["accepted-date"] ?? null;
  validateDate(acceptedDate, "accepted-date", true);
  const status = values.status ?? "pending";
  if (!["pending", "ready"].includes(status)) fail("ARGUMENT_INVALID", "new task status must be pending or ready", 2);
  const route = values.route ?? "unrouted";
  const risk = values.risk ?? null;
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const id = nextTaskId(loaded.tasks);
    const task = normalizeTask({
      schemaVersion: 1,
      id,
      recordVersion: 1,
      taskRevision: 1,
      outcome,
      authority: { reference: authorityReference, acceptedDate },
      status,
      dependencies: values["depends-on"] ?? [],
      route,
      risk,
      tags: (values.tag ?? []).map(validateTag),
      gate: { kind: "none" },
      nextSafeAction: values["next-safe-action"] ?? null,
      details: parseDetails(values.detail),
      completion: null,
    });
    const next = await addTask(context, loaded, task);
    return taskMutationReceipt(next, id);
  });
}

function mutableTask(loaded, id, expected) {
  const task = loaded.tasks.get(id);
  if (!task) fail("TASK_NOT_FOUND", "task does not exist", 4);
  if (TERMINAL_FILTER.has(task.status)) fail("TRANSITION_INVALID", "terminal task cannot use this mutation", 4);
  if (task.recordVersion !== expected) fail("STALE_RECORD", "task recordVersion is stale", 4);
  return task;
}

async function taskAmendCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    outcome: "value",
    "authority-reference": "value",
    "accepted-date": "value",
    "next-safe-action": "value",
    route: "value",
    risk: "value",
    tag: "repeat",
    detail: "repeat",
  } });
  const id = positionals[0];
  parseTaskId(id);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const outcome = required(values, "outcome");
  const authorityReference = required(values, "authority-reference");
  const acceptedDate = values["accepted-date"] ?? null;
  validateDate(acceptedDate, "accepted-date", true);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    mutableTask(loaded, id, expected);
    if (Object.hasOwn(values, "route") !== Object.hasOwn(values, "risk")) {
      fail("ARGUMENT_INVALID", "an amendment must provide route and risk together", 2);
    }
    const route = values.route ?? "unrouted";
    const risk = Object.hasOwn(values, "risk") ? values.risk : null;
    if (!ROUTES.includes(route) || (risk !== null && !RISKS.includes(risk))) {
      fail("ARGUMENT_INVALID", "amended route or risk is invalid", 2);
    }
    const next = await mutateTask(context, loaded, id, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      taskRevision: task.taskRevision + 1,
      outcome,
      authority: { reference: authorityReference, acceptedDate },
      route,
      risk,
      tags: Object.hasOwn(values, "tag") ? values.tag.map(validateTag) : task.tags,
      status: "pending",
      gate: { kind: "none" },
      nextSafeAction: values["next-safe-action"] ?? task.nextSafeAction,
      details: Object.hasOwn(values, "detail") ? parseDetails(values.detail) : task.details,
      completion: null,
    }));
    return taskMutationReceipt(next, id);
  });
}

async function taskDependenciesCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    "expected-store-digest": "value",
    "depends-on": "repeat",
  } });
  const id = positionals[0];
  parseTaskId(id);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const expectedDigest = required(values, "expected-store-digest");
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const current = mutableTask(loaded, id, expected);
    assertExpectedDigest(loaded, expectedDigest);
    if (current.status === "active") fail("TRANSITION_INVALID", "Active task dependencies cannot be changed", 4);
    if (current.gate.kind === "approval") {
      fail("TRANSITION_INVALID", "dependency changes require a separate semantic amendment before approval", 4);
    }
    const next = await mutateTask(context, loaded, id, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      taskRevision: task.taskRevision + 1,
      dependencies: values["depends-on"] ?? [],
      status: "pending",
      gate: { kind: "none" },
      completion: null,
    }), { expectedDigest });
    return taskMutationReceipt(next, id);
  });
}

async function taskApprovalCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    id: "value",
    status: "value",
    source: "value",
    action: "value",
    boundary: "value",
    "detail-path": "value",
    summary: "value",
  } });
  const taskId = positionals[0];
  parseTaskId(taskId);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const approvalStatus = required(values, "status");
  if (!["pending", "granted", "denied", "expired"].includes(approvalStatus)) fail("ARGUMENT_INVALID", "approval status is invalid", 2);
  const detailPath = required(values, "detail-path");
  validateDetailPath(detailPath, "approval detail path");
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const current = mutableTask(loaded, taskId, expected);
    if (current.status === "blocked" || current.status === "active") fail("TRANSITION_INVALID", "approval cannot be recorded in the current task status", 4);
    const requestedScope = {
      id: required(values, "id"),
      source: required(values, "source"),
      action: required(values, "action"),
      boundary: required(values, "boundary"),
      detailPath,
    };
    if (current.gate.kind === "approval" && [
      "id", "source", "action", "boundary", "detailPath",
    ].some((field) => current.gate[field] !== requestedScope[field])) {
      fail("TRANSITION_INVALID", "approval identity or boundary changes require a semantic task amendment", 4);
    }
    const next = await mutateTask(context, loaded, taskId, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      status: approvalStatus === "granted" ? task.status : "pending",
      gate: {
        kind: "approval",
        summary: values.summary ?? null,
        id: requestedScope.id,
        status: approvalStatus,
        boundTaskRevision: task.taskRevision,
        source: requestedScope.source,
        action: requestedScope.action,
        boundary: requestedScope.boundary,
        detailPath: requestedScope.detailPath,
      },
    }));
    return taskMutationReceipt(next, taskId);
  });
}

async function taskSelectCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    "expected-store-digest": "value",
    "next-safe-action": "value",
  } });
  const id = positionals[0];
  parseTaskId(id);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const expectedDigest = required(values, "expected-store-digest");
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    mutableTask(loaded, id, expected);
    assertExpectedDigest(loaded, expectedDigest);
    if (!taskIsCandidate(loaded.tasks.get(id), loaded)) fail("TRANSITION_INVALID", "task is not mechanically eligible for selection", 4);
    if (activeTask(loaded.tasks) !== null) fail("STATE_INVALID", "another task is already Active", 4);
    const next = await mutateTask(context, loaded, id, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      status: "active",
      nextSafeAction: values["next-safe-action"] ?? task.nextSafeAction,
    }), { expectedDigest });
    return taskMutationReceipt(next, id);
  });
}

async function taskCheckpointCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    status: "value",
    "next-safe-action": "value",
    blocker: "value",
  } });
  const id = positionals[0];
  parseTaskId(id);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const status = required(values, "status");
  if (!["pending", "ready", "parked", "blocked", "needs_verification"].includes(status)) {
    fail("ARGUMENT_INVALID", "checkpoint status is not a supported nonterminal state", 2);
  }
  if (status === "blocked" && !values.blocker) fail("ARGUMENT_INVALID", "blocked checkpoint requires --blocker", 2);
  if (status !== "blocked" && values.blocker) fail("ARGUMENT_INVALID", "--blocker requires blocked status", 2);
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const current = mutableTask(loaded, id, expected);
    if (status === "needs_verification" && !["active", "needs_verification"].includes(current.status)) {
      fail("TRANSITION_INVALID", "Needs verification requires an Active task", 4);
    }
    if (status === "blocked" && current.gate.kind === "approval") {
      fail("TRANSITION_INVALID", "a checkpoint cannot replace approval evidence with a blocker", 4);
    }
    if (status === "ready" && current.gate.kind === "approval" && current.gate.status !== "granted") {
      fail("TRANSITION_INVALID", "Ready requires no unresolved approval", 4);
    }
    const next = await mutateTask(context, loaded, id, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      status,
      gate: status === "blocked" ? { kind: "blocker", summary: values.blocker } :
        task.gate.kind === "blocker" ? { kind: "none" } : task.gate,
      nextSafeAction: values["next-safe-action"] ?? task.nextSafeAction,
    }));
    return taskMutationReceipt(next, id);
  });
}

async function taskCloseCommand(context, tokens) {
  const { values, positionals } = parseArguments(tokens, { positionals: 1, options: {
    "expected-record-version": "value",
    status: "value",
    "completed-at": "value",
    "repository-changed": "value",
    evidence: "value",
  } });
  const id = positionals[0];
  parseTaskId(id);
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  const status = required(values, "status");
  if (!["done", "cancelled", "superseded"].includes(status)) fail("ARGUMENT_INVALID", "close status must be terminal", 2);
  const completedAt = required(values, "completed-at");
  validateDate(completedAt, "completed-at");
  const repositoryChanged = parseBoolean(required(values, "repository-changed"), "repository-changed");
  const evidence = required(values, "evidence");
  safeText(evidence, "completion evidence", { max: 8192 });
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    const current = mutableTask(loaded, id, expected);
    if (status === "done" && !["active", "needs_verification"].includes(current.status)) {
      fail("TRANSITION_INVALID", "Done requires Active or Needs verification state", 4);
    }
    if (status === "done" && current.gate.kind === "approval" && current.gate.status !== "granted") {
      fail("TRANSITION_INVALID", "Done requires complete granted approval evidence", 4);
    }
    const next = await mutateTask(context, loaded, id, expected, (task) => ({
      ...task,
      recordVersion: task.recordVersion + 1,
      status,
      gate: status !== "done" || (task.gate.kind === "approval" && task.gate.status === "granted") ?
        task.gate : { kind: "none" },
      nextSafeAction: null,
      completion: { completedAt, repositoryChanged, evidence },
    }));
    return taskMutationReceipt(next, id);
  });
}

async function pauseCommand(context, tokens, resume = false) {
  const { values } = parseArguments(tokens, { options: resume ? {
    "expected-record-version": "value",
  } : {
    "expected-record-version": "value",
    "expected-store-digest": "value",
    reason: "value",
    source: "value",
  } });
  const expected = positiveInteger(required(values, "expected-record-version"), "expected-record-version");
  return withLock(context, async () => {
    const loaded = await loadStore(context);
    if (resume) {
      if (loaded.control.pause === null) fail("TRANSITION_INVALID", "scheduling is not paused", 4);
    } else {
      if (loaded.control.pause !== null) fail("TRANSITION_INVALID", "scheduling is already paused", 4);
      assertExpectedDigest(loaded, required(values, "expected-store-digest"));
      if (activeTask(loaded.tasks) !== null) fail("TRANSITION_INVALID", "checkpoint the Active task before pausing", 4);
    }
    const next = await mutateControl(context, loaded, expected, (control) => ({
      ...control,
      recordVersion: control.recordVersion + 1,
      pause: resume ? null : { reason: required(values, "reason"), source: required(values, "source") },
    }), { expectedDigest: resume ? null : values["expected-store-digest"] });
    return envelope(next, next.control, { filters: { mutation: true, control: "pause" } });
  });
}

async function migrateCommand(context, tokens) {
  const { values } = parseArguments(tokens, { options: {
    catalog: "value",
    archive: "repeat",
    "dry-run": "flag",
    apply: "flag",
    "expected-source-digest": "value",
  } });
  if ((values["dry-run"] === true) === (values.apply === true)) {
    fail("ARGUMENT_INVALID", "choose exactly one of --dry-run or --apply", 2);
  }
  const catalog = required(values, "catalog");
  const archives = values.archive ?? [];
  if (values["dry-run"]) {
    const prepared = await prepareFormat1Migration(context, catalog, archives);
    return {
      ok: true,
      mode: "dry-run",
      activation: "not-claimed",
      sourceDigest: prepared.sourceDigest,
      report: prepared.report,
    };
  }
  const expected = required(values, "expected-source-digest");
  return withLock(context, async () => {
    const prepared = await prepareFormat1Migration(context, catalog, archives);
    const { loaded, report } = await applyFormat1Migration(context, prepared, expected, catalog, archives);
    return {
      ok: true,
      mode: "apply",
      activation: "claimed-by-atomic-absent-directory-rename",
      sourceDigest: prepared.sourceDigest,
      storeDigest: loaded.digest,
      report,
    };
  });
}

async function lockCommand(context, tokens) {
  const [subcommand, ...rest] = tokens;
  if (subcommand === "inspect") {
    parseArguments(rest);
    return { ok: true, lock: await inspectLock(context) };
  }
  if (subcommand === "recover") {
    const { values } = parseArguments(rest, { options: {
      "expected-token": "value",
      "confirm-owner-not-live": "flag",
    } });
    const recovered = await recoverLock(context, required(values, "expected-token"), {
      confirmOwnerNotLive: values["confirm-owner-not-live"] === true,
    });
    return { ok: true, recovered };
  }
  fail("ARGUMENT_INVALID", "lock requires inspect or recover", 2);
}

async function dispatch(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: usage() };
  if (argv[0] === "--version") {
    if (argv.length !== 1) fail("ARGUMENT_INVALID", "--version accepts no arguments", 2);
    return { version: CLI_VERSION };
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) fail("NODE_UNSUPPORTED", "Node.js 22 or newer is required");
  if (process.platform === "win32") fail("PLATFORM_UNSUPPORTED", "native Windows filesystems are not supported");
  const context = await repositoryContext();
  const [command, ...rest] = argv;
  if (command === "preflight") {
    parseArguments(rest);
    return preflight(context);
  }
  if (command === "init") {
    parseArguments(rest);
    return withLock(context, async () => {
      const readiness = await preflight(context);
      if (readiness.disposition !== "ready_to_initialize") {
        fail("INITIALIZATION_UNSAFE", "init requires recognized static project and task-store entrypoints", 4);
      }
      const loaded = await initializeStore(context);
      return envelope(loaded, loaded.control, { filters: { mutation: true, initialized: true } });
    });
  }
  if (command === "doctor") {
    const { values } = parseArguments(rest, { options: { staged: "flag" } });
    return doctorCommand(context, { staged: values.staged === true });
  }
  if (command === "startup") return startupCommand(context, rest);
  if (command === "export") return taskListCommand(context, rest, { forceAll: true, kind: "export" });
  if (command === "pause") return pauseCommand(context, rest, false);
  if (command === "resume") return pauseCommand(context, rest, true);
  if (command === "lock") return lockCommand(context, rest);
  if (command === "migrate") {
    if (rest[0] !== "format1") fail("ARGUMENT_INVALID", "migrate requires format1", 2);
    return migrateCommand(context, rest.slice(1));
  }
  if (command !== "task" || rest.length === 0) fail("ARGUMENT_INVALID", "unknown command", 2);
  const [subcommand, ...tokens] = rest;
  if (subcommand === "get") return taskGetCommand(context, tokens);
  if (subcommand === "list") return taskListCommand(context, tokens);
  if (subcommand === "candidates") return taskListCommand(context, tokens, { candidates: true, kind: "task-candidates" });
  if (subcommand === "deps") return taskDepsCommand(context, tokens);
  if (subcommand === "context") return taskContextCommand(context, tokens);
  if (subcommand === "add") return taskAddCommand(context, tokens);
  if (subcommand === "amend") return taskAmendCommand(context, tokens);
  if (subcommand === "set-dependencies") return taskDependenciesCommand(context, tokens);
  if (subcommand === "record-approval") return taskApprovalCommand(context, tokens);
  if (subcommand === "select") return taskSelectCommand(context, tokens);
  if (subcommand === "checkpoint") return taskCheckpointCommand(context, tokens);
  if (subcommand === "close") return taskCloseCommand(context, tokens);
  fail("ARGUMENT_INVALID", "unknown task command", 2);
}

async function main() {
  try {
    const result = await dispatch(process.argv.slice(2));
    if (result?.help) process.stdout.write(result.help);
    else writeJson(result);
  } catch (error) {
    if (error instanceof FrameworkDataError) {
      process.stderr.write(`framework-data: ${error.code}: ${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    process.stderr.write("framework-data: INTERNAL_ERROR: unexpected failure\n");
    process.exitCode = 1;
  }
}

await main();
