# Quality Record: Task-Store Characterization Baseline

- Date: 2026-08-13
- Change: T-0044 observable behavior baseline before TaskStore extraction
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent QA gate

## Scope And Criteria

- User-visible outcome: later storage refactors have executable evidence for the task
  semantics and atomic outcomes they must preserve.
- In scope: task/control revisions, conditional conflicts, deterministic cursors,
  initialization, malformed-state refusal, and publication recovery.
- Non-goals: freezing the caller-managed store digest, Git-common read lock, empty-shard
  rejection, first-shard staging, or other mechanics explicitly revised by Decision
  0024 and T-0038/T-0039.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| `recordVersion` advances on every write while `taskRevision` advances only for semantic scope | End-to-end lifecycle trace | Task r1/semantic r1 reached record r8/semantic r3; control advanced r1 to pause r2 and resume r3 | Pass |
| Failed conditional and invariant checks publish no task bytes | Stale record, current whole-store digest, and ineligible-selection negatives | Every refusal preserved target bytes and the current canonical digest | Pass |
| Concurrent same-version mutations publish at most one result | Two-process race plus stale retry | One writer succeeded, one observed the current `LOCK_BUSY`; retry observed `STALE_RECORD`, and the store remained valid; repeated 10/10 | Pass |
| Queries are repeatable, ordered, bounded, and cursor-bound | Repeated filtered pages, complete traversal, wrong query/kind, and post-write cases | Identical snapshot/query bytes matched; wrong filters/kind failed and changed state made the cursor stale | Pass |
| Initialization and publication failures have deterministic recovery outcomes | Existing-store refusal, injected pre-claim failure, pre/post-rename SIGKILL | Retry produced one empty r1 store; pre-rename kept old bytes and post-rename kept the committed new version | Pass |
| Malformed unrelated state blocks reads and writes without partial publication | Corrupt one unrelated record, then run startup, list, and amend | Every command failed `SCHEMA_INVALID` and preserved the target record | Pass |

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused new-characterization tests | 8 passed, 0 failed | Pass | — |
| Yes | Full framework-data suite | Independent QA: 37 passed, 0 failed in 87.4 seconds | Pass | — |
| Yes | Concurrency repetition | Independent QA: 10/10 passes | Pass | — |
| Yes | 10,000-task bounded-query case | Root: 1 passed in 36.2 seconds | Pass | — |
| Yes | Doctor and diff checks | Store, links, budgets, changelog, and `git diff --check` passed | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: the
  simultaneous loser was expected to report `STALE_RECORD`, but current exclusive-lock
  behavior correctly reports `LOCK_BUSY`; the test now verifies one publication followed
  by a stale retry. T-0038 owns the planned lock/API revision.
- Counterfactual evidence for new behavior tests: injected initialization failure and
  pre/post-publication termination exercise both sides of the atomic claim; corrupted
  unrelated state proves each ordinary operation fails before target mutation.
- Flaky result and disposition: None; the concurrency case passed ten independent repeats.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Concurrent mutation expectation | Current loser is rejected at the cooperative lock before record CAS | Characterize `LOCK_BUSY`, then require a stale retry to observe the published version | Resolved |
| Advisory | Current store digest assertion | Decision 0024 deliberately removes caller-managed global digests | Label as current behavior owned for revision by T-0038 | Resolved |
| Advisory | File fault-injection seams | Rename interception is implementation-specific | Preserve asserted before/after-publication outcomes when T-0046/T-0039 relocates the seam | Accepted |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: the added tests are one behavior-baseline slice.
- Risk not resolved by passing checks: tests characterize the supported local POSIX file
  boundary; they do not establish the future adapter contract or SQLite parity.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: commit T-0044, then separate linked-document validation in T-0040.
