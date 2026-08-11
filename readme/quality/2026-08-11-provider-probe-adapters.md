# Quality Record: Normalized Provider Probe Adapters

- Date: 2026-08-11
- Change: T-0032 package-owned quota and capability commands
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and Reviewer gates

## Scope And Criteria

- User-visible outcome: shared framework instructions can invoke one package command for
  provider quota or delegation-capability evidence without containing provider protocol,
  credential, or parsing procedures.
- In scope: `quota --harness codex|claude`, `capability --harness codex|claude
  --name delegation`, one versioned bounded result envelope, capacity cutoffs, generic
  failure reasons, provider-process cleanup, and migration of existing quota skills to
  thin command shims.
- Non-goals: changing cutoff policy, token refresh, reset-credit use, provider account or
  billing inspection, long-lived monitoring daemons, prompt compilation, bootstrap
  generation, publication, or claiming capabilities that lack an authoritative probe.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Both quota adapters emit the same bounded schema and distinguish proceed, suspend, unavailable, unsupported, and failed inspection | Pure normalization fixtures plus public-CLI fake-provider processes | 11 focused tests cover every disposition, kind-specific exit, and exact envelopes; static review confirms the 16 KiB final bound | Pass |
| Every advertised applicable window is normalized, sorted, and evaluated with the canonical 95/98/99 cutoff classes | Codex multi-bucket and Claude limits/flat-shape boundary fixtures | Boundary, model-scope, monthly-duration, empty, duplicate, incomplete, renamed, and 65-window mutations passed | Pass |
| No credential, raw response/error, account, plan, credit, spend, or unrelated billing field reaches output | Secret-bearing response/error mutations and exact-key assertions | Token, RPC error, account, plan, credit, balance, spend, and extra-usage fixtures emitted only normalized fields or generic reasons | Pass |
| Codex uses only initialized App Server rate-limit reads; Claude uses one bounded hardcoded HTTPS request without redirect or refresh | Stateful fake App Server plus injected fetch/credential fixtures and static review | One initialized full read, fixed HTTPS destination, auth/error, response-size, and no-refresh cases passed | Pass |
| Delegation capability is reported only from an observed provider surface and unknown capabilities/harnesses are unsupported | Fake effective Codex feature and Claude agent-command probes plus unavailable/false negatives | Enabled/disabled/drift/absent fixtures passed; live local Codex and Claude capability probes returned enabled | Pass |
| Provider subprocesses cannot resolve client `node_modules/.bin` shadows, inherit npm/Node injection variables, leak output, or remain orphaned | Hostile PATH/environment, oversized-output, timeout, and cleanup fixtures | Client-target symlink, loader/npm injection, EPIPE, timeout, inherited-pipe, and successful-leader descendant sentinels passed | Pass |
| Package boundary and existing task behavior remain intact | Focused provider suite, package audit, full Node suite, doctor, and diff checks | Exact 57-file audit, 60-test aggregate, warning-free doctor, budgets, and diff check passed | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0032 and T-0023 define stable package-owned quota and capability probes |
| Architecture and project context | Yes | Decision 0021 owns normalized provider commands; Decisions 0007, 0014, and 0015 define acquisition and cutoff semantics |
| Data, security, and permissions | Yes | Bearer access stays in the package child; fail-closed process/network bounds and the independent Security gate passed |
| Slices and ownership | Yes | T-0032 owns probes and thin legacy shims; T-0027 owns prompt use, T-0030 retirement, and T-0031 aggregate compatibility |
| Verification and rollback | Yes | Provider transports are fixture-driven; deleting the new command module and reverting shim/docs changes restores the prior skill procedures without client-state migration |

Readiness verdict: Ready with concerns before implementation. The implementation kept one
dependency-free adapter boundary, provider data outside errors/logs, only the two
predeclared command surfaces, and unsupported rather than guessed capability evidence.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | `npm run --silent test:provider` | 11 passed | Pass | Not applicable |
| Yes | `npm run --silent test:package`; `npm test` | 27 package tests and 60 aggregate tests passed | Pass | Not applicable |
| Yes | `npm run --silent package:check` | Exact reproducible 57-file, 112629-byte package; SHA-256 `81540dab49bb350a2f40e06386ee74babd9e7c51e832c7f050b7b4fc21dfd5f8` | Pass | Not applicable |
| Yes | Doctor, budgets, staged evidence, and diff check | Source and staged doctors passed without warnings; Decision 0021 220 lines, agent definitions 299, changelog 146; diff check passed | Pass | Not applicable |
| Yes | Independent Architect, Security, QA, and Reviewer gates | Architect amendments incorporated; Security, QA, and Reviewer final rechecks passed with no blockers | Pass | Not applicable |

- Criteria or methods amended after implementation began, with reason and impact: the
  Architect required an authoritative complete-window-only `proceed`, separate probe and
  envelope versions, neutral window IDs, kind-specific exit semantics, one stateless
  provider child/read, parent-side Claude validation, and exact capability evidence.
  These amendments tightened the contract without expanding scope and added negative
  fixtures before implementation was accepted.
- Counterfactual evidence for new regression or behavior tests: independent review first
  reproduced client-root symlink execution, billing/renamed flat-schema false safety,
  App Server EPIPE, cross-kind success, and direct-only/early-close descendant cleanup.
  Each failed before its correction and passes through a retained regression fixture.
- Flaky result and disposition: None observed.

## Batch And Residual Risk

- Large-diff split trigger hit: Yes; the new provider boundary and adversarial fixture
  matrix are large enough to require deliberate review.
- If kept together, why: parsers, normalized envelope, process containment, public
  dispatch, package metadata, thin shims, and counterfactual fixtures form one atomic
  fail-closed contract. Splitting them would temporarily ship an unguarded or untested
  credential/process boundary; independent Architect, Security, QA, and Reviewer gates
  reviewed the combined outcome.
- Risk not resolved by passing checks: the Claude OAuth endpoint is non-public and may
  change. The live local capability probe returned enabled, while the live quota probe
  returned the intended generic `failed` safe stop; fixture coverage proves the expected
  schema, but this environment did not supply a live successful Claude quota reading.

## Completion

- Required checks all passed: Yes, including the post-close staged doctor required by
  local commit policy.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: create the task-scoped local commit.
