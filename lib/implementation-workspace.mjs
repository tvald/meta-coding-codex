import { spawnSync } from 'node:child_process';
import { canonicalDigest } from './implementation-protocol.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const DEFAULT_PROTECTED_PATHS = Object.freeze([
  '.agents',
  '.codex',
  '.git',
  'readme/tasks/store',
]);

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

export function changedPathsWithinOwnership(changedPaths, ownership, {
  protectedPaths = DEFAULT_PROTECTED_PATHS,
} = {}) {
  if (!Array.isArray(changedPaths) || !Array.isArray(ownership?.writePaths) ||
      !Array.isArray(protectedPaths) || changedPaths.length > 10_000 || ownership.writePaths.length > 128) {
    fail('OWNERSHIP_INVALID', 'workspace ownership input is invalid');
  }
  const writes = [...new Set(ownership.writePaths)].sort();
  const changed = [...new Set(changedPaths)].sort();
  for (const owned of writes) pathParts(owned, 'ownership path');
  for (const protectedPath of protectedPaths) pathParts(protectedPath, 'protected path');
  for (const candidate of changed) {
    pathParts(candidate, 'changed path');
    if (protectedPaths.some((protectedPath) => pathContains(protectedPath, candidate) ||
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

function inspectChangedEntry(workspaceRoot, relativePath) {
  const absolute = path.join(workspaceRoot, ...pathParts(relativePath, 'changed path'));
  let info;
  try {
    info = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ path: relativePath, kind: 'deleted', identity: null });
    fail('WORKSPACE_UNSAFE', 'changed path cannot be inspected');
  }
  if (info.isSymbolicLink() || info.nlink !== 1 || (!info.isFile() && !info.isDirectory())) {
    fail('WORKSPACE_UNSAFE', 'changed path is linked or is a special file');
  }
  const real = fs.realpathSync(absolute);
  const relative = path.relative(workspaceRoot, real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('WORKSPACE_UNSAFE', 'changed path escapes workspace');
  return Object.freeze({
    path: relativePath,
    kind: info.isDirectory() ? 'directory' : 'file',
    identity: canonicalDigest({ dev: info.dev, ino: info.ino, mode: info.mode & 0o777, size: info.size }),
  });
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
  if (!changedPathsWithinOwnership(changedPaths, ownership, { protectedPaths })) {
    fail('OWNERSHIP_VIOLATION', 'attempt changed paths exceed assignment ownership');
  }
  const entries = changedPaths.map((relativePath) => inspectChangedEntry(workspaceRoot, relativePath));
  const after = workspaceIdentity(workspaceRoot);
  if (after.digest !== before.digest) fail('WORKSPACE_IDENTITY_CHANGED', 'attempt workspace changed during inspection');
  return Object.freeze({
    workspaceIdentity: before,
    changedPaths: Object.freeze(changedPaths),
    entries: Object.freeze(entries),
    ownershipDigest: canonicalDigest({ ownership, protectedPaths }),
    inspectionDigest: canonicalDigest({ workspace: before, changedPaths, entries }),
  });
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

export { DEFAULT_PROTECTED_PATHS };
