# 0024: Revise The Structured Task Store For Adapters

Status: Accepted

Date: 2026-08-13

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0018](0018-adopt-node-structured-task-store.md) where it prescribes
  Git-common-directory read locking, caller-managed whole-store digest preconditions,
  first-shard staging, elaborate orphan-lock identity recovery, and store-load
  validation of linked narratives. Its structured domain model, CLI mutation boundary,
  bounded queries, local-file support boundary, and migration safety remain current.

Superseded by:

- None

## Context

Decision 0018 repaired observed malformed Markdown state and unbounded task context with
a typed, per-task JSON store. Subsequent review found that its core domain semantics are
useful, but several filesystem guards impose availability and maintenance costs that
are disproportionate to their likelihood or consequence. In particular, ordinary
readers contend on an exclusive Git-common-directory lock, harmless unrelated writes
invalidate caller-managed store digests, and missing narrative files can block all task
operations.

Git history cannot replace live task-state concurrency. Immediate intake and lifecycle
updates can be intentionally uncommitted, and commits may collapse several
`recordVersion` transitions. Git remains valuable audit and recovery evidence, but a
reset to committed state can discard the most recent authoritative facts.

The project also wants a storage boundary that can eventually support another
canonical backend. The current CLI, domain validation, filesystem mechanics, linked
documents, and Git evidence are too coupled to test that boundary. SQLite is a suitable
local transactional implementation with which to prove the contract, but proving a
contract is not the same as approving a production backend.

## Decision

### Adopt

- Keep typed task and control state, stable `T-` IDs, `taskRevision`, `recordVersion`,
  one Active task, pause semantics, dependency and approval invariants, deterministic
  bounded queries, and the repository-pinned semantic CLI.
- Keep FileTaskStore as the sole initial production and canonical backend. Retain
  canonical JSON, safe path containment, file flush, atomic rename, and
  destination-directory flush. Recover a lock only after explicit confirmation that no
  owner is live; liveness is never inferred automatically.
- Separate three responsibilities:
  1. a task application/domain service validates commands and produces deterministic
     change sets;
  2. a TaskStore adapter reads consistent state, performs deterministic queries, and
     atomically publishes a change set when its declared preconditions hold; and
  3. repository integration resolves narratives and supplies Git audit, conflict, and
     staged-completion evidence.
- Define an adapter-neutral local contract for immutable store identity and compatible
  metadata, consistent snapshots, bounded ordered queries, atomic next-display-ID
  allocation with task creation, target and declared read-set versions, a global
  generation only when a decision depends on a global invariant, atomic publication,
  stable conflict classes, and deterministic logical export/import.
- Implement SQLiteTaskStore only as a conformance and reference adapter. Its schema is
  private, it is injected only by tests or an internal harness, and it receives no
  production selector, onboarding path, canonical binding, migration, backup, or
  dual-write path.
- Use one unchanged conformance suite for FileTaskStore and SQLiteTaskStore. Reference
  status additionally requires differential semantic-command traces, equivalent
  normalized results and logical exports, conflict/concurrency evidence, and proof that
  failed transactions publish no partial state.

### Revise

- Let ordinary queries and doctor use optimistic lock-free reads with bounded retry.
  Only mutations, initialization, and migration take an exclusive FileTaskStore lock.
- Scope that lock to the physical worktree. A Git-common-directory lock cannot prevent
  divergent linked worktrees from independently changing different task stores.
- Remove caller-managed whole-store digest mutation preconditions. Keep an opaque
  adapter-internal snapshot or generation token and compare target, declared read-set,
  control, or global facts according to what the application decision actually read.
- Simplify orphan-lock recovery to inspect, confirm that no owner is live, and
  quarantine or remove the exact claim. Preserve exact token comparison for a valid
  owner record; do not infer death from PID, host, or age.
- Tolerate empty correctly named shards and let the next add fill them. They carry no
  task fact and do not justify a special first-record directory transaction.
- Remove redundant staging-parent flushes, duplicate path checks, and hard-link-count
  rejection where rename publication does not mutate another link. Retain containment,
  symlink rejection, atomic replacement, and destination durability.
- Validate linked-narrative existence in doctor and targeted task context rather than
  every canonical store load. Keep path syntax and allow-list validation in task data.
- Isolate the Format 1 importer behind onboarding and give its compatibility support an
  explicit sunset rather than expanding one-shot migration machinery indefinitely.

### Reject Or Defer

- Reject Git commits, branches, refs, resets, checkout, or automatic commits as the live
  transaction protocol. A stale read or version conflict is normally repaired by
  re-querying and restarting the affected agent operation. Git-assisted recovery is
  limited to inventorying uncommitted facts, comparing an explicitly named record to a
  known commit, restoring only that record when safe, and rerunning doctor/startup.
- Reject adapters that interpret lifecycle or authority semantics. Persistence
  capability does not establish caller authority.
