# Project State

Read this bounded project cursor at session start, then run the task-store startup query.
Keep this file at or below 80 lines. It is a documentation index and home for genuinely
project-wide facts, not a task projection or history log.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: `node readme/meta/framework-data/cli.mjs startup`

Task identity, authority, lifecycle, dependencies, gates, next actions, details, and
results live only in the structured task store. Do not copy primary or recent-task state
here.

## Standing Project Policies

| Policy | Authority |
| --- | --- |
| None | |

## Known Global Dead Ends

- None.

Keep only currently relevant cross-task dead ends. Put task-specific attempts in the
linked task note.

## Documentation Map

- Reusable framework: [meta/README.md](meta/README.md)
- Task store: [tasks/README.md](tasks/README.md)
- Stable project knowledge: `readme/project/` (created on demand)
- Decisions: `readme/decisions/`
- Task narratives: `readme/tasks/`
- Quality evidence: `readme/quality/`
- Threat models: `readme/threat-models/`
- Incidents: `readme/incidents/` (created on demand)
- Learning: `readme/learning/`
- Archives and legacy migration evidence: `readme/archive/` (created on demand)

## Maintenance

- Last maintenance pass: YYYY-MM-DD
- Legacy repository-changing completion baseline: 0
- Next trigger: YYYY-MM-DD or 10 repository-changing completions

Derive the task-count trigger from structured completion fields after the last pass;
never maintain a duplicate task counter or completion list here.
