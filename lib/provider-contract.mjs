export const PROVIDER_PROBE_VERSION = '1.0.0';
export const PROVIDER_PROBE_SCHEMA_VERSION = 1;
export const PROVIDER_PROBE_SCHEMA_VERSIONS = Object.freeze([PROVIDER_PROBE_SCHEMA_VERSION]);
export const PROVIDER_HARNESSES = Object.freeze(['claude', 'codex']);
export const PROVIDER_CAPABILITIES = Object.freeze(['delegation']);
export const QUOTA_DISPOSITIONS = Object.freeze([
  'proceed',
  'suspend',
  'unavailable',
  'unsupported',
  'failed',
]);
export const CAPABILITY_DISPOSITIONS = Object.freeze([
  'enabled',
  'disabled',
  'unavailable',
  'unsupported',
  'failed',
]);
export const CAPACITY_CUTOFFS = Object.freeze({
  five_hour: 95,
  weekly: 98,
  monthly: 99,
});

export const PROVIDER_PROBE_COMPATIBILITY = Object.freeze({
  version: PROVIDER_PROBE_VERSION,
  envelopeVersions: PROVIDER_PROBE_SCHEMA_VERSIONS,
  harnesses: PROVIDER_HARNESSES,
  capabilities: PROVIDER_CAPABILITIES,
});
