# Task Catalog

This is the canonical discovery and lifecycle record for every accepted task. Physical
row order has no scheduling meaning. The Root Orchestrator is the sole writer.

- Format: 1
- Next task ID: T-0017
- Primary task: None
- Scheduling: Idle
- Global pause source or reason: None
- Archived task rows: None

## Tasks

| ID | Outcome | Authority / Rev | Status | Depends On | Route / Risk | Approval Or Blocker | Next Safe Action | Details | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-0001 | Disposition and address the framework critique | User instruction, 2026-07-10 / r1 | Done | None | Initiative / High | None | None | [Notes](0001-framework-critique-notes.md) | `dbe609d` |
| T-0002 | Package the framework as a self-contained add-on | User-approved plan, 2026-07-10 / r1 | Done | None | Initiative / High | None | None | [Brief](0002-restructure-framework-addon-brief.md), [notes](0002-restructure-framework-addon-notes.md) | `9eb2e82` |
| T-0003 | Pilot optional Codex and Claude Code agent adapters | User instruction, 2026-07-10 / r1 | Done | T-0002 | Initiative / High | None | None | [Brief](0003-agent-adapter-pilot-brief.md), [notes](0003-agent-adapter-pilot-notes.md) | `dc26eca` |
| T-0004 | Add quota-aware subagent suspension and resumption | User instruction, 2026-07-13 / r1 | Done | None | Initiative / High | None | None | [Brief](0004-quota-aware-subagent-control-brief.md), [notes](0004-quota-aware-subagent-control-notes.md) | `8c57799` |
| T-0005 | Add a dependency-free Codex quota-monitor skill | User instruction, 2026-07-13 / r1 | Done | T-0004 | Initiative / High | None | None | [Brief](0005-codex-quota-monitor-skill-brief.md), [notes](0005-codex-quota-monitor-skill-notes.md) | `058349e` |
| T-0006 | Reconcile durable project state with imported task-loop commit `d5ff9f5` and verify core/state separation | User instructions, 2026-07-14 / r2 | Done | None | Initiative / High | None | None | [Brief](0006-task-loop-state-reconciliation-brief.md), [notes](0006-task-loop-state-reconciliation-notes.md) | Decisions [0008](../decisions/0008-adopt-durable-task-orchestration.md) and [0009](../decisions/0009-authorize-bounded-project-delegation.md) |
| T-0007 | Add a shell script that packages the portable framework core as a zip archive | User instruction, 2026-07-14 / r1 | Done | T-0006 | Quick change / High | None | None | [Brief](0007-core-package-script-brief.md), [notes](0007-core-package-script-notes.md) | [Decision 0010](../decisions/0010-automate-portable-core-archive.md) |
| T-0008 | Build the core zip on every push to `main`, publish it as `latest`, and document installation | User instructions, 2026-07-14 / r2 | Done | T-0007 | Initiative / High | None | None | [Brief](0008-latest-release-workflow-brief.md), [notes](0008-latest-release-workflow-notes.md) | [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md) |
| T-0009 | Replace inline installation commands with a safe script usable through `curl` piped to Bash | User instruction, 2026-07-14 / r1 | Done | T-0008 | Quick change / High | None | None | [Brief](0009-piped-core-installer-brief.md), [notes](0009-piped-core-installer-notes.md) | [Decision 0012](../decisions/0012-add-fail-closed-piped-installer.md) |
| T-0010 | Streamline the public install command to conventional `curl -fsSL … \| bash` form | User instruction, 2026-07-14 / r1 | Done | T-0009 | Quick change / High | None | None | [Brief](0010-streamline-installer-command-brief.md), [notes](0010-streamline-installer-command-notes.md) | [Decision 0013](../decisions/0013-streamline-installer-invocation.md) |
| T-0011 | Rename the moving-latest release display title from `Latest framework core` to `core-framework` | User instruction, 2026-07-14 / r1 | Done | T-0008 | Quick change / Medium | None | None | None | [Quality record](../quality/2026-07-14-core-release-title.md) |
| T-0012 | Add a credential-safe Claude Code usage-telemetry skill and ship it through the core installer | User instruction, 2026-07-30 / r1 | Done | T-0005, T-0013 | Initiative / High | None | None | [Brief](0012-claude-quota-monitor-skill-brief.md), [notes](0012-claude-quota-monitor-skill-notes.md) | [Decision 0014](../decisions/0014-add-claude-usage-telemetry-skill.md) |
| T-0013 | Pack harness adapters and skills into the core packager and installer | User instruction, 2026-07-30 / r1 | Done | T-0009 | Quick change / High | None | None | [Brief](0013-installer-adapter-packing-brief.md), [notes](0013-installer-adapter-packing-notes.md) | `0a8cd76`, [quality record](../quality/2026-07-30-installer-adapter-packing.md) |
| T-0014 | Adopt tiered per-window usage capacity cutoffs in the guard | User instruction, 2026-07-30 / r1 | Done | T-0012 | Initiative / High | None | None | [Brief](0014-tiered-usage-cutoffs-brief.md), [notes](0014-tiered-usage-cutoffs-notes.md) | [Decision 0015](../decisions/0015-tiered-usage-capacity-cutoffs.md) |
| T-0015 | Adopt the role adapters and set a repo-wide skip-Pilot disposition policy | User instruction, 2026-07-30 / r1 | Done | T-0003 | Initiative / Medium | None | None | [Brief](0015-adopt-adapters-skip-pilot-brief.md), [notes](0015-adopt-adapters-skip-pilot-notes.md) | [Decision 0016](../decisions/0016-adopt-adapters-and-skip-pilot-disposition.md) |
| T-0016 | Reconcile imported meta-framework changes and establish the framework-changelog stub and boundary | User instructions, 2026-08-05 / r2 | Done | None | Initiative / High | None | None | [Brief](0016-imported-framework-reconciliation-brief.md), [notes](0016-imported-framework-reconciliation-notes.md) | [Decision 0017](../decisions/0017-ship-blank-framework-changelog-seed.md), [quality](../quality/2026-08-05-imported-framework-reconciliation.md) |

## Operating Contract

- Lifecycle, ownership, selection, detail, and archive rules:
  `readme/meta/knowledge-management.md#task-lifecycle-and-selection`
- Intake and task-close behavior: `readme/meta/root-loop.md`
- Interruption and message-targeting behavior: `readme/meta/resumption-protocol.md`
- This file owns only project task facts. Do not add another work or priority list.
