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

## 2026-07-30: Adopt The Agent Adapters And Skip The Pilot Disposition

- Status: Adopted.
- Evidence: Direct product-owner instruction and T-0015 grep, link, and budget checks; see
  [Decision 0016](../decisions/0016-adopt-adapters-and-skip-pilot-disposition.md).
- Change: Promoted the three role adapters from Pilot to Adopted and reframed the shipped
  meta wording accordingly, so a fresh install no longer inherits a "current pilot" it
  cannot inspect. Established a repository-local policy to skip the Pilot disposition and
  adopt framework changes directly, recorded in the operating contract and project state;
  the reusable Pilot mechanism is unchanged for other adopters.
- Success signal: No shipped file advertises a live adapter pilot, and framework changes
  here are dispositioned Adopt, Revise, or Reject.
- Review or sunset trigger: An adopted-directly change here regresses in a way staged
  piloting would have caught, or the owner reinstates piloting.

## 2026-07-30: Adopt Tiered Per-Window Usage Cutoffs

- Status: Adopted.
- Evidence: Product-owner instruction on quota waste and T-0014 budget, hardcoded-cutoff
  grep, and link checks; see
  [Decision 0015](../decisions/0015-tiered-usage-capacity-cutoffs.md).
- Change: Generalized the capacity guard to threshold every advertised window—five-hour,
  weekly, each model-scoped window, and monthly—and replaced the flat 95% cutoff with
  tiered 95% five-hour, 98% weekly, and 99% monthly, so long-window quota stays usable
  while an accidental hard-limit hit that would terminate the orchestrator is still
  prevented. Aligned the resumption capacity-wait trigger and the task-notes template.
- Success signal: The guard thresholds the windows its skills report and reserves only a
  small margin on distant-reset windows.
- Review or sunset trigger: An accidental hard-limit crossing despite the guard, or a new
  provider window class the tiers do not cover.

## 2026-07-30: Add A Claude Code Usage Telemetry Skill

- Status: Adopted.
- Evidence: Product-owner instruction, a live `oauth/usage` read confirming model-scoped
  windows, an independent Security And Risk Agent review with no Critical or High
  findings, and T-0012 containment, inventory, and installer checks; see
  [Decision 0014](../decisions/0014-add-claude-usage-telemetry-skill.md).
- Change: Added the optional `claude-quota-monitor` skill whose credential-scoped `node`
  reader parses the authoritative `limits[]` array first, preserves model-scoped windows,
  and prints only normalized capacity fields while keeping the token inside the
  subprocess. Shipped it through the additive core installer by packaging `.claude/skills`
  and pointed the capacity guard at it. This is the framework's first credential-reading
  surface, bounded by a threat-model card.
- Success signal: A Claude Code Root Orchestrator obtains current five-hour, weekly,
  model-scoped, and monthly windows without credential material entering the conversation.
- Review or sunset trigger: Any credential leak, dropped window, missed cutoff, endpoint
  schema change, or a second copy of the reader.
