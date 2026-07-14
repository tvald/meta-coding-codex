# Task Catalog

This is the canonical discovery and lifecycle record for every accepted task. Physical
row order has no scheduling meaning. The Root Orchestrator is the sole writer.

- Format: 1
- Next task ID: T-0007
- Primary task: None
- Scheduling: Running
- Global pause source or reason: None

## Tasks

| ID | Outcome | Authority / Rev | Status | Depends On | Route / Risk | Approval Or Blocker | Next Safe Action | Details | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-0001 | Disposition and address the framework critique | User instruction, 2026-07-10 / r1 | Done | None | Initiative / High | None | None | [Notes](0001-framework-critique-notes.md) | `dbe609d` |
| T-0002 | Package the framework as a self-contained add-on | User-approved plan, 2026-07-10 / r1 | Done | None | Initiative / High | None | None | [Brief](0002-restructure-framework-addon-brief.md), [notes](0002-restructure-framework-addon-notes.md) | `9eb2e82` |
| T-0003 | Pilot optional Codex and Claude Code agent adapters | User instruction, 2026-07-10 / r1 | Done | T-0002 | Initiative / High | None | None | [Brief](0003-agent-adapter-pilot-brief.md), [notes](0003-agent-adapter-pilot-notes.md) | `dc26eca` |
| T-0004 | Add quota-aware subagent suspension and resumption | User instruction, 2026-07-13 / r1 | Done | None | Initiative / High | None | None | [Brief](0004-quota-aware-subagent-control-brief.md), [notes](0004-quota-aware-subagent-control-notes.md) | `8c57799` |
| T-0005 | Add a dependency-free Codex quota-monitor skill | User instruction, 2026-07-13 / r1 | Done | T-0004 | Initiative / High | None | None | [Brief](0005-codex-quota-monitor-skill-brief.md), [notes](0005-codex-quota-monitor-skill-notes.md) | `058349e` |
| T-0006 | Reconcile durable project state with imported task-loop commit `d5ff9f5` and verify core/state separation | User instructions, 2026-07-14 / r2 | Done | None | Initiative / High | None | None | [Brief](0006-task-loop-state-reconciliation-brief.md), [notes](0006-task-loop-state-reconciliation-notes.md) | Decisions [0008](../decisions/0008-adopt-durable-task-orchestration.md) and [0009](../decisions/0009-authorize-bounded-project-delegation.md) |

## Operating Contract

- Lifecycle, ownership, selection, detail, and archive rules:
  `readme/meta/knowledge-management.md#task-lifecycle-and-selection`
- Intake and task-close behavior: `readme/meta/root-loop.md`
- Interruption and message-targeting behavior: `readme/meta/resumption-protocol.md`
- This file owns only project task facts. Do not add another work or priority list.
