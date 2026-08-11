# T-0022 Task Recovery Skill Notes

## Task Identity

- Task ID: T-0022
- Brief: [T-0022 brief](0022-task-recovery-skill-brief.md)
- Started: 2026-08-11
- Accepted task revision: r2

## Execution Checkpoint

- T-0021 is Done and committed as `b485c3f`; the general same-name skill bundle
  installer boundary is available.
- T-0022 is Done at task revision 2 / record version 7 with its note, quality, and
  threat owners linked and explicit completion evidence in the structured record.
- Skill-creator initialization and quick validation pass for the implemented canonical
  source and Codex UI metadata.
- The instruction-only skill, thin Claude link, 26-scenario contract fixtures, package
  integration, installer boundary fixtures, Decision 0020, and source-backed discovery
  documentation are implemented.
- The integrated suite passes 33 Node tests, both installer matrices, ShellCheck,
  Actionlint, yamllint, doctor, and two byte-identical 49-entry packages with SHA-256
  `00fa81259e084ae6f0a1308b05f5dadd7637386a188f60ab150b7dd317b99f8a` for
  the revision-2 candidate.
- Revision-1 fresh-agent uncertain-effect and targeted-redirect cases returned
  `reconcile` and `redirect` without changing repository or task bytes. Their feedback
  exposed and then corrected disposition-precedence, final-revalidation, provider-
  locator, worker-interface, lifecycle-status, and fixture-semantics gaps. A fresh
  revision-2 exact-artifact evaluation then passed with all bounded queries and the
  relied-on linked note re-observed, SHA-256
  `fdbec84c60efe9c6f895b8a240399362de4be56b8e3e9ceab6f3618c5c87b19a`.
- The terminal staged doctor passes all nine checks with 25 task-owned staged paths and
  eight framework paths; there are no errors or warnings.

## Plan

- [x] Establish readiness and threat boundaries.
- [x] Reconcile independent design and security preimplementation reviews.
- [x] Implement one canonical skill and a thin Claude discovery adapter.
- [x] Add recovery-contract, package, collision, and scenario fixtures.
- [x] Run quick validation and fresh-agent recovery forward tests.
- [x] Complete current-tree Reviewer, Security, and QA gates.
- [x] Close T-0022 and prepare its task-scoped commit.

## Worker Roster

| Worker | Assignment | Ownership | Status | Expected Output |
| --- | --- | --- | --- | --- |
| Design reviewer | Recovery workflow, discovery, package, and fixture architecture | Read-only | Complete | Ready with bounded proposal-only design concerns reconciled |
| Security reviewer | Retry, revision, ownership, approval, worker, quota, and collision pre-mortem | Read-only | Complete | No blocker; required fail-closed controls and fixtures reconciled |
| Forward evaluator A | Uncertain production effect and unowned artifact | Disposable fixture, read-only | Complete | `reconcile`; no retry or mutation |
| Forward evaluator B | Targeted redirect and late worker output | Disposable fixture, read-only | Complete | `redirect`; output quarantined and no mutation |
| Forward evaluator C | Exact revision-1 raw artifact repeat | Disposable fixture, read-only | Complete | `reconcile`; four clarity gaps found and corrected |
| Forward evaluator D | Exact revision-2 raw artifact repeat | Disposable fixture, read-only | Complete | Pass; `reconcile`, full final reobservation, no mutation |
| Final Reviewer | Current revision-2 correctness and design | Read-only | Complete | Pass; no blocking findings |
| Final Security reviewer | Current revision-2 trust and failure boundaries | Read-only | Complete | Pass; no blocking findings |
| Final QA agent | Current revision-2 acceptance and verification | Read-only | Complete | Pass; staged doctor correctly deferred to close |
| Root Orchestrator | Readiness, implementation, integration, and final close | T-0022 files | Complete | Verified skill and task-scoped commit |

## Usage Capacity

- Last authoritative reading: 2026-08-11 after the revision-2 forward test.
- Advertised windows: generic weekly 38% consumed; model-scoped weekly 0%; five-hour
  not advertised.
- Limiting windows: none; both weekly buckets are below the 98% cutoff.

## Next Safe Action

Stage only task-owned paths, run the staged doctor, reconcile final records, create the
task-scoped commit, and confirm HEAD and worktree status.
