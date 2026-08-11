import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import {
  PROJECT_INIT_COMPATIBILITY,
  PROJECT_INIT_LIMITS,
} from './project-contract.mjs';
import {
  readPackageIdentity,
  unwrapValidatedClientRuntime,
  validateClientRuntimeMetadataSnapshot,
  validateClientRuntimeRoots,
} from './runtime-roots.mjs';
import { preflightTaskStore } from '../readme/meta/framework-data/cli.mjs';
import {
  inspectLock,
  loadStore,
  withLock,
} from '../readme/meta/framework-data/store.mjs';
import {
  MAX_RECORD_BYTES,
  MAX_RECORDS,
  shardForTaskId,
} from '../readme/meta/framework-data/schema.mjs';

export { PROJECT_INIT_COMPATIBILITY, PROJECT_INIT_LIMITS };

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const META_SCRIPT = 'node ./node_modules/meta-framework/bin/meta-framework.mjs';
const STAGE_PREFIX = '.meta-framework-project-init-v1-';
const STAGE_PATTERN = /^\.meta-framework-project-init-v1-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
const CONTROL_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u;
const CREATED_PATH_ORDER = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'readme/README.md',
  'readme/tasks/README.md',
  'readme/tasks/store/',
]);
const EMPTY_CONTROL = '{\n  "schemaVersion": 1,\n  "recordVersion": 1,\n  "pause": null\n}\n';

const CURSOR = `# Project State

This client-owned cursor indexes current project state. Keep it bounded and do not use
it as task history or as a copy of package-owned framework policy.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: \`npm run --ignore-scripts --silent meta -- tasks startup\`

Task facts live only in the structured store under \`readme/tasks/store/\`.

## Standing Project Policies

| Policy | Authority |
| --- | --- |
| None | |

## Known Global Dead Ends

- None.

## Documentation Map

- Stable project knowledge: \`readme/project/\` (created on demand)
- Decisions: \`readme/decisions/\` (created on demand)
- Task narratives: \`readme/tasks/\`
- Quality evidence: \`readme/quality/\` (created on demand)
- Threat models: \`readme/threat-models/\` (created on demand)
- Framework detail: \`npm run --ignore-scripts --silent meta -- docs TOPIC\`

## Maintenance

- Last maintenance pass: Not yet run
- Next trigger: First onboarding completion
`;

const TASK_ENTRYPOINT = `# Task Store

Canonical task state is client-owned under \`readme/tasks/store/\`. This static entrypoint
does not duplicate task records or package-owned framework policy.

## Required Commands

\`\`\`sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
\`\`\`

Use \`npm run --ignore-scripts --silent meta -- tasks --help\` for bounded queries and Root-owned semantic
mutations. Load the assigned package-owned profile before using this entrypoint; use
\`npm run --ignore-scripts --silent meta -- docs onboarding\` when project state is absent or incomplete.
`;

function bootstrap(harness) {
  return `# Meta Framework Bootstrap

<!-- meta-framework-bootstrap:v1:start ${harness} -->
For a primary session, run
\`npm run --ignore-scripts --silent meta -- agent-prompt --profile root --harness ${harness}\`
before project work and follow the complete emitted instructions.

For a delegated session, the assignment must name exactly one profile from
\`implementer\`, \`reviewer\`, \`qa\`, or \`security\`. Run the same command with that profile
in place of \`root\`; do not infer or broaden the assigned profile.

If this checked-in local command is unavailable or fails, stop and report the failure.
Do not use a global binary, \`npx\`, a network fetch, or package-internal policy paths.
<!-- meta-framework-bootstrap:v1:end ${harness} -->
`;
}

const FILES = Object.freeze({
  'AGENTS.md': bootstrap('codex'),
  'CLAUDE.md': bootstrap('claude'),
  'readme/README.md': CURSOR,
  'readme/tasks/README.md': TASK_ENTRYPOINT,
});

export class ProjectInitializerError extends Error {
  constructor(code, message, exitCode = 4) {
    super(message);
    this.name = 'ProjectInitializerError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message, exitCode = 4) {
  throw new ProjectInitializerError(code, message, exitCode);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function issue(code) {
  return Object.freeze({ code });
}

function safeRelative(relative) {
  if (!Object.hasOwn(FILES, relative) && relative !== 'readme/tasks/store/') {
    fail('INITIALIZATION_INTERNAL', 'initializer path is outside the fixed v1 inventory', 1);
  }
  return relative.endsWith('/') ? relative.slice(0, -1) : relative;
}

function targetPath(root, relative) {
  return path.join(root, ...safeRelative(relative).split('/'));
}

function safeMode(info, kind) {
  const mode = info.mode & 0o7777;
  if ((mode & 0o7022) !== 0) return false;
  if (kind === 'file' && (mode & 0o111) !== 0) return false;
  return kind === 'file' ? info.isFile() : info.isDirectory();
}

async function lstatOrNull(target) {
  return fs.lstat(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    fail('PATH_UNSAFE', 'a project path cannot be inspected');
  });
}

async function assertDirectory(root, target, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  if ((!allowRoot && relative === '') || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('PATH_UNSAFE', 'a project directory escapes the client root');
  }
  let current = root;
  for (const part of relative === '' ? [] : relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await lstatOrNull(current);
    if (info === null || info.isSymbolicLink() || !safeMode(info, 'directory')) {
      fail('PATH_UNSAFE', 'a project directory is missing or unsafe');
    }
  }
  const real = await fs.realpath(target).catch(() => fail('PATH_UNSAFE', 'a project directory cannot be resolved'));
  if (real !== path.resolve(target)) fail('PATH_UNSAFE', 'a project directory is not physical');
}

async function readSafeFile(root, relative, maxBytes) {
  const target = targetPath(root, relative);
  await assertDirectory(root, path.dirname(target), { allowRoot: true });
  const before = await lstatOrNull(target);
  if (before === null) return Object.freeze({ state: 'absent' });
  if (before.isSymbolicLink() || before.nlink !== 1 || !safeMode(before, 'file') ||
      before.size < 1 || before.size > maxBytes) {
    return Object.freeze({ state: 'collision' });
  }
  let handle;
  try {
    handle = await fs.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev ||
        opened.ino !== before.ino || opened.size !== before.size ||
        (opened.mode & 0o7777) !== (before.mode & 0o7777)) {
      return Object.freeze({ state: 'collision' });
    }
    const bytes = await handle.readFile();
    const after = await fs.lstat(target);
    if (bytes.length !== opened.size || after.isSymbolicLink() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        (after.mode & 0o7777) !== (opened.mode & 0o7777) ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      return Object.freeze({ state: 'collision' });
    }
    let text;
    try {
      text = UTF8.decode(bytes);
    } catch {
      return Object.freeze({ state: 'collision' });
    }
    if (text.includes('\r') || CONTROL_TEXT.test(text)) return Object.freeze({ state: 'collision' });
    return Object.freeze({
      state: 'read',
      text,
      identity: Object.freeze({
        dev: String(opened.dev),
        ino: String(opened.ino),
        mode: opened.mode & 0o7777,
        size: opened.size,
        digest: sha256(bytes),
      }),
    });
  } catch {
    return Object.freeze({ state: 'collision' });
  } finally {
    await handle?.close().catch(() => {});
  }
}

function canonicalBlockState(text, harness) {
  const expected = FILES[harness === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'];
  const start = `<!-- meta-framework-bootstrap:v1:start ${harness} -->`;
  const end = `<!-- meta-framework-bootstrap:v1:end ${harness} -->`;
  const markerMatches = [...text.matchAll(/<!-- meta-framework-bootstrap:[^\n]* -->/gu)];
  if (markerMatches.length !== 2) return 'collision';
  const expectedStart = expected.indexOf(start);
  const expectedEnd = expected.indexOf(end) + end.length;
  const block = expected.slice(expectedStart, expectedEnd);
  if ((text.match(/meta-framework-bootstrap/gu) ?? []).length !== 2) return 'collision';
  const occurrences = text.split(block).length - 1;
  if (occurrences !== 1) return 'collision';
  const index = text.indexOf(block);
  if ((index !== 0 && text[index - 1] !== '\n') ||
      (index + block.length !== text.length && text[index + block.length] !== '\n')) {
    return 'collision';
  }
  return 'recognized';
}

function decodeSafeDocument(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return null;
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return null;
  }
  return text.includes('\r') || CONTROL_TEXT.test(text) ? null : text;
}

function recognizedStateDocument(relative, text) {
  if (relative === 'readme/README.md') {
    return text.startsWith('# Project State\n') &&
      (text.includes('npm run --ignore-scripts --silent meta -- tasks startup') ||
        text.includes('npm run --silent meta -- tasks startup') ||
        text.includes('node readme/meta/framework-data/cli.mjs startup'));
  }
  if (relative !== 'readme/tasks/README.md' || !text.startsWith('# Task Store\n')) return false;
  return (text.includes('npm run --ignore-scripts --silent meta -- tasks doctor') &&
      text.includes('npm run --ignore-scripts --silent meta -- tasks startup')) ||
    (text.includes('npm run --silent meta -- tasks doctor') &&
      text.includes('npm run --silent meta -- tasks startup')) ||
    (text.includes('node readme/meta/framework-data/cli.mjs doctor') &&
      text.includes('node readme/meta/framework-data/cli.mjs startup'));
}

function recognizedPreservedBytes(relative, bytes) {
  const text = decodeSafeDocument(bytes);
  if (text === null) return false;
  if (relative === 'AGENTS.md') return canonicalBlockState(text, 'codex') === 'recognized';
  if (relative === 'CLAUDE.md') return canonicalBlockState(text, 'claude') === 'recognized';
  return recognizedStateDocument(relative, text);
}

async function bootstrapState(root, relative, harness) {
  const read = await readSafeFile(root, relative, PROJECT_INIT_LIMITS.clientInstructionBytes);
  if (read.state !== 'read') return read.state;
  return canonicalBlockState(read.text, harness);
}

