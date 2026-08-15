#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INPUT_LIMIT = 32_768;
const PROMPT_LIMIT = 65_536;
const ROOT_SOURCES = new Set(['startup', 'resume', 'clear', 'compact']);
const PROFILES = new Set(['implementer', 'qa', 'reviewer', 'root', 'security']);
const AGENT_TYPES = Object.freeze({
  implementer: 'meta_implementer',
  qa: 'meta_qa',
  reviewer: 'meta_reviewer',
  security: 'meta_security',
});
const SESSION_DOMAIN = Buffer.from('meta-framework-prompt-session-v1\0', 'utf8');
const GENERATION_DOMAIN = Buffer.from('meta-framework-prompt-generation-v1\0', 'utf8');
const RUNTIME_RELATIVE_PARTS = Object.freeze(['meta-framework', 'prompt-runtime', 'v1']);
export const CONTROLLER_DESCRIPTOR_ENV = 'META_FRAMEWORK_CONTROLLER_DESCRIPTOR';
const CONTROLLER_ROLES = Object.freeze({
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
const BINDING_KEYS = Object.freeze([
  'runId', 'epoch', 'snapshotRevision', 'taskId', 'taskRevision', 'taskRecordVersion',
  'capsuleDigest', 'controlGeneration', 'correctionGeneration',
]);
const CONTROLLER_PIN_KEYS = Object.freeze([
  'schemaVersion', 'generation', 'sessionIdDigest', 'descriptorId', 'descriptorDigest',
  'bindingDigest', 'role', 'profile', 'profileDigest', 'promptDigest',
  'descriptorPathIdentity', 'launcherConnectionId', 'jobId', 'cwdIdentity',
]);

export class PromptBootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PromptBootstrapError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PromptBootstrapError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('GENERATION_CORRUPT', 'runtime metadata is invalid');
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function noFollowFlag(code) {
  const flag = fs.constants.O_NOFOLLOW;
  if (!Number.isInteger(flag) || flag === 0) fail(code, 'no-follow file access is unavailable');
  return flag;
}

function ownedByCurrentUser(info) {
  return typeof process.getuid !== 'function' || info.uid === process.getuid();
}

function validateRuntimeRoot(runtimeRoot) {
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
  }
  const resolved = path.resolve(runtimeRoot);
  let info;
  try {
    info = fs.lstatSync(resolved);
  } catch {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
  }
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
  }
  if (!info.isDirectory() || info.isSymbolicLink() || real !== resolved ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid()) ||
      (info.mode & 0o777) !== 0o700) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
  }
  for (const child of ['generations', 'loaders', 'sessions']) {
    const target = path.join(resolved, child);
    let childInfo;
    let childReal;
    try {
      childInfo = fs.lstatSync(target);
      childReal = fs.realpathSync(target);
    } catch {
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
    }
    if (!childInfo.isDirectory() || childInfo.isSymbolicLink() || childReal !== target ||
        (childInfo.mode & 0o777) !== 0o700 ||
        (typeof process.getuid === 'function' && childInfo.uid !== process.getuid())) {
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime is unavailable');
    }
  }
  return resolved;
}

