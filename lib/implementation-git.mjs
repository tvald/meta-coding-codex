import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { classifyProcessDomain } from './implementation-provider.mjs';
import { readAttemptWorkspaceEntry } from './implementation-workspace.mjs';
import {
  canonicalDigest,
  canonicalJson,
  validateBinding,
  validateBoundedArray,
  validateBoundedString,
  validateControllerId,
  validateDigest,
  validateRepositoryPath,
  validateTimestamp,
  receiptBindingAuthorizesCurrent,
} from './implementation-protocol.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const PROTECTED_CAPABILITIES = new WeakMap();
const CANDIDATE_KEYS = Object.freeze([
  'schemaVersion', 'candidateId', 'binding', 'parentCandidateId', 'baseTree', 'tree',
  'privateCommit', 'producerAttempts', 'changedPaths', 'ownershipDigest', 'patchDigest',
  'createdAt',
]);
const COMMIT_METADATA_KEYS = Object.freeze([
  'authorName', 'authorEmail', 'committerName', 'committerEmail', 'timestamp', 'message',
]);

export class ImplementationGitError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ImplementationGitError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ImplementationGitError(code, message, details);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('GIT_INPUT_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('GIT_INPUT_INVALID', `${label} has unknown or missing fields`);
  }
}

function sortedUniquePaths(values, label, { maximumItems = 128 } = {}) {
  validateBoundedArray(values, label, { maximumItems });
  for (const [index, value] of values.entries()) validateRepositoryPath(value, `${label}[${index}]`);
  if (values.some((value, index) => index > 0 && values[index - 1] >= value)) {
    fail('GIT_INPUT_INVALID', `${label} must be sorted and unique`);
  }
  return values;
}

function sortedUniqueIds(values, label) {
  validateBoundedArray(values, label);
  for (const [index, value] of values.entries()) validateControllerId(value, `${label}[${index}]`);
  if (values.some((value, index) => index > 0 && values[index - 1] >= value)) {
    fail('GIT_INPUT_INVALID', `${label} must be sorted and unique`);
  }
  return values;
}

export function protectedImplementationCapabilityAllows(capability, effectKind) {
  return PROTECTED_CAPABILITIES.get(capability)?.effectKind === effectKind;
}

export function assertProtectedImplementationCapability(capability, effectKind) {
  if (!protectedImplementationCapabilityAllows(capability, effectKind)) {
    fail('ACTIVATION_DENIED', `a protected ${effectKind} capability is required`);
  }
  return true;
}

function physicalDirectory(root, label) {
  if (typeof root !== 'string' || path.resolve(root) !== root) {
    fail('GIT_PATH_UNSAFE', `${label} must be an absolute path`);
  }
  try {
    const info = lstatSync(root);
    const real = realpathSync(root);
    if (!info.isDirectory() || info.isSymbolicLink() || real !== root) throw new Error();
    return Object.freeze({ path: root, dev: info.dev, ino: info.ino });
  } catch {
    fail('GIT_PATH_UNSAFE', `${label} must be one physical directory`);
  }
}

export function validateGitExecutable(gitExecutable) {
  if (typeof gitExecutable !== 'string' || path.resolve(gitExecutable) !== gitExecutable) {
    fail('GIT_EXECUTABLE_UNSAFE', 'Git executable must be an absolute real path');
  }
  try {
    const real = realpathSync(gitExecutable);
    const info = statSync(real);
    if (real !== gitExecutable || !info.isFile() || (info.mode & 0o111) === 0) throw new Error();
  } catch {
    fail('GIT_EXECUTABLE_UNSAFE', 'Git executable is unavailable or is not its real path');
  }
  return gitExecutable;
}

function gitEnvironment(environment = process.env, additions = {}) {
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
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    ...additions,
  };
}

function runGit({
  gitExecutable,
  repositoryRoot,
  args,
  input = undefined,
  environment = process.env,
  environmentAdditions = {},
  runner = spawnSync,
  acceptedStatuses = [0],
  operation = 'Git operation',
}) {
  validateGitExecutable(gitExecutable);
  physicalDirectory(repositoryRoot, 'repository root');
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string' || value.includes('\0'))) {
    fail('GIT_INPUT_INVALID', `${operation} arguments are invalid`);
  }
  const result = runner(gitExecutable, [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'diff.external=',
    '-c', 'commit.gpgSign=false',
    '-c', 'tag.gpgSign=false',
    '-c', 'filter.lfs.process=',
    ...args,
  ], {
    cwd: repositoryRoot,
    env: gitEnvironment(environment, environmentAdditions),
    input,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  if (!Number.isInteger(result.status) || result.signal !== null ||
      !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
    fail('GIT_EFFECT_AMBIGUOUS', `${operation} did not produce a trustworthy terminal result`);
  }
  if (result.stdout.length > 16 * 1024 * 1024 || result.stderr.length > 128 * 1024) {
    fail('GIT_OUTPUT_INVALID', `${operation} exceeded its output bound`);
  }
  if (!acceptedStatuses.includes(result.status)) {
    fail('GIT_COMMAND_FAILED', `${operation} failed`, Object.freeze({ status: result.status }));
  }
  return result;
}

function utf8(buffer, label) {
  if (!Buffer.isBuffer(buffer) || (buffer.length >= 3 && buffer[0] === 0xef &&
      buffer[1] === 0xbb && buffer[2] === 0xbf)) fail('GIT_OUTPUT_INVALID', `${label} is invalid`);
  try {
    const value = UTF8.decode(buffer);
    if (value.includes('\uFEFF') || value.includes('\uFFFD')) throw new Error();
    return value;
  } catch {
    fail('GIT_OUTPUT_INVALID', `${label} is not valid UTF-8`);
  }
}

function line(buffer, label) {
  const value = utf8(buffer, label);
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) {
    fail('GIT_OUTPUT_INVALID', `${label} must be one line`);
  }
  return value.slice(0, -1);
}

