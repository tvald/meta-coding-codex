import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { authorizeImplementationOperation } from './implementation-activation.mjs';
import { assertImplementationEffectCapability } from './implementation-effect-capability.mjs';
import { classifyProcessDomain } from './implementation-provider.mjs';
import { canonicalDigest } from './implementation-protocol.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const DEFAULT_PROTECTED_PATHS = Object.freeze([
  '.agents',
  '.claude',
  '.codex',
  '.git',
  'AGENTS.md',
  'CLAUDE.md',
  'bin',
  'lib',
  'package-files.json',
  'package-lock.json',
  'package.json',
  'prompts',
  'readme/README.md',
  'readme/meta',
  'readme/tasks/README.md',
  'readme/tasks/store',
  'scripts',
].sort());

const MAX_CHANGED_FILE_BYTES = 16 * 1024 * 1024;

export class ImplementationWorkspaceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationWorkspaceError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationWorkspaceError(code, message);
}

function pathParts(value, label = 'workspace path') {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4_096 ||
      value.startsWith('/') || value.includes('\\') || value.includes('\0') ||
      value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('PATH_INVALID', `${label} is invalid`);
  }
  return value.split('/');
}

function pathContains(owner, candidate) {
  const left = pathParts(owner, 'ownership path');
  const right = pathParts(candidate, 'changed path');
  return left.length <= right.length && left.every((part, index) => part === right[index]);
}

export function effectiveProtectedPaths(additionalPaths = DEFAULT_PROTECTED_PATHS) {
  if (!Array.isArray(additionalPaths) || additionalPaths.length > 128) {
    fail('OWNERSHIP_INVALID', 'protected workspace paths are invalid');
  }
  const result = [...new Set([...DEFAULT_PROTECTED_PATHS, ...additionalPaths])].sort();
  for (const protectedPath of result) pathParts(protectedPath, 'protected path');
  return Object.freeze(result);
}

export function changedPathsWithinOwnership(changedPaths, ownership, {
  protectedPaths = DEFAULT_PROTECTED_PATHS,
} = {}) {
  if (!Array.isArray(changedPaths) || !Array.isArray(ownership?.writePaths) ||
      !Array.isArray(protectedPaths) || changedPaths.length > 10_000 || ownership.writePaths.length > 128) {
    fail('OWNERSHIP_INVALID', 'workspace ownership input is invalid');
  }
  const effectiveProtected = effectiveProtectedPaths(protectedPaths);
  const writes = [...new Set(ownership.writePaths)].sort();
  const changed = [...new Set(changedPaths)].sort();
  for (const owned of writes) pathParts(owned, 'ownership path');
  for (const candidate of changed) {
    pathParts(candidate, 'changed path');
    if (effectiveProtected.some((protectedPath) => pathContains(protectedPath, candidate) ||
        pathContains(candidate, protectedPath))) return false;
    if (!writes.some((owned) => pathContains(owned, candidate))) return false;
  }
  return true;
}

function ordinaryPhysicalDirectory(target, label) {
  if (typeof target !== 'string' || path.resolve(target) !== target) fail('PATH_INVALID', `${label} is invalid`);
  let info;
  let real;
  try {
    info = fs.lstatSync(target);
    real = fs.realpathSync(target);
  } catch {
    fail('WORKSPACE_UNAVAILABLE', `${label} is unavailable`);
  }
  if (!info.isDirectory() || info.isSymbolicLink() || info.nlink < 1 || real !== target) {
    fail('WORKSPACE_UNSAFE', `${label} is not one physical directory`);
  }
  return { path: target, dev: info.dev, ino: info.ino, mode: info.mode & 0o777 };
}

export function workspaceIdentity(workspaceRoot) {
  const identity = ordinaryPhysicalDirectory(workspaceRoot, 'attempt workspace');
  return Object.freeze({
    ...identity,
    digest: canonicalDigest(identity),
  });
}

function safeGitEnvironment(environment = process.env) {
  const allowed = {};
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'WINDIR']) {
    if (typeof environment[name] === 'string' && environment[name].length <= 4_096) allowed[name] = environment[name];
  }
  return {
    ...allowed,
    HOME: '/nonexistent-meta-framework-home',
    XDG_CONFIG_HOME: '/nonexistent-meta-framework-xdg',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_COUNT: '4',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'commit.gpgSign',
    GIT_CONFIG_VALUE_2: 'false',
    GIT_CONFIG_KEY_3: 'tag.gpgSign',
    GIT_CONFIG_VALUE_3: 'false',
  };
}

