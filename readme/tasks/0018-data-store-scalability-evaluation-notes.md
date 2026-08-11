# T-0018 Data Store Scalability Evaluation Notes

## Task Frame

- Goal: determine whether framework records such as the task catalog should be accessed
  only through scripts, and redesign data/query boundaries for hundreds or thousands of
  process executions without bloating agent context or tolerating malformed writes.
- Scope: mutable framework-managed project records, their schemas, growth paths,
  frequent queries and mutations, archive behavior, cold-start needs, Git reviewability,
  portability, concurrency, migration, and failure recovery.
- Non-goals: implement a data CLI or migrate current records; replace human-readable
  narrative artifacts with an opaque external database; alter framework policy in this
  task.
- Constraints: repository-backed state remains the only durable memory; scripts must
  fail closed, preserve authority and semantic judgment in canonical policy, and remain
  safe under concurrent or interrupted agent work.
- Route and risk: Decide / Medium because the recommendation affects durable schemas,
  access ownership, portability, and future migration cost but performs no migration.
- Done when: growth is modeled; brittle data surfaces and frequent operations are
  inventoried; viable storage/access options are compared; a recommended architecture,
  query/mutation contract, migration path, and explicit non-goals are independently
  reviewed; and task records pass documentation checks.

## Verification Plan

- Inspect the canonical data ownership, lifecycle, archive, resumption, automation,
  packaging, and quality policies plus existing repository record volumes and shapes.
- Generate representative task data at 100, 1,000, and 10,000 rows outside the
  repository to measure context size and query/update mechanics without altering state.
- Threat-model malformed writes, partial writes, concurrent writers, schema drift,
  untrusted field content, and query omissions.
- Compare Markdown tables, append-only structured files, per-record files, and embedded
  databases against portability, Git diff quality, atomicity, validation, and context.
- Reconcile independent scalability and safety reviews, validate links and budgets,
  inspect the final diff, and commit only T-0018 records.

## Agent Roster

| Assignment | Ownership | Status | Expected Output | Restart Policy |
| --- | --- | --- | --- | --- |
| Large-scale data architecture review | Read-only framework/storage analysis; no writes | Interrupted after useful benchmark and architecture handoff | Independent option comparison and scaling recommendation | No restart needed; root reconciled the returned evidence |
| Data integrity and trust-boundary review | Read-only threat analysis; no writes | Complete | Malformed/concurrent write risks and required guardrails | No restart needed |

## Findings

### Conclusion

Revise the narrow T-0017 rejection of a task-catalog mutator. The new product-owner
evidence satisfies Decision 0008's explicit trigger to revisit executable storage when
catalog corruption or maintenance cost becomes real. The framework should adopt, in a
separate implementation task, a required `framework-data` CLI for authority-bearing
structured state, beginning with tasks. Markdown remains the policy and narrative
surface; it should stop serving as the hand-edited relational store.

The CLI must be both the only authorized mutation path and the normal agent query path.
Raw records remain inspectable for Git review and recovery, but startup and selection
load bounded query results rather than the complete history.

### Observed Scale And Context Pressure

| Measure | Observed Result | Consequence |
| --- | ---: | --- |
| Current task rows | 18 rows, 5,928 row bytes, 329 bytes per row on average | The 20-row archive ceremony is imminent |
| Current repository knowledge | 549,410 Markdown bytes and 9,916 lines | Selective loading already matters after only 18 tasks |
| Current task records | 156,382 Markdown bytes across the catalog and 31 detail files | Rich task evidence grows much faster than the live index |
| Markdown-table surfaces | 96 files and 1,483 table lines | Delimiter and column-shape errors are a framework-wide class, not task-only |
| Synthetic 100-task table | 25,426 bytes, roughly 6,357 tokens | Marginal for an always-read file |
| Synthetic 1,000-task table | 255,269 bytes, roughly 63,817 tokens | Too large for routine startup context |
| Synthetic 10,000-task table | 2,562,660 bytes, roughly 640,665 tokens | Impossible to load as an operational catalog |
| Bounded 50-row query projection | 13,432 bytes, roughly 3,358 tokens | Context stays nearly constant as history grows |
| 10,000-record pretty JSON snapshot | 4,887,932 bytes; parse 19 ms, serialize 35 ms in memory | Canonical storage size is cheap when it is not model context |

