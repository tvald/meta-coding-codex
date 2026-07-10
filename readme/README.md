# Project State

Read this file at the start of every session. It is the project-wide cursor and
documentation index, not a history log. Keep it at or below 80 lines and link to task
notes or decisions for detail.

## Current Focus

- Status: Idle
- Goal: None
- Route: None
- Task note: None
- Next safe action: Start from the latest user request.

## Parked Approvals

| ID | Gated Action | Status | Dependent Work | Decision Record Or Task Note |
| --- | --- | --- | --- | --- |
| None | | | | |

An approval blocks only its dependent action. Continue unrelated safe work when it is
useful and remains within the user's scope.

## Known Dead Ends

- None.

Keep only dead ends relevant to current or queued work. Preserve older evidence in the
linked task note.

## Recently Completed

Keep at most five entries.

| Date | Outcome | Durable Record |
| --- | --- | --- |
| 2026-07-10 | Added the optional Codex and Claude Code three-role agent-adapter pilot | [Decision 0005](decisions/0005-pilot-optional-agent-adapters.md) |
| 2026-07-10 | Packaged the reusable framework under `readme/meta/` and separated categorized project documentation | [Decision 0004](decisions/0004-package-framework-as-addon.md) |
| 2026-07-10 | Dispositioned all framework critique concerns and aligned the framework | [Decision 0003](decisions/0003-address-framework-critique.md) |

## Next Actions

- Agent-adapter pilot: 0/5 eligible tasks. Review by 2026-08-09 or immediately after a
  trust-boundary or client-discovery failure; use [Decision 0005](decisions/0005-pilot-optional-agent-adapters.md).

## Documentation Map

- Reusable framework: [meta/README.md](meta/README.md)
- Stable project knowledge: `readme/project/` (created on demand)
- Decisions: [decisions/](decisions/)
- Active and historical tasks: [tasks/](tasks/)
- Quality evidence: [quality/](quality/)
- Threat models: [threat-models/](threat-models/)
- Incidents: `readme/incidents/` (created on demand)
- Learning: [learning/](learning/)
- Archives: `readme/archive/` (created on demand)

## Hygiene

- Last consistency and pruning pass: 2026-07-10
- Completed repository-changing tasks since that pass: 1
- Next pass due: 2026-08-09 or after 10 completed repository-changing tasks, whichever comes first
