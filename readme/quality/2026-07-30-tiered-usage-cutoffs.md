# Quality Record: Tiered Usage Capacity Cutoffs

- Date: 2026-07-30
- Change: Generalize the capacity guard to every advertised window and apply tiered
  cutoffs (95% five-hour, 98% weekly, 99% monthly).
- Route: Initiative
- Risk: High, because the guard governs quota safety for delegated work and a wrong margin
  can terminate the orchestrator.
- Owner or reviewer: Root Orchestrator.

## Scope And Criteria

- User-visible outcome: Long-window quota is usable to near its limit while an accidental
  hard-limit hit is still prevented, and the guard matches the windows its skills report.
- In scope: The guard, the resumption capacity-wait trigger, and the task-notes template.
- Non-goals: Skill telemetry changes and any dynamic per-burn margin.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Guard thresholds every advertised window | Guard text review | Five-hour, weekly, model-scoped, and monthly windows are covered | Pass |
| Tiered cutoffs applied per duration group | Guard text review | 95% five-hour, 98% weekly (incl. model-scoped), 99% monthly | Pass |
| No shipped file hardcodes a flat 95% | Repository grep | Only tiered references remain; skills defer to the guard | Pass |
| Guard stays within budget and links intact | `wc -l` and link check | `agent-definitions.md` 300/300; 0 broken links | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Product owner directed tiered cutoffs and the rationale |
| Architecture and project context | Yes | Guard owns policy; skills own telemetry and already report the windows |
| Verification and rollback | Yes | Text-only policy change, removable in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | `agent-definitions.md` budget | 300 lines after compression (was 301) | Pass | |
| Yes | Grep for hardcoded 95% across shipped files | Only tiered wording remains | Pass | |
| Yes | Markdown link integrity across `readme/` | 0 broken | Pass | |
| Yes | Packer/installer inventory unchanged | Inventories still agree | Pass | |

- Criteria or methods amended after implementation began: None.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Low | `agent-definitions.md` budget | The earlier guard-pointer edit had left the doc at 301, 1 over its 300 default | Compress the guard to 300 and note core-doc budgets in future hygiene passes | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Tiered cutoffs; avoid wasting weekly/monthly quota | Guard applies 95/98/99 per window | None |
| Decision 0014 | Monthly and tiered cutoffs deferred | Decision 0015 closes the deferral | None |
| Shipped skills | Report monthly and model-scoped windows | Guard now thresholds them | None |
| Resumption and template | Reflect the guard's window model | Capacity-wait trigger and task-notes rows generalized | None |

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Commit and observe the tiers on the next delegated work.
