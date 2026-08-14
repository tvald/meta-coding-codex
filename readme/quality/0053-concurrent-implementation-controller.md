# Quality Record: Concurrent Implementation Controller Design

- Date: 2026-08-14
- Change: Implementation-ready design for a concurrent, command-launched, tick-based
  autonomous implementation controller
- Route: Decide
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Reviewer, QA, and Security agents

## Scope And Criteria

- User-visible outcome: Preserve useful overlapping implementation work while moving
  waits, process supervision, state, recovery, and deterministic transitions outside a
  long-running model context.
- In scope: CLI lifecycle, execution ledger, state/events, Codex launch binding, scheduler,
  isolated worker workspaces, Git fencing/integration, verification DAG, baseline external
  resources, stop/recovery/finalization, observability, and implementation slices.
- Non-goals: Runtime implementation, live concurrent provider turns, production
  activation, distributed cross-clone fencing, and a speculative generalized resource
  scheduler.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Define user command, capsule, lifecycle, and authority boundary | Design review against T-0051/T-0052 and current CLI | Decision 0025 defines start/status/events/stop/resume/clean and one-task revision binding | Pass |
| Define ledger ownership, schemas, events, idempotency, leases, retention, and recovery | State/protocol review | [Canonical protocol](../project/concurrent-implementation-controller-protocol.md) defines exact fields, closed unions, bindings, provenance, transitions, duplicates, publication, and bounds | Pass |
| Preserve useful concurrency without dual semantic authority | Scheduler and interleaving review | Default WIP three; independent path/resource work and gates overlap; one accepted decision point and integration writer | Pass |
| Specify worktree lifecycle and Git fencing | Security/Git review | Detached attempts, no worker Git mutation, frozen actual-tree ingestion, ownership validation, expected-OID CAS, quarantine | Pass |
| Define concurrent verification and corrections | QA review | Candidate-bound gate fan-out, stale-result rules, correction generations, final exact-tree gates | Pass |
| Keep external-resource policy minimal and evidence-driven | Security/QA comparison | Exact modes/keys, namespaces, first-collision sequential proof, run-local exact-key serialization | Pass |
| Choose a locally verified initial Codex backend and role binding direction | Local help, official docs, repository adapter review | `codex exec` 0.147.0 selected; exact top-level compiled-profile adapter required; App Server/SDK deferred | Pass |
| Cover normal and failure scenarios | Threat model and crash matrix | Stop, revision, duplicate, order, quota, orphan, dirty Git, conflict, resource, and every finalization cut specified | Pass |
| Produce decision, threat model, quality record, and ordered slices | File/link/independent review | Linked artifacts exist; nine gated implementation slices defined | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | User fixed concurrency and deferred broad resource serialization; non-goals are explicit |
| Architecture and project context | Yes | T-0051/T-0052 evidence, current task/provider/prompt/hook/Git contracts, and official Codex surfaces reconciled in Decision 0025 |
| Data, security, and permissions | Concern | Design is explicit, but write enablement waits for exact role binding, sandbox/Git-common escape tests, stale-process containment, and durable stop proof |
| Slices and ownership | Yes | Nine ordered slices isolate pure contracts, ledger, provider, shadow, workspaces, integration, verification, packaging, and live activation |
| Verification and rollback | Yes | Adapter conformance, crash injection, adversarial Git/process tests, shadow metrics, disabled rollout, state-preserving rollback, and canary are predeclared |

Readiness verdict: **Ready with concerns for implementation slice 1; not ready for
write-enabled production activation.** The concerns are activation gates, not permission
to weaken concurrency or silently substitute prompt claims for technical role/isolation
proof.

## Predeclared Runtime Acceptance Matrix

