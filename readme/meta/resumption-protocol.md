# Resumption Protocol

Interrupted work resumes from durable repository state, not the product owner's memory.
This protocol applies after device or network loss, context compaction, tool failure,
agent restart, approval waits, and deliberate user interruption.

## Interruption Types

| Type | Examples | Required Response |
| --- | --- | --- |
| Unplanned pause | Sleep, network loss, compaction, session restart | Reconstruct from state and repository evidence; continue from the next safe action |
| Approval wait | Release, destructive action, sensitive permission | Park the gated action; continue independent safe work; resume it only after the decision |
| User guidance | Changed constraint, goal, example, or priority | Halt conflicting work, reframe, update state, plan, and assignments |
| User stop | Stop, pause, cancel, wait, hold on | Stop nonessential work, checkpoint state, close or suspend workers, and do not continue |
| Worker loss | Stale worker, missing result, crashed tool | Reconcile shared state; recover only work still needed and safe to own |

## Durable Cursor

`readme/README.md` is the first pointer. For long-running, risky, paused, or parallel
work, it links one active `readme/tasks/NNNN-topic-notes.md` created from
[templates/task-notes.md](templates/task-notes.md). The note contains:

- latest user instruction, goal, route, criteria, and plan;
- work-item and artifact status;
- changed files, commits, commands already run, and observed results;
- worker roster and non-overlapping ownership;
- decisions and assumptions made during the task;
- failed approaches worth avoiding, with evidence and retry conditions;
- verification completed and required checks remaining;
- next safe action; and
- stop conditions and parked approvals.

Small single-turn work needs no task note when state, the active plan, and final response
are enough to recover it.

## Resume Loop

1. Read `AGENTS.md`, the meta README, `readme/README.md`, the latest user message, and
   the active task note if linked.
2. Classify the interruption and apply the newest instruction before older plans.
3. Inspect `git status`, recent commits, relevant diffs, running tools, and integration
   state. Do not repeat a risky side effect until its prior result is known.
4. Reconstruct and update the plan, next safe action, parked approvals, and worker
   roster before editing.
5. Review recorded dead ends. Retry only when new evidence addresses the observed reason
   for failure.
6. Re-run only the checks needed to establish current state, then continue or report the
   concrete blocker.
7. Refresh state and the task note after meaningful progress and before a long pause.

## Worker And Worktree Recovery

[agent-definitions.md](agent-definitions.md#parallel-integration-and-recovery) owns the
rules for WIP limits, shared-file writers, isolated-context publication, integration
checks, and orphaned branch or worktree recovery. On resume, do not reassign work until
the repository and worker roster show that it is absent or unusable. Preserve unknown
commits and uncommitted changes until ownership is established.

Replacement work receives the original goal, newest guidance, ownership boundary,
prior evidence, current repository state, what not to redo or revert, verification, and
handoff format. Do not recover obsolete work after a user stop or redirect.

## Deliberate User Interrupts

The newest user message controls the current turn:

- A status question gets a status answer; compatible work continues unless the user
  asked only for a report or pause.
- New guidance stops conflicting actions, updates the plan and state, and permits only
  compatible continuation.
- Stop, pause, cancel, wait, or hold on stops nonessential actions and new workers until
  the user resumes.
- Output from a worker following an older plan is stale evidence until reviewed against
  the new instruction.
- The final response addresses the newest request and status, not the superseded plan.

## Resume Verification

Before closing resumed work, confirm that the latest request is satisfied, stale worker
output was reviewed before use, checks cover work from both sides of the interruption,
and state records remaining verification, approvals, or blockers.
