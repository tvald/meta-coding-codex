# Quality Record: Task Recovery Skill

- Date: 2026-08-11
- Change: T-0022 guarded `task-recovery` skill and package/discovery integration
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent design, security, forward-test,
  Reviewer, and QA gates

## Scope And Criteria

- User-visible outcome: interrupted work resumes only from reconciled bounded durable
  and live evidence, with uncertain effects and ownership conflicts stopped explicitly.
- Policy owners: `readme/meta/resumption-protocol.md` and the recovery/capacity sections
  of `readme/meta/agent-definitions.md`.
- Non-goals: automatic external retry, task selection, approval, authority acceptance,
  ownership reassignment, semantic completion, or a second state parser.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Precise triggers and progressive canonical loading | Skill validation and content audit | Quick validation passes; static contract pins bounded CLI commands and conditional owners | Pass |
| Durable/live reconciliation with visible conflicts | State/revision/Git/worker fixtures | 26-scenario matrix covers integrity, truncation, lifecycle, revisions, Git ownership, workers, and effects | Pass |
| No uncertain retry or silent reassignment | Counterfactual recovery fixtures and forward tests | Deployment forward tests returned `reconcile` without retry/mutation; redirect quarantined late output | Pass |
| Complete freshness/result contract | Static contract and scenario assertions | Contract requires source timestamps, revisions/digest, final context/dependency/detail reobservation, blockers, and exact action | Pass |
| Safe failures across approvals, verification, redirects, and quota | Scenario fixture matrix | Finite-disposition precedence covers approval, capacity, verification, redirect, pause, and combined uncertainty | Pass |
| One maintained packaged/discovered skill | Exact package and installer collision checks | One body, thin Claude link, 49-entry inventory, collision/rollback/signal matrices | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0022 brief defines triggers, result contract, stops, and non-goals |
| Architecture and project context | Yes | T-0020 bounded CLI, canonical recovery owners, and T-0021 bundle installer exist |
| Data, security, and permissions | Concern | Missing/stale evidence, dirty ownership, live workers, approvals, redirects, and quota must stop safely |
| Slices and ownership | Yes | Root owns source/package edits; independent reviewers and forward testers are read-only or disposable-fixture only |
| Verification and rollback | Concern | Scenario fixtures, forward tests, deterministic package, collision tests, and independent gates are required |

Readiness verdict: Ready with concerns. The accepted CLI and canonical policy owners
bound implementation; the threat model and independent reviews must resolve evidence,
retry, ownership, and telemetry concerns before Done.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Skill-creator initialization and quick validation | Initializer and current quick validation passed | Pass | Not applicable |
| Yes | Recovery contract and scenario fixtures | 26 scenarios and static contract pass; r1 QA gaps corrected | Pass | Not applicable |
| Yes | Fresh minimal-context forward tests | r1 uncertain-effect/redirect passes; exact r2 artifact `fdbec84c…b19a` passed with final context/dependency/note reobservation and no mutation | Pass | Not applicable |
| Yes | Package/install reproducibility and collision checks | Current 49-entry packages match; SHA-256 `00fa81259e084ae6f0a1308b05f5dadd7637386a188f60ab150b7dd317b99f8a`; both installer matrices pass | Pass | Not applicable |
| Yes | Doctor, syntax, lint, links, budgets, and staged evidence | 33 tests, doctor/startup, ShellCheck, Actionlint, yamllint, quick validation, diff check, and terminal staged doctor pass without warnings | Pass | Not applicable |
| Yes | Independent design/security/reviewer/QA verdicts | Design/security prechecks passed; Reviewer/QA r1 blockers corrected; r2 Reviewer, Security, and QA passed | Pass | Not applicable |

## Batch And Residual Risk

- Large-diff split trigger hit: No; one instruction-only skill plus its discovery,
  fixtures, and package integration is one independently deployable boundary.
- Passing checks cannot prove that transient harness state is complete or that an
  external side effect never happened; unresolved uncertainty must remain a stop.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition: None.
- Next action: create the task-scoped local commit and confirm HEAD/status.
