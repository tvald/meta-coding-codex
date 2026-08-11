import { execFileSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { TERMINAL_STATUSES, canonicalJson, normalizeTask } from "./schema.mjs";

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const TEMPLATE_FILES = Object.freeze([
  "assumptions.md",
  "decision-record.md",
  "incident-note.md",
  "project-brief.md",
  "project-context.md",
  "project-state.md",
  "quality-record.md",
  "standards.md",
  "task-brief.md",
  "task-catalog.md",
  "task-notes.md",
  "threat-model-card.md",
]);

const PROCESS_FILES = Object.freeze([
  "agent-definitions.md",
  "automation-policy.md",
  "development-standards.md",
  "framework-improvement.md",
  "knowledge-ingestion.md",
  "knowledge-management.md",
  "onboarding.md",
  "quality-system.md",
  "resumption-protocol.md",
  "root-loop.md",
  "workflow-routing.md",
]);

const FRAMEWORK_CHANGELOG_MARKER = "<!-- Local framework entries go below this line. -->";
const MAX_MARKDOWN_FILES = 10_000;
const MAX_MARKDOWN_FILE_BYTES = 1_048_576;
const MAX_MARKDOWN_TOTAL_BYTES = 67_108_864;
const MAX_GIT_OUTPUT_BYTES = 2_097_152;
const MAX_LINKS = 100_000;
const MAX_STAGED_PATHS = 10_000;
const MAX_FINDINGS_PER_SEVERITY = 200;
const MAX_BUDGET_VIOLATION_DETAILS = 100;
const MAINTENANCE_COMPLETION_THRESHOLD = 10;

export const FRAMEWORK_DOCTOR_LIMITS = Object.freeze({
  agentsLines: 120,
  cursorLines: 80,
  taskEntrypointLines: 80,
  projectBriefLines: 200,
  projectContextLines: 160,
  standardsLines: 240,
  assumptionsLines: 120,
  glossaryLines: 160,
  sourceMapLines: 200,
  activeTaskNoteLines: 300,
  decisionLines: 220,
  changelogLines: 160,
  changelogEntries: 20,
  processDocumentLines: 300,
  markdownFiles: MAX_MARKDOWN_FILES,
  markdownFileBytes: MAX_MARKDOWN_FILE_BYTES,
  markdownTotalBytes: MAX_MARKDOWN_TOTAL_BYTES,
  localLinks: MAX_LINKS,
  stagedPaths: MAX_STAGED_PATHS,
  findingsPerSeverity: MAX_FINDINGS_PER_SEVERITY,
});

class BoundedFindings extends Array {
  constructor(severity) {
    super();
    this.severity = severity;
    this.omitted = 0;
    this.truncation = null;
  }

  push(...items) {
    for (const item of items) {
      if (this.length < MAX_FINDINGS_PER_SEVERITY - 1) {
        super.push(item);
        continue;
      }
      this.omitted += 1;
      if (this.truncation === null) {
        this.truncation = {
          code: "DOCTOR_FINDINGS_TRUNCATED",
          message: `additional ${this.severity} findings were omitted at the output safety limit`,
          details: { omitted: this.omitted, limit: MAX_FINDINGS_PER_SEVERITY },
        };
        super.push(this.truncation);
      } else {
        this.truncation.details.omitted = this.omitted;
      }
    }
    return this.length;
  }
}

class CheckFailure extends Error {
  constructor(code, message, relativePath = null, details = null) {
    super(message);
    this.name = "CheckFailure";
    this.code = code;
    this.relativePath = relativePath;
    this.details = details;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const newlineCount = (text.match(/\n/gu) ?? []).length;
  return newlineCount + (text.endsWith("\n") ? 0 : 1);
}

function isInside(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  return (allowRoot || relative !== "") && !relative.startsWith("..") &&
    !path.isAbsolute(relative);
}

function validateRelativePath(relativePath, label = "repository path") {
  if (typeof relativePath !== "string" || relativePath.length === 0 ||
      relativePath.length > 4096 || relativePath.includes("\\") ||
      /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(relativePath) ||
      path.posix.isAbsolute(relativePath) || path.posix.normalize(relativePath) !== relativePath ||
      relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", `${label} is not a safe repository-relative path`);
  }
  return relativePath;
}

async function validateRoot(root) {
  if (typeof root !== "string" || root.length === 0) {
    throw new CheckFailure("DOCTOR_ROOT_UNSAFE", "repository root is missing");
  }
  const resolved = path.resolve(root);
  const info = await fs.lstat(resolved).catch(() => {
    throw new CheckFailure("DOCTOR_ROOT_UNSAFE", "repository root cannot be inspected");
  });
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new CheckFailure("DOCTOR_ROOT_UNSAFE", "repository root must be an ordinary directory");
  }
  const real = await fs.realpath(resolved).catch(() => {
    throw new CheckFailure("DOCTOR_ROOT_UNSAFE", "repository root cannot be resolved");
  });
  if (real !== resolved) {
    throw new CheckFailure("DOCTOR_ROOT_UNSAFE", "repository root must be its physical lexical path");
  }
  return resolved;
}

async function inspectParentTree(root, absolutePath, relativePath, { allowMissing = false } = {}) {
  const parent = path.dirname(absolutePath);
  if (!isInside(root, parent, { allowRoot: true })) {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path escapes the repository", relativePath);
  }
  const relativeParent = path.relative(root, parent);
  let current = root;
  for (const part of relativeParent === "" ? [] : relativeParent.split(path.sep)) {
    current = path.join(current, part);
    const info = await fs.lstat(current).catch((error) => {
      if (error.code === "ENOENT" && allowMissing) return null;
      if (error.code === "ENOENT") {
        throw new CheckFailure("DOCTOR_FILE_MISSING", "required repository path parent is missing", relativePath);
      }
      throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path parent cannot be inspected", relativePath);
    });
    if (info === null) return false;
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path has an unsafe parent component", relativePath);
    }
  }
  const realParent = await fs.realpath(parent).catch(() => {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path parent cannot be resolved", relativePath);
  });
  if (realParent !== parent || !isInside(root, realParent, { allowRoot: true })) {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path parent escapes its lexical location", relativePath);
  }
  return true;
}

