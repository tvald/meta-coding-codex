# Task Store Adapter Feasibility

Task: T-0041

Date: 2026-08-13

## Conclusion

The long-term adapter goal is feasible, but the current implementation is not close to
a storage plug-in boundary. The task domain is reusable; the storage service is not.
The safest route is to extract a backend-neutral command and consistency contract while
keeping the file engine behavior unchanged, prove it with the file engine and an
in-memory conditional-write fault model, then select a production remote backend from
measured workload needs. PostgreSQL is the safer scalable target; a single-snapshot
object-store design may be simpler for bounded low-volume use.

Feasibility by target:

| Target | Feasibility | Boundary |
| --- | --- | --- |
| File engine behind an internal port | High | Mostly a responsibility split and compatibility exercise |
| PostgreSQL adapter | High after the split | Transactions, row constraints, and a per-project revision map well to current semantics |
| S3-like adapter | Medium | Requires immutable snapshots or manifests plus a conditionally replaced head; a task-per-object mapping is insufficient |
| Transparent backend switching with unchanged Git policy | Low today | Onboarding, staged completion evidence, audit, and recovery explicitly require repository files |

## Reusable Domain Core

The versioned task and control schemas, canonical task shape, lifecycle concepts,
`recordVersion`, `taskRevision`, dependency rules, one-Active invariant, pause rule,
candidate calculation, and bounded command vocabulary are backend-neutral. The pure
record validation in `schema.mjs` and most of `validateState` in `store.mjs` can become a
domain module.

The split is incomplete today:

- transition validation is private to `store.mjs`, while several command-specific
  transition rules remain in `cli.mjs`;
- commands receive a fully materialized file-store snapshot and mutation callbacks
  rather than a task application service;
- query filtering and pagination run over the full in-memory task map and bind cursors
  to a SHA-256 digest of every canonical file;
- every successful response claims whole-store integrity after a full scan.

These choices are reasonable for the current bounded local store, but they should not
become the adapter interface.

There is also a policy blocker, not just a code gap: the accepted knowledge-management
contract says all durable task facts live under repository version control and that an
external database may not substitute for them. A production remote backend therefore
requires an explicit superseding decision defining remote canonical ownership, cold-start
discovery, audit, backup, and recovery. A checked-in non-secret binding or completion
receipt may remain repository evidence, but it cannot duplicate live task state.

## Current Coupling

Storage concerns cross more than `store.mjs`:

| Area | Current assumption | Adapter impact |
| --- | --- | --- |
| Repository context | Git is mandatory and the store is exactly `readme/tasks/store/` | A remote locator or project namespace cannot be represented |
| Loading | Directory inventory, shards, canonical bytes, Git conflicts, detail files, and graph validation are one operation | Remote queries would require full object/database scans and local repository access |
| Mutation | Cooperative Git-directory lock, loaded `Map`, file metadata, and atomic rename form one protocol | No backend-neutral atomic commit contract exists |
| CLI | Read commands acquire the file lock; `task context` reads repository files directly | Store and workspace-document access are conflated |
| Runtime validation | The validated task runtime rejects any store outside the exact repository path | Adapter selection cannot reach dispatch |
| Project initialization | Initializer creates, fingerprints, preserves, and recovers the concrete shard tree | Remote provisioning and binding need a separate lifecycle |
| Doctor and completion | Staged evidence recognizes terminal JSON files at the local record path | A remote backend cannot satisfy the current local commit rule |
| Migration/export | Format 1 imports directly into a staged directory; `export` is a filtered task query | There is no complete backend-neutral snapshot transfer format |

## Required Logical Contract

Keep backend mechanics below a task application service. A minimal required port should
express semantics rather than filesystem operations:

1. Open or inspect one named store namespace and report immutable store identity,
   schema/adapter protocol compatibility, and required capability support.
2. Read a logically consistent snapshot containing control, requested task state, and an
   opaque snapshot token.
3. Atomically publish a deterministic application-produced change-set. The change-set
   declares its target and read-set `recordVersion` preconditions plus a global snapshot
   precondition only when the domain decision depended on a global invariant. The
   adapter returns the committed records and new token; it does not interpret lifecycle
   semantics.
4. Allocate a unique display ID inside the same atomic commit as task creation.
5. Return stable, bounded, numerically ordered query pages whose continuation token is
   bound to the query and logical snapshot. An adapter may reject a cursor as stale; it
   need not retain historical snapshots solely to continue old pages.
6. Resolve an ambiguous network result using a caller-supplied operation ID and payload
   hash persisted atomically with the change. A repeated matching request returns the
   exact prior receipt within the advertised retention window; a reused operation ID
   with different bytes fails. After retention expires, an unresolved operation fails
   as indeterminate and is reconciled from current state rather than executed blindly.
   A tombstone, monotonic caller sequence, or equivalent fence must distinguish an
   expired ID from a never-seen ID so eviction cannot re-enable execution.
