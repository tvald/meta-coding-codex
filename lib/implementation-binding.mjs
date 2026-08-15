import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fsyncSync,
  fstatSync,
  linkSync,
  openSync,
  readSync,
  unlinkSync,
  realpathSync,
  statSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import { authorizeImplementationOperation } from './implementation-activation.mjs';
import { assertImplementationEffectCapability } from './implementation-effect-capability.mjs';
import {
  ASSIGNMENT_ROLES,
  canonicalJson,
  canonicalDigest,
  parseCanonicalJson,
  sha256Digest,
  validateBinding,
  validateControllerId,
  validateDigest,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_BINDING_VERSION = 1;
export const IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES = 32 * 1024;
export const CONTROLLER_DESCRIPTOR_ENV = 'META_FRAMEWORK_CONTROLLER_DESCRIPTOR';

export const IMPLEMENTATION_BINDING_COMPATIBILITY = Object.freeze({
  version: '1.1.0',
  descriptorVersions: Object.freeze([IMPLEMENTATION_BINDING_VERSION]),
  harnesses: Object.freeze(['codex']),
  hookEvents: Object.freeze(['SessionStart']),
  sources: Object.freeze(['startup', 'resume', 'clear', 'compact']),
});

export const IMPLEMENTATION_ROLE_PROFILES = Object.freeze({
  root_analysis: 'root',
  root_decision: 'root',
  implementer: 'implementer',
  reviewer: 'reviewer',
  qa: 'qa',
  security: 'security',
});

const DESCRIPTOR_KEYS = Object.freeze([
  'schemaVersion', 'descriptorId', 'binding', 'assignmentId', 'attemptId', 'jobId',
  'launcherConnectionId', 'role', 'profile', 'profileDigest', 'promptDigest',
  'cwdIdentity', 'descriptorPathIdentity',
]);
const TRUSTED_DESCRIPTOR_KEYS = Object.freeze([
  'schemaVersion', 'descriptorId', 'descriptorDigest', 'bindingDigest', 'profileDigest',
  'promptDigest', 'descriptorPathIdentity', 'launcherConnectionId', 'jobId', 'cwdIdentity',
]);
const SESSION_EVENT_KEYS = Object.freeze([
  'schemaVersion', 'hookEventName', 'source', 'sessionId', 'descriptorId',
  'descriptorDigest', 'descriptorPathIdentity', 'launcherConnectionId', 'jobId',
  'cwdIdentity',
]);
const PRIOR_SESSION_KEYS = Object.freeze([
  'schemaVersion', 'sessionId', 'descriptorId', 'descriptorDigest', 'bindingDigest',
  'role', 'profileDigest', 'promptDigest',
]);
const TRUSTED_DESCRIPTOR_OBSERVATIONS = new WeakSet();
const DESCRIPTOR_PATH_IDENTITY_KIND = 'controller_binding_descriptor';
const DESCRIPTOR_DRAFT_KEYS = Object.freeze(DESCRIPTOR_KEYS.filter((key) =>
  key !== 'descriptorPathIdentity'));

export class ImplementationBindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationBindingError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationBindingError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('BINDING_SCHEMA_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('BINDING_SCHEMA_INVALID', `${label} has unknown or missing fields`);
  }
}

function protocol(callback, label) {
  try {
    return callback();
  } catch (error) {
    fail('BINDING_SCHEMA_INVALID', `${label} is invalid: ${error.message}`);
  }
}

function digestFields(value, fields, label) {
  for (const field of fields) protocol(() => validateDigest(value[field], `${label}.${field}`), `${label}.${field}`);
}

function idFields(value, fields, label) {
  for (const field of fields) {
    protocol(() => validateControllerId(value[field], `${label}.${field}`), `${label}.${field}`);
  }
}

function version(value, label) {
  if (value !== IMPLEMENTATION_BINDING_VERSION) {
    fail('BINDING_VERSION_UNSUPPORTED', `${label} schemaVersion is unsupported`);
  }
}

function bytes(value, label) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value !== 'string') fail('PROMPT_INVALID', `${label} must be bytes or text`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('PROMPT_INVALID', `${label} contains invalid Unicode`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail('PROMPT_INVALID', `${label} contains invalid Unicode`);
    }
  }
  return Buffer.from(value, 'utf8');
}

