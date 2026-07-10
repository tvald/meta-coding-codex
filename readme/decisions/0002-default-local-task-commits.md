# 0002: Make Local Task Commits The Default Completion Step

Status: Accepted

Date: 2026-07-10

Owners:

- Framework maintainers acting on the user's explicit request to prevent repeated
  uncommitted task delivery

Supersedes:

- [0001: Import Selected Verification And Continuity Practices](0001-import-selected-alternative-framework-practices.md), only where its scope withholds default authority for local task commits. All other parts of decision 0001 remain accepted.

Superseded by:

- None

## Context

The agent twice reported repository-editing work complete without committing its task
changes. In the latest occurrence, the new human-facing `README.md` was verified and
reported as complete while it remained untracked. The user had to request a correction,
which produced commit `0d7ecd8`, and then explicitly asked the framework to ensure the
failure does not recur.

Existing guidance required logically scoped commits and required framework changes to
be committed, but the root completion criteria did not include a commit and the
automation policy did not authorize routine local task commits. Decision 0001 also
stated that its imported controls did not themselves authorize commits. The combined
guidance therefore allowed an agent to treat verified but uncommitted work as complete.

## Decision

After a task changes files in a Git repository and completes its implementation and
verification, the agent will create a local commit containing only task-owned changes
without asking for separate approval. Before committing, it will inspect the working
diff, stage through explicit task-scoped selection, and inspect the staged diff. After
committing, it will confirm `HEAD` and repository status and include the commit hash in
the final response.

The default does not apply when the user explicitly opts out, repository instructions
prohibit commits, the work is outside a Git repository, or a concrete technical or
safety blocker prevents a clean task-scoped commit. In those cases, or whenever a
task-owned change remains uncommitted, the agent must name the affected files and exact
reason rather than claim complete delivery.

This decision authorizes only new local task commits. It does not authorize amend,
rebase, reset, branch creation or switching, push, release, deployment, history rewrite,
or inclusion of unrelated changes.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Keep commits opt-in | Preserves the narrowest Git authority | Repeats the observed failure and requires user reminders | Rejected |
| Remind agents in final-response guidance only | Very small context cost | Does not authorize the action or make it a completion condition | Rejected |
| Require a scoped local commit with explicit boundaries | Prevents the omission while preserving unrelated work and publication controls | Adds a local side effect and a short completion step | Accepted |
| Automatically commit and push | Produces a remote handoff | Expands authority into publishing and remote side effects | Rejected |

## Consequences

Positive:

- Completed repository work has a durable, inspectable handoff by default.
- The product owner no longer needs to remind agents to commit routine task changes.
- Explicit staging and staged-diff inspection reduce the risk of capturing unrelated
  work or unwanted material.
- Final responses provide a commit hash as concrete completion evidence.

Negative:

- Tasks produce local commits unless the user or repository opts out.
- Agents must isolate task changes carefully in dirty or shared worktrees.
- Commit hooks, signing, identity, or repository policy can turn an otherwise completed
  implementation into a reported blocker.

Neutral or follow-up:

- Pushes, releases, deployments, branch operations, and history rewrites retain their
  existing approval boundaries.
- Read-only tasks and work outside Git repositories do not create commits.

## Confidence

Confidence: High

Why:

The failure was observed repeatedly, the user explicitly requested a durable fix, and
the new behavior is local, reversible, independently verifiable, and bounded against
the main shared-worktree and publication risks.

## Review Trigger

Revisit this decision when:

- a task commit includes unrelated user or concurrent-agent changes;
- commit blockers recur often enough to disrupt otherwise completed work;
- the default conflicts with established repository-specific contribution workflows;
- routine tasks produce disproportionate or low-value commit churn; or
- the user changes the desired default.

## Sources

- User feedback dated 2026-07-10 that the agent had again failed to commit changes.
- User instruction dated 2026-07-10 to ensure the failure does not recur.
- Corrective commit `0d7ecd8`, created only after the user identified the omission.
- Framework Judge report dated 2026-07-10: Adopt, 95/100.
