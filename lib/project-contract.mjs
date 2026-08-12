export const PROJECT_INIT_COMPATIBILITY = Object.freeze({
  version: '1.1.0',
  envelopeVersions: Object.freeze([1]),
  bootstrapVersions: Object.freeze([1]),
  stateTemplateVersions: Object.freeze([1]),
  optionalHarnesses: Object.freeze(['codex']),
  codexIntegrationConfigVersions: Object.freeze([1]),
});

export const PROJECT_INIT_LIMITS = Object.freeze({
  envelopeBytes: 8_192,
  errorBytes: 1_024,
  bootstrapBytes: 4_096,
  stateDocumentBytes: 8_192,
  clientInstructionBytes: 32_768,
  stageEntries: 16,
});
