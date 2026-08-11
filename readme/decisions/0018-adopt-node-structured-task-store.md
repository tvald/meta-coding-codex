# 0018: Adopt A Node-Backed Structured Task Store

Status: Accepted

Date: 2026-08-11

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0008](0008-adopt-durable-task-orchestration.md) where it makes the
  hand-edited Markdown catalog canonical and rejects executable task storage before
  failure evidence exists. Its durable intake, authority, lifecycle, dependency, and
  state-free packaging principles remain current.
- [Decision 0010](0010-automate-portable-core-archive.md) where it restricts the core to
  Markdown and excludes adopter-needed runtime tooling. Its state exclusion,
  reproducibility, exact inventory, and archive-safety decisions remain current.

Superseded by:

- None

## Context

T-0017 identified a structural doctor as the highest-value deterministic helper. The
product owner then reported malformed authority-bearing task rows, including missing
column separators. T-0018 found a valid escaped pipe that already defeats naive table
parsing, modeled an always-read catalog at roughly 64,000 tokens for 1,000 tasks, and
showed that archive movement adds corruption and context risk without adding authority.

The repository now has direct level-4 evidence for a guarded state boundary. The
product owner promoted the data CLI, onboarding skill, and recovery skill and directed
their implementation. T-0020 must choose a runtime and cutover that preserves Git
reviewability, state-free distribution, task-scoped writes, and fail-closed recovery.

## Decision

- Adopt dependency-free ECMAScript modules on Node.js 22 or newer plus Git as required
  portable-core prerequisites. Ship the repository-pinned executable and JSON schemas
  under `readme/meta/framework-data/`; invoke it as
  `node readme/meta/framework-data/cli.mjs`.
- Support local POSIX Git worktrees on Linux, the platform exercised by the release
  matrix. macOS and WSL remain design targets that need platform evidence before support
  is claimed. Native Windows and network filesystems are unsupported.
- Reject native TypeScript for this tool: Node's type stripping performs no type
  checking and narrows the runtime floor. Reject compiled TypeScript because a compiler,
  dependency lifecycle, and checked-in source/artifact synchronization add more risk
  than this dependency-free CLI warrants.
- Store pause state only in `readme/tasks/store/control.json`. Store one canonical task
  per numerically sharded JSON file under `readme/tasks/store/records/`; derive the next
  ID, scheduling state, and primary task instead of storing duplicate pointers.
- Allow exactly one `Active` task and treat it as primary. Parallel workers remain in
  that task's roster; separate delegated `Active` tasks are no longer part of the
  portable lifecycle. Status and active role therefore change in one task record.
- Separate semantic `taskRevision`, which binds authority, approvals, assignments, and
  amendments, from storage `recordVersion`, which increments on every write and supplies
  optimistic concurrency. Return a sorted SHA-256 store digest for snapshot-sensitive
  operations without storing it as another fact.
- Require deterministic two-space, LF-final JSON in schema key order. Reject unknown
  fields, unsafe text and paths, unsupported schemas, noncanonical bytes, malformed
  graphs, wrong shards, Git conflicts, symlinks, special files, and inconsistent state
  before emitting query data or writing.
- Treat the shipped, digest-pinned JSON Schemas as structural interchange documentation;
  the repository-pinned CLI remains authoritative for semantic, transition, path,
  text-safety, and cross-record validation.
- Make the CLI the only authorized mutation path and the normal bounded query path.
  Commands enforce structure, transitions, and mechanical eligibility but never
  authenticate the caller, establish natural-language authority, rank/select work,
  validate an approval's truth, or infer semantic completion.
- Keep every normal mutation atomic to one canonical file. Use a Git-common-directory
  cooperative lock, target `recordVersion`, store digest where a global invariant is
  involved, exclusive same-filesystem staging outside canonical store directories,
  flush, destination recheck, rename, parent flush where supported, and full post-write
  validation. Prepare a first-record shard completely before claiming its canonical
  shard name. An interruption before claim may leave a hidden staging sibling, but it
  cannot add an unexpected entry or empty shard to the canonical store; normal reads
  ignore such noncanonical siblings and Git status or filesystem inspection exposes
  repository-side residue for deliberate cleanup. Add no age-based automatic lock break.
  Inspect an orphan candidate with `node readme/meta/framework-data/cli.mjs lock inspect`.
  Recover only after an operator establishes that no owner is live, then supplies the
  observed token to `node readme/meta/framework-data/cli.mjs lock recover
  --expected-token TOKEN --confirm-owner-not-live`; an incomplete owner-write uses the
  literal token `incomplete`. Lock ownership is fully written outside the claimed lock
  directory before its atomic directory claim; legacy empty or malformed owner states
  remain identity-checked recovery cases. Never infer owner death from PID, host, or age.
