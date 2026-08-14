# Quality Record: Concurrent Controller Implementation

- Date: 2026-08-14
- Change: Package-owned implementation of the concurrent, command-launched autonomous
  implementation controller adopted by Decision 0025
- Route: Initiative
- Risk: Critical
- Owner or reviewer: Root Orchestrator with independent Reviewer, QA, and Security gates

## Scope And Criteria

- User-visible outcome: `meta implement` can deterministically supervise concurrent,
  bounded model jobs from durable state without keeping one Root model session alive.
- In scope: All nine implementation slices, packaged command/API surfaces, offline fakes,
  operator lifecycle, recovery, documentation, and disabled activation controls.
- Non-goals: App Server/SDK backends, a persistent network daemon, cross-clone fencing,
  unsupported filesystems/platforms, generalized class-wide resource scheduling, or
  executing and generally enabling the opt-in live canary in this task.

The detailed runtime acceptance matrix A1-A16 remains canonical in
[the design quality record](0053-concurrent-implementation-controller.md). The following
criteria are the implementation completion projection of that matrix.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Exact protocol and deterministic state | RFC 8785 fixtures, closed-schema validation, reducer traces, event permutations, and negative mutants | Pending | Not run |
| Durable ledger and recovery | Competing-writer, publication-boundary crash, unknown-version, lock/epoch, stop, and replay tests | Pending | Not run |
| Safe Codex job boundary | Fake-executable conformance for exact version/role/cwd/sandbox/schema/environment, bounded JSONL, signals, descendants, and drift | Pending | Not run |
| Useful bounded concurrency | Deterministic scheduler tests and real child-process barriers prove overlap, WIP, dependency, ownership, gate, and wake behavior | Pending | Not run |
| Enforced attempt isolation | Disposable Git repositories plus symlink, hardlink, rename, process, Git-common, canonical, ledger, and peer escape fixtures | Pending | Not run |
| Fenced integration and finalization | Expected-OID, stale base, conflict, duplicate effect, task-close, exact staging, commit, and crash-cut tests | Pending | Not run |
| Verification, correction, and resources | Candidate-bound fan-out, stale receipt, correction, exact-key collision, namespacing, cleanup, and privacy tests | Pending | Not run |
| Complete operator/package workflow | Installed-client start/status/events/stop/resume/clean/lock, rollback/disable, and offline E2E tests | Pending | Not run |
| Safe activation boundary | Live commands are opt-in and fail closed; general write activation remains disabled until recorded compatibility, shadow, and canary evidence | Pending | Not run |
| Existing framework compatibility | Full repository tests, package tests/audit, prompt/hook/provider/task suites, and task doctor | Pending | Not run |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0054 and Decision 0025 cover one coherent implementation outcome with explicit non-goals |
| Architecture and project context | Yes | Accepted decision, independently reviewed v1 protocol, package architecture, and transcript evidence exist |
| Data, security, and permissions | Concern | Keep all effects disabled until role, sandbox, process, Git, stop, cleanup, and recovery gates pass |
| Slices and ownership | Yes | Nine ordered, independently testable slices; Root retains task and integration ownership |
| Verification and rollback | Yes | A1-A16, fakes, mutants, crash matrix, shadow mode, fail-closed feature controls, and state-preserving rollback are predeclared |

Readiness verdict: **Ready with concerns.** Pure contracts and offline test scaffolding may
start. Every write-enabled or live boundary remains gated by the concern in its slice.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Protocol/reducer unit and model tests | Pending | Not run | Implement slice 1 |
| Yes | Ledger/provider/process integration tests | Pending | Not run | Implement slices 2-3 |
| Yes | Scheduler/workspace/Git/resource E2E tests | Pending | Not run | Implement slices 4-7 |
| Yes | `npm test` | Pending | Not run | Complete implementation |
| Yes | `npm run --silent test:package` and `npm run --silent package:check` | Pending | Not run | Complete package surface |
| Yes | Task-store doctor, staged doctor, and diff review | Pending | Not run | Final task state and docs |
| Yes | Independent Reviewer, QA, and Security gates | Pending | Not run | Review completed implementation |
| No | Opt-in live Codex compatibility/canary | Deliberately outside this task's execution authority; its gate is implemented but remains closed | Not applicable | Separate explicit live activation authority |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: Predeclared negative
  mutants disable fencing, revision, ownership, acknowledgment, or sticky stop; command
  tests also use the current absent `implement` surface as the pre-change baseline.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Critical | Activation boundary | Write-enabled workers could affect shared Git or canonical state before isolation proof | Ship disabled and fail closed until adversarial gate passes | Open |
| Critical | Stale process | Epoch alone cannot stop a live writer | Exact process domains, proven emptiness, and quarantine | Open |
| High | Top-level roles | Current hook v1 binds specialist roles only for native subagents | Implement exact controller descriptor and hook v2 | Open |
| High | Finalization | Git, task close, commit, and receipt are not one transaction | Journal intent/postconditions and reconcile forward | Open |
| Medium | External resources | Unknown conflicts can corrupt verification | Exact claims/namespaces/receipts with evidence-triggered key serialization | Open |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Proceed with the full concurrent implementation | T-0054 covers all nine slices | None |
| Decision 0025 and protocol v1 | Deterministic supervisor, fresh jobs, exact state, single integration writer | Implementation pending | Code, tests, and package docs |
| Threat model | Fail closed at worker, Git, process, control, provider, and cleanup boundaries | Gates predeclared | Implement and independently verify |
| Existing package architecture | Immutable package, explicit compatibility metadata, installed-client parity | Ownership mapping pending | Preserve package inventory and client tests |
| State and assumptions | No controller behavior exists before this task | Only task/planning records changed | None |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: The user authorized one full implementation, but execution and
  review remain split into nine gated slices with non-overlapping worker ownership and
  independently recorded checks. One final commit is allowed only if the integrated diff
  remains reviewable; otherwise Root will create task-scoped slice commits.
- Risk not resolved by passing checks: Offline evidence cannot prove provider service
  delivery, same-user host security, unsupported filesystems, or cross-clone fencing.
  General activation remains off until separate live/shadow/canary evidence exists.

## Completion

- Required checks all passed: No.
- Status: Needs verification while implementation is active.
- Exact incomplete condition, if not Done: All implementation slices and required offline
  checks remain.
- Next action: Complete framing and ownership decomposition, then implement slice 1.