function validateScriptContract(runtime) {
  const scripts = runtime.clientManifest?.scripts;
  return scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts) &&
    scripts.meta === META_SCRIPT && !Object.hasOwn(scripts, 'premeta') && !Object.hasOwn(scripts, 'postmeta');
}

function refreshClientRuntime(runtime) {
  const previous = unwrapValidatedClientRuntime(runtime);
  const packageRuntime = readPackageIdentity(import.meta.url);
  const refreshed = validateClientRuntimeRoots({
    packageRuntime,
    context: previous.context,
    entryPath: path.join(packageRuntime.packageRoot, 'bin', 'meta-framework.mjs'),
  });
  if (refreshed.clientRoot !== previous.clientRoot || refreshed.packageRoot !== previous.packageRoot ||
      refreshed.mode !== previous.mode || refreshed.identity.name !== previous.identity.name ||
      refreshed.identity.version !== previous.identity.version) {
    fail('CLIENT_METADATA_CHANGED', 'validated package or client identity changed', 4);
  }
  return refreshed;
}

function mapDisposition(mode, bootstraps, taskState, stageCount, scriptValid, stateDocumentsValid) {
  const taskIssue = taskState.issue === null || taskState.issue === undefined
    ? null : issue(taskState.issue);
  if (mode === 'source') return { disposition: 'source_repository', issue: issue('installed_package_required') };
  if (!scriptValid) return { disposition: 'malformed', issue: issue('client_script_contract') };
  if (taskState.disposition === 'busy') return { disposition: 'busy', issue: taskIssue };
  if (stageCount !== 0) return { disposition: 'prepared', issue: issue('initializer_transaction_present') };
  if (Object.values(bootstraps).includes('collision')) {
    return { disposition: 'bootstrap_collision', issue: issue('bootstrap_collision') };
  }
  if (!stateDocumentsValid) {
    return { disposition: 'collision', issue: issue('project_state_collision') };
  }
  if (taskState.disposition === 'uninitialized') {
    return { disposition: 'fresh', issue: taskIssue };
  }
  if (taskState.disposition === 'ready_to_initialize') {
    return { disposition: 'ready_to_initialize', issue: taskIssue };
  }
  if (taskState.disposition === 'valid_current_store') {
    const allRecognized = Object.values(bootstraps).every((state) => state === 'recognized');
    return {
      disposition: allRecognized ? 'valid_current_project' : 'ready_to_add_bootstraps',
      issue: taskIssue,
    };
  }
  return {
    disposition: taskState.disposition,
    issue: taskIssue ?? issue(`task_state_${taskState.disposition}`),
  };
}

async function rawPreflight(runtime, { ignoreProjectStage = false, taskLockHeld = false } = {}) {
  await assertLinuxFdBoundary();
  const validated = refreshClientRuntime(runtime);
  const bootstraps = Object.freeze({
    'AGENTS.md': await bootstrapState(validated.clientRoot, 'AGENTS.md', 'codex'),
    'CLAUDE.md': await bootstrapState(validated.clientRoot, 'CLAUDE.md', 'claude'),
  });
  let stages = [];
  if (!ignoreProjectStage) {
    const rootDirectory = await openRootBoundary(validated.clientRoot);
    try {
      stages = await listStagesAnchored(rootDirectory);
    } finally {
      await closeDirectory(rootDirectory);
    }
  }
  let taskState;
  if (validated.mode === 'source') {
    taskState = { disposition: 'source', integrity: 'not-checked', issue: null };
  } else {
    try {
      const lock = taskLockHeld ? { held: false } : await inspectLock(validated.context);
      taskState = lock.held
        ? { disposition: 'busy', integrity: 'not-checked', issue: 'LOCK_BUSY' }
        : await preflightTaskStore(validated.context, validated.packageRoot,
          taskLockHeld ? { lockHeld: true } : { readOnly: true });
    } catch (error) {
      if (error?.code === 'LOCK_BUSY' || error?.code === 'LOCK_FAILED' || error?.code === 'LOCK_OWNERSHIP') {
        fail(error.code, 'the shared project lock is unavailable', 5);
      }
      if (typeof error?.code === 'string') {
        fail(error.code, 'project task state is unsafe', 4);
      }
      throw error;
    }
  }
  let stateDocumentsValid = true;
  if (['ready_to_initialize', 'valid_current_store'].includes(taskState.disposition)) {
    const cursor = await readSafeFile(validated.clientRoot, 'readme/README.md',
      PROJECT_INIT_LIMITS.stateDocumentBytes);
    const entrypoint = await readSafeFile(validated.clientRoot, 'readme/tasks/README.md',
      PROJECT_INIT_LIMITS.stateDocumentBytes);
    stateDocumentsValid = cursor.state === 'read' &&
      recognizedStateDocument('readme/README.md', cursor.text) && entrypoint.state === 'read' &&
      recognizedStateDocument('readme/tasks/README.md', entrypoint.text);
  }
  const mapped = mapDisposition(validated.mode, bootstraps, taskState, stages.length,
    validateScriptContract(validated), stateDocumentsValid);
  return { validated, bootstraps, taskState, stages, ...mapped };
}

export async function projectPreflight(runtime) {
  const preflight = await rawPreflight(runtime);
  return deepFreeze({
    schemaVersion: 1,
    package: {
      name: preflight.validated.identity.name,
      version: preflight.validated.identity.version,
    },
    projectInit: {
      version: PROJECT_INIT_COMPATIBILITY.version,
      disposition: preflight.disposition,
      bootstrapVersion: PROJECT_INIT_COMPATIBILITY.bootstrapVersions[0],
      stateTemplateVersion: PROJECT_INIT_COMPATIBILITY.stateTemplateVersions[0],
      bootstraps: preflight.bootstraps,
      taskState: preflight.taskState.disposition,
      issue: preflight.issue,
    },
  });
}

export const preflightProject = projectPreflight;

const DIRECTORY_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) |
  (fs.constants.O_NOFOLLOW ?? 0);
const READ_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);

async function assertLinuxFdBoundary() {
  if (process.platform !== 'linux') {
    fail('PLATFORM_UNSUPPORTED', 'project initialization requires Linux descriptor paths');
  }
  const info = await fs.lstat('/proc/self/fd').catch(() => null);
  if (info === null || !info.isDirectory() || info.isSymbolicLink()) {
    fail('PLATFORM_UNSUPPORTED', 'Linux descriptor paths are unavailable');
  }
}

function anchored(directory, name = '') {
  if (name.includes('/') || name === '.' || name === '..' || name.includes('\0')) {
    fail('INITIALIZATION_INTERNAL', 'an anchored final path component is invalid', 1);
  }
  return name === '' ? directory.anchor : `${directory.anchor}/${name}`;
}

function directoryIdentity(info) {
  return { dev: String(info.dev), ino: String(info.ino), mode: info.mode & 0o7777 };
}

function fileIdentity(info, bytes) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    mode: info.mode & 0o7777,
    size: info.size,
    digest: sha256(bytes),
  };
}

async function syncHandle(handle) {
  try {
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF', 'EISDIR'].includes(error.code)) throw error;
  }
}

async function openRootBoundary(root) {
  await assertLinuxFdBoundary();
  const lexical = path.resolve(root);
  let handle;
  try {
    handle = await fs.open(lexical, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const named = await fs.lstat(lexical);
    const anchor = `/proc/self/fd/${handle.fd}`;
    const resolved = await fs.realpath(anchor);
    if (!opened.isDirectory() || !safeMode(opened, 'directory') || named.isSymbolicLink() || !named.isDirectory() ||
        opened.dev !== named.dev || opened.ino !== named.ino || resolved !== lexical) {
      fail('PATH_UNSAFE', 'the client root changed during descriptor anchoring');
    }
    return { handle, anchor, lexical, identity: directoryIdentity(opened) };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ProjectInitializerError) throw error;
    fail('PATH_UNSAFE', 'the client root cannot be descriptor-anchored');
  }
}

async function openChildDirectory(parent, name, lexical) {
  let handle;
  try {
    handle = await fs.open(anchored(parent, name), DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const named = await fs.lstat(anchored(parent, name));
    const anchor = `/proc/self/fd/${handle.fd}`;
    const resolved = await fs.realpath(anchor);
    if (!opened.isDirectory() || !safeMode(opened, 'directory') || named.isSymbolicLink() || !named.isDirectory() ||
        opened.dev !== named.dev || opened.ino !== named.ino || resolved !== lexical) {
      fail('PATH_UNSAFE', 'a client directory changed during descriptor anchoring');
    }
    return { handle, anchor, lexical, identity: directoryIdentity(opened) };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ProjectInitializerError) throw error;
    fail('PATH_UNSAFE', 'a client directory cannot be descriptor-anchored');
  }
}

async function verifyDirectory(directory, { requireName = true } = {}) {
  const opened = await directory.handle.stat().catch(() => null);
  if (opened === null || !opened.isDirectory() || String(opened.dev) !== directory.identity.dev ||
      String(opened.ino) !== directory.identity.ino || (opened.mode & 0o7777) !== directory.identity.mode ||
      !safeMode(opened, 'directory')) return false;
  if (!requireName) return true;
  const named = await fs.lstat(directory.lexical).catch(() => null);
  if (named === null || named.isSymbolicLink() || !named.isDirectory() ||
      String(named.dev) !== directory.identity.dev || String(named.ino) !== directory.identity.ino ||
      (named.mode & 0o7777) !== directory.identity.mode) return false;
  return await fs.realpath(directory.anchor).catch(() => null) === directory.lexical;
}

async function setDirectoryMode(directory, mode) {
  await directory.handle.chmod(mode);
  const info = await directory.handle.stat();
  directory.identity = directoryIdentity(info);
  if (directory.identity.mode !== mode || !await verifyDirectory(directory)) {
    fail('PATH_UNSAFE', 'a created directory mode cannot be established', 1);
  }
}

async function closeDirectory(directory) {
  await directory?.handle?.close().catch(() => {});
}