The synthetic records model the current ten fields and representative text; timings are
local design evidence, not a cross-platform performance guarantee. Filtering only
completed tasks is necessary but insufficient: the test left 2,000 nonterminal tasks
at 10,000 total. Every default query also needs pagination, counts, and an explicit
truncation signal.

### Existing Brittle Operations

- A valid current outcome contains an escaped `\|`. It has one more raw pipe than every
  ordinary task row, so `awk -F'|'`, delimiter counts, regex replacement, and similar
  Markdown mutation are already unsafe even before a divider is accidentally omitted.
- Intake allocates an ID, appends ten fields, updates global pointers, and later stages
  only task-owned hunks from a shared file. A one-character error can shift authority,
  status, dependency, approval, or result into the wrong field.
- Close updates task state, recent outcomes, the primary pointer, and a manually
  maintained hygiene counter. Partial completion produces contradictory recovery state.
- Archive handling moves terminal rows between files, maintains pointers, handles
  same-period collisions, and expands the search surface. It is context management
  implemented as risky data movement.
- Resume and maintenance repeatedly re-check IDs, dependencies, cycles, approvals,
  active/primary state, links, budgets, and counters by hand.
- Retrospective and changelog recurrence searches span active and archive files; the
  current retrospective is at its line budget during this task.
- Sequential IDs, decision filenames, structured task-note rosters, assumptions,
  sources, and command rows all depend on exact hand-authored syntax.

### Storage Options

| Option | Strength | Scaling Or Integrity Failure | Disposition |
| --- | --- | --- | --- |
| Script-gated Markdown table | Smallest migration; human-rendered | Escaping-aware parsing remains complex; one shared file retains context, staging, and merge problems | Transitional importer/exporter only |
| One deterministic JSON snapshot | Strict parser; simplest whole-store atomic validation; about 5 MB at 10,000 tasks | Every intake touches one shared file and task-scoped commits can capture unrelated pending intake | Acceptable fallback, not preferred |
| Sharded per-task JSON records | Strict schema, isolated atomic updates, task-scoped Git staging, readable diffs, no row movement | More files; whole-store checks scan directories; multi-record operations require careful design | Recommended |
| Flat JSONL or event log | Streamable and append-friendly | Current-state updates rewrite the file or require replay, snapshots, and eventual compaction; appends conflict | Reject as canonical state |
| SQLite | Transactions and fast indexed queries | Binary diffs, weak Git merge/recovery, extra runtime, and opaque review | Derived disposable cache only if later needed |
| External database or harness memory | Strong query engines | Violates repository-only durable memory and portable recovery | Reject |

The integrity reviewer preferred one atomic snapshot; the architecture reviewer preferred
per-task records. Per-task records win for this framework because task isolation and
additive intake require committing one completed task while preserving unrelated pending
intake. Normal semantic mutations can each touch one task record; global pause state is
separate. Repository-wide locking and complete-store validation retain cross-record
integrity. A future operation that truly changes several records must use an explicit
transaction/recovery protocol or be decomposed into valid transitions.

### Recommended Task Store

- Store one versioned, deterministically serialized, pretty JSON record per task under
  numerically sharded repository directories. Keep only genuinely global scheduling and
  pause state in one small structured control record.
- Derive the next sequential ID under lock rather than trusting a hand-maintained
  counter. Define the numeric portion as unbounded beyond four digits. Detect collisions
  after Git merges; disconnected clones cannot share a safe sequence without centralized
  allocation or a future collision-resistant ID change.
