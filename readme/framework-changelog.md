# Framework Changelog

Every framework edit is recorded here so it can be audited, evaluated, and reverted.
Keep entries append-only. Limit the active file to 20 entries or 160 lines; move older
entries unchanged to `readme/archive/framework-changelog-YYYY.md` and link the archive.
Review pilots and sunset triggers during the scheduled hygiene pass in
[knowledge-management.md](knowledge-management.md).

## 2026-07-10: Address External Framework Critique

- Status: Adopted, with modified adoption for routing risk, approval authority, and
  parallel context publication.
- Evidence: Accepted user-provided review covering the full framework; detailed
  disposition in [Decision 0003](decisions/0003-address-framework-critique.md).
- Change: Added project state, durable retrospectives, onboarding, artifact budgets,
  approval parking, and qualitative change review; consolidated routing and templates;
  strengthened verification completion and parallel recovery rules.
- Success signal: A cold-start agent can find active work and prior corrections, one
  route is sufficient to begin work, and quality/process changes no longer require
  duplicate templates or numeric self-scores.
- Review or sunset trigger: The state/log churn exceeds their recovery value, a removed
  template proves necessary in two real tasks, or a retained safety overlay creates
  classification conflicts.
