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

## 2026-07-14: Rename The Moving Latest Release

- Status: Adopted.
- Evidence: Direct product-owner instruction and T-0011 workflow-path checks.
- Change: Renamed the moving `latest` release display title to `core-framework` without
  changing its tag, asset, permissions, or publication sequence.
- Success signal: Both release creation and update apply the new title.
- Review or sunset trigger: A published `latest` release retains a different title.

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