- Represent revision, authority, route, risk, dependencies, approval, blocker, status,
  primary/delegated role, next action, links, result, timestamps, and repository-changing
  completion as typed fields rather than overloaded slash- or comma-separated cells.
- Keep task briefs, notes, decisions, quality records, threats, and incidents as linked
  Markdown narratives. They are targeted context, not the relational store.
- Make `readme/tasks/README.md` a small static entrypoint documenting the query command,
  not a generated second catalog. Remove dynamic task pointers, recent completions, and
  hygiene counters from `readme/README.md`; derive them through the CLI.
- Commit no generated task projection or canonical SQLite index. Render Markdown, JSON,
  or concise text to standard output. A later ignored cache must be disposable and
  completely rebuildable from tracked records.
- Retain Git history as the audit trail. Do not add an unbounded duplicate event log.

### Required Query Contract

| Query | Bounded Output And Purpose |
| --- | --- |
| `startup` | Global pause state, primary task, counts by status, all active work, and a bounded nonterminal page |
| `task get ID` | Exact task regardless of terminal status, with linked detail paths |
| `task list` | Nonterminal by default; filters for every status, route, risk, authority, tag, date, and dependency; explicit `--all` |
| `task candidates` | Mechanically eligible records only; never ranks or selects them |
| `task deps ID` | Ancestors, dependents, satisfaction, cycles, and missing references |
| `task context ID` | Bounded record plus selected linked resume/decision/quality metadata |
| `doctor` | Complete schema, graph, path, control-state, and direct-edit consistency validation |
| `export` | Deterministic review/migration output; never another canonical store |

Every bounded result reports the applied filters, total matches, emitted count, omitted
terminal count, truncation, continuation cursor, store version, and integrity result.
`Blocked`, `Parked`, and `Needs verification` must never disappear silently. Exact-ID
and dependency queries include terminal records without a special flag.

### Required Mutation Contract

Use semantic commands such as `task add`, `amend`, `set-dependencies`, `record-approval`,
`select`, `pause`, `resume`, `checkpoint`, and `close`. Reject a generic `set FIELD`
command. The CLI validates structure and transition prerequisites, but the Root
Orchestrator still judges authority sufficiency, acceptance, route, risk, priority,
approval meaning, and whether verification supports `Done`.

Before every mutation and integrity-sensitive query, the CLI must:

1. acquire a repository-wide cooperative lock resolved through Git's common directory;
2. reject unknown schemas, malformed JSON, conflict markers, duplicate IDs, invalid
   enums, unverifiable required provenance, missing/self/cyclic dependencies, stale
   approval revisions, and inconsistent primary/scheduling state across the full store;
3. compare the caller's expected record revision or store hash to prevent stale writes;
4. validate field, record, dependency, path, and output size limits;
5. reject absolute paths, traversal, symlink escape, special files, control characters,
   and unsafe destination replacement;
6. treat stored text as data—never source, evaluate, or execute it—and escape terminal,
   Markdown, and JSON output for the target;
7. write a same-directory exclusive temporary file, flush it, atomically rename it,
   revalidate the complete store, and release only the lock it owns.

CI must run the same doctor. A hook is advisory, filesystem modes are not enforcement,
and checksums without an external trust root cannot prove the CLI was used. A direct
well-formed edit may be indistinguishable, but malformed or inconsistent state must
never become a partial query result or runnable work.

### Archive And Long-Horizon Data Policy

Task records should never move because of age or status. Default queries hide terminal
records while dependency and exact-ID queries retain them, eliminating the task archive
process. At larger scales, shard records at creation; do not periodically relocate them.
Legacy archives remain immutable migration inputs, not an active workflow.

Apply the same principle selectively:

| Data Class | Long-Horizon Treatment |
| --- | --- |
| Task checkpoint, progress, worker, and verification state | Next structured target; query current state and recent events rather than growing one active note |
| Commands, assumptions, sources, global approvals, and automation backlog | Schema-specific CLI registries with typed queries; the command registry is data and is never auto-executed |
| Retrospectives and framework changelog | Create time-sharded entries at origin and query by tag/date; stop active-to-archive movement |
| Glossary | Keep Markdown while small; add exact-term/alias queries when volume warrants it |
| Decisions, quality records, threats, and incidents | Keep narrative files; add validated metadata and query/scaffold commands, not exclusive body mutation |
| Project and meta policy | Keep bounded Markdown and load by relevance; it does not grow per execution |

The highest-value context commands after task storage are `startup`, `task context`,
`resume`, `maintenance due`, `learning search --tag`, `assumption list --open`,
`source list --stale`, and `command get ACTION`. These replace repeated discovery and
data movement without making product or safety judgments.

### Runtime, Migration, And Adoption Boundary

This cannot be an optional helper if startup and archive removal depend on it. Adoption
therefore requires revising the Markdown-only/no-runtime portable-core boundary and
shipping one real structured-data parser plus schemas through the package and installer.
This host has Node but lacks Python, SQLite, and `jq`, demonstrating that runtime choice
cannot be assumed. Do not implement JSON mutation with POSIX shell, `awk`, regex, or
`sed`; select and verify one required runtime in the implementation decision.

Migration must be explicit, dry-run-first, and one-way within one task-scoped commit:

1. build the CLI, schemas, doctor, read-only Format 1 importer, and negative fixtures;
2. parse active and archived rows with a real Markdown escaping model; stop on ambiguity
   rather than guessing missing columns;
3. compare every ID, revision, authority, status, dependency, approval, link, result,
   primary/global state, and terminal count, and record the legacy byte hash;
4. create the structured records and switch startup/process/templates/package ownership
   in one migration; do not retain dual canonical stores or auto-migrate on reads;
5. verify deterministic export, rollback from the prior Git commit, interruption before
   and after rename, locks, concurrent writers, symlink substitution, collision, merge
   markers, escaped pipes, control input, oversized values, and old/new schema behavior.

The implementation decision should directly Adopt, Revise, or Reject under this
repository's skip-Pilot policy. The evidence now warrants adoption of the architecture;
the unresolved runtime and exact record schema are implementation choices, not reasons
to retain the brittle Markdown database.

### Explicit Rejections

- Direct agent mutation of authority-bearing tables or structured records.
- A generic Markdown-table editor or arbitrary-field database command.
- Silent repair, skipped bad rows, partial-store queries, or automatic migration.
- Automatic task selection, authority acceptance, approval, risk, scheduling, or `Done`.
- Checked-in derived projections or caches presented as a second canonical owner.
- Canonical SQLite, external memory, or append-only event sourcing without compaction.
- Retaining manual task/archive movement after the mandatory query path exists.

## Verification Results

- Pass: inspected every canonical process owner and the task, cursor, archive,
  resumption, automation, packaging, quality, decision, learning, and template surfaces
  that own the affected lifecycle.
- Pass: measured representative 100-, 1,000-, and 10,000-task stores and bounded
  projections; the full Markdown view grew from about 6,357 to 640,665 estimated tokens
  while the 50-row projection stayed about 3,358 tokens.
- Pass: an independent integrity review threat-modeled malformed, stale, concurrent,
  partial, path-manipulated, and untrusted writes and established the fail-closed
  boundary incorporated above. A separate architecture worker returned useful storage
  benchmarks and the per-record design before interruption; root reconciled both views.
- Pass: `git diff --check` reported no whitespace errors, and a local-target link check
  validated 117 Markdown files with no missing targets.
- Pass: structural checks found 18 unique task rows, expected next ID `T-0019`, idle
  scheduling, matching primary state, and T-0018 closed as `Done`.
- Pass: `AGENTS.md`, the cursor, this note, every core process document, and the active
  retrospective remain within their budgets; the template inventory remains exactly
  twelve files.
- Residual risk: this is an architecture assessment, not an implementation. The runtime,
  schemas, lock portability, migration, recovery fixtures, packaging boundary, and CI
  enforcement require their own repository-changing task and independent verification.