function compiledPromptIdentity(value) {
  const prompt = bytes(value, 'compiled controller prompt');
  const firstNewline = prompt.indexOf(0x0a);
  const secondNewline = firstNewline < 0 ? -1 : prompt.indexOf(0x0a, firstNewline + 1);
  if (firstNewline < 0 || secondNewline < 0 ||
      prompt.subarray(0, firstNewline).toString('utf8') !== 'META-FRAMEWORK-AGENT-PROMPT 1') {
    fail('PROMPT_INVALID', 'compiled controller prompt envelope is invalid');
  }
  let manifest;
  try {
    manifest = parseCanonicalJson(prompt.subarray(firstNewline + 1, secondNewline), {
      maxBytes: IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES,
    });
  } catch {
    fail('PROMPT_INVALID', 'compiled controller prompt manifest is not strict canonical JSON');
  }
  if (!plainObject(manifest) || typeof manifest.profile !== 'string' ||
      manifest.harness !== 'codex' || !validDigestValue(manifest.digest)) {
    fail('PROMPT_INVALID', 'compiled controller prompt binding is invalid');
  }
  const unsigned = { ...manifest };
  delete unsigned.digest;
  const embeddedDigest = sha256Digest(Buffer.concat([
    Buffer.from(canonicalJson(unsigned), 'utf8'),
    Buffer.from('\n'),
    prompt.subarray(secondNewline + 1),
  ]));
  if (embeddedDigest !== manifest.digest) {
    fail('PROMPT_INVALID', 'compiled controller prompt embedded digest is invalid');
  }
  return Object.freeze({ prompt, profile: manifest.profile, profileDigest: manifest.digest });
}

export function inspectCompiledControllerPrompt(value) {
  return compiledPromptIdentity(value);
}

function validDigestValue(value) {
  try {
    validateDigest(value, 'digest');
    return true;
  } catch {
    return false;
  }
}

export function validateControllerBindingDescriptor(value) {
  exactKeys(value, DESCRIPTOR_KEYS, 'controller binding descriptor');
  version(value.schemaVersion, 'controller binding descriptor');
  idFields(value, ['descriptorId', 'assignmentId', 'attemptId', 'jobId', 'launcherConnectionId'],
    'controller binding descriptor');
  protocol(() => validateBinding(value.binding, 'controller binding descriptor.binding'),
    'controller binding descriptor.binding');
  if (!ASSIGNMENT_ROLES.includes(value.role)) {
    fail('ROLE_UNSUPPORTED', 'controller binding descriptor.role is unsupported');
  }
  const requiredProfile = IMPLEMENTATION_ROLE_PROFILES[value.role];
  if (value.profile !== requiredProfile) {
    fail('ROLE_PROFILE_MISMATCH', 'controller role cannot use the requested profile');
  }
  digestFields(value,
    ['profileDigest', 'promptDigest', 'cwdIdentity', 'descriptorPathIdentity'],
    'controller binding descriptor');
  return value;
}

function validateTrustedDescriptorObservationShape(value) {
  exactKeys(value, TRUSTED_DESCRIPTOR_KEYS, 'trusted descriptor observation');
  version(value.schemaVersion, 'trusted descriptor observation');
  idFields(value, ['descriptorId', 'launcherConnectionId', 'jobId'],
    'trusted descriptor observation');
  digestFields(value, [
    'descriptorDigest', 'bindingDigest', 'profileDigest', 'promptDigest',
    'descriptorPathIdentity', 'cwdIdentity',
  ], 'trusted descriptor observation');
  return value;
}

export function validateTrustedDescriptorObservation(value) {
  validateTrustedDescriptorObservationShape(value);
  if (!TRUSTED_DESCRIPTOR_OBSERVATIONS.has(value)) {
    fail('TRUSTED_DESCRIPTOR_UNPROVEN',
      'trusted descriptor observation was not derived by the protected descriptor reader');
  }
  return value;
}

function physicalStat(value) {
  return Object.freeze({
    device: value.dev.toString(10),
    inode: value.ino.toString(10),
    size: value.size.toString(10),
    mode: value.mode.toString(10),
    links: value.nlink.toString(10),
    uid: value.uid.toString(10),
    gid: value.gid.toString(10),
    modified: value.mtimeNs.toString(10),
    changed: value.ctimeNs.toString(10),
  });
}

function samePhysicalStat(left, right) {
  return Object.keys(left).every((field) => left[field] === right[field]);
}

