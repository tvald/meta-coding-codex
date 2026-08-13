# Quality Record: FileTaskStore Production Routing

- Date: 2026-08-13
- Change: T-0046 FileTaskStore adapter and CLI routing
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with Implementer and independent QA

## Scope And Criteria

- User-visible outcome: the existing file engine is the sole production TaskStore
  adapter, while public CLI behavior and canonical bytes remain compatible.
- In scope: FileTaskStore, planner-based semantic routing, stable physical-store
  identity, neutral snapshots/queries/publication/export/import, packaging, and tests.
- Non-goals: lock/digest simplification, recovery changes, a backend selector, SQLite,
  migration between backends, or dual writes.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| CLI persistence routes only through FileTaskStore | Static imports plus semantic-command trace | No CLI engine mutation/load imports; all nine semantic paths call planners through adapter execution | Pass |
| Current mutation atomicity and error order remain compatible | Characterization suite and single-lock adapter execution | Load, plan, preconditions, and publication share the existing exclusive lock; 38/38 tests passed | Pass |
| Immutable identity distinguishes physical stores | Same-root, alias, different-root, and foreign-change-set tests | Same physical root is stable; foreign change sets fail before bytes change | Pass |
| FileTaskStore implements the neutral port without multiple-record pretence | Focused snapshot/query/receipt/export/import and invalid change-set tests | Deterministic results passed; multi-record change rejected with unchanged logical state | Pass |
| FileTaskStore remains the only production backend | Static selector/config/import scan | No backend flag, environment binding, SQLite, Postgres, or dual-write path exists | Pass |
| Packed clients preserve exact task behavior | Package audit and installed task-CLI suite | 60-file package reproducible; installed task CLI passed 8/8 | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Decision 0024 and T-0046 prohibit selector, migration, and concurrency changes |
| Architecture and project context | Yes | T-0045 contracts and T-0044 characterization are committed |
| Data, security, and permissions | Yes | Adapter retains characterized containment, locking, validation, and atomic writes |
| Slices and ownership | Yes | Implementer owned runtime/tests; Root owned package/docs/state; QA was read-only |
| Verification and rollback | Yes | File format remains unchanged and task is one scoped local commit |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | FileTaskStore plus architecture tests | 10 passed, 0 failed | Pass | — |
| Yes | Framework-data characterization | 38 passed including 10,000-task ordering/bounds | Pass | — |
| Yes | Packed task CLI | 8 passed, 0 failed | Pass | — |
| Yes | Reproducible package audit | 60 files, 164360 bytes, SHA-256 `0b670f2acba71bfe7cd112dc2f60d576be5d1ca7b73572f3d51849999d43acee` | Pass | — |
| Yes | Package matrix | Exited 0 with 25 printed passes in independent QA | Pass | — |
| Yes | Syntax, static routing, sole-backend, and diff checks | All passed | Pass | — |
| Yes | Independent QA | PASS with no blockers | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: the
  single-lock execution path, immutable non-overridable identity, pure-domain imports,
  and legacy digest-error ordering were added after early QA inspection.
- Counterfactual evidence for new behavior tests: without package inventory the packed
  fixture could not load FileTaskStore; before the identity/routing corrections a public
  override and store re-export imports weakened the boundary.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Semantic execution | Separate snapshot and publication locks could change characterized concurrency | Execute planning and publication under one adapter lock | Resolved |
| Medium | Store identity | Public identity override could give one physical store multiple identities | Derive identity only from the real canonical store root | Resolved |
| Low | CLI layering | Pure domain helpers still arrived through the persistence module | Import them directly from the domain module | Resolved |
| Low | Digest compatibility | Planner ordering could change stale-digest error precedence | Preserve command-specific pre-digest checks inside adapter execution | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Increment toward SQLite reference status | Existing engine now proves the production side of the port | None |
| Decision 0024 | FileTaskStore is sole initial canonical backend | CLI constructs it implicitly with no selector | None |
| Tests and docs | Preserve characterized behavior | Full regression and installed-client suites pass | None |
| State and assumptions | Concurrency changes wait for T-0038 | Legacy locks and digest inputs remain behind adapter | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: the adapter and CLI routing are one behavioral-parity slice.
- Risk not resolved by passing checks: identity changes if the whole repository is
  relocated, and legacy locking/digest/filesystem mechanics remain until T-0038.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: simplify FileTaskStore concurrency and caller digest handling in T-0038.
