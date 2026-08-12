export const HOOK_ADAPTER_SCHEMA_VERSION = 1;

export const HOOK_ADAPTER_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  envelopeVersions: Object.freeze([HOOK_ADAPTER_SCHEMA_VERSION]),
  hookEventSchemaVersions: Object.freeze([1]),
  integrationConfigVersions: Object.freeze([1]),
  harnesses: Object.freeze(['codex']),
  profiles: Object.freeze(['implementer', 'qa', 'reviewer', 'root', 'security']),
  testedCodexVersions: Object.freeze(['0.147.0']),
});

export const HOOK_ADAPTER_LIMITS = Object.freeze({
  inputBytes: 32_768,
  failureBytes: 1_024,
});
