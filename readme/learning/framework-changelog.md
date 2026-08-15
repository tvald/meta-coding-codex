# Framework Changelog

This framework-source repository records its own framework edits in
`readme/learning/framework-changelog.md`. Immutable npm clients do not receive or
maintain a framework changelog; accepted upstream fixes ship only through an exact
dependency and lockfile replacement. This source-owned boundary is established by
[Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).

Keep entries append-only. Limit the active file to 20 entries or 160 lines; move older
entries unchanged to `readme/archive/framework-changelog-YYYY.md` and link the archive.
Review sunset triggers during the scheduled hygiene pass in
[knowledge management](../meta/knowledge-management.md).

Archived entries: [2026](../archive/framework-changelog-2026.md).

## 2026-08-15: Revise Controller Activation And Complete Offline Lifecycle

- Status: Revised; protected live effects remain disabled.
- Evidence: T-0054 closed protocol/runtime/application, crash, concurrency, package,
  resource, adversarial, and independent gate evidence; see
  [Decision 0027](../decisions/0027-revise-controller-operator-activation.md).
- Change: Added the durable application lifecycle, exact attempt/workspace/Git pipeline,
  Root launch/result provenance, replay-authoritative external stop wake-up, two-fence
  resume, issuerless protected-effect boundary, and shipped injected offline composer.
- Success signal: The complete offline lifecycle replays without blind effects; packed
  clients expose only reads/shadow/non-amplifying stop and reject forged forward authority.
- Review or sunset trigger: A live issuer proposal, missed durable stop, stale/wrong Root
  result, descendant-completeness proof, sandbox/Git escape, or package authority drift.

## 2026-08-14: Adopt Transactional Prompt Bootstrap Activation

- Status: Adopted.
- Evidence: T-0055 incident reproduction and the observed implementation and independent
  gate results recorded in its quality record; see
  [Decision 0026](../decisions/0026-adopt-transactional-prompt-bootstrap.md).
- Change: Replaced live-worktree lifecycle compilation with content-addressed Git-common
  generations, explicit ABA-safe activation, session pins, a verified standalone loader,
  buffered literal fallback, direct rollback, and conservative cleanup.
- Success signal: Prompt edits stay inactive, running sessions keep exact bytes through
  resume/clear/compact, and a broken loader degrades Root to local `AGENTS.md` without
  granting specialist or framework continuation authority.
- Review or sunset trigger: Provider lifecycle drift, mixed session bytes, failed
  rollback, fallback authority expansion, or a runtime path that imports candidate source.

## 2026-08-14: Adopt The Concurrent Implementation Controller

- Status: Adopted with live effects disabled.
- Evidence: T-0051 transcript measurements, T-0052 command-boundary evaluation, T-0053
  design gates, and T-0054 protocol, ledger, scheduler, provider, workspace, Git,
  finalization, verification, package, recovery, and independent gate evidence; see
  [Decision 0025](../decisions/0025-adopt-concurrent-implementation-controller.md).
- Change: Added the explicit `meta implement` phase boundary, canonical execution ledger,
  deterministic one-tick Root convergence, bounded concurrent specialist scheduling,
  exact provider/role contracts, fenced single-writer plans, operator reads, shadow mode,
  and state-preserving rollback. All effects require protected activation evidence.
- Success signal: Fresh bounded jobs and durable files replace one accumulating autonomous
  Root context while stale task, process, ownership, resource, check, and Git evidence
  fail closed without losing recoverable state.
- Review or sunset trigger: Wrong-role launch, missed stop, stale effect, sandbox/Git
  escape, duplicate finalization, resource corruption, unbounded ledger/context, provider
  drift, or evidence that tick freshness costs more than it saves.

## 2026-08-14: Simplify File Task Store Recovery And Durability

- Status: Revised.
- Evidence: T-0039 counterfactual crash, lock, shard, hard-link, containment, and
  targeted-Git-recovery cases under the accepted
  [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md).
- Change: Replaced staged lock-owner identity with one recoverable directory claim,
  tolerated empty shards, removed special first-record staging and redundant source
  directory flushes and path checks, and allowed safe hard-linked canonical records.
- Success signal: Interrupted publication preserves either the old or new canonical
  record; bounded explicit recovery retains exact valid-token comparison; initializer
  preservation and both TaskStore adapters remain compatible.
