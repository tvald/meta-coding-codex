# Quality Record: Task-Store Architecture Boundary

- Date: 2026-08-13
- Change: T-0045 application/domain, TaskStore, and repository contracts
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with Implementer and independent Reviewer

## Scope And Criteria

- User-visible outcome: storage mechanics can be replaced without moving lifecycle,
  authority, or repository-document rules into an adapter.
- In scope: pure domain rules, deterministic semantic planners, the adapter-neutral
  TaskStore protocol, repository integration contracts, package inventory, and tests.
- Non-goals: routing the production CLI, changing FileTaskStore mechanics, selecting a
  backend, or implementing SQLite.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Existing lifecycle and global invariants have one pure domain owner | Extract prior store helpers and run legacy plus focused suites | Store imports and re-exports the extracted rules; 43/43 tests passed | Pass |
| Every semantic mutation produces a deterministic immutable change set | Exercise add, amend, dependencies, approval, select, checkpoint, close, pause, and resume twice | All planners returned equal frozen plans with selective preconditions | Pass |
| TaskStore is backend-neutral and binds publication to one immutable store | Closed-shape validation and cross-store negative test | Protocol contains no path, Git, SQL, lock, or digest concepts; mismatched `storeId` fails | Pass |
| Adapter failures expose stable public categories only | Contaminate a known error code with backend text and exit status | Normalization rebuilt the canonical message and exit code | Pass |
| Repository evidence stays outside persistence without weakening context bounds | Validate conflict and all-narrative resolution contracts | Requests carry a byte budget; every narrative reports source/emitted bytes and truncation | Pass |
| Packaged clients receive the complete runtime boundary | Exact package audit and installed-client suites | 59-file package was reproducible; 20/20 package and task-CLI tests passed | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Decision 0024 and T-0045 define extraction without production rerouting |
| Architecture and project context | Yes | Characterization and narrative-boundary predecessors are Done |
| Data, security, and permissions | Yes | Contracts accept closed bounded data and preserve authority outside adapters |
| Slices and ownership | Yes | Implementer owned runtime/tests; Root owned package/docs/state; Reviewer was read-only |
| Verification and rollback | Yes | Existing file engine remains the production path and the patch is one local commit |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Architecture plus framework-data suites | 43 passed, 0 failed | Pass | — |
| Yes | Package and installed task-CLI suites | 20 passed, 0 failed | Pass | — |
| Yes | Reproducible package audit | 59 files, 160842 bytes, SHA-256 `2cdca8fc26425138b7b39b1a7bee559990899c383979529a7f30bab4d7d1ea7c` | Pass | — |
| Yes | Syntax and diff checks | All affected runtime modules parsed; diff check passed | Pass | — |
| Yes | Independent Reviewer | Initial two blockers and one integration risk fixed; re-review Adopt | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: the
  Reviewer required explicit store-identity binding, canonical reconstruction of known
  adapter errors, and current narrative truncation semantics; all became focused tests.
- Counterfactual evidence for new behavior tests: the first draft accepted a change set
  from another store with matching versions and retained contaminated error messages;
  the Reviewer reproduced both before the fixes.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | TaskStore publication | Change sets were not bound to immutable store identity | Carry and verify `storeId` on change sets and receipts | Resolved |
| Medium | Error normalization | Known codes retained adapter messages and exit codes | Rebuild all known errors from canonical definitions | Resolved |
| Low | Narrative resolution | Initial contract could reject a valid large narrative | Preserve source/emitted sizes and bounded truncation for every requested detail | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Reach SQLite through an incremental generalized store boundary | T-0045 establishes the boundary only | None |
| Decision 0024 | Domain, persistence, and repository responsibilities are separate | Separate packaged modules and closed contracts | None |
| Tests and docs | Preserve observable file behavior while exposing the new port | Legacy and focused suites pass; decision and changelog cite evidence | None |
| State and assumptions | FileTaskStore remains the sole production backend | CLI still uses the existing file engine | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: extracted rules, contracts, planners, and their tests are one
  boundary and do not reroute production behavior.
- Risk not resolved by passing checks: a concrete adapter has not yet proved atomic
  publication; T-0046 and T-0047 own that integration and conformance evidence.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: route the existing file engine through FileTaskStore in T-0046.
