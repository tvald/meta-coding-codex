# Quality Record: Codex Agent Manifest Schema Compatibility

- Date: 2026-08-12
- Change: Replace the incompatible custom-agent `[agents] enabled = false` layer with
  the stable `features.multi_agent = false` control.
- Route: Quick change
- Risk: High
- Owner or reviewer: Root Orchestrator; focused security and diff review required

## Scope And Criteria

- User-visible outcome: Codex starts without rejecting the four `meta_` agent files.
- In scope: source manifests, generated client manifests, focused contract tests, and
  current documentation for the nested-delegation control.
- Non-goals: changing role semantics, sandbox modes, hook matchers, supported Codex
  baseline, prompt compilation, or initializer collision behavior.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| All four project manifests deserialize without the reported warning | Start the installed Codex App Server from the repository and inspect stderr | Codex 0.144.1 App Server exited 0 under `--strict-config`; stderr contained no malformed-role or `AgentRoleToml` warning | Pass |
| Each custom layer still removes multi-agent tools | Assert `features.multi_agent = false` in source and generated client bytes; inspect the current official configuration contract | The installed CLI reports `multi_agent` stable and false under the flag; focused tests assert identical source/client bytes; current official docs define the flag as the collaboration-tool switch | Pass |
| Exact profile binding, static stop guard, sandbox mode, and hook matchers remain unchanged | Focused adapter tests and staged diff review | All 22 focused tests passed; the diff changes only the disable table in executable manifests and the matching assertion | Pass |
| Package delivery remains deterministic and collision-safe | Package/initializer tests and package audit | All 66 package tests passed; the exact 55-file, 153230-byte package audit passed with SHA-256 `19597f6ab9e632a726d564fb103a38c0f931c73904ec63e5e4a891a7f16cf4a8` | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | The four warnings name one repeated malformed scalar and the requested outcome is explicit. |
| Architecture and project context | Yes | `lib/codex-integration.mjs` owns source and installed-client manifest bytes; Decision 0022 owns the integration boundary. |
| Data, security, and permissions | Yes | The replacement is the stable feature flag for the same tool-removal boundary; static role prohibitions remain defense in depth. |
| Slices and ownership | Yes | One tightly coupled source/template/test/docs patch owned by the primary session. |
| Verification and rollback | Yes | The installed 0.144.1 parser reproduces the defect; Git revert restores the prior exact files, and focused plus full package checks are available. |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Installed Codex 0.144.1 App Server startup under `--strict-config` | Exit 0; no malformed-role or `AgentRoleToml` warning for any `meta_` manifest | Pass | — |
| Yes | `node --test tests/hook-adapters.test.mjs tests/project-initializer.test.mjs` | 22/22 tests passed | Pass | — |
| Yes | `npm run --silent test:package` | 66/66 tests passed | Pass | — |
| Yes | `npm test` | 105/105 tests passed | Pass | — |
| Yes | `npm run --silent package:check` | Exact 55-file package audit passed; 153230 bytes; SHA-256 `19597f6ab9e632a726d564fb103a38c0f931c73904ec63e5e4a891a7f16cf4a8` | Pass | — |
| Yes | `node readme/meta/framework-data/cli.mjs doctor` | Store plus all integrated framework checks passed without warnings | Pass | — |
| Yes | Focused security and diff review | No expanded sandbox, hook, profile, prompt, tool, dependency, secret, or external-action boundary; invalid table is absent from generated manifests | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: The pre-change App
  Server startup emitted four `invalid type: boolean false, expected struct
  AgentRoleToml` errors and ignored all four manifests.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | `.codex/agents/meta_*.toml` and generated equivalents | The installed parser treats `agents.enabled` as an agent-role entry and drops each entire manifest. | Use the stable `features.multi_agent` flag and retain the static no-delegation guard. | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | No malformed-role warnings | Strict App Server startup has no role warnings | None |
| Decisions and standards | Thin, schema-valid, nested-disabled agents | Decision 0023 records the compatible control; exact role and sandbox boundaries are unchanged | None |
| Tests and docs | Assert and describe the effective control | Generator, source manifests, contract tests, README, threat model, and changelog use the stable feature flag | None |
| State and assumptions | T-0035 closes only after every runnable check passes | T-0035 is Done with all required evidence; the required local commit remains | Commit |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: N/A.
- Risk not resolved by passing checks: Exact custom-agent selection and lifecycle hook
  behavior remain version-coupled to the separately published supported Codex baseline.
  The local `codex update` command could not detect this standalone installation method,
  so the installed binary remains 0.144.1 even though the manifest warnings are fixed.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Create the required scoped local commit.