7. Provide a deterministic full logical export/import protocol containing store
   identity, schema version, control, and every task, independent of physical layout.
8. Normalize conflict, stale-record, unavailable, timeout, authorization, corruption,
   and unsupported-schema failures across adapters.

The snapshot token is internal concurrency metadata. It may be the canonical digest for
the file engine, a project revision for PostgreSQL, or an S3 head ETag/version. It should
not remain a caller-managed whole-store digest on semantic CLI commands. The application
service decides which records and global facts a command read; the adapter compares only
the declared preconditions and applies the deterministic change-set. A backend may still
use a stronger physical compare-and-swap internally—for example, every S3 head update—
without exposing or requiring that global token in the semantic command API.

The first extraction may continue materializing a complete snapshot. Before query
pushdown is introduced, scoped reads must expose every record and predicate on which the
application decision depends so those facts enter the commit preconditions.

The contract must require atomicity and consistent snapshots. Do not make those optional
capabilities that a weak adapter may omit. Query pushdown and caching can be optional
optimizations. Once canonical record diffs leave Git, durable remote mutation audit,
reviewable terminal evidence, backup, and restore are mandatory; only their physical
representation may vary by adapter.

## Backend Mappings

### Local files

Wrap the existing engine as `FileTaskStore`. Keep path containment, canonical JSON,
atomic record replacement, and local recovery inside that adapter. Git conflict checks
and staged completion evidence belong to a separate repository integration service,
even though the file adapter invokes them in the current mode.

### PostgreSQL

Use a stable project/store namespace, a project-control row, task rows, dependency rows,
and an operation-receipt table. A per-project monotonic revision supplies the snapshot
token. Mutations lock the project-control row, validate the declared read set, allocate
IDs, apply task/dependency/control changes, persist the audit/operation receipt, and
increment the revision in one transaction. Database constraints include `store_id` in
every identity and relationship and enforce at most one Active task per store;
application/domain validation remains authoritative for lifecycle, approval, pause, and
cycle rules. Use verified TLS, parameterized SQL, pinned `search_path`, bounded statement
and lock timeouts, and a non-owner application role without DDL authority.

PostgreSQL is the preferred first remote adapter because it can preserve the existing
single logical mutation boundary without inventing a publication protocol. Serializable
transactions require whole-transaction retry handling, so the adapter must map retries
and ambiguous results without silently repeating semantic commands.

### S3-like object storage

Do not map each mutable task record directly to one independently replaced object. S3
updates are atomic per key and conditional writes can compare an ETag, but there is no
atomic update across keys.

A viable first design writes one immutable whole-store snapshot, including a bounded
operation-receipt ledger, then conditionally replaces one small head object. Readers
start from the head and follow the immutable snapshot. The head ETag/version is the
snapshot token; a losing writer leaves an unreachable snapshot for bounded garbage
collection but cannot publish a partial store. Central next-ID allocation and all global
invariants are part of the conditionally published snapshot. Later scale evidence may
justify immutable per-record objects plus a manifest, but that adds publication,
indexing, reachability, and garbage-collection complexity and should not be the first
correctness proof.

Treat ETags and provider version IDs as opaque CAS values, not integrity hashes. Every
snapshot also carries its store identity, schema, logical revision, bounded size, and
content digest. Production use requires versioning, conditional-create/replace capability
tests, delete-denied normal writers, and a separate garbage-collection principal that
marks all retained head versions and migration/export pins before grace-period deletion.

This is correct but rewrites and rereads the logical store and may be inefficient for
frequent queries. S3 offers no relational filtering, so the production design should be
chosen from measured store size, latency, request count, orphan cleanup, versioning, and
recovery behavior rather than presumed scale. PostgreSQL remains the preferred first
production remote backend, while an S3-style conditional-publication fault model should
be used earlier to prove the abstraction does not depend on database transactions.

## Incremental Gaps And Sequence

### 1. Preserve an abstraction-friendly simplification decision

T-0037 should define domain guarantees separately from `FileTaskStore` guarantees. The
T-0038 through T-0040 simplifications should remove exposed filesystem mechanics without
removing the internal snapshot token needed by remote conditional commits.

### 2. Extract domain and application services

- Move transition validation and command construction out of `store.mjs` and `cli.mjs`.
- Define backend-neutral `TaskSnapshot`, deterministic `TaskChangeSet`, declared
  preconditions, `MutationReceipt`, query, and error shapes.
- Make the CLI parse arguments and render envelopes around the application service.
- Put the current implementation behind `FileTaskStore` with no user-visible change.

### 3. Separate repository services

- Introduce a workspace-document resolver for linked narratives.
- Isolate Git conflict detection, staged completion evidence, and local commit receipts.
- Replace the exact store-path runtime assertion with a validated non-secret store
  binding; keep the repository root mandatory for project documents and Git work. The
  binding names a trusted external connection-profile alias, never an endpoint or module
  path to which a malicious branch could redirect credentials.
