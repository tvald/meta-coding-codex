export const CLIENT_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/node_modules/meta-framework/bin/meta-framework.mjs" hook --harness codex --profile';
export const SOURCE_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/bin/meta-framework.mjs" hook --harness codex --profile';

function agentManifest(profile, name, description, sandboxMode, boundary) {
  return `# meta-framework-codex-agent:v1 profile=${profile}
name = "${name}"
description = "${description}"
sandbox_mode = "${sandboxMode}"
developer_instructions = """
Before task work or tool use, verify that developer context contains \`META-FRAMEWORK-AGENT-PROMPT 1\` followed by a JSON manifest with \`"harness":"codex"\` and \`"profile":"${profile}"\`. If it is missing or mismatched, stop without using tools and report the prompt-loading failure. Do not call \`agent-prompt\` when the matching envelope is present. ${boundary}
"""

[features]
multi_agent = false
`;
}

function commandHook(command, profile) {
  return Object.freeze({
    type: 'command',
    command: `${command} ${profile}`,
    timeout: 30,
    additionalContextLimit: 0,
    statusMessage: `Loading the repository-pinned Meta Framework ${profile === 'qa' ? 'QA' : profile} profile`,
  });
}

function rootHooks(command) {
  return `${JSON.stringify({
    description: 'meta-framework-codex-integration:v1',
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear|compact',
          hooks: [commandHook(command, 'root')],
        },
      ],
      SubagentStart: [
        ['^meta_implementer$', 'implementer'],
        ['^meta_qa$', 'qa'],
        ['^meta_reviewer$', 'reviewer'],
        ['^meta_security$', 'security'],
      ].map(([matcher, profile]) => ({ matcher, hooks: [commandHook(command, profile)] })),
    },
  }, null, 2)}\n`;
}

function integrationFiles(command) {
  return Object.freeze({
    '.codex/hooks.json': rootHooks(command),
    '.codex/agents/meta_implementer.toml': agentManifest(
      'implementer',
      'meta_implementer',
      'Use for one bounded implementation slice explicitly assigned by the Root Orchestrator. Do not use for independent review, security review, or task integration.',
      'workspace-write',
      'Never delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_qa.toml': agentManifest(
      'qa',
      'meta_qa',
      'Use to run predeclared non-destructive verification independently. Normal check artifacts are allowed; do not use for implementation or redefine acceptance.',
      'workspace-write',
      'Do not edit source, tests, configuration, or documentation; normal declared check artifacts are allowed. Never delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_reviewer.toml': agentManifest(
      'reviewer',
      'meta_reviewer',
      'Use for an independent review of a non-trivial completed change when the parent requests or framework policy requires the Reviewer gate. Do not use for implementation.',
      'read-only',
      'Never edit files, implement fixes, delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_security.toml': agentManifest(
      'security',
      'meta_security',
      'Use for an independent security and risk review when trust, permissions, external input, dependencies, or another framework security trigger applies.',
      'read-only',
      'Never edit files, implement mitigations, delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
  });
}

export const CODEX_INTEGRATION_PATHS = Object.freeze([
  '.codex/hooks.json',
  '.codex/agents/meta_implementer.toml',
  '.codex/agents/meta_qa.toml',
  '.codex/agents/meta_reviewer.toml',
  '.codex/agents/meta_security.toml',
]);

export const CODEX_INTEGRATION_FILES = integrationFiles(CLIENT_HOOK_COMMAND);
export const SOURCE_CODEX_INTEGRATION_FILES = integrationFiles(SOURCE_HOOK_COMMAND);

export const CODEX_INTEGRATION_MARKERS = Object.freeze({
  '.codex/hooks.json': 'meta-framework-codex-integration:v1',
  '.codex/agents/meta_implementer.toml': 'meta-framework-codex-agent:v1 profile=implementer',
  '.codex/agents/meta_qa.toml': 'meta-framework-codex-agent:v1 profile=qa',
  '.codex/agents/meta_reviewer.toml': 'meta-framework-codex-agent:v1 profile=reviewer',
  '.codex/agents/meta_security.toml': 'meta-framework-codex-agent:v1 profile=security',
});
