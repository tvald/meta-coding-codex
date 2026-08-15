# Concurrent Controller Implementation Notes

## Task Identity

- Task ID: T-0054
- Started: 2026-08-14
- Last updated: 2026-08-15
- Accepted task revision: 2
- Architecture: [Decision 0025](../decisions/0025-adopt-concurrent-implementation-controller.md), revised by [Decision 0027](../decisions/0027-revise-controller-operator-activation.md)
- Protocol: [Concurrent controller protocol](../project/concurrent-implementation-controller-protocol.md)
- Quality evidence: [T-0054 quality record](../quality/0054-concurrent-controller-implementation.md)
- Security baseline: [Controller threat model](../threat-models/2026-08-14-concurrent-implementation-controller.md)

## Completion Checkpoint

T-0054 recovered from checkpoint `9ed2d59`, reconciled the completed T-0055 prompt
bootstrap repair at `59b3396`, and replaced the disconnected component scaffold with a
tested offline controller lifecycle. The package now contains the closed protocol,
durable ledger/runtime, deterministic scheduler, controller-aware hook bridge, provider
and process boundaries, attempt/workspace/Git pipeline, verification/finalization,
application service, operator control surface, and an injected offline composer.

The installed command remains deliberately default-deny. It exposes bounded reads,
effect-free shadow planning, and exact non-amplifying stop publication for an existing
run. Start, resume, clean, lock recovery, provider, signal, workspace, Git, task,
final-ref, and live-canary effects have no shipped protected issuer. Decision 0027 makes
that disabled state the accepted completion boundary for this task; live activation is
not inferred from receipt-shaped data, tests, or the offline composer.

## Implemented Slices

| Slice | Result |
| --- | --- |
| Protocol and reducer | Closed JCS schemas and enums for every persisted v1 record, exact bindings/provenance, typed attempt and operation transitions, deterministic replay, and counterfactual mutants. |
| Ledger and runtime | Descriptor-anchored append-only records/controls, exclusive locks and epochs, immutable replay, exact cache repair, crash-cut recovery, two-fence resume, control acceptance, lifecycle writer seams, and quiescence. |
| Provider, prompt, and process | Exact Codex 0.147.0 launch contract, static hook/profile identity separated from dynamic orientation input, closed Root result provenance, controller descriptor and continuity pinning, bounded/no-follow result reads, process handles, and per-signal authorization. |
| Scheduler and waiting | Deterministic background/Root lanes, dependency/path/resource/WIP constraints, real child-process concurrency barrier, stable waits, durable deadline wakes, and correction-generation staleness. |
| Workspaces and candidates | Durable allocate/launch/freeze/ingest/accept-or-reject/cleanup attempt lifecycle, non-subtractable protected paths, exact descriptor-byte hashes, path/link/swap defenses, private Git candidates, and replay-safe intent-before-effect. |
| Verification and finalization | Candidate-tree-bound gates, correction handling, exact resource receipts, Git/task/ref CAS, asynchronous forward recovery, and fresh authorization at every finalization boundary. |
| Application lifecycle | Fresh Root semantic ticks for declare/integrate/reject/correct/gate/wait/finalize, durable fan-in, stop dominance, restart attachment, attempt/process recovery, and fail-closed ambiguity handling. |
| Operator and package | Redacted status, events/doctor/lock inspection, deterministic stop publication, replay-authoritative external stop wake-up, issuerless packed package, state-preserving install/rollback, and exact package inventory. |
| Offline composition and resources | Shipped `offline_injected` composer around a pre-opened branded ledger and explicit leaf ports; real ephemeral/fixed TCP fixtures plus database/cache/container-style namespaces and exact cleanup identities. |

## Recovery And Security Decisions

- Ready-task activation is journaled before task mutation. Response loss or an Active
  replan reuses the original immutable run and activation operation instead of creating a
  second run.
- The Root provider result is one closed envelope binding WorkerResult, decision proposal,
  orientation, dynamic prompt input, and raw result bytes. The application persists and
  validates that envelope; it accepts no proposal side channel.
