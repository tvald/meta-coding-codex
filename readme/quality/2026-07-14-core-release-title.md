# Quality Record: Core Release Title

- Date: 2026-07-14
- Change: Rename the moving `latest` release display title to `core-framework`.
- Route: Quick change
- Risk: Medium, because the value is applied by a release-capable workflow while its
  permissions and mutation sequence remain unchanged.
- Owner or reviewer: Root Orchestrator

## Scope And Criteria

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| New releases use `core-framework` | Workflow constant and create-path assertions | The create command uses the sole `RELEASE_TITLE` value | Pass |
| Existing releases converge on `core-framework` | Update-path assertion | The republish edit uses the same title value | Pass |
| Publication contract is otherwise unchanged | Scoped diff and existing threat-model review | Tag, asset, permissions, and command ordering are unchanged | Pass |

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Actionlint 1.7.12 | Completed without findings | Pass | |
| Yes | yamllint 1.37.1 | Completed without findings | Pass | |
| Yes | Exact title/path assertions | One new constant feeds two title flags; the old constant is absent | Pass | |
| Yes | Documentation, budget, and diff checks | Links resolve, active changelog is 153 lines, and `git diff --check` passes | Pass | |

- Criteria or methods amended after implementation began: None.
- Counterfactual evidence: The parent commit has the old title constant exactly once;
  the working workflow replaces it while retaining both consumers.
- Flaky result and disposition: The first aggregate assertion stopped because `rg -c`
  returned an empty no-match count; normalizing that expected case to zero made the full
  unchanged check set pass. This was a verification-harness defect, not a product flake.

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Display name is `core-framework` | Workflow constant matches | None |
| Decision 0011 and threat model | Preserve moving `latest` publication controls | No control or permission changed | None |
| Framework changelog | Record every framework edit within budget | New entry added and oldest entry archived unchanged | None |
| Project state | Close T-0011 and expose the recent outcome | Catalog and cursor updated | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- Risk not resolved by passing checks: The new display title takes effect only after a
  successful push-triggered publication; this task does not push or publish externally.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: None.
