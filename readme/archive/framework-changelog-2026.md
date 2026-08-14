# Framework Changelog Archive: 2026

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

## 2026-07-10: Address External Framework Critique

- Status: Adopted, with modified adoption for routing risk, approval authority, and
  parallel context publication.
- Evidence: Accepted user-provided review covering the full framework; detailed
  disposition in [Decision 0003](../decisions/0003-address-framework-critique.md).
- Change: Added project state, durable retrospectives, onboarding, artifact budgets,
  approval parking, and qualitative change review; consolidated routing and templates;
  strengthened verification completion and parallel recovery rules.
- Success signal: A cold-start agent can find active work and prior corrections, one
  route is sufficient to begin work, and quality/process changes no longer require
  duplicate templates or numeric self-scores.
- Review or sunset trigger: The state/log churn exceeds their recovery value, a removed
  template proves necessary in two real tasks, or a retained safety overlay creates
  classification conflicts.

## 2026-07-10: Package Framework Under `readme/meta/`

- Status: Adopted.
- Evidence: Direct user instruction and selected directory/reset contracts, recorded in
  [Decision 0004](../decisions/0004-package-framework-as-addon.md).
- Change: Made `readme/meta/README.md` the reusable agent entrypoint; moved all reusable
  process files and templates under meta; categorized this repository's mutable project
  documentation directly under `readme/`; and defined state-free packaging plus
  first-run onboarding.
- Success signal: A package containing root AGENTS guidance and `readme/meta/` passes
  local-link checks without project state and can initialize a fresh project cursor.
- Review or sunset trigger: An adopter packages state unintentionally, agents confuse
  the two README roles, or an in-place reset becomes a demonstrated need.

## 2026-07-10: Pilot Optional Codex And Claude Code Agent Adapters

- Status: Pilot. Active per [Decision 0005](../decisions/0005-pilot-optional-agent-adapters.md);
  this historical entry was moved here for changelog budget only, not sunset.
- Evidence: Current official Codex and Claude Code agent-discovery capabilities plus
  direct user instruction after an explicit adopt/pilot/reject evaluation; see
  [Decision 0005](../decisions/0005-pilot-optional-agent-adapters.md).
- Change: Added a root Claude-to-AGENTS bridge and thin Reviewer, Verifier, and Security
  Reviewer adapters for both harnesses; kept role semantics in the Markdown core and
  defined a removable, no-permission-expansion adapter contract.
- Success signal: Across five eligible non-trivial tasks, the adapters are useful at
  least twice—meaning a named invocation returns the canonical handoff and supplies
  recorded review or verification evidence—while causing no unnecessary delegation,
  permission expansion, or overlapping edits.
- Review or sunset trigger: Review on 2026-08-09 or after five eligible tasks,
  whichever comes first; revise or remove immediately after a trust-boundary or client
  discovery failure, and remove at review if unused, duplicative, or materially drifted.

## 2026-07-13: Add Codex Quota Monitor Skill

- Status: Adopted.
- Evidence: Direct product-owner implementation instruction, current official Codex
  skill/App Server documentation, and a successful installed-client telemetry read; see
  [Decision 0007](../decisions/0007-add-codex-quota-monitor-skill.md).
- Change: Added an optional dependency-free repo skill that opens one initialized Codex
  App Server connection, normalizes rate-limit windows, distinguishes valid absence from
  failed telemetry, and supplies Decision 0006's capacity guard.
- Success signal: Codex discovers the skill, obtains current quota without credential
  access, pauses on unsafe or genuinely unknown capacity, and leaves no orphan process.
- Review or sunset trigger: Discovery, schema, parsing, cutoff, cleanup, permission, or
  portability failure; add a helper only after observed reliability evidence.

## 2026-07-13: Guard Subagent Usage Capacity

- Status: Adopted. Superseded by [Decision 0015](../decisions/0015-tiered-usage-capacity-cutoffs.md)'s
  tiered per-window cutoffs; original flat-95% entry retained here unchanged.
- Evidence: Direct durable product-owner instruction; see
  [Decision 0006](../decisions/0006-guard-subagent-usage-capacity.md).
- Change: Made the Root Orchestrator monitor authoritative five-hour and weekly usage,
  suspend delegation at either 95% boundary or when telemetry is unknown, checkpoint
  workers, and use a reset timer with fresh-read verification or five-minute polling
  before resuming.
- Success signal: Eligible delegated work pauses without losing output or exhausting
  integration capacity and resumes only after both windows are observed safe.
- Review or sunset trigger: A missed cutoff, premature resume, lost checkpoint,
  unavailable meter, materially late resume, or provider/harness capability change.

## 2026-07-14: Adopt Imported Durable Task Orchestration

- Status: Adopted.
- Evidence: State-free task-loop import `d5ff9f5`, product-owner clarification about
  the import boundary, and independent T-0006@r2 review; see
  [Decision 0008](../decisions/0008-adopt-durable-task-orchestration.md) and
  [Decision 0009](../decisions/0009-authorize-bounded-project-delegation.md).
