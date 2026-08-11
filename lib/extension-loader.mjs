import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import {
  EXTENSION_COMPATIBILITY,
  EXTENSION_LIMITS,
  EXTENSION_MANIFEST_PATH,
  RESERVED_EXTENSION_NAMESPACES,
} from './extension-contract.mjs';
import { PROMPT_COMPILER_COMPATIBILITY } from './prompt-contract.mjs';
import { unwrapValidatedClientRuntime } from './runtime-roots.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const RANGE = /^>=(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*) <(0|[1-9]\d*)\.0\.0$/u;
const UNRESERVED_PACKAGE = /^[a-z0-9][a-z0-9._-]*$/u;
const UNSAFE_MODE_MASK = 0o7022;
const RESERVED_FACET_PATH_SEGMENTS = new Set([
  '.agents',
  '.claude',
  '.codex',
  'commands',
  'hooks',
  'node_modules',
  'plugins',
  'skills',
  'tools',
]);
const OPTIONAL_PROSE = new Set([
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.md',
  'NOTICE',
  'NOTICE.md',
  'README',
  'README.md',
]);
const FORBIDDEN_PACKAGE_FIELDS = Object.freeze([
  'bin',
  'browser',
  'bundleDependencies',
  'bundledDependencies',
  'dependencies',
  'devDependencies',
  'directories',
  'exports',
  'gypfile',
  'imports',
  'main',
  'man',
  'module',
  'optionalDependencies',
  'overrides',
  'peerDependencies',
  'peerDependenciesMeta',
  'scripts',
  'types',
  'typings',
  'workspaces',
]);
const FORBIDDEN_LOCK_FIELDS = Object.freeze([
  'bin',
  'bundleDependencies',
  'bundledDependencies',
  'dependencies',
  'dev',
  'devOptional',
  'inBundle',
  'link',
  'optional',
  'optionalDependencies',
  'peer',
  'peerDependencies',
  'peerDependenciesMeta',
]);
const RESOLVED_CATALOGS = new WeakSet();

export class ExtensionError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message) {
  throw new ExtensionError(code, message);
}

function bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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

function canonicalJson(value, depth = 0) {
  if (depth > 32) fail('EXTENSION_MANIFEST_INVALID', 'the extension manifest is invalid');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
  }
  fail('EXTENSION_MANIFEST_INVALID', 'the extension manifest is invalid');
}

