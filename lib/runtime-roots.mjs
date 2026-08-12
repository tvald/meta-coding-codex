import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { TASK_COMPATIBILITY } from './task-compatibility.mjs';
import { PROVIDER_PROBE_COMPATIBILITY } from './provider-contract.mjs';
import { PROMPT_COMPILER_COMPATIBILITY } from './prompt-contract.mjs';
import { PROJECT_INIT_COMPATIBILITY } from './project-contract.mjs';
import { HOOK_ADAPTER_COMPATIBILITY } from './hook-contract.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_MANIFEST_BYTES = 1_048_576;
const VALIDATED_TASK_RUNTIMES = new WeakSet();
const VALIDATED_CLIENT_RUNTIMES = new WeakSet();
const PACKAGE_RUNTIMES = new WeakSet();

export class RuntimeRootError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeRootError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuntimeRootError(code, message);
}

function inside(root, target, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  return (allowRoot || relative !== '') && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function ordinaryDirectory(target, label) {
  const resolved = path.resolve(target);
  let info;
  try {
    info = fs.lstatSync(resolved);
  } catch {
    fail('ROOT_UNAVAILABLE', `${label} is unavailable`);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail('ROOT_UNSAFE', `${label} must be an ordinary directory`);
  }
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    fail('ROOT_UNSAFE', `${label} cannot be resolved`);
  }
  if (real !== resolved) fail('ROOT_UNSAFE', `${label} is not its physical lexical path`);
  return resolved;
}

function ordinaryTree(root, target, label) {
  if (!inside(root, target, { allowRoot: true })) fail('ROOT_MISMATCH', `${label} escapes the client repository`);
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative === '' ? [] : relative.split(path.sep)) {
    current = path.join(current, part);
    let info;
    try {
      info = fs.lstatSync(current);
    } catch {
      fail('ROOT_UNAVAILABLE', `${label} is unavailable`);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail('ROOT_UNSAFE', `${label} contains a symbolic or non-directory component`);
    }
  }
  let realTarget;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    fail('ROOT_UNSAFE', `${label} cannot be resolved`);
  }
  if (realTarget !== target) fail('ROOT_UNSAFE', `${label} is not its physical lexical path`);
}

function parseJsonWithoutDuplicateKeys(text, code, label) {
  let cursor = 0;

  function invalid() {
    fail(code, `${label} is not valid JSON metadata`);
  }

  function whitespace() {
    while (cursor < text.length && [' ', '\t', '\n', '\r'].includes(text[cursor])) cursor += 1;
  }

  function string() {
    if (text[cursor] !== '"') invalid();
    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < text.length) {
      const character = text[cursor];
      cursor += 1;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') {
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          invalid();
        }
      } else if (character.charCodeAt(0) <= 0x1f) invalid();
    }
    invalid();
  }

  function value(depth = 0) {
    if (depth > 64) invalid();
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1;
      whitespace();
      const result = Object.create(null);
      const keys = new Set();
      if (text[cursor] === '}') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) invalid();
        keys.add(key);
        whitespace();
        if (text[cursor] !== ':') invalid();
        cursor += 1;
        result[key] = value(depth + 1);
        whitespace();
        if (text[cursor] === '}') {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ',') invalid();
        cursor += 1;
      }
      invalid();
    }
    if (character === '[') {
      cursor += 1;
      whitespace();
      const result = [];
      if (text[cursor] === ']') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        result.push(value(depth + 1));
        whitespace();
        if (text[cursor] === ']') {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ',') invalid();
        cursor += 1;
      }
      invalid();
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, cursor)) {
        cursor += token.length;
        return parsed;
      }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(cursor));
    if (match === null) invalid();
    cursor += match[0].length;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) invalid();
    return parsed;
  }

  const parsed = value();
  whitespace();
  if (cursor !== text.length) invalid();
  return parsed;
}

