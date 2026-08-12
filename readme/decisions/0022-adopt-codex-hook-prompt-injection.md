# 0022: Adopt Codex Hook Prompt Injection

Status: Accepted

Date: 2026-08-12

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md) only where it excludes
  project-scoped provider agent and hook files from installed clients and requires the
  argument-free project initializer to own every client bootstrap. Immutable package
  ownership, exact local invocation, the portable five-path initializer, prompt/facet
  ownership, and preserve-first client writes remain current.
- [Decisions 0005](0005-pilot-optional-agent-adapters.md) and
  [0016](0016-adopt-adapters-and-skip-pilot-disposition.md) only for the old Codex agent
  identities and source-only delivery. Least authority, optional delegation, canonical
  role ownership, and the no-Pilot repository disposition remain current.

Superseded by:

- None

## Context

The installed Codex bootstrap currently depends on the model reading `AGENTS.md`,
calling `agent-prompt`, and applying its output. Codex supports project `SessionStart`
and `SubagentStart` hooks plus project-scoped custom agents, so the package can place the
same compiled prompt directly in developer context.

Live compatibility probes established a material version boundary. Codex 0.144.1 can
load a named custom-agent manifest but its spawn tool cannot select an exact custom
`agent_type`; apparent delegated-hook success on that version came from inherited root
context and static guard text, not an exact delegated prompt. Codex 0.147.0 exposes
exact custom `agent_type` selection, reports that name to project-level `SubagentStart`
matchers, accepts `[agents] enabled = false` in a standalone custom layer, and preserves
complete hook context with `additionalContextLimit = 0`. A `SubagentStart` hook nested
inside the custom-agent layer did not run, so delegated dispatch belongs in the project
hook file.

## Decision

- Adopt package-owned Codex hook prompt injection. The public runtime is
  `meta hook --harness codex --profile PROFILE`; it accepts only the closed root and
  non-root profile registry, parses one bounded hook event, and emits the deterministic
  compiled prompt without interpolating event data into commands or paths.
- Register one root `SessionStart` hook for `startup`, `resume`, `clear`, and `compact`.
  Register exactly four project custom agents named `meta_implementer`, `meta_reviewer`,
  `meta_qa`, and `meta_security`. In the project hook file, register one exact
  `SubagentStart` matcher per name and bind it to one fixed portable profile command.
  The adapter validates that the event `agent_type` exactly matches the CLI profile.
- Keep manifests mechanical and thin. Required developer instructions verify the
  injected envelope/profile before work, prohibit recursive delegation, and stop on a
  missing or mismatched envelope. Every manifest also sets `[agents] enabled = false` so
  the child lacks multi-agent tools. Manifests do not duplicate semantic role policy.
- Set reviewer and security sandboxes read-only. Keep implementer workspace-write. Give
  QA workspace-write because normal checks can create declared artifacts, while its
  compiled role policy still forbids product-source implementation.
- Extend package compatibility with a versioned Codex hook/integration contract. A
  breaking hook event, manifest, or generated-config change requires compatible package
  treatment rather than an unversioned client patch.
- Preserve the portable argument-free initializer. Add explicit installed-client
  `project preflight --harness codex` and `project init --harness codex` modes for the
  Codex files only. Source maintainers keep the same reviewed files in `.codex/`, outside
  the npm tarball.
- The Codex integration installer creates only absent targets with exact static bytes,
  preserves unrelated `.codex/config.toml` and files, and never silently merges or
  overwrites `hooks.json` or agent definitions. Preflight distinguishes exact, absent,
  partial, stale marked, client-owned, malformed, linked, and colliding surfaces.
- A fully absent or exact-plus-absent framework integration may be installed or
  completed. Existing changed, unsafe, or ambiguous targets refuse before writes.
  Interrupted exact-prefix writes are recoverable by the guarded transaction; rollback
  removes only invocation-proved new identities. Client maintainers reconcile a refused
  collision explicitly and use Git to restore reviewed integration files.
- Keep `AGENTS.md` as a compatibility fallback. It recognizes a matching injected root
  prompt; otherwise it invokes the exact local `agent-prompt` command and stops if the
  command is unavailable or fails. Disabled/untrusted hooks and managed-hook policies
  therefore retain the portable path without lowering authority.
- Treat Codex 0.147.0 as the supported baseline and retain the portable fallback for
  unverified versions. The adapter publishes but cannot detect the running Codex
  version, so version review remains an operator boundary.

## Options Considered

| Option | Benefits | Costs And Risks | Disposition |
| --- | --- | --- | --- |
| Keep model-initiated bootstrap only | No new provider files | Startup remains probabilistic and delegated profile selection is indirect | Rejected |
| Put full policy in agent manifests | No hook runtime | Duplicates semantic owners and drifts on package replacement | Rejected |
| Put `SubagentStart` hooks inside custom-agent layers | Profile command sits beside the agent | Codex 0.147.0 loads the layer but does not run its nested lifecycle hook | Rejected |
| Install Codex files in every portable init | One initializer path | Mutates Claude-only clients and broadens the default footprint | Rejected |
| Project-level exact `agent_type` matchers plus opt-in guarded integration | Exact identities, current compiled prompts, bounded client mutation | Requires Codex 0.147.0 behavior and reviewed executable configuration | Adopted |

## Consequences

Positive:

- Normal Codex startup no longer depends on a model remembering the prompt-loading call.
- Delegated profile selection is bound to a collision-resistant exact manifest identity.
- Package replacement updates semantic prompts atomically while client mechanics remain
  small, reviewable, and compatibility-versioned.

Negative:

- Project trust, hook enablement, and administrator policy can still disable injection.
- Existing `hooks.json` or same-name agents require explicit human reconciliation.
- Provider behavior is version-coupled and the adapter cannot detect the running Codex
  version automatically.

## Compatibility And Rollback

- The supported live baseline is Codex 0.147.0. Changed hook/custom-agent behavior is a
  review trigger, not permission to guess compatibility. The adapter publishes but does
  not automatically detect tested versions; an operator reviews another release or
  disables the integration to retain the portable fallback.
- Automatic source and installed-client hooks invoke their fixed local package
  entrypoints below the quoted physical Git root. They work from repository
  subdirectories, never re-evaluate root path text, never dispatch through mutable
  client npm scripts, and use no global framework binary, `npx`, or network fallback.
- Remove or revert only the reviewed `.codex/hooks.json` and four `meta_*.toml` files to
  disable the integration. The portable `AGENTS.md` fallback remains usable.
- Package rollback restores the prior exact manifest/lock and script-disabled installed
  dependency. If integration compatibility differs, preflight must refuse until the
  corresponding reviewed `.codex` files are restored or reconciled.

## Confidence

Confidence: High for exact profile binding, full-context delivery, nested-agent
disablement, and collision refusal on the tested Linux/Codex 0.147.0 boundary; Medium
for future provider compatibility.

## Review Trigger

Revisit when Codex changes hook event schemas, trust/managed-hook policy, custom-agent
naming or precedence, output context limits, parent override semantics, or the
custom-layer `agents.enabled` behavior.

## Sources

- [T-0033 task brief](../tasks/0033-codex-hook-agent-prompt-injection-brief.md).
- Codex [hooks](https://learn.chatgpt.com/docs/hooks), checked 2026-08-12.
- Codex [custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app#app-custom-agents), checked 2026-08-12.
- Local Codex 0.144.1 and isolated Codex 0.147.0 compatibility probes, 2026-08-12.
