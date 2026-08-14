import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import {
  ASSIGNMENT_ROLES,
  canonicalDigest,
  parseCanonicalJson,
  sha256Digest,
  validateBinding,
  validateControllerId,
  validateDigest,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_BINDING_VERSION = 1;
export const IMPLEMENTATION_BINDING_DESCRIPTOR_BYTES = 32 * 1024;

export const IMPLEMENTATION_BINDING_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  descriptorVersions: Object.freeze([IMPLEMENTATION_BINDING_VERSION]),
  harnesses: Object.freeze(['codex']),
  hookEvents: Object.freeze(['SessionStart']),
  sources: Object.freeze(['startup', 'resume', 'compact']),
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
  const promptDigest = sha256Digest(bytes(compiledPrompt, 'compiled controller prompt'));
  if (descriptorDigest !== trustedDescriptor.descriptorDigest ||
      bindingDigest !== trustedDescriptor.bindingDigest ||
      descriptor.profileDigest !== trustedDescriptor.profileDigest ||
      descriptor.promptDigest !== trustedDescriptor.promptDigest ||
      descriptor.promptDigest !== promptDigest ||
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
      fail('SESSION_DRIFT', 'resume or compact requires the prior trusted session binding');
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
      fail('SESSION_DRIFT', 'resume or compact changed the bound controller session');
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
