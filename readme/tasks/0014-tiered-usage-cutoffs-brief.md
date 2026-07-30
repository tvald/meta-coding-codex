# Tiered Usage Capacity Cutoffs

## Goal

Generalize the capacity guard to every advertised usage window and apply tiered cutoffs
(95% five-hour, 98% weekly, 99% monthly) so long-window quota is usable to near its limit
while still preventing an accidental hard-limit hit that would terminate the orchestrator.

## Background

The guard read only five-hour and weekly windows at a flat 95%, but the shipped quota
skills now surface monthly and model-scoped windows and treat model-scoped windows as
binding. The flat 95% both ignored those windows and wastefully reserved large weekly and
monthly quota. This closes the item deferred in Decision 0014.

## Scope

In scope:

- The guard in `readme/meta/agent-definitions.md`, the `readme/meta/resumption-protocol.md`
  capacity-wait trigger, and the `readme/meta/templates/task-notes.md` usage rows.
- Decision, quality, task, changelog, and cursor records.

Out of scope:

- Skill telemetry changes; the skills already report the windows and defer to the guard.
- Any dynamic or per-burn margin.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Orchestrator | Gate child work on usage | Threshold each advertised window at its tiered cutoff |
| Framework adopter | Receive the guard on install | Get a policy consistent with the shipped skills |

## Acceptance Criteria

- [x] The guard reads and thresholds five-hour, weekly, model-scoped, and monthly windows.
- [x] Cutoffs are 95% five-hour, 98% weekly (incl. model-scoped weekly), 99% monthly.
- [x] Failed, malformed, unknown, or 100% readings still pause; cutoffs apply per window.
- [x] `agent-definitions.md` stays within its 300-line budget; links remain intact.
- [x] No shipped file hardcodes a flat 95% cutoff after the change.

## Constraints

- `agent-definitions.md` owns capacity policy; skills own only telemetry.
- Keep the guard within its core-process-doc budget.

## Workflow Route

- Route: Initiative
- Why this route: A capacity-safety policy change to shipped framework files.
- Risk gate: High, because it governs quota safety for delegated work.
- Escalation trigger: A cutoff that permits an accidental hard-limit crossing.
- Next action after this task: Observe the tiers on real delegated work.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Per-interval burn exceeds a tight margin | Accidental limit hit terminates the orchestrator | Five-minute cadence, pre-spawn reads, and 100%-error immediate stop |
| A window class is missed | Unbounded delegation on that window | "Every advertised window" plus duration-group cutoff fallback |
| Guard exceeds its budget | Doc-hygiene drift | Compress prose; move rationale to the decision record |

## Verification Plan

- Automated checks: Line budgets, Markdown link integrity, and packaging inventory
  unchanged.
- Manual checks: Confirm no shipped file hardcodes 95%; confirm skills defer to the guard.

## Done When

- All acceptance criteria and required checks pass and the change is committed locally.