function splitNul(buffer, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 8 * 1024 * 1024 ||
      (buffer.length > 0 && buffer.at(-1) !== 0)) fail('GIT_OUTPUT_INVALID', `${label} is invalid`);
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, -1));
  } catch {
    fail('GIT_OUTPUT_INVALID', `${label} is invalid`);
  }
  const items = buffer.length === 0 ? [] : decoded.split('\0');
  if (items.length > 10_000 || items.some((item) => item.length === 0 || item.startsWith('\uFEFF') || item.includes('\uFFFD'))) {
    fail('GIT_OUTPUT_INVALID', `${label} is invalid`);
  }
  return items;
}

function runGit(gitExecutable, workspaceRoot, args, environment, runner) {
  if (typeof gitExecutable !== 'string' || path.resolve(gitExecutable) !== gitExecutable) {
    fail('GIT_UNAVAILABLE', 'Git executable must be an absolute path');
  }
  let executableInfo;
  try {
    const real = fs.realpathSync(gitExecutable);
    executableInfo = fs.statSync(real);
    if (real !== gitExecutable || !executableInfo.isFile() || (executableInfo.mode & 0o111) === 0) throw new Error();
  } catch {
    fail('GIT_UNAVAILABLE', 'Git executable is unavailable or unsafe');
  }
  const result = runner(gitExecutable, [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'diff.external=',
    '-c', 'filter.lfs.process=',
    ...args,
  ], {
    cwd: workspaceRoot,
    env: safeGitEnvironment(environment),
    encoding: 'buffer',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15_000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.signal !== null || !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) || result.stderr.length > 64 * 1024) {
    fail('GIT_INSPECTION_FAILED', 'Git workspace inspection failed');
  }
  return result.stdout;
}

function sameFileState(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.nlink === right.nlink && left.size === right.size && left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function entryIdentity(info) {
  return canonicalDigest({
    dev: info.dev,
    ino: info.ino,
    mode: info.mode & 0o777,
    size: info.size,
  });
}

function readBoundedDescriptor(descriptor, expectedSize) {
  const bytes = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    const count = fs.readSync(descriptor, bytes, offset, expectedSize - offset, offset);
    if (count === 0) fail('WORKSPACE_UNSAFE', 'changed file ended during descriptor read');
    offset += count;
  }
  const overflow = Buffer.alloc(1);
  if (fs.readSync(descriptor, overflow, 0, 1, expectedSize) !== 0) {
    fail('WORKSPACE_UNSAFE', 'changed file exceeded its bounded descriptor read');
  }
  return bytes;
}

/**
 * Reads a changed file through an O_NOFOLLOW descriptor and returns both its canonical
 * frozen observation and the exact bytes held by that descriptor. Callers that perform
 * an effect use these returned bytes instead of reopening the worker-controlled path.
 */
