# Threat Model: Quota-Aware Subagent Control

## Scope

- Change: Usage-aware child-worker suspension, waiting, and resumption policy.
- Assets or data: Provider capacity, integration ability, partial worker output,
  repository integrity, task continuity, and usage/reset metadata.
- Users, systems, or agents involved: Product owner, Root Orchestrator, child workers,
  harness usage meter, wait/timer facility, and Git-backed project state.
- Trust boundaries: Provider telemetry versus agent inference; root lifecycle control
  versus child work; volatile timers versus durable repository checkpoints.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Stale meter lets workers cross the cutoff | Capacity exhausts before integration | Medium | Three-worker WIP cap | No usage cadence or threshold |
| Missing telemetry is treated as safe | Delegation consumes unknown remaining capacity | Medium | Escalate concrete blockers | No conservative capacity state |
| Timer wake is mistaken for proof of reset | Workers resume while a limit still applies | Medium | Resume checks inspect repository state | Usage is not part of resume verification |
| One window resets while the other remains high | Work immediately pauses or exhausts weekly capacity | Medium | None | Both windows are not jointly gated |
| Suspension discards or duplicates partial work | Conflicting edits and wasted capacity | Low | Worker handoff and roster | Quota wait is not a recovery type |
| Usage metadata is copied into noisy logs | Account details spread through repository history | Low | Store only durable facts | No minimization rule for readings |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Check authoritative usage before spawn/resume and every five minutes while children run | Root Orchestrator | Cadence scenario | Done |
| Pause delegation at either 95% boundary or when a required reading is unknown | Root Orchestrator | Boundary and missing-meter scenarios | Done |
| Checkpoint workers and minimal meter/reset state before waiting | Root Orchestrator | Task-note and recovery review | Done |
| Use the latest limiting reset only as a wake-up; re-read both windows before resuming | Root Orchestrator | Timer and dual-window scenarios | Done |
| Poll every five minutes when a reliable reset timer is unavailable | Root Orchestrator | Fallback scenario | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Only the trusted harness usage surface,
  not task content or external pages, determines the threshold state.
- Tool permission risk: Reading usage, waiting, suspending, and resuming workers must not
  widen the parent or child authority.
- Dependency, script, or generated-code risk: No executable code, dependency, hook, or
  generated configuration is introduced.
- Secret or sensitive-data exposure risk: Record only percentages, reset time, limiting
  window, and wake plan needed for recovery; do not persist account identifiers or raw
  billing data.
- CI/CD or deployment permission risk: None; the policy controls agent lifecycle only.

## Residual Risk

- Accepted risk: A framework cannot manufacture telemetry or a durable wait facility a
  harness does not provide. Conservative suspension preserves capacity but may delay
  work, and a five-minute poll may resume shortly after rather than exactly at reset.
- Approval or decision record: [Decision 0006](../decisions/0006-guard-subagent-usage-capacity.md).
- Review trigger: A missed cutoff, premature resume, lost worker checkpoint, unavailable
  telemetry during an eligible delegated task, or a polling delay that impairs delivery.
