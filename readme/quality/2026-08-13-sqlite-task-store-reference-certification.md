# Quality Record: SQLiteTaskStore Reference Certification

- Date: 2026-08-13
- Task: T-0049 revision 1
- Route and risk: Quick change, High
- Decision owner: [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md)

## Acceptance And Evidence

| Criterion | Observed Evidence | Status |
| --- | --- | --- |
| Frozen common contract | The adapter-neutral 11-case conformance module retains SHA-256 `73fc2dacbc22d6134eac0177992c977c05041684457c48058976242ecb1d7eac`; File and SQLite register without skips, provider branches, or semantic exceptions | Pass |
| Complete semantic trace | One public-contract trace plans separately from each snapshot and exercises add, amend, approval, dependency, checkpoint, select, close, pause, and resume; planned changes, receipts, queries, and the complete logical store agree after every accepted step | Pass |
| Narrow normalization | Comparisons omit only store identity and opaque generation/cursor token text; protocol and schema versions, tasks, control, receipt payloads, query items/truncation/cursor presence, and generation presence remain exact | Pass |
| Stable conflict parity | Target, declared read-set, control, global, ID-allocation, identity, schema, contract, initialization, and import failures agree on canonical code, message, and exit status | Pass |
| Real concurrent publication | Two separate processes plan from one snapshot behind a barrier for each adapter; exactly one publishes T-0001, the loser reaches the same global-generation conflict, a fresh plan creates T-0002, and full logical exports agree | Pass |
| Rollback and recovery | Invalid compound publication and repeat import/initialization publish no partial state; public export from reopened handles remains exact before a fresh successful operation | Pass |
| Reference-only boundary | SQLite remains absent from CLI, initialization, configuration, environment selection, canonical binding, migration, backup, and dual-write paths | Pass |

## Verification

- Differential SHA-256: `28fbf757c55931014586e7d8ca59dcdc45ddf5551f9ea8ff1e4f97c3c79739db`.
- Differential trace: 4/4 passed; the prior semantic candidate repeated five times.
- Focused differential, common conformance, File, SQLite, and architecture gate: 47/47 passed.
- A real short SQLite writer race initially returned unavailable before checking the
  stale generation. A fixed one-second busy timeout now matches FileTaskStore's bounded
  acquisition window and makes short races reach semantic CAS.
- A persistent SQLite write owner still returns canonical unavailable after the bounded
  wait, publishes no task, and permits a fresh retry after release.
- Full repository: 161/161 passed. Package suite: 66/66 passed.
- Reproducible package audit: 61 files, 168663 bytes, SHA-256
  `ff016bf85f1d613170d3a597a0a758c69db8f214b3e960a94f4443e0778f7fd5`.
- Doctor, syntax, static selector scan, and `git diff --check` passed.

## Review And Residual Risk

- Independent Reviewer disposition: Adopt with no blocking finding; focused 47/47 and
  persistent-lock recovery evidence passed.
- Independent QA disposition: Pass with no finding on the frozen hashes; focused 47/47,
  full 161/161, package 66/66, persistent-lock recovery, doctor, and audit passed.
- The reference certification covers the local TaskStore contract, semantic parity,
  concurrency, and rollback. It does not make SQLite selectable or canonical and does
  not establish backup, restore, audit, migration, path-permission hardening, or
  operational recovery; those remain T-0042.