function deepFreezeJson(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function parseJsonBytes(bytes, label, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > MAX_MANIFEST_BYTES ||
      (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    fail(code, `${label} is not one bounded JSON document`);
  }
  try {
    return deepFreezeJson(parseJsonWithoutDuplicateKeys(UTF8.decode(bytes), code, label));
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail(code, `${label} is not valid UTF-8 JSON`);
  }
}

export function parseBoundedJsonBytes(bytes, {
  label = 'JSON input',
  code = 'INPUT_INVALID',
  maxBytes = MAX_MANIFEST_BYTES,
} = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > maxBytes ||
      (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    fail(code, `${label} is not one bounded JSON document`);
  }
  try {
    return deepFreezeJson(parseJsonWithoutDuplicateKeys(UTF8.decode(bytes), code, label));
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail(code, `${label} is not valid UTF-8 JSON`);
  }
}

function readJsonFile(root, relativePath, label, code = 'CLIENT_METADATA') {
  const target = path.join(root, ...relativePath.split('/'));
  const parent = path.dirname(target);
  ordinaryTree(root, parent, `${label} parent`);
  let info;
  try {
    info = fs.lstatSync(target);
  } catch {
    fail(code, `${label} is unavailable`);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      info.size < 2 || info.size > MAX_MANIFEST_BYTES) {
    fail(code, `${label} is not one bounded ordinary file`);
  }
  let realTarget;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    fail(code, `${label} cannot be resolved`);
  }
  if (realTarget !== target || !inside(root, target)) {
    fail(code, `${label} escapes its owning root`);
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const openInfo = fs.fstatSync(descriptor);
    if (!openInfo.isFile() || openInfo.nlink !== 1 || openInfo.dev !== info.dev ||
        openInfo.ino !== info.ino || openInfo.size !== info.size) {
      fail(code, `${label} changed during inspection`);
    }
    const bytes = fs.readFileSync(descriptor);
    const finalInfo = fs.lstatSync(target);
    if (bytes.length !== openInfo.size || finalInfo.isSymbolicLink() || finalInfo.nlink !== 1 ||
        finalInfo.dev !== openInfo.dev || finalInfo.ino !== openInfo.ino ||
        finalInfo.size !== openInfo.size ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      fail(code, `${label} changed or contains a byte-order mark`);
    }
    return parseJsonBytes(bytes, label, code);
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail(code, `${label} is not valid UTF-8 JSON`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function packageRootFromModule(moduleUrl) {
  let modulePath;
  try {
    modulePath = path.resolve(fileURLToPath(moduleUrl));
  } catch {
    fail('PACKAGE_ROOT_UNSAFE', 'the package entrypoint URL is invalid');
  }
  let moduleInfo;
  try {
    moduleInfo = fs.lstatSync(modulePath);
  } catch {
    fail('PACKAGE_ROOT_UNSAFE', 'the package entrypoint is unavailable');
  }
  if (!moduleInfo.isFile() || moduleInfo.isSymbolicLink() || moduleInfo.nlink !== 1 ||
      fs.realpathSync(modulePath) !== modulePath) {
    fail('PACKAGE_ROOT_UNSAFE', 'the package entrypoint is not one physical ordinary file');
  }
  const packageRoot = ordinaryDirectory(path.resolve(path.dirname(modulePath), '..'), 'package root');
  if (!inside(packageRoot, modulePath)) fail('PACKAGE_ROOT_UNSAFE', 'the package entrypoint escapes its package root');
  return packageRoot;
}

function exactIntegerArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => Number.isInteger(value) && value === expected[index]);
}

function validTaskCompatibility(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(TASK_COMPATIBILITY).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]) &&
    value.version === TASK_COMPATIBILITY.version &&
    exactIntegerArray(value.envelopeVersions, TASK_COMPATIBILITY.envelopeVersions) &&
    exactIntegerArray(value.readableStoreSchemaVersions, TASK_COMPATIBILITY.readableStoreSchemaVersions) &&
    exactIntegerArray(value.writableStoreSchemaVersions, TASK_COMPATIBILITY.writableStoreSchemaVersions);
}

function exactStringArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => typeof value === 'string' && value === expected[index]);
}

function validProviderCompatibility(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(PROVIDER_PROBE_COMPATIBILITY).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]) &&
    value.version === PROVIDER_PROBE_COMPATIBILITY.version &&
    exactIntegerArray(value.envelopeVersions, PROVIDER_PROBE_COMPATIBILITY.envelopeVersions) &&
    exactStringArray(value.harnesses, PROVIDER_PROBE_COMPATIBILITY.harnesses) &&
    exactStringArray(value.capabilities, PROVIDER_PROBE_COMPATIBILITY.capabilities);
}