async function inspectPath(root, relativePath, { required = true } = {}) {
  validateRelativePath(relativePath);
  const absolutePath = path.join(root, ...relativePath.split("/"));
  const parentExists = await inspectParentTree(root, absolutePath, relativePath, { allowMissing: !required });
  if (!parentExists) return null;
  const info = await fs.lstat(absolutePath).catch((error) => {
    if (!required && error.code === "ENOENT") return null;
    if (error.code === "ENOENT") {
      throw new CheckFailure("DOCTOR_FILE_MISSING", "required repository path is missing", relativePath);
    }
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path cannot be inspected", relativePath);
  });
  if (info === null) return null;
  if (info.isSymbolicLink()) {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path must not be a symbolic link", relativePath);
  }
  const real = await fs.realpath(absolutePath).catch(() => {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path cannot be resolved", relativePath);
  });
  if (real !== absolutePath || !isInside(root, real)) {
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", "repository path escapes its lexical location", relativePath);
  }
  return { absolutePath, info };
}

async function readMarkdown(root, relativePath) {
  const inspected = await inspectPath(root, relativePath);
  if (!inspected.info.isFile() || inspected.info.nlink !== 1) {
    throw new CheckFailure("DOCTOR_FILE_UNSAFE", "Markdown input must be one ordinary non-hard-linked file", relativePath);
  }
  if (inspected.info.size > MAX_MARKDOWN_FILE_BYTES) {
    throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", "Markdown input exceeds the per-file byte limit", relativePath,
      { byteLimit: MAX_MARKDOWN_FILE_BYTES });
  }
  let handle;
  try {
    handle = await fs.open(inspected.absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const openInfo = await handle.stat();
    if (!openInfo.isFile() || openInfo.nlink !== 1 || openInfo.dev !== inspected.info.dev ||
        openInfo.ino !== inspected.info.ino || openInfo.size !== inspected.info.size) {
      throw new CheckFailure("DOCTOR_FILE_UNSAFE", "Markdown input changed during inspection", relativePath);
    }
    const bytes = await handle.readFile();
    if (bytes.length !== openInfo.size || bytes.length > MAX_MARKDOWN_FILE_BYTES) {
      throw new CheckFailure("DOCTOR_FILE_UNSAFE", "Markdown input changed during bounded read", relativePath);
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw new CheckFailure("DOCTOR_UTF8_INVALID", "Markdown input must not contain a byte-order mark", relativePath);
    }
    let text;
    try {
      text = UTF8.decode(bytes);
    } catch {
      throw new CheckFailure("DOCTOR_UTF8_INVALID", "Markdown input is not valid UTF-8", relativePath);
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(text)) {
      throw new CheckFailure("DOCTOR_TEXT_UNSAFE", "Markdown input contains unsafe control or directional text", relativePath);
    }
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/mu.test(text)) {
      throw new CheckFailure("DOCTOR_CONFLICT_MARKER", "Markdown input contains a merge-conflict marker", relativePath);
    }
    const finalInfo = await fs.lstat(inspected.absolutePath).catch(() => null);
    if (finalInfo === null || finalInfo.dev !== openInfo.dev || finalInfo.ino !== openInfo.ino ||
        finalInfo.size !== openInfo.size || finalInfo.isSymbolicLink()) {
      throw new CheckFailure("DOCTOR_FILE_UNSAFE", "Markdown input changed during inspection", relativePath);
    }
    return { text, bytes: bytes.length };
  } finally {
    await handle?.close();
  }
}

function gitOutput(root, args, label) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
  } catch {
    throw new CheckFailure("DOCTOR_GIT_FAILED", `${label} could not be read within its bounded Git query`);
  }
}

