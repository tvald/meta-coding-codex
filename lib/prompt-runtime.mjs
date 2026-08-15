import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROMPT_ACTIVATION_RESERVE_BYTES,
  PROMPT_COMPILER_COMPATIBILITY,
  PROMPT_LIMITS,
} from './prompt-contract.mjs';
import { EXTENSION_LIMITS } from './extension-contract.mjs';
import {
  PromptBootstrapError,
  retirePromptSession,
  servePromptEvent,
} from './prompt-bootstrap-loader.mjs';

export const PROMPT_RUNTIME_RELATIVE = 'meta-framework/prompt-runtime/v1';
export const PROMPT_RUNTIME_SCHEMA_VERSION = 1;
export const PROMPT_GENERATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

const PROFILES = Object.freeze([...PROMPT_COMPILER_COMPATIBILITY.profiles]);
const HARNESSES = Object.freeze([...PROMPT_COMPILER_COMPATIBILITY.harnesses]);
const RUNTIMES = new WeakSet();
const GENERATION_DOMAIN = Buffer.from('meta-framework-prompt-generation-v1\0', 'utf8');
const ACTIVE_TOKEN_DOMAIN = Buffer.from('meta-framework-prompt-active-token-v1\0', 'utf8');
const SOURCE_SET_DOMAIN = Buffer.from('meta-framework-prompt-source-set-v1\0', 'utf8');
const PRIVATE_GENERATION_PATTERN = /^\.build-[0-9]+-[0-9a-f]{32}$/u;
const PRIVATE_SEED_PATTERN = /^\.prompt-runtime-seed-[0-9]+-[0-9a-f]{32}$/u;
const SEED_LOCK_NAME = 'meta-framework-prompt-runtime-v1.seed.lock';

const PROMPT_CANDIDATE_CHECKS = Object.freeze([
  'all-profile-harness-prompts',
  'session-start-startup-resume-clear-compact',
  'subagent-exact-profile-bindings',
  'root-degraded-fallback-contract',
  'specialist-fail-closed-contract',
]);

export class PromptRuntimeError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'PromptRuntimeError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message, exitCode = 1) {
  throw new PromptRuntimeError(code, message, exitCode);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('GENERATION_CORRUPT', 'prompt runtime metadata is not canonical JSON');
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function promptCandidateValidationReceipt(compiledPromptSetDigest) {
  if (!validDigest(compiledPromptSetDigest)) {
    fail('CANDIDATE_TEST_FAILED', 'candidate validation subject is invalid', 2);
  }
  return Object.freeze({
    schemaVersion: 1,
    validator: 'meta-framework-codex-lifecycle-v2',
    status: 'passed',
    compiledPromptSetDigest,
    checks: PROMPT_CANDIDATE_CHECKS,
  });
}

function noFollowFlag(code) {
  const flag = fs.constants.O_NOFOLLOW;
  if (!Number.isInteger(flag) || flag === 0) fail(code, 'no-follow file access is unavailable');
  return flag;
}

function ownedByCurrentUser(info) {
  return typeof process.getuid !== 'function' || info.uid === process.getuid();
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

function validateOwnedDirectory(target, mode, code = 'PROMPT_RUNTIME_UNAVAILABLE') {
  let info;
  try {
    info = fs.lstatSync(target);
  } catch {
    fail(code, 'prompt runtime directory is unavailable');
  }
  let real;
  try {
    real = fs.realpathSync(target);
  } catch {
    fail(code, 'prompt runtime directory is unavailable');
  }
  if (!info.isDirectory() || info.isSymbolicLink() || real !== path.resolve(target) ||
      info.nlink < 1 || (info.mode & 0o777) !== mode ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    fail(code, 'prompt runtime directory is unsafe');
  }
}

function ensureDirectory(target, mode) {
  let created = false;
  try {
    fs.mkdirSync(target, { mode });
    created = true;
  } catch (error) {
    if (error?.code !== 'EEXIST') fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime cannot be initialized');
  }
  if (created) fs.chmodSync(target, mode);
  validateOwnedDirectory(target, mode);
}

function pathEntry(target) {
  try { return fs.lstatSync(target); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime path cannot be inspected');
  }
}

function validateCommonDirectory(gitCommonDirectory) {
  if (typeof gitCommonDirectory !== 'string' || !path.isAbsolute(gitCommonDirectory)) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'physical absolute Git common directory is required', 2);
  }
  const common = path.resolve(gitCommonDirectory);
  const commonInfo = pathEntry(common);
  let realCommon;
  try { realCommon = fs.realpathSync(common); } catch { fail('PROMPT_RUNTIME_UNAVAILABLE', 'Git common directory is unavailable'); }
  if (commonInfo === null || !commonInfo.isDirectory() || commonInfo.isSymbolicLink() || realCommon !== common ||
      (commonInfo.mode & 0o022) !== 0 ||
      (typeof process.getuid === 'function' && commonInfo.uid !== process.getuid())) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'Git common directory is unsafe');
  }
  return common;
}

function runtimePaths(common) {
  const framework = path.join(common, 'meta-framework');
  const promptRuntime = path.join(framework, 'prompt-runtime');
  return Object.freeze({ framework, promptRuntime, root: path.join(promptRuntime, 'v1') });
}

function runtimeHandle(common, root, hooks) {
  const runtime = Object.freeze({ commonDirectory: common, root, hooks });
  RUNTIMES.add(runtime);
  return runtime;
}