function nulItems(buffer, label) {
  if (!Buffer.isBuffer(buffer) || (buffer.length > 0 && buffer.at(-1) !== 0)) {
    fail('GIT_OUTPUT_INVALID', `${label} must be NUL terminated`);
  }
  if (buffer.length === 0) return [];
  const value = utf8(buffer.subarray(0, -1), label);
  const items = value.split('\0');
  if (items.length > 10_000 || items.some((item) => item.length === 0)) {
    fail('GIT_OUTPUT_INVALID', `${label} is malformed`);
  }
  return items;
}

function objectFormat(options) {
  const format = line(runGit({
    ...options,
    args: ['rev-parse', '--show-object-format'],
    operation: 'Git object-format observation',
  }).stdout, 'Git object format');
  if (!['sha1', 'sha256'].includes(format)) fail('GIT_UNSUPPORTED', 'Git object format is unsupported');
  return Object.freeze({ name: format, oidLength: format === 'sha1' ? 40 : 64 });
}

function oid(value, format, label = 'Git object ID') {
  if (typeof value !== 'string' || value.length !== format.oidLength ||
      !/^[0-9a-f]+$/u.test(value)) fail('GIT_INPUT_INVALID', `${label} is invalid`);
  return value;
}

function resolveOid(options, expression, label) {
  return oid(line(runGit({
    ...options,
    args: ['rev-parse', '--verify', expression],
    operation: `${label} observation`,
  }).stdout, label), objectFormat(options), label);
}

function pathContainedBy(owner, candidate) {
  return candidate === owner || candidate.startsWith(`${owner}/`);
}

function validateAllowedPaths(changedPaths, allowedPaths) {
  sortedUniquePaths(allowedPaths, 'allowed paths');
  if (changedPaths.some((candidate) => !allowedPaths.some((owner) => pathContainedBy(owner, candidate)))) {
    fail('GIT_OWNERSHIP_VIOLATION', 'candidate paths exceed the allowed publication paths');
  }
}

export function validateImplementationCandidate(candidate, format = { oidLength: 40 }) {
  exactKeys(candidate, CANDIDATE_KEYS, 'candidate');
  if (candidate.schemaVersion !== 1) fail('GIT_INPUT_INVALID', 'candidate schema version is unsupported');
  validateControllerId(candidate.candidateId, 'candidate.candidateId');
  validateBinding(candidate.binding, 'candidate.binding');
  if (candidate.parentCandidateId !== null) {
    validateControllerId(candidate.parentCandidateId, 'candidate.parentCandidateId');
  }
  oid(candidate.baseTree, format, 'candidate.baseTree');
  oid(candidate.tree, format, 'candidate.tree');
  oid(candidate.privateCommit, format, 'candidate.privateCommit');
  sortedUniqueIds(candidate.producerAttempts, 'candidate.producerAttempts');
  sortedUniquePaths(candidate.changedPaths, 'candidate.changedPaths');
  validateDigest(candidate.ownershipDigest, 'candidate.ownershipDigest');
  validateDigest(candidate.patchDigest, 'candidate.patchDigest');
  validateTimestamp(candidate.createdAt, 'candidate.createdAt');
  return candidate;
}

export function changedPathsBetweenTrees({ repositoryRoot, gitExecutable, fromTree, toTree }) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  oid(fromTree, format, 'from tree');
  oid(toTree, format, 'to tree');
  const paths = nulItems(runGit({
    ...options,
    args: ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames',
      fromTree, toTree, '--'],
    operation: 'Git tree-delta observation',
  }).stdout, 'Git tree-delta paths').sort();
  if (new Set(paths).size !== paths.length) fail('GIT_OUTPUT_INVALID', 'Git returned duplicate paths');
  for (const [index, value] of paths.entries()) validateRepositoryPath(value, `changed path[${index}]`);
  return Object.freeze(paths);
}

export function observeWorktreeChanges({ repositoryRoot, gitExecutable }) {
  const options = { repositoryRoot, gitExecutable };
  const commands = [
    ['diff', '--name-only', '-z', '--no-ext-diff', 'HEAD', '--'],
    ['diff', '--cached', '--name-only', '-z', '--no-ext-diff', '--'],
    ['ls-files', '--others', '--exclude-standard', '-z', '--'],
  ];
  const paths = [...new Set(commands.flatMap((args, index) => nulItems(runGit({
    ...options,
    args,
    operation: `Git worktree change observation ${index}`,
  }).stdout, `Git worktree change set ${index}`)))].sort();
  for (const [index, value] of paths.entries()) validateRepositoryPath(value, `worktree changed path[${index}]`);
  return Object.freeze(paths);
}

