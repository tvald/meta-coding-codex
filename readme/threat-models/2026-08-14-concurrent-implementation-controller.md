# Threat Model: Concurrent Implementation Controller

Status: Accepted design; write enablement remains gated

Date: 2026-08-14

## Scope

- Change: A command-launched deterministic supervisor that runs bounded Root ticks and
  implementer, reviewer, QA, and security jobs concurrently.
- Assets or data: User authority and redirects; task revision/gates/result; canonical
  source, history, index, and task store; execution ledger and receipts; worker workspaces;
  provider credentials/handles/output; tests and external resources.
- Users, systems, or agents involved: Product owner, operator CLI, supervisor, Root model,
  specialist models, Codex, Git, local OS/filesystem, repository commands, and optional
  ports, databases, containers, browsers, devices, caches, accounts, or services.
- Trust boundaries: The supervisor is the execution TCB. Model output, provider events,
  candidate code, repository scripts, test output, and worker-created files are untrusted.
  Task state and Git are separate authorities. Linked worktrees share the Git common
  directory. External resources have independent ownership and transaction semantics.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Stale supervisor/worker writes after stop, revision, retry, or takeover | Critical duplicate or unauthorized effect | Medium | Revisions, process groups, planned epochs | An epoch cannot stop a process that does not check it |
| Worker changes canonical worktree, ledger, task store, or shared Git metadata | Critical corruption or authority bypass | Medium | Separate worktree; Codex protects `.git` paths | Platform, hardlink, rename, signal, and path-race proof required |
| Stop, amendment, or approval decision is missed or ordered late | Critical post-revocation effect | Medium | Planned durable control generation | Delivery and priority protocol not implemented |
| Top-level specialist receives Root or self-claimed role | High authority confusion | High today | Exact profiles exist for native subagents | No exact top-level role adapter exists |
| Duplicate, forged, malformed, or reordered events/results repeat effects | High duplicate launch/integration/finalization | Medium | JSONL and output schema | Provider output is notification, not authenticated authority |
| Candidate escapes declared ownership through untracked paths, links, sockets, or Git | High host or repository mutation | Medium | Path claims and worktree | Actual-tree ingestion and adversarial tests required |
| QA executes hostile code with secrets, network, Docker socket, or host writes | High exfiltration or external effect | Medium | Sandbox and approvals | Per-check least privilege/resource binding required |
| Cleanup kills/deletes an unrelated process, ref, worktree, DB, container, or volume | High data loss or outage | Medium | Planned IDs and labels | Exact identity/postcondition checks required |
| Ports, DBs, containers, browsers, devices, or caches collide | High false results or corruption | Medium | None general | Baseline exact claims, namespaces, evidence, and cleanup needed |
| Process/output/disk/quota exhaustion starves controller or leaks data in logs | Medium availability/privacy loss | Medium | Current bounded provider probe | Job resource bounds and redaction not implemented |
| Git publication, task close, commit, and receipt split across crash | Medium inconsistent completion | Medium | Task CAS and Git evidence | Finalization journal and forward recovery required |
| Another clone runs the same task | Medium duplicate work/effect | Low initially | Git-common run lock | No distributed fence; cross-clone operation is out of scope |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Keep Root/Reviewer/Security read-only; restrict Implementer/QA to one disposable workspace and declared artifacts | Provider and workspace adapters | Real sandbox tests for canonical/ledger/Git writes, links, rename, sockets, `/proc`, and signals | Required before write enablement |
| Protect Git common directory and controller state; fall back to isolated clone/mount/overlay if linked-worktree isolation is not proved | Workspace adapter | Malicious worker fixtures on every supported platform/filesystem | Required |
| Add exact top-level role adapter with compiled profile/envelope digest; disable nested agents, hooks conflict, plugins/MCP, network, and expansion by default | Prompt/provider adapters | Wrong-role/config/version negative tests and live smoke | Required |
| Treat all model/provider output as bounded data; supervisor stamps provenance from its process/RPC connection | Provider adapter | Duplicate/conflicting terminal result, invalid UTF-8, oversized stream, wrong binding tests | Planned |
| One ledger writer, exclusive live lock, monotonic epoch, intent-before-effect, observed receipts, and fail-closed reconciliation | Ledger/controller | Competing controller and crash-at-every-boundary conformance | Planned |
| Never infer owner death from age, PID, heartbeat, or status; terminate an exact pidfd/cgroup/process domain and prove empty | Process adapter | Ignored TERM, descendants, PID reuse, crash/takeover tests | Required |
| Sticky exact-run control generation for stop/reframe/approve/deny; check before every dispatch, integration, signal, or finalization | Controller/task adapter | Inject control/revision between every transition | Planned |
| Current task revision and approval gate bind every assignment, operation, result, and check; provider approval is only a proposal | Controller | Stale revision and mismatched action/resource approval tests | Planned |
| Workers never mutate Git; supervisor freezes, enumerates NUL-safe actual changes, validates ownership, then creates candidate commits | Git/workspace adapter | Tracked/untracked/links/wrong-base/dirty-result tests | Planned |
| Serialize Git-common administration and one integration lane; update refs with expected-old-OID CAS; never force/reset/auto-resolve | Git adapter | Two candidates, stale ref, conflict, response-loss, and cleanup tests | Planned |
| Bind reviews/checks to exact candidate tree, declared scope, command/environment, and resource manifest | Verification scheduler | Stale late pass and correction-generation tests | Planned |
| Sanitize environment and argv; disable hooks/signing/textconv/network Git; withhold credentials/network/Docker/external access by default | Provider, Git, and QA adapters | Sentinel secrets, config injection, repository hook/script tests | Planned |
| Bound job count, time, process tree, output, disk, event count, ledger size, and retention; apply canonical quota guard | Supervisor | Exhaustion, truncation, quota cutoff, and privacy tests | Planned |
| Clean only exact controller-created path/ref/resource identities after empty process proof; quarantine ambiguity | Cleanup adapter | Identity change, live process, dirty workspace, unlabeled resource tests | Planned |
| Journal final expected task record, candidate/staged tree, parent, checks, and message; recover close/commit/receipt forward | Finalizer | Crash after every Git/task publication boundary | Planned |