function validateRuntimeTree(common, root, hooks) {
  const promptRuntime = path.dirname(root);
  const framework = path.dirname(promptRuntime);
  validateOwnedDirectory(framework, 0o700);
  validateOwnedDirectory(promptRuntime, 0o700);
  validateOwnedDirectory(root, 0o700);
  for (const child of ['generations', 'loaders', 'sessions']) {
    validateOwnedDirectory(path.join(root, child), 0o700);
  }
  return runtimeHandle(common, root, hooks);
}

function createRuntimeTree(common, promptRuntime, hooks) {
  try {
    fs.mkdirSync(promptRuntime, { mode: 0o700 });
    fs.chmodSync(promptRuntime, 0o700);
  } catch {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime cannot be initialized');
  }
  const root = path.join(promptRuntime, 'v1');
  for (const directory of [root, path.join(root, 'generations'),
    path.join(root, 'loaders'), path.join(root, 'sessions')]) ensureDirectory(directory, 0o700);
  return validateRuntimeTree(common, root, hooks);
}

function unwrap(runtime) {
  if (!plainObject(runtime) || !RUNTIMES.has(runtime)) fail('PROMPT_RUNTIME_UNAVAILABLE', 'validated prompt runtime is required');
  validateOwnedDirectory(runtime.root, 0o700);
  for (const child of ['generations', 'loaders', 'sessions']) {
    validateOwnedDirectory(path.join(runtime.root, child), 0o700);
  }
  return runtime;
}

function safeRead(target, { code, maximumBytes, mode, immutable = false }) {
  let before;
  try { before = fs.lstatSync(target); } catch { fail(code, 'prompt runtime file is unavailable'); }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 ||
      before.size > maximumBytes || (before.mode & 0o777) !== mode ||
      !ownedByCurrentUser(before) || (immutable && (before.mode & 0o222) !== 0)) {
    fail(code, 'prompt runtime file is unsafe');
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollowFlag(code));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size || (opened.mode & 0o777) !== mode || !ownedByCurrentUser(opened)) {
      fail(code, 'prompt runtime file changed');
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.lstatSync(target);
    if (bytes.length !== opened.size || after.isSymbolicLink() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        (after.mode & 0o777) !== mode || !ownedByCurrentUser(after)) {
      fail(code, 'prompt runtime file changed');
    }
    return bytes;
  } catch (error) {
    if (error instanceof PromptRuntimeError) throw error;
    fail(code, 'prompt runtime file cannot be read');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseJson(bytes, code) {
  try {
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes) || text.includes('\ufeff')) fail(code, 'prompt runtime JSON is invalid');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof PromptRuntimeError) throw error;
    fail(code, 'prompt runtime JSON is invalid');
  }
}

function writePrivateFile(target, bytes, mode) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
      noFollowFlag('PROMPT_RUNTIME_UNAVAILABLE'), mode);
    fs.fchmodSync(descriptor, mode);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } catch {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime file cannot be published');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function runRuntimeHook(runtime, phase) {
  if (typeof runtime?.hooks === 'function') runtime.hooks(phase);
}

function atomicReplace(runtime, directory, name, bytes) {
  const temporary = path.join(directory, `.active-${process.pid}-${randomBytes(16).toString('hex')}`);
  writePrivateFile(temporary, bytes, 0o600);
  try {
    runRuntimeHook(runtime, 'beforeActiveRename');
    fs.renameSync(temporary, path.join(directory, name));
    runRuntimeHook(runtime, 'afterActiveRenameBeforeSync');
    fsyncDirectory(directory);
  } catch {
    try { fs.unlinkSync(temporary); } catch { /* best-effort private-file cleanup */ }
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'active prompt pointer cannot be published');
  }
}

function withWriterLock(runtime, operation) {
  const validated = unwrap(runtime);
  const target = path.join(validated.root, 'writer.lock');
  try {
    fs.mkdirSync(target, { mode: 0o700 });
    fs.chmodSync(target, 0o700);
  } catch { fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime writer is busy'); }
  try {
    validateOwnedDirectory(target, 0o700);
    return operation(validated);
  } finally {
    try { fs.rmdirSync(target); } catch { /* never break or repair a damaged lock implicitly */ }
  }
}

export function initializePromptRuntime(gitCommonDirectory, { hooks = null } = {}) {
  const common = validateCommonDirectory(gitCommonDirectory);
  const { framework, promptRuntime, root } = runtimePaths(common);
  if (pathEntry(promptRuntime) !== null) return validateRuntimeTree(common, root, hooks);
  if (pathEntry(framework) === null) ensureDirectory(framework, 0o700);
  else validateOwnedDirectory(framework, 0o700);
  if (fs.readdirSync(framework).some((name) => PRIVATE_SEED_PATTERN.test(name))) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'interrupted prompt runtime seed requires operator reconciliation');
  }
  return createRuntimeTree(common, promptRuntime, hooks);
}

export function openPromptRuntime(gitCommonDirectory, { hooks = null } = {}) {
  const common = validateCommonDirectory(gitCommonDirectory);
  return validateRuntimeTree(common, runtimePaths(common).root, hooks);
}

export function inspectPromptRuntimeLocation(gitCommonDirectory) {
  const common = validateCommonDirectory(gitCommonDirectory);
  const { framework, promptRuntime } = runtimePaths(common);
  const frameworkEntry = pathEntry(framework);
  if (frameworkEntry === null) return Object.freeze({ schemaVersion: 1, state: 'absent', privateSeeds: 0 });
  validateOwnedDirectory(framework, 0o700);
  const privateSeeds = fs.readdirSync(framework).filter((name) => PRIVATE_SEED_PATTERN.test(name)).length;
  if (pathEntry(promptRuntime) === null) {
    return Object.freeze({ schemaVersion: 1, state: privateSeeds === 0 ? 'absent' : 'interrupted', privateSeeds });
  }
  openPromptRuntime(common);
  return Object.freeze({ schemaVersion: 1, state: 'ready', privateSeeds });
}

