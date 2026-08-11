# Project State

Read this bounded project cursor at session start, then run the task-store startup query.
This file is a documentation index and home for project-wide policy, not a task
projection or history log.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: `node readme/meta/framework-data/cli.mjs startup`

Task identity, authority, lifecycle, dependencies, gates, next actions, details, and
results live only in the structured task store.

## Standing Project Policies

| Policy | Authority |
| --- | --- |
| Skip the Pilot disposition: use Adopt, Revise, or Reject. | [Decision 0016](decisions/0016-adopt-adapters-and-skip-pilot-disposition.md) |
| Keep upstream history in `readme/learning/framework-changelog.md` and the distributable changelog as a blank seed. | [Decision 0017](decisions/0017-ship-blank-framework-changelog-seed.md) |
| Mutate and normally query canonical task state only through the repository-pinned Node CLI. | [Decision 0018](decisions/0018-adopt-node-structured-task-store.md) |

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

- Last maintenance pass: 2026-07-30
- Legacy repository-changing completion baseline: 6 before structured completion metadata
- Next trigger: 2026-08-29 or 10 repository-changing completions

Derive later completion counts from structured task records; do not maintain a duplicate
counter or completed-task list here.
