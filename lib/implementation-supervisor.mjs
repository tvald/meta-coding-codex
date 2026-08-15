import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildOrientation,
  planControllerTick,
} from './implementation-controller.mjs';
import {
  observeCanonicalHead,
  observeCommitTree,
  observeWorktreeChanges,
  validateGitExecutable,
} from './implementation-git.mjs';
import {
  canonicalDigest,
  sha256Digest,
  validateImplementationCapsule,
  validateControllerId,
  validateDigest,
  validateOperation,
  validateRef,
  validateRunManifest,
  validateRunSnapshot,
  validateRepositoryPath,
  validateTaskId,
  validateTimestamp,
} from './implementation-protocol.mjs';
import {
  CODEX_EXEC_ADAPTER,
  CODEX_EXECUTABLE_VERSION,
  IMPLEMENTATION_PROVIDER_COMPATIBILITY,
} from './implementation-provider.mjs';

export const IMPLEMENTATION_SUPERVISOR_VERSION = 1;

const TASK_PROJECTION_KEYS = Object.freeze([
  'id', 'taskRevision', 'recordVersion', 'status', 'outcome', 'authority',
  'route', 'risk', 'gateDigest', 'acceptance', 'nonGoals', 'assumptions',
  'decisions', 'detailDigests', 'checkCatalogDigest',
]);
const STORE_PROJECTION_KEYS = Object.freeze(['storeId', 'storeGeneration']);
const REPOSITORY_PROJECTION_KEYS = Object.freeze([
  'rootIdentity', 'objectFormat', 'baseCommit', 'head', 'tree', 'statusDigest',
  'canonicalWorktreeIdentity',
]);
const PROVIDER_PROJECTION_KEYS = Object.freeze([
  'adapter', 'adapterVersion', 'harness', 'executableRealpath', 'executableVersion',
]);
const CONTROLLER_PROJECTION_KEYS = Object.freeze(['packageName', 'packageVersion']);
const POLICY_PROJECTION_KEYS = Object.freeze(['promptRegistry', 'checks', 'resources']);

export class ImplementationSupervisorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationSupervisorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationSupervisorError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('SHADOW_INPUT_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('SHADOW_INPUT_INVALID', `${label} has unknown or missing fields`);
  }
}

function positiveInteger(value, label, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail('SHADOW_INPUT_INVALID', `${label} is invalid`);
  }
}

function gitOid(value, label) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    fail('SHADOW_INPUT_INVALID', `${label} is invalid`);
  }
}

function physicalRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || path.resolve(repositoryRoot) !== repositoryRoot) {
    fail('REPOSITORY_UNSAFE', 'repository root must be an absolute path');
  }
  try {
    const info = fs.lstatSync(repositoryRoot);
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(repositoryRoot) !== repositoryRoot) {
      throw new Error();
    }
  } catch {
    fail('REPOSITORY_UNSAFE', 'repository root must be one physical directory');
  }
  return repositoryRoot;
}

export function resolveImplementationGitExecutable(environment = process.env) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment) ||
      typeof environment.PATH !== 'string' ||
      environment.PATH.length === 0 || environment.PATH.length > 32_768) {
    fail('GIT_EXECUTABLE_UNAVAILABLE', 'Git executable search path is unavailable');
  }
  for (const directory of environment.PATH.split(path.delimiter)) {
    if (directory.length === 0 || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, process.platform === 'win32' ? 'git.exe' : 'git');
    try {
      const real = fs.realpathSync(candidate);
      const info = fs.statSync(real);
      if (info.isFile() && (process.platform === 'win32' || (info.mode & 0o111) !== 0)) {
        return validateGitExecutable(real);
      }
    } catch {
      // Continue through the bounded PATH entries; no shell lookup is used.
    }
  }
  fail('GIT_EXECUTABLE_UNAVAILABLE', 'Git executable is unavailable');
}

function physicalExecutableOnPath(name, environment, code) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment) ||
      typeof environment.PATH !== 'string' || environment.PATH.length === 0 ||
      environment.PATH.length > 32_768) {
    fail(code, `${name} executable search path is unavailable`);
  }
  for (const directory of environment.PATH.split(path.delimiter)) {
    if (directory.length === 0 || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, process.platform === 'win32' ? `${name}.exe` : name);
    try {
      const real = fs.realpathSync(candidate);
      const info = fs.statSync(real);
      if (info.isFile() && (process.platform === 'win32' || (info.mode & 0o111) !== 0)) return real;
    } catch {
      // Continue through the bounded PATH entries without invoking a shell.
    }
  }
  fail(code, `${name} executable is unavailable`);
}

