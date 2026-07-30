# Framework Changelog Archive: 2026

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
