# Agent Adapter Pilot Notes

## Task Cursor

- Name: Add optional Codex and Claude Code agent adapters
- Started: 2026-07-10
- Last updated: 2026-07-10
- Status: Done
- Route: Initiative
- Latest user instruction: Proceed with the recommended changes.
- Goal and completion criteria: Add the Claude entrypoint bridge and three thin adapter
  pairs, preserve canonical framework ownership, update policy and packaging, pass the
  High-risk quality gate, and commit the task-owned result.
- Next safe action: None after the task-scoped commit; exercise the pilot only on an
  eligible future task.

## Plan

- [x] Frame scope, risk, acceptance criteria, and readiness.
- [x] Add the Claude bridge and six thin adapter definitions.
- [x] Update canonical policy, package guidance, and durable decision records.
- [x] Run syntax, link, package, security, consistency, and client checks.
- [x] Review and commit the task-owned change.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Entrypoint bridge | Done | Root Orchestrator | `CLAUDE.md` | Import and startup review | Exercise in eligible future task |
| Harness adapters | Done | Root Orchestrator | `.claude/agents/`, `.codex/agents/` | Schema and capability review | Track pilot evidence |
| Core and package policy | Done | Root Orchestrator | Root/meta docs and Decision 0005 | Link and consistency review | Review at pilot trigger |
| Quality and security | Done | Root Orchestrator | Quality record and threat model | High-risk gate | Review at pilot trigger |

## Repository And Verification State

- Changed files: Root entrypoints and overview; six adapter files; meta role,
  improvement, index, and reference owners; Decisions 0004/0005; task, quality, threat,
  learning, and project-state records.
- Recent commits: `9eb2e82` was `HEAD` when work began.
- Commands already run and observed results: Working tree began clean; Codex strict
  doctor passed; Taplo parsed three TOML files; js-yaml parsed three Claude frontmatters;
  Claude's agent negative control listed all three project agents; local links, package
  inventory, adapter restrictions, budgets, and three current source URLs passed their
  initial checks.
- Required checks remaining: None after the final rerun and staged-diff inspection.
- Decisions and assumptions since start: The direct user instruction accepts the
  recommended thin optional pilot; Decision 0005 owns the package-policy exception.

## Parked Approvals

None.

## Worker Roster

No child workers are used; instruction and package owners overlap and the task is small
enough for one writer.

## Attempts And Dead Ends

| Attempt | Observed Evidence | Why Abandoned | Retry Only If |
| --- | --- | --- | --- |
| Parse TOML with Python `tomllib` | `python3` is not installed | Taplo is a purpose-built parser and passed all files | Python becomes the project-standard validator |
| Inspect Claude agents interactively | Uninitialized client opened theme onboarding before the agent library | Non-interactive valid/invalid agent checks proved discovery without changing setup | Claude is initialized and an interactive UI check adds evidence |

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-10 | Framed Initiative route and High-risk gate before implementation | Task brief, readiness record, and threat model |
| 2026-07-10 | Added bridge, six adapters, canonical policy, and optional package contract | Task diff and Decision 0005 |
| 2026-07-10 | Passed initial schema, client, link, package, source, and permission checks | Quality record and command output |
| 2026-07-10 | Completed final checks, consistency review, state close, and staged-diff inspection | Quality record and task-scoped staged diff |
