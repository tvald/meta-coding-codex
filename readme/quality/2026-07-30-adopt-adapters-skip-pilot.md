# Quality Record: Adopt Adapters And Skip The Pilot Disposition

- Date: 2026-07-30
- Change: Promote the three role adapters from Pilot to Adopted and establish a
  repository-local policy to skip the Pilot disposition.
- Route: Initiative
- Risk: Medium, because it changes shipped adapter status wording and the repository's
  disposition process, but adds no executable behavior.
- Owner or reviewer: Root Orchestrator on direct product-owner instruction.

## Scope And Criteria

- User-visible outcome: The adapters are adopted, the shipped docs no longer advertise a
  live pilot, and this repo adopts framework changes directly.
- In scope: Shipped meta wording (`agent-definitions.md`, `README.md`), the `AGENTS.md`
  operating contract, Decision 0016, project state, and records.
- Non-goals: Changing the reusable Pilot mechanism in `framework-improvement.md` or the
  adapters' optionality.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| No shipped file calls the adapters a "current/three-role pilot" | Repository grep | Only the generic Pilot mechanism remains in shipped meta | Pass |
| The generic Pilot mechanism is untouched | `framework-improvement.md` review | Adopt/Pilot/Revise/Reject ladder unchanged | Pass |
| Skip-Pilot policy is in the operating contract and project state | `AGENTS.md` and `README.md` review | Bullet in Operating Contract; row in Standing Project Policies; both link Decision 0016 | Pass |
| Decision links are bidirectional and intact | Link check and 0005/0016 review | 0016 supersedes 0005; 0005 points forward; 0 broken links | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Direct product-owner instruction to promote and to skip Pilot |
| Architecture and project context | Yes | Adoption is source-framework-owned; skip-Pilot is project-local and kept out of meta |
| Verification and rollback | Yes | Documentation-only change, removable in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Grep for specific-adapter "pilot" wording in shipped files | Removed; only the generic mechanism remains | Pass | |
| Yes | Budgets and Markdown link integrity | Cursor within 80 lines; 0 broken links | Pass | |
| Yes | Packer/installer inventory unchanged | Inventories still agree | Pass | |

- Criteria or methods amended after implementation began: None.
- Flaky result and disposition: None.

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Promote adapters; skip Pilot repo-wide; record in project state | Adapters adopted; policy in Operating Contract and Project State | None |
| Decision 0005 | Adapters were piloted | Decision 0016 promotes them and is linked from 0005 | None |
| Directory contract | Project overrides stay out of `readme/meta/` | Skip-Pilot lives in `AGENTS.md`, Decision 0016, and the cursor | None |

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Commit; apply the skip-Pilot disposition to future framework changes here.
