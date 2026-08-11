# Threat Model: Framework Data CLI And Task Store

## Scope

- Change: required Node CLI, canonical JSON task records, Format 1 migration, and
  package/install/process cutover.
- Assets or data: task authority, revisions, lifecycle, dependencies, approvals,
  scheduling pause, next actions, results, linked evidence, and Git history.
- Users, systems, or agents involved: Root Orchestrator, delegated workers, Git
  worktrees/clones, package/installer, CI, and local filesystem.
- Trust boundaries: CLI arguments and legacy Markdown are untrusted input; repository
  paths and concurrent writers cross filesystem boundaries; schema validity does not
  make task text or authority claims trusted instructions.

## What Can Go Wrong

| Threat | Impact | Likelihood | Control Or Required Mitigation |
| --- | --- | --- | --- |
| Partial multi-file state | Contradictory primary/status/control facts block recovery | High | Control owns pause only; each normal transition writes one record; future multi-file operations need a separately reviewed protocol |
| Stale or concurrent writer | Lost update, duplicate selection, or invalid dependency state | High | Git-common-dir lock, recordVersion CAS, store digest for global invariants, no automatic retry, full pre/post validation |
| Duplicate-key or noncanonical JSON | Parser sees different authority/status than reviewer | Medium | Allowed-key validation on raw parsed objects plus normalized canonical byte equality before use |
| Malformed or changed legacy input | Silent field shift or incomplete migration | High | Explicit regular-file inputs, escaping-aware exact tables, dry-run hashes, recheck before apply, staged whole-store validation |
| Path/symlink substitution | Write or read outside repository; replace unrelated data | High | Derived destinations, repo-relative allowlist, component/type checks, same-filesystem staging outside canonical directories, identity recheck, rename without delete fallback |
| Forged caller/provenance | Worker claims user authority, approval, selection, or Done | High | CLI makes no authentication claim; Root-only mutation remains policy; approvals bind source/action/boundary/taskRevision; Git review audits |
| Partial or injected query | Agent acts on an incomplete store or terminal escape content | Medium | Validate whole store before output, bounded JSON-only envelopes, text/control limits, no raw payload in errors, no evaluation or shell interpolation |
| Git merge/collision | Two primaries or lost same-ID intake after clone merge | Medium | Reject unmerged index/store conflicts, duplicate IDs, wrong shards, and graph/state inconsistency; document disconnected-clone residual risk |
| Unsupported platform semantics | Claimed durability fails outside the exercised boundary | Medium | Support Linux local filesystems only; keep macOS/WSL as unverified design targets and reject native Windows/network guarantees |
| Unconditional rollback | Revert deletes tasks created after cutover | Medium | Rehearse pre-mutation rollback; after first structured mutation use forward reconciliation |

## Mitigations And Verification

| Mitigation | Verification | Status |
| --- | --- | --- |
| One-file transition model and pause-only control | State-transition tests plus deterministic SIGKILL immediately before a prepared record claim | Pass on Linux |
| Strict schema, canonical bytes, full graph/state doctor | Duplicate/unknown key, malformed JSON, conflict, wrong-shard, cycle, process-inventory, budget, and omitted-terminal fixtures | Pass |
| Cooperative lock and CAS | Concurrent processes, linked worktrees, stale versions/digests, owner-token, empty-owner, and malformed-owner fixtures | Pass on Linux |
| Safe path and atomic replacement | Ancestor symlink, hard-link, outside-store staging orphan, write failure, aggregate cap, empty-shard, and failed first-shard-claim fixtures | Pass on Linux |
| Format 1 prepared migration | Escaped pipe, missing divider, archive-base links, input-change, collision, equivalence, and rollback fixtures | Pass |
| Bounded safe queries | Exact terminal lookup, filters, byte/row truncation, stale cursor, numeric ordering, C1/bidi payload, and 10,000-task fixtures | Pass |
| Package/runtime boundary | Exact allowlist, unsupported/missing Node, pinned CLI version, fresh install/init/doctor, deterministic archive tests | Pass on Linux |

## Agentic Risks

- Untrusted instructions or prompt injection: task and linked narrative text remains data;
  queries label provenance and never elevate schema-valid content to instruction authority.
- Tool permission risk: any same-permission agent can invoke or edit the store; policy
  retains Root-only mutation and the CLI never claims actor authentication.
- Dependency, script, or generated-code risk: dependency-free repository-pinned Node
  ESM only; no install hook, external package, generated runtime artifact, or auto-update.
- Secret or sensitive-data exposure risk: field limits and existing repository policy
  reject secrets; errors omit raw malformed content and stack traces.
- CI/CD or deployment permission risk: CI runs doctor/tests/package verification under
  read-only contents permission; release permissions remain unchanged.

## Residual Risk

- Accepted risk: cooperating CLI writers are serialized, but a malicious same-user
  process can still race path-based APIs; direct canonical edits cannot be distinguished
  cryptographically; disconnected clones can allocate the same display ID. SIGKILL
  before an atomic claim can leave a hidden staging sibling outside canonical state;
  controlled failures clean these files, while interrupted residue requires deliberate
  filesystem cleanup after confirming no writer is live.
- Approval or decision record:
  [Decision 0018](../decisions/0018-adopt-node-structured-task-store.md).
- Review trigger: any lost update, escaped malformed state, direct-edit incident,
  unsupported-platform demand, rollback data loss, or multi-record transition need.
