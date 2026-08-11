# Framework Changelog

This upstream framework-source repository records its own framework edits here so the
distributed [blank changelog seed](../meta/framework-changelog.md) never carries source
project history. This is the project-specific override established by
[Decision 0017](../decisions/0017-ship-blank-framework-changelog-seed.md); installed
frameworks use the meta-path log.

Keep entries append-only. Limit the active file to 20 entries or 160 lines; move older
entries unchanged to `readme/archive/framework-changelog-YYYY.md` and link the archive.
Review sunset triggers during the scheduled hygiene pass in
[knowledge management](../meta/knowledge-management.md).

Archived entries: [2026](../archive/framework-changelog-2026.md).

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

## 2026-08-11: Adopt A Guarded Project-Onboarding Skill

- Status: Adopted.
- Evidence: Product-owner promotion of the T-0017/T-0018 recommendations; T-0021
  skill-creator validation, 30-test suite, 46-file reproducible package, additive and
  atomic-collision installer fixtures, forward tests, and independent design/security
  and final Reviewer/Security/QA passes; see
  [Decision 0019](../decisions/0019-adopt-guarded-project-onboarding-skill.md).
- Change: Added one maintained onboarding skill with a thin Claude discovery link,
  exact preflight disposition handling, command-execution limits, and bounded cold-start
  proof. Hardened preflight against symlinked documentation ancestors and made same-name
  cross-harness skill installation an atomic collision bundle.
- Success signal: A fresh Root completes every onboarding phase, while delegated,
  colliding, malformed, unsupported, or mixed-origin states stop without unsafe writes.
- Review or sunset trigger: Missed phase, overwrite, mixed-origin skill, unsafe command,
  provider discovery drift, or cold-start recovery failure.

## 2026-08-11: Adopt A Structured Task Store And Framework Data CLI

- Status: Adopted.
- Evidence: Product-owner malformed-row report and implementation direction; T-0017–
  T-0020 analysis; Decision 0018; 26 passing tests; independent architecture, security,
  code, migration/package, and verification gates; exact 43-file package and fresh
  install checks.
- Change: Replaced the hand-edited task table and archive workflow with sharded canonical
  JSON records behind a dependency-free Node CLI. Added bounded queries, semantic CAS
  mutations, strict migration, outside-canonical crash-safe staging, explicit lock
  recovery, and integrated structural/process doctor checks across startup, packaging,
  installation, and CI.
- Success signal: malformed or stale state fails closed; normal startup remains bounded
  at 10,000 tasks; terminal history stays queryable without archive movement; a killed
  pre-claim writer cannot corrupt canonical state.
- Review or sunset trigger: lost task data, unbounded query/context growth, broken lock
  recovery, platform durability demand, migration ambiguity, or direct-edit incidents.

## 2026-08-05: Reconcile Downstream Framework Changes And Ship A Changelog Seed

- Status: Revised; individual imported groups were Adopted, Revised, or Rejected under
  the source repository's skip-Pilot policy.
- Evidence: Product-owner instructions through T-0016@r2, two downstream failure signals
  transferred into the task note, an independent Reviewer audit, exact 36-entry package
  and installer inventories, reproducible archives, and positive and negative install
  fixtures; see [Decision 0017](../decisions/0017-ship-blank-framework-changelog-seed.md).
- Change: Added the blank meta-path changelog seed and kept upstream framework-development
  state project-side; adopted a repository-backed auxiliary-memory rule, a collision-safe
  ~20-row task-catalog budget with concise cells, and context-triggered decision review;
  rejected the foreign task schema, KB projection, worker-write, and intermediate-commit
  rules. Extended package and installer validation so local changelog entries cannot
  enter a clean installation.
- Success signal: A fresh install contains one blank, self-describing changelog seed;
  producer, consumer, and CI-derived inventories agree; foreign state and populated-seed
  mutations fail before destination mutation; upstream task and audit history remains in
  project-side records.
- Review or sunset trigger: A populated seed ships or installs, producer/consumer
  inventory diverges, the source-versus-consumer state boundary confuses an adopter, or
  the 20-row catalog trigger overwrites or obscures archived task history.
