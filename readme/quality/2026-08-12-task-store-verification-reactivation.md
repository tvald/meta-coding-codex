# Quality Record: Task-Store Verification Reactivation

- Date: 2026-08-12
- Change: T-0034 direct reactivation after a runnable verification check finds a defect
- Route: Quick change
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Reviewer and QA gates

## Scope And Criteria

- User-visible outcome: a `Needs verification` task can return directly to `Active`
  when its formerly unavailable required check runs and exposes an implementation defect.
- In scope: checkpoint transition validation, source and installed CLI regression coverage,
  lifecycle/recovery guidance, package evidence, and framework-source change history.
- Non-goals: changing what qualifies for `Needs verification`, reopening terminal tasks,
  allowing general checkpoint-to-`Active` transitions, or changing task selection and
  approval semantics.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| `checkpoint --status active` changes only a `Needs verification` task to `Active`, increments `recordVersion`, preserves `taskRevision` and gate evidence, and records the supplied next action | Focused source CLI regression | Allowed transition requires current record/store CAS and an explicit next action; preserved fields passed with a granted approval | Pass |
| Other lifecycle states cannot use checkpoint to enter or remain `Active` | Focused negative transition matrix | Pending, Ready, Active, Parked, Blocked, and terminal attempts returned `TRANSITION_INVALID` | Pass |
| Pause, dependency, approval, one-Active-task, CAS, atomic-write, and package/client boundaries remain fail closed | Existing adversarial suites plus focused conflict fixtures | Missing/stale CAS and next-action inputs, pause, competing Active, and every other status failed with byte-identical target records; full adversarial suite passed | Pass |
| Installed clients expose the same reactivation behavior through the package CLI | Packed-client integration regression | Packed task CLI 1.1.0 reactivated, rechecked, and closed the fixture; same-state Active attempt failed | Pass |
| Canonical lifecycle and recovery guidance describe pass, unavailable, and defect outcomes without making another status owner | Documentation consistency and link checks | Knowledge management owns the lifecycle; root/recovery surfaces link or project it; doctor inspected 280 local links | Pass |
| The complete framework/package regression set remains green | Full test, package audit, doctor, and diff checks | Task CLI contract advanced to 1.1.0; 105 tests passed; 55-file reproducible audit, doctor, budgets, links, and diff check passed | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0034 and the observed T-0033 `ARGUMENT_INVALID` identify one missing nonterminal transition |
| Architecture and project context | Yes | Decision 0018 already assigns transition authority to the CLI and requires at most one `Active` task |
| Data, security, and permissions | Concern | A bad transition could create concurrent primaries or bypass a gate; retain whole-store validation and add negative tests |
| Slices and ownership | Yes | One integrated CLI/test/documentation change; independent Reviewer receives the frozen diff |
| Verification and rollback | Yes | Focused counterfactual, source/packed tests, full suite, package audit, doctor, and a one-commit Git revert are available |

Readiness verdict: Ready with concerns. The concern is bounded by preserving the current
store validator as the final authority and testing both allowed and rejected transitions.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused source CLI lifecycle tests | One targeted test passed, including the complete nonterminal/terminal negative matrix and state conflicts | Pass | — |
| Yes | Installed package task CLI tests | Targeted packed-client test passed | Pass | — |
| Yes | Full Node test suite | `npm test`: 105 passed, 0 failed | Pass | — |
| Yes | Reproducible package audit | 55 files, 153215 bytes, SHA-256 `ea2566ddcd88e611c76b2e2d94a887d9da81ec7217e561abd90fd41c9301aaf1` | Pass | — |
| Yes | Task-store doctor and documentation checks | Store valid; all integrated checks, 280 local links, budgets, changelog, and `git diff --check` passed | Pass | — |
| Yes | Independent Reviewer and QA gates | Initial gates found global-CAS and next-action defects; corrected candidate repeats passed with no behavioral findings | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: before the CLI change,
  the focused regression failed because `checkpoint --status active` returned
  `ARGUMENT_INVALID` as observed in T-0033; it passed after the narrow transition fix.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Active reactivation global CAS | Checkpoint used global pause/primary state without a caller-bound store digest | Require, validate, and propagate `--expected-store-digest`; add stale-store source and packed negatives | Resolved and independently confirmed |
| Medium | Active reactivation next action | Omitted input preserved the stale verification action | Require an explicit `--next-safe-action` and test byte-identical refusal | Resolved and independently confirmed |
| Advisory | Committed transition coverage | Approval, stale CAS, all terminal variants, and several unchanged-byte claims relied on ad hoc QA probes | Encode them in the focused source and packed-client regressions | Resolved and independently confirmed |
| Advisory | T-0034 next action | Structured next action still described the completed counterfactual step | Reconcile it when closing the task | Resolved by close mutation |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Resolve T-0034 lifecycle gap | Direct guarded reactivation is implemented and verified | None |
| Decision 0018 | CLI owns transitions; one `Active` task; task revision remains semantic | CLI and store validator preserve those boundaries | None |
| Knowledge-management lifecycle | `Needs verification` owns unavailable required checks | Pass/unavailable/defect outcomes now have one canonical lifecycle rule | None |
| Tests and docs | Source and installed behavior agree | Focused and packed regressions plus complete suite pass; runtime/manifest report task CLI 1.1.0 | None |
| State and assumptions | T-0034 is the sole selected task | T-0034@r2 remains the unique Active task and both independent repeats passed | Close Done through the CLI |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: Not applicable.
- Risk not resolved by passing checks: the CLI cannot authenticate the caller or decide
  whether a reported verification defect is genuine; Root policy remains that authority.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: close T-0034 Done and create the required scoped local commit.