export function observeImplementationProvider({ environment = process.env } = {}) {
  const executableRealpath = physicalExecutableOnPath('codex', environment, 'PROVIDER_UNAVAILABLE');
  const providerEnvironment = {};
  for (const name of ['PATH', 'HOME', 'CODEX_HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TZ']) {
    if (typeof environment[name] === 'string' && environment[name].length <= 8_192) {
      providerEnvironment[name] = environment[name];
    }
  }
  const result = spawnSync(executableRealpath, ['--version'], {
    cwd: path.dirname(executableRealpath),
    env: providerEnvironment,
    encoding: 'buffer',
    maxBuffer: 16 * 1024,
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.signal !== null || !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) || result.stderr.length !== 0 || result.stdout.length > 16 * 1024) {
    fail('PROVIDER_UNAVAILABLE', 'Codex executable identity could not be observed');
  }
  const versionText = result.stdout.toString('utf8');
  if (!Buffer.from(versionText, 'utf8').equals(result.stdout) ||
      versionText !== `codex-cli ${CODEX_EXECUTABLE_VERSION}\n`) {
    fail('PROVIDER_INCOMPATIBLE', 'Codex executable version is unsupported');
  }
  return Object.freeze({
    adapter: CODEX_EXEC_ADAPTER,
    adapterVersion: IMPLEMENTATION_PROVIDER_COMPATIBILITY.version,
    harness: 'codex',
    executableRealpath,
    executableVersion: CODEX_EXECUTABLE_VERSION,
  });
}

function readOnlyGitEnvironment(environment = process.env) {
  const result = {};
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'WINDIR']) {
    if (typeof environment[name] === 'string' && environment[name].length <= 4_096) {
      result[name] = environment[name];
    }
  }
  return {
    ...result,
    HOME: '/nonexistent-meta-framework-home',
    XDG_CONFIG_HOME: '/nonexistent-meta-framework-xdg',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  };
}

function readOnlyGit({ repositoryRoot, gitExecutable, args, maximumBytes = 16 * 1024 * 1024 }) {
  const result = spawnSync(gitExecutable, [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'diff.external=',
    '-c', 'filter.lfs.process=',
    ...args,
  ], {
    cwd: repositoryRoot,
    env: readOnlyGitEnvironment(),
    encoding: 'buffer',
    maxBuffer: maximumBytes,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.signal !== null || !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) || result.stdout.length > maximumBytes ||
      result.stderr.length > 128 * 1024) {
    fail('REPOSITORY_OBSERVATION_FAILED', 'repository observation did not complete safely');
  }
  return result.stdout;
}

function nulPaths(bytes) {
  if (!Buffer.isBuffer(bytes) || (bytes.length > 0 && bytes.at(-1) !== 0)) {
    fail('REPOSITORY_OBSERVATION_FAILED', 'untracked-path observation is invalid');
  }
  if (bytes.length === 0) return [];
  const body = bytes.subarray(0, -1);
  const text = body.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(body) || text.includes('\ufeff')) {
    fail('REPOSITORY_OBSERVATION_FAILED', 'untracked paths are not valid UTF-8');
  }
  const values = text.split('\0');
  if (values.length > 10_000 || values.some((value) => value.length === 0)) {
    fail('REPOSITORY_OBSERVATION_FAILED', 'untracked-path observation exceeds its bound');
  }
  return values;
}

function untrackedContent(repositoryRoot, relativePaths) {
  return relativePaths.map((relativePath) => {
    const target = path.join(repositoryRoot, ...relativePath.split('/'));
    try {
      const info = fs.lstatSync(target);
      const real = fs.realpathSync(target);
      const relative = path.relative(repositoryRoot, real);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
          relative.startsWith('..') || path.isAbsolute(relative)) throw new Error();
      const bytes = fs.readFileSync(target);
      if (bytes.length > 16 * 1024 * 1024) {
        fail('REPOSITORY_OBSERVATION_LIMIT', 'one untracked file exceeds the shadow byte bound');
      }
      return Object.freeze({
        path: relativePath,
        mode: (info.mode & 0o111) === 0 ? '100644' : '100755',
        bytes: bytes.length,
        digest: sha256Digest(bytes),
      });
    } catch (error) {
      if (error instanceof ImplementationSupervisorError) throw error;
      fail('REPOSITORY_UNSAFE', 'untracked repository content is linked, special, or escaped');
    }
  });
}

