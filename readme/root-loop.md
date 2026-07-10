# Root Orchestration Loop

The root loop coordinates all work. It balances speed with quality by forcing enough context, explicit verification, and durable knowledge capture without turning every task into a ceremony.

## Loop Summary

Run this loop until the task is complete:

0. Resume check
1. Frame
2. Gather
3. Choose
4. Plan
5. Execute
6. Verify
7. Record
8. Improve

## 0. Resume Check

If the work may be resuming after device sleep, network loss, context compaction, agent restart, tool failure, or a previous pause, run [resumption-protocol.md](resumption-protocol.md) before changing files.

Minimum resume check:

- Read the latest user instruction and any task note or resume packet.
- Inspect repository state, recent commits, active plan, and uncommitted changes.
- Identify whether the interruption was unplanned, approval-gated, user-directed, or an explicit stop/pause/cancel.
- Reconstruct the next safe action and any running or stale agent assignments.
- Update the task note when the work is long-running or multi-agent.

Do not ask the product owner to restate recoverable context.

## 1. Frame

Produce a short internal task frame:

- Goal: what user-visible or project-visible outcome is required?
- Scope: what files, systems, workflows, or personas are likely involved?
- Constraints: what did the user explicitly require or forbid?
- Risk: what could break, leak data, waste time, or create rework?
- Done when: what must be true before final response?

For fuzzy product requests, use the knowledge ingestion process before implementation.

## 2. Gather

Inspect the minimum context needed to make a good decision:

- `AGENTS.md`, this framework, and project-specific docs.
- Existing implementation patterns and nearby tests.
- Decision records that could constrain the change.
- Product brief, glossary, assumptions, and task notes.
- Current external facts when the request depends on recent, legal, financial, security, product, API, or pricing information.

Stop gathering when additional context is unlikely to change the next action. Record missing but important context in assumptions rather than blocking unnecessarily.

## 3. Choose

Pick the work mode:

| Mode | Use When | Output |
| --- | --- | --- |
| Direct change | Scope is clear and low risk | Patch plus verification |
| Discovery | Goal is clear but implementation surface is unknown | Findings plus plan or patch |
| Product clarification | Outcome, user, or acceptance criteria are ambiguous | Product brief or task brief |
| Architecture decision | The change is hard to reverse or affects quality attributes | Decision record |
| Spike | Feasibility is uncertain and a cheap experiment reduces risk | Notes, recommendation, discarded code unless useful |
| Multi-agent decomposition | Work can be split into independent research or implementation lanes | Agent briefs, integration plan, verification |

Default to the simplest mode that can finish the task safely.

## 4. Plan

For small tasks, the plan can be one sentence. For substantial work, create a checklist with:

- Ordered implementation steps.
- Verification steps.
- Documentation or decision-log updates.
- Explicit non-goals.
- Handoff boundaries if using multiple agents.
- Resume packet updates for long-running or multi-agent work.

Plans are working tools. Update them when evidence changes.

## 5. Execute

Work in narrow increments:

- Preserve existing conventions unless a decision record justifies a change.
- Keep unrelated refactors separate from behavior changes.
- Prefer simple, boring implementations that can be verified.
- Add or update tests with the production change when practical.
- Update user-facing docs, product docs, or standards when behavior changes.
- Avoid irreversible actions unless the user requested them or the repository process clearly allows them.

## 6. Verify

Verification must match risk:

- Low-risk docs or config: lint, link check, or careful read-through.
- Code behavior: relevant unit, integration, type, lint, and build checks.
- UI behavior: run the app and inspect key viewports or states.
- Data migrations: test forward path, rollback path, and representative data.
- Security-sensitive work: run the security checklist in [quality-system.md](quality-system.md).
- Agent/process changes: run a consistency check against this framework.

If a check cannot run, record why and what residual risk remains.

## 7. Record

Update durable knowledge while the context is fresh:

- Decision record for significant product, architecture, dependency, process, or policy choices.
- `readme/assumptions.md` for unresolved assumptions and validation plans.
- Product brief or glossary for durable domain knowledge.
- Task notes for multi-step efforts that may resume later.
- Standards or framework docs when a new rule prevents likely repeat mistakes.

Do not record transient tool output unless it explains a durable choice.

## 8. Improve

After verification, ask:

- Did the agent need information that should have been easier to find?
- Did ambiguity cause avoidable delay or rework?
- Did a check catch something that should become a standard gate?
- Did user feedback reveal a wrong default?
- Did the framework create unnecessary ceremony?

Patch the relevant markdown file when the answer implies future value. Prefer small improvements tied to observed evidence.

## Clarification Window

When a task starts with a product owner available:

- Ask at most three high-value questions.
- Ask only questions that change implementation or acceptance criteria.
- Time-box the interview if the user set a window.
- After the window, continue with explicit assumptions.

After the window closes, do not stop for additional input unless continuing would risk data loss, security exposure, legal harm, or direct contradiction of user intent.

## Completion Criteria

A task is complete when:

- The requested outcome is implemented or the blocker is proven.
- Relevant checks ran or residual risk is stated.
- Durable knowledge was updated where needed.
- The final response states what changed, how it was verified, and any remaining risk.