function patchDigest(options, fromTree, toTree) {
  const bytes = runGit({
    ...options,
    args: ['diff-tree', '--binary', '--full-index', '--no-ext-diff', '-r', '--no-renames',
      fromTree, toTree, '--'],
    operation: 'Git patch observation',
  }).stdout;
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function observeCandidateFacts({ repositoryRoot, gitExecutable, candidate }) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  validateImplementationCandidate(candidate, format);
  const actualTree = resolveOid(options, `${candidate.privateCommit}^{tree}`, 'candidate commit tree');
  if (actualTree !== candidate.tree) fail('GIT_CANDIDATE_MISMATCH', 'candidate commit tree does not match its record');
  const parentCommit = resolveOid(options, `${candidate.privateCommit}^`, 'candidate parent commit');
  const parentTree = resolveOid(options, `${parentCommit}^{tree}`, 'candidate parent tree');
  if (parentTree !== candidate.baseTree) fail('GIT_CANDIDATE_MISMATCH', 'candidate base tree does not match its commit parent');
  const changedPaths = changedPathsBetweenTrees({ ...options, fromTree: candidate.baseTree, toTree: candidate.tree });
  if (canonicalJson(changedPaths) !== canonicalJson(candidate.changedPaths)) {
    fail('GIT_CANDIDATE_MISMATCH', 'candidate changed paths are not the actual tree delta');
  }
  const actualPatchDigest = patchDigest(options, candidate.baseTree, candidate.tree);
  if (actualPatchDigest !== candidate.patchDigest) {
    fail('GIT_CANDIDATE_MISMATCH', 'candidate patch digest is not the actual tree delta');
  }
  return Object.freeze({ format, parentCommit, parentTree, changedPaths, patchDigest: actualPatchDigest });
}

/**
 * Imports an already-frozen attempt delta into the controller-owned Git object store.
 * Worker Git administration is never trusted: the controller rebuilds the tree from
 * ordinary workspace files after exact process-domain emptiness is established.
 */
