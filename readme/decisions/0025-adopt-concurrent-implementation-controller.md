# 0025: Adopt A Concurrent Implementation Controller

Status: Accepted

Date: 2026-08-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None. It implements the direction evaluated by T-0051 and T-0052.

Superseded by:

- [Decision 0027](0027-revise-controller-operator-activation.md), only for the
  two-fence resume grammar and the split between non-amplifying stop publication and
  separately activated forward effects.

## Context

T-0051 sampled autonomous implementation runs lasting 7.58 to 11.19 hours, with three to eight Root compactions, 207 to 326 wait-like calls,
16 to 37 direct child threads, and ten task-scoped commits each. The runs also achieved useful worker overlap, so the product owner chose
concurrency over global serialization. T-0052 established an explicit command as the design/implementation boundary; a thin launcher around
one long model session would preserve the original context and recovery problems.

The repository has a revisioned task store, semantic CLI, compiled role profiles, capability/quota probes, and Codex hooks. It lacks an
execution ledger, top-level specialist binding, provider-job contract, and fenced concurrent Git integration. Linked worktrees isolate files
and indexes but share Git metadata, so they are not alone a security boundary.

## Decision

### Adopt

Adopt a repository-pinned `meta implement` command backed by an event-driven deterministic supervisor. The supervisor may live for the run;
models terminate after bounded jobs. It launches fresh Root ticks only for semantic judgment and overlaps independent specialist jobs.

```text
meta implement TASK --expected-task-revision N --harness codex [--max-concurrency 3]
meta implement status RUN [--json]
meta implement events RUN [--after SEQUENCE] [--limit COUNT]
meta implement stop RUN --expected-control-generation N --reason TEXT
meta implement resume RUN --expected-epoch N --expected-control-generation N
meta implement clean RUN
meta implement lock inspect RUN
meta implement lock recover RUN --expected-token TOKEN --confirm-owner-not-live
```

One run owns one primary task. Duplicate start returns the existing nonterminal run. Start grants no destructive, external, privileged,
production, or approval-gated authority. Stop is durable and idempotent; resume reconciles before launch; clean uses exact identities only.
Start accepts the named Ready task when no task is Active, or the same unique Active task after an interactive handoff. Ready activation is the
first typed Root decision and CLI effect. The capsule then freezes task/store versions, authority, goal, acceptance/non-goals, linked-detail
digests, route/risk/gates/checks, provider policy, and base Git facts; a mismatch prevents dispatch.

### Ownership And Protocol

- The task store remains the sole authority for task identity, revision, dependency, gate, lifecycle, and result, mutated only through its CLI.
- A separate operational ledger owns runs, ticks, assignments, attempts, operations, events, checks, resources, processes, and receipts.
- The supervisor owns validation, scheduling, leases, provider compatibility, quota guards, process control, workspace/Git effects, cleanup, and receipts.
- Root owns semantic decomposition, integration judgment, correction, verification sufficiency, and completion attestation. Model output is
  untrusted proposal data; models do not integrate, approve, mutate task state, or finalize.

Exactly one accepted semantic decision and integration writer advance a run generation. Read-only Root analyses may overlap all workers;
their proposals bind one snapshot and compare-and-swap accepts at most one effect per decision point.

Store operational files under the resolved Git common directory at `meta-framework/implementation/v1/`, mode-restricted and inaccessible
for worker writes. Use bounded canonical JSON, descriptor-anchored/no-follow access, durable rename publication, immutable sharded records,
a derived snapshot, one supervisor writer, and append-only operator requests. Preserve and reject unknown newer versions.

Cap each run at 10,000 events and 64 MiB of provider diagnostics, quiescing safely before overflow. Never auto-delete active, ambiguous, or
quarantined state. After 30 terminal days, exact cleanup may remove raw streams/workspaces; retain bounded normalized manifests/receipts for
at most 90 days, capped to the newest 50 runs, after project completion evidence is committed.

Required records are `RunManifest`, `RunSnapshot`, `Assignment`, `Attempt`, `Operation`, `Event`, `Candidate`, `CheckReceipt`,
`ResourceReceipt`, and `TerminalReceipt`. They bind compatibility; task/capsule/store/Git/epoch/control/correction generations;
profile/ownership/resource/process identity; idempotency/postconditions; sanitized evidence; and exact tree/check facts. Raw output never
supplies trusted provenance.