function safeOrdinaryFile(target, {
  code,
  maximumBytes,
  mode,
  immutable = false,
}) {
  let before;
  try {
    before = fs.lstatSync(target);
  } catch {
    fail(code, 'prompt runtime file is unavailable');
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 ||
      before.size > maximumBytes || (mode !== undefined && (before.mode & 0o777) !== mode) ||
      !ownedByCurrentUser(before) || (immutable && (before.mode & 0o222) !== 0)) {
    fail(code, 'prompt runtime file is unsafe');
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollowFlag(code));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size || !ownedByCurrentUser(opened) ||
        (mode !== undefined && (opened.mode & 0o777) !== mode)) {
      fail(code, 'prompt runtime file changed');
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.lstatSync(target);
    if (bytes.length !== opened.size || after.isSymbolicLink() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        (after.mode & 0o777) !== (before.mode & 0o777) || !ownedByCurrentUser(after)) {
      fail(code, 'prompt runtime file changed');
    }
    return bytes;
  } catch (error) {
    if (error instanceof PromptBootstrapError) throw error;
    fail(code, 'prompt runtime file cannot be read');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseJsonText(text, code) {
  let cursor = 0;
  const invalid = () => fail(code, 'runtime JSON is invalid');
  const whitespace = () => {
    while (cursor < text.length && [' ', '\t', '\n', '\r'].includes(text[cursor])) cursor += 1;
  };
  const string = () => {
    if (text[cursor] !== '"') invalid();
    const start = cursor++;
    let escaped = false;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') {
        try { return JSON.parse(text.slice(start, cursor)); } catch { invalid(); }
      } else if (character.charCodeAt(0) <= 0x1f) invalid();
    }
    invalid();
  };
  const value = (depth = 0) => {
    if (depth > 64) invalid();
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1; whitespace();
      const result = Object.create(null); const keys = new Set();
      if (text[cursor] === '}') { cursor += 1; return result; }
      while (cursor < text.length) {
        whitespace(); const key = string();
        if (keys.has(key)) invalid();
        keys.add(key); whitespace();
        if (text[cursor++] !== ':') invalid();
        result[key] = value(depth + 1); whitespace();
        if (text[cursor] === '}') { cursor += 1; return result; }
        if (text[cursor++] !== ',') invalid();
      }
      invalid();
    }
    if (character === '[') {
      cursor += 1; whitespace(); const result = [];
      if (text[cursor] === ']') { cursor += 1; return result; }
      while (cursor < text.length) {
        result.push(value(depth + 1)); whitespace();
        if (text[cursor] === ']') { cursor += 1; return result; }
        if (text[cursor++] !== ',') invalid();
      }
      invalid();
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, cursor)) { cursor += token.length; return parsed; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(cursor));
    if (match === null) invalid();
    cursor += match[0].length;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) invalid();
    return parsed;
  };
  const parsed = value(); whitespace();
  if (cursor !== text.length) invalid();
  return parsed;
}

function parseJson(bytes, code) {
  try {
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes) || text.includes('\ufeff')) fail(code, 'runtime JSON is invalid');
    return parseJsonText(text, code);
  } catch (error) {
    if (error instanceof PromptBootstrapError) throw error;
    fail(code, 'runtime JSON is invalid');
  }
}

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function validControllerId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(value);
}

function validateControllerDescriptor(value) {
  if (!exactKeys(value, DESCRIPTOR_KEYS) || value.schemaVersion !== 1 ||
      !exactKeys(value.binding, BINDING_KEYS) || !validControllerId(value.descriptorId) ||
      !validControllerId(value.assignmentId) || !validControllerId(value.attemptId) ||
      !validControllerId(value.jobId) || !validControllerId(value.launcherConnectionId) ||
      typeof value.binding.taskId !== 'string' || !/^T-(?:\d{4}|[1-9]\d{4,})$/u.test(value.binding.taskId) ||
      !validControllerId(value.binding.runId) || !validDigest(value.binding.capsuleDigest) ||
      !['epoch', 'snapshotRevision', 'taskRevision', 'taskRecordVersion', 'controlGeneration',
        'correctionGeneration'].every((field) => Number.isSafeInteger(value.binding[field]) &&
          value.binding[field] >= (field === 'taskRevision' || field === 'taskRecordVersion' ? 1 : 0)) ||
      !Object.hasOwn(CONTROLLER_ROLES, value.role) || value.profile !== CONTROLLER_ROLES[value.role] ||
      !['profileDigest', 'promptDigest', 'cwdIdentity', 'descriptorPathIdentity']
        .every((field) => validDigest(value[field]))) {
    fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor is invalid');
  }
  return value;
}

function controllerPathIdentity(realpath, stats) {
  return sha256(Buffer.from(canonicalJson({
    schemaVersion: 1,
    kind: 'controller_binding_descriptor',
    realpath,
    device: stats.dev.toString(10),
    inode: stats.ino.toString(10),
    size: Number(stats.size),
  }), 'utf8'));
}

