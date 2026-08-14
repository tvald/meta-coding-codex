# Prompt Bootstrap Activation Quality Record

- Date: 2026-08-14
- Change: Transactional prompt generations, activation, session pinning, and safe Root fallback
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator; independent Reviewer, QA, and Security gates required

## Scope And Criteria

- User-visible outcome: Prompt development cannot terminate the session doing that work;
  invalid candidates remain inactive and Root degrades to exact local instructions.
- In scope: T-0055 brief, Decision 0026, runtime store/loader, CLI and Codex integration,
  prompt reserve, tests, packaging, rollback, cleanup, and operator documentation.
- Non-goals: Raising limits as the fix, auto-activating mutable source, weakening delegated
  profiles, changing T-0054's implementation outcome, or making prompt state task authority.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Existing session prompt bytes do not change after source or active generation changes | Lifecycle integration test over startup/compact/resume/clear and two generations | Runtime pin test and checked source wrapper returned the same 30,090 bytes / `7e791b…` digest for all four sources across activation | Pass |
| Invalid candidates cannot damage or advance last-known-good | Rejection matrix, injected publication cuts, digest-corruption tests, stale CAS test | Runtime suite rejects failed receipts, source drift, reserve drift, corruption, stale/ABA CAS, and publication cuts before selection | Pass |
| Stage-zero source loader is outside mutable worktree and content addressed | Source integration inspection plus execution with worktree compiler deliberately broken | Hook integration verifies installed loader `f05931…` in Git common and executes no mutable source binary | Pass |
| Root loader failure continues with exact `AGENTS.md` degraded context | Command-level missing/corrupt loader tests and supported Codex manual check | Missing/nonzero/partial child tests emit one nested SessionStart `continue: true` literal with exact fallback and no partial stdout | Pass |
| Specialists remain fail-closed | Exact profile/matcher and absent/corrupt generation tests | Four exact matchers, static envelope guards, missing-parent-pin rejection, and stop-before-tools fallbacks pass | Pass |
| Candidate reserve prevents recurrence | Size accounting tests plus over-limit and below-reserve negative controls | Exact core 23,552/23,553 and output 31,744/31,745 seams plus extension/core separation pass; current Codex core headroom is 1,078 bytes | Pass |
| Rollback and cleanup preserve active/pinned generations | Runtime store tests and operator CLI integration | ABA rollback, pin retention, SessionEnd/exact retirement, dry-run cleanup, 90-day boundary, and private-candidate reporting pass | Pass |
| Source and installed clients retain explicit update/trust boundaries | Package inventory, initializer, hook, and source/client fixture tests | Packed concurrent first seed publishes one revision-1 generation; partial and read-only cases make no state; source requires explicit activation | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0055 brief records actors, non-goals, acceptance, and counterfactual |
| Architecture and project context | Yes | Decision 0026 fixes store ownership, loader boundary, CAS, pinning, source/client behavior, and rollback |
| Data, security, and permissions | Yes | No-follow/identity/mode checks, domain-separated IDs/digests, ABA-safe CAS, buffered fallback, exact retirement, narrow seed, and static specialist guards passed final Security review |
| Slices and ownership | Yes | Task note separates runtime store/loader, integration/CLI/docs, and independent gates |
| Verification and rollback | Yes | Matrix requires counterfactual, fault injection, lifecycle parity, rollback, package checks, and a supported Codex smoke test |

Readiness verdict at implementation entry: Ready with concerns; final concern closed

