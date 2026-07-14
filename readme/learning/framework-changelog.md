# Framework Changelog

Every framework edit is recorded here so it can be audited, evaluated, and reverted.
Keep entries append-only. Limit the active file to 20 entries or 160 lines; move older
entries unchanged to `readme/archive/framework-changelog-YYYY.md` and link the archive.
Review pilots and sunset triggers during the scheduled hygiene pass in
[knowledge management](../meta/knowledge-management.md).

Archived entries: [2026](../archive/framework-changelog-2026.md).

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

- Status: Adopted.
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

## 2026-07-10: Pilot Optional Codex And Claude Code Agent Adapters

- Status: Pilot.
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