function validPromptCompatibility(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(PROMPT_COMPILER_COMPATIBILITY).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]) &&
    value.version === PROMPT_COMPILER_COMPATIBILITY.version &&
    exactIntegerArray(value.envelopeVersions, PROMPT_COMPILER_COMPATIBILITY.envelopeVersions) &&
    exactIntegerArray(value.promptFormatVersions, PROMPT_COMPILER_COMPATIBILITY.promptFormatVersions) &&
    exactIntegerArray(value.registrySchemaVersions, PROMPT_COMPILER_COMPATIBILITY.registrySchemaVersions) &&
    exactIntegerArray(value.extensionManifestVersions, PROMPT_COMPILER_COMPATIBILITY.extensionManifestVersions) &&
    exactIntegerArray(value.extensionApiVersions, PROMPT_COMPILER_COMPATIBILITY.extensionApiVersions) &&
    exactStringArray(value.profiles, PROMPT_COMPILER_COMPATIBILITY.profiles) &&
    exactStringArray(value.harnesses, PROMPT_COMPILER_COMPATIBILITY.harnesses);
}

function validProjectInitCompatibility(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(PROJECT_INIT_COMPATIBILITY).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]) &&
    value.version === PROJECT_INIT_COMPATIBILITY.version &&
    exactIntegerArray(value.envelopeVersions, PROJECT_INIT_COMPATIBILITY.envelopeVersions) &&
    exactIntegerArray(value.bootstrapVersions, PROJECT_INIT_COMPATIBILITY.bootstrapVersions) &&
    exactIntegerArray(value.stateTemplateVersions, PROJECT_INIT_COMPATIBILITY.stateTemplateVersions) &&
    exactStringArray(value.optionalHarnesses, PROJECT_INIT_COMPATIBILITY.optionalHarnesses) &&
    exactIntegerArray(value.codexIntegrationConfigVersions,
      PROJECT_INIT_COMPATIBILITY.codexIntegrationConfigVersions);
}

function validHookCompatibility(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(HOOK_ADAPTER_COMPATIBILITY).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]) &&
    value.version === HOOK_ADAPTER_COMPATIBILITY.version &&
    exactIntegerArray(value.envelopeVersions, HOOK_ADAPTER_COMPATIBILITY.envelopeVersions) &&
    exactIntegerArray(value.hookEventSchemaVersions, HOOK_ADAPTER_COMPATIBILITY.hookEventSchemaVersions) &&
    exactIntegerArray(value.integrationConfigVersions, HOOK_ADAPTER_COMPATIBILITY.integrationConfigVersions) &&
    exactStringArray(value.harnesses, HOOK_ADAPTER_COMPATIBILITY.harnesses) &&
    exactStringArray(value.profiles, HOOK_ADAPTER_COMPATIBILITY.profiles) &&
    exactStringArray(value.testedCodexVersions, HOOK_ADAPTER_COMPATIBILITY.testedCodexVersions);
}

function validRegistryResolution(value) {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const resolved = new URL(value);
    return resolved.protocol === 'https:' && resolved.username === '' && resolved.password === '' &&
      resolved.hash === '' && resolved.search === '' && resolved.pathname.endsWith('.tgz');
  } catch {
    return false;
  }
}

function validSha512Integrity(value) {
  if (typeof value !== 'string') return false;
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[1], 'base64');
  return bytes.length === 64 && bytes.toString('base64') === match[1];
}

function validPackageManifest(manifest) {
  return manifest.name === '@tvald/meta-framework' &&
    typeof manifest.version === 'string' &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(manifest.version) &&
    manifest.metaFramework !== null && typeof manifest.metaFramework === 'object' &&
    !Array.isArray(manifest.metaFramework) &&
    validTaskCompatibility(manifest.metaFramework.taskCli) &&
    validProviderCompatibility(manifest.metaFramework.providerProbe) &&
    validPromptCompatibility(manifest.metaFramework.promptCompiler) &&
    validProjectInitCompatibility(manifest.metaFramework.projectInit) &&
    validHookCompatibility(manifest.metaFramework.hookAdapter);
}

function declaredFrameworkAlias(clientManifest, packageIdentity) {
  const declared = clientManifest.dependencies?.['meta-framework'];
  return declared === `npm:${packageIdentity.name}@${packageIdentity.version}` ? declared : null;
}