The first Security pre-review returned Revise because age-only pin deletion, digest-only
CAS, outer-process fallback, and specialist-stop assumptions were unsafe. Decision 0026
and the threat model now bind SessionEnd/exact retirement, revision/nonce CAS, buffered
literal wrappers for source and installed modes, and the static specialist envelope
guard. The implementation retained those controls, added descriptor and receipt-v2
hardening during review, and received final Reviewer, QA, and Security Pass results.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Prompt runtime and hook adapter unit/integration tests | 14/14 runtime and 7/7 hook tests passed | Pass | — |
| Yes | Prompt compiler/profile suite and counterfactual reserve check | 8/8 compiler and 5/5 extension tests passed | Pass | — |
| Yes | Project initializer and package inventory tests | 19/19 initializer and 104/104 package tests passed | Pass | — |
| Yes | Full `npm test` | 294/294 passed in 153.8 seconds | Pass | — |
| Yes | `npm pack --dry-run` / package file validation | 77 files, 249,117 bytes, SHA-256 `daedfefd…`; audit and dry-run passed | Pass | — |
| Yes | Task-store doctor, link/document-budget check, staged diff check | Doctor passed all nine checks with no warnings; links, budgets, and `git diff --check` passed | Pass | — |
| Yes | Independent Reviewer, QA, and Security gates | Final Reviewer, QA, and Security reruns all returned Pass on the lifecycle-v2 candidate | Pass | — |
| Yes | Supported Codex source startup/compact degraded and pinned smoke | Codex 0.147.0 startup and resume passed; checked wrapper proved exact startup/resume/clear/compact bytes | Pass | — |
| Yes | Exact 23,552/23,553 body and 31,744/31,745 output reserve boundaries | Equality accepted and one-byte-over rejected for core and extension limits | Pass | — |
| Yes | Concurrent pin/activation races and publication fault cuts | Eight concurrent pin pairs, deterministic two-link negative, ABA, stable seed, and injected cuts passed | Pass | — |
| Yes | Shell fallback for an absent or nonzero stage-zero loader | Buffered missing/nonzero/partial process cases passed with literal-only fallback | Pass | — |
| Yes | SessionEnd/exact retirement, missed-end pin leak, and 90-day unreferenced generation cleanup | Retirement and cleanup matrix passed; no age pin deletion exists | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: Before
  runtime code began, pre-QA and Security expanded methods for exact reserve boundaries,
  ABA, pin/activation races, SessionEnd, partial-output fallback, and filesystem identity.
  Outcome and acceptance were not weakened.
- Counterfactual evidence for new regression or behavior tests: The cached incident proves
  live compilation stopped at 26,734 body bytes. Focused negatives reject 23,553 core
  bytes, a failed lifecycle receipt, source drift, a partial installed runtime, and the
  old two-link pin state while the active/pinned generation remains unchanged.
- Flaky result and disposition: QA's first concurrent-pin run failed 23/24. Investigation
  proved a real hard-link publication race; lock-serialized rename plus a deterministic
  two-link negative replaced the unsafe protocol, then repeated runs passed. Later
  simultaneous first seed exposed a second real race: seed-result status observed a peer's
  private `.pin-*` publication as corrupt. Removing that unnecessary status read and keeping
  pin publication lock-serialized passed 20/20 cumulative high-contention runs.

Pre-QA measured the compacted Root core at 23,498 bytes for Codex (1,078 bytes
headroom) and 23,495 for Claude (1,081 bytes). This clears the reserve narrowly; exact
boundary and growth-regression tests remain required.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Session pin publication | Hard-link publication exposed transient `nlink=2` to waiting readers | Publish the private fsynced file by rename and retain single-link validation | Resolved; final QA Pass |
| High | Extension reserve and installed seed | Core reserve could be bypassed; partial/raced seed could repair or select state | Independent core proof and one private null-CAS seed transaction | Resolved; final Reviewer/QA Pass |
| High | Candidate eligibility | Receipt was unbound, then overstated authority checks | Bind lifecycle-v2 to the exact set; execute positive and mismatch events; require exact Root/specialist failure contracts | Resolved; final Reviewer/QA/Security Pass |
| Medium | CLI, filesystem, and source snapshot | Reads exposed paths or weak file identity; read-only commands initialized state; matrix source could drift | Descriptor/no-follow/owner/link checks, path-free output, non-mutating reads, and two-pass source snapshot | Resolved; final Security/Reviewer Pass |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Prevent self-hosting SessionStart failure and document/implement T-0055 | Implemented under accepted Decision 0026 | — |
| Task brief | Immutable generation, session pin, CAS, Root fallback, reserve, rollback | All acceptance criteria have observed evidence | — |
| Decisions and standards | Preserve Decision 0022 bindings and local commit policy | Decision 0026 and affected package/source docs are current | — |
| Tests and docs | Counterfactual and lifecycle evidence | Declared automated, package, provider, and supported-version checks passed | — |
| State and assumptions | T-0055 completes before T-0054 resumes | T-0055 ready to close; T-0054 remains preserved and blocked pending recovery | Close T-0055, then resume T-0054 separately |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes
- If kept together, why: Loader/store and hook integration are one atomic safety boundary;
  separate implementation ownership and focused tests keep reviewable slices while one final
  activation commit prevents an intermediate unsafe hook configuration.
- Risk not resolved by passing checks: Codex can change undocumented timing or process
  behavior; compatibility remains explicitly version-bound and manual smoke evidence is
  required for the supported version. The recovered Root's pre-receipt generation remains
  readable only for its existing pin and conservatively blocks cleanup until retirement.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: Not applicable.
- Next action: Close T-0055 and resume T-0054 only through its recorded recovery checkpoint.
