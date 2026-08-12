# Quality Record: Codex Hook Prompt Injection

- Date: 2026-08-12
- Change: T-0033 automatic root and exact delegated Codex prompt injection
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Reviewer and Security gates

## Scope And Criteria

- User-visible outcome: trusted Codex projects automatically receive the current
  repository-pinned root or exact delegated framework profile as developer context.
- In scope: hook runtime, four `meta_` agent manifests, optional guarded client delivery,
  fallback bootstrap, compatibility metadata, documentation, and provider evidence.
- Non-goals: non-Codex hook adapters, copied semantic policy, provider permissions, task
  state injection, publication, or a speculative nested-delegation mechanism.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Root and four exact delegated profiles inject complete current prompts | Unit, packed-client, and live Codex fixtures | Exact compiler fixtures; Codex 0.147.0 injected all four delegated profiles, and the final nested-cwd security child received a real complete envelope | Pass |
| Input, profile, command, output, and failure paths are bounded and fail closed | Mutation/negative tests and security review | Closed selector/event fixtures, maximum-prompt test, bounded failures, and independent Security PASS | Pass |
| Codex files install without overwrite, merge, escaped write, or package mutation | Preflight/transaction/collision/interruption matrix | Fresh/exact/partial/collision/link/race/kill/rollback fixtures pass | Pass |
| Disabled/unavailable hooks retain the exact local fallback | Static, negative, and live fixtures | Generated bootstrap recognizes injection and otherwise requires exact local `agent-prompt`; disabled/untrusted policy is documented | Pass |
| Package, documentation, task-store, and compatibility contracts stay coherent | Pack audit, doctor, links, and independent review | 55-file reproducible pack audit, 104-test suite, doctor, version envelopes, docs, and independent Reviewer PASS | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0033@r6 defines exact agents, lifecycle coverage, fallback, negative behavior, and Done conditions |
| Architecture and project context | Yes | Decision 0022 keeps the portable initializer stable and adopts a fixed-profile, opt-in Codex adapter |
| Data, security, and permissions | Concern | Developer-context injection and executable project hooks can alter agent authority; the task threat model and independent Security gate are mandatory |
| Slices and ownership | Yes | Root owns the one integrated runtime/config transaction; Reviewer and Security receive frozen read-only gates after verification |
| Verification and rollback | Yes | Deterministic Node fixtures, packed clients, live Codex 0.147.0 probes, Git removal, and package-lock rollback are available |

Readiness verdict: Ready with concerns. The accepted architecture fixes the public
commands, identity binding, client mutation, failure, and rollback boundaries. The
remaining security concern is a completion gate, not an unresolved design choice.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Hook/compiler unit and negative tests | Frozen-candidate focused matrix included fixed profiles, closed grammar, maximum output, nested cwd, hostile root characters, and failures; exited zero | Pass | — |
| Yes | Initializer collision/interruption/packed-client tests | Frozen-candidate focused matrix covered opt-in install, ownership states, links, races, interruption, rollback, hostile client script, and nested cwd | Pass | — |
| Yes | Full package and regression suites | Frozen-candidate `npm test`: 104 tests passed, 0 failed | Pass | — |
| Yes | Live Codex lifecycle/custom-agent evidence | Codex 0.147.0 injected all four exact profiles without a child spawn tool; final `/workspace/readme` session and child transcript proved nested-cwd root/security injection | Pass | — |
| Yes | Doctor, package audit, links, and diff review | Doctor and `git diff --check` passed; reproducible audit reported 55 files, 152,764 bytes, SHA-256 `94d5ecc7c8bfe9eb58a215955dd8390354f3b6fddcf411d44efc810f316bb321` | Pass | — |
| Yes | Independent Reviewer and Security gates | Both repeat gates passed with no remaining blocking or advisory findings | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: live
  0.144.1/0.147.0 evidence invalidated the per-manifest-hook assumption. T-0033@r6 now
  requires Codex 0.147.0 project-level exact matchers and disabled child multi-agent
  tools; affected tests, live evidence, documentation, and gates must be refreshed.
- Counterfactual evidence for new regression or behavior tests: mutation fixtures reject
  removed fixed profile binding, changed full-context configuration, unsafe paths,
  selector drift, package drift, and missing fallback guards.
- Flaky result and disposition: initial noninteractive child probes bypassed only the
  parent hook trust boundary and did not prove delegated injection. A persistent trusted
  Codex 0.147.0 session ran the exact project matcher and produced a child transcript
  containing the real compiler envelope; only trusted-session evidence is accepted.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | All five automatic hook commands | Trusted hook hashes dispatched through mutable client `scripts.meta` before package validation | Invoke fixed source/installed package entrypoints directly; add hostile-script regression and repeat gates | Fixed and independently confirmed |
| Advisory | Provider-version documentation | Fallback wording implied automatic detection of unsupported Codex versions | State that tested versions are published but operator review/disablement is required | Fixed and independently confirmed |
| High | All five automatic hook commands | Cwd-relative entrypoints fail when Codex starts in a repository subdirectory | Resolve fixed entrypoints below a quoted Git root; test source and packed-client nested cwd plus hostile root characters | Fixed and independently confirmed |
| Low | Delegated hook matchers | Unanchored regexes also dispatch on containing names before runtime rejects them | Anchor all four matchers | Fixed and independently confirmed |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Hooks replace normal model-initiated load; exact prefixed agents; extensible harness CLI | Implemented as `meta hook --harness codex --profile PROFILE` and four `meta_` names | None |
| Task brief | T-0033@r6 High-risk acceptance | Every criterion is verified | None |
| Decisions and standards | Immutable package, exact local command, least authority, preserve-first writes | Decision 0022 implemented with opt-in guarded integration | None |
| Tests and docs | Full lifecycle, collision, package, and live evidence | Frozen r6 verification and both independent gates pass | None |
| State and assumptions | Task store is sole status owner | T-0033 closed Done through the CLI after every required gate passed | None |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: hook runtime, exact manifest bytes, generated delivery, fallback,
  and compatibility metadata form one externally coupled prompt-loading transaction; a
  partial slice would leave an unsafe or unusable client state.
- Risk not resolved by passing checks: trusted-project/provider policy can disable hooks,
  `SubagentStart` cannot stop a child, and compatibility remains coupled to Codex 0.147.0.

## Completion

- Required checks all passed: Yes.
- Status: Pass; T-0033 closed Done through the structured task CLI.
- Exact incomplete condition, if not Done: None.
- Next action: Create the required scoped local commit.
