# Quality Record: Framework Add-on Structure

- Date: 2026-07-10
- Change: Separate the reusable framework package from categorized project documentation.
- Route: Initiative
- Risk: High, because agent startup, instruction discovery, and durable authority paths change.
- Owner or reviewer: Root Orchestrator applying architecture, QA, security, and
  documentation review lenses.

## Scope And Criteria

- User-visible outcome: The repository can be packaged into another project without
  carrying this repository's mutable memory.
- In scope: Framework files, project documentation, entrypoints, templates, links,
  package/onboarding contract, and durable migration records.
- Non-goals: Runtime tooling, release/push, and an in-place destructive reset procedure.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Reusable framework is self-contained under meta | Structure and package-only link checks | State-free package resolved 25 Markdown files without project state | Pass |
| Project documentation uses approved categories | Tree and stale-path inspection | Only the cursor is a direct `readme/` file; categorized directories are non-empty and active stale paths are absent | Pass |
| All agents discover the meta README | AGENTS and startup-flow review | Primary and delegated startup contracts require meta before scoped work | Pass |
| Fresh package can initialize state | Temporary package bootstrap exercise | Project cursor instantiated from the reusable state template | Pass |
| Records and overview remain consistent | Full diff and canonical-owner review | 40 repository Markdown files and anchors resolve; Decision 0004 and records agree | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Approved decision-complete plan and task brief |
| Architecture and project context | Yes | Concrete target tree and package-only reset selected by user |
| Data, security, and permissions | Yes | Local Markdown moves only; threat model identifies instruction risks |
| Slices and ownership | Yes | Single writer; coherent move followed by path rewrite and validation |
| Verification and rollback | Yes | Required checks declared; Git commit is locally reversible |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Full repository local Markdown links and anchors | 40 Markdown files passed | Pass | |
| Yes | State-free temporary package links and bootstrap | 25 Markdown files passed; cursor instantiated from template | Pass | |
| Yes | Active-guidance stale path and ownership scan | No obsolete active path; only cursor is a direct file and all present categories contain files | Pass | |
| Yes | Template count, budgets, fences, whitespace, and diff check | 11 templates; AGENTS 35/120, cursor 60/80, largest meta file 247/300; all structure checks passed | Pass | |
| Yes | Startup scenarios and full diff review | Primary, delegated, fresh, onboarded, and collision flows reviewed; 37-file staged change reviewed | Pass | |

- Criteria or methods amended after implementation began, with reason and impact: Added
  the existing non-cursor README collision scenario after adversarial review; it
  strengthened preservation behavior without changing the requested structure.
- Counterfactual evidence for new regression or behavior tests: The pre-change package
  boundary includes both reusable policy and repository-specific memory.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Fresh installation into an existing `readme/` tree | Presence alone could misclassify a host README as the framework cursor and risk overwriting or misrouting documentation | Recognize the cursor by heading and add preservation, relocation, link-update, and owner-decision handling | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Framework package separated from organized project documentation | Meta package and categorized project documentation are separate | None |
| Task brief | Approved structure and checks | All criteria passed | None |
| Decisions and standards | Decision 0004 owns structural choice | Active process paths and template contract agree | None |
| Tests and docs | Full and package-only checks pass | Required checks passed with observed results above | None |
| State and assumptions | Cursor and records point to new homes | Links pass and cursor closes idle | None |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: Splitting the moves from their link and entrypoint updates would
  leave an invalid framework between commits; this is one architectural documentation outcome.
- Risk not resolved by passing checks: Real installations are still needed to measure
  whether adopters understand the two README roles without assistance.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Create the task-scoped local commit and confirm `HEAD` and status.
