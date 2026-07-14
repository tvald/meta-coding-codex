# Task Notes: Core Package Script

## Task Identity

- Task ID: T-0007
- Catalog: `readme/tasks/README.md`
- Brief or acceptance source: [Task brief](0007-core-package-script-brief.md)
- Started: 2026-07-14
- Last updated: 2026-07-14
- Accepted task revision: r1

## Execution Checkpoint

- Completed safe increment: Integrated independent review, resolved every finding, and
  passed the complete package, portability, extraction, collision, and documentation
  matrix.
- Current repository or external state: `HEAD` is `fac8e5c`; T-0007 implementation and
  durable records are uncommitted; no generated archive remains in the worktree.
- Resume constraints: Do not package host state or optional integrations; Root is the
  sole writer of shared records; any delegated review remains read-only.

## Plan

- [x] Record T-0007 and define the archive contract.
- [x] Implement the shell command and usage guidance.
- [x] Verify positive, negative, reproducibility, extraction, and bootstrap scenarios.
- [x] Integrate independent review, close records, and commit.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Package command | Done | Root Orchestrator | `scripts/package-core.sh` | Shell, safety, inventory, reproducibility | None |
| User guidance | Done | Root Orchestrator | `README.md` | Command and boundary review | None |
| Durable records | Done | Root Orchestrator | Task catalog, task/decision/quality/threat/learning/cursor | Links and consistency | None |
| Independent review | Done | Read-only reviewer | Script, docs, archive contract, observed checks | Concrete findings or justified zero-finding result | None |

## Repository And Verification State

- Changed files: Package script and ignore rule; README and project standards; task,
  decision, quality, threat, learning, catalog, and cursor records.
- Recent commits: `fac8e5c docs(framework): reconcile imported task-loop state` is the
  clean starting `HEAD`.
- Commands already run and observed results: `/bin/sh` syntax and ShellCheck pass; the
  archive contains 26 expected 0644 files and 76 valid local links/anchors; repeated and
  altered-metadata/environment builds share SHA-256 `63efb6f...1954a8`; argument,
  dependency, source-type/symlink, traversal, physical-path, destination, preserved
  failure, portable-temp, valid-replacement, fresh/missing-catalog bootstrap, and
  existing AGENTS/cursor/catalog collision fixtures pass.
- Required checks remaining: None after the completion-record rerun and final staged
  review; create the task-scoped commit and confirm status.
- Decisions and assumptions since start: Decision 0010 keeps automation outside the
  core, generates only the portable root prefix, and normalizes modes/timestamps.

## Parked Approval Detail

None.

## Worker Roster

| Worker | Task ID, Revision, And Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| `core_package_reviewer` | T-0007 r1: review script safety, archive boundary, and verification evidence | Read-only script, docs, records, and generated test archive | Complete | No blocker remains; five Medium and one Low finding resolved; separability confirmed | Do not restart unless the reviewed diff changes materially |

## Usage Capacity

- Last authoritative meter reading: 2026-07-14T05:04:59Z through initialized Codex App
  Server `account/rateLimits/read`.
- Five-hour window consumed and reset time: Not advertised; not applicable.
- Weekly window consumed and reset time: `codex` 14%, reset
  2026-07-21T04:02:22Z; model-specific bucket 0%, reset 2026-07-21T05:04:56Z.
- Limiting or unknown windows: None.
- Wake method and time: None.
- Resume condition: No child remains active; the task-scoped App Server was stopped
  after the final safe reading.

## Attempts And Dead Ends

None.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-14 | Accepted T-0007 as Quick change / High | Catalog row and task brief |
| 2026-07-14 | Implemented and passed the working archive matrix | Script, README, Decision 0010, and quality evidence |
| 2026-07-14 | Resolved independent portability, environment, and symlink-boundary findings | Physical paths, option sanitization, source validation, and trailing-X temp fixture |
| 2026-07-14 | Closed T-0007 after final independent and Root verification | Zero remaining reviewer blockers and completion records |
