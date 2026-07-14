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
| 2026-07-14 | Renamed the moving latest release display title to `core-framework` | [T-0011 quality record](quality/2026-07-14-core-release-title.md) |
| 2026-07-14 | Streamlined installation to conventional curl-to-Bash syntax with a guarded-stream sentinel | [Decision 0013](decisions/0013-streamline-installer-invocation.md) |
| 2026-07-14 | Added a portable fail-closed piped core installer with producer-synchronized inventory | [Decision 0012](decisions/0012-add-fail-closed-piped-installer.md) |
| 2026-07-14 | Added a serialized moving-latest release workflow and documented safe core installation | [Decision 0011](decisions/0011-publish-moving-latest-core-release.md) |
| 2026-07-14 | Added a reproducible state-free core packaging command | [Decision 0010](decisions/0010-automate-portable-core-archive.md) |

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
- Completed repository-changing tasks since that pass: 9
- Next pass due: 2026-08-09 or after 10 completed repository-changing tasks, whichever comes first