/** Observe the complete dirty-state inputs used by a real shadow plan without writing Git objects. */
export function observeImplementationRepository({ repositoryRoot, gitExecutable } = {}) {
  physicalRepositoryRoot(repositoryRoot);
  validateGitExecutable(gitExecutable);
  const rootInfo = fs.statSync(repositoryRoot, { bigint: true });
  const head = observeCanonicalHead({ repositoryRoot, gitExecutable });
  const tree = observeCommitTree({ repositoryRoot, gitExecutable, commit: head.commit });
  const objectFormatBytes = readOnlyGit({
    repositoryRoot,
    gitExecutable,
    args: ['rev-parse', '--show-object-format'],
    maximumBytes: 128,
  });
  const objectFormat = objectFormatBytes.toString('utf8').trim();
  if (!['sha1', 'sha256'].includes(objectFormat) ||
      !Buffer.from(`${objectFormat}\n`, 'utf8').equals(objectFormatBytes)) {
    fail('REPOSITORY_OBSERVATION_FAILED', 'repository object format is invalid');
  }
  const changedPaths = observeWorktreeChanges({ repositoryRoot, gitExecutable });
  const workingDiff = readOnlyGit({
    repositoryRoot,
    gitExecutable,
    args: ['diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--'],
  });
  const cachedDiff = readOnlyGit({
    repositoryRoot,
    gitExecutable,
    args: ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--'],
  });
  const untrackedPaths = nulPaths(readOnlyGit({
    repositoryRoot,
    gitExecutable,
    args: ['ls-files', '--others', '--exclude-standard', '-z', '--'],
  })).sort();
  const untracked = untrackedContent(repositoryRoot, untrackedPaths);
  if (changedPaths.length !== 0 || workingDiff.length !== 0 || cachedDiff.length !== 0 ||
      untracked.length !== 0) {
    fail('REPOSITORY_DIRTY', 'implementation start requires a clean canonical worktree');
  }
  const statusDigest = canonicalDigest({
    changedPaths,
    workingDiffDigest: sha256Digest(workingDiff),
    cachedDiffDigest: sha256Digest(cachedDiff),
    untracked,
  });
  return frozen({
    rootIdentity: canonicalDigest({
      path: repositoryRoot,
      dev: rootInfo.dev.toString(10),
      ino: rootInfo.ino.toString(10),
    }),
    objectFormat,
    baseCommit: head.commit,
    head: head.commit,
    tree,
    statusDigest,
    canonicalWorktreeIdentity: canonicalDigest({
      path: repositoryRoot,
      dev: rootInfo.dev.toString(10),
      ino: rootInfo.ino.toString(10),
      gitHead: head.commit,
    }),
  });
}

function detailReferenceId(label, index) {
  const normalized = String(label).toLowerCase().replaceAll(/[^a-z0-9_-]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '');
  const prefixed = /^[a-z]/u.test(normalized) ? normalized : `detail_${normalized}`;
  const bounded = prefixed.slice(0, 54);
  return `${bounded || 'detail'}_${index + 1}`;
}

