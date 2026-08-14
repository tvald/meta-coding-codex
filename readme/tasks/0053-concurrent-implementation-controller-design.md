# Concurrent Implementation Controller Design Notes

## Task Identity

- Task ID: T-0053
- Accepted task revision: 1
- Authority: User direction on 2026-08-14 to design the full concurrent implementation
- Inputs: T-0051 transcript/counterfactual evaluation and T-0052 command-boundary design

## Execution Checkpoint

- Completed safe increment: Converged the command, provider, durable protocol,
  concurrency, workspace/Git, resource, recovery, finalization, and delivery-slice design;
  integrated independent Reviewer, QA, and Security analyses.
- Current state: Design only. No controller, provider-job, process, worktree, scheduler,
  Git integration, or task-store behavior has been implemented or changed.
- Accepted architecture: [Decision 0025](../decisions/0025-adopt-concurrent-implementation-controller.md).
- Canonical serialization and reducer contract: [Controller protocol](../project/concurrent-implementation-controller-protocol.md).
- Security owner: [Threat model](../threat-models/2026-08-14-concurrent-implementation-controller.md).
- Acceptance and activation gates: [Quality record](../quality/0053-concurrent-implementation-controller.md).
- Resume constraint: Preserve concurrency. Write-enabled activation remains disabled until
  exact top-level role binding, Git-common/canonical/ledger isolation, stale-process
  containment, and durable stop delivery pass adversarial and live compatibility gates.

## Acceptance Criteria

- Define the user command, implementation capsule, controller/harness boundary, and
  supported lifecycle commands.
- Specify canonical execution-ledger ownership, schemas, state derivation, events,
  idempotency, leases, fencing, retention, and crash reconciliation.
- Allow Root judgment, implementers, reviewers, QA, and Security work to overlap while
  retaining one primary task, one accepted semantic decision per generation, and bounded
  default WIP.
- Specify worker workspace creation, enforced isolation, result ingestion, correction,
  integration, cleanup, stale-worker behavior, and clone/overlay fallback.
- Specify concurrent verification and a deliberately minimal initial policy for ports,
  databases, containers, browsers, devices, caches, and other external resources.
- Preserve Root semantic authority, task-store CLI ownership, approval boundaries,
  provider compatibility and quota guards, least privilege, and scoped local commits.
- Choose the initial Codex launch adapter from stable, locally verified surfaces and define
  compatibility/fallback behavior.
- Walk normal, duplicate, out-of-order, crash, redirect, quota, worker-loss, dirty-Git,
  verification-failure, resource-collision, and finalization scenarios.
- Produce an accepted decision, threat model, readiness/quality record, and ordered
  implementation slices with verification and rollback boundaries.

## Fixed Direction And Resolved Choices

Fixed by user direction:

- Conversational design remains interactive.
- Implementation begins from an explicit repository-pinned command.
- Autonomous implementation is event-driven and uses fresh bounded Root ticks.
- Concurrent overlapping work is a requirement, not a later optimization.
- External conflicts receive baseline declaration, observability, namespacing, cleanup,
  and exact-key evidence activation rather than speculative global serialization.

Resolved in Decision 0025:

- `codex exec` 0.147.0 subprocesses are the initial version-allowlisted backend; SDK and
  App Server adapters are deferred until installed, stable, and locally conformant.
- Operational state is a separate versioned ledger under the resolved Git common
  directory; task semantics remain solely in the task store.
- A controller-aware top-level hook/profile adapter must bind the exact compiled role.
- Work overlaps in controller-owned attempt workspaces; workers cannot mutate Git.
- One trusted integration writer freezes actual changes, validates path ownership, and
  advances private refs with expected-OID comparison.
- Default background WIP is three non-authoritative provider jobs plus at most one short
  authoritative Root tick. Independent path/resource claims overlap; one accepted
  semantic decision and one integration writer advance each generation.
- Final required Reviewer, QA, and Security gates fan out on the exact candidate tree.
- Finalization reconciles candidate, task close, exact staging, one scoped completion
  commit, and terminal receipt across explicit crash boundaries.

## Plan

- [x] Capture T-0053 and define acceptance before design.
- [x] Inventory stable Codex and repository contracts relevant to concurrency.
- [x] Obtain independent controller, security/resource, and verification analyses.
- [x] Synthesize component, state, provider, Git/workspace, resource, and operator designs.
- [x] Write decision, threat model, quality/readiness record, and implementation slices.
- [x] Run final independent architecture review and resolve all design findings.
- [x] Verify exact staged scope, close T-0053, and create the scoped local commit.

## Work Streams And Roster