export function promptRuntimePath(gitCommonDirectory) {
  return path.join(path.resolve(gitCommonDirectory), ...PROMPT_RUNTIME_RELATIVE.split('/'));
}

export function validatePromptCapacity({
  bodyBytes,
  totalBytes,
  bodyLimit = PROMPT_LIMITS.promptBodyBytes,
  totalLimit = PROMPT_LIMITS.promptBytes,
}) {
  if (!Number.isSafeInteger(bodyBytes) || !Number.isSafeInteger(totalBytes) ||
      !Number.isSafeInteger(bodyLimit) || !Number.isSafeInteger(totalLimit) ||
      bodyBytes < 0 || totalBytes < bodyBytes || bodyLimit < PROMPT_ACTIVATION_RESERVE_BYTES.body ||
      totalLimit < PROMPT_ACTIVATION_RESERVE_BYTES.output) {
    fail('PROMPT_RESERVE', 'prompt capacity evidence is invalid');
  }
  if (bodyBytes > bodyLimit - PROMPT_ACTIVATION_RESERVE_BYTES.body ||
      totalBytes > totalLimit - PROMPT_ACTIVATION_RESERVE_BYTES.output) {
    fail('PROMPT_RESERVE', 'prompt does not preserve the activation reserve');
  }
  return Object.freeze({
    bodyBytes,
    totalBytes,
    bodyHeadroom: bodyLimit - bodyBytes,
    totalHeadroom: totalLimit - totalBytes,
  });
}

function validateCompiledPrompt(value, profile, harness) {
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value) :
    typeof value === 'string' ? Buffer.from(value, 'utf8') : null;
  if (bytes === null || bytes.length < 1 || bytes.length > EXTENSION_LIMITS.promptBytes) {
    fail('GENERATION_CORRUPT', 'compiler returned invalid prompt bytes');
  }
  const first = bytes.indexOf(0x0a);
  const second = first < 0 ? -1 : bytes.indexOf(0x0a, first + 1);
  if (first < 0 || second < 0 || bytes.subarray(0, first).toString() !== 'META-FRAMEWORK-AGENT-PROMPT 1') {
    fail('GENERATION_CORRUPT', 'compiler returned an invalid prompt envelope');
  }
  let embedded;
  try { embedded = JSON.parse(bytes.subarray(first + 1, second).toString('utf8')); }
  catch { fail('GENERATION_CORRUPT', 'compiler returned an invalid prompt manifest'); }
  if (embedded.profile !== profile || embedded.harness !== harness || !validDigest(embedded.digest)) {
    fail('GENERATION_CORRUPT', 'compiler returned a mismatched prompt');
  }
  const embeddedWithoutDigest = { ...embedded };
  delete embeddedWithoutDigest.digest;
  const embeddedDigest = sha256(Buffer.concat([
    Buffer.from(canonicalJson(embeddedWithoutDigest), 'utf8'),
    Buffer.from('\n'),
    bytes.subarray(second + 1),
  ]));
  if (embeddedDigest !== embedded.digest) {
    fail('GENERATION_CORRUPT', 'compiler returned a prompt with an invalid embedded digest');
  }
  const extensionEnabled = Array.isArray(embedded.extensions) && embedded.extensions.length > 0;
  const capacity = validatePromptCapacity({
    bodyBytes: bytes.length - second - 1,
    totalBytes: bytes.length,
    bodyLimit: extensionEnabled ? EXTENSION_LIMITS.combinedBodyBytes : PROMPT_LIMITS.promptBodyBytes,
    totalLimit: extensionEnabled ? EXTENSION_LIMITS.promptBytes : PROMPT_LIMITS.promptBytes,
  });
  return Object.freeze({
    bytes,
    body: bytes.subarray(second + 1),
    digest: sha256(bytes),
    capacity,
    embedded: Object.freeze(embedded),
    embeddedDigest: embedded.digest,
    extensionEnabled,
  });
}

function validateCoreRelationship(compiled, core, profile, harness) {
  if (core.extensionEnabled || !Array.isArray(core.embedded.facets) || !Array.isArray(compiled.embedded.facets) ||
      compiled.embedded.facets.length < core.embedded.facets.length ||
      canonicalJson(compiled.embedded.facets.slice(0, core.embedded.facets.length)) !==
        canonicalJson(core.embedded.facets) ||
      !compiled.body.subarray(0, core.body.length).equals(core.body)) {
    fail('GENERATION_CORRUPT', `extended ${profile}/${harness} prompt does not preserve its core snapshot`);
  }
}

function compileCandidateBinding(compilePrompt, compileCorePrompt, profile, harness) {
  const compiled = validateCompiledPrompt(compilePrompt(profile, harness), profile, harness);
  let core = compiled;
  if (compiled.extensionEnabled) {
    if (typeof compileCorePrompt !== 'function') {
      fail('PROMPT_RESERVE', 'extension-enabled candidates require independent core capacity evidence');
    }
    core = validateCompiledPrompt(compileCorePrompt(profile, harness), profile, harness);
    validateCoreRelationship(compiled, core, profile, harness);
  }
  return Object.freeze({ compiled, core });
}

