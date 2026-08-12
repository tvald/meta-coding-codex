# Task Brief

Create this only when the structured task record is insufficient for selection,
acceptance, routing, or review. The task store remains the owner of status, dependencies,
gates, next action, and result.

## Identity And Source

- Task ID: T-0033
- Initial revision: r1
- Task store: `readme/tasks/store/` through
  `npm run --ignore-scripts --silent meta -- tasks task get T-0033`
- Accepted source: User instruction
- Source reference and date: User-requested task capture of the Codex hook/custom-agent
  feasibility evaluation, 2026-08-12
- Parent or split task IDs: None

## Goal

Make repository-pinned framework prompts load automatically as developer context for
Codex root and delegated sessions, using lifecycle hooks and collision-resistant,
`meta_`-prefixed project-scoped custom-agent names, while preserving immutable package
ownership, explicit role boundaries, collision safety, and a minimal portable fallback
when hooks are unavailable.

## Background

The current installed-client bootstrap asks the model to read `AGENTS.md`, invoke
`agent-prompt`, and follow its output. Codex supports synchronous `SessionStart` and
`SubagentStart` command hooks whose output can become developer context. Codex also
supports project-scoped custom agents identified by exact `name` values. Together these
surfaces can remove model initiative from the normal prompt-loading path.

The framework already has source-checkout Codex adapters named `reviewer`, `verifier`,
and `security-reviewer`, but only `reviewer` matches a compiled framework profile. There
is no `implementer` adapter, and current policy excludes `.codex/agents/` and hooks from
installed clients. The installed-client footprint and collision behavior therefore need
an explicit architecture revision rather than an incidental file copy.

Primary Codex references:

- `https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app#app-custom-agents`
- `https://learn.chatgpt.com/docs/hooks`
- `https://learn.chatgpt.com/docs/agent-configuration/agents-md`

## Scope

In scope:

- Define exact Codex custom-agent identities `meta_implementer`, `meta_reviewer`,
  `meta_qa`, and `meta_security`, mapped one-to-one to the compiled framework profiles
  `implementer`, `reviewer`, `qa`, and `security` without renaming the portable profile
  contract.
- Add a repository-pinned, package-owned harness hook command,
  `npm run --ignore-scripts --silent meta -- hook --harness codex --profile PROFILE`,
  that validates hook
  input and injects the compiled `root` profile for root sessions and the exact named
  profile for delegated sessions. Reserve the command family for parallel harness
  adapters without implementing unsupported adapters speculatively.
- Cover root startup, resume, clear, and compaction, plus delegated-agent start.
- Keep custom-agent manifests thin: exact identity, bounded selection description,
  least-privilege session configuration, and a static missing/mismatched-envelope guard.
- Decide and implement collision-safe delivery, trust-review, update, and rollback of
  project-scoped Codex configuration without weakening immutable package delivery.
- Retain a minimal `AGENTS.md` compatibility fallback for disabled, untrusted,
  unreviewed, unsupported, or administratively restricted hooks.
- Update canonical framework policy, decisions, threat model, tests, client initialization
  behavior, package audits, and changelog as required by the accepted architecture.

Out of scope:

- Changing Claude prompt loading except where shared policy wording must remain accurate.
- Implementing hook adapters for non-Codex harnesses as part of this task.
- Embedding compiled framework policy in custom-agent `developer_instructions` or a
  generated `model_instructions_file`.
- Injecting mutable task records, user prompts, repository documents, or startup-query
  results as developer instructions.
- Adding model pins, reasoning-effort policy, MCP servers, skills, permissions, or other
  capabilities without a separately justified and accepted requirement.
- Treating hook or custom-agent configuration as a replacement for task-store integrity,
  authorization, approval, or semantic completion checks.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Codex session | Start, resume, clear, or continue after compaction | Receives the current compiled `root` prompt before model work without first calling the CLI |
