# Quota-Aware Subagent Control Notes

## Task Cursor

- Name: Add quota-aware subagent suspension and resumption
- Started: 2026-07-13
- Last updated: 2026-07-13
- Status: Done
- Route: Initiative
- Latest user instruction: Monitor usage, suspend subagents at 95% of either the
  five-hour or weekly limit, wait for reset, and resume work.
- Goal and completion criteria: Adopt a portable, capability-aware capacity guard; pass
  the High-risk documentation and trust-boundary gate; commit the task-owned result.
- Next safe action: None after the task-scoped commit; exercise the guard on the next
  eligible delegated task.

## Plan

- [x] Frame scope, risk, acceptance criteria, and readiness.
- [x] Record the decision and update canonical process owners.
- [x] Align templates and durable framework records.
- [x] Run link, budget, consistency, trust-boundary, and diff checks.
- [x] Review the task-owned change and prepare its required local commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Capacity guard | Done | Root Orchestrator | Agent definitions and automation policy | Scenario and ownership review | Exercise on eligible delegated work |
| Wait and recovery | Done | Root Orchestrator | Resumption protocol and task-note template | Timer/poll and status review | Exercise on eligible delegated work |
| Durable records | Done | Root Orchestrator | Decision, quality, threat, learning, state | Link and consistency review | Maintain at normal cadence |

## Repository And Verification State

- Changed files: Canonical agent, automation, resumption, template, and meta-index
  policy; Decision 0006; task brief/note; quality and threat records; framework
  changelog, retrospective, and project cursor.
- Recent commits: `dc26eca` was `HEAD` when work began; the worktree was clean.
- Commands already run and observed results: Baseline search found no quota guard; all
  seven threshold/wait/resume scenarios passed; local links and anchors passed across 54
  Markdown files; line budgets, eleven-template count, Markdown-only core, and
  `git diff --check` passed. The initial whitespace-sensitive scenario matcher produced
  three false failures; its whitespace-tolerant rerun passed without policy changes.
- Required checks remaining: None after the final structural rerun and staged-diff
  inspection.
- Decisions and assumptions since start: Direct user instruction is level-4 evidence
  for adoption; timers are useful only as wake-ups and never substitute for fresh usage.

## Parked Approvals

None.

## Worker Roster

No child workers are used; the user requested framework behavior, not delegation for
this implementation, and the canonical policy files overlap.

## Usage Capacity

- Last meter reading: Not applicable; this implementation has no active child workers.
- Five-hour window: Not read.
- Weekly window: Not read.
- Limiting windows: None.
- Wake method and time: None.
- Resume condition: Not applicable.

## Attempts And Dead Ends

None.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-13 | Framed Initiative route and High-risk gate before policy implementation | Task brief, readiness record, and threat model |
| 2026-07-13 | Added the dual-window guard, recovery behavior, standing authority, task checkpoint, and Decision 0006 | Canonical policy and task diff |
| 2026-07-13 | Resolved dual-window wake ambiguity and passed scenario and structural checks | Quality record and observed command output |
