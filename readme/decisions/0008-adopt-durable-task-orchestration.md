# 0008: Adopt Imported Durable Task Orchestration With State-Free Packaging

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0004](0004-package-framework-as-addon.md) only where it describes the
  project cursor as the sole mandatory host-state artifact, fixes the reusable template
  count at eleven, or omits catalog collision handling. Its package boundary and
  state-exclusion decisions remain accepted.

Superseded by:

- None

## Context

Commit `d5ff9f5` imported a task and work-management loop from a separate repository.
The import changed 17 reusable or root-instruction files but correctly omitted the
source repository's mutable cursor, task history, decisions, reviews, threats, and
learning. This host therefore retained its old cursor and had no instance of the newly
mandatory `readme/tasks/README.md` catalog.

The imported core introduces more than a template: it changes how instructions become
durable tasks, how concurrent and interrupted work is targeted, how authority and
approvals are bound, how work is selected, and how completion and commits remain
task-isolated. The product owner clarified that adoption records belong in this host and
that any framework correction should primarily protect core/state separability.

Independent review confirmed the state-free boundary but found one collision gap. The
core recognized an unrelated `readme/README.md` by schema and preserved it, while a
pre-existing unrelated `readme/tasks/README.md` could be mistaken for a catalog or
overwritten during onboarding.

## Decision

- Adopt `readme/tasks/README.md` as mandatory host state and the sole catalog for stable
  task IDs/revisions, authority provenance, scheduling, lifecycle, dependencies,
  route/risk, task-specific approvals or blockers, next actions, detail, and results.
- Treat independent instructions as additive work rather than global replacement.
  Target guidance, approvals, pauses, cancellations, amendments, and worker output to a
  task and revision; reserve explicit unqualified stops for global scheduling.
- Select non-FIFO from validated authority, observable acceptance, dependencies,
  approvals, repository safety, user intent, unblock value, risk, and coherent change
  boundaries. Keep route, risk, verification, terminal status, and commit boundaries
  task-scoped.
- Keep `readme/README.md` as a bounded pointer and global-state surface, not a duplicate
  task list. The Root Orchestrator is the catalog's sole writer.
- Preserve the state-free package boundary: reusable policy and blank templates live in
  `readme/meta/`; each destination creates or migrates its own cursor, catalog, and
  supporting records after import. Never copy source-project task facts into a package.
- Recognize valid mandatory artifacts by `# Project State` and `# Task Catalog`. If
  either destination path contains other documentation, preserve it and apply inventory,
  relocation, inbound-link update, and external-contract owner-decision handling before
  instantiating the framework artifact.
- Keep project-local standing delegation authority separate under
  [Decision 0009](0009-authorize-bounded-project-delegation.md); a destination does not
  inherit that authority merely by merging the portable startup instruction.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Keep only the current-focus cursor | Lowest state overhead | Loses additive intake, dependencies, task-scoped targeting, and multi-task recovery | Rejected |
| Copy the source repository's state with the imported core | Immediately supplies a catalog and records | Pollutes the host with foreign authority and history | Rejected |
| Import core, then create host-specific state | Preserves portability and gives each host accurate memory | Requires an explicit post-import migration | Accepted |
| Add executable task storage or migration tooling | Could enforce schema mechanically | Breaks the Markdown-only dependency-free core before evidence requires tooling | Rejected |

## Consequences

Positive:

- A cold-start agent can recover every accepted task without treating arrival order as
  priority or a newer unrelated message as cancellation.
- Approval, worker, verification, and commit evidence stays bound to the affected task.
- The reusable package remains free of destination decisions and task history.
- Existing project documentation at either mandatory path receives symmetric
  preservation treatment.

Negative:

- The catalog adds a shared mutable file whose task-owned hunks require careful staging.
- Importing a core update that adds or changes host-state schema requires a local
  reconciliation step.
- Cooperative Markdown policy cannot mechanically prevent catalog corruption or stale
  task targeting.

Neutral or follow-up:

- Historical task rows use repository-backed facts only; Git chronology alone does not
  establish a hard dependency.
- Add runtime validation or migration tooling only after repeated real-host failures
  justify the portability and maintenance cost.

## Confidence

Confidence: High

Why:

The committed import supplies a coherent canonical owner model, the product owner
confirmed the state-free origin and separability priority, and an independent review
found only the bounded collision defect corrected during adoption.

## Review Trigger

Revisit when:

- a core update cannot be adopted without copying source state;
- onboarding overwrites or misclassifies an existing cursor or task index;
- task catalog staging captures unrelated pending rows;
- additive targeting causes repeated ambiguity or stale approval/output use; or
- catalog maintenance costs exceed its recovery value across real tasks.

## Sources

- Imported commit `d5ff9f546432efc17d0e02570fc48b5a9da17f3a`, dated 2026-07-14.
- Product-owner clarification dated 2026-07-14 that the import intentionally omitted
  state and that core/state separability is the primary framework concern.
- T-0006@r2 independent review and state-free package analysis.