function readControllerDescriptor(descriptorPath) {
  if (typeof descriptorPath !== 'string' || descriptorPath.length === 0 ||
      descriptorPath.includes('\0') || !path.isAbsolute(descriptorPath) ||
      path.normalize(descriptorPath) !== descriptorPath) {
    fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor path is invalid');
  }
  let realpath;
  try { realpath = fs.realpathSync(descriptorPath); } catch {
    fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor is unavailable');
  }
  if (realpath !== descriptorPath) fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor path is unsafe');
  let descriptor;
  try {
    descriptor = fs.openSync(descriptorPath,
      fs.constants.O_RDONLY | noFollowFlag('CONTROLLER_DESCRIPTOR_INVALID'));
    const before = fs.fstatSync(descriptor, { bigint: true });
    const uid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
    if (process.platform !== 'linux' || uid === null || (before.mode & 0o170000n) !== 0o100000n ||
        (before.mode & 0o7777n) !== 0o600n || before.nlink !== 1n || before.uid !== uid ||
        before.size < 1n || before.size > BigInt(INPUT_LIMIT)) {
      fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor file is unsafe');
    }
    const pathBefore = fs.statSync(descriptorPath, { bigint: true });
    if (pathBefore.dev !== before.dev || pathBefore.ino !== before.ino) {
      fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor path changed');
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.statSync(descriptorPath, { bigint: true });
    if (bytes.length !== Number(before.size) || after.dev !== before.dev || after.ino !== before.ino ||
        after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs ||
        pathAfter.dev !== after.dev || pathAfter.ino !== after.ino || fs.realpathSync(descriptorPath) !== realpath) {
      fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor changed during read');
    }
    const value = validateControllerDescriptor(parseJson(bytes, 'CONTROLLER_DESCRIPTOR_INVALID'));
    if (!bytes.equals(Buffer.from(canonicalJson(value), 'utf8'))) {
      fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor is not canonical');
    }
    const descriptorPathIdentity = controllerPathIdentity(realpath, before);
    if (value.descriptorPathIdentity !== descriptorPathIdentity) {
      fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor path identity changed');
    }
    return Object.freeze({
      value,
      descriptorDigest: sha256(bytes),
      bindingDigest: sha256(Buffer.from(canonicalJson(value.binding), 'utf8')),
    });
  } catch (error) {
    if (error instanceof PromptBootstrapError) throw error;
    fail('CONTROLLER_DESCRIPTOR_INVALID', 'controller descriptor cannot be read');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function controllerCwdIdentity() {
  let realpath;
  let info;
  try {
    realpath = fs.realpathSync(process.cwd());
    info = fs.statSync(realpath, { bigint: true });
  } catch {
    fail('CONTROLLER_CWD_MISMATCH', 'controller cwd is unavailable');
  }
  if ((info.mode & 0o170000n) !== 0o040000n || realpath !== process.cwd()) {
    fail('CONTROLLER_CWD_MISMATCH', 'controller cwd is not one physical directory');
  }
  return sha256(Buffer.from(canonicalJson({
    path: realpath,
    dev: info.dev.toString(10),
    ino: info.ino.toString(10),
    mode: (info.mode & 0o777n).toString(10),
  }), 'utf8'));
}

function generationDirectory(runtimeRoot, generation) {
  if (!validDigest(generation)) fail('GENERATION_CORRUPT', 'generation identity is invalid');
  return path.join(runtimeRoot, 'generations', generation.slice(7));
}

function readGeneration(runtimeRoot, generation, profile) {
  const directory = generationDirectory(runtimeRoot, generation);
  let info;
  try {
    info = fs.lstatSync(directory);
  } catch {
    fail('GENERATION_UNAVAILABLE', 'generation is unavailable');
  }
  let real;
  try { real = fs.realpathSync(directory); } catch { fail('GENERATION_CORRUPT', 'generation is unsafe'); }
  if (!info.isDirectory() || info.isSymbolicLink() || real !== directory ||
      (info.mode & 0o777) !== 0o500 || !ownedByCurrentUser(info)) {
    fail('GENERATION_CORRUPT', 'generation is unsafe');
  }
  const manifestBytes = safeOrdinaryFile(path.join(directory, 'manifest.json'), {
    code: 'GENERATION_CORRUPT', maximumBytes: 256 * 1024, mode: 0o400, immutable: true,
  });
  const manifest = parseJson(manifestBytes, 'GENERATION_CORRUPT');
  if (!manifestBytes.equals(Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8'))) {
    fail('GENERATION_CORRUPT', 'generation manifest is not canonical');
  }
  if (!plainObject(manifest) || manifest.schemaVersion !== 1 || manifest.generationDigest !== generation ||
      !plainObject(manifest.prompts) || !exactKeys(manifest.prompts, [...PROFILES]) ||
      !plainObject(manifest.prompts[profile])) {
    fail('GENERATION_CORRUPT', 'generation manifest is invalid');
  }
  const unsignedManifest = { ...manifest };
  delete unsignedManifest.generationDigest;
  if (sha256(Buffer.concat([GENERATION_DOMAIN, Buffer.from(canonicalJson(unsignedManifest), 'utf8')])) !== generation) {
    fail('GENERATION_CORRUPT', 'generation manifest digest is invalid');
  }
  const entry = manifest.prompts[profile];
  if (!exactKeys(entry, ['bytes', 'digest', 'file']) || !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 || entry.bytes > PROMPT_LIMIT || !validDigest(entry.digest) ||
      entry.file !== `${profile}.prompt`) {
    fail('GENERATION_CORRUPT', 'generation prompt binding is invalid');
  }
  const prompt = safeOrdinaryFile(path.join(directory, entry.file), {
    code: 'GENERATION_CORRUPT', maximumBytes: PROMPT_LIMIT, mode: 0o400, immutable: true,
  });
  if (prompt.length !== entry.bytes || sha256(prompt) !== entry.digest) {
    fail('GENERATION_CORRUPT', 'generation prompt digest is invalid');
  }
  const firstNewline = prompt.indexOf(0x0a);
  const secondNewline = firstNewline < 0 ? -1 : prompt.indexOf(0x0a, firstNewline + 1);
  if (firstNewline < 0 || secondNewline < 0 ||
      prompt.subarray(0, firstNewline).toString('utf8') !== 'META-FRAMEWORK-AGENT-PROMPT 1') {
    fail('GENERATION_CORRUPT', 'generation prompt envelope is invalid');
  }
  const embedded = parseJson(prompt.subarray(firstNewline + 1, secondNewline), 'GENERATION_CORRUPT');
  if (embedded.profile !== profile || embedded.harness !== 'codex' || !validDigest(embedded.digest)) {
    fail('GENERATION_CORRUPT', 'generation prompt envelope binding is invalid');
  }
  const embeddedWithoutDigest = { ...embedded };
  delete embeddedWithoutDigest.digest;
  const promptPreimage = Buffer.concat([
    Buffer.from(canonicalJson(embeddedWithoutDigest), 'utf8'),
    Buffer.from('\n'),
    prompt.subarray(secondNewline + 1),
  ]);
  if (sha256(promptPreimage) !== embedded.digest) {
    fail('GENERATION_CORRUPT', 'generation prompt embedded digest is invalid');
  }
  return Object.freeze({
    prompt,
    generation,
    promptDigest: entry.digest,
    profileDigest: embedded.digest,
  });
}

function validateSessionId(value) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 256 ||
      /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(value)) {
    fail('SESSION_PIN_INVALID', 'session identity is invalid');
  }
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.toString('utf8') !== value) fail('SESSION_PIN_INVALID', 'session identity is invalid');
  return value;
}

export function sessionPinDigest(sessionId) {
  const valid = validateSessionId(sessionId);
  return createHash('sha256').update(SESSION_DOMAIN).update(valid, 'utf8').digest('hex');
}

function pinPath(runtimeRoot, sessionId) {
  return path.join(runtimeRoot, 'sessions', `${sessionPinDigest(sessionId)}.json`);
}

function readPin(runtimeRoot, sessionId, { optional = false } = {}) {
  const target = pinPath(runtimeRoot, sessionId);
  if (optional && !fs.existsSync(target)) return null;
  const pinBytes = safeOrdinaryFile(target, {
    code: 'SESSION_PIN_INVALID', maximumBytes: 1_024, mode: 0o600,
  });
  const pin = parseJson(pinBytes, 'SESSION_PIN_INVALID');
  if (!pinBytes.equals(Buffer.from(`${canonicalJson(pin)}\n`, 'utf8'))) {
    fail('SESSION_PIN_INVALID', 'session pin is not canonical');
  }
  const interactive = exactKeys(pin, ['generation', 'schemaVersion']) && pin.schemaVersion === 1 &&
    validDigest(pin.generation);
  const controller = exactKeys(pin, CONTROLLER_PIN_KEYS) && pin.schemaVersion === 2 &&
    validDigest(pin.generation) && validDigest(pin.sessionIdDigest) &&
    validControllerId(pin.descriptorId) && validDigest(pin.descriptorDigest) &&
    validDigest(pin.bindingDigest) && Object.hasOwn(CONTROLLER_ROLES, pin.role) &&
    pin.profile === CONTROLLER_ROLES[pin.role] &&
    ['profileDigest', 'promptDigest', 'descriptorPathIdentity', 'cwdIdentity']
      .every((field) => validDigest(pin[field])) && validControllerId(pin.launcherConnectionId) &&
    validControllerId(pin.jobId);
  if (!interactive && !controller) fail('SESSION_PIN_INVALID', 'session pin is invalid');
  return Object.freeze({ ...pin });
}

function readActive(runtimeRoot) {
  const pointerBytes = safeOrdinaryFile(path.join(runtimeRoot, 'active.json'), {
    code: 'PROMPT_RUNTIME_UNAVAILABLE', maximumBytes: 2_048, mode: 0o600,
  });
  const pointer = parseJson(pointerBytes, 'PROMPT_RUNTIME_UNAVAILABLE');
  if (!pointerBytes.equals(Buffer.from(`${canonicalJson(pointer)}\n`, 'utf8'))) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'active prompt pointer is not canonical');
  }
  if (!exactKeys(pointer, ['generation', 'nonce', 'revision', 'schemaVersion']) ||
      pointer.schemaVersion !== 1 || !validDigest(pointer.generation) ||
      !Number.isSafeInteger(pointer.revision) || pointer.revision < 1 ||
      typeof pointer.nonce !== 'string' || !/^[0-9a-f]{32}$/u.test(pointer.nonce)) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'active prompt pointer is invalid');
  }
  return pointer;
}