- Migrate Format 1 only through an explicit dry-run/hash/apply sequence. Parse exact
  ten-cell task tables with Markdown escaping, interpret archived task links from their
  original `readme/tasks/` base, report every normalization, stage and validate a whole
  sibling store, then atomically claim an absent canonical store.
- Replace the dynamic catalog with a static CLI entrypoint in the same cutover commit.
  Keep legacy archives immutable and explicitly noncanonical; normal reads never consult
  them. Keep task briefs, notes, decisions, quality evidence, threats, and incidents as
  linked Markdown narratives.
- Preserve the fresh-only installer boundary. Fresh installs preflight Node and Git and
  receive the pinned CLI. Existing adopters deliberately reconcile a new core outside
  the fresh installer, then run the one-shot migration; do not add an in-place updater
  to this task.
- Treat rollback to the pre-cutover commit as lossless only before a post-cutover task
  mutation. After new structured records exist, use forward reconciliation rather than
  a revert that could discard them.

## Options Considered

| Option | Benefits | Costs And Risks | Disposition |
| --- | --- | --- | --- |
| Dependency-free Node ESM JavaScript | One shipped source, strong standard-library JSON/filesystem/test support, no install hooks | Required Node/Git runtime; POSIX filesystem support boundary | Accepted |
| Native TypeScript on Node | Inline types without build artifact | No type checking; newer feature/runtime behavior; limited TypeScript syntax | Rejected |
| Compiled TypeScript plus JavaScript artifact | Full static checking | Compiler/dependency lifecycle and source/artifact drift in portable core | Rejected |
| Go or Rust binary | No adopter language runtime | Per-platform build, signing, release, update, and architecture matrix | Rejected for current scope |
| Keep Markdown tables | No runtime change | Observed corruption, unsafe escaping, archive churn, and unbounded context | Rejected |

## Consequences

Positive:

- Malformed, stale cooperative, and internally inconsistent task operations fail before
  partial state becomes runnable or queryable.
- Query context stays bounded as completed and nonterminal history grows.
- Per-task files retain readable Git diffs, additive intake, and task-scoped staging.
- One doctor and parser serve onboarding, recovery, CI, migration, and task operations.

Negative:

- The portable core now requires supported Node and Git rather than remaining
  Markdown-only.
- Existing installations need a deliberate core reconciliation before migration.
- The CLI and its schemas add a security-sensitive maintenance and compatibility surface.
- One-Active-task policy narrows the prior delegated-task lifecycle; parallel work must
  remain inside the selected task roster.

Residual:

- The CLI cannot prove a canonical file was written through it, authenticate an agent
  role, validate natural-language authority, serialize disconnected clones, or defeat a
  malicious same-user process. Git review and framework policy remain the audit and
  authorization boundaries.
- The Git-common lock serializes linked worktrees that share one common directory, but
  disconnected or branch-divergent clones can still allocate the same sequential task
  ID; reconcile those branches through normal Git conflict review.
- Legacy rows do not reliably provide completion dates or repository-change flags;
  migrated fields remain null unless repository evidence is explicitly recorded.

## Confidence

Confidence: High for the architecture on the tested Linux local-filesystem boundary;
macOS, WSL, native Windows, and network filesystems are outside the verified support
claim.

## Review Trigger

Revisit when Node/Git prerequisites prevent material adoption, a normal mutation needs
multiple canonical writes, native Windows or network filesystems become supported,
sequential-ID clone collisions lose work, the store exceeds bounded-query targets, or a
well-formed direct edit bypass causes an incident.

## Sources

- Product-owner instructions and observed malformed-row evidence dated 2026-08-11.
- T-0017, T-0018, and T-0020 independent architecture and security reviews.
- [Node.js releases](https://nodejs.org/en/about/previous-releases) and
  [Node.js TypeScript documentation](https://nodejs.org/dist/latest/docs/api/typescript.html),
  checked 2026-08-11.
- Decisions [0008](0008-adopt-durable-task-orchestration.md),
  [0010](0010-automate-portable-core-archive.md), and
  [0012](0012-add-fail-closed-piped-installer.md).
