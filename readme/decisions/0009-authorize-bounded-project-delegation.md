# 0009: Authorize Bounded Project-Local Delegation

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- None

## Context

The imported root `AGENTS.md` now explicitly asks primary sessions in this repository to
use subagents when canonical decomposition finds a concrete independent benefit. This is
a meaningful project authority change: earlier reusable guidance described when
delegation could be useful, while the root instruction now supplies standing permission
to act without requesting case-by-case approval.

Root instructions are also an integration surface for the reusable add-on. Decision
0004 permits destinations to merge the startup instruction, not this repository's
project-specific authority claims. The delegation request therefore needs a durable
local decision and an explicit portability boundary.

## Decision

- Authorize the Root Orchestrator in this repository to delegate bounded in-scope work
  without separate approval when the canonical decomposition rules show an independent
  speed, quality, or focus benefit.
- Keep small, tightly coupled, overlapping, shared-state, or coordination-heavy work in
  the primary agent. Task count and adapter-pilot metrics never justify delegation.
- Apply the usage capacity guard before spawn or resume and while children are active.
  Bind each assignment and returned result to the selected task ID and revision.
- Keep the Root Orchestrator solely responsible for task intake, catalog writes, shared
  knowledge, integration, verification, and final status.
- Do not let delegation broaden task authority, worker permissions, external-action
  authority, or approval boundaries.
- Treat the standing request as project-local state in root `AGENTS.md`. A framework
  adopter merges only the portable startup requirement and must supply its own explicit
  delegation preference or authority.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Ask before every child | Narrowest authority | Adds product-owner coordination even for safe independent review | Rejected for this repository |
| Require delegation for every eligible-looking task | Maximizes parallelism | Ignores coordination cost, shared writers, and quota | Rejected |
| Grant bounded project-local standing authority | Removes routine approval while retaining decomposition, capacity, and ownership gates | Relies on Root judgment and accurate task state | Accepted |
| Make standing delegation part of portable startup | Uniform behavior across adopters | Falsely attributes product-owner authority to destinations | Rejected |

## Consequences

Positive:

- Independent review, verification, or research can run without routine approval delay.
- Capacity, task-revision, and single-writer controls remain mandatory.
- Destination projects do not inherit this repository's delegation preference.

Negative:

- Root Orchestrators must judge coordination benefit and monitor quota correctly.
- Shared-worktree or stale-revision mistakes can still waste work despite the controls.

Neutral or follow-up:

- Decision 0005's adapter pilot remains optional and must not create delegation solely
  to advance its evidence count.
- Decisions 0006 and 0007 continue to own capacity policy and Codex telemetry.

## Confidence

Confidence: High

Why:

The committed root instruction is explicit, while the existing decomposition, capacity,
revision, and single-writer rules bound its use and preserve destination autonomy.

## Review Trigger

Revisit when:

- delegation repeatedly costs more than it saves;
- a worker edits shared state, integrates under the wrong task revision, or widens
  permissions;
- capacity monitoring fails or exhausts root integration capacity; or
- packaging transfers the local standing request into a destination without its owner.

## Sources

- Root `AGENTS.md` standing delegation request added by commit `d5ff9f5`.
- [Decision 0005](0005-pilot-optional-agent-adapters.md),
  [Decision 0006](0006-guard-subagent-usage-capacity.md), and
  [Decision 0007](0007-add-codex-quota-monitor-skill.md).
- Product-owner core/state separability clarification dated 2026-07-14.
