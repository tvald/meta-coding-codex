# Adopt Adapters And Skip The Pilot Disposition Notes

## Task Cursor

- Name: Adopt the agent adapters and skip the Pilot disposition
- Started: 2026-07-30
- Last updated: 2026-07-30
- Status: Done
- Route: Initiative
- Latest user instruction: Immediately promote the adapter pilot to an adopted practice,
  and record in project state that for this repo only it always skips the Pilot state and
  immediately promotes changes as adopted.
- Goal and completion criteria: Promote the adapters, reframe shipped meta, record the
  skip-Pilot policy in the operating contract and project state, and commit.
- Next safe action: None; apply the policy to future framework changes here.

## Plan

- [x] Reframe the adapters as adopted in shipped meta.
- [x] Update the operating contract and record the policy in project state.
- [x] Write Decision 0016 and link Decision 0005 bidirectionally.
- [x] Verify grep, links, budgets, packaging, and commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Shipped meta wording | Done | Root Orchestrator | `agent-definitions.md`, `README.md` | Grep, links | Review at trigger |
| Project policy | Done | Root Orchestrator | `AGENTS.md`, `readme/README.md`, Decision 0016 | Operating-contract and cursor review | Apply to future changes |
| Records | Done | Root Orchestrator | Quality, catalog, changelog, cursor | Consistency | Maintain at cadence |

## Repository And Verification State

- Changed files: `agent-definitions.md`, `README.md` (meta), `AGENTS.md`, `readme/README.md`,
  Decision 0016, Decision 0005 (backlink), quality, task, catalog, and changelog records.
- Recent commits: `bb651b2` was `HEAD` when work began; the worktree was clean.
- Commands already run and observed results: Grep confirmed no shipped file retains
  specific-adapter "pilot" wording while the generic Pilot mechanism is untouched; link
  and budget checks pass; packer/installer inventories still agree.
- Required checks remaining: None.
- Decisions and assumptions since start: Keep the skip-Pilot override project-local (out of
  `readme/meta/`); adoption is a source-framework status change that updates shipped meta.

## Parked Approvals

None.

## Usage Capacity

- Last authoritative meter reading: 2026-07-30 Claude usage surface; all windows well
  below the tiered cutoffs.
- Limiting or unknown windows: None.
- Resume condition and next safe action: Capacity was safe throughout.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-30 | Reframed adapters as adopted and updated the operating contract | Meta and `AGENTS.md` diffs |
| 2026-07-30 | Recorded Decision 0016 and the skip-Pilot policy in project state | Decision 0016 and cursor |
