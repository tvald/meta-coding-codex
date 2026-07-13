# Quality Record: Quota-Aware Subagent Control

- Date: 2026-07-13
- Change: Add portable usage monitoring, suspension, reset waiting, and resumption rules.
- Route: Initiative
- Risk: High, because agent instructions, resource exhaustion, and worker lifecycle are
  trust and reliability surfaces.
- Owner or reviewer: Root Orchestrator applying architecture, QA, security, and
  documentation review lenses.

## Scope And Criteria

- User-visible outcome: Delegated work preserves integration capacity without requiring
  the product owner to watch provider limits or manually restart workers.
- In scope: Both requested windows, the 95% boundary, missing-meter behavior, worker
  checkpoints, timer/poll choice, fresh-read resumption, and durable records.
- Non-goals: Runtime code, dependencies, provider-specific configuration, or changing
  the limits themselves.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Both windows are monitored before and during delegated work | Canonical-policy and scenario review | Before spawn/resume, after results, and five-minute active cadence are explicit | Pass |
| Delegation suspends at either 95% cutoff or unknown capacity | Boundary and missing-meter scenarios | Inclusive either-window cutoff and conservative unknown state passed | Pass |
| Wait uses a reliable reset timer or five-minute polling | Timer/poll scenario review | Latest limiting reset is preferred; polling fallback passed | Pass |
| Resume requires fresh safe readings for both windows | Dual-window reset scenario | Wake-up is non-authoritative and either unsafe/unknown window continues the wait | Pass |
| Framework remains portable and internally consistent | Link, budget, boundary, and diff checks | Markdown-only core, links, budgets, template count, and diff checks passed | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Direct user instruction supplies the threshold, windows, and resume outcome |
| Architecture and project context | Yes | Agent definitions own delegation; resumption owns waits; automation owns standing authority |
| Data, security, and permissions | Yes | Read-only meter and wait controls add no external permission; conservative unknown state is specified |
| Slices and ownership | Yes | One writer owns policy and records; no child workers are needed |
| Verification and rollback | Yes | Scenario and structural checks are declared; Markdown edits are locally reversible in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Threshold, dual-window, unknown-meter, timer, poll, and resume scenarios | All seven policy assertions passed | Pass | |
| Yes | Markdown links, anchors, budgets, and portable-core boundary | 54 Markdown files passed links/anchors; all budgets, 11 templates, and Markdown-only core passed | Pass | |
| Yes | Full diff and cross-owner consistency review | Canonical owner, linked recovery/authority, decision, task, risk, learning, and state agree | Pass | |
| Yes | `git diff --check` and task-scope inspection | Whitespace check passed; 13 task-owned files contain no runtime, secret, or unrelated changes | Pass | |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: Baseline repository
  search found no quota, usage-meter, timer, or reset rule.
- Flaky result and disposition: The first scenario matcher reported three failures
  because it treated Markdown line wraps as literal spaces. Whitespace-tolerant patterns
  passed on unchanged policy; this was a test-harness false negative, not a policy flake.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Usage capacity guard | Early wording could be read as checking only the originally limiting window and did not select one timer when both windows were high | Wake at the latest limiting reset and require both current readings below 95% | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Pause at 95% of either window and resume after reset | Inclusive cutoff, wait, fresh-read, and resume rules implemented | None |
| Task brief | Capability-aware portable behavior | Timer uses native reset/wait data; polling and unknown-state fallbacks are explicit | None |
| Decisions and standards | One delegation owner and explicit standing authority | Agent definitions own the rule; automation and Decision 0006 link it | None |
| Tests and docs | Required scenarios and structural checks pass | All declared checks passed | None |
| State and assumptions | Active work and later outcome are recoverable | Task note owns capacity fields and cursor records completion | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No; this is one process behavior across its canonical
  owner, linked recovery/authority surfaces, and required durable records.
- If kept together, why: Not applicable.
- Risk not resolved by passing checks: A harness may expose no authoritative meter or
  durable wait primitive; the safe fallback pauses delegation rather than automating
  unavailable capabilities.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Create the task-scoped local commit and exercise the guard on the next
  eligible delegated task.