The exact fields, bounds, launch/result/decision unions, provenance rules, and legal reducer transitions are the
[controller protocol](../project/concurrent-implementation-controller-protocol.md); implementations must not infer a looser shape.

```text
PREFLIGHT -> DORMANT -> ORIENTING -> JUDGMENT_REQUIRED -> INTENT_PUBLISHED
          -> EXECUTING | VERIFYING | WAITING | FINALIZING
          -> DORMANT | RECONCILIATION_REQUIRED | TERMINAL
```

`STOPPING` dominates new effects; a task revision invalidates its capsule, assignments, results, and gates. Delivery is at least once:
persist intent, perform effect, observe postcondition, persist receipt, then notify. Duplicates no-op; conflicting evidence reconciles.
Stable waiting ends the Root tick; changed state or a due watchdog coalesces one orientation. A tick makes one semantic decision, optionally
declaring a bounded assignment batch. Orientation is capped at 96 KiB; larger inputs remain content-addressed read-only artifacts.

### Concurrency And Verification

Default background WIP is three non-authoritative provider jobs; one short authoritative Root tick has a separate cap of one. Operator,
provider, and role caps can only lower either lane. The scheduler uses dependency generation, priority, then assignment ID. Dispatch requires
current generations/quota/approval, satisfied dependencies, disjoint write paths, and compatible claims.

Implementers overlap frozen-candidate Root analysis and Reviewer/QA/Security fan-out. Final gates bind the exact tree; incremental evidence
is reusable only when its complete input scope is unchanged. A failed gate creates a correction generation and stales affected evidence.

### Codex Adapter And Role Binding

Use one supervised, allowlisted `codex exec` 0.147.0 subprocess per job. It is the locally verified stable surface for explicit cwd/sandbox,
JSONL, JSON-Schema output, final-message files, ephemeral sessions, and exit. Launch an absolute executable with argv arrays, sanitized
environment, strict config, bounded streams, no interactive approval/nested agents/network by default, and one terminable process domain.

Add a controller-aware hook v2. Normal top-level startup loads Root. A trusted bounded descriptor binds run, task revision, role, capsule and
compiled-profile digests; `SessionStart`, including resume/compact, validates it and injects the exact specialist profile. Strip its capability
from tool environments. Unknown bindings, hook conflict, or unavailable sandbox proof fails before tools; prose/profile names are not authority.

Keep a provider-neutral port for compatibility, start, events, status, interrupt, result, and close. Defer the unverified SDK and experimental
App Server; a future App Server adapter may use supervised stdio and stable methods only. The existing delegation capability probe remains
specific to native subagent dispatch; separately launched jobs pass this provider adapter's own compatibility contract and the quota guard.

### Git, Workspaces, And Finalization

This decision authorizes exact private run worktrees, trees, commits, and expected-old-OID ref updates. It does not authorize push, history
rewrite, broad prune, force/reset, or canonical publication outside finalization.

The supervisor creates one integration workspace and detached attempt worktrees. Workers cannot commit, switch branches, update refs/config,
run maintenance, or write `.git`. Codex documents pointer and resolved Git paths as protected, but activation still tests link/rename/path/
socket/`/proc`/signal/shared-metadata attacks. If canonical/integration/ledger/Git isolation is unproved, use clones, mounts, or overlays.

After proving the process domain empty, freeze and revalidate it, enumerate tracked/untracked changes NUL-safely, and quarantine paths outside
ownership. The integrator creates immutable private candidates; Git administration/integration serialize and bind all expected generations/OIDs.
Stale bases or conflicts return to Root and never force or auto-resolve.

Before publication, validate canonical HEAD/ref/index, known task-state dirt, changed paths, and task record. Unknown changes reconcile.
Finalization binds expected parent, candidate/staged trees, task/checks/paths/message; applies the candidate, closes through task CLI, stages
only owned files, creates one `commit-tree` completion commit, CAS-moves the target ref, observes HEAD/task/index, then emits the receipt.
Recovery moves forward from observed boundaries; ambiguous workspaces, refs, processes, or resources are quarantined.

### Minimal External-Resource Policy