| ID | Area | Observable Acceptance | Deterministic Verification |
| --- | --- | --- | --- |
| A1 | Start/preflight | One exact task/revision/capsule/provider; invalid, stale, paused, gated, dirty, or duplicate input causes no effect | CLI grammar and disposable-client integration tests |
| A2 | Useful concurrency | Two independent jobs are simultaneously running; configured WIP is never exceeded; dependencies/path conflicts wait | Pure scheduler plus real child-process barrier |
| A3 | Judgment convergence | Read-only proposals may overlap; one CAS-valid proposal authorizes a semantic point | Permute two proposals against one generation |
| A4 | Events | Duplicate, delayed, reordered, and lost notifications converge to identical state | Exhaust small traces and recover by bounded scans |
| A5 | Idempotency/fencing | One semantic effect per operation; stale epoch/control/revision authorizes none | Race supervisors; lose responses after effects |
| A6 | Stop/revision | Stop, pause, amendment, correction, or cancellation prevents the next affected effect | Inject between every lifecycle transition |
| A7 | Isolation | Worker changes only owned workspace paths; canonical, ledger, task store, Git common, and peers stay unchanged | Malicious path/link/ref/signal fixtures on supported platforms |
| A8 | Integration | One writer creates and applies bound candidate commits; stale/conflicting input is uncommitted and reconciled | Multi-worktree, expected-OID, conflict, duplicate-apply, and crash tests |
| A9 | Verification | Required gates bind immutable candidate inputs; failure blocks finalization; corrections rerun affected checks | Three-role fan-out, late stale pass, correction rerun |
| A10 | Provider | Version, role, cwd, sandbox, prompt/output, streams, process domain, and result binding fail closed | Adapter-neutral conformance plus fake executable and live smoke |
| A11 | Recovery | Restart after every durable cut yields one safe next action or explicit reconciliation | Systematic crash injection around intent/effect/receipt boundaries |
| A12 | Operator controls | Status is bounded/read-only; stop/resume are durable, exact-run, generation-bound, and idempotent | Subprocess, signal, kill/restart, and late-result tests |
| A13 | Resources | Independent resources overlap; corroborated conflicts affect only exact keys; cleanup touches owned identities | Ephemeral/fixed-port, DB/cache/container, and cleanup fixtures |
| A14 | Finalization | Success only when candidate, task status/revision, exact staged tree, commit, checks, and receipt agree | Crash after close, stage, commit, and receipt |
| A15 | Privacy/observability | Every transition is attributable by normalized IDs/digests without secrets, raw prompts/streams, or uncontrolled paths | Sentinel-secret, bounds, controls, and retention tests |
| A16 | Stable waiting | No model tick or busy poll occurs without changed state or a due deadline; wakes coalesce | Virtual clock and wake-storm test |

## Verification And Evaluation Strategy

Use a pure reducer with injected clock, IDs, task/Git/provider observations, and operation
outcomes. Exhaust causality-preserving interleavings for small traces and add a deterministic
seeded generator without a new property-test dependency. Required invariants are one
primary task, one integration writer, intent-before-effect, monotonic lifecycle, WIP and
dependency bounds, terminal monotonicity, acknowledgment after observed postcondition,
and no stale generation influencing current state.

Counterfactual mutants must disable one fence, revision check, ownership check,
postcondition-before-ack rule, or sticky stop and make the matching test fail. The current
unknown `implement` command is the command-level pre-change negative baseline.

Build two provider fakes: an in-memory scripted adapter for reducer tests and a real
temporary executable for JSONL fragmentation, process groups, signals, environment, and
stream limits. Cover malformed/oversized/invalid UTF-8, wrong role/cwd/attempt, duplicate
and conflicting terminal output, response loss, timeout, ignored TERM, surviving
descendants, and completion in every order.

Convert the three T-0051 exemplars into minimized normalized fixtures, excluding raw
prompts, transcript IDs, account data, and unrelated content. Replay next-action
equivalence, known invalid launches, both ten-commit sequences, concurrency/dependency
ordering, duplicates/loss, stop, revision, gate, quota, and ownership divergence.

