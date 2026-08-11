import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
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
  formatTaskId,
  normalizeControl,
  normalizeTask,
  parseTaskId,
  safeText,
  shardForTaskId,
  validateControl,
  validateDetailPath,
  validateTask,
} from "./schema.mjs";
import { gitSubprocessEnvironment } from "../../../lib/git-environment.mjs";

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const STORE_RELATIVE = "readme/tasks/store";
const ALLOWED_DETAIL_ROOTS = [
  "readme/tasks/",
  "readme/decisions/",
  "readme/quality/",
  "readme/threat-models/",
  "readme/incidents/",
];
const REPOSITORY_CONTEXTS = new WeakSet();

function gitOutput(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      env: gitSubprocessEnvironment(),
    }).trim();
  } catch {
    fail("GIT_REQUIRED", "a usable Git worktree is required");
  }
}

export async function repositoryContext(cwd = process.cwd()) {
  const rootReported = gitOutput(["rev-parse", "--show-toplevel"], cwd);
  const root = await fs.realpath(rootReported);
  await assertOrdinaryDirectoryTree(root, root, "Git worktree", { allowRoot: true });
  const caller = await fs.realpath(cwd).catch(() => fail("GIT_REQUIRED", "caller working directory is unavailable"));
  const callerRelative = path.relative(root, caller);
  if (callerRelative.startsWith("..") || path.isAbsolute(callerRelative)) {
    fail("GIT_REQUIRED", "Git top level does not contain the caller working directory");
  }
  await assertOrdinaryDirectoryTree(root, caller, "caller working directory", { allowRoot: true });
  const commonReported = gitOutput(["rev-parse", "--git-common-dir"], root);
  const commonCandidate = path.isAbsolute(commonReported) ? commonReported : path.resolve(root, commonReported);
  const commonDir = await fs.realpath(commonCandidate).catch(() => fail("GIT_REQUIRED", "Git common directory is unavailable"));
  await assertOrdinaryDirectoryTree(commonDir, commonDir, "Git common directory", { allowRoot: true });
  const storeRoot = path.join(root, ...STORE_RELATIVE.split("/"));
  const context = Object.freeze({ root, commonDir, storeRoot });
  REPOSITORY_CONTEXTS.add(context);
  return context;
}

export function assertRepositoryContext(context) {
  if ((typeof context !== "object" && typeof context !== "function") || context === null ||
      !REPOSITORY_CONTEXTS.has(context)) {
    fail("PATH_UNSAFE", "a validated repository context is required");
  }
  return context;
}

function assertInside(root, target, label, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  if ((!allowRoot && relative === "") || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("PATH_UNSAFE", `${label} escapes its owning directory`);
  }
}

export async function assertOrdinaryDirectoryTree(root, target, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  assertInside(resolvedRoot, resolvedTarget, label, { allowRoot });
  const relative = path.relative(resolvedRoot, resolvedTarget);
  const rootInfo = await fs.lstat(resolvedRoot).catch(() => fail("PATH_UNSAFE", `${label} root cannot be inspected`));
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail("PATH_UNSAFE", `${label} root must be an ordinary directory`);
  }
  let current = resolvedRoot;
  for (const part of relative === "" ? [] : relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await fs.lstat(current).catch((error) => {
      if (error.code === "ENOENT") fail("STORE_MISSING", `${label} is missing`);
      fail("PATH_UNSAFE", `${label} cannot be inspected`);
    });
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("PATH_UNSAFE", `${label} contains a non-directory or symbolic-link component`);
    }
  }
  const real = await fs.realpath(resolvedTarget).catch(() => fail("PATH_UNSAFE", `${label} cannot be resolved`));
  assertInside(resolvedRoot, real, label, { allowRoot });
  if (real !== resolvedTarget) fail("PATH_UNSAFE", `${label} does not resolve to its lexical location`);
}

async function lstatRegular(file, label, { maxBytes = MAX_RECORD_BYTES } = {}) {
  const info = await fs.lstat(file).catch((error) => {
    if (error.code === "ENOENT") fail("STORE_MISSING", `${label} is missing`);
    fail("PATH_UNSAFE", `${label} cannot be inspected`);
  });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    fail("PATH_UNSAFE", `${label} must be one ordinary non-hard-linked file`);
  }
  if (info.size < 2 || info.size > maxBytes) fail("RECORD_SIZE", `${label} has an invalid byte size`);
  return info;
}

async function lstatRegularWithin(root, file, label, options = {}) {
  await assertOrdinaryDirectoryTree(root, path.dirname(file), `${label} parent`, { allowRoot: true });
  const info = await lstatRegular(file, label, options);
  const real = await fs.realpath(file).catch(() => fail("PATH_UNSAFE", `${label} cannot be resolved`));
  assertInside(root, real, label);
  if (real !== path.resolve(file)) fail("PATH_UNSAFE", `${label} does not resolve to its lexical location`);
  return info;
}

