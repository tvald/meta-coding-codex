# Task Notes: Latest Core Release Workflow

## Task Identity

- Task ID: T-0008
- Catalog: `readme/tasks/README.md`
- Brief or acceptance source: [Task brief](0008-latest-release-workflow-brief.md)
- Started: 2026-07-14
- Last updated: 2026-07-14
- Accepted task revision: r2

## Execution Checkpoint

- Completed safe increment: Implemented and independently reviewed the split workflow
  and collision-aware installer; all schema, static, archive, transition, installation,
  documentation, diff, and staged checks pass.
- Current repository or external state: T-0008 began from clean `95369ff` and is closed
  in its own successor commit. No push, tag, release, secret, or repository setting has
  been modified.
- Resume constraints: Do not publish or push from this session; keep build unprivileged,
  explicitly export `GITHUB_TOKEN` only to the publication shell, and never overwrite an
  adopter's existing root instructions silently.

## Plan

- [x] Select T-0008@r2, verify current GitHub capabilities, and record the design.
- [x] Implement the two-job workflow and top-level installation commands.
- [x] Verify syntax, action pins, permissions, build artifact, and mocked release states.
- [x] Integrate independent review, close records, and commit separately from T-0007.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Workflow | Done | Root Orchestrator | `.github/workflows/publish-core-latest.yml` | Event, permissions, action pins, artifact, concurrency, shell | None |
| Installation guidance | Done | Root Orchestrator | `README.md` | URL, commands, collision behavior | None |
| Durable records | Done | Root Orchestrator | Decision, threat, quality, source map, standards, task, learning, cursor | Links and consistency | None |
| Independent review | Done | Read-only reviewer | Workflow, docs, records, verification evidence | Security and release-state findings | None |

## Repository And Verification State

- Changed files: GitHub workflow and README installation section; project source/command
  records; task, decision, quality, threat, learning, catalog, and cursor state.
- Recent commits: `95369ff feat(framework): package portable core archive` completed the
  required T-0007 dependency with a clean status.
- Commands already run and observed results: Official GitHub documentation confirms
  push branch filters, explicit token permissions, serialized concurrency behavior,
  mutable-ref API operations, `gh release --verify-tag`, `--clobber`, draft editing, and
  latest marking. The current Ubuntu 24.04 runner manifest lists GitHub CLI 2.96.0,
  `zip` 3.0, and `unzip` 6.0. Official action releases and commit refs were resolved.
- Required checks remaining: None.
- Decisions and assumptions since start: Serialize entire workflow runs with no
  in-progress cancellation, then re-check remote `main` before every release mutation.
  Existing releases are made draft during replacement so failure does not publicly pair
  a new tag with a stale asset. Release and tag discovery use authenticated exact-match
  lists; API failures, duplicate releases, and prefix-only refs fail or remain absent
  before any publication mutation.

## Parked Approval Detail

None. The user explicitly requested the workflow file, but local commit authority does
not authorize pushing it or executing its external release behavior in this session.

## Worker Roster

| Worker | Task ID, Revision, And Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| `latest_release_reviewer` | T-0008 r2: review event, permissions, serialization, mutations, and install collision safety | Read-only workflow, docs, records, and test evidence | Done | High/Medium fail-open discovery and Low excess-permission findings resolved | Restart only if publication semantics change |

## Usage Capacity

- Last authoritative meter reading: 2026-07-14T05:31:11Z through initialized Codex App
  Server `account/rateLimits/read`; the task-scoped server was then stopped.
- Five-hour window consumed and reset time: Not advertised; not applicable.
- Weekly window consumed and reset time: `codex` 23%, reset
  2026-07-21T04:02:22Z; model-specific bucket 0%, reset 2026-07-21T05:31:11Z.
- Limiting or unknown windows: None.
- Wake method and time: None.
- Resume condition: None; reviewer completed and both advertised windows remained below
  the 95% cutoff.

## Attempts And Dead Ends

- Official web search result extraction hung repeatedly; direct official documentation,
  repository APIs, runner manifests, and installed-tool help were used instead.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-14 | Selected T-0008@r2 as Initiative / High after T-0007 commit | Catalog, cursor, and clean `95369ff` baseline |
| 2026-07-14 | Chose split jobs, serialized runs, stale-head checks, and draft replacement | Official GitHub docs and Decision 0011 |
| 2026-07-14 | Passed working workflow, release-transition, archive-transfer, and install checks | Actionlint/yamllint, static assertions, gh mock, and destination fixtures |
| 2026-07-14 | Resolved independent High/Medium fail-open probes and Low excess permission | Exact authenticated discovery, ten transition scenarios, and least-privilege assertions |
| 2026-07-14 | Closed T-0008 as Done in a separate task-scoped commit | Final links, budgets, consistency, staged diff, and status |
