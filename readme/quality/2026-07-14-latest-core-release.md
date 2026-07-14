# Quality Record: Latest Core Release Workflow

- Date: 2026-07-14
- Change: Publish the verified portable core as a moving `latest` GitHub release and
  document safe installation.
- Route: Initiative
- Risk: High, because CI receives repository-content write permission and automates a
  public tag/release/file-download trust boundary.
- Owner or reviewer: Root Orchestrator and `latest_release_reviewer`.

## Scope And Criteria

- User-visible outcome: Every push to `main` converges on one verified `latest` core zip
  at a copyable URL, and adopters can unpack it from their project root.
- In scope: Event filter, split permissions, pinned official actions, workflow artifact,
  serial/stale behavior, moving tag, draft-safe release replacement, and install docs.
- Non-goals: Executing or dispatching the workflow here, versioned releases, signing,
  attestations, optional integrations, new secrets, branch/ruleset changes, or deployment.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Only main pushes build through T-0007 | YAML/schema and shell/order assertions | `push.branches` is only `main`; build invokes package script; Actionlint passes | Pass |
| Build is isolated from release write permission | Job permission and token-environment review | Build has only `contents: read`; publish has only `contents: write`; explicit token appears only in final shell env | Pass |
| Rapid pushes converge on current main | Mock concurrency/head-state transition scenarios | Serialized group plus head checks skip initial and mid-update stale runs; newer pending run remains the repair owner | Pass |
| First and later publications keep one fixed verified asset | Mock gh first/update/failure transitions plus archive check | First create uses verified tag; update orders draft/tag/clobber/publish; upload failure remains draft; transferred inventory matches | Pass |
| Installation URL/commands are correct and preserve AGENTS authority | Command dry run and collision review | Exact release URL present; fresh install passes; existing AGENTS is unchanged with merge file; existing/broken helper aborts before extraction | Pass |
| Durable records and final diff agree | Link, budget, threat, decision, state, whitespace, staged review | Repository links/anchors, budgets, state, separation, whitespace, and task-scoped staged diff pass | Pass |

## Readiness

The user explicitly authorized creation of a release workflow but not an external push
or release during this session. Current official sources were checked before selecting
the action versions, runner, permissions, concurrency, reference, and release operations.

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0008@r2 defines producer and installer outcomes plus external non-goals |
| Architecture and project context | Yes | T-0007/Decision 0010 own exact archive construction; T-0008 only transfers/publishes it |
| Data, security, and permissions | Yes | Threat model and Decision 0011 narrow trigger, token, jobs, actions, refs, and collisions |
| Slices and ownership | Yes | One Root writer; read-only independent review follows working verification |
| Verification and rollback | Yes | Static/schema/build/mock matrix declared; disable workflow or move/recreate release to mitigate external failure |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Workflow YAML and Actions schema | yamllint 1.37.1 and Actionlint 1.7.12 complete without findings | Pass | |
| Yes | Trigger, permissions, pins, credentials, artifact, and ordering assertions | Only main push; exact job-scoped permissions; three official full-SHA pins; no build token; build precedes publish | Pass | |
| Yes | Local T-0007 package and archive validation | Real 26-entry archive passed integrity and source-derived inventory before and after simulated transfer | Pass | |
| Yes | Mock first/update/stale/failure release transitions | Ten scenarios pass, including API failure, duplicate, prefix-ref, stale, and upload-failure states | Pass | |
| Yes | README download/unpack dry run and AGENTS collision review | Five local fixtures pass, including corrupt archive; exact public URL assertion passes | Pass | |
| Yes | Security/release independent review | High and Medium fail-open discovery plus Low excess-permission findings resolved; no other findings | Pass | |
| Yes | Links, budgets, consistency, diff, staged review, and status | Repository-wide final checks and exact task-scoped staged review pass | Pass | |

- Criteria or methods amended after implementation began, with reason and impact:
  Independent review exposed ambiguous release/ref probes, so exact-match API-failure,
  duplicate, and prefix-ref scenarios were added. Acceptance stayed unchanged and the
  verification method became stricter.
- Counterfactual evidence for new regression or behavior tests: At clean `95369ff`, no
  `.github/workflows/` file exists and README has no latest-release installation command.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Release discovery | Any CLI probe failure was treated as absence, allowing a tag move before failed release creation | Use authenticated tri-state discovery and a negative API-failure scenario | Resolved |
| Medium | Tag discovery | Exact-ref absence could return prefix matches, while operational failure was also treated as absence | Filter matching refs for exact `refs/tags/latest` and fail closed before mutation | Resolved |
| Low | Publish permission | `actions: read` was not required for a same-run artifact download | Remove the permission and update durable evidence | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Build on every main push, publish latest release, and document install | Workflow and README implement the requested producer/consumer path | None |
| T-0008@r2 | Least privilege, newest final state, fixed asset, safe collision guidance | Final checks and resolved independent review cover each criterion | None |
| Decisions 0010/0011 | Package boundary remains independent; publication is a separate layer | Workflow consumes T-0007 output; no core file changes | None |
| Tests and docs | Locally runnable checks pass; external action remains unexecuted | Full local matrix and final repository checks pass | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No. Workflow, publication semantics, install commands,
  and required risk/state records express one producer-to-consumer release outcome.
- If kept together, why: Splitting docs from the fixed URL/asset behavior would make one
  side unverifiable. T-0007 packaging already has its own preceding commit.
- Risk not resolved by passing checks: Local mocks cannot prove repository tag rules,
  release mutability, GitHub availability, or the first hosted run.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: None.
