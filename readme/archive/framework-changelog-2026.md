# Framework Changelog Archive: 2026

## 2026-07-10: Address External Framework Critique

- Status: Adopted, with modified adoption for routing risk, approval authority, and
  parallel context publication.
- Evidence: Accepted user-provided review covering the full framework; detailed
  disposition in [Decision 0003](../decisions/0003-address-framework-critique.md).
- Change: Added project state, durable retrospectives, onboarding, artifact budgets,
  approval parking, and qualitative change review; consolidated routing and templates;
  strengthened verification completion and parallel recovery rules.
- Success signal: A cold-start agent can find active work and prior corrections, one
  route is sufficient to begin work, and quality/process changes no longer require
  duplicate templates or numeric self-scores.
- Review or sunset trigger: The state/log churn exceeds their recovery value, a removed
  template proves necessary in two real tasks, or a retained safety overlay creates
  classification conflicts.

## 2026-07-10: Package Framework Under `readme/meta/`

- Status: Adopted.
- Evidence: Direct user instruction and selected directory/reset contracts, recorded in
  [Decision 0004](../decisions/0004-package-framework-as-addon.md).
- Change: Made `readme/meta/README.md` the reusable agent entrypoint; moved all reusable
  process files and templates under meta; categorized this repository's mutable project
  documentation directly under `readme/`; and defined state-free packaging plus
  first-run onboarding.
- Success signal: A package containing root AGENTS guidance and `readme/meta/` passes
  local-link checks without project state and can initialize a fresh project cursor.
- Review or sunset trigger: An adopter packages state unintentionally, agents confuse
  the two README roles, or an in-place reset becomes a demonstrated need.