| Root Orchestrator | Spawn a bounded framework specialist | Selects an exact custom agent named `meta_implementer`, `meta_reviewer`, `meta_qa`, or `meta_security` |
| Delegated Codex agent | Begin its assigned work | Receives only the compiled profile matching its exact custom-agent identity |
| Client maintainer | Initialize or upgrade the framework | Gets an explicit, collision-safe Codex integration disposition with no silent merge or overwrite |
| Operator in an unsupported or untrusted configuration | Start Codex without runnable project hooks | Receives the minimal `AGENTS.md` fallback and a clear stop condition if loading fails |

## Acceptance Criteria

- [x] Codex exposes exactly four framework custom agents named `meta_implementer`,
  `meta_reviewer`, `meta_qa`, and `meta_security`; filenames conventionally match names,
  and unknown, built-in, or unprefixed agent types never inherit `root` or another
  framework profile.
- [x] Each custom-agent manifest contains the required `name`, `description`, and
  `developer_instructions`, uses role-appropriate least privilege, and contains no copy
  of compiled semantic policy. Reviewer and security default to read-only. QA permits
  declared checks and their normal artifacts without source-edit authority.
- [x] Nested delegation controls are verified against the supported Codex release.
  Every standalone manifest sets `[agents] enabled = false` and carries an explicit
  no-recursive-delegation rule. Live Codex 0.147.0 evidence confirms the exact custom
  child has no `spawn_agent` tool.
- [x] A synchronous `SessionStart` hook injects the current package-compiled Codex
  `root` prompt for `startup`, `resume`, `clear`, and `compact` before the corresponding
  model request.
- [x] The project hook file owns four exact synchronous `SubagentStart` matchers, one for
  each `meta_` `agent_type`, with a fixed unprefixed compiled profile argument. The
  adapter independently validates the event/profile pairing; unknown, built-in,
  unprefixed, or mismatched events fail closed. End-to-end Codex 0.147.0 evidence proves
  exact custom-agent selection and profile injection.
- [x] Hook input is parsed as bounded data by package-owned code. No hook field is
  interpolated into a shell command, used as a path, or allowed to select an undeclared
  profile or harness.
- [x] The public CLI entrypoint is
  `meta hook --harness HARNESS --profile PROFILE`, consistent with the
  existing `agent-prompt`, `quota`, and `capability` harness-selection convention. This
  task implements `--harness codex`; missing, duplicate, unknown, or currently
  unsupported harness selections fail closed with bounded output.
- [x] Automatic hook execution invokes only the fixed repository-pinned source or
  installed-package binary path resolved below a quoted physical Git root, including
  when Codex starts in a repository subdirectory or the root contains spaces and shell
  metacharacters. It bypasses mutable client scripts and lifecycle hooks and has no
  global framework binary, `npx`, network-fetch, package-patching, or arbitrary-path
  fallback.
- [x] Successful hook output preserves the complete attributable prompt envelope and
  body as developer context. The integration explicitly avoids Codex's default large-
  output spill/preview behavior, including prompts at the framework's maximum permitted
  size, and does not require the model to open a spilled file.
- [x] Root hook compilation or validation failure stops the turn with bounded actionable
  feedback. Delegated startup accounts for Codex's documented inability to stop a
  subagent with `SubagentStart continue: false`; a tested static envelope/profile guard
  or stronger mechanical control prevents tool-using work under a missing or mismatched
  delegated prompt.
- [x] The minimal Codex `AGENTS.md` bootstrap recognizes a matching injected prompt and
  does not duplicate-load it. If injection is absent, it uses the existing pinned CLI
  fallback and stops on failure.
- [x] Client installation and upgrade preflight distinguish absent, exact-current,
  stale-framework-owned, client-owned, malformed, partial, linked, and colliding Codex
  integration surfaces. No existing `.codex/config.toml`, hooks, agent definitions, or
  unrelated client configuration is overwritten or silently merged.
- [x] Trusted-project review, disabled hooks, unreviewed or changed hook hashes,
  `allow_managed_hooks_only`, and unsupported Codex versions have explicit behaviors,
  diagnostics, fallback paths, and rollback instructions.