function withWriterLock(runtimeRoot, operation) {
  const lock = path.join(runtimeRoot, 'writer.lock');
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
    fs.chmodSync(lock, 0o700);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('PROMPT_RUNTIME_BUSY', 'prompt runtime writer is busy');
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime writer is busy');
  }
  try {
    const info = fs.lstatSync(lock);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) {
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime writer lock is unsafe');
    }
    return operation();
  } finally {
    try { fs.rmdirSync(lock); } catch { /* a damaged lock fails later operations closed */ }
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

function claimPin(runtimeRoot, sessionId) {
  const existing = readPin(runtimeRoot, sessionId, { optional: true });
  if (existing !== null) {
    if (existing.schemaVersion !== 1) fail('SESSION_PIN_INVALID', 'controller pin requires its descriptor capability');
    return existing;
  }
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    try {
      return withWriterLock(runtimeRoot, () => {
        const raced = readPin(runtimeRoot, sessionId, { optional: true });
        if (raced !== null) return raced;
        const active = readActive(runtimeRoot);
        readGeneration(runtimeRoot, active.generation, 'root');
        const sessions = path.join(runtimeRoot, 'sessions');
        const target = pinPath(runtimeRoot, sessionId);
        const temporary = path.join(sessions, `.pin-${process.pid}-${createHash('sha256').update(String(Math.random())).digest('hex')}`);
        const bytes = Buffer.from(`${canonicalJson({ schemaVersion: 1, generation: active.generation })}\n`);
        let descriptor;
        try {
          descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
            noFollowFlag('SESSION_PIN_INVALID'), 0o600);
          fs.fchmodSync(descriptor, 0o600);
          fs.writeFileSync(descriptor, bytes);
          fs.fsyncSync(descriptor);
          fs.closeSync(descriptor);
          descriptor = undefined;
          try {
            fs.lstatSync(target);
            fail('SESSION_PIN_INVALID', 'session pin appeared during publication');
          } catch (error) {
            if (error instanceof PromptBootstrapError) throw error;
            if (error?.code !== 'ENOENT') fail('SESSION_PIN_INVALID', 'session pin cannot be claimed');
          }
          fs.renameSync(temporary, target);
          fsyncDirectory(sessions);
        } catch (error) {
          if (error instanceof PromptBootstrapError) throw error;
          fail('SESSION_PIN_INVALID', 'session pin cannot be claimed');
        } finally {
          if (descriptor !== undefined) fs.closeSync(descriptor);
          try { fs.unlinkSync(temporary); } catch { /* best-effort private-file cleanup */ }
        }
        return readPin(runtimeRoot, sessionId);
      });
    } catch (error) {
      if (!(error instanceof PromptBootstrapError) || error.code !== 'PROMPT_RUNTIME_BUSY') throw error;
      Atomics.wait(waitCell, 0, 0, 10);
    }
  }
  fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime writer remained busy');
}