- Reject runtime hot switching, dual writes, and multiple canonical stores.
- Reject S3 as a planned backend and remove it from the delivery roadmap.
- Defer selectable canonical SQLite to T-0042 and selectable canonical PostgreSQL to
  T-0043. Each requires its own accepted decision and operational evidence. PostgreSQL
  additionally requires trusted binding, credentials and least privilege, audit,
  backup/restore, migration fencing, and idempotent reconciliation of ambiguous network
  outcomes through atomic operation receipts. Operation receipts and replay are remote
  extensions, not requirements of the local SQLite reference contract. Those remote
  concerns do not block the local SQLite reference milestone.

## Implementation Order

The blocking path to the SQLite reference milestone is:

1. T-0044 characterizes current observable behavior.
2. T-0040 separates linked-document validation from persistence.
3. T-0045 extracts the application/domain, TaskStore, and repository interfaces.
4. T-0046 places the current engine behind FileTaskStore without changing production
   selection.
5. T-0038 simplifies FileTaskStore concurrency behind that boundary.
6. T-0047 creates the reusable conformance suite and passes FileTaskStore.
7. T-0048 implements the reference-only SQLiteTaskStore.
8. T-0049 establishes differential parity and certifies reference status.

T-0039 may simplify FileTaskStore crash and durability machinery after conformance
coverage exists, but it does not block SQLite reference status. T-0050 performs the
independent importer sunset after T-0049 for this delivery sequence. T-0042 and T-0043
remain later production-backend initiatives.

## Options Considered

| Option | Benefits | Costs And Risks | Disposition |
| --- | --- | --- | --- |
| Keep Decision 0018 unchanged | No refactor | Reader contention and file mechanics become the adapter API | Rejected |
| Use Git as live storage or routine reset recovery | Existing history and conflicts | Uncommitted facts and collapsed transitions make state stale or lossy | Rejected |
| Extract a port and keep FileTaskStore canonical | Preserves behavior while creating a testable boundary | Requires staged responsibility extraction | Adopted |
| Use SQLite as reference-only | Proves a second physical model with transactional semantics | Does not prove remote failure handling or production operations | Adopted |
| Make SQLite selectable immediately | Faster apparent backend choice | Skips binding, audit, migration, backup, and recovery decisions | Deferred to T-0042 |
| Add PostgreSQL now | Exercises a production remote datastore | Mixes contract discovery with credentials, network, migration, and operations | Deferred to T-0043 |
| Continue S3 design | Another consistency model | Adds publication and recovery complexity without a current need | Rejected |

## Consequences

Positive:

- Domain invariants remain authoritative while storage mechanics become replaceable and
  independently testable.
- Routine reads no longer fail merely because another reader or writer briefly owns a
  cooperative lock.
- Rare, recoverable filesystem states no longer dominate normal implementation paths.
- SQLite can expose file-specific assumptions without becoming an unsupported
  production configuration.

Negative:

- The extraction and shared conformance suite are substantial changes before a second
  adapter produces user-visible value.
- FileTaskStore remains constrained to the supported local POSIX filesystem boundary.
- The first contract deliberately does not prove remote timeout, credential, audit, or
  migration safety.

Neutral or follow-up:

- Git remains mandatory repository evidence for the initial FileTaskStore deployment,
  but it is not another live state owner.
- A future production adapter must extend or satisfy the contract without weakening
  current domain rules or creating dual ownership.

## Compatibility And Recovery

The FileTaskStore remains selected implicitly, so existing installations require no
binding or migration. Each extraction step must preserve current CLI envelopes and
observable semantics unless this decision explicitly revises them. Compatibility is
proved first by characterization tests, then by the FileTaskStore conformance run.

Conflicts and stale reads are retried from newly queried state. Agent restart is an
acceptable repair for an interrupted in-memory operation because canonical publication
remains atomic. Corruption, a possibly live lock owner, or uncertain uncommitted facts
still fail closed and require targeted inspection; they are never repaired by a broad
Git reset.

## Confidence

Confidence: High for the responsibility split, FileTaskStore simplifications, and
SQLite reference strategy; Medium for how much of the same contract a future remote
backend can reuse without extension.

## Review Trigger

Revisit when FileTaskStore behavior cannot satisfy the common conformance suite without
filesystem exceptions, SQLite requires production-only concepts to pass, measured
workloads require query pushdown, a multi-record semantic transaction is introduced,
or T-0042/T-0043 proposes a canonical backend with different audit or recovery needs.

## Sources

- Product-owner directions dated 2026-08-13.
- T-0036 task-CLI simplification review, T-0041 adapter feasibility assessment,
  T-0044 characterization, T-0040 narrative-validation evidence, T-0045's reviewed
  contracts, T-0046's FileTaskStore routing, T-0038's independently verified lock-free
  reads and precise CAS, T-0047's reusable conformance suite, T-0048's internal
  transactional SQLiteTaskStore implementation, and T-0049's differential reference
  certification.
- Independent architecture and security reviews recorded in T-0041.
- [Decision 0018](0018-adopt-node-structured-task-store.md).
- `readme/meta/framework-data/{cli,store,schema}.mjs` and
  `tests/framework-data.test.mjs`.