- [x] Package replacement cannot leave stale generated prompts or silently bind old
  custom-agent/hook behavior to a new compiler contract. Source and packed-installed
  outputs remain deterministic and attributable.
- [x] Task-store `doctor` and `startup` remain ordinary bounded tool operations after
  profile load; their mutable output is not elevated to developer instructions.
- [x] Canonical documentation, accepted architecture decision, threat model, package
  inventory/compatibility metadata, client initialization contract, and framework
  changelog describe the shipped behavior without creating a second semantic policy
  owner.
- [x] Required automated, integration, package, documentation, and independent security/
  review gates pass before the task is closed Done.

## Constraints

- Preserve the immutable npm package and exact alias/lock/entrypoint trust boundary.
- Keep the package compiler and canonical facet owners as the sole semantic prompt
  source; hook and custom-agent files are Codex mechanics only.
- Treat project-scoped hooks and agents as executable/instruction trust-boundary changes.
- Preserve exact profile selection and least authority. The `meta_` prefix is a Codex
  adapter namespace, not part of portable profile identity. A delegated worker must
  never infer a role, inherit `root`, or broaden the parent session's authority.
- Preserve unrelated client-owned `.codex` configuration and existing repository work.
- Use Adopt, Revise, or Reject for every framework design disposition; never Pilot.

## Workflow Route Rationale

- Recorded route and risk: Initiative, High.
- Why this route: The change spans prompt compilation, Codex lifecycle behavior, custom
  agents, client initialization/update, compatibility, security controls, tests, and
  durable framework policy.
- Why this risk gate: Developer-context injection and delegated-profile selection can
  alter tool behavior and authority. Hook execution also adds a project executable and
  creates new trust, collision, upgrade, and failure boundaries.
- Upstream artifacts required: Decision 0021, the prompt/compiler and initializer
  contracts, Codex hook and custom-agent documentation, agent definitions, automation
  policy, quality system, and current threat models.
- Escalation trigger: Stop for an owner decision if collision-safe client delivery cannot
  coexist with immutable replacement, if exact custom-agent identity is not observable
  in `SubagentStart`, or if delegated startup cannot credibly prevent work after profile
  injection failure.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Wrong event selects a privileged profile | Delegated worker receives incorrect authority | Exact four-name `meta_` namespace, one project matcher and one fixed profile per name, runtime event/profile validation, negative tests, and no default to `root` |
| Common custom-agent name collides with client or third-party definitions | Framework adapter shadows or is shadowed by unrelated behavior | Reserve the `meta_` prefix for framework Codex adapters and refuse same-name collisions |
| Hook command hard-codes Codex into the command hierarchy | A later harness requires a parallel one-off CLI or a breaking rename | Use the shared `hook --harness HARNESS` command family and keep Codex behavior behind its adapter |
| Hook is skipped because the project or definition is untrusted | Session begins without framework policy | Minimal `AGENTS.md` fallback, explicit diagnostics, trust-state tests |
| Prompt exceeds hook context threshold and spills | Model sees only a preview and must read a file | Explicit full-context limit plus maximum-size integration test |
| Compiler or package command fails during delegated startup | Subagent may still begin because Codex cannot stop it through `SubagentStart` | Thin static manifest guard and, if needed, mechanical pre-tool enforcement |
| Generated Codex files collide with client configuration | Client policy is overwritten or framework behavior is partially installed | Read-only preflight, exact provenance, preserve-first refusal, explicit reconciliation |
| Package upgrade leaves stale integration mechanics | Prompt semantics and hook dispatch diverge | Versioned compatibility, exact ownership evidence, replacement/update tests |
| Custom-agent settings accidentally widen permissions | Specialist gains implementation or external-action capability | Least-privilege manifests, parent-override analysis, security review, capability tests |
| Hook output elevates mutable or untrusted repository data | Prompt injection changes agent authority | Compile package-owned declared facets only; exclude task/user/repository content |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| A selected project custom agent reports its exact `meta_` identity to the project `SubagentStart` matcher | High | End-to-end envelope capture for exact custom agents on Codex 0.147.0 plus mismatch rejection fixtures |
| `additionalContextLimit = 0` delivers the complete bounded prompt without spill | High | Maximum-size root and extension prompt integration fixtures |
| A standalone custom-agent `[agents] enabled = false` removes recursive delegation | High | Strict-config Codex 0.147.0 probe loaded the exact agent and confirmed `spawn_agent` was absent |
| A minimal bootstrap can distinguish already-injected prompt context without duplicate loading | Medium | Fresh, resume, compact, hook-disabled, and hook-failure prompt-input tests |