async function listStagesAnchored(rootDirectory) {
  if (!await verifyDirectory(rootDirectory)) fail('PATH_UNSAFE', 'the client root identity changed');
  const stages = [];
  let handle;
  try {
    handle = await fs.opendir(rootDirectory.anchor);
    let count = 0;
    for await (const entry of handle) {
      count += 1;
      if (count > 100_000) fail('PATH_UNSAFE', 'client root inventory exceeds the supported limit');
      if (!entry.name.startsWith(STAGE_PREFIX)) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink() || !STAGE_PATTERN.test(entry.name)) {
        fail('INITIALIZATION_PREPARED', 'initializer stage path is unsafe');
      }
      stages.push(entry.name);
      if (stages.length > 1) fail('INITIALIZATION_PREPARED', 'multiple initializer stages require review');
    }
  } finally {
    await handle?.close().catch(() => {});
  }
  return stages;
}

async function writeExclusiveAt(directory, name, text, mode) {
  let handle;
  let created = false;
  try {
    if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'an anchored file parent changed', 1);
    handle = await fs.open(anchored(directory, name), fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), mode);
    created = true;
    await handle.chmod(mode);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    const opened = await handle.stat();
    const named = await fs.lstat(anchored(directory, name));
    if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || !named.isFile() ||
        opened.dev !== named.dev || opened.ino !== named.ino || opened.size !== named.size ||
        (named.mode & 0o7777) !== mode) {
      fail('PATH_UNSAFE', 'an anchored file changed during exclusive creation', 1);
    }
    await syncHandle(directory.handle);
    if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'an anchored file parent changed', 1);
    return fileIdentity(opened, Buffer.from(text, 'utf8'));
  } catch (error) {
    if (created) {
      const opened = await handle?.stat().catch(() => null);
      const named = await fs.lstat(anchored(directory, name)).catch(() => null);
      if (opened !== null && named !== null && !named.isSymbolicLink() && named.isFile() &&
          opened.dev === named.dev && opened.ino === named.ino) {
        await fs.unlink(anchored(directory, name)).catch(() => {});
        await syncHandle(directory.handle).catch(() => {});
      }
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readFileAt(directory, name, { mode = null, links = null, maxBytes = 1_048_576 } = {}) {
  const before = await fs.lstat(anchored(directory, name)).catch(() => null);
  if (before === null || before.isSymbolicLink() || !before.isFile() || before.size < 1 ||
      before.size > maxBytes || (mode !== null && (before.mode & 0o7777) !== mode) ||
      (links !== null && before.nlink !== links)) return null;
  let handle;
  try {
    handle = await fs.open(anchored(directory, name), READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size || (opened.mode & 0o7777) !== (before.mode & 0o7777) ||
        (links !== null && opened.nlink !== links)) return null;
    const bytes = await handle.readFile();
    const after = await fs.lstat(anchored(directory, name)).catch(() => null);
    if (after === null || after.isSymbolicLink() || !after.isFile() || after.dev !== opened.dev ||
        after.ino !== opened.ino || after.size !== opened.size ||
        (after.mode & 0o7777) !== (opened.mode & 0o7777) ||
        (links !== null && after.nlink !== links) || bytes.length !== opened.size) return null;
    return { bytes, identity: fileIdentity(opened, bytes), info: opened };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function exactFileAt(directory, name, expected, { links = null, mode = null } = {}) {
  const read = await readFileAt(directory, name, { links, mode, maxBytes: Math.max(expected.size, 1) });
  return read !== null && JSON.stringify(read.identity) === JSON.stringify({
    dev: expected.dev, ino: expected.ino, mode: expected.mode, size: expected.size,
    digest: expected.digest,
  });
}

async function exactIdentity(file, expected, { links = null } = {}) {
  const parent = await openRootBoundary(path.dirname(file)).catch(() => null);
  if (parent === null) return false;
  try {
    return await exactFileAt(parent, path.basename(file), expected, { links });
  } finally {
    await closeDirectory(parent);
  }
}

async function openJournalAt(stage, create = false) {
  const flags = fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0) |
    (create ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0);
  const handle = await fs.open(anchored(stage, 'journal.json'), flags, 0o600)
    .catch(() => fail('INITIALIZATION_PREPARED', 'initializer journal cannot be opened safely'));
  if (create) await handle.chmod(0o600);
  const info = await handle.stat();
  const named = await fs.lstat(anchored(stage, 'journal.json')).catch(() => null);
  if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o7777) !== 0o600 ||
      named === null || named.isSymbolicLink() || !named.isFile() || named.dev !== info.dev ||
      named.ino !== info.ino || named.size !== info.size) {
    await handle.close().catch(() => {});
    fail('INITIALIZATION_PREPARED', 'initializer journal is unsafe');
  }
  return handle;
}

async function writeJournal(transaction) {
  if (!await verifyDirectory(transaction.stage)) fail('PATH_UNSAFE', 'initializer stage identity changed', 1);
  const text = canonicalJson(transaction.journal);
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > PROJECT_INIT_LIMITS.envelopeBytes) {
    fail('INITIALIZATION_INTERNAL', 'initializer journal exceeds its v1 limit', 1);
  }
  await transaction.journalHandle.truncate(0);
  let offset = 0;
  while (offset < bytes.length) {
    const written = await transaction.journalHandle.write(bytes, offset, bytes.length - offset, offset);
    if (written.bytesWritten < 1) fail('INITIALIZATION_IO', 'initializer journal write stalled', 1);
    offset += written.bytesWritten;
  }
  await transaction.journalHandle.sync();
  const info = await transaction.journalHandle.stat();
  const named = await fs.lstat(anchored(transaction.stage, 'journal.json')).catch(() => null);
  if (named === null || named.isSymbolicLink() || !named.isFile() || named.nlink !== 1 ||
      named.dev !== info.dev || named.ino !== info.ino || named.size !== bytes.length) {
    fail('PATH_UNSAFE', 'initializer journal identity changed', 1);
  }
  await syncHandle(transaction.stage.handle);
  if (!await verifyDirectory(transaction.stage)) fail('PATH_UNSAFE', 'initializer stage identity changed', 1);
}

function exactObjectKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key, index) => key === keys[index]);
}

function validDirectoryIdentity(value) {
  return exactObjectKeys(value, ['dev', 'ino', 'mode']) && typeof value.dev === 'string' && /^\d+$/u.test(value.dev) &&
    typeof value.ino === 'string' && /^\d+$/u.test(value.ino) && Number.isSafeInteger(value.mode) &&
    value.mode >= 0 && value.mode <= 0o7777 && (value.mode & 0o7022) === 0;
}

function validIdentity(value, { pathKey = false } = {}) {
  const keys = pathKey
    ? ['path', 'dev', 'ino', 'mode', 'size', 'digest']
    : ['dev', 'ino', 'mode', 'size', 'digest'];
  return exactObjectKeys(value, keys) && (!pathKey || typeof value.path === 'string') &&
    typeof value.dev === 'string' && /^\d+$/u.test(value.dev) &&
    typeof value.ino === 'string' && /^\d+$/u.test(value.ino) &&
    Number.isSafeInteger(value.mode) && value.mode >= 0 && value.mode <= 0o7777 &&
    (value.mode & 0o7133) === 0 &&
    Number.isSafeInteger(value.size) && value.size >= 1 &&
    typeof value.digest === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value.digest);
}

async function snapshotMetadata(validated) {
  const relativeFiles = [
    ['client', validated.clientRoot, 'package.json'],
    ['client', validated.clientRoot, 'package-lock.json'],
    ['package', validated.packageRoot, 'package.json'],
  ];
  const snapshots = [];
  for (const [scope, root, relative] of relativeFiles) {
    if (validated.mode === 'source' && relative === 'package-lock.json') continue;
    const parent = await openRootBoundary(root);
    try {
      const read = await readFileAt(parent, relative, { links: 1 });
      if (read === null || !safeMode(read.info, 'file')) fail('CLIENT_METADATA', 'required metadata is unsafe');
      snapshots.push({ scope, relative, target: path.join(root, relative), identity: read.identity, bytes: read.bytes });
    } finally {
      await closeDirectory(parent);
    }
  }
  return snapshots;
}

async function verifyMetadata(metadata) {
  for (const record of metadata) {
    if (!await exactIdentity(record.target, record.identity, { links: 1 })) {
      fail('CLIENT_METADATA_CHANGED', 'package or client metadata changed during initialization', 1);
    }
  }
}

async function bindCurrentMetadata(runtime) {
  const validated = refreshClientRuntime(runtime);
  const metadata = await snapshotMetadata(validated);
  const bytes = (scope, relative) => metadata
    .find((record) => record.scope === scope && record.relative === relative)?.bytes ?? null;
  const snapshot = validateClientRuntimeMetadataSnapshot(validated, {
    packageManifestBytes: bytes('package', 'package.json'),
    clientManifestBytes: bytes('client', 'package.json'),
    clientLockBytes: bytes('client', 'package-lock.json'),
  });
  if (!validateScriptContract(snapshot)) {
    fail('CLIENT_METADATA_CHANGED', 'the snapshotted client script contract is unsafe', 4);
  }
  const confirmed = refreshClientRuntime(runtime);
  if (confirmed.clientRoot !== validated.clientRoot || confirmed.packageRoot !== validated.packageRoot ||
      confirmed.mode !== validated.mode) {
    fail('CLIENT_METADATA_CHANGED', 'package or client roots changed during validation', 4);
  }
  await verifyMetadata(metadata);
  return { validated: confirmed, metadata };
}

function parentKeyFor(relative) {
  if (!relative.includes('/')) return '';
  return relative.startsWith('readme/tasks/') ? 'readme/tasks' : 'readme';
}

function baseFor(relative) {
  return relative.endsWith('/') ? path.posix.basename(relative.slice(0, -1)) : path.posix.basename(relative);
}

async function absentAt(directory, name) {
  return await fs.lstat(anchored(directory, name)).then(() => false,
    (error) => error.code === 'ENOENT' ? true : Promise.reject(error));
}

