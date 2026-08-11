# T-0019 Exploration Feature Promotion Notes

## Task Frame

- Goal: promote the highest-value, non-overlapping recommendations from T-0017 and
  T-0018 into independently executable tasks while leaving all other candidates visible
  for later product-owner review.
- Scope: task selection, briefs, dependencies, assessment annotations, catalog overflow,
  cursor close state, validation, and a task-scoped commit.
- Non-goals: implement the data CLI, migrate records, create skills, or change framework
  behavior and policy.
- Constraints: consolidate overlapping validator and data-store work; give each
  promoted feature observable acceptance; do not silently discard or promote the
  remaining candidates.
- Route and risk: Quick change / Low because this changes planning records only and
  makes no executable or policy change.
- Done when: promoted features have dedicated, dependency-correct briefs; retained
  candidates are explicitly discoverable; catalog overflow preserves old rows unchanged;
  links, structure, budgets, and diff checks pass.

## Selection Rule

Promote recommendations that have direct observed failure evidence, reduce repeated
high-frequency work, and form a coherent implementation boundary. Keep lower-evidence,
later-stage, or dependent expansion ideas in the assessments until the product owner
reviews them.

## Plan

- [x] Define the minimum non-overlapping promoted set.
- [x] Create acceptance-ready briefs and catalog dependencies.
- [x] Mark all unpromoted candidates as retained for later review.
- [x] Apply the current catalog overflow rule without altering archived rows.
- [x] Validate and close T-0019.

## Result

- Promoted [T-0020](0020-framework-data-cli-brief.md),
  [T-0021](0021-project-onboarding-skill-brief.md), and
  [T-0022](0022-task-recovery-skill-brief.md). T-0020 is Ready; the two skill tasks wait
  on its canonical data/query boundary.
- Retained candidates are marked in the source [T-0017](0017-process-codification-evaluation-notes.md#promotion-status--2026-08-11)
  and [T-0018](0018-data-store-scalability-evaluation-notes.md#promotion-status--2026-08-11)
  assessments rather than copied into another backlog.
- The catalog remains at 20 active rows. T-0001 and T-0002 were moved byte-for-byte to
  the [August archive](../archive/tasks/2026-08-catalog.md) with a distilled live-link
  index under the current overflow rule.

## Verification Results

- Pass: all 22 task IDs are unique, `T-0023` is the expected next ID, dependency
  references resolve across active and archived rows, and each row has ten
  escaped-delimiter-aware columns.
- Pass: archived T-0001 and T-0002 rows exactly match their pre-task `HEAD` versions.
- Pass: an archive-aware local-target check validated 122 Markdown files.
- Pass: `git diff --check` reported no whitespace errors; the cursor, catalog,
  assessment notes, new briefs, and active learning log remain within their budgets.
- Residual risk: T-0020 through T-0022 are planned work, not implemented features. Their
  individual high-risk readiness, decision, security, and verification gates remain.
