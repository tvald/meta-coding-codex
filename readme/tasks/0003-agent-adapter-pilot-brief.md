# Agent Adapter Pilot

## Goal

Add an optional, thin Codex and Claude Code agent-adapter pilot that makes the
framework's highest-value independent review roles discoverable without moving process
authority out of `readme/meta/`.

## Background

The framework defines portable agent roles and delegation rules, but it does not expose
those roles through Codex or Claude Code's native agent-definition locations. Claude
Code also reads `CLAUDE.md`, not `AGENTS.md`, so the current package entrypoint is not
automatically available in a default Claude Code session.

## Scope

In scope:

- A root `CLAUDE.md` bridge to the canonical `AGENTS.md` entrypoint.
- Thin project-scoped Reviewer, Verifier, and Security Reviewer definitions for Codex
  and Claude Code.
- An optional vendor-adapter contract that preserves the Markdown-only portable core.
- Package, decision, pilot, threat, quality, and project-state records.

Out of scope:

- A one-to-one adapter for every framework role.
- A custom Root Orchestrator, model pins, MCP servers, hooks, global configuration, or
  expanded permissions.
- Runtime code, generators, dependencies, releases, or published packages.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework adopter using Claude Code | Start a repository session | Claude loads the shared `AGENTS.md` entrypoint through `CLAUDE.md` |
| Root Orchestrator | Delegate an independent quality gate | Select a named, narrowly scoped adapter that reads the canonical role |
| Reviewer, Verifier, or Security Reviewer | Perform a bounded assignment | Return evidence and handoff data without taking integration ownership |

## Acceptance Criteria

- [x] Claude Code has a non-duplicative root bridge to `AGENTS.md`.
- [x] Both harnesses expose aligned Reviewer, Verifier, and Security Reviewer agents.
- [x] Adapters link to canonical framework owners rather than copying full processes.
- [x] Reviewer and Security Reviewer declare read-only defaults and no-write
      instructions; Verifier cannot use direct editing tools and must report any
      command-created changes.
- [x] No adapter pins a model, adds MCP, enables nested delegation, or widens parent
      approval authority.
- [x] Package and framework policy describe the adapters as optional and removable.
- [x] The pilot has observable promotion and sunset criteria.
- [x] Syntax, local links, package structure, instruction boundaries, and client
      discovery are validated where the installed clients expose a safe check.

## Constraints

- `readme/meta/agent-definitions.md` remains the semantic owner for roles.
- `AGENTS.md` remains the cross-harness startup owner.
- Vendor-native configuration is allowed only as an optional declarative adapter layer;
  the core remains Markdown-only and runtime-independent.
- Existing destination-project instruction and agent files must be merged, never
  overwritten by packaging guidance.

## Workflow Route

- Route: Initiative
- Why this route: The change crosses startup discovery, packaging, role policy, two
  vendor formats, security review, and durable framework records.
- Risk gate: High
- Upstream artifacts required: `AGENTS.md`, the meta entrypoint, agent definitions,
  package decision, framework-improvement policy, and current official vendor schemas.
- Escalation trigger: A client requires executable glue, broader permissions, global
  configuration, or duplicated process text to discover the adapters.
- Next action after this task: Exercise the pilot on eligible non-trivial tasks and
  review it at the documented trigger.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Vendor files become competing policy owners | Role behavior drifts across harnesses | Keep adapters thin and link canonical Markdown owners |
| Automatic delegation adds cost or ceremony | Small tasks fan out unnecessarily | Use narrow trigger descriptions and preserve the single-agent default |
| Verification commands modify the worktree | User or concurrent work is disturbed | Remove direct edit tools; require before/after status and artifact reporting |
| Vendor schema changes | Agents are silently ignored or misconfigured | Use minimal stable fields, validate locally, and give the pilot a review trigger |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Installed Codex supports project `.codex/agents/*.toml` files | High | Current official Codex subagent documentation and installed CLI checks |
| Installed Claude Code supports project `.claude/agents/*.md` files and `CLAUDE.md` imports | High | Current official Claude Code documentation and installed CLI checks |
| Three independent quality roles provide enough pilot coverage | Medium | Review after five eligible tasks or the time trigger |

## Verification Plan

- Automated checks: TOML and YAML-frontmatter parsing, Markdown link and anchor checks,
  whitespace/diff checks, budgets, stale-reference scans, and package inventory checks.
- Manual checks: Adapter-to-role mapping, least-privilege review, startup scenarios,
  single-writer boundaries, pilot terms, and installed-client discovery where safe.
- Documentation checks: Package boundary, meta index, decision, changelog,
  retrospective, threat model, quality record, and project cursor agree.
- Baseline or counterfactual evidence for new regression/behavior tests: Before this
  change the repository has no `CLAUDE.md`, `.claude/agents/`, or `.codex/agents/`, and
  the accepted package contract includes only meta Markdown plus `AGENTS.md` guidance.
- Amendments after implementation starts, with reason and impact: None.

## Done When

- All acceptance criteria and required checks pass, durable records are consistent, the
  task-owned changes are committed locally, and the pilot has an executable next review
  trigger.