- After connection, verify immutable store UUID, tenant/account, project namespace,
  environment, adapter protocol, and migration epoch against the binding before reading
  or writing.
- Bind it to a stable store and repository identity. Define how a remote
  task's relative narrative path behaves when a checkout is behind, ahead, or on a
  different branch; path existence alone cannot prove every client sees the same text.
- Evolve onboarding sentinels from “directory must exist” to “valid store binding must
  exist,” while retaining the local directory as the default.

### 4. Add identity, compatibility, and transfer

- Give every store a stable namespace/instance identity distinct from a checkout path.
- Version the adapter protocol separately from task schema and CLI envelopes.
- Add a complete logical snapshot export and empty-target import with pause, source-token
  recheck, target verification, and explicit cutover. Use a migration state machine and
  fencing epoch: freeze source writes, import a disabled target, switch the binding, then
  enable only matching-epoch writes. Avoid routine dual writes; after the first target
  mutation, rollback becomes forward repair or an explicit reverse migration.
- Preserve sequential `T-` IDs through migration; remote adapters allocate them
  centrally. Revisit opaque entity IDs only if cross-store merge becomes a requirement.

### 5. Add remote operational semantics

- Define explicit timeouts, bounded retries, operation IDs and payload hashes, a bounded
  receipt-retention contract, and unknown-outcome lookup before any retry.
- Keep credentials outside repository configuration and distinguish datastore access
  authorization from the framework's natural-language authority judgment.
- Load adapter implementations only from a package-owned allowlist and validated
  compatibility metadata. Prefer the first PostgreSQL adapter built into the pinned
  package; never execute an arbitrary repository-configured module path.
- Give only the Root process write credentials under the cooperative model; workers get
  read-only access or none. A multi-user service requires authenticated per-store/action
  authorization, but still cannot infer natural-language task authority.
- Fail closed for remote writes while unavailable. Any cache is disposable and
  snapshot-keyed; begin with no cache and do not add offline write-behind. This
  deliberately makes immediate intake unavailable during an outage instead of creating
  a second pending-write owner.
- Decide how remote terminal changes produce reviewable Git evidence. A small staged
  completion receipt may replace staging the canonical task record, but must not become
  a second live state owner.

### 6. Prove the contract before adding providers

Create one adapter conformance suite covering snapshot consistency, target and read-set
CAS, selectively required global generations, ID allocation, one-Active/pause races,
dependency updates, stale cursors, timeouts after commit, exact receipt replay, mismatched
operation-ID reuse, schema negotiation, export/import equivalence, and backend failure
normalization. Run it first against an in-memory S3-style CAS/fault adapter and the file
engine, then PostgreSQL. Add production S3 only after the chosen whole-snapshot or
manifest protocol passes the same suite plus orphan and publication fault injection.

## Guardrails

- Keep one canonical live backend per project. Do not use Git or a second adapter as a
  synchronous replica.
- Do not expose backend ETags, transaction IDs, paths, or SQL details in the semantic CLI
  contract.
- Do not require every ordinary remote query to materialize and validate the full store
  indefinitely. Full validation remains a doctor/export operation; mutation-time
  validation covers the affected record and required global invariants.
- Do not let adapter packages define lifecycle or authority rules. They implement
  persistence, consistency, and query mechanics only.
- Reassess the dependency-free package rule before choosing adapter distribution. S3
  signing and PostgreSQL protocols should not be reimplemented casually merely to avoid
  reviewed optional dependencies.
- Treat any production remote-provider implementation as high risk and require a threat
  model covering tenant isolation, credentials, dependencies, retry/fencing, migration,
  audit/restore, cache/export handling, redaction, and provider-specific recovery.

## Independent Review

- Architecture Reviewer: **Revise**. It confirmed feasibility and the domain/repository
  split, corrected the port from semantic mutation to deterministic conditional
  change-set publication, required read-set preconditions and exact operation replay,
  and recommended proving S3-style failure semantics before privileging a provider.
- Security And Risk Agent: **Revise before provider implementation**. It accepted the
  file-first extraction, but required superseded memory policy, trusted binding and
  identity checks, mandatory remote audit, credential separation, expired-operation and
  migration fencing, pinned adapter loading, and concrete PostgreSQL/S3 protocols.

## Evidence

Repository evidence:

- `readme/meta/framework-data/store.mjs`, especially repository context, `loadStore`,
  mutation functions, and lock handling.
- `readme/meta/framework-data/cli.mjs`, especially preflight, query pagination, context,
  and mutation dispatch.
- `lib/runtime-roots.mjs` task-root validation.
- `lib/project-initializer.mjs` store creation and preservation transaction.
- `readme/meta/framework-data/framework-checks.mjs` staged task-close evidence.
- Decision 0018 and the framework-data CLI threat model.

External primary sources checked 2026-08-13:

- [Amazon S3 consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel)
- [Amazon S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL serialization failure handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html)
