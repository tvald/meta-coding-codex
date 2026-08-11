import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import {
  CONTENT_ENVELOPE_MARKER,
  HARNESS_CONTRACT,
  PROFILE_REQUIREMENTS,
  PROMPT_COMPILER_COMPATIBILITY,
  PROMPT_ENVELOPE_MARKER,
  PROMPT_LIMITS,
  PROMPT_REGISTRY_PATH,
} from './prompt-contract.mjs';
import { EXTENSION_LIMITS } from './extension-contract.mjs';
import { unwrapResolvedPromptExtensions } from './extension-loader.mjs';
import { unwrapPackageRuntime } from './runtime-roots.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VARIABLE = /^[A-Z][A-Z_]{0,31}$/u;
const START_MARKER = /^<!-- meta-framework-facet:v1:start ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*) -->$/u;
const END_MARKER = /^<!-- meta-framework-facet:v1:end ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*) -->$/u;

export class PromptCompilerError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'PromptCompilerError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message, exitCode = 1) {
  throw new PromptCompilerError(code, message, exitCode);
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

function validId(value) {
  return typeof value === 'string' && bytes(value) <= 64 && ID.test(value);
}

function validFacetId(value) {
  return validId(value) || (typeof value === 'string' && value.startsWith('extension.') &&
    bytes(value) <= 139 && ID.test(value));
}

function validPackagePath(value) {
  if (typeof value !== 'string' || value === '' || bytes(value) > 256 ||
      value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  const parts = value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

function equalArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function equalStringSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value));
}

function sortedUniqueStrings(values, validator = validId) {
  return Array.isArray(values) && values.every(validator) && new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1] < value);
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('CONTRACT_INVALID', 'prompt data contains an unsupported value');
}

function safePackageText(packageRoot, relativePath, maximumBytes, label) {
  if (!validPackagePath(relativePath)) fail('RESOURCE_INVALID', `${label} is unavailable`);
  const target = path.join(packageRoot, ...relativePath.split('/'));
  const relative = path.relative(packageRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('RESOURCE_INVALID', `${label} is unavailable`);
  }
  let current = packageRoot;
  for (const part of relativePath.split('/').slice(0, -1)) {
    current = path.join(current, part);
    let parentInfo;
    try {
      parentInfo = fs.lstatSync(current);
    } catch {
      fail('RESOURCE_UNAVAILABLE', `${label} is unavailable`);
    }
    let realParent;
    try {
      realParent = fs.realpathSync(current);
    } catch {
      fail('RESOURCE_CHANGED', `${label} is unavailable`);
    }
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || realParent !== current) {
      fail('RESOURCE_UNSAFE', `${label} is unavailable`);
    }
  }
  let before;
  try {
    before = fs.lstatSync(target);
  } catch {
    fail('RESOURCE_UNAVAILABLE', `${label} is unavailable`);
  }
  let realTarget;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    fail('RESOURCE_CHANGED', `${label} is unavailable`);
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      before.size < 1 || before.size > maximumBytes || realTarget !== target) {
    fail('RESOURCE_UNSAFE', `${label} is unavailable`);
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size) fail('RESOURCE_CHANGED', `${label} is unavailable`);
    const content = fs.readFileSync(descriptor);
    const after = fs.lstatSync(target);
    if (content.length !== opened.size || after.isSymbolicLink() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf)) {
      fail('RESOURCE_CHANGED', `${label} is unavailable`);
    }
    const text = UTF8.decode(content);
    if (text.includes('\r') || !text.endsWith('\n')) fail('RESOURCE_ENCODING', `${label} is unavailable`);
    return text;
  } catch (error) {
    if (error instanceof PromptCompilerError) throw error;
    fail('RESOURCE_ENCODING', `${label} is unavailable`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function sourceLookup(sources, topic) {
  return sources instanceof Map ? sources.get(topic) : sources?.[topic];
}

function parseFacetMarkers(topic, source) {
  const lines = source.split('\n');
  const found = [];
  let open = null;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const start = START_MARKER.exec(line);
    const end = END_MARKER.exec(line);
    if (line.includes('meta-framework-facet:v1:') && start === null && end === null) {
      fail('REGISTRY_INVALID', 'a facet marker is malformed');
    }
    if (start !== null) {
      if (open !== null) fail('REGISTRY_INVALID', 'facet markers overlap');
      open = { id: start[1], line: index };
    } else if (end !== null) {
      if (open === null || end[1] !== open.id) fail('REGISTRY_INVALID', 'facet markers are unbalanced');
      const payload = `${lines.slice(open.line + 1, index).join('\n')}\n`;
      if (payload === '\n' || bytes(payload) > PROMPT_LIMITS.facetBytes) {
        fail('REGISTRY_INVALID', 'a facet payload is empty or oversized');
      }
      found.push({ id: open.id, topic, payload });
      open = null;
    }
  }
  if (open !== null) fail('REGISTRY_INVALID', 'a facet marker is unclosed');
  return found;
}

function validateDocuments(documents) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > PROMPT_LIMITS.documents) {
    fail('REGISTRY_INVALID', 'the document inventory is invalid');
  }
  let previous = '';
  for (const document of documents) {
    if (!exactKeys(document, ['id', 'path']) || !validId(document.id) || !validPackagePath(document.path) ||
        document.id <= previous) fail('REGISTRY_INVALID', 'the document inventory is not canonical');
    previous = document.id;
  }
  if (new Set(documents.map(({ path: value }) => value)).size !== documents.length) {
    fail('REGISTRY_INVALID', 'document paths must be unique');
  }
}