export function ingestAttemptCandidate({
  repositoryRoot,
  workspaceRoot,
  gitExecutable,
  binding,
  candidateId,
  attemptId,
  baseCommit,
  inspection,
  processExpectation,
  processEvidence,
  allowedPaths,
  createdAt,
  commitMetadata,
  capability,
}) {
  assertProtectedImplementationCapability(capability, 'git_admin');
  const process = classifyProcessDomain(processExpectation, processEvidence);
  if (!process.empty) fail('GIT_PROCESS_NOT_EMPTY', `attempt process domain is not empty: ${process.code}`);
  const options = { repositoryRoot, gitExecutable, capability };
  physicalDirectory(repositoryRoot, 'repository root');
  const workspace = physicalDirectory(workspaceRoot, 'attempt workspace');
  validateBinding(binding);
  validateControllerId(candidateId, 'candidate ID');
  validateControllerId(attemptId, 'attempt ID');
  validateTimestamp(createdAt, 'candidate creation time');
  validateCommitMetadata(commitMetadata);
  const format = objectFormat(options);
  oid(baseCommit, format, 'candidate base commit');
  const baseTree = resolveOid(options, `${baseCommit}^{tree}`, 'candidate base tree');
  if (!plainObject(inspection)) fail('GIT_INPUT_INVALID', 'attempt inspection is invalid');
  exactKeys(inspection, ['workspaceIdentity', 'changedPaths', 'entries', 'ownershipDigest', 'inspectionDigest'],
    'attempt inspection');
  if (!plainObject(inspection.workspaceIdentity) ||
      Object.keys(inspection.workspaceIdentity).sort().join(',') !== 'dev,digest,ino,mode,path' ||
      inspection.workspaceIdentity.path !== workspaceRoot ||
      inspection.workspaceIdentity.dev !== workspace.dev ||
      inspection.workspaceIdentity.ino !== workspace.ino ||
      inspection.workspaceIdentity.digest !== canonicalDigest({
        path: inspection.workspaceIdentity.path,
        dev: inspection.workspaceIdentity.dev,
        ino: inspection.workspaceIdentity.ino,
        mode: inspection.workspaceIdentity.mode,
      })) {
    fail('GIT_WORKSPACE_STALE', 'attempt workspace identity changed after inspection');
  }
  validateDigest(inspection.ownershipDigest, 'attempt ownership digest');
  validateDigest(inspection.inspectionDigest, 'attempt inspection digest');
  sortedUniquePaths(inspection.changedPaths, 'attempt changed paths');
  validateAllowedPaths(inspection.changedPaths, allowedPaths);
  if (!Array.isArray(inspection.entries) || inspection.entries.length !== inspection.changedPaths.length ||
      canonicalDigest({ workspace: inspection.workspaceIdentity, changedPaths: inspection.changedPaths,
        entries: inspection.entries }) !== inspection.inspectionDigest) {
    fail('GIT_INPUT_INVALID', 'attempt inspection content is invalid');
  }
  const entries = new Map();
  for (const [index, entry] of inspection.entries.entries()) {
    exactKeys(entry, ['path', 'kind', 'identity', 'contentDigest'],
      `attempt inspection entry ${index}`);
    if (entry.path !== inspection.changedPaths[index] || !['file', 'deleted'].includes(entry.kind) ||
        (entry.kind === 'file' && (typeof entry.identity !== 'string' ||
          typeof entry.contentDigest !== 'string')) ||
        (entry.kind === 'deleted' && (entry.identity !== null || entry.contentDigest !== null))) {
      fail('GIT_INPUT_INVALID', 'attempt inspection entry is invalid');
    }
    if (entry.identity !== null) validateDigest(entry.identity, 'attempt entry identity');
    if (entry.contentDigest !== null) validateDigest(entry.contentDigest, 'attempt entry content digest');
    entries.set(entry.path, entry);
  }
  if (inspection.changedPaths.length === 0) fail('GIT_EMPTY_CANDIDATE', 'attempt has no candidate delta');

  const directory = mkdtempSync(path.join(tmpdir(), 'meta-framework-ingest-'));
  const indexFile = path.join(directory, 'index');
  try {
    runGit({ ...options, environmentAdditions: { GIT_INDEX_FILE: indexFile },
      args: ['read-tree', baseTree], operation: 'attempt ingestion index initialization' });
    for (const relativePath of inspection.changedPaths) {
      const entry = entries.get(relativePath);
      let observed;
      try {
        observed = readAttemptWorkspaceEntry(workspaceRoot, relativePath);
      } catch {
        fail('GIT_WORKSPACE_STALE', 'attempt path changed or escaped after inspection');
      }
      if (canonicalDigest(observed.entry) !== canonicalDigest(entry)) {
        fail('GIT_WORKSPACE_STALE', 'attempt path bytes or identity changed after inspection');
      }
      if (entry.kind === 'deleted') {
        updateTemporaryIndex(options, indexFile, relativePath, null);
        continue;
      }
      const blob = oid(line(runGit({ ...options, args: ['hash-object', '-w', '--stdin'],
        input: observed.bytes,
        operation: 'attempt blob publication' }).stdout, 'attempt blob'), format, 'attempt blob');
      updateTemporaryIndex(options, indexFile, relativePath,
        { mode: (observed.mode & 0o111) === 0 ? '100644' : '100755', oid: blob });
    }
    const tree = oid(line(runGit({ ...options, environmentAdditions: { GIT_INDEX_FILE: indexFile },
      args: ['write-tree'], operation: 'attempt tree publication' }).stdout,
    'attempt tree'), format, 'attempt tree');
    const privateCommit = createCommitTree(options, { tree, parentCommit: baseCommit,
      metadata: commitMetadata });
    const candidate = Object.freeze({
      schemaVersion: 1,
      candidateId,
      binding: Object.freeze({ ...binding }),
      parentCandidateId: null,
      baseTree,
      tree,
      privateCommit,
      producerAttempts: Object.freeze([attemptId]),
      changedPaths: Object.freeze([...inspection.changedPaths]),
      ownershipDigest: inspection.ownershipDigest,
      patchDigest: patchDigest(options, baseTree, tree),
      createdAt,
    });
    validateImplementationCandidate(candidate, format);
    observeCandidateFacts({ ...options, candidate });
    return candidate;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function validateCommitMetadata(metadata) {
  exactKeys(metadata, COMMIT_METADATA_KEYS, 'commit metadata');
  for (const field of ['authorName', 'authorEmail', 'committerName', 'committerEmail']) {
    validateBoundedString(metadata[field], `commit metadata.${field}`, { maxBytes: 320 });
    if (/[<>\r\n]/u.test(metadata[field])) fail('GIT_INPUT_INVALID', `commit metadata.${field} is unsafe`);
  }
  validateTimestamp(metadata.timestamp, 'commit metadata.timestamp');
  validateBoundedString(metadata.message, 'commit metadata.message');
  if (!metadata.message.endsWith('\n')) fail('GIT_INPUT_INVALID', 'commit message must end in one newline');
  return metadata;
}

function commitObjectBytes({ tree, parentCommit, metadata }) {
  const seconds = Math.floor(Date.parse(metadata.timestamp) / 1_000);
  const header = [
    `tree ${tree}`,
    `parent ${parentCommit}`,
    `author ${metadata.authorName} <${metadata.authorEmail}> ${seconds} +0000`,
    `committer ${metadata.committerName} <${metadata.committerEmail}> ${seconds} +0000`,
    '',
    metadata.message,
  ].join('\n');
  return Buffer.from(header, 'utf8');
}

function objectDigest(format, type, bytes) {
  return createHash(format.name).update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}

export function expectedCompletionCommit({
  repositoryRoot,
  gitExecutable,
  tree,
  parentCommit,
  metadata,
}) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  oid(tree, format, 'commit tree');
  oid(parentCommit, format, 'commit parent');
  validateCommitMetadata(metadata);
  return objectDigest(format, 'commit', commitObjectBytes({ tree, parentCommit, metadata }));
}

function createCommitTree(options, { tree, parentCommit, metadata }) {
  assertProtectedImplementationCapability(options.capability, 'git_admin');
  const format = objectFormat(options);
  oid(tree, format, 'commit tree');
  oid(parentCommit, format, 'commit parent');
  validateCommitMetadata(metadata);
  const seconds = Math.floor(Date.parse(metadata.timestamp) / 1_000);
  const expected = objectDigest(format, 'commit', commitObjectBytes({ tree, parentCommit, metadata }));
  const result = runGit({
    ...options,
    args: ['commit-tree', tree, '-p', parentCommit],
    input: Buffer.from(metadata.message, 'utf8'),
    environmentAdditions: {
      GIT_AUTHOR_NAME: metadata.authorName,
      GIT_AUTHOR_EMAIL: metadata.authorEmail,
      GIT_AUTHOR_DATE: `${seconds} +0000`,
      GIT_COMMITTER_NAME: metadata.committerName,
      GIT_COMMITTER_EMAIL: metadata.committerEmail,
      GIT_COMMITTER_DATE: `${seconds} +0000`,
    },
    operation: 'Git commit-tree effect',
  });
  const commit = oid(line(result.stdout, 'Git commit-tree result'), format, 'completion commit');
  if (commit !== expected) fail('GIT_COMMIT_MISMATCH', 'Git commit-tree did not create the exact planned commit');
  return commit;
}

function sameTreeEntry(left, right) {
  return left === null ? right === null : right !== null && left.mode === right.mode && left.oid === right.oid;
}

function updateTemporaryIndex(options, indexFile, relativePath, entry) {
  const environmentAdditions = { GIT_INDEX_FILE: indexFile };
  if (entry === null) {
    runGit({
      ...options,
      environmentAdditions,
      args: ['update-index', '--force-remove', '--', relativePath],
      operation: 'Git private deletion integration effect',
    });
    return;
  }
  runGit({
    ...options,
    environmentAdditions,
    args: ['update-index', '--add', '--cacheinfo', `${entry.mode},${entry.oid},${relativePath}`],
    operation: 'Git private blob integration effect',
  });
}

// Merge through a controller-owned temporary index and the built-in merge-file
// algorithm. This deliberately bypasses repository-configured merge drivers and
// worktree filters, either of which could otherwise execute an external command.
function mergeCandidateTrees(options, { baseTree, currentTree, incomingTree, changedPaths }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'meta-framework-merge-'));
  const indexFile = path.join(directory, 'index');
  try {
    runGit({
      ...options,
      environmentAdditions: { GIT_INDEX_FILE: indexFile },
      args: ['read-tree', currentTree],
      operation: 'Git private-index initialization effect',
    });
    for (const [index, relativePath] of changedPaths.entries()) {
      const base = treeEntry(options, baseTree, relativePath);
      const ours = treeEntry(options, currentTree, relativePath);
      const theirs = treeEntry(options, incomingTree, relativePath);
      if (sameTreeEntry(ours, theirs) || sameTreeEntry(theirs, base)) continue;
      if (sameTreeEntry(ours, base)) {
        updateTemporaryIndex(options, indexFile, relativePath, theirs);
        continue;
      }
      if (base === null || ours === null || theirs === null) {
        fail('GIT_CONFLICT', 'incoming candidate has an overlapping add/delete conflict');
      }
      let mode;
      if (ours.mode === theirs.mode) mode = ours.mode;
      else if (ours.mode === base.mode) mode = theirs.mode;
      else if (theirs.mode === base.mode) mode = ours.mode;
      else fail('GIT_CONFLICT', 'incoming candidate has an overlapping mode conflict');
      const blobs = [ours, base, theirs].map((entry) => runGit({
        ...options,
        args: ['cat-file', 'blob', entry.oid],
        operation: 'Git merge blob observation',
      }).stdout);
      if (blobs.some((bytes) => bytes.includes(0))) {
        fail('GIT_CONFLICT', 'incoming candidate has an overlapping binary conflict');
      }
      const files = blobs.map((bytes, blobIndex) => {
        const file = path.join(directory, `merge-${index}-${blobIndex}`);
        writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
        return file;
      });
      const merged = runGit({
        ...options,
        args: ['merge-file', '--stdout', files[0], files[1], files[2]],
        acceptedStatuses: [0, 1],
        operation: 'Git built-in file merge effect',
      });
      if (merged.status === 1) fail('GIT_CONFLICT', 'incoming candidate conflicts with the private head');
      const mergedOid = line(runGit({
        ...options,
        args: ['hash-object', '-w', '--stdin'],
        input: merged.stdout,
        operation: 'Git merged-blob publication effect',
      }).stdout, 'Git merged blob');
      oid(mergedOid, objectFormat(options), 'merged blob');
      updateTemporaryIndex(options, indexFile, relativePath, { mode, oid: mergedOid });
    }
    const mergedTree = line(runGit({
      ...options,
      environmentAdditions: { GIT_INDEX_FILE: indexFile },
      args: ['write-tree'],
      operation: 'Git private merged-tree effect',
    }).stdout, 'Git private merged tree');
    return oid(mergedTree, objectFormat(options), 'merged tree');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function integratePrivateCandidate({
  repositoryRoot,
  gitExecutable,
  currentCandidate,
  incomingCandidate,
  expectedPrivateHead,
  binding,
  candidateId,
  producerAttempts,
  allowedPaths,
  ownershipDigest,
  createdAt,
  commitMetadata,
  capability,
}) {
  assertProtectedImplementationCapability(capability, 'git_admin');
  const options = { repositoryRoot, gitExecutable, capability };
  const format = objectFormat(options);
  validateImplementationCandidate(currentCandidate, format);
  validateImplementationCandidate(incomingCandidate, format);
  validateBinding(binding);
  validateControllerId(candidateId, 'integrated candidate ID');
  sortedUniqueIds(producerAttempts, 'integrated candidate producer attempts');
  validateDigest(ownershipDigest, 'integrated candidate ownership digest');
  validateTimestamp(createdAt, 'integrated candidate creation time');
  validateCommitMetadata(commitMetadata);
  oid(expectedPrivateHead, format, 'expected private head');
  if (!receiptBindingAuthorizesCurrent(binding, currentCandidate.binding) ||
      !receiptBindingAuthorizesCurrent(binding, incomingCandidate.binding)) {
    fail('GIT_STALE_BINDING', 'candidate binding is not current');
  }
  if (currentCandidate.privateCommit !== expectedPrivateHead) {
    fail('GIT_STALE_PRIVATE_HEAD', 'the integration private head is stale');
  }
  observeCandidateFacts({ ...options, candidate: currentCandidate });
  const incomingFacts = observeCandidateFacts({ ...options, candidate: incomingCandidate });
  validateAllowedPaths(incomingFacts.changedPaths, allowedPaths);

  const ancestor = runGit({
    ...options,
    args: ['merge-base', '--is-ancestor', incomingFacts.parentCommit, currentCandidate.privateCommit],
    acceptedStatuses: [0, 1],
    operation: 'Git candidate ancestry observation',
  }).status;
  if (ancestor !== 0) fail('GIT_STALE_BASE', 'incoming candidate base is not an ancestor of the private head');

  const alreadyIntegrated = runGit({
    ...options,
    args: ['merge-base', '--is-ancestor', incomingCandidate.privateCommit, currentCandidate.privateCommit],
    acceptedStatuses: [0, 1],
    operation: 'Git duplicate-candidate observation',
  }).status === 0;
  if (alreadyIntegrated) {
    return Object.freeze({ outcome: 'already_integrated', candidate: currentCandidate });
  }

  const mergedTree = mergeCandidateTrees(options, {
    baseTree: incomingCandidate.baseTree,
    currentTree: currentCandidate.tree,
    incomingTree: incomingCandidate.tree,
    changedPaths: incomingFacts.changedPaths,
  });
  const changedPaths = changedPathsBetweenTrees({
    ...options,
    fromTree: currentCandidate.tree,
    toTree: mergedTree,
  });
  validateAllowedPaths(changedPaths, allowedPaths);
  if (changedPaths.length === 0) {
    return Object.freeze({ outcome: 'already_integrated', candidate: currentCandidate });
  }
  const privateCommit = createCommitTree(options, {
    tree: mergedTree,
    parentCommit: currentCandidate.privateCommit,
    metadata: commitMetadata,
  });
  const candidate = Object.freeze({
    schemaVersion: 1,
    candidateId,
    binding: Object.freeze({ ...binding }),
    parentCandidateId: currentCandidate.candidateId,
    baseTree: currentCandidate.tree,
    tree: mergedTree,
    privateCommit,
    producerAttempts: Object.freeze([...producerAttempts]),
    changedPaths,
    ownershipDigest,
    patchDigest: patchDigest(options, currentCandidate.tree, mergedTree),
    createdAt,
  });
  validateImplementationCandidate(candidate, format);
  return Object.freeze({
    outcome: 'integrated',
    candidate,
    source: incomingCandidate.candidateId,
    previousPrivateHead: currentCandidate.privateCommit,
  });
}

function treeEntry(options, tree, relativePath) {
  validateRepositoryPath(relativePath);
  const result = runGit({
    ...options,
    args: ['ls-tree', '-z', tree, '--', relativePath],
    operation: 'Git tree-entry observation',
  }).stdout;
  if (result.length === 0) return null;
  const items = nulItems(result, 'Git tree entry');
  if (items.length !== 1) fail('GIT_OUTPUT_INVALID', 'Git tree entry is ambiguous');
  const tab = items[0].indexOf('\t');
  if (tab < 0 || items[0].slice(tab + 1) !== relativePath) fail('GIT_OUTPUT_INVALID', 'Git tree entry path is invalid');
  const header = items[0].slice(0, tab).split(' ');
  if (header.length !== 3 || header[1] !== 'blob') fail('GIT_TREE_UNSAFE', 'only ordinary blob paths are supported');
  const format = objectFormat(options);
  oid(header[2], format, 'tree blob');
  if (!['100644', '100755'].includes(header[0])) fail('GIT_TREE_UNSAFE', 'only regular files are supported');
  return Object.freeze({ mode: header[0], oid: header[2] });
}

function safeTarget(repositoryRoot, relativePath, { createParents = false } = {}) {
  const parts = relativePath.split('/');
  let current = repositoryRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!existsSync(current)) {
      if (!createParents) return null;
      mkdirSync(current, { mode: 0o700 });
    }
    const info = lstatSync(current);
    const real = realpathSync(current);
    const relative = path.relative(repositoryRoot, real);
    if (!info.isDirectory() || info.isSymbolicLink() || relative.startsWith('..') || path.isAbsolute(relative)) {
      fail('GIT_WORKTREE_UNSAFE', 'a worktree parent is linked or escapes the repository');
    }
  }
  return path.join(repositoryRoot, ...parts);
}