function exactValidationReceipt(receipt, compiledPromptSetDigest) {
  return plainObject(receipt) && canonicalJson(receipt) ===
    canonicalJson(promptCandidateValidationReceipt(compiledPromptSetDigest));
}

function recognizedValidationReceipt(receipt, compiledPromptSetDigest) {
  if (exactValidationReceipt(receipt, compiledPromptSetDigest)) return true;
  const legacy = {
    schemaVersion: 1,
    validator: 'meta-framework-codex-lifecycle-v1',
    status: 'passed',
    checks: PROMPT_CANDIDATE_CHECKS,
  };
  return plainObject(receipt) && [
    legacy,
    { ...legacy, compiledPromptSetDigest },
  ].some((candidate) => canonicalJson(receipt) === canonicalJson(candidate));
}

function compiledSourceSetDigest(validationMatrix) {
  return sha256(Buffer.concat([
    SOURCE_SET_DOMAIN,
    Buffer.from(canonicalJson(validationMatrix.map(({ profile, harness, digest, coreDigest }) =>
      ({ profile, harness, digest, coreDigest }))), 'utf8'),
  ]));
}

function generationDirectory(runtime, digest) {
  if (!validDigest(digest)) fail('GENERATION_CORRUPT', 'generation digest is invalid');
  return path.join(unwrap(runtime).root, 'generations', digest.slice(7));
}

function generationPreimage(manifest) {
  const withoutDigest = { ...manifest };
  delete withoutDigest.generationDigest;
  return Buffer.concat([GENERATION_DOMAIN, Buffer.from(canonicalJson(withoutDigest), 'utf8')]);
}

export function buildPromptGeneration(runtime, {
  packageIdentity,
  compilerVersion,
  sourceIdentity,
  compilePrompt,
  compileCorePrompt = null,
  validateCandidate,
}) {
  const validated = unwrap(runtime);
  if (!plainObject(packageIdentity) || typeof packageIdentity.name !== 'string' ||
      typeof packageIdentity.version !== 'string' || typeof compilerVersion !== 'string' ||
      !plainObject(sourceIdentity) || typeof compilePrompt !== 'function' || typeof validateCandidate !== 'function') {
    fail('GENERATION_CORRUPT', 'candidate build inputs are invalid', 2);
  }
  const validationMatrix = [];
  const codexPrompts = Object.create(null);
  const firstBindings = new Map();
  for (const profile of PROFILES) {
    for (const harness of HARNESSES) {
      let binding;
      try { binding = compileCandidateBinding(compilePrompt, compileCorePrompt, profile, harness); }
      catch (error) {
        if (error instanceof PromptRuntimeError) throw error;
        fail(error?.code === 'OUTPUT_LIMIT' ? 'PROMPT_RESERVE' : 'GENERATION_CORRUPT',
          'candidate prompt compilation failed');
      }
      const { compiled, core } = binding;
      firstBindings.set(`${profile}:${harness}`, binding);
      validationMatrix.push(Object.freeze({
        profile, harness, bytes: compiled.bytes.length, digest: compiled.digest,
        bodyBytes: compiled.capacity.bodyBytes,
        bodyHeadroom: compiled.capacity.bodyHeadroom,
        totalHeadroom: compiled.capacity.totalHeadroom,
        coreBytes: core.bytes.length,
        coreDigest: core.digest,
        coreBodyBytes: core.capacity.bodyBytes,
        coreBodyHeadroom: PROMPT_LIMITS.promptBodyBytes - core.capacity.bodyBytes,
        coreTotalHeadroom: PROMPT_LIMITS.promptBytes - core.bytes.length,
        embeddedDigest: compiled.embeddedDigest,
      }));
      if (harness === 'codex') codexPrompts[profile] = compiled;
    }
  }
  for (const profile of PROFILES) {
    for (const harness of HARNESSES) {
      let repeated;
      try { repeated = compileCandidateBinding(compilePrompt, compileCorePrompt, profile, harness); }
      catch (error) {
        if (error instanceof PromptRuntimeError) throw error;
        fail('SOURCE_DRIFT', 'candidate source changed during compilation');
      }
      const first = firstBindings.get(`${profile}:${harness}`);
      if (!repeated.compiled.bytes.equals(first.compiled.bytes) || !repeated.core.bytes.equals(first.core.bytes)) {
        fail('SOURCE_DRIFT', 'candidate source changed during compilation');
      }
    }
  }
  const compiledPromptSetDigest = compiledSourceSetDigest(validationMatrix);
  let validationReceipt;
  try {
    validationReceipt = validateCandidate(Object.freeze({
      validationMatrix: Object.freeze(validationMatrix),
      codexPrompts: Object.freeze(Object.fromEntries(PROFILES.map((profile) =>
        [profile, Buffer.from(codexPrompts[profile].bytes)]))),
      compiledPromptSetDigest,
    }));
  } catch {
    fail('CANDIDATE_TEST_FAILED', 'candidate lifecycle validation failed');
  }
  if (!exactValidationReceipt(validationReceipt, compiledPromptSetDigest)) {
    fail('CANDIDATE_TEST_FAILED', 'candidate lifecycle validation did not produce a passing receipt');
  }
  const prompts = Object.fromEntries(PROFILES.map((profile) => [profile, {
    file: `${profile}.prompt`,
    bytes: codexPrompts[profile].bytes.length,
    digest: codexPrompts[profile].digest,
  }]));
  const base = {
    schemaVersion: PROMPT_RUNTIME_SCHEMA_VERSION,
    packageIdentity: { name: packageIdentity.name, version: packageIdentity.version },
    compilerVersion,
    sourceIdentity: { ...sourceIdentity, compiledPromptSetDigest },
    reserve: { ...PROMPT_ACTIVATION_RESERVE_BYTES },
    validationReceipt,
    inventory: { profiles: PROFILES, harnesses: HARNESSES },
    validationMatrix,
    prompts,
  };
  const generationDigest = sha256(generationPreimage(base));
  const manifest = { ...base, generationDigest };
  const finalDirectory = generationDirectory(validated, generationDigest);
  if (fs.existsSync(finalDirectory)) {
    verifyPromptGeneration(validated, generationDigest, { requireCurrentReceipt: true });
    return Object.freeze({ generationDigest, published: false });
  }
  const generations = path.join(validated.root, 'generations');
  const privateDirectory = path.join(generations, `.build-${process.pid}-${randomBytes(16).toString('hex')}`);
  try {
    fs.mkdirSync(privateDirectory, { mode: 0o700 });
    fs.chmodSync(privateDirectory, 0o700);
    for (const profile of PROFILES) {
      const target = path.join(privateDirectory, `${profile}.prompt`);
      writePrivateFile(target, codexPrompts[profile].bytes, 0o600);
      fs.chmodSync(target, 0o400);
    }
    const manifestTarget = path.join(privateDirectory, 'manifest.json');
    writePrivateFile(manifestTarget, Buffer.from(`${canonicalJson(manifest)}\n`), 0o600);
    fs.chmodSync(manifestTarget, 0o400);
    fsyncDirectory(privateDirectory);
    fs.chmodSync(privateDirectory, 0o500);
    runRuntimeHook(validated, 'beforeGenerationClaim');
    fs.renameSync(privateDirectory, finalDirectory);
    fsyncDirectory(generations);
  } catch (error) {
    try { fs.chmodSync(privateDirectory, 0o700); fs.rmSync(privateDirectory, { recursive: true }); } catch { /* private state is never selectable */ }
    if (error?.code === 'EEXIST') {
      verifyPromptGeneration(validated, generationDigest, { requireCurrentReceipt: true });
      return Object.freeze({ generationDigest, published: false });
    }
    if (error instanceof PromptRuntimeError) throw error;
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'candidate generation cannot be published');
  }
  verifyPromptGeneration(validated, generationDigest, { requireCurrentReceipt: true });
  return Object.freeze({ generationDigest, published: true });
}