- Stop publication is durable authority; its abstract Unix-socket doorbell is only an
  untrusted hint. The runtime subscribes before replay and acts only on a current durable
  control. Concurrent provider waits share one settlement path.
- Shipped libraries expose no general effect-capability or ledger-write issuer. Test-only
  instrumentation is excluded from package bytes and proves mechanics without becoming a
  production trust root.
- Derived snapshots are caches only. Fresh attachment replays immutable evidence and
  atomically repairs missing, corrupt, or divergent caches under the exact run lock.
- Ambiguous process, workspace, resource, Git, task, or finalization evidence is retained
  and reconciled or quarantined; it never authorizes a blind retry or broad cleanup.

## Verification Checkpoint

- `node --test tests/implementation-*.test.mjs`: 270 passed, 0 failed, 1 privileged
  foreign-owner check skipped.
- `node --test tests/npm-package.test.mjs`: 13 passed.
- `npm run --silent test:package`: 357 passed, 0 failed, 1 environment-dependent owner
  check skipped.
- `node --test tests/npm-package.test.mjs`: 13 passed.
- `npm run --silent package:check`: passed with an exact 87-file inventory, size 346338,
  SHA-256 `bb70221d1257dbb99f205972bd1125a95c7232622fd9ff92b91513d7411286d8`.
- Final full `node --test --test-reporter=dot tests/*.test.mjs`: exited 0. An earlier
  full-load run exceeded the 10,000-task fixture's 60-second outer test deadline while
  unchanged isolated runs passed in 39-50 seconds; the outer load budget is now 120
  seconds with every functional and bounded-output assertion unchanged.
- Independent Reviewer: approved the offline, default-deny scope; no live-effect approval.
- Security approved the offline, default-deny scope after the package-policy and exact
  Root launch provenance repairs.
- Independent QA: approved the offline, default-deny scope after an independent full
  suite exit 0 (457 passed, 1 privileged-owner skip), package and audit reruns, and task
  doctor/diff checks.
- Terminal task record version 9, task-store doctor, staged doctor, and unstaged/staged
  diff checks passed; the required scoped local commit records the completed change.

## Deliberately Unverified Live Boundary

No test in T-0054 proves a protected issuer, real Codex hook/tool/environment separation,
same-user process isolation, descendant-complete containment, stale-process takeover,
or live provider/signal/workspace/Git/task/final-ref effects. The local process adapter
therefore never claims descendant completeness, the installed operator has no forward
activation source, and live shadow/canary execution remains closed. A later accepted
decision must define issuance, recognition, revocation, delivery, compatibility, and
containment before any of those paths can be enabled.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-08-14 | Captured, selected, and framed T-0054 | Task record revisions 1-2, Decision 0025, protocol, quality record, and threat model |
| 2026-08-14 | Completed and committed the initial component checkpoint | `9ed2d59`; focused implementation and full repository checks passed |
| 2026-08-14 | Blocked on prompt-bootstrap trust repair | T-0055 framed and completed in `59b3396` |
| 2026-08-15 | Recovered T-0054 and mapped the disconnected lifecycle | Task-recovery reconciliation, current Git/task evidence, independent architecture inventory |
| 2026-08-15 | Closed protocol, runtime, hook, process, workspace, Git, finalization, application, operator, and package seams | Focused crash, recovery, concurrency, provenance, mutation, and adversarial suites |
| 2026-08-15 | Removed shipped protected issuers and adopted the two-fence/non-amplifying operator boundary | Decision 0027, packed forgery negatives, issuerless package namespace |
| 2026-08-15 | Added replay-authoritative external stop wake-up, offline composer, and resource fixtures | External two-job stop, composer lifecycle, TCP/namespace cleanup tests |
| 2026-08-15 | Completed final offline verification | Implementation suite, packed client, reproducible package audit, full-suite/isolated-timeout evidence, independent gates |
