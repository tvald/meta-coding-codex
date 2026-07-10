# 0001: Import Selected Verification And Continuity Practices

Status: Accepted

Date: 2026-07-10

Owners:

- Framework maintainers acting under the user's request to assess and selectively
  import practices from the supplied alternative framework

Supersedes:

- None

Superseded by:

- [0002: Make Local Task Commits The Default Completion Step](0002-default-local-task-commits.md), only for the statement that the imported controls do not authorize commits. All other parts of this decision remain accepted.
- [0003: Address The Framework Critique](0003-address-framework-critique.md), for the
  earlier choice not to require global state and for template terminology consolidated
  into the quality record. The seven selected integrity practices remain accepted.

## Context

The user supplied an alternative agentic-development framework for comparison. It has
strong controls for verification integrity, canonical knowledge ownership, command
reliability, failed-attempt continuity, and non-blocking approval waits. It also assumes
automatic commit authority, a global state file updated every session, full-suite runs
for every task and reviewer, separate-agent review for all behavior changes, and
vendor-specific runtime features.

The current framework already provides scale-adaptive routing, risk-based quality gates,
source-trust controls, shared-worktree safety, operational readiness, resumption packets,
and an evidence-gated framework-improvement process. Replacing it would lose those
advantages and add routine ceremony.

## Decision

We will retain the current framework and import these adapted practices:

1. Give each durable fact, rule, or command catalog a canonical owner; link elsewhere
   and identify summaries that must stay synchronized.
2. Predeclare verification criteria and methods for material behavior changes when
   practical, and record the rationale and impact of later amendments.
3. Seek counterfactual confidence that new regression or behavior tests detect the
   pre-change failure, using the safest appropriate technique.
4. Treat fail-then-pass results on unchanged code as flaky evidence that requires a
   recorded disposition rather than silent reruns.
5. Keep exact project commands in one canonical catalog and record them only after
   execution in the relevant environment.
6. Record recurrence-prone failed approaches in resumable task notes with evidence and
   conditions for retry.
7. Let approval waits block dependent actions while safe independent work continues,
   batching compatible decisions.

These controls remain risk-scaled. They do not authorize commits, branch operations,
subagents, destructive actions, releases, or other external side effects.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Replace the current framework | Internally coherent end-to-end workflow; concrete Claude adapter | Regresses security and operational coverage; adds uniform ceremony and Git/runtime assumptions | Rejected |
| Import the alternative unchanged alongside the current framework | Preserves every idea for local choice | Creates two competing sources of process truth and contradictory defaults | Rejected |
| Import selected practices with risk-scaled wording | Captures the strongest integrity controls while preserving portability and proportionality | Requires edits across several process docs and templates | Accepted |
| Make no changes | Avoids framework growth | Leaves concrete verification-gaming and command-drift safeguards weaker than they could be | Rejected |

## Consequences

Positive:

- Reviews can detect verification criteria weakened after implementation.
- New tests have a clearer standard for proving that they detect meaningful behavior.
- Flaky checks and failed approaches are less likely to be erased by reruns or context
  loss.
- Command documentation has an explicit owner and execution evidence.
- Approval waits consume less product-owner and agent time.

Negative:

- Medium- and higher-risk work may require a small amount of additional verification
  metadata.
- Maintainers must keep templates aligned with the quality and automation policies.
- Counterfactual testing requires judgment to avoid unsafe base checkouts or expensive
  environments.

Neutral or follow-up:

- Do not create project-specific standards, task notes, or verification manifests until
  a real task needs them.
- Revisit or compress the imported rules if agents repeatedly misapply them or their
  context cost exceeds the defects they prevent.

## Confidence

Confidence: High

Why:

The adopted controls address concrete and recurring failure modes—post-hoc criteria,
tests that cannot fail, rerun-until-green behavior, contradictory commands, repeated
failed approaches, and unnecessarily blocking approvals. The adaptations are reversible,
conditional, and fit existing canonical artifacts without adding a new mandatory
workflow.

## Review Trigger

Revisit this decision when:

- verification-integrity metadata becomes routine ceremony without catching defects;
- counterfactual checks create unsafe or disproportionate workspace manipulation;
- the canonical command policy conflicts with established repository tooling; or
- a future framework evaluation provides outcome data favoring a different state,
  review, or verification model.

## Sources

- User request dated 2026-07-10.
- Alternative framework supplied under `tmp/` for this assessment and intentionally
  excluded from version control.
- Existing framework policies in `readme/quality-system.md`,
  `readme/knowledge-management.md`, `readme/automation-policy.md`, and
  `readme/resumption-protocol.md`.