export function verifyPromptGeneration(runtime, generationDigest, { requireCurrentReceipt = false } = {}) {
  const validated = unwrap(runtime);
  const directory = generationDirectory(validated, generationDigest);
  validateOwnedDirectory(directory, 0o500, 'GENERATION_CORRUPT');
  const manifestBytes = safeRead(path.join(directory, 'manifest.json'), {
    code: 'GENERATION_CORRUPT', maximumBytes: 256 * 1024, mode: 0o400, immutable: true,
  });
  const manifest = parseJson(manifestBytes, 'GENERATION_CORRUPT');
  if (!manifestBytes.equals(Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8'))) {
    fail('GENERATION_CORRUPT', 'generation manifest is not canonical');
  }
  if (!plainObject(manifest) || manifest.schemaVersion !== PROMPT_RUNTIME_SCHEMA_VERSION ||
      manifest.generationDigest !== generationDigest || sha256(generationPreimage(manifest)) !== generationDigest ||
      !plainObject(manifest.sourceIdentity) || !validDigest(manifest.sourceIdentity.compiledPromptSetDigest) ||
      !(requireCurrentReceipt
        ? exactValidationReceipt(manifest.validationReceipt, manifest.sourceIdentity.compiledPromptSetDigest)
        : recognizedValidationReceipt(manifest.validationReceipt, manifest.sourceIdentity.compiledPromptSetDigest)) ||
      !plainObject(manifest.prompts) || Object.keys(manifest.prompts).sort().join('\0') !== [...PROFILES].sort().join('\0') ||
      !Array.isArray(manifest.validationMatrix) || manifest.validationMatrix.length !== PROFILES.length * HARNESSES.length) {
    fail('GENERATION_CORRUPT', 'generation manifest is invalid');
  }
  for (const entry of manifest.validationMatrix) {
    if (!plainObject(entry) || !PROFILES.includes(entry.profile) || !HARNESSES.includes(entry.harness) ||
        !validDigest(entry.digest) || !validDigest(entry.coreDigest) || !validDigest(entry.embeddedDigest) ||
        !Number.isSafeInteger(entry.bytes) || !Number.isSafeInteger(entry.bodyBytes) ||
        !Number.isSafeInteger(entry.bodyHeadroom) || !Number.isSafeInteger(entry.totalHeadroom) ||
        !Number.isSafeInteger(entry.coreBytes) || !Number.isSafeInteger(entry.coreBodyBytes) ||
        !Number.isSafeInteger(entry.coreBodyHeadroom) || !Number.isSafeInteger(entry.coreTotalHeadroom) ||
        entry.bodyHeadroom < PROMPT_ACTIVATION_RESERVE_BYTES.body ||
        entry.totalHeadroom < PROMPT_ACTIVATION_RESERVE_BYTES.output ||
        entry.coreBodyHeadroom < PROMPT_ACTIVATION_RESERVE_BYTES.body ||
        entry.coreTotalHeadroom < PROMPT_ACTIVATION_RESERVE_BYTES.output) {
      fail('GENERATION_CORRUPT', 'generation validation matrix is invalid');
    }
  }
  const bindingIds = new Set(manifest.validationMatrix.map(({ profile, harness }) => `${profile}:${harness}`));
  if (bindingIds.size !== PROFILES.length * HARNESSES.length ||
      compiledSourceSetDigest(manifest.validationMatrix) !== manifest.sourceIdentity.compiledPromptSetDigest) {
    fail('GENERATION_CORRUPT', 'generation validation matrix is incomplete');
  }
  for (const profile of PROFILES) {
    const entry = manifest.prompts[profile];
    if (!plainObject(entry) || entry.file !== `${profile}.prompt` || !Number.isSafeInteger(entry.bytes) ||
        !validDigest(entry.digest)) fail('GENERATION_CORRUPT', 'generation prompt inventory is invalid');
    const prompt = safeRead(path.join(directory, entry.file), {
      code: 'GENERATION_CORRUPT', maximumBytes: EXTENSION_LIMITS.promptBytes, mode: 0o400, immutable: true,
    });
    if (prompt.length !== entry.bytes || sha256(prompt) !== entry.digest) fail('GENERATION_CORRUPT', 'generation prompt is corrupt');
    validateCompiledPrompt(prompt, profile, 'codex');
  }
  return Object.freeze({ generationDigest, manifest });
}

const NULL_ACTIVE_TOKEN = sha256(Buffer.concat([ACTIVE_TOKEN_DOMAIN, Buffer.from('null')]));

function pointerToken(pointer) {
  return pointer === null ? NULL_ACTIVE_TOKEN : sha256(Buffer.concat([
    ACTIVE_TOKEN_DOMAIN, Buffer.from(canonicalJson(pointer), 'utf8'),
  ]));
}

function readActive(runtime, { optional = false } = {}) {
  const target = path.join(unwrap(runtime).root, 'active.json');
  if (optional && !fs.existsSync(target)) return null;
  const pointerBytes = safeRead(target, {
    code: 'PROMPT_RUNTIME_UNAVAILABLE', maximumBytes: 2_048, mode: 0o600,
  });
  const pointer = parseJson(pointerBytes, 'PROMPT_RUNTIME_UNAVAILABLE');
  if (!pointerBytes.equals(Buffer.from(`${canonicalJson(pointer)}\n`, 'utf8'))) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'active prompt pointer is not canonical');
  }
  if (!plainObject(pointer) || Object.keys(pointer).sort().join('\0') !==
      ['generation', 'nonce', 'revision', 'schemaVersion'].sort().join('\0') ||
      pointer.schemaVersion !== 1 || !validDigest(pointer.generation) ||
      !Number.isSafeInteger(pointer.revision) || pointer.revision < 1 ||
      typeof pointer.nonce !== 'string' || !/^[0-9a-f]{32}$/u.test(pointer.nonce)) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'active prompt pointer is invalid');
  }
  return pointer;
}