function decodeNulPaths(bytes, label) {
  if (bytes.length > MAX_GIT_OUTPUT_BYTES) {
    throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", `${label} exceeds its byte limit`);
  }
  if (bytes.length > 0 && bytes.at(-1) !== 0) {
    throw new CheckFailure("DOCTOR_GIT_FAILED", `${label} is not NUL-delimited`);
  }
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    throw new CheckFailure("DOCTOR_UTF8_INVALID", `${label} contains a non-UTF-8 repository path`);
  }
  return (text === "" ? [] : text.slice(0, -1).split("\0")).map((item) => validateRelativePath(item, label));
}

function listMarkdownPaths(root) {
  const output = gitOutput(root,
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    "Markdown inventory");
  const paths = [...new Set(decodeNulPaths(output, "Markdown inventory"))].sort(compareText);
  if (paths.length > MAX_MARKDOWN_FILES) {
    throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", "Markdown inventory exceeds its file-count limit", null,
      { count: paths.length, limit: MAX_MARKDOWN_FILES });
  }
  return paths;
}

function listStagedPaths(root) {
  const output = gitOutput(root,
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXBD", "-z"],
    "staged path inventory");
  const paths = [...new Set(decodeNulPaths(output, "staged path inventory"))].sort(compareText);
  if (paths.length > MAX_STAGED_PATHS) {
    throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", "staged path inventory exceeds its file-count limit", null,
      { count: paths.length, limit: MAX_STAGED_PATHS });
  }
  return paths;
}

function stagedCloseRecord(root, relativePath) {
  let bytes;
  try {
    bytes = gitOutput(root, ["show", `:${relativePath}`], "staged task close record");
  } catch {
    return false;
  }
  if (bytes.length < 2 || bytes.length > 65_536 ||
      (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    return false;
  }
  let text;
  try {
    text = UTF8.decode(bytes);
    const parsed = JSON.parse(text);
    const normalized = normalizeTask(parsed);
    return canonicalJson(normalized) === text && TERMINAL_STATUSES.has(normalized.status) &&
      normalized.completion !== null && typeof normalized.completion.completedAt === "string" &&
      typeof normalized.completion.repositoryChanged === "boolean" &&
      typeof normalized.completion.evidence === "string" && normalized.completion.evidence.length > 0;
  } catch {
    return false;
  }
}

async function boundedDirectoryNames(directory, limit, label) {
  const names = [];
  let handle;
  try {
    handle = await fs.opendir(directory);
    for await (const entry of handle) {
      names.push(entry.name);
      if (names.length > limit) {
        throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", `${label} exceeds its entry-count limit`, null,
          { count: names.length, limit });
      }
    }
  } catch (error) {
    if (error instanceof CheckFailure) throw error;
    throw new CheckFailure("DOCTOR_PATH_UNSAFE", `${label} cannot be read safely`);
  } finally {
    await handle?.close().catch((error) => {
      if (error.code !== "ERR_DIR_CLOSED") throw error;
    });
  }
  return names;
}

function firstLine(text) {
  const end = text.indexOf("\n");
  return (end === -1 ? text : text.slice(0, end)).replace(/\r$/u, "");
}