function parseJsonWithoutDuplicateKeys(text, label) {
  let cursor = 0;

  function invalid() {
    fail(label, 'extension package metadata is invalid');
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
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          invalid();
        }
      } else if (character.charCodeAt(0) <= 0x1f) {
        invalid();
      }
    }
    invalid();
  }

  function value(depth = 0) {
    if (depth > 32) invalid();
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

function validId(value) {
  return typeof value === 'string' && bytes(value) <= 64 && ID.test(value);
}

function validRelativePath(value) {
  if (typeof value !== 'string' || value === '' || bytes(value) > 256 ||
      value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function validExtensionPackageName(value) {
  if (typeof value !== 'string' || bytes(value) > 214 ||
      value === 'meta-framework' || value === '@tvald/meta-framework') return false;
  if (value.startsWith('@')) {
    const parts = value.slice(1).split('/');
    return parts.length === 2 && parts.every((part) => UNRESERVED_PACKAGE.test(part));
  }
  return !value.includes('/') && UNRESERVED_PACKAGE.test(value);
}

export function validStableSemver(value) {
  if (typeof value !== 'string') return false;
  const match = STABLE_SEMVER.exec(value);
  return match !== null && match.slice(1).every((part) => Number.isSafeInteger(Number(part)));
}

function semverParts(value) {
  const match = STABLE_SEMVER.exec(value);
  if (match === null) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function validFrameworkRange(value, frameworkVersion) {
  const match = typeof value === 'string' ? RANGE.exec(value) : null;
  const runtime = semverParts(frameworkVersion);
  if (match === null || runtime === null) return false;
  const minimum = match.slice(1, 4).map(Number);
  const upperMajor = Number(match[4]);
  if (![...minimum, upperMajor].every(Number.isSafeInteger) || upperMajor !== minimum[0] + 1) return false;
  return compareSemver(runtime, minimum) >= 0 && compareSemver(runtime, [upperMajor, 0, 0]) < 0;
}

function validProfiles(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= PROMPT_COMPILER_COMPATIBILITY.profiles.length &&
    new Set(value).size === value.length && value.every((profile, index) =>
      PROMPT_COMPILER_COMPATIBILITY.profiles.includes(profile) &&
      (index === 0 || value[index - 1] < profile));
}

export function validateExtensionManifest(manifestText, {
  expectedName,
  expectedVersion,
  frameworkVersion,
} = {}) {
  if (typeof manifestText !== 'string' || bytes(manifestText) > EXTENSION_LIMITS.extensionManifestBytes ||
      !manifestText.endsWith('\n') || manifestText.includes('\r') || manifestText.startsWith('\ufeff')) {
    fail('EXTENSION_MANIFEST_INVALID', 'the extension manifest is invalid');
  }
  const manifest = parseJsonWithoutDuplicateKeys(manifestText, 'EXTENSION_MANIFEST_INVALID');
  if (`${canonicalJson(manifest)}\n` !== manifestText || !exactKeys(manifest, [
    'apiVersion',
    'facets',
    'frameworkRange',
    'manifestVersion',
    'name',
    'namespace',
    'promptFormatVersions',
    'version',
  ]) || manifest.apiVersion !== EXTENSION_COMPATIBILITY.extensionApiVersions[0] ||
      manifest.manifestVersion !== EXTENSION_COMPATIBILITY.extensionManifestVersions[0] ||
      manifest.name !== expectedName || manifest.version !== expectedVersion ||
      !validExtensionPackageName(manifest.name) || !validStableSemver(manifest.version) ||
      !validId(manifest.namespace) || RESERVED_EXTENSION_NAMESPACES.includes(manifest.namespace) ||
      !validFrameworkRange(manifest.frameworkRange, frameworkVersion) ||
      !Array.isArray(manifest.promptFormatVersions) || manifest.promptFormatVersions.length !== 1 ||
      manifest.promptFormatVersions[0] !== PROMPT_COMPILER_COMPATIBILITY.promptFormatVersions[0] ||
      !Array.isArray(manifest.facets) || manifest.facets.length < 1 ||
      manifest.facets.length > EXTENSION_LIMITS.facetsPerExtension) {
    fail('EXTENSION_MANIFEST_INVALID', 'the extension manifest is invalid');
  }

  const facets = [];
  const ids = new Set();
  const paths = new Set();
  let previousOrder = 0;
  for (const facet of manifest.facets) {
    if (!exactKeys(facet, ['id', 'kind', 'order', 'path', 'profiles', 'slot']) ||
        !validId(facet.id) || ids.has(facet.id) || facet.kind !== 'skill' ||
        !Number.isSafeInteger(facet.order) || facet.order < 1 || facet.order > 65_535 ||
        facet.order <= previousOrder || !validRelativePath(facet.path) ||
        !facet.path.startsWith('facets/') || facet.path === 'facets/' || !facet.path.endsWith('.md') ||
        facet.path.split('/').slice(1).some((part) =>
          RESERVED_FACET_PATH_SEGMENTS.has(part.toLowerCase())) ||
        paths.has(facet.path) ||
        !validProfiles(facet.profiles) || typeof facet.slot !== 'string' || bytes(facet.slot) > 128 ||
        !facet.slot.startsWith('extension.') || !validId(facet.slot.slice('extension.'.length))) {
      fail('EXTENSION_MANIFEST_INVALID', 'an extension facet declaration is invalid');
    }
    ids.add(facet.id);
    paths.add(facet.path);
    previousOrder = facet.order;
    facets.push(Object.freeze({
      id: facet.id,
      kind: facet.kind,
      order: facet.order,
      path: facet.path,
      profiles: Object.freeze([...facet.profiles]),
      slot: facet.slot,
    }));
  }
  return Object.freeze({
    apiVersion: manifest.apiVersion,
    facets: Object.freeze(facets),
    frameworkRange: manifest.frameworkRange,
    manifestVersion: manifest.manifestVersion,
    name: manifest.name,
    namespace: manifest.namespace,
    promptFormatVersions: Object.freeze([...manifest.promptFormatVersions]),
    version: manifest.version,
  });
}

function safeText(root, relativePath, maximumBytes, label) {
  if (!validRelativePath(relativePath)) fail(label, 'extension package content is unavailable');
  const target = path.join(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(label, 'extension package content is unavailable');
  }
  let current = root;
  for (const part of relativePath.split('/').slice(0, -1)) {
    current = path.join(current, part);
    let info;
    let real;
    try {
      info = fs.lstatSync(current);
      real = fs.realpathSync(current);
    } catch {
      fail(label, 'extension package content is unavailable');
    }
    if (!info.isDirectory() || info.isSymbolicLink() || real !== current) {
      fail(label, 'extension package content is unavailable');
    }
  }
  let before;
  let realTarget;
  try {
    before = fs.lstatSync(target);
    realTarget = fs.realpathSync(target);
  } catch {
    fail(label, 'extension package content is unavailable');
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      before.size < 1 || before.size > maximumBytes || realTarget !== target ||
      (before.mode & (0o111 | UNSAFE_MODE_MASK)) !== 0) {
    fail(label, 'extension package content is unavailable');
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size || (opened.mode & (0o111 | UNSAFE_MODE_MASK)) !== 0) {
      fail(label, 'extension package content changed during inspection');
    }
    const content = fs.readFileSync(descriptor);
    const after = fs.lstatSync(target);
    if (content.length !== opened.size || after.isSymbolicLink() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        (after.mode & (0o111 | UNSAFE_MODE_MASK)) !== 0 ||
        (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf)) {
      fail(label, 'extension package content changed during inspection');
    }
    const text = UTF8.decode(content);
    if (text.includes('\r') || !text.endsWith('\n')) fail(label, 'extension package content is invalid');
    return text;
  } catch (error) {
    if (error instanceof ExtensionError) throw error;
    fail(label, 'extension package content is invalid');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function physicalExtensionRoot(clientRoot, packageName) {
  const target = path.join(clientRoot, 'node_modules', ...packageName.split('/'));
  const relative = path.relative(clientRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('EXTENSION_ROOT_UNSAFE', 'the extension package root is unavailable');
  }
  let current = clientRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let info;
    let real;
    try {
      info = fs.lstatSync(current);
      real = fs.realpathSync(current);
    } catch {
      fail('EXTENSION_ROOT_UNSAFE', 'the extension package root is unavailable');
    }
    if (!info.isDirectory() || info.isSymbolicLink() || real !== current ||
        (info.mode & UNSAFE_MODE_MASK) !== 0) {
      fail('EXTENSION_ROOT_UNSAFE', 'the extension package root is unavailable');
    }
  }
  return target;
}

function allowedDirectories(facetPaths) {
  const result = new Set();
  for (const facetPath of facetPaths) {
    const parts = facetPath.split('/');
    for (let index = 1; index < parts.length; index += 1) result.add(parts.slice(0, index).join('/'));
  }
  return result;
}

function inventorySnapshot(root, facetPaths) {
  const required = new Set(['package.json', EXTENSION_MANIFEST_PATH, ...facetPaths]);
  const directories = allowedDirectories(facetPaths);
  const records = [];
  let entries = 0;
  let totalBytes = 0;

  function walk(relativeDirectory) {
    const directory = relativeDirectory === '' ? root : path.join(root, ...relativeDirectory.split('/'));
    let names;
    try {
      names = fs.readdirSync(directory).sort();
    } catch {
      fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
    }
    for (const name of names) {
      const relative = relativeDirectory === '' ? name : `${relativeDirectory}/${name}`;
      const target = path.join(directory, name);
      entries += 1;
      if (entries > EXTENSION_LIMITS.inventoryEntries) {
        fail('EXTENSION_LIMIT', 'the extension package exceeds its inventory limit');
      }
      let info;
      let real;
      try {
        info = fs.lstatSync(target);
        real = fs.realpathSync(target);
      } catch {
        fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
      }
      if (info.isSymbolicLink() || real !== target || (info.mode & UNSAFE_MODE_MASK) !== 0) {
        fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
      }
      if (info.isDirectory()) {
        if (!directories.has(relative)) {
          fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
        }
        records.push(`${relative}\0directory\0${info.dev}\0${info.ino}\0${info.mode}\0${info.mtimeMs}\0${info.ctimeMs}`);
        walk(relative);
      } else if (info.isFile()) {
        const optionalProse = relativeDirectory === '' && OPTIONAL_PROSE.has(name);
        if ((!required.has(relative) && !optionalProse) || info.nlink !== 1 ||
            (info.mode & (0o111 | UNSAFE_MODE_MASK)) !== 0) {
          fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
        }
        totalBytes += info.size;
        if (totalBytes > EXTENSION_LIMITS.inventoryBytes) {
          fail('EXTENSION_LIMIT', 'the extension package exceeds its inventory limit');
        }
        records.push(`${relative}\0file\0${info.dev}\0${info.ino}\0${info.mode}\0${info.nlink}\0${info.size}\0${info.mtimeMs}\0${info.ctimeMs}`);
      } else {
        fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
      }
    }
  }

  walk('');
  if ([...required].some((requiredPath) => !records.some((record) => record.startsWith(`${requiredPath}\0file\0`)))) {
    fail('EXTENSION_INVENTORY_INVALID', 'the extension package inventory is invalid');
  }
  return records.join('\n');
}

function validRegistryResolution(value) {
  if (typeof value !== 'string' || bytes(value) > 2_048) return false;
  try {
    const resolved = new URL(value);
    return resolved.protocol === 'https:' && resolved.username === '' && resolved.password === '' &&
      resolved.search === '' && resolved.hash === '' && resolved.pathname.endsWith('.tgz');
  } catch {
    return false;
  }
}

function validSha512Integrity(value) {
  if (typeof value !== 'string') return false;
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(value);
  if (match === null) return false;
  const decoded = Buffer.from(match[1], 'base64');
  return decoded.length === 64 && decoded.toString('base64') === match[1];
}

function rejectCompetingShrinkwrap(clientRoot) {
  const target = path.join(clientRoot, 'npm-shrinkwrap.json');
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('EXTENSION_LOCK_INVALID', 'the client dependency lock is invalid');
  }
  fail('EXTENSION_LOCK_INVALID', 'the client dependency lock is invalid');
}

function extensionSelector(runtime) {
  const container = runtime.clientManifest.metaFramework;
  if (container === undefined) return [];
  if (!plainObject(container)) fail('EXTENSION_SELECTOR_INVALID', 'the extension allowlist is invalid');
  const selected = container.extensions;
  if (selected === undefined) return [];
  if (!Array.isArray(selected) || selected.length > EXTENSION_LIMITS.extensions ||
      new Set(selected).size !== selected.length || !selected.every(validExtensionPackageName)) {
    fail('EXTENSION_SELECTOR_INVALID', 'the extension allowlist is invalid');
  }
  return selected;
}

function lockBinding(runtime, packageName, version) {
  const dependencies = runtime.clientManifest.dependencies;
  const dependency = plainObject(dependencies) ? dependencies[packageName] : undefined;
  const forbiddenPlacement = ['devDependencies', 'optionalDependencies', 'peerDependencies']
    .some((field) => Object.hasOwn(runtime.clientManifest[field] ?? {}, packageName));
  const lock = runtime.clientLock;
  const packages = plainObject(lock) && plainObject(lock.packages) ? lock.packages : null;
  const lockRoot = packages?.[''];
  const rootDependencies = plainObject(lockRoot) && plainObject(lockRoot.dependencies) ? lockRoot.dependencies : null;
  const lockEntry = packages?.[`node_modules/${packageName}`];
  if (!plainObject(dependencies) || dependency !== version || forbiddenPlacement || !plainObject(lock) ||
      lock.lockfileVersion !== 3 || !plainObject(packages) || !plainObject(lockRoot) ||
      rootDependencies?.[packageName] !== version || !plainObject(lockEntry) ||
      lockEntry.version !== version || (lockEntry.name !== undefined && lockEntry.name !== packageName) ||
      !validRegistryResolution(lockEntry.resolved) || !validSha512Integrity(lockEntry.integrity) ||
      FORBIDDEN_LOCK_FIELDS.some((field) => Object.hasOwn(lockEntry, field)) || Boolean(lockEntry.hasInstallScript)) {
    fail('EXTENSION_LOCK_INVALID', 'an extension dependency lock binding is invalid');
  }
  return lockEntry.integrity;
}

function validatePackageManifest(packageText, packageName, version) {
  const manifest = parseJsonWithoutDuplicateKeys(packageText, 'EXTENSION_PACKAGE_INVALID');
  if (!plainObject(manifest) || manifest.name !== packageName || manifest.version !== version ||
      FORBIDDEN_PACKAGE_FIELDS.some((field) => Object.hasOwn(manifest, field))) {
    fail('EXTENSION_PACKAGE_INVALID', 'the extension package manifest is invalid');
  }
  return manifest;
}

function validateFacetContent(content) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(content) ||
      content.includes('{{') || content.includes('}}') ||
      /^META-FRAMEWORK-/mu.test(content) || content.includes('meta-framework-facet:v1:')) {
    fail('EXTENSION_FACET_INVALID', 'extension facet content is invalid');
  }
}

function emptyCatalog() {
  const catalog = Object.freeze({ extensions: Object.freeze([]) });
  RESOLVED_CATALOGS.add(catalog);
  return catalog;
}

export function resolveLockedPromptExtensions(clientRuntime) {
  const runtime = unwrapValidatedClientRuntime(clientRuntime);
  const selected = extensionSelector(runtime);
  if (runtime.mode === 'source') {
    if (selected.length !== 0) fail('EXTENSION_SELECTOR_INVALID', 'source mode cannot enable extensions');
    return emptyCatalog();
  }
  if (selected.length === 0) return emptyCatalog();
  rejectCompetingShrinkwrap(runtime.clientRoot);

  const extensions = [];
  const namespaces = new Set();
  const facetIds = new Set();
  const profileSlots = new Map(PROMPT_COMPILER_COMPATIBILITY.profiles.map((profile) => [profile, new Set()]));
  const selectedPerProfile = new Map(PROMPT_COMPILER_COMPATIBILITY.profiles.map((profile) => [profile, 0]));
  let aggregateFacets = 0;

  for (const packageName of selected) {
    const version = runtime.clientManifest.dependencies?.[packageName];
    if (!validStableSemver(version)) {
      fail('EXTENSION_PACKAGE_INVALID', 'an extension dependency version is invalid');
    }
    const integrity = lockBinding(runtime, packageName, version);
    const extensionRoot = physicalExtensionRoot(runtime.clientRoot, packageName);
    const packageText = safeText(extensionRoot, 'package.json', EXTENSION_LIMITS.packageManifestBytes,
      'EXTENSION_PACKAGE_INVALID');
    validatePackageManifest(packageText, packageName, version);
    const manifestText = safeText(extensionRoot, EXTENSION_MANIFEST_PATH,
      EXTENSION_LIMITS.extensionManifestBytes, 'EXTENSION_MANIFEST_INVALID');
    const manifest = validateExtensionManifest(manifestText, {
      expectedName: packageName,
      expectedVersion: version,
      frameworkVersion: runtime.identity.version,
    });
    if (namespaces.has(manifest.namespace)) {
      fail('EXTENSION_CONFLICT', 'extension namespaces conflict');
    }
    namespaces.add(manifest.namespace);
    aggregateFacets += manifest.facets.length;
    if (aggregateFacets > EXTENSION_LIMITS.aggregateFacets) {
      fail('EXTENSION_LIMIT', 'the extension facet inventory exceeds its limit');
    }

    const beforeInventory = inventorySnapshot(extensionRoot, manifest.facets.map(({ path: value }) => value));
    const facets = [];
    for (const facet of manifest.facets) {
      const id = `extension.${manifest.namespace}.${facet.id}`;
      if (facetIds.has(id)) fail('EXTENSION_CONFLICT', 'extension facet identifiers conflict');
      facetIds.add(id);
      for (const profile of facet.profiles) {
        const slots = profileSlots.get(profile);
        if (slots.has(facet.slot)) fail('EXTENSION_CONFLICT', 'extension profile slots conflict');
        slots.add(facet.slot);
        const count = selectedPerProfile.get(profile) + 1;
        if (count > EXTENSION_LIMITS.selectedFacetsPerProfile) {
          fail('EXTENSION_LIMIT', 'a profile exceeds its extension facet limit');
        }
        selectedPerProfile.set(profile, count);
      }
      const content = safeText(extensionRoot, facet.path, EXTENSION_LIMITS.facetBytes,
        'EXTENSION_FACET_INVALID');
      validateFacetContent(content);
      facets.push(Object.freeze({
        id,
        topic: `extension.${manifest.namespace}`,
        path: facet.path,
        slot: facet.slot,
        kind: facet.kind,
        order: facet.order,
        profiles: facet.profiles,
        content,
      }));
    }
    if (inventorySnapshot(extensionRoot, manifest.facets.map(({ path: value }) => value)) !== beforeInventory) {
      fail('EXTENSION_INVENTORY_INVALID', 'the extension package changed during inspection');
    }
    extensions.push(Object.freeze({
      name: packageName,
      version,
      namespace: manifest.namespace,
      apiVersion: manifest.apiVersion,
      manifestVersion: manifest.manifestVersion,
      frameworkRange: manifest.frameworkRange,
      integrity,
      manifestDigest: digest(manifestText),
      packageManifestDigest: digest(packageText),
      facets: Object.freeze(facets),
    }));
  }

  const catalog = Object.freeze({ extensions: Object.freeze(extensions) });
  RESOLVED_CATALOGS.add(catalog);
  return catalog;
}

export function unwrapResolvedPromptExtensions(catalog) {
  if ((typeof catalog !== 'object' && typeof catalog !== 'function') || catalog === null ||
      !RESOLVED_CATALOGS.has(catalog)) {
    fail('EXTENSION_CATALOG_INVALID', 'a resolved extension catalog is required');
  }
  return catalog;
}
