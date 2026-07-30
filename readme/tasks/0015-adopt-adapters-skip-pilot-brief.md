# Adopt Adapters And Skip The Pilot Disposition

## Goal

Promote the three role adapters from Pilot to Adopted and record a repository-local policy
that this repo skips the Pilot disposition and adopts framework changes directly.

## Background

The adapters were piloted under Decision 0005 pending a review. The product owner directed
immediate promotion and a standing policy to skip Pilot for this repository. Adoption also
resolves shipped meta wording that advertised a "current adapter pilot" whose definition is
wiped on install.

## Scope

In scope:

- Reframe the adapters as adopted in `agent-definitions.md` and `README.md` (shipped meta).
- Update the `AGENTS.md` operating contract and record the policy in `readme/README.md`.
- Decision 0016 and the usual quality, catalog, changelog records.

Out of scope:

- Changing the reusable Adopt/Pilot/Revise/Reject mechanism or the adapters' optionality.

## Acceptance Criteria

- [x] No shipped file describes the adapters as a current or three-role pilot.
- [x] The generic Pilot mechanism in `framework-improvement.md` is unchanged.
- [x] The skip-Pilot policy is in the operating contract and project state, linking 0016.
- [x] Decisions 0005 and 0016 are bidirectionally linked; links and budgets pass.

## Constraints

- The skip-Pilot override is project-local and must stay out of `readme/meta/`.
- Adoption is a source-framework status change and may update shipped meta wording.

## Workflow Route

- Route: Initiative
- Why this route: A framework status change plus a standing project-process policy.
- Risk gate: Medium
- Escalation trigger: A change that would remove the reusable Pilot mechanism for adopters.
- Next action after this task: Apply the skip-Pilot disposition to future changes here.

## Verification Plan

- Automated checks: Grep for specific-pilot wording, link integrity, budgets, packaging.
- Manual checks: Confirm the generic Pilot mechanism and adapter optionality are intact.

## Done When

- All acceptance criteria and required checks pass and the change is committed locally.
