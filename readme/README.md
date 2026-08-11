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

## Standing Project Policies

Durable repository-wide rules that override framework defaults. Link the authoritative
decision; do not restate its detail.

| Policy | Authority |
| --- | --- |
| Skip the Pilot disposition: adopt framework changes directly (Adopt, Revise, or Reject only). The three role adapters are adopted, not piloted. | [Decision 0016](decisions/0016-adopt-adapters-and-skip-pilot-disposition.md) |
| Keep this upstream repository's framework history in `readme/learning/framework-changelog.md` and the distributable `readme/meta/framework-changelog.md` as a blank seed. | [Decision 0017](decisions/0017-ship-blank-framework-changelog-seed.md) |

## Known Global Dead Ends

- None.

Keep only dead ends relevant to current or queued work. Preserve older evidence in the
linked task note.

## Recently Completed

Keep at most five entries.

| Date | Outcome | Durable Record |
| --- | --- | --- |
| 2026-08-11 | Evaluated process codification and recommended a small skill set plus one read-only validator | [T-0017 assessment](tasks/0017-process-codification-evaluation-notes.md#findings) |
| 2026-08-05 | Reconciled downstream framework changes and shipped a guarded blank changelog seed | [T-0016 quality record](quality/2026-08-05-imported-framework-reconciliation.md) |
| 2026-07-30 | Adopted the three role adapters and set a repo-wide skip-Pilot policy | [Decision 0016](decisions/0016-adopt-adapters-and-skip-pilot-disposition.md) |
| 2026-07-30 | Adopted tiered per-window usage cutoffs (95/98/99) in the capacity guard | [Decision 0015](decisions/0015-tiered-usage-capacity-cutoffs.md) |
| 2026-07-30 | Added a credential-safe Claude Code usage-telemetry skill shipped through the core installer | [Decision 0014](decisions/0014-add-claude-usage-telemetry-skill.md) |

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

- Last consistency and pruning pass: 2026-07-30
- Completed repository-changing tasks since that pass: 4
- Next pass due: 2026-08-29 or after 10 completed repository-changing tasks, whichever comes first
