# AI-Assisted Development Framework

This repository contains a portable, markdown-only framework for working with AI coding
agents. Add it to a project to give agents a consistent way to turn a request into a
focused, verified, and documented change.

The framework is an operating guide, not a runtime dependency. It does not add code to
your product or require a particular language, platform, or agent tool. Its detailed
rules live in [`AGENTS.md`](AGENTS.md) and the [`readme/`](readme/README.md) directory;
this page is the human-facing overview.

## How You Work With It

Describe the outcome you want in normal language. You do not need to choose an agent
role, select a workflow, or maintain the framework's project notes yourself.

A useful request usually includes whatever you already know about:

- the result you want;
- important context or examples;
- constraints, non-goals, or things that must not change; and
- what would convince you the work is complete.

For example:

> Fix the account export so dates use the customer's timezone. Preserve the current CSV
> columns, add a regression test, and update any affected documentation.

If some of that information is missing, the agent inspects the repository and makes
safe, reversible assumptions where it can. It asks concise questions only when an answer
would materially change the result or when proceeding could be harmful.

## What The Framework Does

For each task, the agent follows the same basic loop:

1. **Understand the goal.** It identifies the requested outcome, constraints, risks, and
   completion criteria.
2. **Gather context.** It reads relevant code, tests, documentation, decisions, and, when
   necessary, current primary sources.
3. **Choose the smallest safe path.** A small fix stays small; ambiguous, cross-cutting,
   or high-risk work receives more discovery and review.
4. **Make focused changes.** It preserves project conventions, avoids unrelated edits,
   and updates tests and documentation with the behavior they describe.
5. **Verify the result.** It runs the declared required checks, observes their results,
   and inspects the diff.
6. **Preserve useful knowledge.** It records durable decisions, assumptions, or project
   conventions when future work would benefit from them.
7. **Commit completed file changes.** In a Git repository, it creates a local commit
   containing only task-owned changes.
8. **Report clearly.** It explains what changed, what was verified, and any remaining
   risk or next action.

This loop exists so you can focus on product and engineering outcomes instead of
reminding the agent to inspect context, run tests, or keep documentation current.

## What To Expect At Different Scales

The framework deliberately avoids giving every task the same amount of ceremony.

| Situation | What you should expect |
| --- | --- |
| Small, low-risk change | A focused edit, a lightweight check, and a short result summary |
| Unclear requirement | A few high-value questions or explicit, documented assumptions |
| Existing or unfamiliar codebase | Inspection of local patterns, commands, tests, and compatibility constraints before editing |
| Hard-to-reverse choice | Options and tradeoffs recorded in a decision record before the choice becomes difficult to undo |
| Security-sensitive or production-impacting work | Deeper review, risk-specific checks, and a rollback or mitigation path |
| Long-running or interrupted work | A bounded always-read state file points to durable task notes and the reconstructed next step |

A single capable agent is the default. Specialized agents may be coordinated when the
task and available tooling justify the extra overhead, but you continue to interact with
the agent responsible for the overall outcome.

## Autonomy And Your Control

The default is for the agent to proceed with safe work inside the scope you set. This
includes reading the repository, editing relevant files, adding tests, running local
checks, researching time-sensitive facts, and maintaining useful project documentation.

After a file-changing task is verified in a Git repository, the agent normally creates
a local commit containing only the task's changes and includes its hash in the final
response. This does not authorize a push, release, deployment, branch operation, or
history rewrite. If a commit is unsafe or blocked, the agent identifies the uncommitted
files and the exact reason instead of claiming complete delivery.

The agent stops or asks before actions such as destructive data changes, irreversible
production operations, releases, external communications, charges, customer-data
changes, or consequential security and permission changes. A required approval blocks
that action, not unrelated safe work.

You can redirect the work at any time. The newest instruction takes priority. If you say
to stop, pause, wait, or cancel, the agent should halt conflicting work and preserve
enough state to resume safely later.

## What “Done” Means

A task is complete when:

- the requested outcome is implemented;
- all required runnable checks have passed;
- code, tests, documentation, and durable decisions agree where applicable;
- task-owned file changes in a Git repository are locally committed; and
- the final response tells you what changed, how it was verified, and what remains.

If a required check is genuinely impossible in the current environment, the agent
reports **Needs verification** with the exact check, reason, and unblocking condition;
it does not call the task done. If an explicit opt-out or blocker leaves task-owned
changes uncommitted, the agent
reports an uncommitted, incomplete handoff with the affected files and exact reason. It
does not describe that handoff as complete delivery.

A concrete blocker is a valid **Blocked** handoff, not a completed task.

The exact evidence depends on the change. A documentation edit may need only a careful
read-through and link check. A behavior change may need tests, linting, type checks, a
build, or manual inspection. High-risk work receives security, rollback, and operational
readiness checks as appropriate.

## Project Memory Without Babysitting

Every session begins from a small `readme/state.md` containing the current focus, next
action, parked approvals, relevant dead ends, and recent outcomes. As a project grows,
agents create and maintain only records that carry useful detail: a product brief,
technical project context, open assumptions, decisions, retrospective signals, and
resumable task notes. Empty process files are not created just to satisfy a checklist.

This repository-based memory helps a new or returning agent recover context from the
project itself. You remain the authority on goals and consequential choices, but you are
not expected to act as the framework's note-taker.

## Add It To A Project

1. Copy [`AGENTS.md`](AGENTS.md) and the [`readme/`](readme/README.md) directory into the
   project, merging with any existing project instructions rather than discarding them.
2. Clear copied project-specific state, then ask the agent to run the onboarding
   procedure.
3. The agent inventories the project, executes candidate build/test/lint/run commands,
   records successful commands in `readme/standards.md`, and seeds useful project state.
4. Give the agent a real goal. It creates further records only when work needs them.

For the complete process, file map, and templates, see the
[`readme/README.md`](readme/README.md) framework index.