function validateFacets(facets, documentIds) {
  if (!Array.isArray(facets) || facets.length < 1 || facets.length > PROMPT_LIMITS.facets) {
    fail('REGISTRY_INVALID', 'the facet inventory is invalid');
  }
  let previousOrder = 0;
  for (const facet of facets) {
    if (!exactKeys(facet, ['id', 'slot', 'ownerTopic', 'order', 'templateVariables']) ||
        !validId(facet.id) || !validId(facet.slot) || !documentIds.has(facet.ownerTopic) ||
        !Number.isSafeInteger(facet.order) || facet.order <= previousOrder ||
        !sortedUniqueStrings(facet.templateVariables, (value) =>
          typeof value === 'string' && bytes(value) <= 32 && VARIABLE.test(value))) {
      fail('REGISTRY_INVALID', 'the facet inventory is not canonical');
    }
    previousOrder = facet.order;
  }
  if (new Set(facets.map(({ id }) => id)).size !== facets.length ||
      new Set(facets.map(({ order }) => order)).size !== facets.length) {
    fail('REGISTRY_INVALID', 'facet identifiers and orders must be unique');
  }
  for (const facet of facets) {
    const expected = facet.id === 'harness.delegation' ? ['HARNESS', 'NATIVE_SURFACE'] : [];
    if (!equalArray(facet.templateVariables, expected)) {
      fail('REGISTRY_INVALID', 'facet template variables differ from the closed contract');
    }
    if (facet.id.startsWith('roles.') !== (facet.slot === 'role')) {
      fail('REGISTRY_INVALID', 'role facets must occupy the closed role slot');
    }
  }
}

function validateProfiles(profiles, facetById) {
  if (!Array.isArray(profiles) || profiles.length !== PROMPT_COMPILER_COMPATIBILITY.profiles.length) {
    fail('REGISTRY_INVALID', 'the profile inventory is invalid');
  }
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    const id = PROMPT_COMPILER_COMPATIBILITY.profiles[index];
    if (!exactKeys(profile, ['id', 'facets']) || profile.id !== id ||
        !Array.isArray(profile.facets) || profile.facets.length > PROMPT_LIMITS.profileFacets ||
        !equalStringSet(profile.facets, PROFILE_REQUIREMENTS[id])) {
      fail('REGISTRY_INVALID', 'a profile differs from the required contract');
    }
    const slots = new Set();
    let previousOrder = 0;
    for (const facetId of profile.facets) {
      const facet = facetById.get(facetId);
      if (facet === undefined || facet.order <= previousOrder || slots.has(facet.slot)) {
        fail('REGISTRY_INVALID', 'a profile contains an unknown, unordered, or conflicting facet');
      }
      slots.add(facet.slot);
      previousOrder = facet.order;
    }
  }
}

