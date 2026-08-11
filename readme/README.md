# Project State

Read this bounded project cursor at session start, then run the task-store startup query.
This file is a documentation index and home for project-wide policy, not a task
projection or history log.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: `node readme/meta/framework-data/cli.mjs startup`
- Package prompt and bounded reference views:
  `npm run --ignore-scripts --silent meta -- agent-prompt --profile PROFILE`,
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
| Keep upstream history in `readme/learning/framework-changelog.md` and the distributable changelog as a blank seed. | [Decision 0017](decisions/0017-ship-blank-framework-changelog-seed.md) |
| Mutate and normally query canonical task state only through the repository-pinned Node CLI. | [Decision 0018](decisions/0018-adopt-node-structured-task-store.md) |
| Keep one guarded project-onboarding skill body and preserve same-name cross-harness bundles atomically. | [Decision 0019](decisions/0019-adopt-guarded-project-onboarding-skill.md) |
| Keep recovery proposal-only, bounded, revision-aware, and conservative about uncertain effects or ownership. | [Decision 0020](decisions/0020-adopt-guarded-task-recovery-skill.md) |
| Deliver future clients an immutable npm dependency with explicit package/client roots, derived attributable prompts, guarded extensions, and replacement-only updates. | [Decision 0021](decisions/0021-adopt-immutable-npm-framework-delivery.md) |

## Known Global Dead Ends

- None.

## Documentation Map

- Reusable framework: [meta/README.md](meta/README.md)
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

- Last maintenance pass: 2026-08-11
- Next trigger: 2026-09-10 or 10 repository-changing completions

Derive later completion counts from structured task records; do not maintain a duplicate
counter or completed-task list here.
