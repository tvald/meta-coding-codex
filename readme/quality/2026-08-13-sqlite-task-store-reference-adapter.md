# Quality Record: SQLiteTaskStore Reference Adapter

- Date: 2026-08-13
- Task: T-0048 revision 1
- Route and risk: Initiative, High
- Decision owner: [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md)

## Scope And Acceptance

| Criterion | Observed Evidence | Status |
| --- | --- | --- |
| Unchanged conformance | T-0047's common suite retains SHA-256 `73fc2dacbc22d6134eac0177992c977c05041684457c48058976242ecb1d7eac`; SQLite registers through only the neutral fixture and passes all 11 cases without a skip or adapter branch | Pass |
| Private transactional model | Three exact STRICT tables store immutable identity/schema/generation, control JSON, and task JSON; read transactions produce one snapshot and write transactions perform preconditions, prospective validation, mutation, and generation advance before commit | Pass |
| Concurrency and rollback | Concurrent create and import contenders produce one complete winner and one canonical loser; every caught write failure rolls back; concurrent readers observe only exact before/after snapshots | Pass |
| Injection and tamper resistance | SQL text is fixed and all task/control/metadata values are bound; extensions and double-quoted string literals are disabled; hostile text remains data; exact normalized table signatures, singleton cardinality, identity, protocol, schema, row-count, record-byte, and aggregate-byte checks fail closed | Pass |
| Stable bounded behavior | Shared query/cursor/error validators are reused; driver errors are normalized; SQL-side count and length preflight runs before bounded row materialization | Pass |
| Reference-only boundary | SQLite is absent from CLI, configuration, environment selection, onboarding, canonical binding, migration, backup, and dual-write paths; FileTaskStore remains the only production construction | Pass |
| Runtime and dependency boundary | Adapter uses built-in `node:sqlite`, added in Node 22.5 and unflagged from Node 22.13; the internal reference path therefore requires Node 22.13+, while production remains import-isolated under the package's existing Node >=22 contract | Pass |

## Verification

- Frozen focused FileTaskStore, SQLiteTaskStore, shared conformance, and architecture
  checks: 43/43 passed.
- SQLite-only conformance and tamper/error checks: 16/16 passed before the final
  task-count bound; the final combined focused run passed 43/43.
- Full repository: 157/157 passed. Final package suite: 66/66 passed.
- Final package audit: 61 files, 168490 bytes, SHA-256
  `f47d0f5062db3b9348a3fa93086b3304ec079829aaaa7a6aeaee7b982c8af73d`.
- Independent process contention held `BEGIN IMMEDIATE`: publication returned canonical
  unavailable without a task write, then a fresh retry committed T-0001.
- Syntax, frozen-suite hash comparison, static production-selector scan, doctor, and
  `git diff --check` passed before final gates.

## Review And Residual Risk

- Security initially found that name-only schema checks accepted replaced tables and
  that rows could materialize before limits. Exact schema signatures, singleton checks,
  SQL-side resource preflight, bounded selection, and setup-error normalization close
  those findings. Final Security disposition: Adopt with no high/medium finding.
- QA found the prospective logical-state check omitted the explicit 100,000-task limit;
  that bound is now checked before any publication.
- Final QA: Pass with no finding; production CLI remained functional while direct
  reference-module loading was disabled, confirming runtime import isolation.
- Symlink-race/permissions hardening, audit and reviewable binary evidence, backup and
  restore, canonical binding, migration/cutover, and operational recovery are not
  reference-adapter capabilities. T-0042 must address them before SQLite can become a
  selectable production backend.