function fileMatchesEntry(options, relativePath, entry) {
  const target = safeTarget(options.repositoryRoot, relativePath);
  if (entry === null) return target === null || !existsSync(target);
  if (target === null || !existsSync(target)) return false;
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return false;
  const expectedMode = entry.mode === '100755' ? 0o755 : 0o644;
  if ((info.mode & 0o777) !== expectedMode) return false;
  const expected = runGit({
    ...options,
    args: ['cat-file', 'blob', entry.oid],
    operation: 'Git blob observation',
  }).stdout;
  return readFileSync(target).equals(expected);
}

export function worktreePathsMatchTree({ repositoryRoot, gitExecutable, tree, paths }) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  oid(tree, format, 'worktree comparison tree');
  sortedUniquePaths(paths, 'worktree comparison paths', { maximumItems: 10_000 });
  return paths.every((relativePath) => fileMatchesEntry(options, relativePath, treeEntry(options, tree, relativePath)));
}

export function indexMatchesTree({ repositoryRoot, gitExecutable, tree }) {
  const options = { repositoryRoot, gitExecutable };
  oid(tree, objectFormat(options), 'index comparison tree');
  return runGit({
    ...options,
    args: ['diff-index', '--cached', '--quiet', tree, '--'],
    acceptedStatuses: [0, 1],
    operation: 'Git index-tree comparison',
  }).status === 0;
}