export function readAttemptWorkspaceEntry(workspaceRoot, relativePath) {
  const absolute = path.join(workspaceRoot, ...pathParts(relativePath, 'changed path'));
  let namedBefore;
  try {
    namedBefore = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({
        entry: Object.freeze({
          path: relativePath,
          kind: 'deleted',
          identity: null,
          contentDigest: null,
        }),
        bytes: null,
        mode: null,
      });
    }
    fail('WORKSPACE_UNSAFE', 'changed path cannot be inspected');
  }
  if (!namedBefore.isFile() || namedBefore.isSymbolicLink() || namedBefore.nlink !== 1 ||
      namedBefore.size > MAX_CHANGED_FILE_BYTES) {
    fail('WORKSPACE_UNSAFE', 'changed path is linked or is a special file');
  }
  let descriptor;
  try {
    descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW |
      (fs.constants.O_CLOEXEC ?? 0));
    const descriptorBefore = fs.fstatSync(descriptor);
    const real = fs.realpathSync(absolute);
    const relative = path.relative(workspaceRoot, real);
    const namedOpened = fs.lstatSync(absolute);
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== 1 ||
        descriptorBefore.size > MAX_CHANGED_FILE_BYTES ||
        relative.startsWith('..') || path.isAbsolute(relative) ||
        !sameFileState(namedBefore, descriptorBefore) ||
        !sameFileState(namedOpened, descriptorBefore)) {
      fail('WORKSPACE_UNSAFE', 'changed path escaped or changed before descriptor read');
    }
    const bytes = readBoundedDescriptor(descriptor, descriptorBefore.size);
    const descriptorAfter = fs.fstatSync(descriptor);
    const namedAfter = fs.lstatSync(absolute);
    if (bytes.length !== descriptorBefore.size ||
        !sameFileState(descriptorBefore, descriptorAfter) ||
        !sameFileState(descriptorAfter, namedAfter)) {
      fail('WORKSPACE_UNSAFE', 'changed path changed during descriptor read');
    }
    return Object.freeze({
      entry: Object.freeze({
        path: relativePath,
        kind: 'file',
        identity: entryIdentity(descriptorAfter),
        contentDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      }),
      bytes,
      mode: descriptorAfter.mode,
    });
  } catch (error) {
    if (error instanceof ImplementationWorkspaceError) throw error;
    fail('WORKSPACE_UNSAFE', 'changed path cannot be read safely through one descriptor');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function inspectAttemptChanges({
  workspaceRoot,
  expectedWorkspaceDigest,
  ownership,
  processDomainEmpty,
  gitExecutable,
  environment = process.env,
  runner = spawnSync,
  protectedPaths = DEFAULT_PROTECTED_PATHS,
}) {
  if (processDomainEmpty !== true) fail('PROCESS_NOT_EMPTY', 'attempt process domain is not proved empty');
  const before = workspaceIdentity(workspaceRoot);
  if (before.digest !== expectedWorkspaceDigest) fail('WORKSPACE_IDENTITY_CHANGED', 'attempt workspace identity changed');
  const commands = [
    ['diff', '--name-only', '-z', '--no-ext-diff', 'HEAD', '--'],
    ['diff', '--cached', '--name-only', '-z', '--no-ext-diff', '--'],
    ['ls-files', '--others', '--exclude-standard', '-z', '--'],
  ];
  const changedPaths = [...new Set(commands.flatMap((args, index) =>
    splitNul(runGit(gitExecutable, workspaceRoot, args, environment, runner), `Git path set ${index}`)))].sort();
  const effectiveProtected = effectiveProtectedPaths(protectedPaths);
  if (!changedPathsWithinOwnership(changedPaths, ownership, { protectedPaths: effectiveProtected })) {
    fail('OWNERSHIP_VIOLATION', 'attempt changed paths exceed assignment ownership');
  }
  const entries = changedPaths.map((relativePath) =>
    readAttemptWorkspaceEntry(workspaceRoot, relativePath).entry);
  const after = workspaceIdentity(workspaceRoot);
  if (after.digest !== before.digest) fail('WORKSPACE_IDENTITY_CHANGED', 'attempt workspace changed during inspection');
  return Object.freeze({
    workspaceIdentity: before,
    changedPaths: Object.freeze(changedPaths),
    entries: Object.freeze(entries),
    ownershipDigest: canonicalDigest({ ownership, protectedPaths: effectiveProtected }),
    inspectionDigest: canonicalDigest({ workspace: before, changedPaths, entries }),
  });
}

export function inspectAttemptChangesWithProcessEvidence({
  processExpectation,
  processEvidence,
  ...input
} = {}) {
  const process = classifyProcessDomain(processExpectation, processEvidence);
  if (!process.empty) {
    fail('PROCESS_NOT_EMPTY', `attempt process domain is not proved empty: ${process.code}`);
  }
  return inspectAttemptChanges({ ...input, processDomainEmpty: true });
}

export function planAttemptWorkspace({
  runId,
  assignmentId,
  attemptId,
  baseCommit,
  workspaceKind,
  isolationAttested = false,
}) {
  if (![runId, assignmentId, attemptId].every((value) => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(value)) ||
      typeof baseCommit !== 'string' || !/^[0-9a-f]{40,64}$/u.test(baseCommit) ||
      !['linked_worktree', 'isolated_clone', 'mount', 'overlay'].includes(workspaceKind)) {
    fail('WORKSPACE_PLAN_INVALID', 'attempt workspace plan is invalid');
  }
  return Object.freeze({
    runId,
    assignmentId,
    attemptId,
    baseCommit,
    workspaceKind,
    writeActivation: isolationAttested === true ? 'attestation_required_by_effect_gate' : 'disabled',
    reason: isolationAttested === true ? 'effect_gate_required' : 'isolation_unproved',
  });
}

function requireActivation(operationKind, receipt, current, now) {
  const result = authorizeImplementationOperation({ operationKind, receipt, current, now });
  if (result.authorized !== true) {
    fail('ACTIVATION_REQUIRED', `${operationKind} is not authorized by the current activation predicate`);
  }
  return result;
}

function safeWorkspaceParent(workspaceParent) {
  const identity = ordinaryPhysicalDirectory(workspaceParent, 'workspace parent');
  const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  const info = fs.statSync(workspaceParent);
  if ((identity.mode & 0o077) !== 0 || (effectiveUid !== null && info.uid !== effectiveUid)) {
    fail('WORKSPACE_UNSAFE', 'workspace parent must be owner-held and mode-restricted');
  }
  return identity;
}

function safeWorkspaceGit(gitExecutable, cwd, args, operation) {
  const result = spawnSync(gitExecutable, [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'diff.external=',
    '-c', 'filter.lfs.process=',
    ...args,
  ], {
    cwd,
    env: safeGitEnvironment(),
    encoding: 'buffer',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.signal !== null || !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) || result.stderr.length > 128 * 1024) {
    fail('WORKSPACE_EFFECT_FAILED', `${operation} failed or was ambiguous`);
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout);
    if (decoded.startsWith('\uFEFF') || decoded.includes('\uFFFD')) throw new Error();
    return decoded.trim();
  } catch {
    fail('WORKSPACE_EFFECT_FAILED', `${operation} returned invalid output`);
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function restrictTree(target) {
  const info = fs.lstatSync(target);
  if (info.isSymbolicLink() || (typeof process.geteuid === 'function' && info.uid !== process.geteuid())) {
    fail('WORKSPACE_UNSAFE', 'workspace administration contains a link or another owner');
  }
  if (info.isDirectory()) {
    for (const name of fs.readdirSync(target)) restrictTree(path.join(target, name));
    fs.chmodSync(target, 0o500);
  } else if (info.isFile() && info.nlink === 1) {
    fs.chmodSync(target, 0o400);
  } else {
    fail('WORKSPACE_UNSAFE', 'workspace administration contains a linked or special file');
  }
}

function enableRemoval(target) {
  const info = fs.lstatSync(target);
  if (info.isSymbolicLink()) fail('WORKSPACE_UNSAFE', 'workspace cleanup encountered a symbolic link');
  if (info.isDirectory()) {
    fs.chmodSync(target, 0o700);
    for (const name of fs.readdirSync(target)) enableRemoval(path.join(target, name));
  } else if (info.isFile() && info.nlink === 1) {
    fs.chmodSync(target, 0o600);
  } else {
    fail('WORKSPACE_UNSAFE', 'workspace cleanup encountered a linked or special file');
  }
}

function validateAllocation(value) {
  const keys = [
    'schemaVersion', 'runId', 'assignmentId', 'attemptId', 'workspaceRoot',
    'workspaceKind', 'baseCommit', 'rootIdentity', 'gitAdminIdentity',
  ];
  const actualKeys = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  const expectedKeys = [...keys].sort();
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('WORKSPACE_RECEIPT_INVALID', 'workspace allocation receipt is invalid');
  }
  if (value.schemaVersion !== 1 || value.workspaceKind !== 'isolated_clone' ||
      ![value.runId, value.assignmentId, value.attemptId].every((entry) =>
      typeof entry === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(entry)) ||
      typeof value.baseCommit !== 'string' || !/^[0-9a-f]{40,64}$/u.test(value.baseCommit) ||
      typeof value.workspaceRoot !== 'string' || path.resolve(value.workspaceRoot) !== value.workspaceRoot ||
      typeof value.rootIdentity !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.rootIdentity) ||
      typeof value.gitAdminIdentity !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.gitAdminIdentity)) {
    fail('WORKSPACE_RECEIPT_INVALID', 'workspace allocation receipt is invalid');
  }
  return value;
}