function stripCodeForLinks(text) {
  const result = [];
  let fence = null;
  for (const line of text.split("\n")) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      result.push("");
      continue;
    }
    if (fence !== null) {
      result.push("");
      continue;
    }
    result.push(line.replace(/(`+)(?:[^`]|`(?!\1))*?\1/gu, ""));
  }
  return result.join("\n");
}

function inlineLinkDestinations(text) {
  const destinations = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== "]" || text[index + 1] !== "(") continue;
    let cursor = index + 2;
    while (cursor < text.length && /[ \t]/u.test(text[cursor])) cursor += 1;
    if (text[cursor] === "<") {
      const end = text.indexOf(">", cursor + 1);
      if (end !== -1) destinations.push(text.slice(cursor + 1, end));
      continue;
    }
    const start = cursor;
    let depth = 1;
    let escaped = false;
    while (cursor < text.length && depth > 0) {
      const character = text[cursor];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    if (depth !== 0) continue;
    const raw = text.slice(start, cursor).trim();
    const destination = /^(\S+)/u.exec(raw)?.[1] ?? "";
    destinations.push(destination);
    index = cursor;
  }
  return destinations;
}

function linkDestinations(text) {
  const stripped = stripCodeForLinks(text);
  const destinations = inlineLinkDestinations(stripped);
  const definitions = /^\s{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gmu;
  for (const match of stripped.matchAll(definitions)) destinations.push(match[1] ?? match[2]);
  return destinations;
}

function normalizeLinkDestination(raw) {
  if (typeof raw !== "string") return { kind: "unsafe" };
  let value = raw.trim();
  if (value === "" || value.startsWith("#")) return { kind: "ignored" };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) || value.startsWith("//")) {
    return { kind: "external" };
  }
  value = value.split("#", 1)[0].split("?", 1)[0];
  if (value === "") return { kind: "ignored" };
  try {
    value = decodeURIComponent(value);
  } catch {
    return { kind: "unsafe" };
  }
  value = value.replace(/\\([() ])/gu, "$1");
  if (value.startsWith("/") || value.includes("\\") ||
      /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(value)) {
    return { kind: "unsafe" };
  }
  return { kind: "local", value };
}

async function targetExistsSafely(root, sourcePath, destination) {
  const sourceDirectory = path.posix.dirname(sourcePath);
  const lexical = path.posix.normalize(path.posix.join(sourceDirectory, destination)).replace(/\/$/u, "");
  if (lexical === ".." || lexical.startsWith("../") || path.posix.isAbsolute(lexical)) {
    throw new CheckFailure("DOCTOR_LINK_UNSAFE", "local Markdown link escapes the repository", sourcePath);
  }
  const relativeTarget = lexical === "." ? null : lexical;
  if (relativeTarget === null) return;
  try {
    validateRelativePath(relativeTarget, "local Markdown link target");
  } catch (error) {
    if (error instanceof CheckFailure) {
      throw new CheckFailure(error.code, error.message, sourcePath);
    }
    throw error;
  }
  const inspected = await inspectPath(root, relativeTarget, { required: false });
  if (inspected === null) {
    throw new CheckFailure("DOCTOR_LINK_MISSING", "local Markdown link target is missing", sourcePath,
      { target: relativeTarget });
  }
  if (!inspected.info.isFile() && !inspected.info.isDirectory()) {
    throw new CheckFailure("DOCTOR_LINK_UNSAFE", "local Markdown link target is not an ordinary file or directory", sourcePath,
      { target: relativeTarget });
  }
  if (inspected.info.isFile() && inspected.info.nlink !== 1) {
    throw new CheckFailure("DOCTOR_LINK_UNSAFE", "local Markdown link target is hard-linked", sourcePath,
      { target: relativeTarget });
  }
}

function changelogEntries(text) {
  return (text.match(/^## \d{4}-\d{2}-\d{2}: .+$/gmu) ?? []).length;
}

function exactMatches(text, expression) {
  return [...text.matchAll(expression)];
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function maintenanceSection(cursor) {
  const lines = cursor.split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "## Maintenance" || lines[index] === "## Maintenance Cadence") starts.push(index);
  }
  if (starts.length !== 1) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor must contain exactly one Maintenance section",
      "readme/README.md");
  }
  let end = starts[0] + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end += 1;
  return lines.slice(starts[0] + 1, end).join("\n");
}

function parseMaintenance(cursor, tasks, today) {
  const section = maintenanceSection(cursor);
  if (/^- Last maintenance pass: YYYY-MM-DD$/mu.test(section) &&
      /^- Next trigger: YYYY-MM-DD or 10 repository-changing completions$/mu.test(section) &&
      /^- Legacy repository-changing completion baseline: 0$/mu.test(section)) {
    return {
      lastPass: null,
      nextDate: null,
      legacyBaseline: 0,
      legacyBaselineDeclared: true,
      structuredRepositoryChanges: 0,
      completionCount: 0,
      completionThreshold: MAINTENANCE_COMPLETION_THRESHOLD,
      due: true,
      reasons: ["onboarding_baseline_uninitialized"],
    };
  }
  const lastMatches = exactMatches(section,
    /^- (?:Last consistency and pruning pass|Last maintenance pass): (\d{4}-\d{2}-\d{2})$/gmu);
  const nextMatches = exactMatches(section,
    /^- (?:Next date trigger|Next trigger|Next pass due): (\d{4}-\d{2}-\d{2})(?: .*)?$/gmu);
  if (lastMatches.length !== 1 || nextMatches.length !== 1 ||
      !isoDate(lastMatches[0][1]) || !isoDate(nextMatches[0][1])) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor maintenance dates are missing, duplicated, or invalid",
      "readme/README.md");
  }
  const lastPass = lastMatches[0][1];
  const nextDate = nextMatches[0][1];
  if (nextDate < lastPass) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor maintenance date trigger precedes the last pass",
      "readme/README.md");
  }
  const legacyMatches = exactMatches(section,
    /^- (?:Legacy repository-changing completion baseline|Transitional legacy baseline): ([0-9]+)(?: .*)?$/gmu);
  if (legacyMatches.length > 1) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor contains duplicate legacy maintenance baselines",
      "readme/README.md");
  }
  const legacyBaseline = legacyMatches.length === 0 ? 0 : Number(legacyMatches[0][1]);
  if (!Number.isSafeInteger(legacyBaseline)) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor legacy maintenance baseline is outside the supported range",
      "readme/README.md");
  }
  const thresholdText = nextMatches[0][0];
  const thresholdMatch = /(?:after |or )([0-9]+) (?:completed )?repository-changing (?:tasks|completions)/u
    .exec(thresholdText);
  const threshold = thresholdMatch === null ? MAINTENANCE_COMPLETION_THRESHOLD : Number(thresholdMatch[1]);
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    throw new CheckFailure("DOCTOR_MAINTENANCE_INVALID", "cursor maintenance completion threshold is invalid",
      "readme/README.md");
  }
  if (!(tasks instanceof Map)) {
    throw new CheckFailure("DOCTOR_TASK_INPUT_INVALID", "framework checks require a validated task Map");
  }
  let structuredRepositoryChanges = 0;
  for (const task of tasks.values()) {
    const completion = task?.completion;
    if (completion?.repositoryChanged === true && typeof completion.completedAt === "string" &&
        isoDate(completion.completedAt) && completion.completedAt > lastPass) {
      structuredRepositoryChanges += 1;
    }
  }
  const completionCount = legacyBaseline + structuredRepositoryChanges;
  const reasons = [];
  if (today >= nextDate) reasons.push("date");
  if (completionCount >= threshold) reasons.push("repository_change_count");
  return {
    lastPass,
    nextDate,
    legacyBaseline,
    legacyBaselineDeclared: legacyMatches.length === 1,
    structuredRepositoryChanges,
    completionCount,
    completionThreshold: threshold,
    due: reasons.length > 0,
    reasons,
  };
}

function frameworkPath(relativePath) {
  return relativePath === "AGENTS.md" || relativePath === "scripts/package-core.sh" ||
    relativePath === "scripts/install-core.sh" || relativePath.startsWith("readme/meta/") ||
    relativePath.startsWith(".codex/agents/") || relativePath.startsWith(".claude/agents/") ||
    relativePath.startsWith(".agents/skills/") || relativePath.startsWith(".claude/skills/");
}

function statusFor(errors, warnings, errorStart, warningStart) {
  if (errors.length > errorStart) return "error";
  if (warnings.length > warningStart) return "warning";
  return "pass";
}

function issueFrom(error, fallbackCode) {
  if (error instanceof CheckFailure) {
    return {
      code: error.code,
      message: error.message,
      ...(error.relativePath === null ? {} : { path: error.relativePath }),
      ...(error.details === null ? {} : { details: error.details }),
    };
  }
  return { code: fallbackCode, message: "framework check failed unexpectedly" };
}

/**
 * Run repository-level framework checks without mutating repository state.
 *
 * `tasks` must be the already validated task Map returned by the task-store loader.
 * `staged` enables advisory staged-evidence checks. `stagedPaths` is an optional,
 * deterministic injection point for focused tests; normal callers leave it unset.
 */
export async function runFrameworkChecks({
  root,
  tasks,
  staged = false,
  stagedPaths = undefined,
  now = new Date(),
} = {}) {
  const errors = new BoundedFindings("error");
  const warnings = new BoundedFindings("warning");
  const checks = [];
  const cache = new Map();
  const failedPaths = new Set();
  let repositoryRoot;

  try {
    repositoryRoot = await validateRoot(root);
  } catch (error) {
    errors.push(issueFrom(error, "DOCTOR_ROOT_UNSAFE"));
    return { ok: false, errors, warnings, checks };
  }

  const getMarkdown = async (relativePath) => {
    if (cache.has(relativePath)) return cache.get(relativePath);
    if (failedPaths.has(relativePath)) return null;
    try {
      const result = await readMarkdown(repositoryRoot, relativePath);
      cache.set(relativePath, result);
      return result;
    } catch (error) {
      failedPaths.add(relativePath);
      errors.push(issueFrom(error, "DOCTOR_FILE_UNSAFE"));
      return null;
    }
  };

  let errorStart = errors.length;
  let warningStart = warnings.length;
  const sentinelDetails = {};
  for (const [relativePath, heading, key] of [
    ["readme/README.md", "# Project State", "projectCursor"],
    ["readme/tasks/README.md", "# Task Store", "taskEntrypoint"],
  ]) {
    const document = await getMarkdown(relativePath);
    const valid = document !== null && firstLine(document.text) === heading;
    sentinelDetails[key] = valid;
    if (document !== null && !valid) {
      errors.push({
        code: "DOCTOR_SENTINEL_INVALID",
        message: "required onboarding sentinel is missing from the first line",
        path: relativePath,
      });
    }
  }
  checks.push({ id: "onboarding_sentinels", status: statusFor(errors, warnings, errorStart, warningStart),
    details: sentinelDetails });

  errorStart = errors.length;
  warningStart = warnings.length;
  let markdownPaths = [];
  try {
    markdownPaths = listMarkdownPaths(repositoryRoot);
  } catch (error) {
    errors.push(issueFrom(error, "DOCTOR_GIT_FAILED"));
  }
  checks.push({ id: "markdown_inventory", status: statusFor(errors, warnings, errorStart, warningStart),
    details: { count: markdownPaths.length, limit: MAX_MARKDOWN_FILES } });

  errorStart = errors.length;
  warningStart = warnings.length;
  let inspectedDocuments = 0;
  let inspectedLinks = 0;
  let markdownBytes = 0;
  let resourceLimitReached = false;
  for (const relativePath of markdownPaths) {
    if (relativePath.startsWith("readme/meta/templates/") || relativePath.startsWith("readme/archive/")) continue;
    const document = await getMarkdown(relativePath);
    if (document === null) continue;
    inspectedDocuments += 1;
    markdownBytes += document.bytes;
    if (markdownBytes > MAX_MARKDOWN_TOTAL_BYTES) {
      errors.push({
        code: "DOCTOR_RESOURCE_LIMIT",
        message: "inspected Markdown exceeds the aggregate byte limit",
        details: { byteLimit: MAX_MARKDOWN_TOTAL_BYTES },
      });
      resourceLimitReached = true;
      break;
    }
    for (const rawDestination of linkDestinations(document.text)) {
      inspectedLinks += 1;
      if (inspectedLinks > MAX_LINKS) {
        errors.push({
          code: "DOCTOR_RESOURCE_LIMIT",
          message: "local Markdown link inventory exceeds its count limit",
          details: { linkLimit: MAX_LINKS },
        });
        resourceLimitReached = true;
        break;
      }
      const destination = normalizeLinkDestination(rawDestination);
      if (destination.kind === "ignored" || destination.kind === "external") continue;
      if (destination.kind === "unsafe") {
        errors.push({
          code: "DOCTOR_LINK_UNSAFE",
          message: "Markdown document contains an unsafe local link destination",
          path: relativePath,
        });
        continue;
      }
      try {
        await targetExistsSafely(repositoryRoot, relativePath, destination.value);
      } catch (error) {
        errors.push(issueFrom(error, "DOCTOR_LINK_UNSAFE"));
      }
    }
    if (resourceLimitReached) break;
  }
  checks.push({ id: "local_markdown_links", status: statusFor(errors, warnings, errorStart, warningStart),
    details: { inspectedDocuments, inspectedLinks, inspectedBytes: markdownBytes } });

  errorStart = errors.length;
  warningStart = warnings.length;
  let processCount = 0;
  for (const processFile of PROCESS_FILES) {
    const processPath = `readme/meta/${processFile}`;
    try {
      const inspected = await inspectPath(repositoryRoot, processPath);
      if (!inspected.info.isFile() || inspected.info.nlink !== 1) {
        throw new CheckFailure("DOCTOR_PROCESS_INVENTORY", "required process document is not an ordinary file",
          processPath);
      }
      const document = await readMarkdown(repositoryRoot, processPath);
      cache.set(processPath, document);
      processCount += 1;
    } catch (error) {
      errors.push({
        code: "DOCTOR_PROCESS_INVENTORY",
        message: "required process-document inventory is incomplete or unsafe",
        path: processPath,
        details: { cause: error instanceof Error ? error.message : "inspection failed" },
      });
    }
  }
  checks.push({ id: "process_inventory", status: statusFor(errors, warnings, errorStart, warningStart),
    details: { count: processCount, expectedCount: PROCESS_FILES.length } });

  errorStart = errors.length;
  warningStart = warnings.length;
  let templates = [];
  try {
    const inspected = await inspectPath(repositoryRoot, "readme/meta/templates");
    if (!inspected.info.isDirectory()) {
      throw new CheckFailure("DOCTOR_TEMPLATE_INVENTORY", "template path must be an ordinary directory",
        "readme/meta/templates");
    }
    templates = (await boundedDirectoryNames(inspected.absolutePath, TEMPLATE_FILES.length,
      "template inventory")).sort(compareText);
    if (templates.length !== TEMPLATE_FILES.length ||
        templates.some((name, index) => name !== TEMPLATE_FILES[index])) {
      throw new CheckFailure("DOCTOR_TEMPLATE_INVENTORY", "template inventory is not the exact twelve-file catalog",
        "readme/meta/templates", { expected: TEMPLATE_FILES, actual: templates });
    }
    for (const name of templates) {
      const templatePath = `readme/meta/templates/${name}`;
      const template = await inspectPath(repositoryRoot, templatePath);
      if (!template.info.isFile() || template.info.nlink !== 1) {
        throw new CheckFailure("DOCTOR_TEMPLATE_INVENTORY", "template inventory contains a non-ordinary file",
          templatePath);
      }
      await getMarkdown(templatePath);
    }
  } catch (error) {
    errors.push(issueFrom(error, "DOCTOR_TEMPLATE_INVENTORY"));
  }
  checks.push({ id: "template_inventory", status: statusFor(errors, warnings, errorStart, warningStart),
    details: { count: templates.length, expectedCount: TEMPLATE_FILES.length } });

  errorStart = errors.length;
  warningStart = warnings.length;
  let budgetInspected = 0;
  const budgetViolations = [];
  const checkBudget = async (relativePath, limit, hard, category, { required = false } = {}) => {
    const exists = await inspectPath(repositoryRoot, relativePath, { required }).catch((error) => {
      errors.push(issueFrom(error, "DOCTOR_FILE_UNSAFE"));
      return null;
    });
    if (exists === null) return;
    const document = await getMarkdown(relativePath);
    if (document === null) return;
    const lines = lineCount(document.text);
    budgetInspected += 1;
    if (lines > limit) {
      if (budgetViolations.length < MAX_BUDGET_VIOLATION_DETAILS) {
        budgetViolations.push({ path: relativePath, category, lines, limit });
      }
      const finding = {
        code: hard ? "DOCTOR_HARD_BUDGET" : "DOCTOR_BUDGET_WARNING",
        message: hard ? "hard document line budget is exceeded" : "default document line budget is exceeded",
        path: relativePath,
        details: { category, lines, limit },
      };
      (hard ? errors : warnings).push(finding);
    }
  };
  await checkBudget("AGENTS.md", FRAMEWORK_DOCTOR_LIMITS.agentsLines, true, "root_agents", { required: true });
  await checkBudget("readme/README.md", FRAMEWORK_DOCTOR_LIMITS.cursorLines, true, "project_cursor");
  await checkBudget("readme/tasks/README.md", FRAMEWORK_DOCTOR_LIMITS.taskEntrypointLines, true, "task_entrypoint");
  await checkBudget("readme/project/brief.md", FRAMEWORK_DOCTOR_LIMITS.projectBriefLines, false, "project_brief");
  await checkBudget("readme/project/context.md", FRAMEWORK_DOCTOR_LIMITS.projectContextLines, false, "project_context");
  await checkBudget("readme/project/standards.md", FRAMEWORK_DOCTOR_LIMITS.standardsLines, false, "standards");
  await checkBudget("readme/project/assumptions.md", FRAMEWORK_DOCTOR_LIMITS.assumptionsLines, false, "assumptions");
  await checkBudget("readme/project/glossary.md", FRAMEWORK_DOCTOR_LIMITS.glossaryLines, false, "glossary");
  await checkBudget("readme/project/source-map.md", FRAMEWORK_DOCTOR_LIMITS.sourceMapLines, false, "source_map");

  if (tasks instanceof Map) {
    const activeTasks = [...tasks.values()].filter((task) => task?.status === "active");
    if (activeTasks.length > 1) {
      errors.push({ code: "DOCTOR_TASK_INPUT_INVALID", message: "validated task input contains more than one Active task" });
    }
    for (const active of activeTasks) {
      const detailNotes = Array.isArray(active.details) ? active.details
        .map((detail) => detail?.path)
        .filter((detailPath) => typeof detailPath === "string" &&
          /^readme\/tasks\/[^/]+-notes\.md$/u.test(detailPath)) : [];
      const numeric = typeof active.id === "string" && /^T-\d+$/u.test(active.id) ? active.id.slice(2) : null;
      const inferredNotes = numeric === null ? [] : markdownPaths.filter((relativePath) =>
        relativePath.startsWith(`readme/tasks/${numeric}-`) && relativePath.endsWith("-notes.md"));
      for (const notePath of [...new Set([...detailNotes, ...inferredNotes])].sort(compareText)) {
        await checkBudget(notePath, FRAMEWORK_DOCTOR_LIMITS.activeTaskNoteLines, false, "active_task_note");
      }
    }
  } else {
    errors.push({ code: "DOCTOR_TASK_INPUT_INVALID", message: "framework checks require a validated task Map" });
  }

  for (const decisionPath of markdownPaths.filter((relativePath) =>
    /^readme\/decisions\/[^/]+\.md$/u.test(relativePath))) {
    await checkBudget(decisionPath, FRAMEWORK_DOCTOR_LIMITS.decisionLines, false, "decision");
  }
  for (const processFile of PROCESS_FILES) {
    await checkBudget(`readme/meta/${processFile}`, FRAMEWORK_DOCTOR_LIMITS.processDocumentLines, false,
      "meta_process");
  }
  checks.push({ id: "document_budgets", status: statusFor(errors, warnings, errorStart, warningStart),
    details: { inspected: budgetInspected, violations: budgetViolations } });

  errorStart = errors.length;
  warningStart = warnings.length;
  let sourceRepository = false;
  let changelogDetails = { sourceRepository };
  try {
    const sourceSignals = await Promise.all([
      inspectPath(repositoryRoot, "readme/learning/framework-changelog.md", { required: false }),
      inspectPath(repositoryRoot, "scripts/package-core.sh", { required: false }),
      inspectPath(repositoryRoot, "scripts/install-core.sh", { required: false }),
    ]);
    sourceRepository = sourceSignals.every((signal) =>
      signal !== null && signal.info.isFile() && signal.info.nlink === 1);
    const meta = await getMarkdown("readme/meta/framework-changelog.md");
    if (meta !== null) {
      const markers = meta.text.split(FRAMEWORK_CHANGELOG_MARKER).length - 1;
      if (markers !== 1) {
        errors.push({
          code: "DOCTOR_CHANGELOG_BOUNDARY",
          message: "framework changelog must contain the exact local-entry marker once",
          path: "readme/meta/framework-changelog.md",
        });
      } else if (sourceRepository && meta.text.split(FRAMEWORK_CHANGELOG_MARKER)[1].trim() !== "") {
        errors.push({
          code: "DOCTOR_SOURCE_CHANGELOG_POPULATED",
          message: "framework source repository must keep the distributable changelog seed blank",
          path: "readme/meta/framework-changelog.md",
        });
      }
    }
    const activeChangelogPath = sourceRepository ? "readme/learning/framework-changelog.md" :
      "readme/meta/framework-changelog.md";
    const activeChangelog = await getMarkdown(activeChangelogPath);
    if (activeChangelog !== null) {
      const lines = lineCount(activeChangelog.text);
      const entries = changelogEntries(activeChangelog.text);
      changelogDetails = { sourceRepository, activePath: activeChangelogPath, lines, entries };
      if (lines > FRAMEWORK_DOCTOR_LIMITS.changelogLines ||
          entries > FRAMEWORK_DOCTOR_LIMITS.changelogEntries) {
        warnings.push({
          code: "DOCTOR_CHANGELOG_BUDGET",
          message: "active framework changelog exceeds its default line or entry budget",
          path: activeChangelogPath,
          details: {
            lines,
            lineLimit: FRAMEWORK_DOCTOR_LIMITS.changelogLines,
            entries,
            entryLimit: FRAMEWORK_DOCTOR_LIMITS.changelogEntries,
          },
        });
      }
    }
  } catch (error) {
    errors.push(issueFrom(error, "DOCTOR_CHANGELOG_BOUNDARY"));
  }
  checks.push({ id: "framework_changelog", status: statusFor(errors, warnings, errorStart, warningStart),
    details: changelogDetails });

  errorStart = errors.length;
  warningStart = warnings.length;
  let maintenance = null;
  const cursor = cache.get("readme/README.md") ?? null;
  let today;
  try {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.valueOf())) throw new CheckFailure("DOCTOR_DATE_INVALID", "doctor current date is invalid");
    today = date.toISOString().slice(0, 10);
    if (cursor !== null) {
      maintenance = parseMaintenance(cursor.text, tasks, today);
      if (maintenance.due) {
        warnings.push({
          code: "DOCTOR_MAINTENANCE_DUE",
          message: "consistency and pruning maintenance is due",
          path: "readme/README.md",
          details: maintenance,
        });
      }
    }
  } catch (error) {
    errors.push(issueFrom(error, "DOCTOR_MAINTENANCE_INVALID"));
  }
  checks.push({ id: "maintenance_cadence", status: statusFor(errors, warnings, errorStart, warningStart),
    details: maintenance });

  if (staged || stagedPaths !== undefined) {
    errorStart = errors.length;
    warningStart = warnings.length;
    let paths = [];
    try {
      paths = stagedPaths === undefined ? listStagedPaths(repositoryRoot) :
        [...new Set(stagedPaths.map((item) => validateRelativePath(item, "staged path")))].sort(compareText);
      if (paths.length > MAX_STAGED_PATHS) {
        throw new CheckFailure("DOCTOR_RESOURCE_LIMIT", "staged path inventory exceeds its file-count limit", null,
          { count: paths.length, limit: MAX_STAGED_PATHS });
      }
      const taskRecord = (item) => /^readme\/tasks\/store\/records\/[^/]+\/T-\d+\.json$/u.test(item);
      const closeRecords = paths.filter(taskRecord).filter((item) => stagedCloseRecord(repositoryRoot, item));
      if (paths.length > 0 && closeRecords.length === 0) {
        warnings.push({
          code: "DOCTOR_STAGED_TASK_RECORD",
          message: "staged changes have no valid staged terminal task close record",
          details: { stagedPathCount: paths.length },
        });
      }
      const frameworkChanges = paths.filter(frameworkPath);
      if (frameworkChanges.length > 0) {
        const evidence = [
          ["decision", (item) => /^readme\/decisions\/[^/]+\.md$/u.test(item)],
          ["changelog", (item) => item === (sourceRepository ?
            "readme/learning/framework-changelog.md" : "readme/meta/framework-changelog.md")],
          ["quality", (item) => /^readme\/quality\/[^/]+\.md$/u.test(item)],
          ["task", (item) => closeRecords.includes(item)],
        ];
        for (const [kind, predicate] of evidence) {
          if (!paths.some(predicate)) {
            warnings.push({
              code: "DOCTOR_STAGED_EVIDENCE",
              message: `staged framework edits have no staged ${kind} evidence`,
              details: { evidenceKind: kind, frameworkFileCount: frameworkChanges.length },
            });
          }
        }
      }
    } catch (error) {
      errors.push(issueFrom(error, "DOCTOR_GIT_FAILED"));
    }
    checks.push({ id: "staged_framework_evidence", status: statusFor(errors, warnings, errorStart, warningStart),
      details: { stagedPathCount: paths.length, frameworkPathCount: paths.filter(frameworkPath).length } });
  }

  errors.sort((left, right) => compareText(`${left.code}\0${left.path ?? ""}\0${left.message}`,
    `${right.code}\0${right.path ?? ""}\0${right.message}`));
  warnings.sort((left, right) => compareText(`${left.code}\0${left.path ?? ""}\0${left.message}`,
    `${right.code}\0${right.path ?? ""}\0${right.message}`));
  return { ok: errors.length === 0, errors, warnings, checks };
}