function writeBlobFile(options, relativePath, entry, operationId) {
  const target = safeTarget(options.repositoryRoot, relativePath, { createParents: true });
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      fail('GIT_WORKTREE_UNSAFE', 'a changed worktree path is linked or special');
    }
  }
  const bytes = runGit({ ...options, args: ['cat-file', 'blob', entry.oid], operation: 'Git blob materialization' }).stdout;
  const suffix = createHash('sha256').update(`${operationId}\0${relativePath}`).digest('hex').slice(0, 16);
  const temporary = path.join(path.dirname(target), `.meta-framework-${suffix}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
      (constants.O_NOFOLLOW ?? 0), entry.mode === '100755' ? 0o700 : 0o600);
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, entry.mode === '100755' ? 0o755 : 0o644);
    renameSync(temporary, target);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    fail('GIT_EFFECT_AMBIGUOUS', 'worktree materialization did not complete atomically', {
      causeCode: error?.code ?? null,
    });
  }
}

export function applyCandidateTree({
  repositoryRoot,
  gitExecutable,
  operationId,
  expectedTree,
  targetTree,
  allowedPaths,
  capability,
}) {
  assertProtectedImplementationCapability(capability, 'git_admin');
  validateControllerId(operationId, 'Git apply operation ID');
  const options = { repositoryRoot, gitExecutable, capability };
  const format = objectFormat(options);
  oid(expectedTree, format, 'expected worktree tree');
  oid(targetTree, format, 'target worktree tree');
  const paths = changedPathsBetweenTrees({ ...options, fromTree: expectedTree, toTree: targetTree });
  validateAllowedPaths(paths, allowedPaths);
  const sourceMatches = worktreePathsMatchTree({ ...options, tree: expectedTree, paths });
  const targetMatches = worktreePathsMatchTree({ ...options, tree: targetTree, paths });
  const indexAtSource = indexMatchesTree({ ...options, tree: expectedTree });
  const indexAtTarget = indexMatchesTree({ ...options, tree: targetTree });
  if (targetMatches && indexAtTarget) return Object.freeze({ outcome: 'already_applied', paths });
  if (!((sourceMatches && indexAtSource) || (targetMatches && indexAtSource))) {
    fail('GIT_EFFECT_AMBIGUOUS', 'candidate apply precondition or partial-effect state is ambiguous');
  }
  if (!targetMatches) {
    for (const relativePath of paths) {
      const entry = treeEntry(options, targetTree, relativePath);
      const target = safeTarget(repositoryRoot, relativePath);
      if (entry === null) {
        if (target !== null && existsSync(target)) {
          const info = lstatSync(target);
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
            fail('GIT_WORKTREE_UNSAFE', 'a deleted worktree path is linked or special');
          }
          unlinkSync(target);
        }
      } else {
        writeBlobFile(options, relativePath, entry, operationId);
      }
    }
  }
  runGit({ ...options, args: ['read-tree', targetTree], operation: 'Git candidate index effect' });
  if (!worktreePathsMatchTree({ ...options, tree: targetTree, paths }) ||
      !indexMatchesTree({ ...options, tree: targetTree })) {
    fail('GIT_EFFECT_AMBIGUOUS', 'candidate apply postcondition is not exact');
  }
  return Object.freeze({ outcome: 'applied', paths });
}

export function stageExactPaths({
  repositoryRoot,
  gitExecutable,
  baseTree,
  paths,
  capability,
}) {
  assertProtectedImplementationCapability(capability, 'git_admin');
  const options = { repositoryRoot, gitExecutable, capability };
  oid(baseTree, objectFormat(options), 'staging base tree');
  sortedUniquePaths(paths, 'staging paths');
  if (!indexMatchesTree({ ...options, tree: baseTree })) {
    fail('GIT_STALE_INDEX', 'canonical index does not match the exact staging base');
  }
  for (const relativePath of paths) {
    const target = safeTarget(repositoryRoot, relativePath);
    if (target === null || !existsSync(target)) {
      runGit({ ...options, args: ['update-index', '--force-remove', '--', relativePath],
        operation: 'Git exact deletion staging effect' });
      continue;
    }
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      fail('GIT_WORKTREE_UNSAFE', 'an exact staging path is linked or special');
    }
    const blob = line(runGit({
      ...options,
      args: ['hash-object', '-w', '--no-filters', '--', relativePath],
      operation: 'Git exact blob staging effect',
    }).stdout, 'Git staged blob');
    oid(blob, objectFormat(options), 'staged blob');
    const mode = (info.mode & 0o111) === 0 ? '100644' : '100755';
    runGit({
      ...options,
      args: ['update-index', '--add', '--cacheinfo', `${mode},${blob},${relativePath}`],
      operation: 'Git exact index staging effect',
    });
  }
  const stagedTree = line(runGit({
    ...options,
    args: ['write-tree'],
    operation: 'Git exact staged-tree effect',
  }).stdout, 'Git staged tree');
  return oid(stagedTree, objectFormat(options), 'staged tree');
}

export function writeIndexTree({ repositoryRoot, gitExecutable, capability }) {
  assertProtectedImplementationCapability(capability, 'git_admin');
  const options = { repositoryRoot, gitExecutable, capability };
  return oid(line(runGit({ ...options, args: ['write-tree'], operation: 'Git write-tree effect' }).stdout,
    'Git write-tree result'), objectFormat(options), 'index tree');
}

export function createCompletionCommit({
  repositoryRoot,
  gitExecutable,
  tree,
  parentCommit,
  metadata,
  capability,
}) {
  const options = { repositoryRoot, gitExecutable, capability };
  const commit = createCommitTree(options, { tree, parentCommit, metadata });
  const actualTree = resolveOid(options, `${commit}^{tree}`, 'completion commit tree');
  const actualParent = resolveOid(options, `${commit}^`, 'completion commit parent');
  if (actualTree !== tree || actualParent !== parentCommit) {
    fail('GIT_COMMIT_MISMATCH', 'completion commit facts are not exact');
  }
  return Object.freeze({ commit, tree, parentCommit, metadataDigest: canonicalDigest(metadata) });
}

export function observeCompletionCommit({
  repositoryRoot,
  gitExecutable,
  commit,
}) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  oid(commit, format, 'completion commit');
  const existence = runGit({
    ...options,
    args: ['cat-file', '-e', `${commit}^{commit}`],
    acceptedStatuses: [0, 1, 128],
    operation: 'Git completion-commit existence observation',
  });
  if (existence.status !== 0) return null;
  return Object.freeze({
    commit,
    tree: resolveOid(options, `${commit}^{tree}`, 'completion commit tree'),
    parentCommit: resolveOid(options, `${commit}^`, 'completion commit parent'),
  });
}

export function observeCommitTree({ repositoryRoot, gitExecutable, commit }) {
  const options = { repositoryRoot, gitExecutable };
  const format = objectFormat(options);
  oid(commit, format, 'commit');
  return resolveOid(options, `${commit}^{tree}`, 'commit tree');
}

export function observeRef({ repositoryRoot, gitExecutable, refName }) {
  validateBoundedString(refName, 'Git ref', { maxBytes: 512 });
  if (!refName.startsWith('refs/') || refName.includes('..') || refName.endsWith('/') ||
      /[~^:?*\[\\\s]/u.test(refName)) fail('GIT_INPUT_INVALID', 'Git ref is unsafe');
  const result = runGit({
    repositoryRoot,
    gitExecutable,
    args: ['show-ref', '--verify', '--hash', refName],
    acceptedStatuses: [0, 1],
    operation: 'Git ref observation',
  });
  if (result.status === 1) return null;
  return oid(line(result.stdout, 'Git ref result'), objectFormat({ repositoryRoot, gitExecutable }), 'Git ref OID');
}

export function observeCanonicalHead({ repositoryRoot, gitExecutable }) {
  const options = { repositoryRoot, gitExecutable };
  const symbolic = runGit({
    ...options,
    args: ['symbolic-ref', '-q', 'HEAD'],
    acceptedStatuses: [0, 1],
    operation: 'Git symbolic HEAD observation',
  });
  const refName = symbolic.status === 0 ? line(symbolic.stdout, 'Git symbolic HEAD') : null;
  const commit = resolveOid(options, 'HEAD^{commit}', 'canonical HEAD');
  return Object.freeze({ refName, commit });
}

export function compareAndSwapRef({
  repositoryRoot,
  gitExecutable,
  refName,
  expectedOldOid,
  newOid,
  capability,
}) {
  assertProtectedImplementationCapability(capability, 'final_ref');
  const options = { repositoryRoot, gitExecutable, capability };
  const format = objectFormat(options);
  oid(expectedOldOid, format, 'expected old ref OID');
  oid(newOid, format, 'new ref OID');
  const actual = observeRef({ ...options, refName });
  if (actual === newOid) return Object.freeze({ outcome: 'already_applied', observedOid: actual });
  if (actual !== expectedOldOid) {
    fail('GIT_STALE_REF', 'target ref no longer equals its expected old OID', { observedOid: actual });
  }
  runGit({
    ...options,
    args: ['update-ref', '--no-deref', refName, newOid, expectedOldOid],
    operation: 'Git expected-old-OID ref effect',
  });
  const observedOid = observeRef({ ...options, refName });
  if (observedOid !== newOid) fail('GIT_EFFECT_AMBIGUOUS', 'target ref postcondition is not exact');
  return Object.freeze({ outcome: 'advanced', observedOid });
}