- Review or sunset trigger: Lost or partial task facts, unsafe path traversal, a removed
  durability guard proving necessary, unbounded recovery, or backend conformance drift.

## 2026-08-13: Revise The Structured Task Store For Adapters

- Status: Revised.
- Evidence: T-0036/T-0041 reviews, T-0037 ordering, T-0044's baseline, independently
  adopted T-0045/T-0046 boundaries, T-0038 concurrency QA, and T-0047–T-0049 reference
  certification; see
  [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md).
- Change: Kept FileTaskStore canonical; extracted/routed contracts; made reads lock-free,
  scoped locks per worktree, removed public digest CAS, moved narrative checks
  to doctor/targeted context, certified a reference-only SQLite adapter, isolated the
  frozen Format 1 importer behind onboarding with a 1.x sunset, advanced the task CLI
  contract to 3.0.0, and rejected S3.
- Success signal: Both adapters satisfy the common suite and differential semantic trace;
  SQLite remains non-selectable without weakening domain invariants.
- Review or sunset trigger: conformance exceptions, lost task facts, partial publication,
  a production backend proposal, or evidence that a removed local guard was necessary.

## 2026-08-12: Revise Codex Child-Agent Disablement

- Status: Revised.
- Evidence: T-0035 reproduced four `AgentRoleToml` deserialization failures on Codex
  0.144.1; current Codex configuration documents `features.multi_agent` as the stable
  collaboration-tool flag; see
  [Decision 0023](../decisions/0023-revise-codex-child-agent-disablement.md).
- Change: Replaced the per-manifest `[agents] enabled = false` table with
  `features.multi_agent = false` while retaining the static no-delegation guard.
- Success signal: All four manifests load without warnings and delegated profiles still
  lack multi-agent tools on the supported exact-dispatch release.
- Review or sunset trigger: malformed-role warnings, a child collaboration tool, or a
  provider change to feature flags or standalone-agent layering.

## 2026-08-12: Revise Verification Reactivation Lifecycle

- Status: Revised.
- Evidence: T-0034 counterfactual lifecycle regression, source and packed-client
  transition matrices, 105-test full suite, reproducible 55-file package audit, and
  independent Reviewer and QA passes after their initial CAS/next-action findings.
- Change: Added the one guarded `Needs verification` to `Active` checkpoint path for a
  runnable delayed check that exposes an implementation defect, while preserving the
  semantic revision and global task-state invariants. Advanced the additive task CLI
  compatibility contract to 1.1.0.
- Success signal: A delayed verification defect can resume repairs without an amendment
  or terminal close, while other states, paused scheduling, and a competing Active task
  fail before target-record mutation.
- Review or sunset trigger: concurrent primaries, bypassed gates or dependencies, lost
  revision evidence, general checkpoint activation, or another unrepresentable check result.

## 2026-08-12: Adopt Codex Lifecycle Prompt Injection

- Status: Adopted.
- Evidence: T-0033 hook/compiler, collision/recovery, packed-client, live Codex, and
  independent gate evidence; see [Decision 0022](../decisions/0022-adopt-codex-hook-prompt-injection.md).
- Change: Added a versioned hook adapter, project-level exact lifecycle matchers, four
  nested-disabled `meta_` custom agents, and opt-in guarded client delivery.
- Success signal: Current package profiles reach root and exact delegated developer
  context without a model-initiated load, overwrite, prompt spill, or role inference.
- Review or sunset trigger: provider schema/trust drift, wrong or missing profile,
  escaped write, collision overwrite, or mechanical nested-delegation support.

## 2026-08-11: Verify The Immutable NPM Release Candidate

- Status: Adopted.
- Evidence: T-0031 public-release inspection, exact package audit and publish dry run,
  aggregate clean-client replacement/rollback fixture, 56-test package matrix, 94-test
  full suite, and independent completion gates in its quality record.
- Change: Added one offline exact-lock journey that exercises every packaged prompt and
  documentation surface, proves lifecycle/fallback suppression, replaces a compatible
  package candidate, and restores prior manifest, lock, package tree, and client state.
- Success signal: The unpublished candidate is reproducible and locally releasable without
  copied policy, package mutation, unsafe execution, compatibility drift, or rollback loss.
- Review or sunset trigger: A public version appears, registry/release evidence changes,
  rollback drifts, a supported runtime fails, or publication prerequisites are authorized.
