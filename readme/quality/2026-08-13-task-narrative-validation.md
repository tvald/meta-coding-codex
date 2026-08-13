# Quality Record: Task-Narrative Validation Boundary

- Date: 2026-08-13
- Change: T-0040 linked-narrative validation separation
- Route: Quick change
- Risk: Medium
- Owner or reviewer: Root Orchestrator with independent Reviewer gate

## Scope And Criteria

- User-visible outcome: a missing narrative unrelated to the current operation no longer
  makes the canonical task store unavailable.
- In scope: ordinary loads and mutations, doctor findings, targeted context safety,
  migration validation, compatibility metadata, and regression coverage.
- Non-goals: TaskStore interface extraction, lock changes, importer sunset, or relaxing
  canonical task path syntax.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Ordinary task operations do not require every linked Markdown file to exist | Remove one task's narrative, then query and mutate unrelated tasks | Startup, list, get, amend, and add succeeded while the narrative remained absent | Pass |
| Doctor reports every selected task and approval narrative through a bounded check | `linked_task_narratives` integration check using the repository Markdown reader | Missing narrative produced `DOCTOR_FILE_MISSING`; current repository inspected 51 unique paths | Pass |
| Targeted context validates all selected-task details before rendering | Missing leaf, missing parent, symlink, and missing later detail after a large first detail | Stable `CONTEXT_FILE_MISSING` for absence; unsafe link failed; truncation could not hide a later failure | Pass |
| Canonical path syntax and store invariants remain fail closed | Existing schema/path, malformed-state, migration, and store suites | Full task-store regression remained green | Pass |
| Installed CLI exposes the additive behavior contract | Compatibility version and packed CLI suite | Task CLI advanced from 1.1.0 to 1.2.0; packed suite passed 8/8 | Pass |

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused narrative/context suite | 3 passed initially; 2 passed after Reviewer fixes | Pass | — |
| Yes | Framework-data suite | 37 non-performance cases passed; 10,000-task case passed separately | Pass | — |
| Yes | Packed task CLI suite | 8 passed, 0 failed | Pass | — |
| Yes | Reproducible package audit | 55 files, 153591 bytes, SHA-256 `c66bf943ce4c10c2deee713aa0175d29149a895a293d053c8402ea1093ec3fa5` | Pass | — |
| Yes | Doctor, links, budgets, and diff check | All passed with no warnings before closure | Pass | — |
| Yes | Independent Reviewer | Initial two findings fixed; re-review Adopt | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact:
  targeted context was strengthened to validate every selected-task detail before
  truncation and normalize missing-parent/leaf failures after Reviewer findings.
- Counterfactual evidence for new behavior tests: before this change, deleting a linked
  narrative caused `loadStore` to fail `STORE_MISSING` before unrelated commands ran.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Bounded context | Rendering stopped before validating a later omitted detail | Validate/read all selected-task sources before bounded rendering | Resolved |
| Medium | Context error contract | Missing parent and missing leaf used different failure classes | Normalize both to `CONTEXT_FILE_MISSING`, exit 4 | Resolved |

## Batch And Residual Risk

- Large-diff split trigger hit: No.
- If kept together, why: load, doctor, context, compatibility, and tests form one public
  validation-boundary change.
- Risk not resolved by passing checks: context still reads selected narratives eagerly;
  future query/persistence separation may introduce a dedicated resolver interface.

## Completion

- Required checks all passed: Yes.
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: commit T-0040, then extract the TaskStore application and repository ports.