function projectTaskProjection(task, repositoryRoot) {
  if (!plainObject(task) || !plainObject(task.gate) || !plainObject(task.authority) ||
      !Array.isArray(task.details ?? [])) {
    fail('TASK_NOT_FOUND', 'shadow start task is unavailable or incomplete');
  }
  const details = (task.details ?? []).map((detail, index) => {
    if (!plainObject(detail) || typeof detail.label !== 'string') {
      fail('TASK_INVALID', 'task detail is invalid');
    }
    try {
      validateRepositoryPath(detail.path, `task detail ${index + 1}`);
    } catch {
      fail('TASK_INVALID', 'task detail path is invalid');
    }
    const target = path.join(repositoryRoot, ...detail.path.split('/'));
    let bytes;
    try {
      const info = fs.lstatSync(target);
      const real = fs.realpathSync(target);
      const relative = path.relative(repositoryRoot, real);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 256 * 1024 ||
          relative.startsWith('..') || path.isAbsolute(relative)) throw new Error();
      bytes = fs.readFileSync(target);
    } catch {
      fail('TASK_INVALID', 'task detail cannot be observed safely');
    }
    return Object.freeze({
      label: detail.label,
      id: detailReferenceId(detail.label, index),
      digest: sha256Digest(bytes),
    });
  });
  const detailDigests = details.map(({ id, digest }) => Object.freeze({ kind: 'detail', id, digest }));
  const decisionDetails = details.filter(({ label }) => label === 'decision');
  const decisions = decisionDetails.map(({ id, digest }) =>
    Object.freeze({ kind: 'decision', id: `decision_${id}`.slice(0, 64), digest }));
  const quality = details.find(({ label }) => label === 'quality-record') ?? null;
  const threat = details.find(({ label }) => label === 'threat-model') ?? null;
  const acceptance = quality === null ? [] : [Object.freeze({
    kind: 'detail', id: 'acceptance_quality_record', digest: quality.digest,
  })];
  const checks = quality?.digest ?? canonicalDigest({ schemaVersion: 1, checks: [] });
  const resources = threat?.digest ?? canonicalDigest({ schemaVersion: 1, resources: [] });
  const projection = {
    id: task.id,
    taskRevision: task.taskRevision,
    recordVersion: task.recordVersion,
    status: task.status,
    outcome: task.outcome,
    authority: task.authority.reference,
    route: task.route,
    risk: task.risk,
    gateDigest: canonicalDigest(task.gate),
    acceptance,
    nonGoals: [],
    assumptions: [],
    decisions,
    detailDigests,
    checkCatalogDigest: checks,
  };
  return Object.freeze({
    task: projection,
    policies: Object.freeze({
      promptRegistry: canonicalDigest({
        schemaVersion: 1,
        kind: 'compiled_prompt_registry',
        integrationConfigVersion: 3,
      }),
      checks,
      resources,
    }),
  });
}

export function planProjectImplementationShadowStart({
  command,
  task,
  activeTaskId = null,
  taskStorePaused = false,
  storeGeneration,
  repositoryRoot,
  gitExecutable = resolveImplementationGitExecutable(),
  provider = observeImplementationProvider(),
  controller = {
    packageName: '@tvald/meta-framework',
    packageVersion: '1.0.0',
  },
  observedAt,
} = {}) {
  if (typeof taskStorePaused !== 'boolean') {
    fail('SHADOW_INPUT_INVALID', 'task-store pause observation is invalid');
  }
  if (taskStorePaused) fail('TASK_STORE_PAUSED', 'implementation start is blocked while the task store is paused');
  const projected = projectTaskProjection(task, physicalRepositoryRoot(repositoryRoot));
  return planImplementationShadowStart({
    command,
    task: projected.task,
    activeTaskId,
    store: { storeId: 'task_store', storeGeneration },
    repository: observeImplementationRepository({ repositoryRoot, gitExecutable }),
    provider,
    controller,
    policies: projected.policies,
    quota: { disposition: 'unavailable' },
    approvals: { current: task.gate.kind === 'none' || task.gate.status === 'granted' },
    observedAt,
  });
}

function validateTaskProjection(task) {
  exactKeys(task, TASK_PROJECTION_KEYS, 'shadow task projection');
  validateTaskId(task.id, 'shadow task projection.id');
  positiveInteger(task.taskRevision, 'shadow task revision');
  positiveInteger(task.recordVersion, 'shadow task record version');
  if (!['ready', 'active'].includes(task.status)) {
    fail('TASK_NOT_STARTABLE', 'shadow start requires the named Ready or Active task');
  }
  validateDigest(task.gateDigest, 'shadow task gate digest');
  for (const field of ['outcome', 'authority', 'route', 'risk']) {
    if (typeof task[field] !== 'string' || task[field].length === 0 ||
        Buffer.byteLength(task[field], 'utf8') > 4_096) {
      fail('SHADOW_INPUT_INVALID', `shadow task ${field} is invalid`);
    }
  }
  for (const field of ['acceptance', 'decisions', 'detailDigests']) {
    if (!Array.isArray(task[field]) || task[field].length > 128) {
      fail('SHADOW_INPUT_INVALID', `shadow task ${field} is invalid`);
    }
    for (const reference of task[field]) {
      try { validateRef(reference, `shadow task ${field}`); } catch {
        fail('SHADOW_INPUT_INVALID', `shadow task ${field} is invalid`);
      }
    }
  }
  for (const field of ['nonGoals', 'assumptions']) {
    if (!Array.isArray(task[field]) || task[field].length > 128 || task[field].some((entry) =>
      typeof entry !== 'string' || entry.length === 0 || Buffer.byteLength(entry, 'utf8') > 4_096)) {
      fail('SHADOW_INPUT_INVALID', `shadow task ${field} is invalid`);
    }
  }
  validateDigest(task.checkCatalogDigest, 'shadow task check catalog digest');
}