export function inspectPromptRuntime(runtime) {
  const validated = unwrap(runtime);
  const active = readActive(validated, { optional: true });
  const generationEntries = fs.readdirSync(path.join(validated.root, 'generations')).sort();
  const generations = generationEntries.filter((name) => /^[0-9a-f]{64}$/u.test(name))
    .map((name) => `sha256:${name}`);
  const privateCandidates = generationEntries.filter((name) => PRIVATE_GENERATION_PATTERN.test(name)).length;
  if (generations.length + privateCandidates !== generationEntries.length) {
    fail('GENERATION_CORRUPT', 'generation inventory is corrupt');
  }
  const sessionEntries = fs.readdirSync(path.join(validated.root, 'sessions'));
  if (sessionEntries.some((name) => !/^[0-9a-f]{64}\.json$/u.test(name))) {
    fail('SESSION_PIN_INVALID', 'session pin inventory is corrupt');
  }
  const pins = sessionEntries.length;
  return Object.freeze({
    schemaVersion: 1,
    activeGeneration: active?.generation ?? null,
    activeRevision: active?.revision ?? 0,
    activeToken: pointerToken(active),
    generations,
    privateCandidates,
    pins,
  });
}

function selectGeneration(runtime, generationDigest, { expectedActive }) {
  if (typeof expectedActive !== 'string' || !validDigest(expectedActive)) {
    fail('ACTIVE_STALE', 'exact observed active token is required', 2);
  }
  return withWriterLock(runtime, (validated) => {
    const current = readActive(validated, { optional: true });
    if (pointerToken(current) !== expectedActive) fail('ACTIVE_STALE', 'active prompt pointer changed');
    verifyPromptGeneration(validated, generationDigest, { requireCurrentReceipt: true });
    const pointer = {
      schemaVersion: 1,
      revision: (current?.revision ?? 0) + 1,
      nonce: randomBytes(16).toString('hex'),
      generation: generationDigest,
    };
    atomicReplace(validated, validated.root, 'active.json', Buffer.from(`${canonicalJson(pointer)}\n`));
    return Object.freeze({
      generationDigest,
      activeRevision: pointer.revision,
      activeToken: pointerToken(pointer),
    });
  });
}

export function activatePromptGeneration(runtime, generationDigest, options) {
  return selectGeneration(runtime, generationDigest, options ?? {});
}

export function rollbackPromptGeneration(runtime, generationDigest, options) {
  return selectGeneration(runtime, generationDigest, options ?? {});
}

