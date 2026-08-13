# Quality Record: TaskStore Conformance

- Date: 2026-08-13
- Task: T-0047 revision 2
- Route and risk: Initiative, High
- Decision owner: [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md)

## Acceptance And Evidence

| Criterion | Observed Evidence | Status |
| --- | --- | --- |
| One reusable suite | `registerTaskStoreConformance` receives only an adapter name and neutral create/reopen/cleanup fixture; assertions call public TaskStore methods and shared planners without File, Git, path, option, skip, or provider branches | Pass |
| Identity and schemas | Same-store reopen is stable, distinct stores differ, foreign changes publish nothing, metadata is frozen, and incompatible change/import schemas return the canonical unsupported-schema error | Pass |
| Snapshots and queries | Snapshots are frozen, ordered, and generation-bound; 24 public readers concurrent with publication observe only an exact complete before or after state; pagination is deterministic, bounded, gap-free, and rejects malformed, mismatched, and stale cursors | Pass |
| Publication and allocation | Target, read-set, control, global, and ID-allocation conflicts have exact normalized shapes; unrelated-safe publication succeeds; two same-generation concurrent creates yield one T-0001 winner and one global-conflict loser before fresh T-0002 replan | Pass |
| Initialization and rollback | Initialization is one-time; invalid changes and schemas publish nothing; two distinct valid imports race to exactly one complete winner and one canonical corruption loser with no mixed state visible from another handle | Pass |
| Logical equivalence | Export is deterministic; import into a distinct empty store preserves logical control/tasks while retaining destination-local identity and generation | Pass |
| FileTaskStore compatibility | Default persistent read failures normalize to `TASK_STORE_CORRUPTION`; explicit compatibility reads retain the CLI's diagnostic errors and legacy writers retain immediate `LOCK_BUSY` behavior | Pass |

## Verification

- Reusable FileTaskStore conformance: 11/11 passed; the implementer repeated it three
  additional times without failure.
- Conformance, FileTaskStore, and architecture tests: 27/27 passed.
- Serial framework-data regression: 38/38 passed, including legacy concurrency,
  diagnostic corruption, interruption/recovery, and the 10,000-task bounded query.
- Independent package/packed task CLI checks: 20/20 passed.
- Reproducible package audit: 60 files, 163915 bytes, SHA-256
  `0bd72665dda99c4be1367df328780ab55202c18e42bce2dd3900772d8ccd34c4`.
- The first aggregate `tests/framework-data*.mjs` run launched several files together;
  40 tests passed and only the 10,000-task smoke exceeded its 60-second timeout at
  69 seconds. The identical case passed alone in 41 seconds, and the serial owning file
  then passed 38/38 in 74 seconds. This is recorded as resource contention, not erased
  by an unexplained rerun.
- Syntax and `git diff --check` passed before the independent gates.

## Review And Residual Risk

- Reviewer revisions found sequential publication, absent concurrent snapshot evidence,
  file-error leakage, rollback that did not cross publication, and a retry that could
  replay an entered callback. Each finding produced an observable regression; retry is
  now acquisition-only and every canonical error category is table-tested. Final
  Reviewer disposition: Adopt. Independent QA: Pass with no blocking finding.
- FileTaskStore's default mutation surface retries a busy lock for about one second so
  concurrent adapter calls reach semantic precondition outcomes. The production CLI
  explicitly preserves its immediate legacy lock-busy behavior.
- Public concurrency tests cannot force a particular before/after reader distribution;
  they require every observed state to be one exact valid endpoint. File-specific
  crash injection remains in its mechanism tests and is not an adapter exception.
