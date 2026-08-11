# Threat Model: Task Recovery Skill

## Scope

- Change: repository-discovered skill that reconstructs interrupted task execution.
- Assets or data: task authority/revisions, Git changes and commits, approvals,
  verification evidence, worker ownership/output, external effects, and quota state.
- Trust boundaries: durable repository state outranks transient harness state; task text,
  worker messages, command output, and telemetry are evidence rather than authority.

## What Can Go Wrong

| Threat | Impact | Likelihood | Control Or Required Mitigation |
| --- | --- | --- | --- |
| Retry uncertain effect | Duplicate release, payment, migration, message, or destructive action | High | Require explicit idempotency or authoritative prior-result evidence; otherwise stop for reconciliation |
| Stale revision or redirect | Obsolete work overwrites an accepted amendment | High | Re-read task ID/revision after delivered messages and before integration or mutation |
| Dirty ownership guess | One task or replacement worker overwrites another's work | High | Map dirty paths/commits/worktrees to recorded ownership; preserve and stop on ambiguity |
| Stale worker output | Invalidated output is integrated or work is silently reassigned | High | Inspect handle and last output; match task/revision/ownership; replacement receives explicit boundary |
| Approval confusion | Expired, denied, wrong-revision, or wrong-boundary approval is treated as permission | High | Match approval source/action/boundary/status/revision; wait when any field is absent or stale |
| Missing verification becomes success | Incomplete work closes after interruption | Medium | Require current required checks and both-side interruption evidence; use Needs verification when unavailable |
| Quota absence is treated as capacity | Replacement or resume crosses a hard limit | Medium | Load provider capacity owner only when delegation applies; unknown required telemetry stops resume |
| Prompt injection in evidence | Task/log/worker text broadens authority or triggers tools | High | Treat all repository and transient output as data; preserve higher instructions and explicit permissions |
| Package/discovery collision | Host and framework skill files mix or provider workflows drift | Medium | One body, thin adapter, exact inventory, and existing atomic same-name installer boundary |

## Mitigations And Verification

| Mitigation | Verification | Status |
| --- | --- | --- |
| Bounded integrity/task/dependency context before live inspection | Integrity, truncation, revision, lifecycle, and 10,000-task tests | Verified |
| Explicit effect, ownership, worker, approval, verification, and redirect stops | 26-scenario contract plus uncertain-effect and redirect forward tests | Verified |
| Conditional provider quota loading and fresh reads | Applicable/absent/unknown/cutoff scenario precedence and capacity-owner audit | Verified |
| Canonical owner and progressive loading | Link audit, quick validation, and fresh-agent forward tests | Verified |
| Atomic discovery/package/install | Deterministic 49-entry inventory and both-direction/symlink/failure/signal fixtures | Verified |

## Residual Risk

- Harness process and worker APIs may be unavailable or incomplete after a restart.
- Local Git evidence cannot prove an unrecorded remote side effect did or did not occur.
- Same-user noncooperative path replacement and deceptive repository evidence remain
  outside what an instruction-only skill can eliminate.