export function promptBootstrapLoaderDigest(loaderBytes) {
  if (!Buffer.isBuffer(loaderBytes) || loaderBytes.length < 1 || loaderBytes.length > 256 * 1024) {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'bootstrap loader bytes are invalid');
  }
  return sha256(loaderBytes);
}

export function promptBootstrapLoaderRelativePath(digest) {
  if (!validDigest(digest)) fail('PROMPT_RUNTIME_UNAVAILABLE', 'bootstrap loader digest is invalid');
  return `loaders/${digest.slice(7)}.mjs`;
}

export function promptBootstrapLoaderPath(runtime, digest) {
  return path.join(unwrap(runtime).root, ...promptBootstrapLoaderRelativePath(digest).split('/'));
}

export function installPromptBootstrapLoader(runtime, loaderBytes) {
  const validated = unwrap(runtime);
  const digest = promptBootstrapLoaderDigest(loaderBytes);
  const target = promptBootstrapLoaderPath(validated, digest);
  if (fs.existsSync(target)) {
    const existing = safeRead(target, {
      code: 'PROMPT_RUNTIME_UNAVAILABLE', maximumBytes: 256 * 1024, mode: 0o400, immutable: true,
    });
    if (!existing.equals(loaderBytes)) fail('PROMPT_RUNTIME_UNAVAILABLE', 'bootstrap loader digest collision');
    return Object.freeze({ digest, relativePath: promptBootstrapLoaderRelativePath(digest), installed: false });
  }
  const temporary = path.join(validated.root, 'loaders', `.loader-${process.pid}-${randomBytes(16).toString('hex')}`);
  try {
    writePrivateFile(temporary, loaderBytes, 0o600);
    fs.chmodSync(temporary, 0o400);
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* best-effort private-file cleanup */ }
    if (error instanceof PromptRuntimeError) throw error;
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'bootstrap loader cannot be installed');
  }
  return Object.freeze({ digest, relativePath: promptBootstrapLoaderRelativePath(digest), installed: true });
}

function makeTreeWritable(target) {
  const info = pathEntry(target);
  if (info === null || info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    fs.chmodSync(target, 0o700);
    for (const name of fs.readdirSync(target)) makeTreeWritable(path.join(target, name));
  } else if (info.isFile()) fs.chmodSync(target, 0o600);
}

async function withSeedLock(common, operation) {
  const lock = path.join(common, SEED_LOCK_NAME);
  let acquired = false;
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      fs.chmodSync(lock, 0o700);
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed lock cannot be acquired');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (!acquired) fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed writer is busy');
  try {
    validateOwnedDirectory(lock, 0o700);
    return await operation();
  } finally {
    try { fs.rmdirSync(lock); } catch { /* a damaged lock is never broken implicitly */ }
  }
}

export async function seedPromptRuntime(gitCommonDirectory, { hooks = null, prepare } = {}) {
  const common = validateCommonDirectory(gitCommonDirectory);
  if (typeof prepare !== 'function') fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed preparation is required', 2);
  return withSeedLock(common, async () => {
    const existingLocation = inspectPromptRuntimeLocation(common);
    if (existingLocation.state === 'ready') {
      const runtime = openPromptRuntime(common, { hooks });
      return Object.freeze({ runtime, seeded: false });
    }
    if (existingLocation.state !== 'absent') {
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'partial prompt runtime cannot be seeded');
    }
    const { framework, promptRuntime } = runtimePaths(common);
    if (pathEntry(framework) === null) ensureDirectory(framework, 0o700);
    else validateOwnedDirectory(framework, 0o700);
    if (fs.readdirSync(framework).some((name) => PRIVATE_SEED_PATTERN.test(name))) {
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'interrupted prompt runtime seed requires operator reconciliation');
    }
    const privatePromptRuntime = path.join(
      framework, `.prompt-runtime-seed-${process.pid}-${randomBytes(16).toString('hex')}`,
    );
    let published = false;
    try {
      const privateRuntime = createRuntimeTree(common, privatePromptRuntime, hooks);
      const prepared = await prepare(privateRuntime);
      if (!plainObject(prepared) || !validDigest(prepared.generationDigest) || !Buffer.isBuffer(prepared.loaderBytes)) {
        fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed preparation is invalid');
      }
      installPromptBootstrapLoader(privateRuntime, prepared.loaderBytes);
      const activated = activatePromptGeneration(privateRuntime, prepared.generationDigest, {
        expectedActive: NULL_ACTIVE_TOKEN,
      });
      if (activated.activeRevision !== 1) fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed activation is invalid');
      verifyPromptGeneration(privateRuntime, prepared.generationDigest);
      if (pathEntry(promptRuntime) !== null) fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime appeared during seed');
      runRuntimeHook(privateRuntime, 'beforeSeedParentSync');
      fsyncDirectory(privateRuntime.root);
      fsyncDirectory(privatePromptRuntime);
      runRuntimeHook(privateRuntime, 'afterSeedParentSyncBeforePublish');
      fs.renameSync(privatePromptRuntime, promptRuntime);
      fsyncDirectory(framework);
      published = true;
      const runtime = openPromptRuntime(common, { hooks });
      return Object.freeze({ runtime, seeded: true });
    } catch (error) {
      if (error instanceof PromptRuntimeError) throw error;
      fail('PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime seed failed');
    } finally {
      if (!published) {
        try {
          makeTreeWritable(privatePromptRuntime);
          fs.rmSync(privatePromptRuntime, { recursive: true });
        } catch { /* interrupted private state remains non-selectable and visible */ }
      }
    }
  });
}