async function lstatDirectory(directory, label) {
  const info = await fs.lstat(directory).catch((error) => {
    if (error.code === "ENOENT") fail("STORE_MISSING", `${label} is missing`);
    fail("PATH_UNSAFE", `${label} cannot be inspected`);
  });
  if (!info.isDirectory() || info.isSymbolicLink()) fail("PATH_UNSAFE", `${label} must be an ordinary directory`);
  return info;
}

async function boundedDirectoryEntries(directory, limit, label) {
  const entries = [];
  let handle;
  try {
    handle = await fs.opendir(directory);
    for await (const entry of handle) {
      entries.push(entry);
      if (entries.length > limit) fail("STORE_SIZE", `${label} exceeds its entry-count limit`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "FrameworkDataError") throw error;
    fail("PATH_UNSAFE", `${label} cannot be read safely`);
  } finally {
    await handle?.close().catch((error) => {
      if (error.code !== "ERR_DIR_CLOSED") throw error;
    });
  }
  return entries;
}

async function readUtf8File(file, label, options = {}) {
  if (options.root) await lstatRegularWithin(options.root, file, label, options);
  else await lstatRegular(file, label, options);
  const bytes = await fs.readFile(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("UTF8_INVALID", `${label} must not contain a UTF-8 byte-order mark`);
  }
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    fail("UTF8_INVALID", `${label} is not valid UTF-8`);
  }
  return { bytes, text };
}