Assignments declare exact `shared_read`, `namespaced_write`, or `exclusive` keys; files always have path ownership. Prefer ephemeral ports and
per-attempt temp/cache/browser/database/container namespaces. Devices/shared mutation are exclusive; credentials, sockets, accounts, and
production are absent unless authorized. Cleanup uses controller-created IDs/labels only.

An empty declaration means no known claim, not safety proof. Preserve the first collision and rerun sequentially; concurrent failure plus
sequential success serializes only that key for the run. Two class conflicts, or one corruption/security/external-data event, triggers durable
policy and threat review. Do not build a generalized scheduler without evidence.

### Recovery And Activation

A live supervisor holds an exclusive lock/epoch; takeover never infers death from age, PID, heartbeat, host, or status. Stop/takeover proves
the exact process domain empty or quarantines its ownership without overlap. Apply quota guards before each start/resume, after results, and
every five active minutes.

Ship initial stages disabled/read-only. Write activation requires role/isolation/process/stop/provider/event/Git/resource/crash proof, then an
opt-in live compatibility run, effect-free shadow implementation, and one authorized canary.

### Reject Or Defer

- Reject long-lived Root wrappers, timer-driven model polling, parent-scoped durable children, model-owned effects, and global serialization.
- Reject Git as ledger, several primary tasks per run, untrusted result files, broad cleanup, and force/reset recovery.
- Defer SDK/App Server production, daemon mode, cross-clone fencing, unsupported platforms/filesystems, and class-wide resource scheduling.

## Implementation Order

1. Schemas, CLI grammar, pure reducer, deterministic traces, and minimized T-0051 replay.
2. Ledger, lock/epoch/control requests, doctor/status, and publication crash tests.
3. Provider-job port, fakes, Codex-exec adapter, hook v2, and process containment.
4. Read-only concurrent scheduler and structurally effect-free shadow mode.
5. Worker workspace supervisor, ownership ingestion, quarantine, and isolation attacks.
6. Single integration/finalization writer with Git and task-store fences.
7. Verification DAG, corrections, resource evidence, and exact cleanup.
8. Packaged offline end-to-end gates and state-preserving disable/rollback.
9. Opt-in live compatibility, transcript-derived shadow evaluation, and one canary.

Each slice keeps later effects disabled until its gate passes and preserves unknown or
ambiguous state on rollback.

## Options Considered

| Option | Benefit | Cost/Risk | Disposition |
| --- | --- | --- | --- |
| Conversational or command-launched long Root | Minimal infrastructure | Context growth, polling, session children, weak recovery | Rejected |
| Sequential deterministic supervisor | Simple integration | Loses measured overlap | Rejected by product direction |
| Concurrent linked worktrees alone | Fast and space-efficient | Shared Git and stale writers | Revise with enforced isolation |
| Concurrent fenced supervisor | Overlap, bounded context, replayable recovery | Largest TCB and verification cost | Adopted |
| SDK or App Server first | Rich control | Uninstalled or experimental | Deferred |

## Consequences

Positive: waits leave model context; work overlaps; transitions, retries, stops, gates, Git, and recovery become inspectable and testable.

Negative: the TCB is substantial; some work serializes at path/resource/Git/finalization boundaries; fakes cannot prove live behavior.

Neutral: gains remain hypotheses until shadow/canary measurement; cached token totals are not billing-cost evidence. Task state is unchanged.

## Compatibility And Recovery

Interactive design/native subagents remain valid. `implement` fails closed on unsupported state; upgrade/rollback preserves ambiguity.
Status needs no provider; uncertainty requires targeted reconciliation.

## Confidence

High in the phase boundary/responsibility split; Medium in the role/sandbox adapter; Low in cost savings before measurement.

## Review Trigger

Revisit after an isolation escape, stale writer, missed stop, duplicate effect, cleanup ambiguity, cross-key conflict, provider drift,
cross-clone need, or evidence that concurrency is rarely useful.

## Sources

- Product-owner directions dated 2026-08-14; T-0051/T-0052 evaluations; independent T-0053 Reviewer, QA, and Security analyses.
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
  [App Server](https://learn.chatgpt.com/docs/app-server),
  [sandbox/protected paths](https://learn.chatgpt.com/docs/agent-approvals-security), and
  [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees).
- Repository task-store, prompt, hook, provider, Git, and package contracts on this date.
