import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { TASK_COMPATIBILITY } from './task-compatibility.mjs';
import { PROVIDER_PROBE_COMPATIBILITY } from './provider-contract.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_MANIFEST_BYTES = 1_048_576;
const VALIDATED_TASK_RUNTIMES = new WeakSet();
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
  if (fs.realpathSync(target) !== target) fail('ROOT_UNSAFE', `${label} is not its physical lexical path`);
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
  if (fs.realpathSync(target) !== target || !inside(root, target)) {
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
    if (bytes.length !== openInfo.size || finalInfo.isSymbolicLink() ||
        finalInfo.dev !== openInfo.dev || finalInfo.ino !== openInfo.ino ||
        finalInfo.size !== openInfo.size ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      fail(code, `${label} changed or contains a byte-order mark`);
    }
    return JSON.parse(UTF8.decode(bytes));
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

export function readPackageIdentity(moduleUrl) {
  const packageRoot = packageRootFromModule(moduleUrl);
  const manifest = readJsonFile(packageRoot, 'package.json', 'package manifest', 'PACKAGE_METADATA');
  if (manifest.name !== '@tvald/meta-framework' ||
      typeof manifest.version !== 'string' ||
      !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(manifest.version) ||
      manifest.metaFramework === null || typeof manifest.metaFramework !== 'object' ||
      Array.isArray(manifest.metaFramework) ||
      !validTaskCompatibility(manifest.metaFramework.taskCli) ||
      !validProviderCompatibility(manifest.metaFramework.providerProbe)) {
    fail('PACKAGE_METADATA', 'package identity is unavailable or invalid');
  }
  const runtime = Object.freeze({
    packageRoot,
    identity: Object.freeze({ name: manifest.name, version: manifest.version }),
    taskCompatibility: TASK_COMPATIBILITY,
    providerProbeCompatibility: PROVIDER_PROBE_COMPATIBILITY,
  });
  PACKAGE_RUNTIMES.add(runtime);
  return runtime;
}

export function validateTaskRuntimeRoots({
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
      typeof context.root !== 'string' || typeof context.commonDir !== 'string' ||
      typeof context.storeRoot !== 'string') {
    fail('ROOT_UNSAFE', 'the client repository context is unavailable');
  }
  const clientRoot = ordinaryDirectory(context.root, 'client Git root');
  if (path.resolve(context.storeRoot) !== path.join(clientRoot, 'readme', 'tasks', 'store')) {
    fail('ROOT_MISMATCH', 'the task store does not belong to the client Git root');
  }
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
    const runtime = Object.freeze({ context, packageRoot, clientRoot, mode: 'source' });
    VALIDATED_TASK_RUNTIMES.add(runtime);
    return runtime;
  }

  const declared = clientManifest.dependencies?.['meta-framework'];
  const expectedAlias = `npm:${packageIdentity.name}@${packageIdentity.version}`;
  if (declared !== expectedAlias) {
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
  const installedLock = lock.packages?.['node_modules/meta-framework'];
  if (lock.lockfileVersion !== 3 || lock.packages?.['']?.dependencies?.['meta-framework'] !== declared ||
      installedLock?.name !== packageIdentity.name ||
      installedLock?.version !== packageIdentity.version ||
      !validRegistryResolution(installedLock.resolved) ||
      !validSha512Integrity(installedLock.integrity)) {
    fail('CLIENT_METADATA', 'the client package lock does not match the installed framework dependency');
  }
  const runtime = Object.freeze({ context, packageRoot, clientRoot, mode: 'installed' });
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