function validInstalledLock(lock, declared, packageIdentity) {
  const installedLock = lock.packages?.['node_modules/meta-framework'];
  return lock.lockfileVersion === 3 && lock.packages?.['']?.dependencies?.['meta-framework'] === declared &&
    installedLock?.name === packageIdentity.name && installedLock?.version === packageIdentity.version &&
    validRegistryResolution(installedLock.resolved) && validSha512Integrity(installedLock.integrity);
}

export function readPackageIdentity(moduleUrl) {
  const packageRoot = packageRootFromModule(moduleUrl);
  const manifest = readJsonFile(packageRoot, 'package.json', 'package manifest', 'PACKAGE_METADATA');
  if (!validPackageManifest(manifest)) {
    fail('PACKAGE_METADATA', 'package identity is unavailable or invalid');
  }
  const runtime = Object.freeze({
    packageRoot,
    identity: Object.freeze({ name: manifest.name, version: manifest.version }),
    taskCompatibility: TASK_COMPATIBILITY,
    providerProbeCompatibility: PROVIDER_PROBE_COMPATIBILITY,
    promptCompilerCompatibility: PROMPT_COMPILER_COMPATIBILITY,
    projectInitCompatibility: PROJECT_INIT_COMPATIBILITY,
    hookAdapterCompatibility: HOOK_ADAPTER_COMPATIBILITY,
  });
  PACKAGE_RUNTIMES.add(runtime);
  return runtime;
}

export function unwrapPackageRuntime(runtime) {
  if ((typeof runtime !== 'object' && typeof runtime !== 'function') || runtime === null ||
      !PACKAGE_RUNTIMES.has(runtime)) {
    fail('PACKAGE_ROOT_UNSAFE', 'a validated package runtime is required');
  }
  return runtime;
}

export function validateClientRuntimeRoots({
  packageRuntime,
  entryPath = process.argv[1],
  context,
}) {
  if ((typeof packageRuntime !== 'object' && typeof packageRuntime !== 'function') ||
      packageRuntime === null || !PACKAGE_RUNTIMES.has(packageRuntime)) {
    fail('PACKAGE_ROOT_UNSAFE', 'a validated package runtime is required');
  }
  const { packageRoot, identity: packageIdentity } = packageRuntime;
  if (context === null || typeof context !== 'object' ||
      typeof context.root !== 'string' || typeof context.commonDir !== 'string') {
    fail('ROOT_UNSAFE', 'the client repository context is unavailable');
  }
  const clientRoot = ordinaryDirectory(context.root, 'client Git root');
  const clientManifest = readJsonFile(clientRoot, 'package.json', 'client package manifest');
  if (typeof entryPath !== 'string' || path.resolve(entryPath) !== path.join(packageRoot, 'bin', 'meta-framework.mjs')) {
    fail('PACKAGE_ROOT_UNSAFE', 'the invoked entrypoint does not match the executing package');
  }

  if (packageRoot === clientRoot) {
    if (packageRoot.split(path.sep).includes('node_modules')) {
      fail('ROOT_MISMATCH', 'source mode is forbidden beneath node_modules');
    }
    if (clientManifest.name !== packageIdentity.name || clientManifest.version !== packageIdentity.version) {
      fail('ROOT_MISMATCH', 'source package identity does not match the client repository');
    }
    const runtime = Object.freeze({
      context,
      packageRoot,
      clientRoot,
      mode: 'source',
      clientManifest,
      clientLock: null,
      identity: packageIdentity,
    });
    VALIDATED_CLIENT_RUNTIMES.add(runtime);
    return runtime;
  }

  const declared = declaredFrameworkAlias(clientManifest, packageIdentity);
  if (declared === null) {
    fail('ROOT_MISMATCH', 'the client does not declare the exact framework dependency alias');
  }
  const aliasRoot = path.join(clientRoot, 'node_modules', 'meta-framework');
  ordinaryTree(clientRoot, aliasRoot, 'installed framework dependency');
  if (fs.realpathSync(aliasRoot) !== packageRoot) {
    fail('ROOT_MISMATCH', 'the executing package does not match the client dependency alias');
  }
  if (path.resolve(entryPath) !== path.join(aliasRoot, 'bin', 'meta-framework.mjs')) {
    fail('ROOT_MISMATCH', 'the invoked entrypoint does not belong to the client dependency alias');
  }

  const lock = readJsonFile(clientRoot, 'package-lock.json', 'client package lock');
  if (!validInstalledLock(lock, declared, packageIdentity)) {
    fail('CLIENT_METADATA', 'the client package lock does not match the installed framework dependency');
  }
  const runtime = Object.freeze({
    context,
    packageRoot,
    clientRoot,
    mode: 'installed',
    clientManifest,
    clientLock: lock,
    identity: packageIdentity,
  });
  VALIDATED_CLIENT_RUNTIMES.add(runtime);
  return runtime;
}