- Change: Added a mandatory host task catalog with additive non-FIFO intake, stable
  identity/revision and authority, task-scoped targeting/isolation, and bounded local
  delegation. Migrated this host's state separately, recognized catalog collisions by
  schema, and preserved project-local operating choices outside the portable startup
  merge.
- Success signal: A state-free package bootstraps or migrates host cursor/catalog state
  without copying history or overwriting existing documentation; tasks resume and close
  under the correct authority, revision, and commit boundary.
- Review or sunset trigger: A package contains host facts, onboarding overwrites a task
  index, stale task evidence is used, catalog staging mixes tasks, or delegation occurs
  without destination authority.

## 2026-07-14: Automate The Portable Core Archive

- Status: Adopted.
- Evidence: Direct product-owner instruction, T-0006's manual state-free fixture, and
  T-0007 positive, negative, reproducibility, extraction, and collision checks; see
  [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
- Change: Added a POSIX-shell command that packages only the portable `AGENTS.md` prefix
  and complete `readme/meta/` tree, validates exact inventory and integrity, normalizes
  file metadata, and safely replaces an ignored output archive.
- Success signal: Content-identical checkouts produce the same valid 26-entry zip, and
  no mutable host state, optional integration, or local authority enters it.
- Review or sunset trigger: Archive drift, unsafe replacement, missing core content,
  host-state leakage, or a demonstrated need to distribute executable runtime tooling.

## 2026-07-14: Publish A Moving Latest Core Release

- Status: Adopted.
- Evidence: Direct product-owner instruction, current official GitHub event/token/ref,
  release/action/runner sources, and T-0008 schema, archive, mock-transition, and install
  checks; see [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md).
- Change: Added a serialized two-job workflow that builds the T-0007 archive with read
  permission, transfers verified bytes, and uses a narrow write job to move `latest` and
  draft-safely replace one release asset after fail-closed exact release/ref discovery.
  Added collision-aware stable-URL install commands.
- Success signal: Every main push converges on the current verified core without an older
  run becoming final, and existing destination AGENTS guidance is preserved for merging.
- Review or sunset trigger: Stale final release, token expansion, persistent draft or
  asset mismatch, action/runner deprecation, or destination overwrite.

## 2026-07-14: Add A Fail-Closed Piped Core Installer

- Status: Adopted.
- Evidence: Direct product-owner instruction and T-0009 streamed, hostile-archive,
  collision, rollback, pathname-race, portability, and independent review checks; see
  [Decision 0012](../decisions/0012-add-fail-closed-piped-installer.md).
- Change: Replaced the inline extractor with a portable one-line curl-to-Bash installer
  that validates a producer-synchronized 26-file core before mutation, preserves host
  instructions, and bounds no-clobber claims and rollback inside the destination. Added
  a workflow check that prevents producer/installer inventory drift.
- Success signal: A fresh adopter root receives only the reusable core, existing host
  state remains unchanged, and incomplete streams, hostile archives, collisions, or
  local path replacement leave no escaped or installer-owned partial content.
- Review or sunset trigger: Inventory drift, overwrite, escaped write, partial install,
  portability failure, remote-source compromise, or need for signed/update semantics.

## 2026-07-14: Streamline The Piped Installer Command

- Status: Adopted.
- Evidence: Direct product-owner preference and T-0010 stream/install review; see
  [Decision 0013](../decisions/0013-streamline-installer-invocation.md).
- Change: Replaced the outer pipefail wrapper with conventional `curl -fsSL URL | bash`
  syntax and moved guarded-stream completion detection into the installer.
- Success signal: Complete pipes install unchanged, guarded truncations fail before
  mutation, and the unavoidable upstream-status pipeline limitation remains visible.
- Review or sunset trigger: Hidden install failure, truncation mutation, or preference
  for strict upstream-status propagation over the shorter command.

## 2026-07-14: Rename The Moving Latest Release

- Status: Adopted.
- Evidence: Direct product-owner instruction and T-0011 workflow-path checks.
- Change: Renamed the moving `latest` release display title to `core-framework` without
  changing its tag, asset, permissions, or publication sequence.
- Success signal: Both release creation and update apply the new title.
- Review or sunset trigger: A published `latest` release retains a different title.

## 2026-07-30: Pack Harness Adapters And Skills Into The Installer

- Status: Adopted.
- Evidence: User bug report and T-0013 inventory, reproducibility, additive-install,
  symlink-escape, and negative-packaging checks; records backfilled for commit `0a8cd76`.
- Change: Made `package-core.sh` stage and type-validate `.claude/agents`, `.codex/agents`,
  and `.agents/skills`, and made `install-core.sh` and CI carry them in the exact core
  inventory and install them additively without overwriting same-name host files or
  traversing symlinked path components.
- Success signal: A deployed repository receives the adapters and quota skill, and the
  packer, installer, and CI inventories agree.
- Review or sunset trigger: A packaged tree drifts from the installer inventory or an
  additive install overwrites a host file.

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
