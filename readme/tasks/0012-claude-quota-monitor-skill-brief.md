# Claude Quota Monitor Skill

## Goal

Add an optional Claude Code skill that obtains authoritative usage telemetry from the
authenticated OAuth usage surface without letting credential material enter the agent
conversation, and ship it through the existing core installer.

## Background

Decision 0006 defined the capacity guard and Decision 0007 gave Codex a telemetry
procedure, but Claude Code had none. A live evaluation confirmed the Codex App Server path
still works and that Claude Code's `/usage` display is unreadable by an autonomous session,
so automated monitoring must read `https://api.anthropic.com/api/oauth/usage`. The surface
returns a `limits[]` array plus flat and model-scoped windows; a naive flat-key reader
silently drops model-scoped weekly windows.

## Scope

In scope:

- A `.claude/skills/claude-quota-monitor/SKILL.md` skill with a `limits[]`-first reader.
- A credential-scoped `node` subprocess that emits only normalized window fields.
- Guard pointer, packaging of `.claude/skills/**`, and CI inventory alignment.
- Canonical decision, threat, quality, learning, and state records.

Out of scope:

- A monthly-window or tiered-cutoff change to the capacity guard (deferred).
- A bundled helper script, token refresh, or any surfacing of credentials or billing data.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Orchestrator on Claude Code | Plan, spawn, monitor, or resume child workers | Run the skill and obtain fresh usage telemetry |
| Child worker | Run under the capacity guard | Be suspended or resumed using authoritative current windows |
| Framework adopter | Install the core into a Claude Code repo | Receive the skill additively without overwriting a same-name skill |

## Acceptance Criteria

- [x] Credential material never reaches stdout, stderr, a file, a command line, or a URL.
- [x] The reader parses `limits[]` first and preserves model-scoped windows, falling back
      to flat keys only when `limits[]` is absent.
- [x] Failures, expiry, and empty window sets classify as unknown capacity with generic
      reasons; the reader never refreshes the token.
- [x] The skill ships through the additive installer with packer, installer, and CI
      inventories in agreement and same-name skills preserved.
- [x] `readme/meta/agent-definitions.md` remains the sole capacity-policy owner.
- [x] Decision, threat, quality, changelog, catalog, and cursor records agree.

## Constraints

- Claude Code skills live under `.claude/skills`.
- The core stays Markdown-only; the packager admits only Markdown and YAML skill files.
- The skill owns only Claude telemetry procedure, not threshold or recovery policy.

## Workflow Route

- Route: Initiative
- Why this route: The change adds a new provider telemetry surface, the framework's first
  credential-reading integration, packaging changes, and durable records.
- Risk gate: High
- Upstream artifacts required: Decisions 0006 and 0007, the capacity guard, the installer
  scripts, and a live usage reading.
- Escalation trigger: Reliable telemetry requires bundled code, token refresh, or
  surfacing credential or billing data.
- Next action after this task: Exercise the skill on the next eligible delegated task and
  review after a telemetry, discovery, or schema failure.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Credential material leaks to the conversation | Account compromise | Read inside the subprocess; emit only generic reasons and normalized windows |
| Model-scoped window is dropped | Quota exhausts before integration | Parse `limits[]` first and preserve scoped windows |
| A divergent reader copy reintroduces a leak | Credential fragment exposure | Keep one canonical procedure; harden or delete copies |
| Endpoint schema changes | Delegation pauses or misreads | Degrade to unknown capacity, not unsafe capacity |
| Optional skill weakens installer invariants | Portability or safety regresses | Reuse exact-inventory, symlink, and non-overwrite guards |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| `oauth/usage` exposes documented windows with the beta header | High | Live read on this host |
| Node is available in Claude Code environments | High | Node is the Claude Code runtime; live read used `node` |

## Verification Plan

- Automated checks: `shellcheck`, `node --check`, packer/installer/CI inventory match,
  reproducibility, and installer end-to-end offline runs.
- Manual checks: Live read, token-absence scan, malformed-credential no-leak test, and
  preserve-existing-skill test.
- Documentation checks: Skill, Decision 0014, guard pointer, threat, quality, changelog,
  catalog, and cursor agree.
- Baseline or counterfactual evidence: The repository had no Claude telemetry surface and
  no `.claude/skills` packaged tree.
- Amendments after implementation starts, with reason and impact: None.

## Done When

- All acceptance criteria and required checks pass, durable records are consistent, and
  the task-owned changes are committed locally.
