# Quality Record: Project Onboarding Skill

- Date: 2026-08-11
- Change: T-0021 guarded `project-onboarding` skill and package/discovery integration
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent design, security, and forward-test gates

## Scope And Criteria

- User-visible outcome: a triggered agent executes the canonical onboarding workflow
  completely and stops safely on unsupported, malformed, partial, or colliding state.
- Policy owner: `readme/meta/onboarding.md`; the skill is a concise procedure adapter.
- Non-goals: a second parser, automatic collision resolution, destructive replacement,
  product decisions, or execution of production/release/external commands.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Precise trigger and canonical-owner loading | Skill validation and content audit | Canonical skill loads `onboarding.md`; Claude file only links it | Pass |
| Preflight-driven disposition and safe stops | Clean/current/legacy/partial/collision/malformed/unsupported fixtures | Exact nine-disposition contract; prepared, malformed, simulated Node 21, existing state, and four ancestor-symlink negatives; collision forward stop | Pass |
| Safe command discovery and observed-only catalog updates | Forward test and content/fixture audit | `node --test` inspected and observed at exit 0; dangerous categories remain prohibited/unverified | Pass |
| Cold-start recovery proof | Fresh-repository forward test using doctor/startup/candidates/context | Disposable Root proof recovered T-0001, linked outcome/constraints/commands/approvals, and next action | Pass |
| One maintained source across discovery/package/install | Exact inventory and fresh/collision installs | One body, one thin link, 46-entry package; fresh, two collision, partial-failure, and TERM-interruption fixtures pass | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0021 brief defines variants, stops, and non-goals |
| Architecture and project context | Yes | T-0020 supplies the required bounded CLI and T-0021 must link the onboarding owner |
| Data, security, and permissions | Yes | Exact preflight stops, arbitrary-code command rules, Root-only task mutation, and atomic collision bundles are implemented |
| Slices and ownership | Yes | Root owns source/package edits; independent agents remain read-only reviewers/forward testers |
| Verification and rollback | Yes | Focused tests, forward fixtures, deterministic package, and installer rollback/collision checks pass |

Readiness verdict: Ready. The initial concerns were resolved by the accepted CLI,
canonical onboarding owner, ancestor checks, atomic installer boundary, and negative
fixtures.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Skill-creator initialization and quick validation | Initializer passed; canonical and Claude discovery each report `Skill is valid!` | Pass | N/A |
| Yes | Skill contract and disposition fixtures | 30-test Node suite passed, including exact contract, unsupported runtime, malformed/prepared state, and unsafe ancestors | Pass | N/A |
| Yes | Fresh forward tests with minimal context | Clean delegated handoff plus Root completion; collision stopped byte-identically | Pass | N/A |
| Yes | Deterministic package/install inventory and additive collision checks | Byte-identical 46-entry package; fresh/collision/failure/TERM fixtures pass | Pass | N/A |
| Yes | Doctor, syntax, lint, links, budgets, and staged evidence | Terminal staged doctor passed with 28 staged paths and 10 framework paths; syntax, lint, links, budgets, and diff check pass | Pass | N/A |
| Yes | Independent design/security/reviewer verdicts | Current-tree Reviewer, Security, and QA verdicts Pass with no blocker | Pass | N/A |

## Batch And Residual Risk

- Large-diff split trigger hit: No; one skill plus its discovery, tests, and inventory is
  one independently deployable boundary.
- Risk not resolved by passing checks: agents still exercise judgment, hostile project
  evidence remains data, and no skill can make unsafe external commands safe.

## Completion

- Required checks all passed: Yes.
- Status: Done pending the required local commit.
- Exact incomplete condition: commit the closed, staged, verified task boundary.
- Next action: create the T-0021 local commit.