async function ensureParent(transaction, key) {
  if (transaction.parents.has(key)) {
    const existing = transaction.parents.get(key);
    if (!await verifyDirectory(existing)) fail('PATH_UNSAFE', 'a held destination parent changed', 1);
    return existing;
  }
  const parentKey = key === 'readme' ? '' : 'readme';
  const parent = await ensureParent(transaction, parentKey);
  const name = key === 'readme' ? 'readme' : 'tasks';
  const lexical = path.join(transaction.root.lexical, ...key.split('/'));
  const existing = await fs.lstat(anchored(parent, name)).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (existing === null) {
    try {
      await fs.mkdir(anchored(parent, name), { mode: 0o755 });
    } catch (error) {
      if (error.code === 'EEXIST') fail('DESTINATION_COLLISION', 'an initializer directory appeared');
      fail('INITIALIZATION_IO', 'an initializer directory cannot be created', 1);
    }
    const directory = await openChildDirectory(parent, name, lexical);
    await setDirectoryMode(directory, 0o755);
    await syncHandle(directory.handle);
    transaction.parents.set(key, directory);
    transaction.journal.directories.push({ path: key, ...directory.identity });
    await syncHandle(parent.handle);
    await writeJournal(transaction);
    return directory;
  }
  const directory = await openChildDirectory(parent, name, lexical);
  if (transaction.journal !== null) {
    const ownership = [...(transaction.journal.parentBaseline ?? []), ...transaction.journal.directories]
      .find((record) => record.path === key);
    if (ownership === undefined || JSON.stringify(directory.identity) !== JSON.stringify({
      dev: ownership.dev, ino: ownership.ino, mode: ownership.mode,
    })) {
      await closeDirectory(directory);
      fail('DESTINATION_COLLISION', 'an unowned destination parent appeared');
    }
  }
  if (!safeMode(await directory.handle.stat(), 'directory')) {
    await closeDirectory(directory);
    fail('PATH_UNSAFE', 'a destination parent mode is unsafe');
  }
  transaction.parents.set(key, directory);
  return directory;
}

async function openRequiredParents(transaction, planned = transaction.journal.planned,
  preserved = transaction.journal.preserved) {
  const needsReadme = [...planned, ...preserved]
    .some((entry) => entry.startsWith('readme/'));
  if (!needsReadme) return;
  const readmeExists = await fs.lstat(anchored(transaction.root, 'readme')).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error));
  if (readmeExists !== null) await ensureParent(transaction, 'readme');
  const tasksNeeded = [...planned, ...preserved]
    .some((entry) => entry.startsWith('readme/tasks/'));
  if (tasksNeeded && transaction.parents.has('readme')) {
    const tasksExists = await fs.lstat(anchored(transaction.parents.get('readme'), 'tasks')).catch((error) =>
      error.code === 'ENOENT' ? null : Promise.reject(error));
    if (tasksExists !== null) await ensureParent(transaction, 'readme/tasks');
  }
}

async function preservedIdentitiesAnchored(transaction, preserved) {
  const records = [];
  for (const relative of preserved.filter((entry) => entry !== 'readme/tasks/store/')) {
    const parent = await ensureParent(transaction, parentKeyFor(relative));
    const read = await readFileAt(parent, baseFor(relative), {
      links: 1,
      maxBytes: relative === 'AGENTS.md' || relative === 'CLAUDE.md'
        ? PROJECT_INIT_LIMITS.clientInstructionBytes : PROJECT_INIT_LIMITS.stateDocumentBytes,
    });
    if (read === null || !safeMode(read.info, 'file') || !recognizedPreservedBytes(relative, read.bytes)) {
      fail('INITIALIZATION_UNSAFE', 'a preserved project file is unsafe or unrecognized');
    }
    records.push({ path: relative, ...read.identity });
  }
  return records;
}

function readinessPreservedPaths(readiness) {
  const preserved = CREATED_PATH_ORDER.slice(0, 2)
    .filter((relative) => readiness.bootstraps[relative] === 'recognized');
  if (['ready_to_initialize', 'valid_current_store'].includes(readiness.taskState.disposition)) {
    preserved.push('readme/README.md', 'readme/tasks/README.md');
  }
  if (readiness.taskState.disposition === 'valid_current_store') {
    preserved.push('readme/tasks/store/');
  }
  return preserved;
}

async function captureReadinessEvidence(transaction, readiness) {
  const preserved = readinessPreservedPaths(readiness);
  await openRequiredParents(transaction, [], preserved);
  const files = await preservedIdentitiesAnchored(transaction, preserved);
  const storeOwnership = preserved.includes('readme/tasks/store/')
    ? await capturePreservedStoreOwnership(transaction) : null;
  const storeDigest = storeOwnership === null
    ? null : (await loadStore(transaction.validated.context)).digest;
  if (storeOwnership !== null && !await validatePreservedStoreOwnership(transaction, storeOwnership)) {
    fail('INITIALIZATION_UNSAFE', 'the task store changed during readiness capture');
  }
  return { files, storeOwnership, storeDigest };
}

async function verifyReadinessEvidence(transaction, evidence) {
  for (const record of evidence.files) {
    const parent = transaction.parents.get(parentKeyFor(record.path));
    if (!parent || !await exactFileAt(parent, baseFor(record.path), record, { links: 1 })) {
      fail('FINAL_STATE_INVALID', 'a readiness-authorized project file changed', 4);
    }
  }
  if (evidence.storeOwnership !== null &&
      (!await validatePreservedStoreOwnership(transaction, evidence.storeOwnership) ||
        (await loadStore(transaction.validated.context)).digest !== evidence.storeDigest)) {
    fail('FINAL_STATE_INVALID', 'the readiness-authorized task store changed', 4);
  }
  for (const directory of transaction.parents.values()) {
    if (!await verifyDirectory(directory)) {
      fail('PATH_UNSAFE', 'a readiness-authorized project directory changed', 4);
    }
  }
}

async function createStage(transaction, lockToken, packageIdentity, metadata,
  planned, preserved, preservedIdentities, preservedStoreOwnership, preservedStoreDigest) {
  if (typeof lockToken !== 'string' || !STAGE_PATTERN.test(`${STAGE_PREFIX}${lockToken}`)) {
    fail('LOCK_OWNERSHIP', 'the shared lock token is invalid', 5);
  }
  if (!await verifyDirectory(transaction.root)) fail('PATH_UNSAFE', 'the client root identity changed', 1);
  const stageName = `${STAGE_PREFIX}${lockToken}`;
  await fs.mkdir(anchored(transaction.root, stageName), { mode: 0o700 })
    .catch((error) => error.code === 'EEXIST'
      ? fail('INITIALIZATION_PREPARED', 'an initializer stage already exists')
      : fail('INITIALIZATION_IO', 'initializer stage cannot be created', 1));
  let stage;
  try {
    stage = await openChildDirectory(transaction.root, stageName,
      path.join(transaction.root.lexical, stageName));
  } catch (error) {
    await fs.rmdir(anchored(transaction.root, stageName)).catch(() => {});
    throw error;
  }
  transaction.stageName = stageName;
  transaction.stage = stage;
  try {
    await setDirectoryMode(stage, 0o700);
    await syncHandle(stage.handle);
    await syncHandle(transaction.root.handle);
    transaction.journal = {
      schemaVersion: 1,
      transactionId: lockToken,
      package: { name: packageIdentity.name, version: packageIdentity.version },
      planned,
      preserved,
      metadata: metadata.map(({ scope, relative, identity }) => ({ scope, path: relative, ...identity })),
      preservedIdentities,
      preservedStoreOwnership,
      preservedStoreDigest,
      parentBaseline: [...transaction.parents.entries()].filter(([key]) => key !== '')
        .map(([key, directory]) => ({ path: key, ...directory.identity })),
      directories: [],
      claimed: [],
      storeOwnership: null,
      storeDigest: null,
    };
    for (const relative of planned.filter((entry) => entry !== 'readme/tasks/store/')) {
      await writeExclusiveAt(stage, relative.replaceAll('/', '__'), FILES[relative], 0o644);
    }
    transaction.journalHandle = await openJournalAt(stage, true);
    await writeJournal(transaction);
    transaction.adopted = true;
  } catch (error) {
    const cleaned = await cleanupPartialStage(transaction).catch(() => false);
    if (!cleaned) transaction.recoveryRequired = true;
    throw error;
  }
}

async function cleanupPartialStage(transaction) {
  if (!transaction.stage || !await verifyDirectory(transaction.root) ||
      !await verifyDirectory(transaction.stage)) return false;
  const names = [];
  let scan;
  try {
    scan = await fs.opendir(transaction.stage.anchor);
    for await (const entry of scan) {
      if (!entry.isFile() || entry.isSymbolicLink() || names.length >= PROJECT_INIT_LIMITS.stageEntries) return false;
      names.push(entry.name);
    }
  } finally {
    await scan?.close().catch(() => {});
  }
  let complete = true;
  for (const name of names.filter((entry) => entry !== 'journal.json')) {
    await fs.unlink(anchored(transaction.stage, name)).catch(() => { complete = false; });
    if (!await absentAt(transaction.stage, name).catch(() => false)) complete = false;
  }
  if (!complete) return false;
  await transaction.journalHandle?.close().catch(() => { complete = false; });
  if (!complete) return false;
  transaction.journalHandle = null;
  if (names.includes('journal.json')) {
    await fs.unlink(anchored(transaction.stage, 'journal.json')).catch(() => { complete = false; });
    if (!await absentAt(transaction.stage, 'journal.json').catch(() => false)) complete = false;
  }
  if (!complete) return false;
  await fs.rmdir(anchored(transaction.root, transaction.stageName)).catch(() => { complete = false; });
  if (!await absentAt(transaction.root, transaction.stageName).catch(() => false)) complete = false;
  await syncHandle(transaction.root.handle).catch(() => { complete = false; });
  await closeDirectory(transaction.stage);
  transaction.stage = null;
  return complete;
}

