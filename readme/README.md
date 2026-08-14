# Project State

Read this bounded project cursor at session start, then run the task-store startup query.
This file is a documentation index and home for project-wide policy, not a task
projection or history log.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: `node readme/meta/framework-data/cli.mjs startup`
- Package prompt and bounded reference views:
  `npm run --ignore-scripts --silent meta -- agent-prompt --profile PROFILE`,
  `npm run --ignore-scripts --silent meta -- hook --harness codex --profile PROFILE`,
  `npm run --ignore-scripts --silent meta -- docs TOPIC`, and
  `npm run --ignore-scripts --silent meta -- explain FACET`
- Locked data-only extension contract:
  `npm run --ignore-scripts --silent meta -- docs prompt-extensions`

Task identity, authority, lifecycle, dependencies, gates, next actions, details, and
results live only in the structured task store.

## Standing Project Policies

| Policy | Authority |
| --- | --- |
| Skip the Pilot disposition: use Adopt, Revise, or Reject. | [Decision 0016](decisions/0016-adopt-adapters-and-skip-pilot-disposition.md) |
| Keep framework-source history in `readme/learning/framework-changelog.md`; installed clients keep no framework changelog or package edits. | [Decision 0021](decisions/0021-adopt-immutable-npm-framework-delivery.md) |
| Mutate and normally query canonical task state only through the repository-pinned Node CLI; keep FileTaskStore as the sole initial production backend and SQLite reference-only. | [Decisions 0018](decisions/0018-adopt-node-structured-task-store.md) and [0024](decisions/0024-revise-structured-task-store-for-adapters.md) |
| Keep source-only harness skill bodies aligned with package-owned onboarding and recovery policy; never copy discovery bundles into clients. | [Decision 0021](decisions/0021-adopt-immutable-npm-framework-delivery.md) |
| Keep recovery proposal-only, bounded, revision-aware, and conservative about uncertain effects or ownership. | [Decision 0020](decisions/0020-adopt-guarded-task-recovery-skill.md) |
| Deliver future clients an immutable npm dependency with explicit package/client roots, derived attributable prompts, guarded extensions, and replacement-only updates. | [Decision 0021](decisions/0021-adopt-immutable-npm-framework-delivery.md) |
| Use fixed-profile Codex lifecycle hooks and exact `meta_` custom agents only through collision-safe, opt-in client integration; preserve the portable fallback and disable child multi-agent tools with the schema-compatible feature flag. | [Decisions 0022](decisions/0022-adopt-codex-hook-prompt-injection.md) and [0023](decisions/0023-revise-codex-child-agent-disablement.md) |
| Separate interactive design from command-launched autonomous implementation; use deterministic bounded ticks, concurrent isolated workers, one fenced writer, and fail-closed activation. | [Decision 0025](decisions/0025-adopt-concurrent-implementation-controller.md) |

## Known Global Dead Ends

- None.

## Documentation Map

- Reusable framework: [meta/README.md](meta/README.md)
- Copied-client transition: [meta/copied-client-transition.md](meta/copied-client-transition.md)
- Task store: [tasks/README.md](tasks/README.md)
- Stable project knowledge: `readme/project/`
- Decisions: [decisions/](decisions/)
- Task narratives: [tasks/](tasks/)
- Quality evidence: [quality/](quality/)
- Threat models: [threat-models/](threat-models/)
- Incidents: `readme/incidents/` (created on demand)
- Learning: [learning/](learning/)
- Archives and legacy migration evidence: [archive/](archive/)

## Maintenance Cadence

- Last maintenance pass: 2026-08-13
- Next trigger: 2026-09-12 or 10 repository-changing completions

Derive later completion counts from structured task records; do not maintain a duplicate
counter or completed-task list here.
