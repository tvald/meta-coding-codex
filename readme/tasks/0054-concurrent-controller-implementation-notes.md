# Concurrent Controller Implementation Notes

## Task Identity

- Task ID: T-0054
- Started: 2026-08-14
- Last updated: 2026-08-14
- Accepted task revision: 2 after the implementation acceptance and artifact links are
  recorded
- Architecture: [Decision 0025](../decisions/0025-adopt-concurrent-implementation-controller.md)
- Protocol: [Concurrent controller protocol](../project/concurrent-implementation-controller-protocol.md)
- Predeclared evidence: [T-0054 quality record](../quality/0054-concurrent-controller-implementation.md)
- Security baseline: [Controller threat model](../threat-models/2026-08-14-concurrent-implementation-controller.md)

## Execution Checkpoint

- Completed safe increment: Predeclared acceptance and independent QA/Security seams;
  implemented the closed protocol, reducer, deterministic scheduler, workspace inspector,
  replay scaffolding, and fail-closed activation boundary. Focused protocol, reducer,
  scheduler, workspace, and activation checks pass; no runtime permission was enabled.
- Current repository state: `main` remains at `250a6cf`; T-0054 owns the uncommitted
  implementation modules, tests, task record, and evidence listed below.
- Resume constraints: Preserve the v1 protocol and concurrency requirement. Provider,
  worker-write, Git-integration, task-finalization, and live effects remain disabled until
  their slice-specific tests and independent gates pass.

## Plan

- [ ] Slice 1: canonical encoding, schemas, validators, reducer, CLI grammar, replay, and
  counterfactual mutants.
- [ ] Slice 2: execution ledger, locks, epochs, control requests, doctor/status, and crash
  publication tests.
- [ ] Slice 3: provider-job contract, Codex-exec adapter, controller-aware role binding,
  bounded streams, and process containment.
- [ ] Slice 4: deterministic concurrent scheduler, wake coalescing, and structurally
  effect-free shadow mode.
- [ ] Slice 5: attempt workspace supervisor, actual-diff ingestion, ownership enforcement,
  termination, quarantine, and isolation attacks.
- [ ] Slice 6: single Git integration/finalization writer with expected-OID and task-store
  fencing.
- [ ] Slice 7: verification DAG, correction generations, resource evidence, namespacing,
  and exact cleanup.
- [ ] Slice 8: packaged offline end-to-end lifecycle and state-preserving disable/rollback.
- [ ] Slice 9: opt-in live compatibility and canary surfaces; keep general activation off.
- [ ] Final Reviewer, QA, and Security gates; full checks; task close; scoped commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Frame and acceptance | Complete | Root Orchestrator | Task note, quality record, task record | Doctor and independent readiness review | Keep evidence current |
| Protocol, reducer, and replay | Complete focused | Protocol and replay implementers; Root | `implementation-protocol`, reducer, replay, mutants | Schema, JCS, model traces, mutants | Integrate with controller/package tests |
| Ledger | Complete focused | Ledger implementer | `implementation-ledger` and tests | Crash and competing-writer conformance | Integrate read-only status and gated writes with E2E |
| Provider and binding | Needs bridge fix | Provider/binding implementer | Provider-job adapter and controller binding | Fake-process and role conformance | Add descriptor-anchored protected-file observation before hook integration |
| Scheduler and workspaces | In review | Root Orchestrator | Scheduler, workspace inspector, and tests | Scheduling and disposable-Git adversarial tests | Extend process/isolation coverage |
| Activation | Complete offline | Activation implementer | Activation receipt validator and predicate | Nine focused fail-closed tests | Keep all effects disabled |
| Integration and verification | Backlog | Root Orchestrator | Git/task effects and E2E | CAS, finalization, recovery, package tests | Wait for prior slices |
| Verification and resources | Complete focused | Root Orchestrator | Check/resource receipts, gates, correction, collision policy | Five focused tests | Integrate with controller E2E |

## Repository And Verification State

- Changed files: T-0054 task/evidence plus new `lib/implementation-*` modules and focused
  `tests/implementation-*` fixtures/tests. Package, CLI, stable docs, and existing hook
  files are not yet changed.