export function retireSessionPin(runtime, sessionId, {
  expectedGeneration,
  controllerDescriptorPath = null,
} = {}) {
  const validated = unwrap(runtime);
  if (!validDigest(expectedGeneration)) fail('SESSION_PIN_INVALID', 'expected session generation is required', 2);
  try {
    return retirePromptSession(Buffer.from(JSON.stringify({
      hook_event_name: 'SessionEnd', session_id: sessionId,
    })), {
      runtimeRoot: validated.root,
      expectedGeneration,
      controllerDescriptorPath,
      allowControllerOperatorRetirement: controllerDescriptorPath === null,
    });
  } catch (error) {
    if (error instanceof PromptBootstrapError) fail(error.code, 'session pin retirement failed');
    throw error;
  }
}

function readPinGeneration(target) {
  const pinBytes = safeRead(target, {
    code: 'SESSION_PIN_INVALID', maximumBytes: 1_024, mode: 0o600,
  });
  const pin = parseJson(pinBytes, 'SESSION_PIN_INVALID');
  if (!pinBytes.equals(Buffer.from(`${canonicalJson(pin)}\n`, 'utf8'))) {
    fail('SESSION_PIN_INVALID', 'session pin is not canonical');
  }
  if (!plainObject(pin)) fail('SESSION_PIN_INVALID', 'session pin is corrupt');
  const keys = Object.keys(pin).sort().join('\0');
  const v1 = keys === ['generation', 'schemaVersion'].sort().join('\0') && pin.schemaVersion === 1;
  const v2Keys = [
    'schemaVersion', 'generation', 'sessionIdDigest', 'descriptorId', 'descriptorDigest',
    'bindingDigest', 'role', 'profile', 'profileDigest', 'promptDigest',
    'descriptorPathIdentity', 'launcherConnectionId', 'jobId', 'cwdIdentity',
  ].sort().join('\0');
  const controllerProfiles = {
    root_analysis: 'root', root_decision: 'root', implementer: 'implementer',
    reviewer: 'reviewer', qa: 'qa', security: 'security',
  };
  const controllerId = (value) => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(value);
  const v2 = keys === v2Keys && pin.schemaVersion === 2 &&
    ['sessionIdDigest', 'descriptorDigest', 'bindingDigest', 'profileDigest', 'promptDigest',
      'descriptorPathIdentity', 'cwdIdentity'].every((field) => validDigest(pin[field])) &&
    controllerId(pin.descriptorId) && controllerId(pin.launcherConnectionId) &&
    controllerId(pin.jobId) && Object.hasOwn(controllerProfiles, pin.role) &&
    pin.profile === controllerProfiles[pin.role];
  if ((!v1 && !v2) || !validDigest(pin.generation)) {
    fail('SESSION_PIN_INVALID', 'session pin is corrupt');
  }
  return pin.generation;
}

export function cleanupPromptRuntime(runtime, {
  generationRetentionMs = PROMPT_GENERATION_RETENTION_MS,
  now = Date.now(),
  apply = false,
} = {}) {
  if (!Number.isSafeInteger(generationRetentionMs) || generationRetentionMs < PROMPT_GENERATION_RETENTION_MS ||
      !Number.isSafeInteger(now) || typeof apply !== 'boolean') {
    fail('PROMPT_RUNTIME_UNAVAILABLE', 'cleanup options are invalid', 2);
  }
  return withWriterLock(runtime, (validated) => {
    const sessions = path.join(validated.root, 'sessions');
    const referenced = new Set();
    for (const name of fs.readdirSync(sessions).sort()) {
      if (!/^[0-9a-f]{64}\.json$/u.test(name)) fail('SESSION_PIN_INVALID', 'session pin inventory is corrupt');
      referenced.add(readPinGeneration(path.join(sessions, name)));
    }
    const active = readActive(validated, { optional: true })?.generation ?? null;
    const generations = path.join(validated.root, 'generations');
    const removable = [];
    let privateCandidates = 0;
    for (const name of fs.readdirSync(generations).sort()) {
      if (PRIVATE_GENERATION_PATTERN.test(name)) {
        privateCandidates += 1;
        continue;
      }
      if (!/^[0-9a-f]{64}$/u.test(name)) fail('GENERATION_CORRUPT', 'generation inventory is corrupt');
      const digest = `sha256:${name}`;
      verifyPromptGeneration(validated, digest);
      const info = fs.lstatSync(path.join(generations, name));
      if (digest !== active && !referenced.has(digest) && now - info.mtimeMs >= generationRetentionMs) {
        removable.push(digest);
      }
    }
    if (apply) {
      for (const digest of removable) {
        const directory = generationDirectory(validated, digest);
        fs.chmodSync(directory, 0o700);
        for (const name of fs.readdirSync(directory)) fs.chmodSync(path.join(directory, name), 0o600);
        fs.rmSync(directory, { recursive: true });
      }
      if (removable.length > 0) fsyncDirectory(generations);
    }
    return Object.freeze({
      apply,
      removable: Object.freeze(removable),
      removed: apply ? removable.length : 0,
      privateCandidates,
    });
  });
}

export function serveRuntimePrompt(runtime, inputBytes, profile, { controllerDescriptorPath = null } = {}) {
  try {
    return servePromptEvent(inputBytes, {
      runtimeRoot: unwrap(runtime).root, profile, controllerDescriptorPath,
    });
  } catch (error) {
    if (error instanceof PromptBootstrapError) fail(error.code, 'prompt event could not be served');
    throw error;
  }
}