async function parseJournal(transaction, expectedToken) {
  const handle = transaction.journalHandle;
  const info = await handle.stat();
  if (info.size < 2 || info.size > PROJECT_INIT_LIMITS.envelopeBytes) {
    fail('INITIALIZATION_PREPARED', 'initializer journal size is invalid');
  }
  const bytes = Buffer.alloc(info.size);
  const read = await handle.read(bytes, 0, bytes.length, 0);
  if (read.bytesRead !== bytes.length) fail('INITIALIZATION_PREPARED', 'initializer journal is incomplete');
  let text;
  let journal;
  try {
    text = UTF8.decode(bytes);
    if (text.includes('\r') || CONTROL_TEXT.test(text)) throw new Error('unsafe');
    journal = JSON.parse(text);
  } catch {
    fail('INITIALIZATION_PREPARED', 'initializer journal is malformed');
  }
  const keys = ['schemaVersion', 'transactionId', 'package', 'planned', 'preserved', 'metadata',
    'preservedIdentities', 'preservedStoreOwnership', 'preservedStoreDigest', 'parentBaseline',
    'directories', 'claimed',
    'storeOwnership', 'storeDigest'];
  if (!exactObjectKeys(journal, keys) || canonicalJson(journal) !== text || journal.schemaVersion !== 1 ||
      journal.transactionId !== expectedToken) {
    fail('INITIALIZATION_PREPARED', 'initializer journal provenance is invalid');
  }
  return journal;
}

async function claimFile(transaction, relative, options) {
  const parent = await ensureParent(transaction, parentKeyFor(relative));
  const destination = baseFor(relative);
  const stagedName = relative.replaceAll('/', '__');
  if (!await verifyDirectory(parent) || !await verifyDirectory(transaction.stage)) {
    fail('PATH_UNSAFE', 'an anchored transaction directory changed', 1);
  }
  await runHook(options, `beforeClaim:${relative}`);
  const stagedBefore = await readFileAt(transaction.stage, stagedName, { mode: 0o644, links: 1,
    maxBytes: PROJECT_INIT_LIMITS.stateDocumentBytes });
  if (stagedBefore === null || stagedBefore.identity.digest !== sha256(Buffer.from(FILES[relative], 'utf8'))) {
    fail('PATH_UNSAFE', 'staged content changed before claim', 1);
  }
  if (await fs.lstat(anchored(parent, destination)).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)) !== null) {
    fail('DESTINATION_COLLISION', 'an initializer destination appeared');
  }
  await fs.link(anchored(transaction.stage, stagedName), anchored(parent, destination)).catch((error) => {
    if (error.code === 'EEXIST') fail('DESTINATION_COLLISION', 'an initializer destination appeared');
    fail('INITIALIZATION_IO', 'an initializer destination cannot be claimed', 1);
  });
  transaction.journal.claimed.push({ path: relative, ...stagedBefore.identity });
  const staged = await readFileAt(transaction.stage, stagedName, { mode: 0o644, links: 2,
    maxBytes: PROJECT_INIT_LIMITS.stateDocumentBytes });
  const claimed = await readFileAt(parent, destination, { mode: 0o644, links: 2,
    maxBytes: PROJECT_INIT_LIMITS.stateDocumentBytes });
  if (staged === null || claimed === null || JSON.stringify(staged.identity) !== JSON.stringify(claimed.identity) ||
      claimed.identity.digest !== sha256(Buffer.from(FILES[relative], 'utf8'))) {
    fail('PATH_UNSAFE', 'an anchored file claim changed during creation', 1);
  }
  if (!await verifyDirectory(parent) || !await verifyDirectory(transaction.stage)) {
    fail('PATH_UNSAFE', 'an anchored transaction directory changed after a file claim', 1);
  }
  await syncHandle(parent.handle);
  await runHook(options, `afterClaimBeforeJournal:${relative}`);
  await writeJournal(transaction);
}

async function createEmptyStore(transaction) {
  const tasks = await ensureParent(transaction, 'readme/tasks');
  if (await fs.lstat(anchored(tasks, 'store')).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)) !== null) {
    fail('DESTINATION_COLLISION', 'task store destination appeared');
  }
  await fs.mkdir(anchored(tasks, 'store'), { mode: 0o755 }).catch((error) => {
    if (error.code === 'EEXIST') fail('DESTINATION_COLLISION', 'task store destination appeared');
    fail('INITIALIZATION_IO', 'task store cannot be claimed', 1);
  });
  let store;
  try {
    store = await openChildDirectory(tasks, 'store', path.join(tasks.lexical, 'store'));
  } catch (error) {
    await fs.rmdir(anchored(tasks, 'store')).catch(() => {});
    throw error;
  }
  await setDirectoryMode(store, 0o755);
  transaction.store = store;
  transaction.journal.storeOwnership = { root: store.identity, records: null, control: null };
  await fs.mkdir(anchored(store, 'records'), { mode: 0o755 });
  let records;
  try {
    records = await openChildDirectory(store, 'records', path.join(store.lexical, 'records'));
  } catch (error) {
    await fs.rmdir(anchored(store, 'records')).catch(() => {});
    throw error;
  }
  await setDirectoryMode(records, 0o755);
  transaction.records = records;
  transaction.journal.storeOwnership.records = records.identity;
  const control = await writeExclusiveAt(store, 'control.json', EMPTY_CONTROL, 0o644);
  transaction.journal.storeOwnership.control = control;
  await syncHandle(records.handle);
  await syncHandle(store.handle);
  await syncHandle(tasks.handle);
  await writeJournal(transaction);
  const loaded = await loadStore(transaction.validated.context);
  transaction.journal.storeDigest = loaded.digest;
  await writeJournal(transaction);
  return loaded;
}

