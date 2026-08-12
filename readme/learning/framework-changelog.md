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

## 2026-08-11: Adopt Deterministic Agent Prompt Views

- Status: Adopted.
- Evidence: T-0027 all-profile snapshots, packed parity, mutation and filesystem suite,
  exact package audit, and independent Architect, Security, QA, and Reviewer gates; see
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Change: Added 30 one-owner marked facets, five complete role profiles, narrow
  Codex/Claude adapters, deterministic digest provenance, and bounded `docs`/`explain`.
- Success signal: Source and installed clients produce identical attributable prompts
  without package-path discovery, client state, provider data, or runtime synthesis.
- Review or sunset trigger: Owner/profile drift, digest ambiguity, unsafe lookup,
  harness semantic divergence, authority expansion, or output-budget exhaustion.

## 2026-08-11: Adopt Package-Owned Provider Probes

- Status: Adopted.
- Evidence: T-0032 fixture and live normalized probes, exact package audit, full
  regression suite, threat model, and independent Architect, Security, QA, and Reviewer
  gates; see [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Change: Replaced copied quota procedures with versioned package commands for normalized
  Codex and Claude quota and delegation evidence, including strict schema drift,
  credential/redaction, client-root executable, process-group, and safe-stop controls.
- Success signal: Shared policy invokes one provider-neutral command and receives only
  bounded evidence; malformed, unavailable, unsafe, or orphaning providers stop safely.
- Review or sunset trigger: Credential or provider data leak, false-safe capacity,
  capability-as-authority use, schema drift, client executable invocation, or orphan.

## 2026-08-11: Adopt The Installed Package Task Runtime

- Status: Adopted.
- Evidence: T-0026 packed-client mutation and adversarial root/metadata/lock fixtures,
  full task-store regression suite, reproducible package audit, and independent
  architecture, security, QA, and Reviewer gates; see
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Change: Exposed the guarded task store beneath the immutable package binary, separated
  package resources from one physically validated client Git root, declared task-format
  compatibility in package metadata, and rejected untrusted Git and lockfile inputs.
- Success signal: An installed client can initialize and mutate its task store without a
  copied meta tree or writes beneath the package, while mismatched roots and metadata
  fail before client mutation.
- Review or sunset trigger: Package/client path confusion, package mutation, manifest or
  schema drift, bypassed lock integrity, unsafe Git discovery, or task CLI regression.

## 2026-08-11: Adopt A Guarded Task-Recovery Skill

- Status: Adopted.
- Evidence: Product-owner promotion of T-0017/T-0018 findings; T-0022 bounded scenario,
  package, installer, forward, and independent gates; see
  [Decision 0020](../decisions/0020-adopt-guarded-task-recovery-skill.md).
- Change: Added one proposal-only recovery skill with a thin Claude link, finite
  dispositions, bounded task/Git evidence, and conservative revision, effect, approval,
  worker, verification, and capacity handling.
- Success signal: Interrupted work yields one evidence-backed safe action without stale
  output, uncertain retry, ownership guesses, or unbounded history reads.
- Review or sunset trigger: Duplicated effect, overwritten work, false completion,
  provider discovery drift, unbounded context, or demonstrated need for a helper.
