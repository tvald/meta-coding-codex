# Codex Quota Monitor Skill

## Goal

Add an optional repo-scoped Codex skill that obtains authoritative quota telemetry from
Codex App Server without adding a runtime dependency to the portable framework core.

## Background

Decision 0006 defined a portable capacity guard but not a Codex telemetry mechanism.
Evaluation against the installed client and current official documentation established
that `account/rateLimits/read` and `account/rateLimits/updated` provide the required
usage percentages, window durations, and reset times over App Server JSONL.

## Scope

In scope:

- A generated `.agents/skills/codex-quota-monitor/` skill with UI metadata.
- Direct use of the installed `codex app-server` process and existing shell-session
  controls; no bundled executable helper.
- Correct handling of five-hour and weekly windows, multi-bucket responses, valid absent
  windows, telemetry failures, reset times, and connection cleanup.
- Canonical framework, package, decision, risk, quality, learning, and state records.

Out of scope:

- A daemon, hook, MCP server, plugin, Node/Python helper, credential-file access, or
  provider-private HTTP endpoint.
- Hard enforcement outside Root-Orchestrator behavior or changes to provider quotas.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Orchestrator on Codex | Plan, spawn, monitor, or resume child workers | Load the skill and obtain fresh App Server rate-limit telemetry |
| Child worker | Run under the capacity guard | Be suspended or resumed using authoritative current windows |
| Framework adopter | Package Codex integration | Optionally copy one dependency-free repo skill with existing adapters |

## Acceptance Criteria

- [x] Codex discovers a valid `codex-quota-monitor` repo skill and matching UI metadata.
- [x] The skill initializes one persistent App Server JSONL connection and reads
      `account/rateLimits/read` without inspecting credentials.
- [x] It evaluates returned 300-minute and 10,080-minute windows, treats valid absent
      windows as not advertised, and treats RPC/auth/malformed responses as unknown.
- [x] It uses update notifications and reset times without weakening Decision 0006's
      95% cutoff, cadence, checkpoint, or fresh-read resume rules.
- [x] The portable core remains Markdown-only and the optional integration adds no
      runtime, package, hook, MCP, or daemon dependency.
- [x] Skill validation, installed-client discovery, live read, forward test, links,
      budgets, consistency, and diff checks pass.

## Constraints

- `readme/meta/agent-definitions.md` remains the capacity-policy owner; the skill owns
  only Codex telemetry procedure.
- Repo skills live under `.agents/skills`, per current Codex documentation.
- The skill must remain concise and contain no auxiliary README or unused directories.

## Workflow Route

- Route: Initiative
- Why this route: The change spans a new Codex capability surface, package boundaries,
  authentication-adjacent behavior, recovery policy, and durable framework records.
- Risk gate: High
- Upstream artifacts required: Decision 0006, agent definitions, package contract,
  skill-creator rules, and official App Server/skills documentation.
- Escalation trigger: Reliable telemetry requires credential access, undocumented HTTP,
  expanded permissions, or executable runtime code in the portable core.
- Next action after this task: Exercise the skill during the next eligible delegated
  task and review after a telemetry, discovery, or suspension failure.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| App Server protocol is copied incorrectly | Delegation pauses or uses stale data | Validate against installed client and current official docs |
| Valid `secondary: null` is treated as failure | All delegation stops unnecessarily | Distinguish successful absence from RPC or malformed telemetry |
| A nested process leaks credentials or persists | Security and maintenance burden | Use existing Codex auth, never read files, keep one task-scoped process, close it |
| Skill becomes a competing policy owner | Threshold and recovery rules drift | Link Decision 0006 and keep only Codex-specific procedure in the skill |
| Optional integration becomes a core dependency | Portability regresses | Keep it removable and outside `readme/meta/` |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Current Codex exposes documented App Server rate-limit RPC | High | Official docs and installed `codex-cli 0.144.1` live read |
| Model-side parsing of small JSON responses is reliable enough initially | Medium | Forward-test the generated skill; add a helper only after observed failure |

## Verification Plan

- Automated checks: Skill initializer and validator, YAML parsing, frontmatter/interface
  assertions, local links/anchors, line budgets, package inventory, Markdown-only core,
  forbidden-dependency scan, and Git whitespace/diff checks.
- Manual checks: Installed-client discovery, live initialized RPC read, five-hour,
  weekly, multi-bucket, valid-null, failed-read, reset, notification, and cleanup paths.
- Documentation checks: Skill, Decision 0007, Decision 0006 amendment, canonical policy,
  package guidance, quality/threat records, changelog, retrospective, and cursor agree.
- Baseline or counterfactual evidence for new regression/behavior tests: The current
  repository has no `.agents/skills` integration, and Decision 0006 cannot name a Codex
  telemetry surface.
- Amendments after implementation starts, with reason and impact: None.

## Done When

- All acceptance criteria and required checks pass, durable records are consistent, and
  the task-owned changes are committed locally.