- Recent commits: `250a6cf` accepted the concurrent-controller design.
- Commands already run: task-store doctor and recovery reconciliation passed; current
  official Codex non-interactive documentation was fetched; focused protocol, reducer,
  scheduler, workspace, and activation tests passed. A combined early run exposed four
  unfinished mutant failures and one replay assertion mismatch; the owning worker is
  correcting them, so they are defects-in-progress rather than flakes.
- Required checks remaining: All implementation checks in the quality record.
- Decisions and assumptions: The initial implementation is package-owned Node.js with no
  new production dependency. Live provider execution is an explicit activation gate, not
  a prerequisite for implementing and offline-verifying the adapter.

## Worker Roster

| Worker | Task ID, Revision, And Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| Root Orchestrator | T-0054@r2, integration and task authority | Reducer, scheduler, workspace, task state, final docs/commit | Running | Workspace suite passes 5/5 after correcting one fixture defect | Resume from this checkpoint |
| Protocol implementer | T-0054@r2, closed schemas/JCS contract | Protocol module and tests | Complete | Focused suite passes 10/10 | Reuse only for protocol fixes |
| Ledger implementer | T-0054@r2, immutable operational ledger | Ledger module and tests | Complete | Read-only/gated focused suite passes 16/16; forged capabilities and missing/stale/expired receipts fail | Reuse only for ledger fixes |
| Replay/mutant implementer | T-0054@r2, model traces and counterfactuals | Replay module, fixtures, replay/mutant tests | Complete | Focused replay/mutant/reducer suite passes 16/16, including ownership mutant | Reuse only for replay/mutant fixes |
| Activation implementer | T-0054@r2, offline effect gate | Activation module and tests | Complete | Focused suite passes 9/9 | Reuse only for activation fixes |
| Provider/binding implementer | T-0054@r2, offline Codex adapter and top-level binding | New provider/binding modules and tests only | Follow-up planned | Provider/binding focused suite passes 13/13; protected descriptor observation still absent | Resume original handle for the bounded bridge fix |
| Git/finalization implementer | T-0054@r2, fenced Git and crash recovery | New Git/finalization modules and tests only | Running | No final handoff yet | Resume original handle; do not replace while live |
| Verification designer | T-0054@r2, predeclared test review | Read-only tests/contracts | Complete | A1-A16 seam and mutant inventory returned | Reuse for final QA gate |
| Security reviewer | T-0054@r2, effect-boundary inventory | Read-only security surfaces | Complete | Current host cannot prove OS containment; offline-disabled implementation is viable | Reuse for final Security gate |

## Usage Capacity

- Last authoritative meter reading: 2026-08-14T11:00:22.975Z.
- Per-window consumed and reset time: weekly.1 10%, resetting
  2026-08-20T04:18:52Z; weekly.2 0%, resetting 2026-08-21T11:00:23Z.
- Limiting or unknown windows and their cutoffs: None observed yet for this task.
- Wake method and time: Not applicable.
- Resume condition: Every advertised window remains below its framework cutoff.

## Attempts And Dead Ends

| Attempt | Observed Evidence | Why Abandoned | Retry Only If |
| --- | --- | --- | --- |
| Link the stable protocol directly in task details | Task CLI rejected `readme/project/` as outside the closed narrative-detail roots | Task details intentionally accept task, decision, quality, threat, and incident narratives only | The task-detail contract changes through a separate decision |

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-08-14 | Captured and selected T-0054 | Task mutation receipts at record versions 1 and 2 |
| 2026-08-14 | Began implementation framing | Decision 0025, protocol v1, quality and threat evidence, official Codex docs |
| 2026-08-14 | Recovered after context compaction | Matching task/store/detail digests, `main` at `250a6cf`, mapped dirty files, live original worker handles, and safe quota |
| 2026-08-14 | Completed initial pure/offline increment | Protocol 10/10, reducer 8/8, scheduler 6/6, workspace 5/5, activation 9/9 focused tests |
| 2026-08-14 | Completed replay and verification/resource slices | Replay/mutant/reducer 16/16 and verification/resource 5/5 focused tests |
