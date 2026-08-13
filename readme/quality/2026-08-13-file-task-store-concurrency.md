# Quality Record: FileTaskStore Concurrency Simplification

- Date: 2026-08-13
- Change: T-0038 lock-free reads, worktree locks, and precise conditional publication
- Route: Quick change
- Risk: Medium
- Owner or reviewer: Root Orchestrator with Implementer and independent QA

## Scope And Criteria

- User-visible outcome: readers no longer contend on the mutation lock, unrelated facts
  no longer stale every mutation, and linked worktrees do not serialize each other.
- In scope: optimistic reads, bounded fallback, mutation-lock location, public mutation
  arguments, adapter preconditions, compatibility metadata, and regression tests.
- Non-goals: orphan-lock protocol, empty shards, staging/fsync/path/hard-link mechanics,
  conformance-suite extraction, SQLite, or backend selection.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Ordinary queries and doctor are lock-free | Hold a same-worktree mutation lock and run four doctors plus startup | Every reader succeeded while a concurrent writer returned `LOCK_BUSY` | Pass |
| A failed optimistic read retries once and persistent corruption fails closed | Control-flow review plus malformed-state suite | One FrameworkDataError retry uses the mutation lock; persistent corruption still blocks commands | Pass |
| Mutation locks are physical-worktree scoped | Hold original worktree lock, then read and amend linked worktree | Linked mutation succeeded and did not change original worktree bytes | Pass |
| Public whole-store digest mutation preconditions are gone | Help/parser/packed CLI tests and compatibility metadata | Option is absent/rejected; task CLI advanced from 1.2.0 to 2.0.0 | Pass |
| Precise conditional publication remains | Target/read-set/control/global focused tests | Stale facts produce their normalized conflict; unrelated-safe target plan publishes | Pass |
| T-0039 recovery/durability scope remains intact | Diff and regression inspection | Recovery owner protocol, shard staging, fsync, containment, and hard-link guards remain | Pass |

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Architecture and FileTaskStore | 12 passed, 0 failed | Pass | — |
| Yes | Framework-data suite | 38 passed, 0 failed, including 10,000-task case | Pass | — |
| Yes | Packed task CLI and npm package | 20 passed, 0 failed | Pass | — |
| Yes | Reproducible package audit | 60 files, 163639 bytes, SHA-256 `cb9104902083095c4a8271815bce0f8001407887ed5014d444a0f23c6818bc47` | Pass | — |
| Yes | Syntax and diff checks | Passed | Pass | — |
| Yes | Independent QA | PASS with no findings | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: the
  lock moved from a tracked documentation parent to the validated per-worktree Git
  directory so live locks do not pollute repository evidence.
- Counterfactual evidence for new behavior tests: the old tests reproduced `LOCK_BUSY`
  for doctor and linked worktrees and required stale whole-store digests; their revised
  assertions now exercise the opposite accepted behavior.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Lock location | First draft put live locks under tracked task documentation | Use the validated per-worktree Git directory | Resolved |
| Medium | Optimistic read | First draft loaded the whole store twice on every success | Use one validated load and retry only on failure | Resolved |
| Low | Regression tests | Removed digest arguments initially left stale-store assertions | Replace with unrelated-safe and precise-precondition evidence | Resolved |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: read availability, lock scope, and mutation preconditions are
  the accepted FileTaskStore concurrency boundary.
- Risk not resolved by passing checks: the transient first-read-failure fallback is
  established by direct control-flow inspection rather than deterministic fault
  injection; active-lock clean reads and persistent corruption are exercised.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: build the reusable TaskStore conformance suite in T-0047.
