# Task Notes: Restructure Framework Add-on

## Task Cursor

- Name: Restructure framework as a self-contained add-on
- Started: 2026-07-10
- Last updated: 2026-07-10
- Status: Done
- Route: Initiative
- Latest user instruction: Implement the approved restructuring plan.
- Goal and completion criteria: See
  [task brief](0002-restructure-framework-addon-brief.md).
- Next safe action: Create the verified task-scoped local commit and confirm repository status.

## Plan

- [x] Inspect the existing framework, history, links, and approved structure.
- [x] Move reusable framework and mutable project documentation.
- [x] Rewrite entrypoints, process paths, templates, and package guidance.
- [x] Run and record all declared checks and review findings.
- [x] Close state and records for the task-scoped commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Directory contract | Done | Root Orchestrator | `AGENTS.md`, `README.md`, `readme/` | Structure and link checks | None |
| Durable records | Done | Root Orchestrator | Decision, task, quality, threat, learning, cursor | Consistency review | None |
| Verification | Done | Root Orchestrator | Repository and temporary package | Declared verification matrix | None |

## Repository And Verification State

- Changed files: Root entrypoints and the complete framework/project-documentation
  layout; see staged diff for the authoritative list.
- Recent commits: `dbe609d docs(framework): address critique and durable state`.
- Commands already run and observed results: Links and anchors passed across 40 repository
  Markdown files; a 25-file state-free package passed links and bootstrap; active stale
  paths, structure, 11 templates, budgets, fences, whitespace, and diff checks passed.
- Required checks remaining: Final rerun after close-record edits, then local commit.
- Decisions and assumptions since start: [Decision 0004](../decisions/0004-package-framework-as-addon.md).

## Parked Approvals

| ID | Proposal | Default | Yes Consequence | No Consequence | Dependent Work |
| --- | --- | --- | --- | --- | --- |
| None | | | | | |

## Worker Roster

| Worker | Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| Root Orchestrator | Entire migration | Repository documentation | Active | Plan approved | Resume from this note |

## Attempts And Dead Ends

| Attempt | Observed Evidence | Why Abandoned | Retry Only If |
| --- | --- | --- | --- |
| A resettable `readme/state/` wrapper | User preferred categorized state directly under `readme/` | Adds an unnecessary level | User changes the directory contract |
| In-place reset guidance | User selected package-only reset | Destructive procedure is unnecessary | Packaging no longer satisfies adoption needs |

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-10 | Approved target structure and verification plan recorded | User decisions and task brief |
| 2026-07-10 | Moved framework and state, rewrote entrypoints, and passed initial full/package link checks | Staged diff and temporary package exercise |
| 2026-07-10 | Resolved the host-README collision finding and completed the verification matrix | Onboarding contract, quality record, and passing checks |