## Resource Conflict Baseline

Each assignment/check declares zero or more exact keys with `shared_read`,
`namespaced_write`, or `exclusive` mode. Path ownership is always explicit. Prefer port
zero/socket inheritance, per-attempt temp/cache/browser/database/schema/compose/container
names, read-only shared download caches, and exclusive physical devices. Shared or remote
mutation needs an exact claim and any existing approval. Docker/Podman sockets,
credentials, external accounts, and production resources are unavailable by default.

An empty claim list means “no known claim.” It is not proof of conflict freedom. On the
first credible collision, preserve typed and independently corroborated evidence and
rerun the affected work sequentially. Concurrent failure plus sequential success enables
serialization only for that exact key for the current run. Two confirmed conflicts in a
resource class, or one corruption/security/external-data event, triggers a durable policy
decision and threat review. Cleanup never kills an unknown port owner, drops an unknown
database, clears a global cache, or broadly prunes containers, volumes, refs, or worktrees.

## Cleanup And Recovery Invariants

- Attempt lifecycle is monotonic: `allocated -> launched -> terminal-observed -> frozen ->
  ingested -> integrated|rejected -> cleanup-pending -> cleaned|quarantined`.
- Create, spawn, integrate, signal, finalize, and cleanup intent is durable before action.
- A stale result is retained as evidence but cannot authorize integration or a gate.
- Unproved termination blocks ownership and worktree reuse. A replacement uses a new
  isolated workspace only when its path/resource claims cannot overlap the orphan.
- Deletion requires the exact run tuple, filesystem identity, expected current state, and
  process-domain emptiness. Unknown or changed objects are quarantined.
- Takeover increments the epoch only after exclusive lock recovery and reconciles every
  prior intent against provider, process, Git, task, result, and resource evidence.
- Git commit, task close, and receipt are not one transaction; recovery proceeds from
  observed postconditions and never reports terminal success early.

## Agentic Risks

- Untrusted instructions or prompt injection: Repository content, model output, logs, and
  web/provider events cannot alter profiles, authority, checks, or typed schemas.
- Tool permission risk: Write-enabled jobs receive only the attempt workspace; Root,
  Reviewer, and Security are read-only. No escalation occurs in unattended jobs.
- Dependency, script, or generated-code risk: Installation hooks, new dependencies,
  network, container sockets, and external commands retain their existing gates. QA runs
  generated code with the least resources declared for that check.
- Secret or sensitive-data exposure risk: Inherit an allow-listed environment, do not
  persist raw prompts/model streams/provider session IDs, cap/redact logs, and expose only
  normalized controller IDs in public status.
- CI/CD or deployment permission risk: Start grants none. Deployment, publication,
  production, credentials, customer data, or other external effects remain separately
  approval-bound.

## Residual Risk

- Accepted risk: Unknown external-resource interactions are initially detected
  reactively; safe independent work is not globally serialized. A compromised same-user
  host process remains outside the worker-sandbox threat boundary. Provider interruption
  may not immediately stop upstream consumption or an already-started external effect.
- Approval or decision record: [Decision 0025](../decisions/0025-adopt-concurrent-implementation-controller.md).
- Review trigger: Any sandbox/Git-common escape, stale writer, missed stop, duplicate
  effect, cleanup ambiguity, cross-key resource conflict, provider compatibility drift,
  unsupported filesystem/platform request, or move to cross-clone execution.