async function boundedAnchoredEntries(directory, limit) {
  if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'a task-store directory changed');
  const entries = [];
  let scan;
  try {
    scan = await fs.opendir(directory.anchor);
    for await (const entry of scan) {
      entries.push(entry);
      if (entries.length > limit) fail('INITIALIZATION_UNSAFE', 'task-store inventory exceeds its bound');
    }
  } finally {
    await scan?.close().catch(() => {});
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function hashStoreIdentity(hash, kind, relative, identity) {
  hash.update(canonicalJson({ kind, path: relative, ...identity }), 'utf8');
}

async function capturePreservedStoreOwnership(transaction) {
  const tasks = await ensureParent(transaction, 'readme/tasks');
  if (transaction.store !== null || transaction.records !== null) {
    if (transaction.store === null || transaction.records === null ||
        !await verifyDirectory(transaction.store) || !await verifyDirectory(transaction.records)) {
      fail('INITIALIZATION_UNSAFE', 'the preserved task store changed');
    }
  } else {
    let store;
    let records;
    try {
      store = await openChildDirectory(tasks, 'store', path.join(tasks.lexical, 'store'));
      records = await openChildDirectory(store, 'records', path.join(store.lexical, 'records'));
      transaction.store = store;
      transaction.records = records;
    } catch (error) {
      await closeDirectory(records);
      await closeDirectory(store);
      throw error;
    }
  }

  const storeEntries = await boundedAnchoredEntries(transaction.store, 2);
  if (storeEntries.length !== 2 || storeEntries[0].name !== 'control.json' ||
      !storeEntries[0].isFile() || storeEntries[0].isSymbolicLink() ||
      storeEntries[1].name !== 'records' || !storeEntries[1].isDirectory() ||
      storeEntries[1].isSymbolicLink()) {
    fail('INITIALIZATION_UNSAFE', 'the preserved task-store root inventory is invalid');
  }
  const control = await readFileAt(transaction.store, 'control.json', {
    links: 1,
    maxBytes: MAX_RECORD_BYTES,
  });
  if (control === null || !safeMode(control.info, 'file')) {
    fail('INITIALIZATION_UNSAFE', 'the preserved task-store control record is unsafe');
  }

  const hash = createHash('sha256');
  hash.update('meta-framework-preserved-store-identity-v1\0', 'utf8');
  hashStoreIdentity(hash, 'directory', '.', transaction.store.identity);
  hashStoreIdentity(hash, 'directory', 'records', transaction.records.identity);
  hashStoreIdentity(hash, 'file', 'control.json', control.identity);
  const shardEntries = await boundedAnchoredEntries(transaction.records, MAX_RECORDS);
  let recordCount = 0;
  for (const shardEntry of shardEntries) {
    if (!shardEntry.isDirectory() || shardEntry.isSymbolicLink() || !/^\d{4,}$/u.test(shardEntry.name) ||
        String(Number(shardEntry.name)).padStart(4, '0') !== shardEntry.name) {
      fail('INITIALIZATION_UNSAFE', 'the preserved task store contains an invalid shard');
    }
    const shard = await openChildDirectory(transaction.records, shardEntry.name,
      path.join(transaction.records.lexical, shardEntry.name));
    try {
      hashStoreIdentity(hash, 'directory', `records/${shardEntry.name}`, shard.identity);
      const fileEntries = await boundedAnchoredEntries(shard, 1_000);
      if (fileEntries.length === 0) {
        fail('INITIALIZATION_UNSAFE', 'the preserved task store contains an empty shard');
      }
      for (const fileEntry of fileEntries) {
        if (!fileEntry.isFile() || fileEntry.isSymbolicLink() ||
            !/^T-(?:\d{4}|[1-9]\d{4,})\.json$/u.test(fileEntry.name)) {
          fail('INITIALIZATION_UNSAFE', 'the preserved task store contains an invalid record entry');
        }
        const id = fileEntry.name.slice(0, -5);
        if (shardForTaskId(id) !== shardEntry.name) {
          fail('INITIALIZATION_UNSAFE', 'a preserved task record is in the wrong shard');
        }
        const record = await readFileAt(shard, fileEntry.name, { links: 1, maxBytes: MAX_RECORD_BYTES });
        if (record === null || !safeMode(record.info, 'file')) {
          fail('INITIALIZATION_UNSAFE', 'a preserved task record is unsafe');
        }
        hashStoreIdentity(hash, 'file', `records/${shardEntry.name}/${fileEntry.name}`, record.identity);
        recordCount += 1;
        if (recordCount > MAX_RECORDS) {
          fail('INITIALIZATION_UNSAFE', 'the preserved task store exceeds its record bound');
        }
      }
      if (!await verifyDirectory(shard)) fail('PATH_UNSAFE', 'a preserved task shard changed');
    } finally {
      await closeDirectory(shard);
    }
  }
  if (!await verifyDirectory(transaction.store) || !await verifyDirectory(transaction.records)) {
    fail('PATH_UNSAFE', 'the preserved task store changed during capture');
  }
  return {
    root: transaction.store.identity,
    records: transaction.records.identity,
    control: control.identity,
    shardCount: shardEntries.length,
    recordCount,
    inventoryDigest: `sha256:${hash.digest('hex')}`,
  };
}

async function validatePreservedStoreOwnership(transaction, ownership) {
  if (!exactObjectKeys(ownership, [
    'root', 'records', 'control', 'shardCount', 'recordCount', 'inventoryDigest',
  ]) || !validDirectoryIdentity(ownership.root) || !validDirectoryIdentity(ownership.records) ||
      !validIdentity(ownership.control) || !Number.isSafeInteger(ownership.shardCount) ||
      ownership.shardCount < 0 || ownership.shardCount > MAX_RECORDS ||
      !Number.isSafeInteger(ownership.recordCount) || ownership.recordCount < 0 ||
      ownership.recordCount > MAX_RECORDS ||
      typeof ownership.inventoryDigest !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(ownership.inventoryDigest)) return false;
  try {
    return JSON.stringify(await capturePreservedStoreOwnership(transaction)) === JSON.stringify(ownership);
  } catch {
    return false;
  }
}

async function validateCreatedEmptyStoreOwnership(transaction, ownership) {
  if (!exactObjectKeys(ownership, ['root', 'records', 'control']) ||
      !validDirectoryIdentity(ownership.root) || !validDirectoryIdentity(ownership.records) ||
      !validIdentity(ownership.control)) return false;
  const tasks = await ensureParent(transaction, 'readme/tasks');
  const store = await openChildDirectory(tasks, 'store', path.join(tasks.lexical, 'store')).catch(() => null);
  if (store === null) return false;
  let records = null;
  try {
    if (JSON.stringify(store.identity) !== JSON.stringify(ownership.root)) return false;
    records = await openChildDirectory(store, 'records', path.join(store.lexical, 'records')).catch(() => null);
    if (records === null || JSON.stringify(records.identity) !== JSON.stringify(ownership.records) ||
        !await exactFileAt(store, 'control.json', ownership.control, { links: 1, mode: 0o644 })) return false;
    const storeEntries = [];
    const recordEntries = [];
    let storeScan;
    let recordScan;
    try {
      storeScan = await fs.opendir(store.anchor);
      for await (const entry of storeScan) storeEntries.push(entry.name);
      recordScan = await fs.opendir(records.anchor);
      for await (const entry of recordScan) recordEntries.push(entry.name);
    } finally {
      await storeScan?.close().catch(() => {});
      await recordScan?.close().catch(() => {});
    }
    if (JSON.stringify(storeEntries.sort()) !== JSON.stringify(['control.json', 'records']) ||
        recordEntries.length !== 0 || (await store.handle.stat()).mode % 0o10000 !== 0o755 ||
        (await records.handle.stat()).mode % 0o10000 !== 0o755) return false;
    transaction.store ??= store;
    transaction.records ??= records;
    return true;
  } catch {
    return false;
  } finally {
    if (transaction.records !== records) await closeDirectory(records);
    if (transaction.store !== store) await closeDirectory(store);
  }
}

async function removeStage(transaction) {
  if (!await verifyDirectory(transaction.root) || !await verifyDirectory(transaction.stage)) {
    fail('PATH_UNSAFE', 'initializer stage identity changed before cleanup', 1);
  }
  const expected = ['journal.json', ...transaction.journal.planned
    .filter((entry) => entry !== 'readme/tasks/store/').map((entry) => entry.replaceAll('/', '__'))].sort();
  const actual = [];
  let scan;
  try {
    scan = await fs.opendir(transaction.stage.anchor);
    for await (const entry of scan) {
      if (!entry.isFile() || entry.isSymbolicLink()) fail('INITIALIZATION_PREPARED', 'stage inventory is unsafe');
      actual.push(entry.name);
    }
  } finally {
    await scan?.close().catch(() => {});
  }
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) {
    fail('INITIALIZATION_PREPARED', 'stage inventory is incomplete or unexpected');
  }
  for (const name of expected.filter((entry) => entry !== 'journal.json')) {
    await fs.unlink(anchored(transaction.stage, name));
    if (!await absentAt(transaction.stage, name)) fail('PATH_UNSAFE', 'stage entry survived cleanup', 1);
  }
  await transaction.journalHandle?.close();
  transaction.journalHandle = null;
  await fs.unlink(anchored(transaction.stage, 'journal.json'));
  if (!await absentAt(transaction.stage, 'journal.json')) fail('PATH_UNSAFE', 'journal survived cleanup', 1);
  await syncHandle(transaction.stage.handle);
  await fs.rmdir(anchored(transaction.root, transaction.stageName));
  if (!await absentAt(transaction.root, transaction.stageName)) fail('PATH_UNSAFE', 'stage survived cleanup', 1);
  await syncHandle(transaction.root.handle);
  await closeDirectory(transaction.stage);
  transaction.stage = null;
}

async function rollbackStore(transaction) {
  const ownership = transaction.journal.storeOwnership;
  if (!transaction.journal.planned.includes('readme/tasks/store/')) return true;
  const tasks = await ensureParent(transaction, 'readme/tasks');
  const namedStore = await fs.lstat(anchored(tasks, 'store')).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error));
  if (ownership === null) return namedStore === null;
  if (!validDirectoryIdentity(ownership.root) || namedStore === null) return false;
  const store = transaction.store ?? await openChildDirectory(tasks, 'store', path.join(tasks.lexical, 'store'))
    .catch(() => null);
  if (store === null || JSON.stringify(store.identity) !== JSON.stringify(ownership.root)) return false;
  let complete = true;
  const namedControl = await fs.lstat(anchored(store, 'control.json')).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error));
  if (namedControl !== null) {
    if (validIdentity(ownership.control) &&
        await exactFileAt(store, 'control.json', ownership.control, { links: 1, mode: 0o644 })) {
      await fs.unlink(anchored(store, 'control.json')).catch(() => { complete = false; });
      if (!await absentAt(store, 'control.json').catch(() => false)) complete = false;
    } else complete = false;
  }
  const namedRecords = await fs.lstat(anchored(store, 'records')).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error));
  if (namedRecords !== null && validDirectoryIdentity(ownership.records)) {
    const records = transaction.records ?? await openChildDirectory(store, 'records', path.join(store.lexical, 'records'))
      .catch(() => null);
    if (records !== null && JSON.stringify(records.identity) === JSON.stringify(ownership.records)) {
      let empty = true;
      let scan;
      try {
        scan = await fs.opendir(records.anchor);
        for await (const _entry of scan) empty = false;
      } finally {
        await scan?.close().catch(() => {});
      }
      if (empty) {
        await closeDirectory(records);
        if (transaction.records === records) transaction.records = null;
        await fs.rmdir(anchored(store, 'records')).catch(() => { complete = false; });
        if (!await absentAt(store, 'records').catch(() => false)) complete = false;
      } else complete = false;
    } else complete = false;
  } else if (namedRecords !== null) complete = false;
  let empty = true;
  let scan;
  try {
    scan = await fs.opendir(store.anchor);
    for await (const _entry of scan) empty = false;
  } finally {
    await scan?.close().catch(() => {});
  }
  if (empty) {
    await closeDirectory(store);
    if (transaction.store === store) transaction.store = null;
    await fs.rmdir(anchored(tasks, 'store')).catch(() => { complete = false; });
    if (!await absentAt(tasks, 'store').catch(() => false)) complete = false;
  } else if (transaction.store !== store) {
    await closeDirectory(store);
    complete = false;
  }
  await syncHandle(tasks.handle).catch(() => {});
  const remaining = await fs.lstat(anchored(tasks, 'store')).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error));
  return complete && remaining === null;
}

async function rollback(transaction, options) {
  let complete = await rollbackStore(transaction).catch(() => false);
  for (const record of [...transaction.journal.claimed].reverse()) {
    const parent = transaction.parents.get(parentKeyFor(record.path));
    const named = parent ? await fs.lstat(anchored(parent, baseFor(record.path))).catch((error) =>
      error.code === 'ENOENT' ? null : Promise.reject(error)) : null;
    if (parent && named !== null && await exactFileAt(parent, baseFor(record.path), record)) {
      await runHook(options, `beforeRollback:${record.path}`).catch(() => {});
      if (await exactFileAt(parent, baseFor(record.path), record)) {
        await fs.unlink(anchored(parent, baseFor(record.path))).catch(() => { complete = false; });
        if (!await absentAt(parent, baseFor(record.path)).catch(() => false)) complete = false;
        await syncHandle(parent.handle).catch(() => {});
      } else complete = false;
    } else complete = false;
  }
  for (const record of [...transaction.journal.directories].reverse()) {
    const directory = transaction.parents.get(record.path);
    const parent = transaction.parents.get(record.path === 'readme' ? '' : 'readme');
    if (directory && parent && await verifyDirectory(directory)) {
      await closeDirectory(directory);
      transaction.parents.delete(record.path);
      await fs.rmdir(anchored(parent, record.path === 'readme' ? 'readme' : 'tasks'))
        .catch(() => { complete = false; });
      if (!await absentAt(parent, record.path === 'readme' ? 'readme' : 'tasks').catch(() => false)) {
        complete = false;
      }
      await syncHandle(parent.handle).catch(() => {});
    } else if (directory) complete = false;
  }
  if (complete && transaction.stage) {
    await removeStage(transaction).catch(() => { complete = false; });
  }
  return complete;
}