## Verification Plan

- Automated checks: prompt compiler and extension suites; `hook --harness codex --profile PROFILE` input/
  output schema and mutation tests; missing, duplicate, unknown, and unsupported harness
  rejection; exact profile dispatch and unknown-agent rejection; initializer collision/
  interruption/update/rollback matrices; package inventory and packed-client
  equivalence; framework doctor.
- Manual checks: Codex app/CLI startup, resume, clear, compaction, and each custom-agent
  spawn; `/hooks` trust review and hash-change behavior; disabled and managed-only hooks;
  inspect model-visible prompt input for full envelope/profile correctness.
- Documentation checks: local link validation, budgets, command examples, decision and
  threat-model consistency, and client/source boundary review.
- Baseline or counterfactual evidence for new regression/behavior tests: demonstrate that
  the current bootstrap requires a model tool call and that current `reviewer`,
  `verifier`, and `security-reviewer` names do not provide the desired collision-resistant
  `meta_` namespace; prove new tests fail when exact matcher/profile binding, nested-agent
  disablement, spill prevention, collision refusal, or fallback guards are removed.

## Material Amendments

Record amendments after intake with their authority and acceptance impact. Minor
wording corrections need no row.

| Revision | Date | Source | Change | Reason | Scope Or Acceptance Impact |
| --- | --- | --- | --- | --- | --- |
| r2 | 2026-08-12 | User steer | Prefix Codex custom-agent names with `meta-` and map them to the existing unprefixed framework profiles | Avoid collisions with common client or third-party agent names | Changes custom-agent identity, dispatch, collision checks, and related verification; portable profile IDs remain unchanged |
| r3 | 2026-08-12 | User steer | Standardize the package hook entrypoint as `meta hook --harness codex` | Preserve the existing CLI harness-selection convention and leave a parallel extension point for future harnesses | Adds a harness-dispatched hook command contract and negative harness-selection tests; no non-Codex adapter enters scope |
| r4 | 2026-08-12 | Initial in-scope Codex compatibility probe | Use provider-valid `meta_` names and initially bind fixed profile arguments to custom manifests | Codex 0.144.1 rejected hyphens and did not expose exact custom `agent_type` selection through its spawn tool | Changes names and initial dispatch design; later 0.147.0 evidence supersedes the dispatch conclusions |
| r5 | 2026-08-12 | User instruction to proceed with T-0033 | Implement the accepted hook/custom-agent design and required High-risk gates | The evaluation and task framing were accepted for implementation | Activates implementation without changing the user outcome |
| r6 | 2026-08-12 | Accepted live Codex 0.144.1/0.147.0 compatibility correction | Set Codex 0.147.0 as the tested baseline; dispatch delegated prompts through project-level exact `agent_type` matchers; disable nested agents in every custom layer | Codex 0.144.1 does not expose custom `agent_type` selection, while 0.147.0 exposes exact names, runs trusted project `SubagentStart` matchers, and accepts per-agent `[agents] enabled = false` | Supersedes the r4 per-manifest-hook inference and model-only delegation limitation; preserves the four names, portable profiles, CLI, and outcome |

## Done When

- The accepted collision-safe Codex integration automatically injects the correct full
  package-owned profile for root and exact `meta_`-prefixed delegated agents, preserves
  a working fallback for unavailable hooks, prevents ambiguous or broadened authority,
  ships through immutable package replacement, and passes every required High-risk gate.