/**
 * Allocates only the conservative isolated-clone fallback. Linked worktrees remain a
 * planning-only option until shared-Git isolation is independently proved.
 */
export function allocateAttemptWorkspace({
  plan,
  repositoryRoot,
  workspaceParent,
  gitExecutable,
  effectCapability = null,
  activationReceipt = null,
  activationContext = null,
  now = null,
} = {}) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    fail('WORKSPACE_PLAN_INVALID', 'attempt workspace plan is invalid');
  }
  const expected = planAttemptWorkspace({
    runId: plan.runId,
    assignmentId: plan.assignmentId,
    attemptId: plan.attemptId,
    baseCommit: plan.baseCommit,
    workspaceKind: plan.workspaceKind,
    isolationAttested: plan.writeActivation === 'attestation_required_by_effect_gate',
  });
  if (expected.workspaceKind !== 'isolated_clone' ||
      expected.writeActivation !== 'attestation_required_by_effect_gate') {
    fail('ISOLATION_UNPROVED', 'only an attested isolated-clone plan may allocate a workspace');
  }
  requireActivation('workspace_write', activationReceipt, activationContext, now);
  try {
    assertImplementationEffectCapability(effectCapability, 'workspace_write');
  } catch {
    fail('ACTIVATION_REQUIRED', 'workspace allocation requires a protected capability');
  }
  if (activationReceipt.binding.runId !== plan.runId) {
    fail('ACTIVATION_REQUIRED', 'workspace activation is bound to another run');
  }
  ordinaryPhysicalDirectory(repositoryRoot, 'source repository');
  safeWorkspaceParent(workspaceParent);
  let gitInfo;
  let gitRealpath;
  try {
    gitRealpath = fs.realpathSync(gitExecutable);
    gitInfo = fs.statSync(gitRealpath);
  } catch {
    fail('GIT_UNAVAILABLE', 'Git executable must be one physical absolute executable');
  }
  if (typeof gitExecutable !== 'string' || path.resolve(gitExecutable) !== gitExecutable ||
      gitRealpath !== gitExecutable || !gitInfo.isFile() || (gitInfo.mode & 0o111) === 0) {
    fail('GIT_UNAVAILABLE', 'Git executable must be one physical absolute path');
  }
  const sourceCommit = safeWorkspaceGit(gitExecutable, repositoryRoot,
    ['rev-parse', '--verify', `${plan.baseCommit}^{commit}`], 'source commit observation');
  if (sourceCommit !== plan.baseCommit) fail('WORKSPACE_STALE', 'workspace base commit is unavailable or stale');

  const workspaceRoot = path.join(workspaceParent, plan.attemptId);
  if (path.basename(workspaceRoot) !== plan.attemptId || fs.existsSync(workspaceRoot)) {
    fail('WORKSPACE_COLLISION', 'attempt workspace destination already exists');
  }
  const stage = fs.mkdtempSync(path.join(workspaceParent, `.stage-${plan.attemptId}-${randomUUID()}-`));
  fs.chmodSync(stage, 0o700);
  const stagedWorkspace = path.join(stage, 'workspace');
  try {
    safeWorkspaceGit(gitExecutable, workspaceParent, [
      'clone', '--quiet', '--no-local', '--no-hardlinks', '--no-checkout', '--',
      repositoryRoot, stagedWorkspace,
    ], 'isolated clone allocation');
    fs.chmodSync(stagedWorkspace, 0o700);
    safeWorkspaceGit(gitExecutable, stagedWorkspace,
      ['checkout', '--quiet', '--detach', plan.baseCommit, '--'], 'isolated clone checkout');
    if (safeWorkspaceGit(gitExecutable, stagedWorkspace, ['rev-parse', 'HEAD'],
      'isolated clone HEAD observation') !== plan.baseCommit ||
      safeWorkspaceGit(gitExecutable, stagedWorkspace, ['status', '--porcelain=v1', '-z', '--'],
        'isolated clone status observation') !== '') {
      fail('WORKSPACE_STALE', 'allocated workspace does not match its exact base commit');
    }
    const gitDirectory = path.join(stagedWorkspace, '.git');
    const gitBefore = ordinaryPhysicalDirectory(gitDirectory, 'workspace Git administration');
    restrictTree(gitDirectory);
    fs.renameSync(stagedWorkspace, workspaceRoot);
    fsyncDirectory(workspaceParent);
    const root = workspaceIdentity(workspaceRoot);
    const gitAfter = ordinaryPhysicalDirectory(path.join(workspaceRoot, '.git'),
      'workspace Git administration');
    const allocation = Object.freeze({
      schemaVersion: 1,
      runId: plan.runId,
      assignmentId: plan.assignmentId,
      attemptId: plan.attemptId,
      workspaceRoot,
      workspaceKind: 'isolated_clone',
      baseCommit: plan.baseCommit,
      rootIdentity: root.digest,
      gitAdminIdentity: canonicalDigest({
        before: { dev: gitBefore.dev, ino: gitBefore.ino },
        after: { dev: gitAfter.dev, ino: gitAfter.ino, mode: gitAfter.mode },
      }),
    });
    validateAllocation(allocation);
    return allocation;
  } catch (error) {
    try { enableRemoval(stage); } catch { /* preserve the primary typed failure */ }
    fs.rmSync(stage, { recursive: true, force: true });
    if (error instanceof ImplementationWorkspaceError) throw error;
    fail('WORKSPACE_EFFECT_FAILED', 'isolated workspace allocation failed');
  } finally {
    if (fs.existsSync(stage)) {
      try { enableRemoval(stage); } catch { /* crash-left staging remains visible */ }
      try { fs.rmSync(stage, { recursive: true }); } catch { /* fail closed on later collision */ }
    }
  }
}