export function validateClientRuntimeMetadataSnapshot(runtime, {
  packageManifestBytes,
  clientManifestBytes,
  clientLockBytes,
}) {
  const validated = unwrapValidatedClientRuntime(runtime);
  const packageManifest = parseJsonBytes(packageManifestBytes, 'package manifest snapshot', 'PACKAGE_METADATA');
  if (!validPackageManifest(packageManifest) ||
      packageManifest.name !== validated.identity.name ||
      packageManifest.version !== validated.identity.version) {
    fail('PACKAGE_METADATA', 'package manifest snapshot does not match the validated package identity');
  }
  const clientManifest = parseJsonBytes(clientManifestBytes, 'client package manifest snapshot', 'CLIENT_METADATA');
  let clientLock = null;
  if (validated.mode === 'source') {
    if (clientLockBytes !== null || clientManifest.name !== validated.identity.name ||
        clientManifest.version !== validated.identity.version) {
      fail('CLIENT_METADATA', 'source client metadata snapshot does not match the package identity');
    }
  } else {
    const declared = declaredFrameworkAlias(clientManifest, validated.identity);
    if (declared === null || !Buffer.isBuffer(clientLockBytes)) {
      fail('CLIENT_METADATA', 'client metadata snapshot does not declare the validated framework alias');
    }
    clientLock = parseJsonBytes(clientLockBytes, 'client package lock snapshot', 'CLIENT_METADATA');
    if (!validInstalledLock(clientLock, declared, validated.identity)) {
      fail('CLIENT_METADATA', 'client package lock snapshot does not match the validated framework dependency');
    }
  }
  return Object.freeze({ packageManifest, clientManifest, clientLock });
}

export function unwrapValidatedClientRuntime(runtime) {
  if ((typeof runtime !== 'object' && typeof runtime !== 'function') || runtime === null ||
      !VALIDATED_CLIENT_RUNTIMES.has(runtime)) {
    fail('ROOT_UNSAFE', 'validated package and client roots are required');
  }
  return runtime;
}

export function validateTaskRuntimeRoots(options) {
  const { packageRuntime, context } = options ?? {};
  if ((typeof packageRuntime !== 'object' && typeof packageRuntime !== 'function') ||
      packageRuntime === null || !PACKAGE_RUNTIMES.has(packageRuntime)) {
    fail('PACKAGE_ROOT_UNSAFE', 'a validated package runtime is required');
  }
  if (context === null || typeof context !== 'object' || typeof context.root !== 'string' ||
      typeof context.commonDir !== 'string' || typeof context.storeRoot !== 'string') {
    fail('ROOT_UNSAFE', 'the client repository context is unavailable');
  }
  const clientRoot = ordinaryDirectory(context.root, 'client Git root');
  if (path.resolve(context.storeRoot) !== path.join(clientRoot, 'readme', 'tasks', 'store')) {
    fail('ROOT_MISMATCH', 'the task store does not belong to the client Git root');
  }
  const clientRuntime = validateClientRuntimeRoots(options);
  const runtime = Object.freeze({
    context: clientRuntime.context,
    packageRoot: clientRuntime.packageRoot,
    clientRoot: clientRuntime.clientRoot,
    mode: clientRuntime.mode,
  });
  VALIDATED_TASK_RUNTIMES.add(runtime);
  return runtime;
}

export function unwrapValidatedTaskRuntime(runtime) {
  if ((typeof runtime !== 'object' && typeof runtime !== 'function') || runtime === null ||
      !VALIDATED_TASK_RUNTIMES.has(runtime)) {
    fail('ROOT_UNSAFE', 'validated package and client roots are required');
  }
  return runtime;
}