function validateStoreProjection(store) {
  exactKeys(store, STORE_PROJECTION_KEYS, 'shadow store projection');
  validateControllerId(store.storeId, 'shadow store ID');
  validateDigest(store.storeGeneration, 'shadow store generation');
}

function validateRepositoryProjection(repository) {
  exactKeys(repository, REPOSITORY_PROJECTION_KEYS, 'shadow repository projection');
  for (const field of ['baseCommit', 'head', 'tree']) {
    gitOid(repository[field], `shadow repository ${field}`);
  }
  validateDigest(repository.rootIdentity, 'shadow repository root identity');
  validateDigest(repository.canonicalWorktreeIdentity, 'shadow canonical worktree identity');
  if (!['sha1', 'sha256'].includes(repository.objectFormat) ||
      [repository.baseCommit, repository.head, repository.tree].some((value) =>
        value.length !== (repository.objectFormat === 'sha1' ? 40 : 64))) {
    fail('SHADOW_INPUT_INVALID', 'shadow repository object format is invalid');
  }
  if (repository.baseCommit !== repository.head) {
    fail('REPOSITORY_STALE', 'shadow start base commit must equal the current canonical HEAD');
  }
  validateDigest(repository.statusDigest, 'shadow repository status digest');
}

function validateProviderProjection(provider) {
  exactKeys(provider, PROVIDER_PROJECTION_KEYS, 'shadow provider projection');
  if (provider.adapter !== CODEX_EXEC_ADAPTER ||
      provider.adapterVersion !== IMPLEMENTATION_PROVIDER_COMPATIBILITY.version ||
      provider.harness !== 'codex' || provider.executableVersion !== CODEX_EXECUTABLE_VERSION ||
      typeof provider.executableRealpath !== 'string' ||
      !path.isAbsolute(provider.executableRealpath) || path.normalize(provider.executableRealpath) !== provider.executableRealpath) {
    fail('PROVIDER_INCOMPATIBLE', 'shadow provider projection is incompatible');
  }
}

function validateControllerProjection(controller) {
  exactKeys(controller, CONTROLLER_PROJECTION_KEYS, 'shadow controller projection');
  if ([controller.packageName, controller.packageVersion].some((value) =>
    typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 4_096)) {
    fail('SHADOW_INPUT_INVALID', 'shadow controller projection is invalid');
  }
}

function validatePolicyProjection(policies) {
  exactKeys(policies, POLICY_PROJECTION_KEYS, 'shadow policy projection');
  for (const field of POLICY_PROJECTION_KEYS) validateDigest(policies[field], `shadow policy ${field}`);
}

function validateStartCommand(command, { expectedShadow = null } = {}) {
  exactKeys(command, [
    'command', 'taskId', 'expectedTaskRevision', 'harness', 'maxConcurrency', 'shadow',
  ], 'shadow start command');
  if (command.command !== 'start' || typeof command.shadow !== 'boolean' ||
      (expectedShadow !== null && command.shadow !== expectedShadow) || command.harness !== 'codex') {
    fail('SHADOW_INPUT_INVALID', 'shadow start command is incompatible');
  }
  validateTaskId(command.taskId, 'shadow start task ID');
  positiveInteger(command.expectedTaskRevision, 'shadow expected task revision');
  positiveInteger(command.maxConcurrency, 'shadow max concurrency', { maximum: 3 });
}