export function cleanupAttemptWorkspace({
  allocation,
  workspaceParent,
  processDomainEmpty,
  effectCapability = null,
  activationReceipt = null,
  activationContext = null,
  now = null,
} = {}) {
  validateAllocation(allocation);
  requireActivation('cleanup', activationReceipt, activationContext, now);
  try {
    assertImplementationEffectCapability(effectCapability, 'cleanup');
  } catch {
    fail('ACTIVATION_REQUIRED', 'workspace cleanup requires a protected capability');
  }
  if (activationReceipt.binding.runId !== allocation.runId || processDomainEmpty !== true) {
    fail(processDomainEmpty === true ? 'ACTIVATION_REQUIRED' : 'PROCESS_NOT_EMPTY',
      processDomainEmpty === true ? 'cleanup activation is bound to another run' :
        'attempt process domain is not proved empty');
  }
  safeWorkspaceParent(workspaceParent);
  const expectedPath = path.join(workspaceParent, allocation.attemptId);
  let observedRealpath;
  let observedIdentity;
  try {
    observedRealpath = fs.realpathSync(expectedPath);
    observedIdentity = workspaceIdentity(expectedPath);
  } catch {
    fail('WORKSPACE_IDENTITY_CHANGED', 'attempt workspace is unavailable before cleanup');
  }
  if (allocation.workspaceRoot !== expectedPath || observedRealpath !== expectedPath ||
      observedIdentity.digest !== allocation.rootIdentity) {
    fail('WORKSPACE_IDENTITY_CHANGED', 'attempt workspace identity changed before cleanup');
  }
  enableRemoval(expectedPath);
  fs.rmSync(expectedPath, { recursive: true });
  fsyncDirectory(workspaceParent);
  if (fs.existsSync(expectedPath)) fail('WORKSPACE_EFFECT_FAILED', 'attempt workspace cleanup is ambiguous');
  return Object.freeze({
    schemaVersion: 1,
    runId: allocation.runId,
    attemptId: allocation.attemptId,
    workspaceRoot: expectedPath,
    outcome: 'removed',
  });
}

export function cleanupAttemptWorkspaceWithProcessEvidence({
  processExpectation,
  processEvidence,
  ...input
} = {}) {
  const process = classifyProcessDomain(processExpectation, processEvidence);
  if (!process.empty) {
    fail('PROCESS_NOT_EMPTY', `attempt process domain is not proved empty: ${process.code}`);
  }
  return cleanupAttemptWorkspace({ ...input, processDomainEmpty: true });
}

export { DEFAULT_PROTECTED_PATHS };
