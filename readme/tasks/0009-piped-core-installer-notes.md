# Task Notes: Piped Core Installer

## Task Identity

- Task ID: T-0009
- Catalog: `readme/tasks/README.md`
- Brief or acceptance source: [Task brief](0009-piped-core-installer-brief.md)
- Started: 2026-07-14
- Last updated: 2026-07-14
- Accepted task revision: r1

## Execution Checkpoint

- Completed safe increment: Implemented and independently reviewed the portable piped
  installer, producer/consumer inventory check, one-line README command, and durable
  safety contract; the full local matrix passes.
- Current repository or external state: T-0009 began from clean `a68b2fb` and closes in
  its own successor commit. No push, hosted script, archive, tag, release, repository
  setting, or destination repository has been changed.
- Resume constraints: Do not publish or run the real remote path from this session; keep
  the installer outside the core archive and preserve its exact core/state boundary.

## Plan

- [x] Frame destination, remote-code, archive, and pipe-truncation behavior.
- [x] Implement the installer and replace the inline README commands.
- [x] Run direct, piped, negative, rollback, lint, docs, and security checks.
- [x] Integrate review, close state, and commit T-0009 separately.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Installer | Done | Root Orchestrator | `scripts/install-core.sh` | Shell, archive, stream, destination, race, rollback fixtures | None |
| Consumer and CI contract | Done | Root Orchestrator | `README.md`, release workflow | Exact command, trust behavior, inventory synchronization | None |
| Durable records | Done | Root Orchestrator | Decision, threat, quality, task, learning, standards, cursor | Links, budgets, consistency | None |
| Independent review | Done | `piped_installer_reviewer` | Read-only diff and evidence | Security, correctness, portability | None |

## Repository And Verification State

- Changed files: Installer, README, one workflow verification step, Decisions 0011/0012,
  and task, quality, threat, standards, learning, catalog, and cursor records. No
  `readme/meta` core file changed.
- Recent commits: `a68b2fb` completed T-0008 from a clean worktree.
- Commands already run and observed results: Bash syntax and ShellCheck pass; direct,
  piped, and exact-command fixtures install the 26-file core; existing project state and
  AGENTS remain intact; corrupt, incomplete, extra, special, encrypted, duplicate,
  traversal, newline, oversized, and excessive-entry archives fail closed; truncation,
  outer-fetch failure, collision, injected copy/link, parent-symlink, and root-rename
  fixtures leave no installer-owned partial state. Actionlint, yamllint, package
  reproducibility, inventory sync, docs, diff, and repository checks pass.
- Required checks remaining: None.
- Decisions and assumptions since start: A piped installer cannot depend on interactive
  unzip input or a syntactically valid streamed suffix. It stages and validates exact
  producer-synchronized bytes first, claims AGENTS without clobbering, and completes the
  meta transaction in directory-scoped subshells while project state remains separate.

## Parked Approval Detail

None. The user explicitly requested the remote-script installation path; this does not
authorize publishing, executing a real remote installer, or changing another repository.

## Worker Roster

| Worker | Task ID, Revision, And Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| `piped_installer_reviewer` | T-0009 r1: review pipe, archive, collision, rollback, path races, portability, and docs safety | Read-only task diff and evidence | Done | All archive, truncation, ownership, parent/root race, and portability findings resolved; no implementation blocker | Restart only if installer semantics change |

## Usage Capacity

- Last authoritative meter reading: 2026-07-14T06:55:19Z through initialized Codex App
  Server `account/rateLimits/read`; the task-scoped server was then stopped.
- Five-hour window consumed and reset time: Not advertised; not applicable.
- Weekly window consumed and reset time: `codex` 35%, reset
  2026-07-21T04:02:22Z; model-specific bucket 0%, reset 2026-07-21T06:55:15Z.
- Limiting or unknown windows: None.
- Wake method and time: None.
- Resume condition: None; reviewer completed and both advertised windows remained below
  the 95% cutoff.

## Attempts And Dead Ends

- An open-directory-descriptor path fixed the Linux race fixture but `/dev/fd` cannot
  traverse directory descriptors on macOS. It was replaced before close with portable
  current-directory-relative root paths and nested directory-scoped transactions.
- Early drafts used preflight ownership flags and incomplete archive allowlists. Review
  replaced them with atomic no-clobber claims, owned markers, exact inventory sync, and
  central-directory limits before inflation.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-14 | Selected T-0009 as Quick change / High | User instruction, clean baseline, and readiness records |
| 2026-07-14 | Implemented the staged installer and one-line `pipefail` command | Direct, piped, exact-command, inventory, and collision fixtures |
| 2026-07-14 | Resolved independent archive, truncation, rollback, and pathname-race findings | Hostile archives, stream prefixes, injected failures, symlink-parent and root-rename fixtures |
| 2026-07-14 | Replaced Linux descriptor traversal with portable directory-scoped transactions | ShellCheck plus rerun direct/piped, parent-race, root-rename, and rollback checks |
| 2026-07-14 | Closed T-0009 as Done in a separate task-scoped commit | Final links, budgets, consistency, staged diff, and status |
