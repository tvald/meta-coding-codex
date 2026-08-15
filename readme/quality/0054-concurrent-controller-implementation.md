# Quality Record: Concurrent Controller Implementation

- Date: 2026-08-15
- Change: Package-owned offline implementation of the concurrent command-launched
  controller adopted by Decision 0025 and activation boundary revised by Decision 0027
- Route: Initiative
- Risk: Critical
- Owner or reviewer: Root Orchestrator with independent Reviewer, QA, and Security gates

## Scope And Criteria

- User-visible outcome: The package contains a deterministic, durable controller that can
  supervise bounded concurrent jobs through injected offline ports without retaining one
  Root model session.
- Installed outcome: Read-only status/events/doctor/lock inspection, effect-free shadow,
  and exact non-amplifying stop publication are available. Every forward or destructive
  effect remains default-deny because the installed package has no protected issuer.
- Non-goals: General live activation, a persistent network daemon, App Server/SDK
  production adapters, cross-clone fencing, unsupported filesystems/platforms, or a
  generalized resource scheduler.

Decision 0027 revised the original operator acceptance method after implementation found
that caller-supplied receipt/current objects could not be a trust root. Therefore the
complete lifecycle is verified through the shipped `offline_injected` composer with
source-only opaque test capabilities, while the original packed namespace is required to
deny start/resume/clean/recovery and every direct effect-capability forgery. This is a
scope-hardening amendment, not a waiver of lifecycle tests.

## Runtime Acceptance Matrix

| ID | Area | Observed Evidence | Status |
| --- | --- | --- | --- |
| A1 | Start/preflight | Ready activation journals immutable intent before task CAS; Active handoff, duplicate start, stale task/store/repository, dirty worktree, and response-loss recovery are covered. | Pass offline |
| A2 | Useful concurrency | Scheduler bounds lanes/WIP/dependencies/paths/resources; two real fake executables cross a barrier concurrently. | Pass |
| A3 | Judgment convergence | Closed Root proposals bind one orientation/result; deterministic IDs and current-generation CAS accept one semantic decision. | Pass |
| A4 | Events | Permutation, duplicate, loss, gap, causal-record, and cache-repair tests converge from immutable replay. | Pass |
| A5 | Idempotency/fencing | Typed intended/started/observed operation chains, previous digests, exact epoch/control/task/correction bindings, response-loss observers, and conflict reconciliation prevent blind repeats. | Pass |
| A6 | Stop/revision | Sticky stop, task/correction staleness, finalization boundary guards, and an external durable stop wake interrupt two blocked jobs before further model polling. | Pass offline |
| A7 | Isolation | Disposable Git, no-follow exact-byte freeze/ingest, mandatory protected paths, links/swaps/hostile Git config, identity cleanup, and ambiguity quarantine pass. Real OS/Codex containment remains disabled. | Pass offline |
| A8 | Integration | One journaled pipeline creates private candidates; expected-OID, base/tree/binding, conflict, response-loss, duplicate, and candidate-selection tests pass. | Pass offline |
| A9 | Verification | Candidate-tree-bound check fan-out, late/stale evidence, correction generation, exact-tree rehydration, and failure-to-correction behavior pass. | Pass |
| A10 | Provider | Exact version/role/cwd/sandbox/schema/environment, static hook versus dynamic orientation digests, closed Root result provenance, bounded streams/result files, timeouts, and signals pass with fake executables. Live smoke is intentionally disabled by Decision 0027. | Pass offline |
| A11 | Recovery | Initialization, record/event/cache, activation, control, attempt, pipeline, Git, task, ref, finalization, and cleanup response-loss cuts produce one safe retry or reconciliation. | Pass |
| A12 | Operator controls | Status is redacted; stop is durable, exact-generation, deterministic, idempotent, externally wakeable, and non-amplifying; resume requires epoch plus control generation and is exercised offline. | Pass offline |
| A13 | Resources | Real ephemeral ports overlap; a corroborated fixed-port collision serializes only that key; DB/cache/container-style namespaces coexist and cleanup rejects cross-identities. | Pass |
| A14 | Finalization | Candidate, task CAS, staged tree, commit, target-ref CAS, required checks, terminal receipt, per-boundary revocation, and all response-loss cuts agree before success. | Pass offline |
| A15 | Privacy/observability | Public status excludes recovery tokens/paths; records use bounded normalized IDs/digests; protected result reads and packed denial tests prevent uncontrolled data exposure. | Pass |
| A16 | Stable waiting | Virtual-clock waits and deadline wakes survive record/event cuts, coalesce, and launch no provider tick until changed state or a due deadline. | Pass |

## Verification Results