async function loadResumableStage(transaction, stageName, metadata) {
  const match = STAGE_PATTERN.exec(stageName);
  if (match === null) fail('INITIALIZATION_PREPARED', 'initializer stage identity is invalid');
  transaction.stageName = stageName;
  transaction.stage = await openChildDirectory(transaction.root, stageName,
    path.join(transaction.root.lexical, stageName));
  if (((await transaction.stage.handle.stat()).mode & 0o7777) !== 0o700) {
    fail('INITIALIZATION_PREPARED', 'initializer stage mode is invalid');
  }
  transaction.journalHandle = await openJournalAt(transaction.stage, false);
  transaction.journal = await parseJournal(transaction, match[1]);
  const journal = transaction.journal;
  if (!exactObjectKeys(journal.package, ['name', 'version']) ||
      journal.package.name !== transaction.validated.identity.name ||
      journal.package.version !== transaction.validated.identity.version) {
    fail('INITIALIZATION_PREPARED', 'initializer package provenance changed');
  }
  if (!Array.isArray(journal.planned) || !Array.isArray(journal.preserved) ||
      !Array.isArray(journal.parentBaseline) || !Array.isArray(journal.directories) ||
      !Array.isArray(journal.claimed) || !Array.isArray(journal.preservedIdentities)) {
    fail('INITIALIZATION_PREPARED', 'initializer journal collections are invalid');
  }
  const union = [...journal.planned, ...journal.preserved]
    .sort((left, right) => CREATED_PATH_ORDER.indexOf(left) - CREATED_PATH_ORDER.indexOf(right));
  if (journal.planned.length === 0 || new Set(union).size !== CREATED_PATH_ORDER.length ||
      JSON.stringify(union) !== JSON.stringify(CREATED_PATH_ORDER) ||
      JSON.stringify(journal.planned) !== JSON.stringify([...journal.planned]
        .sort((a, b) => CREATED_PATH_ORDER.indexOf(a) - CREATED_PATH_ORDER.indexOf(b))) ||
      JSON.stringify(journal.preserved) !== JSON.stringify([...journal.preserved]
        .sort((a, b) => CREATED_PATH_ORDER.indexOf(a) - CREATED_PATH_ORDER.indexOf(b))) ||
      (journal.planned.includes('readme/README.md') !== journal.planned.includes('readme/tasks/README.md'))) {
    fail('INITIALIZATION_PREPARED', 'initializer file plan is invalid');
  }
  const expectedMetadata = metadata.map(({ scope, relative, identity }) => ({ scope, path: relative, ...identity }));
  if (JSON.stringify(journal.metadata) !== JSON.stringify(expectedMetadata)) {
    fail('INITIALIZATION_PREPARED', 'initializer metadata identity changed');
  }
  const expectedParentOrder = ['readme', 'readme/tasks'];
  const allParentRecords = [...journal.parentBaseline, ...journal.directories];
  if (allParentRecords.some((record) => !exactObjectKeys(record, ['path', 'dev', 'ino', 'mode']) ||
      !expectedParentOrder.includes(record.path) ||
      !validDirectoryIdentity({ dev: record.dev, ino: record.ino, mode: record.mode })) ||
      new Set(allParentRecords.map((record) => record.path)).size !== allParentRecords.length ||
      JSON.stringify(journal.parentBaseline.map((record) => record.path)) !==
        JSON.stringify(journal.parentBaseline.map((record) => record.path)
          .sort((a, b) => expectedParentOrder.indexOf(a) - expectedParentOrder.indexOf(b))) ||
      JSON.stringify(journal.directories.map((record) => record.path)) !==
        JSON.stringify(journal.directories.map((record) => record.path)
          .sort((a, b) => expectedParentOrder.indexOf(a) - expectedParentOrder.indexOf(b)))) {
    fail('INITIALIZATION_PREPARED', 'destination parent provenance is invalid');
  }
  await openRequiredParents(transaction);
  for (const record of allParentRecords) {
    const directory = transaction.parents.get(record.path);
    if (directory === undefined || JSON.stringify(directory.identity) !== JSON.stringify({
      dev: record.dev, ino: record.ino, mode: record.mode,
    })) fail('INITIALIZATION_PREPARED', 'destination parent identity changed');
  }
  const preservedPaths = journal.preserved.filter((entry) => entry !== 'readme/tasks/store/');
  if (!Array.isArray(journal.preservedIdentities) ||
      journal.preservedIdentities.some((record, index) => !validIdentity(record, { pathKey: true }) ||
        record.path !== preservedPaths[index]) || journal.preservedIdentities.length !== preservedPaths.length) {
    fail('INITIALIZATION_PREPARED', 'preserved file provenance is invalid');
  }
  await verifyPreserved(transaction);
  if (journal.preserved.includes('readme/tasks/store/')) {
    const loaded = await loadStore(transaction.validated.context);
    if (loaded.digest !== journal.preservedStoreDigest ||
        !await validatePreservedStoreOwnership(transaction, journal.preservedStoreOwnership)) {
      fail('INITIALIZATION_PREPARED', 'preserved store changed');
    }
  } else if (journal.preservedStoreDigest !== null || journal.preservedStoreOwnership !== null) {
    fail('INITIALIZATION_PREPARED', 'preserved store provenance is invalid');
  }
  const filePlan = journal.planned.filter((entry) => entry !== 'readme/tasks/store/');
  if (!Array.isArray(journal.claimed) || journal.claimed.length > filePlan.length ||
      journal.claimed.some((record, index) => !validIdentity(record, { pathKey: true }) || record.path !== filePlan[index])) {
    fail('INITIALIZATION_PREPARED', 'file claim phase is invalid');
  }
  const expectedStageNames = ['journal.json', ...filePlan.map((entry) => entry.replaceAll('/', '__'))].sort();
  const actualStageNames = [];
  let stageScan;
  try {
    stageScan = await fs.opendir(transaction.stage.anchor);
    for await (const entry of stageScan) {
      if (!entry.isFile() || entry.isSymbolicLink() ||
          actualStageNames.length >= PROJECT_INIT_LIMITS.stageEntries) {
        fail('INITIALIZATION_PREPARED', 'initializer stage inventory is unsafe');
      }
      actualStageNames.push(entry.name);
    }
  } finally {
    await stageScan?.close().catch(() => {});
  }
  if (JSON.stringify(actualStageNames.sort()) !== JSON.stringify(expectedStageNames)) {
    fail('INITIALIZATION_PREPARED', 'journal or staged-file kill window is not resumable');
  }
  for (let index = 0; index < filePlan.length; index += 1) {
    const relative = filePlan[index];
    const stagedName = relative.replaceAll('/', '__');
    const expectedBytes = Buffer.from(FILES[relative], 'utf8');
    const staged = await readFileAt(transaction.stage, stagedName, {
      mode: 0o644, links: index < journal.claimed.length ? 2 : 1,
      maxBytes: PROJECT_INIT_LIMITS.stateDocumentBytes,
    });
    if (staged === null || staged.identity.digest !== sha256(expectedBytes)) {
      fail('INITIALIZATION_PREPARED', 'staged content changed');
    }
    const parent = await ensureParent(transaction, parentKeyFor(relative));
    if (index < journal.claimed.length) {
      if (!await exactFileAt(parent, baseFor(relative), journal.claimed[index], { links: 2, mode: 0o644 }) ||
          JSON.stringify(staged.identity) !== JSON.stringify({
            dev: journal.claimed[index].dev, ino: journal.claimed[index].ino,
            mode: journal.claimed[index].mode, size: journal.claimed[index].size,
            digest: journal.claimed[index].digest,
          })) fail('INITIALIZATION_PREPARED', 'claimed content is not an exact phase prefix');
    } else if (await fs.lstat(anchored(parent, baseFor(relative))).catch((error) =>
      error.code === 'ENOENT' ? null : Promise.reject(error)) !== null) {
      fail('INITIALIZATION_PREPARED', 'link-before-journal window is not resumable');
    }
  }
  if (journal.planned.includes('readme/tasks/store/')) {
    if (journal.preservedStoreDigest !== null || journal.preservedStoreOwnership !== null ||
        (journal.storeDigest !== null && !/^sha256:[0-9a-f]{64}$/u.test(journal.storeDigest))) {
      fail('INITIALIZATION_PREPARED', 'created store provenance is invalid');
    }
    if (journal.storeOwnership === null) {
      const tasks = await ensureParent(transaction, 'readme/tasks');
      if (await fs.lstat(anchored(tasks, 'store')).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)) !== null) {
        fail('INITIALIZATION_PREPARED', 'incomplete store ownership is not resumable');
      }
    } else if (!await validateCreatedEmptyStoreOwnership(transaction, journal.storeOwnership) ||
        journal.storeOwnership.control.digest !== sha256(Buffer.from(EMPTY_CONTROL, 'utf8')) ||
        journal.storeOwnership.control.size !== Buffer.byteLength(EMPTY_CONTROL, 'utf8')) {
      fail('INITIALIZATION_PREPARED', 'created store ownership changed');
    }
  } else if (journal.storeOwnership !== null || journal.storeDigest !== null ||
      !/^sha256:[0-9a-f]{64}$/u.test(journal.preservedStoreDigest)) {
    fail('INITIALIZATION_PREPARED', 'unexpected store ownership is recorded');
  }
  if (journal.storeDigest !== null) {
    const loaded = await loadStore(transaction.validated.context);
    if (loaded.digest !== journal.storeDigest || loaded.tasks.size !== 0) {
      fail('INITIALIZATION_PREPARED', 'created store digest changed');
    }
  }
  transaction.adopted = true;
}

