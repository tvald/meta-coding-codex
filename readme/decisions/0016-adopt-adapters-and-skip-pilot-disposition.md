# 0016: Adopt The Agent Adapters And Skip The Pilot Disposition

Status: Accepted

Date: 2026-07-30

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0005](0005-pilot-optional-agent-adapters.md) where it set the three agent
  adapters to **Pilot** status with a review at 2026-08-09 or after five eligible tasks.

Superseded by:

- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), only where copied
  client adapter files and a root Claude import are normal delivery surfaces. Canonical
  role semantics and this repository's skip-Pilot policy remain current.

## Context

The Reviewer, QA And Verification Agent, and Security And Risk Agent adapters were adopted
as a Pilot under Decision 0005, pending an evidence review. In this session the
Security And Risk Agent adapter was used for a live independent review with a clean,
actionable result. The product owner directly instructed that the adapters be promoted to
an adopted practice immediately, which the framework evidence ladder permits: a direct
durable product-owner instruction is sufficient evidence to Adopt.

The product owner further observed that the Pilot disposition adds a deferral step this
repository does not want. Because this repository is the source framework and moves its
own changes deliberately with durable records, it prefers to decide each change now rather
than carry a provisional Pilot state.

## Decision

- Promote the three role adapters—Reviewer, QA And Verification Agent, and Security And
  Risk Agent—from Pilot to **Adopted**. They remain optional integrations that a host
  project may omit; adoption removes only their provisional status, not their optionality.
- Update the shipped meta docs to describe the adapters as adopted optional integrations
  rather than a current pilot. The generic Adopt/Pilot/Revise/Reject mechanism in
  `framework-improvement.md` is unchanged and still available to other adopters.
- Establish a project-local policy: **for this repository only, skip the Pilot
  disposition.** Disposition every framework change as Adopt, Revise, or Reject; a change
  that would otherwise be piloted is adopted directly. This overrides the reusable default
  that level-2 and level-3 changes are usually Pilots.
- Record the standing policy in the always-read operating contract (root `AGENTS.md`) and
  point to it from project state (`readme/README.md`). Keep this override out of
  `readme/meta/`, which carries only reusable framework policy.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Adopt the adapters now and skip Pilot repo-wide | Removes a deferral the owner does not want; resolves shipped "current pilot" wording | Loses the staged-evidence safety of piloting | Accepted on direct owner instruction |
| Keep the adapters piloted until the review date | Staged evidence | Owner explicitly wants immediate promotion; ships a pilot an adopter cannot inspect | Rejected |
| Skip Pilot but leave the adapters piloted | Inconsistent | Contradicts the same instruction | Rejected |

## Consequences

Positive:

- Shipped meta docs no longer advertise a live pilot whose definition is wiped on install.
- Framework changes here are decided immediately, matching how this repo already operates.

Negative:

- This repo forgoes the Pilot mechanism's staged-evidence safety and relies on decisions,
  quality records, and review triggers instead.

Neutral or follow-up:

- The reusable Pilot mechanism remains intact for adopters; only this repository opts out.
- Revisit if a future change here would genuinely benefit from staged piloting.

## Confidence

Confidence: High

Why:

The product owner directly instructed both the promotion and the skip-Pilot policy, and
the evidence ladder treats a direct durable owner instruction as sufficient to Adopt.

## Review Trigger

Revisit when:

- An adopted-directly change here causes a regression that staged piloting would have
  caught, or the product owner reinstates piloting.

## Sources

- Product-owner instruction dated 2026-07-30.
- [Decision 0005](0005-pilot-optional-agent-adapters.md) and the framework evidence ladder
  in [framework-improvement.md](../meta/framework-improvement.md).