| Required? | Check Or Method | Observed Result | Status |
| --- | --- | --- | --- |
| Yes | `node --test tests/implementation-*.test.mjs` | 270 passed, 0 failed, 1 privileged foreign-owner check skipped; closed protocol, ledger/runtime, hook/provider/process, scheduler, workspace/Git/pipeline, application/operator/composer, resources, mutants, and recovery suites passed. | Pass |
| Yes | `npm run --silent test:package` | 357 passed, 0 failed, 1 environment-dependent owner check skipped. | Pass |
| Yes | `node --test tests/npm-package.test.mjs` | 13 passed; packed namespace has no protected issuer, forgeries fail without writes, installed forward commands remain disabled, exact stop/read surfaces and state-preserving replacement work. | Pass |
| Yes | `npm run --silent package:check` | Exact 87-file inventory, size 346338, SHA-256 `bb70221d1257dbb99f205972bd1125a95c7232622fd9ff92b91513d7411286d8`. | Pass |
| Yes | Full `node --test --test-reporter=dot tests/*.test.mjs` | Final settled-tree run exited 0. | Pass |
| Yes | Task-store doctor, staged doctor, and diff review | Terminal task record version 9 is valid; unstaged doctor passed 9/9 and staged doctor passed all 10 checks with 0 errors or warnings; unstaged and staged diff checks passed. | Pass |
| Yes | Independent Reviewer | Approved the offline, default-deny T-0054@r2 scope; explicitly did not approve live effects. | Pass |
| Yes | Independent QA | Approved the offline, default-deny scope: implementation 270/271, package 357/358, packed client 13/13, full suite 457 passed plus the same 1 skip, and no failures or cancellations. | Pass |
| Yes | Independent Security | Approved the offline, default-deny checkpoint after package-policy, Root launch/result, provider/version/cwd, signal, descriptor, ledger, issuer, and doorbell review. | Pass |
| No | Opt-in live Codex compatibility/canary | Deliberately not executed: no protected issuer or descendant-complete containment proof exists. | Not applicable under Decision 0027 |

- Criteria or methods amended after implementation began: Decision 0027 replaced the
  forgeable caller-receipt activation idea with issuerless installed code, a
  non-amplifying stop exception, two-fence resume, and an injected offline composer.
- Counterfactual evidence: Mutants disable binding, task revision, postcondition,
  ownership, sticky stop, or source invariants; packed tests try receipt-shaped/plain
  capability forgeries and verify byte-identical denial.
- Flaky or load-sensitive evidence: The automatic output-overflow process test initially
  let its child exit before the pipe flushed; its fixture now waits for the write callback
  and passes deterministically. One earlier full-load run exceeded the 10,000-task
  fixture's 60-second outer deadline while unchanged isolated runs passed in 39-50
  seconds. The outer test budget is now 120 seconds with every functional, ordering,
  bounded-output, dependency, and cycle assertion unchanged; the final full run passed.

## Review Findings

| Severity | Finding | Resolution | Status |
| --- | --- | --- | --- |
| Critical | Green primitives did not compose an offline lifecycle. | Added durable runtime writer/reducer seams, application service, Root semantic loop, operator controls, and shipped injected offline composer. | Resolved offline |
| Critical | Caller-shaped receipts could mint shipped Git/journal/provider/signal/workspace authority. | Removed shipped protected issuers; effect paths require opaque module capabilities available only through source-test instrumentation. | Resolved; live disabled |
| Critical | Installed stop could not wake an application blocked in provider waits. | Added lock/epoch-scoped abstract-socket doorbell; runtime replays durable controls and the application coalesces stop settlement across in-flight jobs. | Resolved offline |
| Critical | Attempts and effects lacked a complete durable isolation/recovery lifecycle. | Added closed AttemptTransition evidence, process receipts, split freeze/ingest, intent-before-effect pipeline, exact cleanup, and crash tests. | Resolved offline |
| High | Root proposal transport was an unbound side channel and dynamic prompt identity conflicted with the hook digest. | Added closed RootModelResult provenance; retained static compiled-profile descriptor digest and separately bound dynamic launch input. | Resolved offline |
| High | Root intent accepted arbitrary provider/version/cwd values despite a current manifest and attempt workspace. | Application pre-spawn and immutable replay now require exact manifest adapter/version and attempt workspace-root identity; mismatch performs zero provider starts. | Resolved offline |
| High | Ready activation mutated task state before durable run intent and replanned after response loss. | Initialize/lock/journal precede CAS; mandatory observation reuses the original immutable run. | Resolved |
| High | Frozen file evidence allowed size-only mutation and protected paths were subtractable. | Descriptor-bound exact content hashes and a mandatory agent/framework/task/prompt/controller protected union. | Resolved offline |
| High | Process final-result reads and automatic signals crossed stale/path-race boundaries. | No-follow bounded stable-descriptor reads and fresh authorization before every TERM/KILL. | Resolved offline |
| Medium | Resource acceptance lacked real fixed-port and disposable namespace evidence. | Added TCP collision/overlap and DB/cache/container-style identity/cleanup fixtures. | Resolved |

## Residual Risk

Passing offline checks does not prove protected issuance, real Codex delivery or hook/tool
environment separation, same-user host security, process-domain descendant completeness,
stale-process takeover, unsupported filesystems, cross-clone fencing, or real external
provider/workspace/Git/task/final-ref behavior. The installed package therefore keeps all
such effects disabled. The local process adapter reports incomplete descendant evidence,
and ambiguity reconciles or quarantines instead of permitting cleanup or reuse.

## Completion

- Required checks all passed: Yes for the accepted offline, default-deny scope.
- Status: Done.
- Exact incomplete condition: None within T-0054. Live effects remain outside the
  accepted scope and disabled by Decision 0027.
- Next action: Keep live activation disabled unless a later accepted decision supplies
  and verifies protected issuance, delivery, revocation, and containment.