function controllerPin(descriptor, observed, generation, sessionId) {
  return Object.freeze({
    schemaVersion: 2,
    generation,
    sessionIdDigest: sha256(Buffer.concat([SESSION_DOMAIN, Buffer.from(sessionId, 'utf8')])),
    descriptorId: descriptor.descriptorId,
    descriptorDigest: observed.descriptorDigest,
    bindingDigest: observed.bindingDigest,
    role: descriptor.role,
    profile: descriptor.profile,
    profileDigest: descriptor.profileDigest,
    promptDigest: descriptor.promptDigest,
    descriptorPathIdentity: descriptor.descriptorPathIdentity,
    launcherConnectionId: descriptor.launcherConnectionId,
    jobId: descriptor.jobId,
    cwdIdentity: descriptor.cwdIdentity,
  });
}

function sameControllerPin(left, right) {
  return CONTROLLER_PIN_KEYS.every((field) => left[field] === right[field]);
}

function publishControllerPin(runtimeRoot, sessionId, value) {
  return withWriterLock(runtimeRoot, () => {
    if (readPin(runtimeRoot, sessionId, { optional: true }) !== null) {
      fail('SESSION_PIN_INVALID', 'controller startup cannot replace a session pin');
    }
    const sessions = path.join(runtimeRoot, 'sessions');
    const target = pinPath(runtimeRoot, sessionId);
    const temporary = path.join(sessions,
      `.controller-pin-${process.pid}-${createHash('sha256').update(String(Math.random())).digest('hex')}`);
    const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
        noFollowFlag('SESSION_PIN_INVALID'), 0o600);
      fs.fchmodSync(descriptor, 0o600);
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, target);
      fsyncDirectory(sessions);
      return readPin(runtimeRoot, sessionId);
    } catch (error) {
      if (error instanceof PromptBootstrapError) throw error;
      fail('SESSION_PIN_INVALID', 'controller session pin cannot be claimed');
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch { /* best-effort private-file cleanup */ }
    }
  });
}