function parseCanonical(text, label, normalize) {
  if (/^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/mu.test(text)) {
    fail("GIT_CONFLICT", `${label} contains a merge-conflict marker`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("JSON_INVALID", `${label} is not valid JSON`);
  }
  const normalized = normalize(parsed);
  if (canonicalJson(normalized) !== text) {
    fail("JSON_NONCANONICAL", `${label} is not canonical JSON`);
  }
  return normalized;
}

export function compareTaskIds(left, right) {
  return parseTaskId(left) - parseTaskId(right);
}

function highestTaskNumber(tasks) {
  let highest = 0;
  for (const id of tasks.keys()) highest = Math.max(highest, parseTaskId(id));
  return highest;
}

export function taskRecordRelativePath(id) {
  return `records/${shardForTaskId(id)}/${id}.json`;
}

export function taskRecordPath(storeRoot, id) {
  return path.join(storeRoot, ...taskRecordRelativePath(id).split("/"));
}

function detectCycle(tasks) {
  const state = new Map();
  for (const start of tasks.keys()) {
    if (state.get(start) === 2) continue;
    state.set(start, 1);
    const stack = [{ id: start, index: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      const dependencies = tasks.get(frame.id).dependencies;
      if (frame.index >= dependencies.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const dependency = dependencies[frame.index];
      frame.index += 1;
      const dependencyState = state.get(dependency) ?? 0;
      if (dependencyState === 1) fail("DEPENDENCY_CYCLE", "task dependency graph contains a cycle");
      if (dependencyState === 2) continue;
      state.set(dependency, 1);
      stack.push({ id: dependency, index: 0 });
    }
  }
}

export function buildDependencyIndexes(tasks) {
  const ancestors = new Map();
  const dependents = new Map([...tasks.keys()].map((id) => [id, []]));
  for (const [id, task] of tasks) {
    ancestors.set(id, task.dependencies);
    for (const dependency of task.dependencies) dependents.get(dependency)?.push(id);
  }
  return { ancestors, dependents };
}

export function validateState(control, tasks) {
  validateControl(control);
  if (!(tasks instanceof Map) || tasks.size > MAX_RECORDS) fail("STORE_SIZE", "task store exceeds its supported record count");
  let activeCount = 0;
  let dependencyCount = 0;
  for (const [id, task] of tasks) {
    validateTask(task);
    if (id !== task.id) fail("TASK_ID_MISMATCH", "task map key differs from record ID");
    if (task.status === "active") activeCount += 1;
    dependencyCount += task.dependencies.length;
    if (dependencyCount > MAX_TOTAL_DEPENDENCIES) {
      fail("STORE_SIZE", "task store exceeds its supported dependency count");
    }
    for (const dependency of task.dependencies) {
      if (!tasks.has(dependency)) fail("DEPENDENCY_MISSING", "task dependency does not exist");
      if ((task.status === "ready" || task.status === "active") && tasks.get(dependency).status !== "done") {
        fail("STATE_INVALID", "Ready and Active tasks require every dependency to be Done");
      }
    }
  }
  if (activeCount > 1) fail("STATE_INVALID", "more than one task is Active");
  if (control.pause !== null && activeCount !== 0) fail("STATE_INVALID", "paused scheduling cannot retain an Active task");
  detectCycle(tasks);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function semanticProjection(task) {
  return {
    outcome: task.outcome,
    authority: task.authority,
    dependencies: task.dependencies,
    route: task.route,
    risk: task.risk,
    tags: task.tags,
    details: task.details,
  };
}

function unresolvedApproval(gate) {
  return gate.kind === "approval" && gate.status !== "granted";
}

function approvalScope(gate) {
  if (gate.kind !== "approval") return null;
  return {
    id: gate.id,
    source: gate.source,
    action: gate.action,
    boundary: gate.boundary,
    detailPath: gate.detailPath,
  };
}

function validateTaskTransition(current, next) {
  if (next.taskRevision !== current.taskRevision && next.taskRevision !== current.taskRevision + 1) {
    fail("TRANSITION_INVALID", "taskRevision must remain unchanged or increment exactly once");
  }
  const semanticChanged = !equalJson(semanticProjection(current), semanticProjection(next));
  if (semanticChanged && next.taskRevision !== current.taskRevision + 1) {
    fail("TRANSITION_INVALID", "semantic task changes must increment taskRevision once");
  }
  if (!semanticChanged && next.taskRevision !== current.taskRevision) {
    fail("TRANSITION_INVALID", "taskRevision cannot change without a semantic task change");
  }
  if (next.taskRevision === current.taskRevision + 1 &&
      (next.status !== "pending" || next.gate.kind !== "none" || next.completion !== null)) {
    fail("TRANSITION_INVALID", "semantic amendments must reset the task to Pending with no gate or completion");
  }
  if (!equalJson(current.dependencies, next.dependencies) && current.status === "active") {
    fail("TRANSITION_INVALID", "dependencies cannot be changed while a task is Active");
  }
  if (next.status === "needs_verification" &&
      current.status !== "active" && current.status !== "needs_verification") {
    fail("TRANSITION_INVALID", "Needs verification can only be entered from Active");
  }
  if (current.gate.kind === "approval" && next.taskRevision === current.taskRevision &&
      next.gate.kind !== "approval") {
    fail("TRANSITION_INVALID", "checkpointing or closing cannot erase approval evidence");
  }
  if (current.gate.kind === "approval" && next.gate.kind === "approval" &&
      next.taskRevision === current.taskRevision &&
      !equalJson(approvalScope(current.gate), approvalScope(next.gate))) {
    fail("TRANSITION_INVALID", "approval identity and boundary are immutable within a task revision");
  }
  if ((next.status === "cancelled" || next.status === "superseded") &&
      (unresolvedApproval(current.gate) || current.gate.kind === "blocker") &&
      !equalJson(current.gate, next.gate)) {
    fail("TRANSITION_INVALID", "Cancelled and Superseded tasks must retain unresolved gate evidence");
  }
  if (next.status === "done" && unresolvedApproval(current.gate)) {
    fail("TRANSITION_INVALID", "Done cannot bypass an unresolved approval");
  }
}

async function validateDetails(root, tasks) {
  for (const task of tasks.values()) {
    const references = [...task.details];
    if (task.gate.kind === "approval" && task.gate.detailPath !== null) {
      references.push({ label: "approval detail", path: task.gate.detailPath });
    }
    for (const detail of references) {
      validateDetailPath(detail.path);
      if (!ALLOWED_DETAIL_ROOTS.some((prefix) => detail.path.startsWith(prefix))) {
        fail("PATH_UNSAFE", "detail reference is outside the allowed documentation roots");
      }
      const target = path.join(root, ...detail.path.split("/"));
      assertInside(root, target, "detail reference");
      await lstatRegularWithin(root, target, "detail reference", { maxBytes: 2_000_000 });
    }
  }
}

function computeDigest(controlText, entries) {
  const hash = createHash("sha256");
  hash.update("control.json\0", "utf8");
  hash.update(controlText, "utf8");
  for (const entry of entries) {
    hash.update(`${entry.relative}\0`, "utf8");
    hash.update(entry.text, "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

function assertNoUnmergedStore(root) {
  const output = gitOutput(["diff", "--name-only", "--diff-filter=U", "--", STORE_RELATIVE], root);
  if (output !== "") fail("GIT_CONFLICT", "task store has unresolved Git index conflicts");
}

function validateStoreByteLimit(value) {
  if (!Number.isSafeInteger(value) || value < 2 || value > MAX_STORE_BYTES) {
    fail("STORE_SIZE", "task store byte limit is invalid");
  }
  return value;
}

function assertProspectiveStoreBytes(loaded, nextBytes) {
  if (!Number.isSafeInteger(nextBytes) || nextBytes < 2 || nextBytes > loaded.storeByteLimit) {
    fail("STORE_SIZE", "prospective task store size is invalid");
  }
}

export async function loadStore(context, {
  storeRoot = context.storeRoot,
  checkGit = true,
  checkDetails = true,
  maxStoreBytes = MAX_STORE_BYTES,
} = {}) {
  const storeByteLimit = validateStoreByteLimit(maxStoreBytes);
  if (checkGit && storeRoot === context.storeRoot) assertNoUnmergedStore(context.root);
  await assertOrdinaryDirectoryTree(context.root, storeRoot, "task store");
  const rootEntries = await boundedDirectoryEntries(storeRoot, 3, "task store root");
  const names = rootEntries.map((entry) => entry.name).sort();
  if (names.length !== 2 || names[0] !== "control.json" || names[1] !== "records") {
    fail("STORE_LAYOUT", "task store root contains unexpected or missing entries");
  }
  const controlPath = path.join(storeRoot, "control.json");
  const controlRead = await readUtf8File(controlPath, "control record", { root: context.root });
  let storeBytes = controlRead.bytes.length;
  const control = parseCanonical(controlRead.text, "control record", normalizeControl);
  const recordsRoot = path.join(storeRoot, "records");
  await assertOrdinaryDirectoryTree(context.root, recordsRoot, "task records directory");
  const shardEntries = await boundedDirectoryEntries(recordsRoot, MAX_RECORDS, "task shard inventory");
  const tasks = new Map();
  const digestEntries = [];
  const recordDescriptors = [];
  for (const shardEntry of shardEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!shardEntry.isDirectory() || shardEntry.isSymbolicLink() || !/^\d{4,}$/u.test(shardEntry.name) ||
        String(Number(shardEntry.name)).padStart(4, "0") !== shardEntry.name) {
      fail("STORE_LAYOUT", "task records directory contains an invalid shard");
    }
    const shardPath = path.join(recordsRoot, shardEntry.name);
    await assertOrdinaryDirectoryTree(context.root, shardPath, "task record shard");
    const fileEntries = await boundedDirectoryEntries(shardPath, 1000, "task shard");
    if (fileEntries.length === 0) fail("STORE_LAYOUT", "task record shards must not be empty");
    for (const fileEntry of fileEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (fileEntry.isSymbolicLink()) fail("PATH_UNSAFE", "task shard contains a symbolic link");
      if (!fileEntry.isFile() || !/^T-(?:\d{4}|[1-9]\d{4,})\.json$/u.test(fileEntry.name)) {
        fail("STORE_LAYOUT", "task shard contains an unexpected entry");
      }
      const id = fileEntry.name.slice(0, -5);
      if (shardForTaskId(id) !== shardEntry.name) fail("STORE_LAYOUT", "task record is in the wrong numeric shard");
      const file = path.join(shardPath, fileEntry.name);
      const info = await lstatRegularWithin(context.root, file, "task record");
      storeBytes += info.size;
      if (storeBytes > storeByteLimit) fail("STORE_SIZE", "task store exceeds its supported aggregate byte size");
      recordDescriptors.push({ id, file, bytes: info.size });
      if (recordDescriptors.length > MAX_RECORDS) fail("STORE_SIZE", "task store exceeds its supported record count");
    }
  }
  for (let offset = 0; offset < recordDescriptors.length; offset += 64) {
    const batch = await Promise.all(recordDescriptors.slice(offset, offset + 64).map(async ({ id, file }) => {
      const read = await readUtf8File(file, "task record", { root: context.root });
      return { id, task: parseCanonical(read.text, "task record", normalizeTask), text: read.text };
    }));
    for (const { id, task, text } of batch) {
      if (task.id !== id || tasks.has(id)) fail("TASK_ID_MISMATCH", "task file name is duplicated or differs from record ID");
      tasks.set(id, task);
      digestEntries.push({ relative: taskRecordRelativePath(id), text });
    }
  }
  const sortedTasks = new Map([...tasks].sort(([left], [right]) => compareTaskIds(left, right)));
  validateState(control, sortedTasks);
  if (checkDetails) await validateDetails(context.root, sortedTasks);
  await assertOrdinaryDirectoryTree(context.root, storeRoot, "task store");
  digestEntries.sort((left, right) => compareTaskIds(path.basename(left.relative, ".json"), path.basename(right.relative, ".json")));
  return {
    control,
    tasks: sortedTasks,
    digest: computeDigest(controlRead.text, digestEntries),
    storeRoot,
    storeBytes,
    storeByteLimit,
    controlBytes: controlRead.bytes.length,
    recordBytes: new Map(recordDescriptors.map(({ id, bytes }) => [id, bytes])),
  };
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

function boundedCanonicalJson(value, label = "record") {
  const text = canonicalJson(value);
  if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) {
    fail("RECORD_SIZE", `${label} exceeds the maximum canonical byte size`);
  }
  return text;
}

async function durableWriteExclusive(file, text, mode = 0o644) {
  let handle;
  try {
    handle = await fs.open(file, "wx", mode);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function atomicWriteJson(file, value, { replacing = true, root = null } = {}) {
  const parent = path.dirname(file);
  if (root === null) fail("PATH_UNSAFE", "atomic record writes require a repository root");
  const stageParent = path.join(root, "readme", "tasks");
  const text = boundedCanonicalJson(value);
  await assertOrdinaryDirectoryTree(root, stageParent, "record staging directory");
  await assertOrdinaryDirectoryTree(root, parent, "record parent");
  if (replacing) {
    await lstatRegularWithin(root, file, "record being replaced");
  }
  else {
    const exists = await fs.lstat(file).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
    if (exists) fail("DESTINATION_COLLISION", "record destination already exists");
  }
  const temporary = path.join(stageParent, `.framework-data-record-${randomUUID()}.tmp`);
  try {
    await durableWriteExclusive(temporary, text);
    await syncDirectory(stageParent);
    await assertOrdinaryDirectoryTree(root, stageParent, "record staging directory");
    await assertOrdinaryDirectoryTree(root, parent, "record parent");
    if (replacing) {
      await lstatRegularWithin(root, file, "record being replaced");
    } else {
      const collision = await fs.lstat(file).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
      if (collision) fail("DESTINATION_COLLISION", "record destination appeared before creation");
    }
    await fs.rename(temporary, file);
    await syncDirectory(parent);
    await syncDirectory(stageParent);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    await syncDirectory(stageParent).catch(() => {});
    if (error instanceof Error && error.name === "FrameworkDataError") throw error;
    fail("ATOMIC_WRITE_FAILED", "atomic record replacement failed");
  }
}

export async function mutateTask(context, loaded, id, expectedVersion, transform, { expectedDigest = null } = {}) {
  const current = loaded.tasks.get(id);
  if (!current) fail("TASK_NOT_FOUND", "task does not exist", 4);
  if (current.recordVersion !== expectedVersion) fail("STALE_RECORD", "task recordVersion is stale", 4);
  if (expectedDigest !== null && loaded.digest !== expectedDigest) fail("STALE_STORE", "store digest is stale", 4);
  const next = normalizeTask(transform(structuredClone(current)));
  if (next.id !== id) fail("TRANSITION_INVALID", "normal mutation cannot change task ID");
  if (next.recordVersion !== current.recordVersion + 1) fail("TRANSITION_INVALID", "normal mutation must increment recordVersion once");
  validateTaskTransition(current, next);
  const nextRecordBytes = Buffer.byteLength(boundedCanonicalJson(next, "task record"), "utf8");
  assertProspectiveStoreBytes(loaded,
    loaded.storeBytes - loaded.recordBytes.get(id) + nextRecordBytes);
  const prospective = new Map(loaded.tasks);
  prospective.set(id, next);
  validateState(loaded.control, prospective);
  await validateDetails(context.root, prospective);
  await atomicWriteJson(taskRecordPath(loaded.storeRoot, id), next, { root: context.root });
  return loadStore(context);
}

export async function addTask(context, loaded, task) {
  const normalized = normalizeTask(task);
  const taskBytes = Buffer.byteLength(boundedCanonicalJson(normalized, "task record"), "utf8");
  assertProspectiveStoreBytes(loaded, loaded.storeBytes + taskBytes);
  if (loaded.tasks.has(normalized.id)) fail("TASK_ID_COLLISION", "derived task ID already exists", 4);
  const expected = formatTaskId(highestTaskNumber(loaded.tasks) + 1);
  if (normalized.id !== expected) fail("TASK_ID_INVALID", "new task ID is not the next derived ID");
  const prospective = new Map(loaded.tasks);
  prospective.set(normalized.id, normalized);
  validateState(loaded.control, prospective);
  await validateDetails(context.root, prospective);
  const shard = path.dirname(taskRecordPath(loaded.storeRoot, normalized.id));
  const recordsRoot = path.dirname(shard);
  await assertOrdinaryDirectoryTree(context.root, recordsRoot, "task records directory");
  const shardExists = await fs.lstat(shard).then((info) => {
    if (!info.isDirectory() || info.isSymbolicLink()) fail("PATH_UNSAFE", "task shard destination is unsafe");
    return true;
  }, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
  if (!shardExists) {
    const stageParent = path.join(context.root, "readme", "tasks");
    const stage = path.join(stageParent, `.framework-data-shard-${randomUUID()}`);
    try {
      await assertOrdinaryDirectoryTree(context.root, stageParent, "task shard staging directory");
      await fs.mkdir(stage, { mode: 0o755 });
      await durableWriteExclusive(path.join(stage, `${normalized.id}.json`), boundedCanonicalJson(normalized, "task record"));
      await syncDirectory(stage);
      await syncDirectory(stageParent);
      await assertOrdinaryDirectoryTree(context.root, recordsRoot, "task records directory");
      const collision = await fs.lstat(shard).then(() => true,
        (error) => error.code === "ENOENT" ? false : Promise.reject(error));
      if (collision) fail("DESTINATION_COLLISION", "task shard destination appeared before creation");
      await fs.rename(stage, shard);
      await syncDirectory(recordsRoot);
      await syncDirectory(stageParent);
    } catch (error) {
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      await syncDirectory(stageParent).catch(() => {});
      if (error instanceof Error && error.name === "FrameworkDataError") throw error;
      fail("ATOMIC_WRITE_FAILED", "atomic task shard creation failed");
    }
  } else {
    await assertOrdinaryDirectoryTree(context.root, shard, "task shard destination");
    await atomicWriteJson(taskRecordPath(loaded.storeRoot, normalized.id), normalized, {
      replacing: false,
      root: context.root,
    });
  }
  return loadStore(context);
}

export async function mutateControl(context, loaded, expectedVersion, transform, { expectedDigest = null } = {}) {
  if (loaded.control.recordVersion !== expectedVersion) fail("STALE_RECORD", "control recordVersion is stale", 4);
  if (expectedDigest !== null && loaded.digest !== expectedDigest) fail("STALE_STORE", "store digest is stale", 4);
  const next = normalizeControl(transform(structuredClone(loaded.control)));
  if (next.recordVersion !== loaded.control.recordVersion + 1) fail("TRANSITION_INVALID", "control mutation must increment recordVersion once");
  const nextControlBytes = Buffer.byteLength(boundedCanonicalJson(next, "control record"), "utf8");
  assertProspectiveStoreBytes(loaded,
    loaded.storeBytes - loaded.controlBytes + nextControlBytes);
  validateState(next, loaded.tasks);
  await atomicWriteJson(path.join(loaded.storeRoot, "control.json"), next, { root: context.root });
  return loadStore(context);
}

export async function initializeStore(context) {
  const tasksParent = path.join(context.root, "readme", "tasks");
  await assertOrdinaryDirectoryTree(context.root, path.join(context.root, "readme"), "readme directory");
  await assertOrdinaryDirectoryTree(context.root, tasksParent, "tasks directory");
  const existing = await fs.lstat(context.storeRoot).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
  if (existing) fail("DESTINATION_COLLISION", "task store already exists", 4);
  const stage = path.join(tasksParent, `.framework-data-init-${randomUUID()}`);
  try {
    await fs.mkdir(stage, { mode: 0o755 });
    await syncDirectory(tasksParent);
    await fs.mkdir(path.join(stage, "records"), { mode: 0o755 });
    await syncDirectory(stage);
    await syncDirectory(path.join(stage, "records"));
    await durableWriteExclusive(path.join(stage, "control.json"), boundedCanonicalJson({
      schemaVersion: 1,
      recordVersion: 1,
      pause: null,
    }, "control record"));
    await syncDirectory(stage);
    await loadStore(context, { storeRoot: stage, checkGit: false, checkDetails: false });
    await assertOrdinaryDirectoryTree(context.root, tasksParent, "tasks directory");
    const collision = await fs.lstat(context.storeRoot).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
    if (collision) fail("DESTINATION_COLLISION", "task store appeared during initialization", 4);
    await fs.rename(stage, context.storeRoot);
    await syncDirectory(tasksParent);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    await syncDirectory(tasksParent).catch(() => {});
    throw error;
  }
  return loadStore(context);
}

export async function acquireLock(context) {
  const lockDirectory = path.join(context.commonDir, "framework-data.lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const token = randomUUID();
  const ownerStage = path.join(context.commonDir, `.framework-data-owner-${token}.tmp`);
  await assertOrdinaryDirectoryTree(context.commonDir, context.commonDir, "Git common directory", { allowRoot: true });
  const owner = {
    token,
    pid: process.pid,
    host: os.hostname(),
  };
  safeText(owner.host, "lock owner host", { max: 256 });
  try {
    await durableWriteExclusive(ownerStage, boundedCanonicalJson(owner, "lock owner"), 0o600);
    await syncDirectory(context.commonDir);
    await fs.mkdir(lockDirectory, { mode: 0o700 });
  } catch (error) {
    await fs.unlink(ownerStage).catch(() => {});
    await syncDirectory(context.commonDir).catch(() => {});
    if (error.code === "EEXIST") fail("LOCK_BUSY", "framework-data lock is already held", 5);
    fail("LOCK_FAILED", "framework-data lock cannot be acquired", 5);
  }
  try {
    await fs.rename(ownerStage, ownerFile);
    await syncDirectory(lockDirectory);
    await syncDirectory(context.commonDir);
  } catch {
    await fs.unlink(ownerStage).catch(() => {});
    await fs.unlink(ownerFile).catch(() => {});
    await fs.rmdir(lockDirectory).catch(() => {});
    await syncDirectory(context.commonDir).catch(() => {});
    fail("LOCK_FAILED", "framework-data lock ownership cannot be recorded", 5);
  }
  return {
    token,
    lockDirectory,
    ownerFile,
    async release() {
      let parsed;
      try {
        parsed = await readLockOwner(context, lockDirectory);
      } catch {
        fail("LOCK_OWNERSHIP", "framework-data lock ownership cannot be verified", 5);
      }
      if (parsed.token !== token) fail("LOCK_OWNERSHIP", "framework-data lock ownership changed", 5);
      await fs.unlink(ownerFile).catch(() => fail("LOCK_OWNERSHIP", "framework-data lock owner cannot be removed", 5));
      await fs.rmdir(lockDirectory).catch(() => fail("LOCK_OWNERSHIP", "framework-data lock directory cannot be removed", 5));
      await syncDirectory(context.commonDir).catch(() => fail("LOCK_OWNERSHIP", "framework-data lock removal cannot be synchronized", 5));
    },
  };
}

function validateLockOwner(value, text) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      !equalJson(Object.keys(value), ["token", "pid", "host"])) {
    fail("LOCK_OWNERSHIP", "framework-data lock owner is malformed", 5);
  }
  if (typeof value.token !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.token)) {
    fail("LOCK_OWNERSHIP", "framework-data lock owner token is invalid", 5);
  }
  if (!Number.isSafeInteger(value.pid) || value.pid < 1) {
    fail("LOCK_OWNERSHIP", "framework-data lock owner PID is invalid", 5);
  }
  safeText(value.host, "lock owner host", { max: 256 });
  if (canonicalJson(value) !== text) fail("LOCK_OWNERSHIP", "framework-data lock owner is not canonical", 5);
  return value;
}

async function readLockOwner(context, lockDirectory) {
  await assertOrdinaryDirectoryTree(context.commonDir, lockDirectory, "framework-data lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const read = await readUtf8File(ownerFile, "framework-data lock owner", {
    root: context.commonDir,
    maxBytes: 4096,
  });
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    fail("LOCK_OWNERSHIP", "framework-data lock owner is not valid JSON", 5);
  }
  return validateLockOwner(parsed, read.text);
}

async function malformedLockOwnerIdentity(context, lockDirectory) {
  await assertOrdinaryDirectoryTree(context.commonDir, lockDirectory, "framework-data lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const info = await fs.lstat(ownerFile).catch(() =>
    fail("LOCK_OWNERSHIP", "framework-data lock owner cannot be inspected", 5));
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4096) {
    fail("LOCK_OWNERSHIP", "framework-data lock owner is unsafe", 5);
  }
  const real = await fs.realpath(ownerFile).catch(() =>
    fail("LOCK_OWNERSHIP", "framework-data lock owner cannot be resolved", 5));
  if (real !== ownerFile) fail("LOCK_OWNERSHIP", "framework-data lock owner escapes its lexical location", 5);
  return { kind: "malformed", dev: String(info.dev), ino: String(info.ino), size: info.size };
}

function sameIncompleteIdentity(left, right) {
  return left?.kind === right?.kind && left?.dev === right?.dev && left?.ino === right?.ino &&
    left?.size === right?.size;
}

export async function inspectLock(context) {
  const lockDirectory = path.join(context.commonDir, "framework-data.lock");
  const info = await fs.lstat(lockDirectory).catch((error) => {
    if (error.code === "ENOENT") return null;
    fail("LOCK_OWNERSHIP", "framework-data lock cannot be inspected", 5);
  });
  if (info === null) return { held: false, state: "absent", owner: null };
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("LOCK_OWNERSHIP", "framework-data lock path is unsafe", 5);
  }
  await assertOrdinaryDirectoryTree(context.commonDir, lockDirectory, "framework-data lock");
  const entries = (await boundedDirectoryEntries(lockDirectory, 2, "framework-data lock"))
    .map((entry) => entry.name);
  if (entries.length === 0) {
    return { held: true, state: "incomplete", owner: null, incomplete: { kind: "absent" } };
  }
  if (entries.length !== 1 || entries[0] !== "owner.json") {
    fail("LOCK_OWNERSHIP", "framework-data lock contains unexpected entries", 5);
  }
  try {
    return { held: true, state: "owned", owner: await readLockOwner(context, lockDirectory) };
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "FrameworkDataError") throw error;
    return {
      held: true,
      state: "incomplete",
      owner: null,
      incomplete: await malformedLockOwnerIdentity(context, lockDirectory),
    };
  }
}

export async function recoverLock(context, expectedToken, { confirmOwnerNotLive = false } = {}) {
  if (confirmOwnerNotLive !== true) {
    fail("LOCK_RECOVERY_CONFIRMATION", "lock recovery requires explicit confirmation that no owner is live", 5);
  }
  const inspected = await inspectLock(context);
  if (!inspected.held) fail("LOCK_RECOVERY_STALE", "framework-data lock is no longer present", 5);
  const observedToken = inspected.state === "incomplete" ? "incomplete" : inspected.owner.token;
  if (expectedToken !== observedToken) {
    fail("LOCK_RECOVERY_STALE", "framework-data lock identity changed", 5);
  }
  const lockDirectory = path.join(context.commonDir, "framework-data.lock");
  const quarantine = path.join(context.commonDir, `.framework-data-recovery-${randomUUID()}`);
  const rechecked = await inspectLock(context);
  const recheckedToken = rechecked.state === "incomplete" ? "incomplete" : rechecked.owner?.token;
  if (!rechecked.held || recheckedToken !== expectedToken || rechecked.state !== inspected.state ||
      (inspected.state === "incomplete" &&
        !sameIncompleteIdentity(inspected.incomplete, rechecked.incomplete))) {
    fail("LOCK_RECOVERY_STALE", "framework-data lock identity changed before recovery", 5);
  }
  try {
    await fs.rename(lockDirectory, quarantine);
    await syncDirectory(context.commonDir);
    const entries = (await boundedDirectoryEntries(quarantine, 2, "quarantined framework-data lock"))
      .map((entry) => entry.name);
    if (inspected.state === "incomplete") {
      if (inspected.incomplete.kind === "absent") {
        if (entries.length !== 0) fail("LOCK_RECOVERY_STALE", "incomplete lock gained contents before recovery", 5);
      } else {
        if (entries.length !== 1 || entries[0] !== "owner.json") {
          fail("LOCK_RECOVERY_STALE", "malformed lock contents changed before recovery", 5);
        }
        const identity = await malformedLockOwnerIdentity(context, quarantine);
        if (!sameIncompleteIdentity(inspected.incomplete, identity)) {
          fail("LOCK_RECOVERY_STALE", "malformed lock identity changed before recovery", 5);
        }
        await fs.unlink(path.join(quarantine, "owner.json"));
      }
    } else {
      if (entries.length !== 1 || entries[0] !== "owner.json") {
        fail("LOCK_RECOVERY_STALE", "framework-data lock contents changed before recovery", 5);
      }
      const quarantinedOwner = await readLockOwner(context, quarantine);
      if (quarantinedOwner.token !== expectedToken) fail("LOCK_RECOVERY_STALE", "framework-data lock identity changed", 5);
      await fs.unlink(path.join(quarantine, "owner.json"));
    }
    await fs.rmdir(quarantine);
    await syncDirectory(context.commonDir);
    return inspected;
  } catch (error) {
    if (error instanceof Error && error.name === "FrameworkDataError") throw error;
    fail("LOCK_RECOVERY_FAILED", "framework-data lock could not be recovered safely", 5);
  }
}

export async function withLock(context, operation) {
  const lock = await acquireLock(context);
  let operationError;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await lock.release();
    } catch (releaseError) {
      if (!operationError) throw releaseError;
    }
  }
}

export function nextTaskId(tasks) {
  return formatTaskId(highestTaskNumber(tasks) + 1);
}

export function activeTask(tasks) {
  return [...tasks.values()].find((task) => task.status === "active") ?? null;
}

export function taskIsCandidate(task, store) {
  const gateSatisfied = task.gate.kind === "none" ||
    (task.gate.kind === "approval" && task.gate.status === "granted" &&
      task.gate.boundTaskRevision === task.taskRevision &&
      typeof task.gate.id === "string" && typeof task.gate.source === "string" &&
      typeof task.gate.action === "string" && typeof task.gate.boundary === "string" &&
      typeof task.gate.detailPath === "string");
  return store.control.pause === null && task.status === "ready" &&
    task.route !== "unrouted" && task.risk !== null && gateSatisfied &&
    task.dependencies.every((id) => store.tasks.get(id)?.status === "done");
}

export function assertExpectedDigest(loaded, expected) {
  if (typeof expected !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(expected)) {
    fail("ARGUMENT_INVALID", "expected store digest is invalid", 2);
  }
  if (loaded.digest !== expected) fail("STALE_STORE", "store digest is stale", 4);
}