function validateHarnesses(harnesses, facetById, profiles) {
  if (!Array.isArray(harnesses) || harnesses.length !== PROMPT_COMPILER_COMPATIBILITY.harnesses.length) {
    fail('REGISTRY_INVALID', 'the harness inventory is invalid');
  }
  for (let index = 0; index < harnesses.length; index += 1) {
    const harness = harnesses[index];
    const id = PROMPT_COMPILER_COMPATIBILITY.harnesses[index];
    const expected = HARNESS_CONTRACT[id];
    const expectedVariables = Object.keys(expected.templateVariables);
    if (!exactKeys(harness, ['id', 'nativeSurface', 'rootFacets', 'templateVariables']) ||
        harness.id !== id || harness.nativeSurface !== expected.nativeSurface ||
        !equalArray(harness.rootFacets, expected.rootFacets) ||
        !exactKeys(harness.templateVariables, expectedVariables) ||
        expectedVariables.some((name) => harness.templateVariables[name] !== expected.templateVariables[name]) ||
        !harness.rootFacets.every((facetId) => facetById.has(facetId))) {
      fail('REGISTRY_INVALID', 'a harness differs from the closed contract');
    }
    const rootProfile = profiles.find((profile) => profile.id === 'root');
    const combined = [...rootProfile.facets, ...harness.rootFacets];
    const slots = new Set();
    let previousOrder = 0;
    if (combined.length > PROMPT_LIMITS.profileFacets) {
      fail('REGISTRY_INVALID', 'a harness root profile exceeds its facet limit');
    }
    for (const facetId of combined) {
      const facet = facetById.get(facetId);
      if (facet.order <= previousOrder || slots.has(facet.slot)) {
        fail('REGISTRY_INVALID', 'a harness root profile is unordered or conflicting');
      }
      slots.add(facet.slot);
      previousOrder = facet.order;
    }
  }
}

export function validatePromptRegistry(registry, sources) {
  if (!exactKeys(registry, [
    'schemaVersion',
    'promptFormatVersion',
    'contentEnvelopeVersion',
    'documents',
    'facets',
    'profiles',
    'harnesses',
  ]) || registry.schemaVersion !== 1 || registry.promptFormatVersion !== 1 ||
      registry.contentEnvelopeVersion !== 1) {
    fail('REGISTRY_INVALID', 'the registry envelope is invalid');
  }
  validateDocuments(registry.documents);
  const documentById = new Map(registry.documents.map((document) => [document.id, document]));
  validateFacets(registry.facets, new Set(documentById.keys()));
  const facetById = new Map(registry.facets.map((facet) => [facet.id, facet]));
  validateProfiles(registry.profiles, facetById);
  validateHarnesses(registry.harnesses, facetById, registry.profiles);

  const selected = new Set(registry.profiles.flatMap(({ facets }) => facets));
  for (const harness of registry.harnesses) for (const facetId of harness.rootFacets) selected.add(facetId);
  if (selected.size !== facetById.size || [...facetById.keys()].some((id) => !selected.has(id))) {
    fail('REGISTRY_INVALID', 'the registry contains an orphaned facet');
  }

  const payloadById = new Map();
  for (const document of registry.documents) {
    const source = sourceLookup(sources, document.id);
    if (typeof source !== 'string' || !source.endsWith('\n') || source.includes('\r') ||
        bytes(source) > PROMPT_LIMITS.documentSourceBytes) {
      fail('REGISTRY_INVALID', 'a declared document source is invalid');
    }
    for (const found of parseFacetMarkers(document.id, source)) {
      const facet = facetById.get(found.id);
      if (facet === undefined || facet.ownerTopic !== document.id || payloadById.has(found.id)) {
        fail('REGISTRY_INVALID', 'a facet owner or marker is invalid');
      }
      const variables = [...found.payload.matchAll(/\{\{([A-Z][A-Z_]*)\}\}/gu)].map((match) => match[1]);
      if (!equalArray([...new Set(variables)].sort(), facet.templateVariables)) {
        fail('REGISTRY_INVALID', 'facet template variables differ from the registry');
      }
      payloadById.set(found.id, found.payload);
    }
  }
  if (payloadById.size !== facetById.size || [...facetById.keys()].some((id) => !payloadById.has(id))) {
    fail('REGISTRY_INVALID', 'a declared facet has no unique canonical marker');
  }
  return Object.freeze({ registry, documentById, facetById, payloadById, sources });
}

export function loadPromptCatalog(packageRuntime) {
  const { packageRoot } = unwrapPackageRuntime(packageRuntime);
  const registryText = safePackageText(packageRoot, PROMPT_REGISTRY_PATH, PROMPT_LIMITS.registryBytes, 'prompt registry');
  let registry;
  try {
    registry = JSON.parse(registryText);
  } catch {
    fail('REGISTRY_INVALID', 'the prompt registry is invalid');
  }
  const sources = new Map();
  if (!Array.isArray(registry?.documents) || registry.documents.length > PROMPT_LIMITS.documents) {
    fail('REGISTRY_INVALID', 'the document inventory is invalid');
  }
  for (const document of registry.documents) {
    if (!exactKeys(document, ['id', 'path']) || !validId(document.id) || !validPackagePath(document.path)) {
      fail('REGISTRY_INVALID', 'the document inventory is invalid');
    }
    sources.set(document.id,
      safePackageText(packageRoot, document.path, PROMPT_LIMITS.documentSourceBytes, 'declared document'));
  }
  return validatePromptRegistry(registry, sources);
}