function serveControllerPrompt(runtimeRoot, event, sessionId, descriptorPath) {
  if (event.hook_event_name !== 'SessionStart' || !ROOT_SOURCES.has(event.source)) {
    fail('HOOK_EVENT_MISMATCH', 'controller hook requires an allowed SessionStart event');
  }
  const observed = readControllerDescriptor(descriptorPath);
  const descriptor = observed.value;
  const cwdIdentity = controllerCwdIdentity();
  if (cwdIdentity !== descriptor.cwdIdentity) {
    fail('CONTROLLER_CWD_MISMATCH', 'controller cwd does not match the descriptor');
  }
  const prior = readPin(runtimeRoot, sessionId, { optional: true });
  if (event.source === 'startup' && prior !== null) {
    fail('SESSION_PIN_INVALID', 'controller startup cannot replace a session pin');
  }
  if (event.source !== 'startup' && (prior === null || prior.schemaVersion !== 2)) {
    fail('SESSION_PIN_INVALID', 'controller continuity requires a v2 session pin');
  }
  const generation = prior?.generation ?? readActive(runtimeRoot).generation;
  const compiled = readGeneration(runtimeRoot, generation, descriptor.profile);
  if (compiled.promptDigest !== descriptor.promptDigest ||
      compiled.profileDigest !== descriptor.profileDigest) {
    fail('CONTROLLER_PROMPT_MISMATCH', 'controller prompt does not match the descriptor');
  }
  const expected = controllerPin(descriptor, observed, generation, sessionId);
  const pin = event.source === 'startup'
    ? publishControllerPin(runtimeRoot, sessionId, expected)
    : prior;
  if (!sameControllerPin(pin, expected)) {
    fail('SESSION_PIN_INVALID', 'controller session binding drifted');
  }
  return compiled.prompt;
}

