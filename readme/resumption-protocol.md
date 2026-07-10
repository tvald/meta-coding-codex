# Resumption Protocol

Interrupted work should resume from durable state, not from the product owner's memory. This protocol applies after device sleep, network loss, context compaction, tool failure, agent restart, long approval waits, or deliberate user interruption.

## Principles

- Latest instruction wins: the newest user message controls the current turn.
- Root continuity: resume the root goal first, then decide what to do with child agents.
- Durable cursor: task notes, plans, repository state, commits, and agent rosters are the markdown equivalent of a runtime checkpoint.
- No duplicate side effects: do not rerun risky commands, migrations, external actions, or broad edits until the previous state is understood.
- Low babysitting: ask the product owner only for decisions that cannot be recovered or safely inferred.

## Interruption Types

| Type | Examples | Required Response |
| --- | --- | --- |
| Unplanned pause | device sleep, network loss, context compaction, tool/session restart | Reconstruct state, update resume packet, continue from next safe action |
| Approval wait | high-risk command, release action, sensitive tool call | Keep work paused until the decision is received, then resume from the recorded checkpoint |
| User guidance | new constraints, corrected goal, extra examples | Halt conflicting work, reframe, update plan and agent assignments |
| User stop | stop, pause, cancel, wait, hold on | Stop nonessential work, save state, close or suspend child agents, do not continue until resumed |
| Agent loss | stale child agent, missing result, crashed tool | Poll if possible; otherwise re-spawn only still-needed work from the latest checkpoint |

## Resume Packet

For long-running, risky, or multi-agent work, maintain a resume packet in `readme/task-notes/NNNN-topic.md` or the current task note.

Minimum fields:

- Latest user instruction.
- Goal and completion criteria.
- Current plan with completed, active, and pending steps.
- Repository state: changed files, recent commits, uncommitted diff summary, and relevant commands already run.
- Agent roster: agent id or label, assignment, owned files, status, last known output, and restart policy.
- Decisions and assumptions made since the task began.
- Failed approaches worth avoiding: observed evidence, why each was abandoned, and what
  new condition would justify retrying it.
- Verification already completed and checks still needed.
- Next safe action.
- Stop conditions or approvals required before continuing.

For small single-turn tasks, the active plan and final response can serve as the resume packet.

## Resume Loop

When resuming:

1. Read `AGENTS.md`, the root loop, this protocol, and any task note.
2. Read the latest user message and classify the interruption type.
3. Inspect `git status`, recent commits, relevant diffs, and changed files.
4. Reconstruct the active plan and update it before editing files.
5. Reconcile the agent roster: completed, running, stale, missing, obsolete, or needs replacement.
6. Re-run only the checks needed to establish the current state.
7. Review recorded failed approaches before retrying them; retry only when new evidence
   or a changed condition addresses the recorded reason for failure.
8. Continue from the next safe action, or stop with a concise blocker if continuing would violate the newest instruction.
9. Update the resume packet after meaningful progress, before waiting on agents, and before any long pause.

## Re-Spawning Agents

Only the Root Orchestrator re-spawns agents after interruption.

Re-spawn when:

- The original agent is unavailable or stale.
- The work is still needed after applying the latest user guidance.
- The assignment has an independent ownership boundary.
- Repeating the work cannot overwrite or conflict with completed changes.

Do not re-spawn when:

- The user explicitly paused or cancelled the task.
- The work is obsolete under newer guidance.
- The repository already contains the result.
- The original assignment touched files now changed by someone else and needs re-planning.

Replacement assignment must include:

- Original goal and latest user guidance.
- Owned files or domains.
- Prior findings and outputs to preserve.
- Current repository state and changed files.
- What not to redo or revert.
- Expected output, verification, and handoff format.

## Deliberate User Interrupts

When the user interrupts deliberately:

- Stop executing the stale plan immediately.
- Do not start new child agents or long-running commands until the new instruction is classified.
- If the message is guidance, integrate it into the plan and continue only where compatible.
- If the message is a hard stop, save state and halt.
- If child agents later return output based on the old plan, review it as stale evidence before using it.
- If the user asks a question, answer it, then resume compatible work unless they asked to pause or the answer changes the plan.

## Resume Verification

Before finalizing resumed work, verify:

- The final answer addresses the newest user request.
- No stale agent output was integrated without review.
- Checks account for work done before and after the interruption.
- The task note or final response records any unresolved state, skipped checks, or remaining approval.