function physicalPathIdentity(descriptorRealpath, stats) {
  return canonicalDigest({
    schemaVersion: IMPLEMENTATION_BINDING_VERSION,
    kind: DESCRIPTOR_PATH_IDENTITY_KIND,
    realpath: descriptorRealpath,
    device: stats.device,
    inode: stats.inode,
    size: Number(stats.size),
  });
}

function normalizedPhysicalDirectory(directory) {
  if (typeof directory !== 'string' || directory.length === 0 || directory.includes('\0') ||
      !path.isAbsolute(directory) || path.normalize(directory) !== directory) {
    fail('DESCRIPTOR_DIRECTORY_UNSAFE',
      'controller descriptor directory must be one normalized absolute path');
  }
  let real;
  let stats;
  try {
    real = realpathSync(directory);
    stats = statSync(real, { bigint: true });
  } catch {
    fail('DESCRIPTOR_DIRECTORY_UNSAFE', 'controller descriptor directory cannot be observed');
  }
  const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  if (process.platform !== 'linux' || effectiveUid === null ||
      real !== directory || (stats.mode & 0o170000n) !== 0o040000n ||
      stats.uid !== BigInt(effectiveUid) || (stats.mode & 0o022n) !== 0n) {
    fail('DESCRIPTOR_DIRECTORY_UNSAFE',
      'controller descriptor directory must be physical, owner-held, and not group/world writable');
  }
  return directory;
}

function descriptorFilename(descriptorId) {
  protocol(() => validateControllerId(descriptorId, 'controller descriptor ID'),
    'controller descriptor ID');
  return `${descriptorId}.json`;
}

function writeAll(fd, value) {
  let offset = 0;
  while (offset < value.length) {
    const written = writeSync(fd, value, offset, value.length - offset, offset);
    if (written < 1) fail('DESCRIPTOR_PUBLICATION_FAILED', 'controller descriptor write was incomplete');
    offset += written;
  }
}

/**
 * Publishes one protected descriptor without exposing a partially populated target.
 * The temporary hard link makes the target fail closed (nlink=2) until publication
 * completes; removing the temporary name leaves the reader's required single link.
 */
