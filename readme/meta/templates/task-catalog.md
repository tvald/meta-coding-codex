# Task Catalog

This is the canonical discovery and lifecycle record for every accepted task. Physical
row order has no scheduling meaning. The Root Orchestrator is the sole writer.

- Format: 1
- Next task ID: T-0001
- Primary task: None
- Scheduling: Running
- Global pause source or reason: None
- Archived task rows: None

## Tasks

| ID | Outcome | Authority / Rev | Status | Depends On | Route / Risk | Approval Or Blocker | Next Safe Action | Details | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | Authority reference / r1 | Pending / Ready / Active / Parked / Blocked / Needs verification / Done / Cancelled / Superseded | None | Unrouted | None or approval ID / status / rN / detail link | | None | None |

## Operating Contract

- Lifecycle, ownership, selection, detail, and archive rules:
  `readme/meta/knowledge-management.md#task-lifecycle-and-selection`
- Intake and task-close behavior: `readme/meta/root-loop.md`
- Interruption and message-targeting behavior: `readme/meta/resumption-protocol.md`
- Keep every cell to about two sentences. Move richer framing to a brief and richer
  execution history to a `NNNN-notes.md`, then link it from `Details`.
- Budget: about 20 task rows. Over budget, archive the oldest terminal rows (retaining
  every nonterminal row) by appending them unchanged under a distilled index in
  `readme/archive/tasks/YYYY-MM-catalog.md`; never rewrite archived rows, use a sequence
  suffix if an existing file cannot be appended safely, and update `Archived task rows`
  above—see `knowledge-management.md#artifact-budgets-and-overflow`.
- This file owns only project task facts. Do not add another work or priority list.
