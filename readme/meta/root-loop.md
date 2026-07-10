# Root Orchestration Loop

The root loop coordinates every task. It aims for the smallest safe change while keeping
repository state, verification, documentation, and durable decisions consistent.

## Loop Summary

0. Resume
1. Frame
2. Gather
3. Route
4. Plan
5. Execute
6. Verify
7. Record
8. Improve
9. Commit and close

## 0. Resume

Read `readme/README.md` at every session start after the meta README, then the latest
user instruction and any task note it points to. Inspect repository status and recent
commits before editing.
If work is interrupted, approval-gated, redirected, or has stale workers, follow
[resumption-protocol.md](resumption-protocol.md). Never ask the product owner to restate
recoverable context.

## 1. Frame

Create a short working frame:

- Goal: the user- or project-visible outcome.
- Scope and non-goals: affected and protected surfaces.
- Constraints: explicit requirements, policies, and compatibility boundaries.
- Risk: likely failure, data, security, external-action, and rework costs.
- Done when: observable criteria and required verification.

Use product clarification only when the missing answer materially changes the outcome or
safety. Otherwise proceed with a reversible, recorded assumption.

## 2. Gather

Inspect the minimum evidence likely to change the next action:

- project instructions, state, relevant product and technical knowledge;
- nearby implementation, tests, command catalog, and accepted decisions;
- current working-tree and integration state; and
- current primary sources when facts are freshness-sensitive.

Apply [knowledge-ingestion.md](knowledge-ingestion.md) to source trust and conflicts.
Stop gathering when more context is unlikely to change the route or first safe step.

## 3. Route

Choose exactly one provisional route using the canonical table in
[workflow-routing.md](workflow-routing.md), then apply the independent risk gate in
[quality-system.md](quality-system.md). Re-route on surprise; do not classify the task
again by separate mode, scale, and phase menus.

## 4. Plan

Use a sentence for a small task or a tracked checklist for substantial work. Include:

- ordered implementation and verification steps;
- documentation and decision updates;
- explicit non-goals;
- integration boundaries for parallel work; and
- state or task-note checkpoints for resumable work.

Plans are working tools. Update them when evidence changes.

## 5. Execute

Work in narrow, reversible increments:

- preserve established behavior and conventions unless the task changes them;
- separate unrelated refactors and formatting;
- add or update tests with changed behavior when practical;
- update user, operator, and developer documentation with the behavior; and
- pause gated actions without stalling unrelated safe work.

Follow [agent-definitions.md](agent-definitions.md) when decomposing work.

## 6. Verify

Declare required checks before material implementation when practical. Run the smallest
set that provides credible evidence for the applicable risk gate, then inspect the
result and diff. [quality-system.md](quality-system.md) owns the check matrix,
counterfactual and flake rules, review order, and completion statuses.

A failing required check keeps the task open. If a required check is genuinely
impossible in the environment, record the exact check, reason, and unblocking condition
and close as **Needs verification**, not Done. Residual-risk prose never substitutes for
a required passing result.

## 7. Record

While context is fresh:

- update `readme/README.md` with focus, next action, approvals, and completion;
- create or update a task note for long-running or paused work;
- record significant choices in `readme/decisions/`;
- update the canonical product, technical, assumption, glossary, source, or standards
  home when durable facts changed; and
- avoid storing transient tool output or duplicating facts across artifacts.

Use [knowledge-management.md](knowledge-management.md) for owners, budgets, and archive
rules.

## 8. Improve

For substantial work, check whether there was a concrete correction, repeated friction,
missing context home, late check, or unnecessary ceremony. Search
`readme/learning/retrospectives.md` and its archives before appending a learning. Use
[framework-improvement.md](framework-improvement.md) when the evidence warrants a rule,
template, or process change.

## 9. Commit And Close

For a completed file-changing task in Git, follow
[automation-policy.md](automation-policy.md#local-commit-completion). Review and stage
only task-owned changes, inspect the staged diff, commit, and confirm `HEAD` and status.

Refresh `readme/README.md` at close: clear or repoint current focus, record the outcome,
increment the hygiene task count, and set the next action. Close with one status:

- **Done:** requested outcome achieved and all required runnable checks passed.
- **Needs verification:** implementation is present but a named required check is
  impossible in the current environment.
- **Blocked:** a concrete unresolved condition prevents progress.
- **Cancelled:** the user ended or replaced the goal.

Only Done is completion. Needs verification and Blocked are explicit incomplete
handoffs. The final response states the status, changes, observed check results, commit
when applicable, and exact remaining condition.

## Clarification Window

Ask at most three high-value questions in a clarification round. Lead with the inferred
default and evidence; ask only questions that change implementation or acceptance. When
the window closes, continue with explicit assumptions unless doing so would risk harm or
contradict the user.