function renderFacet(payload, templateVariables, substitutions) {
  let rendered = payload;
  for (const variable of templateVariables) {
    if (!Object.hasOwn(substitutions, variable)) fail('RENDER_INVALID', 'required prompt data is unavailable');
    rendered = rendered.split(`{{${variable}}}`).join(substitutions[variable]);
  }
  if (/\{\{[A-Z][A-Z_]*\}\}/u.test(rendered)) fail('RENDER_INVALID', 'required prompt data is unavailable');
  return rendered;
}

function versionMetadata(packageRuntime) {
  const { identity, promptCompilerCompatibility: compatibility } = unwrapPackageRuntime(packageRuntime);
  return {
    schemaVersion: 1,
    package: identity,
    promptCompiler: {
      version: compatibility.version,
      envelopeVersions: [...compatibility.envelopeVersions],
      promptFormatVersions: [...compatibility.promptFormatVersions],
      registrySchemaVersions: [...compatibility.registrySchemaVersions],
      extensionManifestVersions: [...compatibility.extensionManifestVersions],
      extensionApiVersions: [...compatibility.extensionApiVersions],
      profiles: [...compatibility.profiles],
      harnesses: [...compatibility.harnesses],
    },
  };
}

export function promptCompilerVersionEnvelope(packageRuntime) {
  return `${canonicalJson(versionMetadata(packageRuntime))}\n`;
}

function resolvedExtensionData(resolvedExtensions) {
  if (resolvedExtensions === null || resolvedExtensions === undefined) {
    return Object.freeze({ extensions: Object.freeze([]) });
  }
  return unwrapResolvedPromptExtensions(resolvedExtensions);
}

function extensionProvenance(extension) {
  return {
    apiVersion: extension.apiVersion,
    frameworkRange: extension.frameworkRange,
    integrity: extension.integrity,
    manifestDigest: extension.manifestDigest,
    manifestVersion: extension.manifestVersion,
    name: extension.name,
    namespace: extension.namespace,
    packageManifestDigest: extension.packageManifestDigest,
    version: extension.version,
  };
}

export function compileAgentPrompt(packageRuntime, profileId, harnessId = 'portable', resolvedExtensions = null) {
  const runtime = unwrapPackageRuntime(packageRuntime);
  if (!PROMPT_COMPILER_COMPATIBILITY.profiles.includes(profileId) ||
      !PROMPT_COMPILER_COMPATIBILITY.harnesses.includes(harnessId)) {
    fail('IDENTIFIER_UNKNOWN', 'the requested prompt is unavailable');
  }
  const catalog = loadPromptCatalog(packageRuntime);
  const profile = catalog.registry.profiles.find(({ id }) => id === profileId);
  const harness = catalog.registry.harnesses.find(({ id }) => id === harnessId);
  const facetIds = profileId === 'root' ? [...profile.facets, ...harness.rootFacets] : [...profile.facets];
  const orderedIds = [...facetIds].sort((left, right) =>
    catalog.facetById.get(left).order - catalog.facetById.get(right).order);
  const facets = [];
  let coreBody = '';
  for (const id of orderedIds) {
    const facet = catalog.facetById.get(id);
    const document = catalog.documentById.get(facet.ownerTopic);
    const raw = catalog.payloadById.get(id);
    const rendered = renderFacet(raw, facet.templateVariables, harness.templateVariables);
    facets.push({
      id,
      topic: facet.ownerTopic,
      path: document.path,
      rawSourceDigest: digest(raw),
      renderedContentDigest: digest(rendered),
    });
    coreBody += `META-FRAMEWORK-FACET ${id} ${facet.ownerTopic}\n${rendered}`;
  }
  if (bytes(coreBody) > PROMPT_LIMITS.promptBodyBytes) fail('OUTPUT_LIMIT', 'the requested prompt exceeds its limit');
  const extensionCatalog = resolvedExtensionData(resolvedExtensions);
  const allExtensionFacets = extensionCatalog.extensions.flatMap(({ facets: extensionFacetInventory }) =>
    extensionFacetInventory);
  const extensionFacets = allExtensionFacets.filter(({ profiles }) => profiles.includes(profileId));
  if (extensionFacets.length > EXTENSION_LIMITS.selectedFacetsPerProfile) {
    fail('OUTPUT_LIMIT', 'the requested prompt exceeds its extension facet limit');
  }
  let extensionBody = '';
  for (const facet of extensionFacets) {
    const contentDigest = digest(facet.content);
    facets.push({
      id: facet.id,
      topic: facet.topic,
      path: facet.path,
      rawSourceDigest: contentDigest,
      renderedContentDigest: contentDigest,
    });
    extensionBody += `META-FRAMEWORK-FACET ${facet.id} ${facet.topic}\n${facet.content}`;
  }
  if (bytes(extensionBody) > EXTENSION_LIMITS.extensionBodyBytes ||
      bytes(coreBody) + bytes(extensionBody) > EXTENSION_LIMITS.combinedBodyBytes) {
    fail('OUTPUT_LIMIT', 'the requested prompt exceeds its extension body limit');
  }
  const body = `${coreBody}${extensionBody}`;
  const manifestWithoutDigest = {
    envelopeVersion: 1,
    promptFormatVersion: 1,
    registrySchemaVersion: 1,
    package: runtime.identity,
    compilerVersion: PROMPT_COMPILER_COMPATIBILITY.version,
    profile: profileId,
    harness: harnessId,
    facets,
    extensions: extensionCatalog.extensions.map(extensionProvenance),
  };
  const preimageManifest = canonicalJson(manifestWithoutDigest);
  const promptDigest = digest(`${preimageManifest}\n${body}`);
  const manifest = canonicalJson({ ...manifestWithoutDigest, digest: promptDigest });
  const extensionEnabled = extensionCatalog.extensions.length > 0;
  const manifestLimit = extensionEnabled ? EXTENSION_LIMITS.promptManifestBytes : PROMPT_LIMITS.promptManifestBytes;
  if (bytes(manifest) > manifestLimit) {
    fail('OUTPUT_LIMIT', 'the requested prompt exceeds its limit');
  }
  const output = `${PROMPT_ENVELOPE_MARKER}\n${manifest}\n${body}`;
  const promptLimit = extensionEnabled ? EXTENSION_LIMITS.promptBytes : PROMPT_LIMITS.promptBytes;
  if (bytes(output) > promptLimit) fail('OUTPUT_LIMIT', 'the requested prompt exceeds its limit');
  return output;
}