export function publishControllerBindingDescriptor({
  directory,
  descriptor,
  effectCapability = null,
  activationReceipt = null,
  activationContext = null,
  now = null,
} = {}) {
  try {
    assertImplementationEffectCapability(effectCapability, 'provider_launch');
  } catch {
    fail('ACTIVATION_REQUIRED',
      'controller descriptor publication requires a protected provider capability');
  }
  normalizedPhysicalDirectory(directory);
  exactKeys(descriptor, DESCRIPTOR_DRAFT_KEYS, 'controller binding descriptor draft');
  const authorization = authorizeImplementationOperation({ operationKind: 'provider_launch',
    receipt: activationReceipt, current: activationContext, now });
  const bindingMatches = activationReceipt?.binding !== null &&
    ['runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
      'controlGeneration', 'correctionGeneration']
      .every((field) => activationReceipt?.binding?.[field] === descriptor.binding?.[field]);
  if (authorization.authorized !== true || !bindingMatches) {
    fail('ACTIVATION_REQUIRED',
      'controller descriptor publication requires current provider launch activation');
  }
  const filename = descriptorFilename(descriptor.descriptorId);
  const descriptorPath = path.join(directory, filename);
  if (path.dirname(descriptorPath) !== directory || path.normalize(descriptorPath) !== descriptorPath) {
    fail('DESCRIPTOR_PATH_UNSAFE', 'controller descriptor target escaped its directory');
  }
  if (process.platform !== 'linux' || fsConstants.O_NOFOLLOW === undefined) {
    fail('DESCRIPTOR_PLATFORM_UNSUPPORTED', 'protected descriptor publication requires Linux O_NOFOLLOW');
  }

  const temporaryName = `.${filename}.${process.pid}.${Date.now().toString(36)}.tmp`;
  const temporaryPath = path.join(directory, temporaryName);
  let fd;
  let targetLinked = false;
  try {
    fd = openSync(temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600);
    fchmodSync(fd, 0o600);
    const provisional = canonicalJson({ ...descriptor, descriptorPathIdentity: `sha256:${'0'.repeat(64)}` });
    const provisionalBytes = Buffer.from(provisional, 'utf8');
    if (provisionalBytes.length < 1 || provisionalBytes.length > IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES) {
      fail('DESCRIPTOR_SIZE_INVALID', 'controller descriptor exceeds its fixed byte bound');
    }
    writeAll(fd, provisionalBytes);
    const stats = fstatSync(fd, { bigint: true });
    validateDescriptorFileStat(stats);
    const descriptorPathIdentity = physicalPathIdentity(descriptorPath, physicalStat(stats));
    const value = deepFreeze({ ...descriptor, descriptorPathIdentity });
    validateControllerBindingDescriptor(value);
    const finalBytes = Buffer.from(canonicalJson(value), 'utf8');
    if (finalBytes.length !== provisionalBytes.length) {
      fail('DESCRIPTOR_PUBLICATION_FAILED',
        'controller descriptor identity replacement changed the bounded file size');
    }
    writeAll(fd, finalBytes);
    fsyncSync(fd);
    linkSync(temporaryPath, descriptorPath);
    targetLinked = true;
    unlinkSync(temporaryPath);
    const directoryFd = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    const observed = readTrustedControllerBindingDescriptor(descriptorPath);
    if (canonicalDigest(observed.descriptor) !== canonicalDigest(value)) {
      fail('DESCRIPTOR_PUBLICATION_FAILED', 'published controller descriptor failed readback');
    }
    return Object.freeze({ descriptorPath, ...observed });
  } catch (error) {
    if (targetLinked) {
      // Never remove the target after successful no-replace publication. A failed
      // readback leaves an explicit artifact for reconciliation rather than risking
      // deletion of a path that may have changed.
    } else {
      try { unlinkSync(temporaryPath); } catch { /* absent or retained for diagnosis */ }
    }
    if (error instanceof ImplementationBindingError) throw error;
    fail('DESCRIPTOR_PUBLICATION_FAILED', `controller descriptor publication failed: ${error.message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function deriveControllerCwdIdentity(cwd = process.cwd()) {
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0') ||
      !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd) {
    fail('CWD_PATH_UNSAFE', 'controller cwd must be one normalized absolute path');
  }
  let realpath;
  let stats;
  try {
    realpath = realpathSync(cwd);
    stats = statSync(realpath, { bigint: true });
  } catch {
    fail('CWD_PATH_UNSAFE', 'controller cwd cannot be observed');
  }
  if (realpath !== cwd || (stats.mode & 0o170000n) !== 0o040000n) {
    fail('CWD_PATH_UNSAFE', 'controller cwd must be one physical directory');
  }
  return canonicalDigest({
    path: realpath,
    dev: stats.dev.toString(10),
    ino: stats.ino.toString(10),
    mode: (stats.mode & 0o777n).toString(10),
  });
}

function validateDescriptorFileStat(stats) {
  const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  if (process.platform !== 'linux' || effectiveUid === null || fsConstants.O_NOFOLLOW === undefined) {
    fail('DESCRIPTOR_PLATFORM_UNSUPPORTED',
      'protected descriptor reads require Linux O_NOFOLLOW and effective-owner identity');
  }
  if ((stats.mode & 0o170000n) !== 0o100000n || (stats.mode & 0o7777n) !== 0o600n ||
      stats.nlink !== 1n || stats.uid !== BigInt(effectiveUid)) {
    fail('DESCRIPTOR_FILE_UNSAFE',
      'controller descriptor must be an owner-held 0600 ordinary single-link file');
  }
  if (stats.size < 1n || stats.size > BigInt(IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES)) {
    fail('DESCRIPTOR_SIZE_INVALID', 'controller descriptor exceeds its fixed byte bound');
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// This is the only trust-establishing descriptor surface. It accepts no environment,
// search path, caller identity fields, filesystem adapter, or descriptor constructor.
export function readTrustedControllerBindingDescriptor(descriptorPath) {
  if (typeof descriptorPath !== 'string' || descriptorPath.length === 0 ||
      descriptorPath.includes('\0') || !path.isAbsolute(descriptorPath) ||
      path.normalize(descriptorPath) !== descriptorPath) {
    fail('DESCRIPTOR_PATH_UNSAFE', 'controller descriptor path must be one normalized absolute path');
  }
  if (process.platform !== 'linux' || fsConstants.O_NOFOLLOW === undefined) {
    fail('DESCRIPTOR_PLATFORM_UNSUPPORTED', 'protected descriptor reads require Linux O_NOFOLLOW');
  }

  let descriptorFd;
  try {
    descriptorFd = openSync(descriptorPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    fail('DESCRIPTOR_PATH_UNSAFE', 'controller descriptor could not be opened without following links');
  }

  try {
    const descriptorRealpath = realpathSync(descriptorPath);
    if (descriptorRealpath !== descriptorPath) {
      fail('DESCRIPTOR_PATH_UNSAFE', 'controller descriptor path is not its physical realpath');
    }

    const beforeRaw = fstatSync(descriptorFd, { bigint: true });
    validateDescriptorFileStat(beforeRaw);
    const before = physicalStat(beforeRaw);
    const pathBefore = physicalStat(statSync(descriptorPath, { bigint: true }));
    if (pathBefore.device !== before.device || pathBefore.inode !== before.inode) {
      fail('DESCRIPTOR_PATH_SWAPPED', 'controller descriptor path changed before its read');
    }

    const length = Number(beforeRaw.size);
    const input = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(descriptorFd, input, offset, length - offset, offset);
      if (count === 0) fail('DESCRIPTOR_READ_INCOMPLETE', 'controller descriptor ended during its read');
      offset += count;
    }

    const afterRaw = fstatSync(descriptorFd, { bigint: true });
    validateDescriptorFileStat(afterRaw);
    const after = physicalStat(afterRaw);
    const pathAfter = physicalStat(statSync(descriptorPath, { bigint: true }));
    if (!samePhysicalStat(before, after) || pathAfter.device !== after.device ||
        pathAfter.inode !== after.inode || realpathSync(descriptorPath) !== descriptorPath) {
      fail('DESCRIPTOR_PATH_SWAPPED', 'controller descriptor identity changed during its read');
    }

    let descriptor;
    try {
      descriptor = parseCanonicalJson(input, { maxBytes: IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES });
      validateControllerBindingDescriptor(descriptor);
    } catch (error) {
      if (error instanceof ImplementationBindingError) throw error;
      fail('DESCRIPTOR_CONTENT_INVALID', `controller descriptor content is invalid: ${error.message}`);
    }

    const descriptorPathIdentity = physicalPathIdentity(descriptorRealpath, before);
    if (descriptor.descriptorPathIdentity !== descriptorPathIdentity) {
      fail('DESCRIPTOR_PATH_IDENTITY_MISMATCH',
        'controller descriptor does not bind its physical path identity');
    }

    deepFreeze(descriptor);
    const trustedDescriptor = Object.freeze({
      schemaVersion: IMPLEMENTATION_BINDING_VERSION,
      descriptorId: descriptor.descriptorId,
      descriptorDigest: canonicalDigest(descriptor),
      bindingDigest: canonicalDigest(descriptor.binding),
      profileDigest: descriptor.profileDigest,
      promptDigest: descriptor.promptDigest,
      descriptorPathIdentity,
      launcherConnectionId: descriptor.launcherConnectionId,
      jobId: descriptor.jobId,
      cwdIdentity: descriptor.cwdIdentity,
    });
    validateTrustedDescriptorObservationShape(trustedDescriptor);
    TRUSTED_DESCRIPTOR_OBSERVATIONS.add(trustedDescriptor);
    return Object.freeze({ descriptor, trustedDescriptor });
  } catch (error) {
    if (error instanceof ImplementationBindingError) throw error;
    fail('DESCRIPTOR_PATH_UNSAFE', `controller descriptor observation failed: ${error.message}`);
  } finally {
    closeSync(descriptorFd);
  }
}

function validateSessionEvent(value) {
  exactKeys(value, SESSION_EVENT_KEYS, 'controller SessionStart observation');
  version(value.schemaVersion, 'controller SessionStart observation');
  if (value.hookEventName !== 'SessionStart') {
    fail('HOOK_EVENT_MISMATCH', 'controller jobs require SessionStart');
  }
  if (!IMPLEMENTATION_BINDING_COMPATIBILITY.sources.includes(value.source)) {
    fail('HOOK_SOURCE_UNSUPPORTED', 'controller SessionStart source is unsupported');
  }
  idFields(value, ['sessionId', 'descriptorId', 'launcherConnectionId', 'jobId'],
    'controller SessionStart observation');
  digestFields(value, ['descriptorDigest', 'descriptorPathIdentity', 'cwdIdentity'],
    'controller SessionStart observation');
  return value;
}

function validatePriorSession(value) {
  exactKeys(value, PRIOR_SESSION_KEYS, 'prior controller session binding');
  version(value.schemaVersion, 'prior controller session binding');
  idFields(value, ['sessionId', 'descriptorId'], 'prior controller session binding');
  digestFields(value, ['descriptorDigest', 'bindingDigest', 'profileDigest', 'promptDigest'],
    'prior controller session binding');
  if (!ASSIGNMENT_ROLES.includes(value.role)) {
    fail('ROLE_UNSUPPORTED', 'prior controller session role is unsupported');
  }
  return value;
}

function sameFields(left, right, fields) {
  return fields.every((field) => left[field] === right[field]);
}

// The supervisor creates and persists descriptors; this module deliberately exposes no
// descriptor constructor or ambient-environment fallback. The hook bridge must supply
// both a descriptor and its independently trusted, protected-file observation.
export function validateControllerSessionBinding({
  descriptor,
  trustedDescriptor,
  event,
  requestedProfile,
  compiledPrompt,
  observedCwdIdentity,
  priorSession = null,
} = {}) {
  validateControllerBindingDescriptor(descriptor);
  validateTrustedDescriptorObservation(trustedDescriptor);
  validateSessionEvent(event);
  if (!Object.values(IMPLEMENTATION_ROLE_PROFILES).includes(requestedProfile)) {
    fail('PROFILE_UNSUPPORTED', 'requested controller profile is unsupported');
  }
  if (requestedProfile !== descriptor.profile) {
    fail('ROLE_PROFILE_MISMATCH', 'hook profile does not match the exact controller role');
  }

  const descriptorDigest = canonicalDigest(descriptor);
  const bindingDigest = canonicalDigest(descriptor.binding);
  const promptIdentity = compiledPromptIdentity(compiledPrompt);
  const promptDigest = sha256Digest(promptIdentity.prompt);
  protocol(() => validateDigest(observedCwdIdentity, 'observed controller cwd identity'),
    'observed controller cwd identity');
  if (observedCwdIdentity !== descriptor.cwdIdentity) {
    fail('CWD_IDENTITY_MISMATCH', 'controller cwd identity does not match the descriptor');
  }
  if (descriptorDigest !== trustedDescriptor.descriptorDigest ||
      bindingDigest !== trustedDescriptor.bindingDigest ||
      descriptor.profileDigest !== trustedDescriptor.profileDigest ||
      descriptor.promptDigest !== trustedDescriptor.promptDigest ||
      descriptor.promptDigest !== promptDigest ||
      descriptor.profile !== promptIdentity.profile ||
      descriptor.profileDigest !== promptIdentity.profileDigest ||
      !sameFields(descriptor, trustedDescriptor, [
        'descriptorId', 'descriptorPathIdentity', 'launcherConnectionId', 'jobId', 'cwdIdentity',
      ])) {
    fail('TRUSTED_DESCRIPTOR_MISMATCH', 'controller descriptor does not match protected identity evidence');
  }

  if (!sameFields(event, trustedDescriptor, [
    'descriptorId', 'descriptorDigest', 'descriptorPathIdentity', 'launcherConnectionId',
    'jobId', 'cwdIdentity',
  ])) {
    fail('SESSION_DESCRIPTOR_MISMATCH', 'SessionStart does not name the protected descriptor');
  }

  if (event.source === 'startup') {
    if (priorSession !== null) {
      fail('SESSION_DRIFT', 'startup cannot replace an existing controller session binding');
    }
  } else {
    if (priorSession === null) {
      fail('SESSION_DRIFT', 'controller continuation requires the prior trusted session binding');
    }
    validatePriorSession(priorSession);
    const current = {
      sessionId: event.sessionId,
      descriptorId: descriptor.descriptorId,
      descriptorDigest,
      bindingDigest,
      role: descriptor.role,
      profileDigest: descriptor.profileDigest,
      promptDigest: descriptor.promptDigest,
    };
    if (!sameFields(current, priorSession, [
      'sessionId', 'descriptorId', 'descriptorDigest', 'bindingDigest', 'role',
      'profileDigest', 'promptDigest',
    ])) {
      fail('SESSION_DRIFT', 'controller continuation changed the bound controller session');
    }
  }

  return Object.freeze({
    schemaVersion: IMPLEMENTATION_BINDING_VERSION,
    sessionId: event.sessionId,
    source: event.source,
    descriptorId: descriptor.descriptorId,
    descriptorDigest,
    bindingDigest,
    role: descriptor.role,
    profile: descriptor.profile,
    profileDigest: descriptor.profileDigest,
    promptDigest: descriptor.promptDigest,
    binding: descriptor.binding,
  });
}
