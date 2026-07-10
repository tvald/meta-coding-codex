# AI Coding Meta-Framework

This portable, markdown-only framework gives coding agents a durable operating loop,
project memory, risk-scaled quality gates, and explicit autonomy boundaries without
requiring a runtime dependency.

## Principles

- Outcome first; context before code.
- One provisional workflow route, with risk as an independent safety overlay.
- Small reversible steps and observed verification results.
- One canonical home for each fact, rule, decision, and command catalog.
- Repository-backed state and learning instead of assumed session memory.
- Agents maintain process memory; product owners make consequential product decisions.
- Repeated failures improve the system, with every framework edit auditable.

## Always-Read Entry

Every session starts with root `AGENTS.md` and [state.md](state.md). State is the bounded
cursor for current focus, next action, parked approvals, relevant dead ends, recent
outcomes, and hygiene cadence. It points to a task note when more detail is needed.

## Process Map

- [root-loop.md](root-loop.md): the operating loop for every task.
- [workflow-routing.md](workflow-routing.md): the single route table and escalation
  triggers.
- [onboarding.md](onboarding.md): cold-start inventory, verified command derivation,
  knowledge ingestion, owner interview, and state seeding.
- [knowledge-ingestion.md](knowledge-ingestion.md): source trust, document synthesis,
  acceptance criteria, and conflict handling.
- [knowledge-management.md](knowledge-management.md): canonical artifacts, state,
  one-home rule, budgets, archives, and maintenance cadence.
- [automation-policy.md](automation-policy.md): standing authority, approval boundaries,
  parked decisions, canonical commands, and local commits.
- [resumption-protocol.md](resumption-protocol.md): interruption and worker recovery.
- [agent-definitions.md](agent-definitions.md): optional roles, decomposition, integration,
  and shared-work safety.
- [development-standards.md](development-standards.md): default engineering standards.
- [quality-system.md](quality-system.md): risk gates, verification integrity, review,
  security, readiness, and completion statuses.
- [framework-improvement.md](framework-improvement.md): evidence-based framework edits,
  pilots, sunset checks, and qualitative disposition.
- [retrospectives.md](retrospectives.md): append-only cross-session learning signals.
- [framework-changelog.md](framework-changelog.md): auditable framework edits.
- [references.md](references.md): primary research basis.

## Ten-Template Catalog

- [project-brief.md](templates/project-brief.md): product outcomes and constraints, with
  links to canonical assumptions, terms, sources, and technical context.
- [task-brief.md](templates/task-brief.md): scoped outcome and acceptance criteria.
- [task-notes.md](templates/task-notes.md): long-running status, resume state, slices,
  approvals, workers, and dead ends.
- [project-context.md](templates/project-context.md): concise technical conventions.
- [standards.md](templates/standards.md): project rules and verified command catalog.
- [assumptions.md](templates/assumptions.md): consequential uncertainty.
- [decision-record.md](templates/decision-record.md): significant choices.
- [quality-record.md](templates/quality-record.md): readiness, acceptance, verification,
  review, consistency, and completion in one record.
- [threat-model-card.md](templates/threat-model-card.md): lightweight agent-aware threats.
- [incident-note.md](templates/incident-note.md): blameless incident and near-miss
  learning.

Blank templates are schemas, not additional homes for project facts. Do not instantiate
one until it will contain useful information.

## Bootstrap A Project

1. Copy `AGENTS.md` and `readme/`, merging rather than replacing existing instructions.
2. Clear copied project-specific entries from `readme/state.md`, then run
   [onboarding.md](onboarding.md).
3. Derive commands from manifests and CI, execute candidates, and record only successful
   invocations in `readme/standards.md` from [templates/standards.md](templates/standards.md).
4. Seed the project brief, project context, decisions, and other memory only with facts
   established during onboarding.
5. Confirm a new agent can recover the outcome, current focus, next action, commands,
   constraints, and approvals from the repository alone.

For greenfield work, decide and record product or technology choices instead of
pretending to derive them. Record commands only after their tooling exists and they run.

## Required Project State

Every project has `AGENTS.md` and the bounded `readme/state.md`. It should converge on
these files only as real content appears:

- `readme/project-brief.md`: product purpose, users, outcomes, and constraints.
- `readme/project-context.md`: implementation choices and conflict-prone conventions.
- `readme/standards.md`: project-specific standards and canonical verified commands.
- `readme/decisions/`: append-only significant decisions.
- `readme/assumptions.md`, `readme/glossary.md`, and `readme/source-map.md`: their
  canonical fact sets.
- `readme/task-notes/`: detail for long-running, paused, or parallel work.
- `readme/retrospectives.md` and `readme/framework-changelog.md`: durable process
  learning and framework audit history.

Use the owners, budgets, overflow rules, and maintenance cadence in
[knowledge-management.md](knowledge-management.md). Do not create empty process files.
