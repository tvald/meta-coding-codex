# Project State

Read this file at the start of every session. It is the project-wide cursor and
documentation index, not a history log. Keep it at or below 80 lines and link to task
notes or decisions for detail.

## Task Cursor

- Task catalog: [Task catalog](tasks/README.md)
- Primary task: None
- Primary details: None

The task catalog owns outcomes, status, dependencies, task-specific approvals or
blockers, next actions, detail links, and results. Do not copy them here.

## Global Parked Approvals

Task-specific approvals belong in the catalog. Use this table only for an approval that
gates several tasks or the whole project.

| ID | Gated Action | Status | Affected Tasks | Decision Record |
| --- | --- | --- | --- | --- |
| None | | | | |

An approval blocks only its dependent action. Continue unrelated safe work when it is
useful and remains within the user's scope.

## Known Global Dead Ends

- None.

Keep only dead ends relevant to current or queued work. Preserve older evidence in the
linked task note.

## Recently Completed

Keep at most five entries.

| Date | Outcome | Durable Record |
| --- | --- | --- |
| 2026-07-14 | Added a reproducible state-free core packaging command | [Decision 0010](decisions/0010-automate-portable-core-archive.md) |
| 2026-07-14 | Adopted imported task orchestration, migrated host state, and verified state-free packaging | [Decisions 0008](decisions/0008-adopt-durable-task-orchestration.md) and [0009](decisions/0009-authorize-bounded-project-delegation.md) |
| 2026-07-13 | Added and forward-tested the dependency-free Codex quota-monitor skill | [Decision 0007](decisions/0007-add-codex-quota-monitor-skill.md) |
| 2026-07-13 | Added quota-aware subagent suspension, reset waiting, and verified resumption | [Decision 0006](decisions/0006-guard-subagent-usage-capacity.md) |
| 2026-07-10 | Added the optional Codex and Claude Code three-role agent-adapter pilot | [Decision 0005](decisions/0005-pilot-optional-agent-adapters.md) |

## Documentation Map

- Reusable framework: [meta/README.md](meta/README.md)
- Task catalog: [tasks/README.md](tasks/README.md)
- Stable project knowledge: `readme/project/` (created on demand)
- Decisions: [decisions/](decisions/)
- Task details: [tasks/](tasks/)
- Quality evidence: [quality/](quality/)
- Threat models: [threat-models/](threat-models/)
- Incidents: `readme/incidents/` (created on demand)
- Learning: [learning/](learning/)
- Archives: `readme/archive/` (created on demand)

## Hygiene

- Last consistency and pruning pass: 2026-07-10
- Completed repository-changing tasks since that pass: 5
- Next pass due: 2026-08-09 or after 10 completed repository-changing tasks, whichever comes first
