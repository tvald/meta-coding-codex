# Task Brief: Task-Loop State Reconciliation

## Identity And Source

- Task ID: T-0006
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: Review the most recent commit and reconcile significant
  changes into stateful repository files; later clarification that the commit was
  imported from a separate repository and core/state separability is the primary
  concern if framework edits are considered, 2026-07-14.
- Parent or split task IDs: None

## Goal

Make the repository's durable project state accurately describe the significant
task-loop framework changes imported by commit `d5ff9f5`.

## Background

Commit `d5ff9f5` imported substantial task intake, selection, lifecycle, interruption,
knowledge ownership, and local-commit policy changes from a separate repository. Its
reusable-core-only diff intentionally did not copy that repository's state. The host
repository now needs a local state migration, plus evidence that the reusable core can
remain packageable without mutable project files while onboarding still creates the
mandatory task catalog.

## Scope

In scope:

- Review the latest commit against its parent and identify significant durable changes.
- Instantiate and seed the canonical task catalog from existing task records.
- Validate that the reusable package remains self-contained without mutable state and
  that onboarding supplies the host-specific cursor/catalog boundary.
- Record the task-loop change in project state, decision, task, quality, threat, and
  learning owners where warranted.
- Verify links, budgets, ownership consistency, and the final task-scoped diff.

Out of scope:

- Redesigning or expanding the task-loop semantics in `readme/meta/` unless the
  separability audit proves a concrete defect.
- Rewriting historical task records beyond the minimum catalog links needed for
  discovery.
- Amending or otherwise rewriting commit `d5ff9f5`.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Root Orchestrator | Start, resume, select, and close work | Recover canonical task state from `readme/tasks/README.md` |
| Product owner | Review repository progress | See significant task-loop adoption and current task state reflected durably |
| Framework adopter | Package and initialize the framework | Receive reusable policy without this repository's project state |

## Acceptance Criteria

- [x] The latest commit's material behavior and trust-boundary changes are identified.
- [x] The imported core passes a state-free package/bootstrap separation check.
- [x] `readme/tasks/README.md` exists, links all existing task records, and selects
      T-0006 without inventing unsupported history.
- [x] Significant task-loop adoption is reflected in the canonical decision, quality,
      threat, changelog, retrospective, task, and project-cursor owners.
- [x] Reusable framework policy remains unchanged unless review finds a blocking defect.
- [x] Required link, budget, structural, consistency, whitespace, and diff checks pass.
- [x] The completed task-owned documentation is committed locally.

## Constraints

- Preserve the clean starting worktree and do not amend the reviewed commit.
- The Root Orchestrator remains the sole writer of shared state files.
- Treat changes to agent instructions and task authority as a High-risk trust-boundary
  review even though this task primarily changes Markdown state.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: The reviewed commit is cross-cutting framework governance and needs
  several independently owned durable records plus formal quality and threat review.
- Why this risk gate: Agent instructions, authority provenance, interruption semantics,
  and local commit behavior affect tool-using agent safety and repository integrity.
- Upstream artifacts required: Commit `d5ff9f5`, its parent `058349e`, framework process
  owners, existing task records, and state templates.
- Escalation trigger: Review finds unsafe authority expansion, destructive behavior, or
  a framework defect that cannot be corrected by state reconciliation alone.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Imported behavior remains undocumented locally | Later agents cannot recover why task governance changed | Map the import to canonical decision, learning, quality, threat, and cursor owners |
| Catalog invents historical state | Durable memory becomes misleading | Link only repository-backed task records and commits |
| Core and state are coupled accidentally | Packages copy project history or cannot bootstrap without it | Build a state-free package fixture and exercise onboarding boundaries |
| State repair drifts reusable policy | Review task silently changes imported framework semantics | Keep `readme/meta/` out of scope unless a concrete separability defect is proven |
| Shared-file delegation conflict | Concurrent edits overwrite canonical state | Delegate read-only review; Root remains sole state writer |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Existing numbered task files represent completed T-0001 through T-0005 | High | Their notes, decisions, cursor outcomes, and commits agree |
| The task-loop import is significant enough for a decision and formal review | High | It changes mandatory state, authority, lifecycle, and interruption contracts across 17 files |

## Verification Plan

- Automated checks: Local Markdown links and anchors, state/template structure, line
  budgets, canonical-owner assertions, a state-free package/bootstrap fixture,
  Markdown-only core, and `git diff --check`.
- Manual checks: Parent-to-HEAD semantic review, threat checklist, durable-owner
  consistency, historical catalog evidence, staged diff, and final Git state.
- Documentation checks: Decision, quality, threat, task catalog/notes, changelog,
  retrospective, and project cursor agree without duplicating process policy.
- Baseline or counterfactual evidence for new regression/behavior tests: At `d5ff9f5`,
  the mandatory catalog and every project record of the task-loop change are absent.

## Material Amendments

| Revision | Date | Source | Change | Reason | Scope Or Acceptance Impact |
| --- | --- | --- | --- | --- | --- |
| r2 | 2026-07-14 | User clarification | Record that `d5ff9f5` was imported and make core/state separability the primary framework-review lens | Distinguishes expected state omission from a host migration gap; adds state-free package/bootstrap acceptance and raises the bar for any core edits |

## Done When

- Every acceptance criterion and required runnable check passes, state is closed, and
  the task-scoped local commit is confirmed.