function frozen(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function implementationRunId(preimage) {
  return `run_${canonicalDigest(preimage).slice(7, 39)}`;
}

export function deriveImplementationInitialSnapshot({ manifest, capsule } = {}) {
  validateRunManifest(manifest);
  validateImplementationCapsule(capsule);
  if (manifest.capsuleDigest !== canonicalDigest(capsule) ||
      manifest.task.id !== capsule.taskId ||
      manifest.task.taskRevision !== capsule.taskRevision ||
      manifest.task.recordVersion !== capsule.taskRecordVersion) {
    fail('START_IDENTITY_MISMATCH', 'manifest and capsule do not name one implementation start');
  }
  const snapshot = frozen({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    runId: manifest.runId,
    revision: 1,
    previousDigest: null,
    epoch: 1,
    controlGeneration: 0,
    phase: 'preflight',
    taskRecordVersion: capsule.taskRecordVersion,
    correctionGeneration: 0,
    integration: {
      candidateId: null,
      tree: manifest.repository.baseTree,
      privateHead: manifest.repository.baseCommit,
    },
    eventCursor: 0,
    assignments: [],
    attempts: [],
    operations: [],
    checks: [],
    resources: [],
    pendingWakeReasons: [],
    stop: { requested: false, mode: null, reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
    updatedAt: manifest.createdAt,
  });
  validateRunSnapshot(snapshot, { expectedRunId: manifest.runId,
    minimumTaskRecordVersion: capsule.taskRecordVersion });
  return snapshot;
}

function activationIntent(task, effectiveRecordVersion, hypothetical) {
  if (task.status === 'active') return null;
  return Object.freeze({
    kind: 'activate_task',
    hypothetical,
    intentOnly: true,
    taskId: task.id,
    taskRevision: task.taskRevision,
    expectedRecordVersion: task.recordVersion,
    resultingRecordVersion: effectiveRecordVersion,
  });
}

export function deriveReadyTaskActivationJournal({ manifest, capsule, hypothetical = false } = {}) {
  const initialSnapshot = deriveImplementationInitialSnapshot({ manifest, capsule });
  if (typeof hypothetical !== 'boolean' || capsule.taskRecordVersion < 2) {
    fail('START_IDENTITY_MISMATCH', 'Ready-task activation journal inputs are invalid');
  }
  const taskIntent = Object.freeze({
    kind: 'activate_task',
    hypothetical,
    intentOnly: true,
    taskId: capsule.taskId,
    taskRevision: capsule.taskRevision,
    expectedRecordVersion: capsule.taskRecordVersion - 1,
    resultingRecordVersion: capsule.taskRecordVersion,
  });
  const binding = Object.freeze({
    runId: manifest.runId,
    epoch: initialSnapshot.epoch,
    snapshotRevision: initialSnapshot.revision,
    taskId: capsule.taskId,
    taskRevision: capsule.taskRevision,
    taskRecordVersion: capsule.taskRecordVersion,
    capsuleDigest: manifest.capsuleDigest,
    controlGeneration: initialSnapshot.controlGeneration,
    correctionGeneration: initialSnapshot.correctionGeneration,
  });
  const detail = Object.freeze({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    recordType: 'task_activation_intent',
    operationId: 'activate_task',
    taskId: taskIntent.taskId,
    taskRevision: taskIntent.taskRevision,
    expectedRecordVersion: taskIntent.expectedRecordVersion,
    resultingRecordVersion: taskIntent.resultingRecordVersion,
    expectedStatus: 'ready',
    resultingStatus: 'active',
    plannedAt: manifest.createdAt,
  });
  const detailRef = Object.freeze({
    kind: 'detail',
    id: 'activation_intent',
    digest: canonicalDigest(detail),
  });
  const operation = Object.freeze({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    operationId: detail.operationId,
    recordVersion: 1,
    previousDigest: null,
    idempotencyKey: `activate_task:${taskIntent.taskId}:${taskIntent.taskRevision}:${
      taskIntent.expectedRecordVersion}`,
    kind: 'activate_task',
    subject: detailRef,
    binding,
    inputDigest: detailRef.digest,
    expected: [],
    state: 'intended',
    attemptNumber: 0,
    receipt: null,
    observedAt: manifest.createdAt,
    failureCode: null,
  });
  validateOperation(operation, { expectedBinding: binding });
  return frozen({ taskIntent, detail, detailRef, operation });
}

function lifecycleIntents({ taskActivation, runId, initialSnapshot, binding, tick, hypothetical }) {
  const values = [
    Object.freeze({ kind: 'initialize_run', hypothetical, intentOnly: true, runId }),
    Object.freeze({ kind: 'acquire_run_lock', hypothetical, intentOnly: true,
      runId, epoch: binding.epoch }),
  ];
  if (taskActivation !== null) {
    values.push(
      Object.freeze({ kind: 'publish_activation_detail', hypothetical, intentOnly: true,
        runId, recordId: taskActivation.detailRef.id }),
      Object.freeze({ kind: 'publish_activation_operation', hypothetical, intentOnly: true,
        runId, operationId: taskActivation.operation.operationId, recordVersion: 1 }),
      taskActivation.taskIntent,
      Object.freeze({ kind: 'observe_task_activation', hypothetical, intentOnly: true,
        taskId: taskActivation.taskIntent.taskId,
        resultingRecordVersion: taskActivation.taskIntent.resultingRecordVersion }),
      Object.freeze({ kind: 'publish_activation_receipt', hypothetical, intentOnly: true,
        runId, operationId: taskActivation.operation.operationId }),
      Object.freeze({ kind: 'publish_activation_operation', hypothetical, intentOnly: true,
        runId, operationId: taskActivation.operation.operationId, recordVersion: 2 }),
      Object.freeze({ kind: 'publish_activation_event', hypothetical, intentOnly: true,
        runId, operationId: taskActivation.operation.operationId }),
    );
  }
  values.push(
    Object.freeze({ kind: 'publish_snapshot', hypothetical, intentOnly: true, runId,
      snapshotRevision: initialSnapshot.revision }),
    Object.freeze({ kind: 'accept_preflight', hypothetical, intentOnly: true, runId,
      snapshotRevision: binding.snapshotRevision }),
  );
  if (tick.root !== null) values.push(Object.freeze({ ...tick.root, intentOnly: true }));
  for (const intent of tick.background.hypotheticalIntents ?? []) {
    values.push(Object.freeze({ ...intent, intentOnly: true }));
  }
  for (const assignmentId of tick.background.dispatch ?? []) {
    values.push(Object.freeze({
      kind: 'launch_job', assignmentId, hypothetical, intentOnly: true,
    }));
  }
  return Object.freeze(values);
}

/**
 * Produces the one protocol-valid start/orientation plan used by both the disabled
 * executor and shadow mode. The plan carries no effect authority; an application
 * service must durably publish each intent and independently authorize its effect.
 */
export function planImplementationStart({
  command,
  task,
  activeTaskId = null,
  store,
  repository,
  provider,
  controller,
  policies,
  pendingAssignments = [],
  runningAssignments = [],
  assignmentStates = {},
  verification = {},
  controls = {},
  deadlines = {},
  quota = { disposition: 'unavailable' },
  approvals = { current: false },
  serializedResourceKeys = [],
  priorityByAssignmentId = {},
  observedAt,
} = {}) {
  validateStartCommand(command);
  validateTaskProjection(task);
  validateStoreProjection(store);
  validateRepositoryProjection(repository);
  validateProviderProjection(provider);
  validateControllerProjection(controller);
  validatePolicyProjection(policies);
  validateTimestamp(observedAt, 'implementation observation timestamp');
  if (task.id !== command.taskId || task.taskRevision !== command.expectedTaskRevision) {
    fail('TASK_REVISION_STALE', 'implementation start task identity or revision is stale');
  }
  if (activeTaskId !== null) validateTaskId(activeTaskId, 'active task ID');
  if ((task.status === 'ready' && activeTaskId !== null) ||
      (task.status === 'active' && activeTaskId !== task.id)) {
    fail('TASK_AUTHORITY_CONFLICT', 'shadow start conflicts with the unique Active task');
  }

  const effectiveRecordVersion = task.status === 'ready' ? task.recordVersion + 1 : task.recordVersion;
  const capsule = frozen({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    taskId: task.id,
    taskRevision: task.taskRevision,
    taskRecordVersion: effectiveRecordVersion,
    storeId: store.storeId,
    storeGeneration: store.storeGeneration,
    createdAt: observedAt,
    authority: task.authority,
    outcome: task.outcome,
    acceptance: task.acceptance,
    nonGoals: task.nonGoals,
    assumptions: task.assumptions,
    decisions: task.decisions,
    route: task.route,
    risk: task.risk,
    gateDigest: task.gateDigest,
    checkCatalogDigest: task.checkCatalogDigest,
    detailDigests: task.detailDigests,
    baseCommit: repository.baseCommit,
    baseStatusDigest: repository.statusDigest,
  });
  validateImplementationCapsule(capsule);
  const capsuleDigest = canonicalDigest(capsule);
  const runId = implementationRunId({
    taskId: task.id,
    taskRevision: task.taskRevision,
    taskRecordVersion: effectiveRecordVersion,
    storeId: store.storeId,
    storeGeneration: store.storeGeneration,
    baseCommit: repository.baseCommit,
    baseStatusDigest: repository.statusDigest,
    provider,
    controller,
    policies,
  });
  const manifest = frozen({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    runId,
    createdAt: observedAt,
    task: {
      id: task.id,
      taskRevision: task.taskRevision,
      recordVersion: effectiveRecordVersion,
      storeId: store.storeId,
      storeGeneration: store.storeGeneration,
    },
    capsuleDigest,
    controller: {
      packageName: controller.packageName,
      packageVersion: controller.packageVersion,
      protocolVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    },
    provider: { ...provider },
    repository: {
      rootIdentity: repository.rootIdentity,
      objectFormat: repository.objectFormat,
      baseCommit: repository.baseCommit,
      baseTree: repository.tree,
      canonicalWorktreeIdentity: repository.canonicalWorktreeIdentity,
    },
    limits: {
      backgroundWip: command.maxConcurrency,
      rootWip: 1,
      maxEvents: 10_000,
      maxDiagnosticBytes: 64 * 1024 * 1024,
      orientationBytes: 96 * 1024,
    },
    policyDigests: { ...policies },
  });
  validateRunManifest(manifest);
  const initialSnapshot = deriveImplementationInitialSnapshot({ manifest, capsule });
  const readySnapshot = frozen({
    ...initialSnapshot,
    revision: 2,
    previousDigest: canonicalDigest(initialSnapshot),
    phase: 'dormant',
    eventCursor: 1,
    pendingWakeReasons: ['start'],
  });
  validateRunSnapshot(readySnapshot, { expectedRunId: runId,
    minimumTaskRecordVersion: effectiveRecordVersion });
  const binding = Object.freeze({
    runId,
    epoch: 1,
    snapshotRevision: readySnapshot.revision,
    taskId: task.id,
    taskRevision: task.taskRevision,
    taskRecordVersion: effectiveRecordVersion,
    capsuleDigest,
    controlGeneration: 0,
    correctionGeneration: 0,
  });
  const orientation = buildOrientation({
    binding,
    snapshot: readySnapshot,
    task: {
      id: task.id,
      taskRevision: task.taskRevision,
      recordVersion: effectiveRecordVersion,
      status: 'active',
    },
    repository: {
      baseCommit: repository.baseCommit,
      head: repository.head,
      tree: repository.tree,
      statusDigest: repository.statusDigest,
    },
    pendingAssignments,
    runningAssignments,
    assignmentStates,
    verification,
    controls,
    deadlines,
    quota,
    approvals,
    observedAt,
  });
  const tick = planControllerTick({
    snapshot: readySnapshot,
    orientation: orientation.value,
    stateChanged: true,
    serializedResourceKeys,
    priorityByAssignmentId,
    caps: { background: command.maxConcurrency, root: 1 },
    shadow: command.shadow,
  });
  const taskIntent = activationIntent(task, effectiveRecordVersion, command.shadow);
  const taskActivation = taskIntent === null ? null : deriveReadyTaskActivationJournal({
    manifest,
    capsule,
    hypothetical: command.shadow,
  });
  const intents = lifecycleIntents({
    taskActivation,
    runId,
    initialSnapshot,
    binding,
    tick,
    hypothetical: command.shadow,
  });
  return frozen({
    schemaVersion: IMPLEMENTATION_SUPERVISOR_VERSION,
    disposition: tick.disposition === 'planned' ? 'planned' : 'quiesced',
    effectAuthority: false,
    runId,
    manifest,
    capsule,
    capsulePreview: capsule,
    initialSnapshot,
    readySnapshot,
    binding,
    snapshot: readySnapshot,
    orientation: orientation.value,
    orientationDigest: orientation.digest,
    tick,
    plan: tick,
    taskActivationIntent: taskIntent,
    taskActivation,
    intents,
  });
}

export function planImplementationShadowStart(input = {}) {
  validateStartCommand(input.command, { expectedShadow: true });
  const plan = planImplementationStart(input);
  return frozen({
    ...plan,
    disposition: plan.disposition === 'planned' ? 'shadow_planned' : 'shadow_quiesced',
    hypotheticalIntents: plan.intents,
  });
}
