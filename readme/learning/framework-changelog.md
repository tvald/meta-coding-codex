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

## 2026-08-11: Retire Copied-Core Delivery

- Status: Adopted.
- Evidence: T-0030's frozen architecture and security contract, the exact reviewed
  pre-npm snapshot at `c90211b9a2cd888a1796dbd584384fd1f9eaa132`, and its 49-entry
  data-only transition manifest; final verification remains in the T-0030 quality record.
- Change: Retired ZIP, moving-release, and curl delivery artifacts; removed the
  client-side changelog seed; retained source-only discovery bundles outside the npm
  tarball; and documented exact package replacement, rollback, upstream contribution,
  and conservative copied-client transition guidance.
- Success signal: Every supported client path uses the immutable local npm dependency,
  while old copied clients receive only bounded provenance guidance and inert ownership
  data rather than executable cleanup.
- Review or sunset trigger: A live copied-core path, mutable installed package, client
  framework log, ambiguous legacy deletion, source-bundle tarball leak, or replacement
  path that does not bind manifest and lockfile together.

## 2026-08-11: Adopt Thin Harness Bootstraps And Guarded Client Initialization

- Status: Adopted.
- Evidence: T-0029 packed clean clients, exact bootstrap/state snapshots, populated-store
  and restrictive-umask fixtures, 88-test regression suite, reproducible package audit,
  and independent Architect, Security, QA, and Reviewer gates; see
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Change: Added exact thin Codex/Claude discovery files and a Linux descriptor-anchored,
  lock/journal-backed initializer for minimum client-owned cursor and task state.
- Success signal: Installed clients initialize or resume without copied framework policy,
  package mutation, lifecycle hooks, wrong-root writes, or preserved-state drift.
- Review or sunset trigger: Bootstrap/profile drift, overwrite, escaped or partial write,
  metadata/store race, recovery ambiguity, provider-discovery change, or platform demand.

## 2026-08-11: Adopt Locked Data-Only Prompt Extensions

- Status: Adopted.
- Evidence: T-0028 packed clients, all 15 disabled-extension snapshots, deterministic
  composition/provenance, 81 hostile mutations, exact package audit, and independent
  Architect, Security, QA, and Reviewer gates; see
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Change: Added an ordered explicit client allowlist for exact direct dependencies whose
  lock-bound, bounded, lifecycle-free Markdown skill facets append to declared profiles
  without scanning, execution, core override, or ambiguous provenance.
- Success signal: Reviewed extension facets compose equally across harnesses and fail
  before stdout on identity, lock, schema, filesystem, conflict, or budget drift.
- Review or sunset trigger: Implicit discovery, extension execution, lock/root bypass,
  core shadowing, nondeterminism, provenance ambiguity, or output-budget exhaustion.
