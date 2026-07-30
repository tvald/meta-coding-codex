# Tiered Usage Capacity Cutoffs Notes

## Task Cursor

- Name: Adopt tiered per-window usage capacity cutoffs
- Started: 2026-07-30
- Last updated: 2026-07-30
- Status: Done
- Route: Initiative
- Latest user instruction: Incorporate tiered cutoffs; 95% on weekly/monthly is wasteful,
  the cutoff only needs to prevent accidentally hitting the limit and terminating the
  primary orchestrator session.
- Goal and completion criteria: Generalize the guard to every advertised window with
  tiered 95/98/99 cutoffs, align dependent shipped docs, record the decision, and commit.
- Next safe action: None; observe the tiers on the next delegated work.

## Plan

- [x] Rewrite the guard for every advertised window with tiered cutoffs.
- [x] Align the resumption capacity-wait trigger and the task-notes template.
- [x] Record Decision 0015, quality, catalog, changelog, and cursor.
- [x] Verify budgets, links, and packaging, then commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Capacity guard | Done | Root Orchestrator | `agent-definitions.md` | Budget, wording, no hardcoded 95% | Observe on delegated work |
| Dependent docs | Done | Root Orchestrator | `resumption-protocol.md`, `templates/task-notes.md` | Consistency, links | Review at trigger |
| Records | Done | Root Orchestrator | Decision 0015, quality, catalog, changelog, cursor | High gate and consistency | Maintain at cadence |

## Repository And Verification State

- Changed files: `agent-definitions.md`, `resumption-protocol.md`,
  `templates/task-notes.md`; Decision 0015; quality, task, catalog, changelog, cursor.
- Recent commits: `3f15430` was `HEAD` when work began; the worktree was clean.
- Commands already run and observed results: `agent-definitions.md` measured 300 lines
  after compression (it had drifted to 301 from the earlier guard-pointer edit); grep
  confirmed no shipped file hardcodes a flat 95% cutoff and the skills defer to the guard;
  link and budget checks pass; packer/installer inventories still agree.
- Required checks remaining: None.
- Decisions and assumptions since start: Keep the rationale in Decision 0015 and the guard
  operational so the core doc stays within budget; skills need no change.

## Parked Approvals

None.

## Usage Capacity

- Last authoritative meter reading: 2026-07-30, Claude usage surface (same session as
  T-0012): five-hour ~17%, weekly 2%, monthly not advertised.
- Limiting or unknown windows: None; all below the new tiered cutoffs.
- Resume condition and next safe action: Capacity was safe throughout.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-30 | Generalized the guard and applied tiered 95/98/99 cutoffs | `agent-definitions.md` diff at 300 lines |
| 2026-07-30 | Aligned resumption trigger and task-notes template | Dependent-doc diffs |
| 2026-07-30 | Recorded Decision 0015 and supporting records | Decision, quality, catalog, changelog, cursor |