async function verifyPreserved(transaction) {
  for (const record of transaction.journal.preservedIdentities) {
    const parent = await ensureParent(transaction, parentKeyFor(record.path));
    if (!await exactFileAt(parent, baseFor(record.path), record, { links: 1 })) {
      fail('FINAL_STATE_INVALID', 'a preserved project file changed', 1);
    }
  }
  if (transaction.journal.preservedStoreDigest !== null) {
    const loaded = await loadStore(transaction.validated.context);
    if (loaded.digest !== transaction.journal.preservedStoreDigest ||
        !await validatePreservedStoreOwnership(transaction, transaction.journal.preservedStoreOwnership)) {
      fail('FINAL_STATE_INVALID', 'the preserved task store changed', 1);
    }
  }
}

async function verifyTransaction(transaction, metadata) {
  await verifyMetadata(metadata);
  await verifyPreserved(transaction);
  for (const directory of transaction.parents.values()) {
    if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'a held destination parent changed', 1);
  }
  for (const record of transaction.journal.claimed) {
    const parent = transaction.parents.get(parentKeyFor(record.path));
    if (!parent || !await exactFileAt(parent, baseFor(record.path), record, { links: 2, mode: 0o644 })) {
      fail('FINAL_STATE_INVALID', 'a claimed destination changed', 1);
    }
  }
  if (transaction.journal.storeOwnership !== null &&
      !await validateCreatedEmptyStoreOwnership(transaction, transaction.journal.storeOwnership)) {
    fail('FINAL_STATE_INVALID', 'created store ownership changed', 1);
  }
  const loaded = await loadStore(transaction.validated.context);
  if (transaction.journal.storeDigest !== null && loaded.digest !== transaction.journal.storeDigest) {
    fail('FINAL_STATE_INVALID', 'created store digest changed', 1);
  }
  return loaded;
}

async function closeTransaction(transaction) {
  await transaction.journalHandle?.close().catch(() => {});
  await closeDirectory(transaction.records);
  await closeDirectory(transaction.store);
  for (const [key, directory] of [...transaction.parents].reverse()) {
    if (key !== '') await closeDirectory(directory);
  }
  await closeDirectory(transaction.stage);
  await closeDirectory(transaction.root);
}

async function runHook(options, phase) {
  const hook = options?.hooks?.[phase];
  if (hook !== undefined) {
    if (typeof hook !== 'function') fail('INITIALIZATION_INTERNAL', 'initializer test hook is invalid', 1);
    await hook();
  }
}

export async function initializeProject(runtime, options = undefined) {
  await assertLinuxFdBoundary();
  const initial = refreshClientRuntime(runtime);
  if (initial.mode !== 'installed') fail('INITIALIZATION_SOURCE', 'project init requires an installed package');
  if (!validateScriptContract(initial)) fail('INITIALIZATION_UNSAFE', 'the client script contract is unsafe');
  return withLock(initial.context, async (lock) => {
    const root = await openRootBoundary(initial.clientRoot);
    const transaction = {
      validated: initial,
      root,
      parents: new Map([['', root]]),
      stage: null,
      stageName: null,
      journal: null,
      journalHandle: null,
      store: null,
      records: null,
      adopted: false,
      recoveryRequired: false,
    };
    try {
      await runHook(options, 'rootAnchored');
      const stages = await listStagesAnchored(root);
      let planned;
      let preserved;
      let metadata;
      if (stages.length === 1) {
        const bound = await bindCurrentMetadata(runtime);
        transaction.validated = bound.validated;
        metadata = bound.metadata;
        await loadResumableStage(transaction, stages[0], metadata);
        ({ planned, preserved } = transaction.journal);
      } else {
        const readiness = await rawPreflight(runtime, { ignoreProjectStage: true, taskLockHeld: true });
        if (!['fresh', 'ready_to_initialize', 'ready_to_add_bootstraps', 'valid_current_project']
          .includes(readiness.disposition)) {
          fail('INITIALIZATION_UNSAFE', 'project state is not safe to initialize');
        }
        if (readiness.validated.clientRoot !== root.lexical || !validateScriptContract(readiness.validated)) {
          fail('CLIENT_METADATA_CHANGED', 'client metadata changed before readiness capture', 4);
        }
        transaction.validated = readiness.validated;
        const readinessEvidence = await captureReadinessEvidence(transaction, readiness);
        await runHook(options, 'afterReadinessBeforePreservedCapture');
        await verifyReadinessEvidence(transaction, readinessEvidence);
        const bound = await bindCurrentMetadata(runtime);
        transaction.validated = bound.validated;
        metadata = bound.metadata;
        if (bound.validated.clientRoot !== root.lexical || !validateScriptContract(bound.validated)) {
          fail('CLIENT_METADATA_CHANGED', 'client metadata changed before initialization', 4);
        }
        if (readiness.disposition === 'valid_current_project') {
          await openRequiredParents(transaction, [], CREATED_PATH_ORDER);
          const identities = await preservedIdentitiesAnchored(transaction, CREATED_PATH_ORDER);
          const storeOwnership = await capturePreservedStoreOwnership(transaction);
          const loaded = await loadStore(transaction.validated.context);
          await runHook(options, 'afterPreservedCapture');
          await verifyMetadata(metadata);
          for (const record of identities) {
            const parent = transaction.parents.get(parentKeyFor(record.path));
            if (!parent || !await exactFileAt(parent, baseFor(record.path), record, { links: 1 })) {
              fail('FINAL_STATE_INVALID', 'an initialized project file changed', 1);
            }
          }
          const reloaded = await loadStore(transaction.validated.context);
          if (reloaded.digest !== loaded.digest ||
              !await validatePreservedStoreOwnership(transaction, storeOwnership)) {
            fail('FINAL_STATE_INVALID', 'the task store changed', 1);
          }
          for (const directory of transaction.parents.values()) {
            if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'a project directory changed', 1);
          }
          return deepFreeze({
            schemaVersion: 1,
            package: { name: transaction.validated.identity.name, version: transaction.validated.identity.version },
            projectInit: { version: PROJECT_INIT_COMPATIBILITY.version, result: 'already_initialized',
              created: [], preserved: [...CREATED_PATH_ORDER], storeDigest: reloaded.digest },
          });
        }
        planned = [];
        preserved = [];
        for (const relative of CREATED_PATH_ORDER.slice(0, 2)) {
          (readiness.bootstraps[relative] === 'absent' ? planned : preserved).push(relative);
        }
        const createState = readiness.taskState.disposition === 'uninitialized';
        const initializeState = readiness.taskState.disposition === 'ready_to_initialize';
        (createState ? planned : preserved).push('readme/README.md', 'readme/tasks/README.md');
        (createState || initializeState ? planned : preserved).push('readme/tasks/store/');
        planned.sort((a, b) => CREATED_PATH_ORDER.indexOf(a) - CREATED_PATH_ORDER.indexOf(b));
        preserved.sort((a, b) => CREATED_PATH_ORDER.indexOf(a) - CREATED_PATH_ORDER.indexOf(b));
        await openRequiredParents(transaction, planned, preserved);
        const preservedFiles = await preservedIdentitiesAnchored(transaction, preserved);
        const preservedStoreOwnership = preserved.includes('readme/tasks/store/')
          ? await capturePreservedStoreOwnership(transaction) : null;
        const preservedStoreDigest = preserved.includes('readme/tasks/store/')
          ? (await loadStore(transaction.validated.context)).digest : null;
        await runHook(options, 'afterPreservedCapture');
        await verifyMetadata(metadata);
        for (const record of preservedFiles) {
          const parent = transaction.parents.get(parentKeyFor(record.path));
          if (!parent || !await exactFileAt(parent, baseFor(record.path), record, { links: 1 })) {
            fail('FINAL_STATE_INVALID', 'a preserved project file changed before initialization', 4);
          }
        }
        if (preservedStoreOwnership !== null &&
            (!await validatePreservedStoreOwnership(transaction, preservedStoreOwnership) ||
              (await loadStore(transaction.validated.context)).digest !== preservedStoreDigest)) {
          fail('FINAL_STATE_INVALID', 'the preserved task store changed before initialization', 4);
        }
        for (const directory of transaction.parents.values()) {
          if (!await verifyDirectory(directory)) fail('PATH_UNSAFE', 'a destination parent changed', 4);
        }
        await createStage(transaction, lock?.token, transaction.validated.identity, metadata, planned, preserved,
          preservedFiles, preservedStoreOwnership, preservedStoreDigest);
      }
      await runHook(options, 'stage');
      for (const relative of planned.filter((entry) => entry !== 'readme/tasks/store/')) {
        if (transaction.journal.claimed.some((record) => record.path === relative)) continue;
        await claimFile(transaction, relative, options);
        await runHook(options, `claim:${relative}`);
      }
      let loaded;
      if (planned.includes('readme/tasks/store/') && transaction.journal.storeDigest === null) {
        if (transaction.journal.storeOwnership === null) loaded = await createEmptyStore(transaction);
        else {
          loaded = await loadStore(transaction.validated.context);
          transaction.journal.storeDigest = loaded.digest;
          await writeJournal(transaction);
        }
        await runHook(options, 'store');
      }
      loaded = await verifyTransaction(transaction, metadata);
      await runHook(options, 'verified');
      await runHook(options, 'beforeStageCleanup');
      loaded = await verifyTransaction(transaction, metadata);
      await removeStage(transaction);
      return deepFreeze({
        schemaVersion: 1,
        package: { name: transaction.validated.identity.name, version: transaction.validated.identity.version },
        projectInit: { version: PROJECT_INIT_COMPATIBILITY.version, result: 'initialized',
          created: planned, preserved, storeDigest: loaded.digest },
      });
    } catch (error) {
      if (transaction.recoveryRequired) {
        lock.preserveForRecovery();
        fail('INITIALIZATION_RECOVERY_REQUIRED', 'initializer recovery requires explicit lock review', 5);
      }
      if (transaction.adopted) {
        const complete = await rollback(transaction, options).catch(() => false);
        if (!complete) {
          lock.preserveForRecovery();
          fail('INITIALIZATION_RECOVERY_REQUIRED', 'initializer recovery requires explicit lock review', 5);
        }
      }
      throw error;
    } finally {
      await closeTransaction(transaction);
    }
  });
}
