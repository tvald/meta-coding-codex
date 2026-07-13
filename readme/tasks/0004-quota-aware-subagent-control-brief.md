# Quota-Aware Subagent Control

## Goal

Make the framework preserve enough five-hour and weekly capacity for safe integration by
suspending delegated work at 95% consumption and resuming it automatically after the
applicable usage window resets.

## Background

The product owner directly requested durable usage monitoring, subagent suspension, and
automatic resumption. The framework already owns worker recovery and durable task state,
but it has no capacity guard or reset-wait behavior.

## Scope

In scope:

- Root-orchestrator checks of authoritative five-hour and weekly usage telemetry.
- A 95%-consumed delegation cutoff, conservative behavior when telemetry is unavailable,
  durable worker checkpoints, reset-aligned timers or five-minute polling, and verified
  resumption.
- Canonical delegation, automation, resumption, task-note, decision, risk, quality,
  learning, and project-state records.

Out of scope:

- Executable daemons, new dependencies, vendor-specific APIs, fabricated telemetry, or
  changes to provider limits.
- Suspending unrelated external systems or bypassing a provider-enforced limit.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Orchestrator | Coordinate delegated work | Meter both windows before and during delegation; checkpoint and pause at the cutoff |
| Child worker | Perform a bounded assignment | Suspend at a safe boundary and later continue from its durable handoff |
| Product owner | Leave long-running work unattended | Work waits and resumes without manual quota babysitting |

## Acceptance Criteria

- [x] The Root Orchestrator checks both usage windows before spawn/resume and at least
      every five minutes while a child is active.
- [x] At 95% or greater consumption in either window, no child starts or resumes, active
      children checkpoint and suspend, and task state records the meter and wake plan.
- [x] Missing required telemetry produces the same conservative delegation pause.
- [x] A reliable reset timestamp drives a wake-up timer; otherwise usage is polled every
      five minutes.
- [x] Timer or poll wake-up is followed by a fresh reading, and delegation resumes only
      after both windows are below 95%.
- [x] The portable core remains Markdown-only and required consistency checks pass.

## Constraints

- `readme/meta/agent-definitions.md` remains the canonical owner for delegation policy.
- Runtime behavior must be capability-aware because the framework does not own provider
  telemetry or timers.
- A capacity wait is an operational pause, not a completed or blocked task.

## Workflow Route

- Route: Initiative
- Why this route: The change crosses delegation, interruption recovery, standing
  authority, durable task state, and agent-instruction trust boundaries.
- Risk gate: High
- Upstream artifacts required: Agent definitions, automation policy, resumption
  protocol, task-note template, framework-improvement policy, and project cursor.
- Escalation trigger: Compliance would require executable runtime code, provider access
  not exposed by the harness, or a permission expansion.
- Next action after this task: Exercise the rule on the next delegated task whose usage
  reaches the cutoff.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale or absent telemetry allows quota exhaustion | Integration cannot complete | Require authoritative readings; pause delegation when unknown |
| Timer fires before the provider resets usage | Work resumes too early | Treat wake-up as a prompt to re-read both windows |
| Weekly usage remains high after the five-hour reset | Child work immediately exhausts capacity | Resume only when both windows are below 95% |
| Suspension loses partial work | Duplicate or conflicting edits | Require safe-boundary handoff and durable worker roster before waiting |
| Frequent polling consumes capacity | The guard accelerates exhaustion | Prefer one reset-aligned timer; poll only when it is more reliable |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| A supporting harness can expose authoritative consumption and reset data | Medium | Capability check at each delegation cycle; unknown telemetry triggers suspension |
| Five-minute polling is sufficiently prompt when no durable timer exists | Medium | Revisit after a missed or excessively delayed reset |

## Verification Plan

- Automated checks: Local Markdown links and anchors, artifact line budgets, whitespace,
  prohibited runtime-file additions, and Git diff checks.
- Manual checks: Threshold boundary, dual-window, missing-meter, timer wake-up, polling,
  worker checkpoint, and resume scenarios; ownership and completion-status consistency.
- Documentation checks: Decision, canonical process owners, task template, changelog,
  retrospective, threat model, quality record, and project cursor agree.
- Baseline or counterfactual evidence for new regression/behavior tests: Current
  framework search finds worker suspension only for user stops and no usage, quota,
  timer, or reset guard.
- Amendments after implementation starts, with reason and impact: None.

## Done When

- The acceptance criteria and required checks pass, durable records are consistent, and
  the task-owned changes are committed locally.