function boundedEvent(inputBytes) {
  if (!Buffer.isBuffer(inputBytes) || inputBytes.length < 2 || inputBytes.length > INPUT_LIMIT) {
    fail('HOOK_INPUT_INVALID', 'hook event is invalid');
  }
  const event = parseJson(inputBytes, 'HOOK_INPUT_INVALID');
  if (!plainObject(event)) fail('HOOK_INPUT_INVALID', 'hook event is invalid');
  return event;
}

export function promptEventIsSessionEnd(inputBytes) {
  try { return boundedEvent(inputBytes).hook_event_name === 'SessionEnd'; }
  catch { return false; }
}

export function validatePromptEvent(inputBytes, { profile, allowSessionEnd = false } = {}) {
  if (!PROFILES.has(profile)) fail('HOOK_EVENT_MISMATCH', 'hook profile is invalid');
  const event = boundedEvent(inputBytes);
  const sessionEnd = event.hook_event_name === 'SessionEnd';
  if (sessionEnd) {
    if (!allowSessionEnd || profile !== 'root') {
      fail('HOOK_EVENT_MISMATCH', 'session end hook event is invalid');
    }
  } else if (profile === 'root') {
    if (event.hook_event_name !== 'SessionStart' || !ROOT_SOURCES.has(event.source)) {
      fail('HOOK_EVENT_MISMATCH', 'root hook event is invalid');
    }
  } else if (event.hook_event_name !== 'SubagentStart' || event.agent_type !== AGENT_TYPES[profile]) {
    fail('HOOK_EVENT_MISMATCH', 'specialist hook event is invalid');
  }
  return Object.freeze({ sessionEnd, sessionId: validateSessionId(event.session_id) });
}

export function servePromptEvent(inputBytes, { runtimeRoot, profile, controllerDescriptorPath = null }) {
  const root = validateRuntimeRoot(runtimeRoot);
  if (controllerDescriptorPath !== null) {
    const event = boundedEvent(inputBytes);
    const sessionId = validateSessionId(event.session_id);
    return serveControllerPrompt(root, event, sessionId, controllerDescriptorPath);
  }
  const { sessionId } = validatePromptEvent(inputBytes, { profile });
  const pin = profile === 'root' ? claimPin(root, sessionId) : readPin(root, sessionId);
  if (pin.schemaVersion !== 1) fail('SESSION_PIN_INVALID', 'interactive prompt requires a v1 session pin');
  return readGeneration(root, pin.generation, profile).prompt;
}

