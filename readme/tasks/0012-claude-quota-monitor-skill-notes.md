# Claude Quota Monitor Skill Notes

## Task Cursor

- Name: Add a Claude Code usage-telemetry skill
- Started: 2026-07-30
- Last updated: 2026-07-30
- Status: Done
- Route: Initiative
- Latest user instruction: Proceed with the HTTP-read approach, keep credentials out of
  the LLM context via a subprocess, route it through the security reviewer, then write the
  durable records and commit on the existing branch.
- Goal and completion criteria: Ship a credential-safe Claude telemetry skill and its
  packaging, pass an independent security review, align records, and commit.
- Next safe action: None after the task-scoped commit; exercise the skill on the next
  eligible delegated task on Claude Code.

## Plan

- [x] Evaluate the imported reference and the current Codex App Server path live.
- [x] Implement the `limits[]`-first, credential-scoped reader as a skill.
- [x] Wire the guard pointer, packaging, and CI inventory.
- [x] Route the change through the Security And Risk Agent and resolve findings.
- [x] Write decision, threat, quality, changelog, catalog, and cursor records and commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Claude telemetry skill | Done | Root Orchestrator | `.claude/skills/claude-quota-monitor/` | Live read, containment, `node --check` | Exercise on eligible delegated work |
| Installer and packaging | Done | Root Orchestrator | `scripts/*.sh`, `publish-core-latest.yml` | Inventory match, shellcheck, e2e | Review at trigger |
| Framework integration | Done | Root Orchestrator | Guard pointer, meta README, Decision 0014 | Ownership and dependency review | Review at trigger |
| Security and quality | Done | Root Orchestrator + Security And Risk Agent | Threat, quality, catalog, changelog, cursor | High gate and consistency | Maintain at normal cadence |

## Repository And Verification State

- Changed files: The new skill; guard pointer and meta README; `package-core.sh`,
  `install-core.sh`, and the publish workflow; hardened `USAGE_LIMITS.md`; Decision 0014;
  threat, quality, task, catalog, changelog, and cursor records.
- Recent commits: `0a8cd76` (adapter/skill packing) was `HEAD` on branch
  `fix/installer-pack-adapters` when this task's work began.
- Commands already run and observed results: Live usage read returned five-hour 15-17%,
  weekly 2%, model-scoped `Fable` 0%, monthly absent; token never appeared in stdout or
  stderr; a malformed credential file yielded only a generic reason; packer, installer,
  and CI inventories matched and the archive was byte-identical across two runs; the
  offline installer placed 9 adapter files on a fresh repo and preserved a pre-existing
  custom skill; `shellcheck` and `node --check` were clean; the Security And Risk Agent
  returned no Critical or High findings.
- Required checks remaining: None.
- Decisions and assumptions since start: Keep the reader inline and Markdown-only; defer a
  monthly-window and tiered-cutoff guard change to a separate decision.

## Parked Approvals

None.

## Worker Roster

| Worker | Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| `security-reviewer` | Independent review of the credential-reading skill and installer | Read-only inspection | Complete | No Critical/High; two lower findings resolved | Do not restart unless the reader or credential handling changes |

## Usage Capacity

- Last authoritative meter reading: 2026-07-30T08:55Z via the Claude usage surface.
- Five-hour window consumed and reset time: 17%, reset 2026-07-30T09:10:00Z.
- Weekly window consumed and reset time: 2%, reset 2026-08-04T08:00:00Z; model-scoped
  `Fable` weekly 0%, reset time not advertised.
- Limiting or unknown windows: None; monthly not advertised.
- Wake method and time: None; no window reached its cutoff.
- Resume condition and next safe action: Capacity was safe; work continued to completion.

## Attempts And Dead Ends

| Attempt | Observed Evidence | Why Abandoned | Retry Only If |
| --- | --- | --- | --- |
| Adopt the imported reader verbatim | It reads only flat `seven_day` and echoes `error.message` | It drops model-scoped windows and can leak a credential fragment | Never; the hardened `limits[]` reader supersedes it |
| Bundle the reader as a script file | The packager admits only Markdown/YAML skill files | The framework contract bars bundled executable code | An observed parsing failure justifies a helper and a new decision |

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-30 | Evaluated the imported reference and confirmed the Codex path live | Live `oauth/usage` and App Server reads |
| 2026-07-30 | Implemented the credential-scoped `limits[]` reader and packaging | Skill, guard pointer, and installer diff |
| 2026-07-30 | Passed an independent security review and resolved two findings | Review handoff, hardened `USAGE_LIMITS.md`, threat model |
| 2026-07-30 | Wrote durable records and prepared the task-scoped commit | Decision 0014, quality, catalog, changelog, cursor |
