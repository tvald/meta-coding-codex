export const PROMPT_COMPILER_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  envelopeVersions: Object.freeze([1]),
  promptFormatVersions: Object.freeze([1]),
  registrySchemaVersions: Object.freeze([1]),
  profiles: Object.freeze(['implementer', 'qa', 'reviewer', 'root', 'security']),
  harnesses: Object.freeze(['claude', 'codex', 'portable']),
});

export const PROMPT_LIMITS = Object.freeze({
  registryBytes: 128 * 1024,
  documents: 64,
  facets: 64,
  facetBytes: 4_096,
  profileFacets: 32,
  promptBodyBytes: 24_576,
  promptManifestBytes: 8_192,
  promptBytes: 32_768,
  documentSourceBytes: 18_432,
  documentOutputBytes: 20_480,
  explainOutputBytes: 8_192,
});

const SHARED = Object.freeze([
  'agents.shared',
  'authority.boundaries',
  'sources.trust',
  'changes.integrity',
  'quality.completion',
  'handoff.result',
]);

export const PROFILE_REQUIREMENTS = Object.freeze({
  implementer: Object.freeze([...SHARED,
    'roles.implementer',
    'engineering.change',
    'testing.behavior',
    'verification.integrity',
    'security.baseline',
    'documentation.sync',
  ]),
  qa: Object.freeze([...SHARED,
    'roles.qa',
    'verification.matrix',
    'verification.integrity',
    'security.baseline',
  ]),
  reviewer: Object.freeze([...SHARED,
    'roles.reviewer',
    'review.rubric',
    'verification.integrity',
    'security.baseline',
  ]),
  root: Object.freeze([...SHARED,
    'roles.root',
    'tasks.startup',
    'tasks.intake',
    'tasks.selection',
    'workflow.delivery',
    'delegation.control',
    'recovery.resume',
    'knowledge.ownership',
    'engineering.change',
    'testing.behavior',
    'verification.integrity',
    'security.baseline',
    'documentation.sync',
    'changes.commit',
  ]),
  security: Object.freeze([...SHARED,
    'roles.security',
    'security.baseline',
    'security.agentic',
    'threat.model',
    'review.rubric',
  ]),
});

export const HARNESS_CONTRACT = Object.freeze({
  claude: Object.freeze({
    nativeSurface: 'Claude Code agents',
    rootFacets: Object.freeze(['harness.delegation', 'capacity.guard']),
    templateVariables: Object.freeze({ HARNESS: 'claude', NATIVE_SURFACE: 'Claude Code agents' }),
  }),
  codex: Object.freeze({
    nativeSurface: 'Codex subagents',
    rootFacets: Object.freeze(['harness.delegation', 'capacity.guard']),
    templateVariables: Object.freeze({ HARNESS: 'codex', NATIVE_SURFACE: 'Codex subagents' }),
  }),
  portable: Object.freeze({
    nativeSurface: null,
    rootFacets: Object.freeze([]),
    templateVariables: Object.freeze({}),
  }),
});

export const PROMPT_REGISTRY_PATH = 'prompts/registry-v1.json';
export const PROMPT_ENVELOPE_MARKER = 'META-FRAMEWORK-AGENT-PROMPT 1';
export const CONTENT_ENVELOPE_MARKER = 'META-FRAMEWORK-CONTENT 1';