export function retirePromptSession(inputBytes, {
  runtimeRoot,
  expectedGeneration = null,
  controllerDescriptorPath = null,
  allowControllerOperatorRetirement = false,
} = {}) {
  const root = validateRuntimeRoot(runtimeRoot);
  const validated = validatePromptEvent(inputBytes, { profile: 'root', allowSessionEnd: true });
  if (!validated.sessionEnd) fail('HOOK_EVENT_MISMATCH', 'session end event is invalid');
  const { sessionId } = validated;
  return withWriterLock(root, () => {
    const pin = readPin(root, sessionId, { optional: true });
    if (pin === null) return false;
    if (expectedGeneration !== null && pin.generation !== expectedGeneration) {
      fail('SESSION_PIN_INVALID', 'session pin generation changed');
    }
    if (controllerDescriptorPath !== null) {
      if (pin.schemaVersion !== 2) fail('SESSION_PIN_INVALID', 'controller SessionEnd requires a v2 pin');
      const observed = readControllerDescriptor(controllerDescriptorPath);
      const expected = controllerPin(observed.value, observed, pin.generation, sessionId);
      if (controllerCwdIdentity() !== observed.value.cwdIdentity || !sameControllerPin(pin, expected)) {
        fail('SESSION_PIN_INVALID', 'controller SessionEnd does not match its exact binding');
      }
    } else if (pin.schemaVersion !== 1 &&
        !(allowControllerOperatorRetirement === true && expectedGeneration !== null)) {
      fail('SESSION_PIN_INVALID', 'controller SessionEnd requires its descriptor capability');
    }
    fs.unlinkSync(pinPath(root, sessionId));
    fsyncDirectory(path.join(root, 'sessions'));
    return true;
  });
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > INPUT_LIMIT) fail('HOOK_INPUT_INVALID', 'hook input exceeds its bound');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function runtimeFromInstalledLoader() {
  const loader = fileURLToPath(import.meta.url);
  const loaders = path.dirname(loader);
  const runtimeRoot = path.dirname(loaders);
  const loaderMatch = /^([0-9a-f]{64})\.mjs$/u.exec(path.basename(loader));
  if (path.basename(loaders) !== 'loaders' || path.basename(runtimeRoot) !== RUNTIME_RELATIVE_PARTS.at(-1) ||
      loaderMatch === null) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'loader is not installed in the prompt runtime');
  }
  const loaderBytes = safeOrdinaryFile(loader, {
    code: 'PROMPT_RUNTIME_UNAVAILABLE', maximumBytes: 256 * 1024, mode: 0o400, immutable: true,
  });
  if (sha256(loaderBytes) !== `sha256:${loaderMatch[1]}`) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'loader identity is invalid');
  }
  return runtimeRoot;
}

const invoked = process.argv[1] === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const profile = process.argv[2];
    if (process.argv.length !== 3 || !PROFILES.has(profile)) fail('HOOK_EVENT_MISMATCH', 'loader profile is invalid');
    const input = await readStdin();
    const event = boundedEvent(input);
    const controllerDescriptorPath = Object.hasOwn(process.env, CONTROLLER_DESCRIPTOR_ENV)
      ? process.env[CONTROLLER_DESCRIPTOR_ENV]
      : null;
    if (event.hook_event_name === 'SessionEnd') {
      if (profile !== 'root') fail('HOOK_EVENT_MISMATCH', 'session end profile is invalid');
      retirePromptSession(input, {
        runtimeRoot: runtimeFromInstalledLoader(), controllerDescriptorPath,
      });
    } else {
      process.stdout.write(servePromptEvent(input, {
        runtimeRoot: runtimeFromInstalledLoader(), profile, controllerDescriptorPath,
      }));
    }
  } catch {
    process.exitCode = 1;
  }
}