function contentEnvelope(packageRuntime, metadata, content, limit) {
  const output = `${CONTENT_ENVELOPE_MARKER}\n${canonicalJson({
    contentEnvelopeVersion: 1,
    package: unwrapPackageRuntime(packageRuntime).identity,
    ...metadata,
    contentDigest: digest(content),
  })}\n${content}`;
  if (bytes(output) > limit) fail('OUTPUT_LIMIT', 'the requested content exceeds its limit');
  return output;
}

export function retrieveDocument(packageRuntime, topic) {
  if (!validId(topic)) fail('ARGUMENT_INVALID', 'the document identifier is malformed', 2);
  const catalog = loadPromptCatalog(packageRuntime);
  const document = catalog.documentById.get(topic);
  if (document === undefined) fail('IDENTIFIER_UNKNOWN', 'the requested document is unavailable');
  return contentEnvelope(packageRuntime, { kind: 'document', id: topic, path: document.path },
    sourceLookup(catalog.sources, topic), PROMPT_LIMITS.documentOutputBytes);
}

export function explainFacet(packageRuntime, facetId, resolvedExtensions = null) {
  if (!validFacetId(facetId)) fail('ARGUMENT_INVALID', 'the facet identifier is malformed', 2);
  const catalog = loadPromptCatalog(packageRuntime);
  const facet = catalog.facetById.get(facetId);
  if (facet === undefined) {
    const extensionCatalog = resolvedExtensionData(resolvedExtensions);
    const extensionFacet = extensionCatalog.extensions
      .flatMap(({ facets: extensionFacetInventory }) => extensionFacetInventory)
      .find(({ id }) => id === facetId);
    if (extensionFacet === undefined) fail('IDENTIFIER_UNKNOWN', 'the requested facet is unavailable');
    const extension = extensionCatalog.extensions.find(({ namespace }) =>
      extensionFacet.topic === `extension.${namespace}`);
    return contentEnvelope(packageRuntime, {
      kind: 'facet',
      id: extensionFacet.id,
      topic: extensionFacet.topic,
      path: extensionFacet.path,
      templateVariables: [],
      extension: extensionProvenance(extension),
    }, extensionFacet.content, PROMPT_LIMITS.explainOutputBytes);
  }
  const document = catalog.documentById.get(facet.ownerTopic);
  return contentEnvelope(packageRuntime, {
    kind: 'facet',
    id: facetId,
    topic: facet.ownerTopic,
    path: document.path,
    templateVariables: [...facet.templateVariables],
  }, catalog.payloadById.get(facetId), PROMPT_LIMITS.explainOutputBytes);
}