| Work Stream | Owner | Files Or Domain | Status | Result | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| Architecture integration | Root Orchestrator | All T-0053 design artifacts | Complete | Design converged; repository close and commit pending | Resume from this checkpoint |
| Controller and harness protocol | `/root/controller_protocol_review` (Reviewer) | Read-only repository/provider contracts | Complete | Final Pass after JCS bytes, proposal provenance, and attempt recovery were made exact | No restart planned |
| Concurrency security and resources | `/root/concurrency_threat_review` (Security) | Read-only trust, Git, process, resource boundaries | Complete | Accepted concurrency after mandatory isolation, stale-process, control, and cleanup gates | No restart planned |
| Verification and delivery slicing | `/root/concurrency_verification_design` (QA) | Read-only acceptance and test surface | Complete | Supplied 16-area matrix, fault/replay/shadow plan, and nine slices | No restart planned |

## Evidence And Convergence

- T-0051 measured two autonomous implementation slices with ten task-scoped commits each,
  207 to 326 wait-like calls, 16 to 37 direct child threads, and three to eight Root
  compactions. It found both heavy coordination overhead and material overlapping work.
- T-0052 found that a command is a useful phase boundary only when it is the durable
  supervisor, not a thin launch wrapper.
- Local `codex-cli 0.147.0` exposes stable non-interactive JSONL, output schema, final
  output file, cwd, sandbox, ephemeral, and process-exit surfaces. Its App Server command
  is marked experimental. Official docs recommend SDK/App Server for deeper integrations,
  but no SDK is installed or verified here.
- Current Codex hooks bind Root on top-level `SessionStart` and specialists only on native
  `SubagentStart`. Exact separately launched roles therefore require a controller-aware
  hook/profile contract; user prompt prose is not authority.
- Official Codex security documentation says a writable workspace protects both `.git`
  pointer files and resolved Git directories as read-only. Linked worktrees still share
  Git metadata, so production requires platform-specific adversarial proof and a safer
  isolated clone/mount/overlay fallback.
- Existing task-store contracts provide one-record semantic CAS, whole-store invariants,
  and one canonical FileTaskStore. The run ledger is deliberately separate.

Independent findings resolved in the design:

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | Linked worktrees alone do not fence shared Git or canonical state | Worker Git writes forbidden; protected-path/sandbox tests mandatory; fallback isolation required |
| Critical | A newer epoch cannot stop a stale live writer | Exact process domain, proven emptiness, quarantine, and no overlapping replacement |
| High | Top-level worker currently receives Root startup profile | Versioned controller-aware hook with exact compiled profile/digest and fail-closed mismatch |
| High | Stops/amendments/approvals can race effects | Sticky durable control generation checked before every effect and immediate interruption |
| Medium | Global resource serialization would lose requested overlap | Exact claims/namespaces plus collision corroboration and run-local exact-key serialization |

## Verification Plan

- Pure reducer, exhaustive small interleavings, deterministic generated traces, and
  counterfactual mutants for fencing, revision, ownership, acknowledgment, and stop.
- Provider contract tests with in-memory and real-executable fakes covering JSONL bounds,
  binding, response loss, signals, descendants, and completion order.
- Disposable Git/process adversarial tests for simultaneous attempts, shared metadata,
  symlinks/hardlinks/rename/signal escape, actual ownership, ref CAS, conflicts, and every
  cleanup/finalization crash cut.
- Minimized T-0051 replay, structurally effect-free shadow mode, live compatibility,
  one authorized canary, and predeclared context/concurrency/recovery metrics.
- For this design task: final Reviewer pass, task doctor, links/budgets, diff whitespace,
  scoped staging, local commit, and post-commit HEAD/status inspection.

## Usage Capacity

- Last authoritative reading: 2026-08-14T09:51:45.779Z; disposition `proceed`.
- `weekly.1` consumed 9%, resets 2026-08-20T04:18:52Z; `weekly.2` consumed
  0%, resets 2026-08-21T09:51:45Z. Five-hour and monthly windows were omitted.
- No limiting or unknown window is at cutoff. All three workers are complete.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-08-14 | Created and selected T-0053 | Structured task mutation receipts |
| 2026-08-14 | Verified local and official Codex surfaces | Local 0.147.0 help and official docs |
| 2026-08-14 | Completed three independent design analyses | Reviewer, QA, and Security handoffs; quota proceed after each |
| 2026-08-14 | Converged the five design artifacts | Decision 0025, protocol, threat model, quality record, and this checkpoint |
| 2026-08-14 | Added the canonical typed protocol after Reviewer finding | Versioned record fields, closed decisions/results, and legal transitions |
| 2026-08-14 | Passed final independent architecture review | No remaining High/Critical findings after exact JCS bytes, proposal provenance, and attempt recovery edges |
| 2026-08-14 | Re-ran repository contract checks | Task doctor passed; 22 provider, hook, and task-store architecture tests passed |
