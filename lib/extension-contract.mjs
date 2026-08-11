export const EXTENSION_COMPATIBILITY = Object.freeze({
  extensionManifestVersions: Object.freeze([1]),
  extensionApiVersions: Object.freeze([1]),
});

export const EXTENSION_LIMITS = Object.freeze({
  extensions: 8,
  facetsPerExtension: 8,
  aggregateFacets: 16,
  selectedFacetsPerProfile: 16,
  inventoryEntries: 64,
  inventoryBytes: 128 * 1024,
  packageManifestBytes: 32 * 1024,
  extensionManifestBytes: 32 * 1024,
  facetBytes: 4_096,
  extensionBodyBytes: 8_192,
  combinedBodyBytes: 32_768,
  promptManifestBytes: 24_576,
  promptBytes: 65_536,
});

export const EXTENSION_MANIFEST_PATH = 'meta-framework.extension.json';

export const RESERVED_EXTENSION_NAMESPACES = Object.freeze([
  'core',
  'extension',
  'framework',
  'harness',
  'meta',
  'meta-framework',
  'system',
]);