Shadow mode must be structurally unable to launch, signal, write, integrate, or close.
Before write activation it must show zero missed stop/revision/dependency/gate/approval/
quota/ownership boundaries, zero duplicate or unowned effects, equivalent or safer
terminal disposition, at least two overlapping jobs when permitted, no serialization
beyond evidence-activated keys, and recovery within two orientations after observations
become available. Median Root input per durable boundary must be at least 30% below the
matched monolithic baseline; report cached and gross tokens separately and make no billing
claim.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Independent controller protocol review | Final Pass: RFC 8785/JCS bytes, raw proposal versus supervisor provenance, record schemas, and run/attempt/operation transitions are independently compatible | Pass | N/A |
| Yes | Independent Security review | Concurrency accepted after explicit Git-common isolation, stale-process, stop/approval, cleanup, and resource controls | Pass | N/A |
| Yes | Independent QA review | Sixteen acceptance areas, model/fault tests, replay/shadow criteria, and nine slices supplied and integrated | Pass | N/A |
| Yes | Task-store doctor and local links | Passed with 53 tasks, 185 Markdown files, 307 local links, and no errors, warnings, or budget violations | Pass | N/A |
| Yes | Diff/staged scope and whitespace | Exactly six T-0053 artifacts staged; whitespace check and final staged doctor passed with the terminal task close | Pass | N/A |
| No | Runtime/unit/provider/worktree tests | No controller behavior exists in this design-only task | Not applicable | Later implementation slices own these tests |
| No | Live Codex concurrency | Explicitly separated as a later opt-in activation gate | Not applicable | Implement provider adapter and authorize live compatibility/canary |

- Criteria or methods amended after implementation began, with reason and impact: None;
  acceptance and verification were declared before runtime implementation.
- Counterfactual evidence for new regression or behavior tests: Predeclared mutants and the
  absent-command baseline above; no tests were added in this design task.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Critical | Worker worktrees | Linked worktrees share Git metadata and are not a security boundary | Require OS-enforced Git-common/canonical/ledger isolation, adversarial proof, and clone/mount/overlay fallback | Resolved in design; activation gate open |
| Critical | Process recovery | Epochs cannot fence a stale process that continues writing | Require exact process domains, proven termination, quarantine, and no overlapping replacement | Resolved in design; activation gate open |
| High | Top-level roles | Current hooks bind specialist profiles only on native `SubagentStart` | Add versioned compiled-profile top-level adapter; prompt/profile-name claims fail closed | Resolved in design; activation gate open |
| High | Canonical protocol | Named record kinds lacked fields, canonical hash bytes, proposal provenance, and complete legal transitions | Add linked v1 schema/reducer contract and re-run Reviewer gate | Resolved; independent re-review Pass |
| High | User control | Stop/amendment/approval can race every effect | Sticky durable control generation checked before effects; interrupt immediately | Resolved in design; implementation pending |
| Medium | Provider backend | App Server has useful controls but local command/process surfaces include experimental status | Use `codex exec` first; keep adapter-neutral port; defer SDK/App Server | Resolved |
| Medium | External resources | Global serialization would undermine the requested benefit; no controls risks collisions | Exact claims/namespaces/cleanup and evidence-triggered exact-key serialization | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Full concurrency; rigorous resource controls only as evidence warrants | Concurrent scheduler and minimal evidence-driven resource policy | None |
| T-0051/T-0052 | Event-driven fresh ticks and command-owned durable supervision | Decision 0025 adopts that boundary | None |
| Task/prompt/provider/Git policy | One primary task, semantic CLI, exact roles, quota guards, scoped commits | Preserved; new adapters and activation gates explicit | Implementation slices only |
| Decision/threat/quality docs | One home per architecture, risk, and verification fact | Decision owns architecture; threat owns risks; this record owns acceptance/evidence | None |
| State and assumptions | Design only; no controller exists | No runtime/package behavior changed | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No; five T-0053 design artifacts form one architecture decision.
- Risk not resolved by passing checks: Local design review cannot prove live provider
  behavior, same-user host security, OS/filesystem isolation, process termination,
  cross-clone fencing, or unknown external-resource interactions. These are explicit
  activation gates or accepted bounded residual risks, not inferred successes.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: None.
- Next action: Begin implementation slice 1 only under a separately accepted
  implementation task; keep every write-enabled controller surface disabled.
