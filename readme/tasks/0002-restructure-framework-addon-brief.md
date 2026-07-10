# Task Brief: Restructure Framework Add-on

## Goal

Make this repository a self-contained add-on whose reusable framework is packaged under
`readme/meta/` and whose project-specific documentation is clearly categorized under
`readme/` and excluded from new-project packages.

## Background

The current `readme/` directory mixes reusable framework policy with the live memory of
this framework repository. The user approved a package-only reset model and a categorized
project-documentation layout directly under `readme/`.

## Scope

In scope:

- Framework and project-documentation moves, entrypoints, links, templates, onboarding,
  packaging guidance, durable task records, and validation.

Out of scope:

- Runtime tooling, an in-place destructive reset command, product code, push, release,
  and automatic relocation of documentation in destination repositories.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Primary harness session | Start or resume project work | Read `AGENTS.md`, the meta entrypoint, and then the project cursor |
| Delegated agent | Begin a scoped assignment | Read the meta entrypoint before relevant assignment context |
| Framework adopter | Package into another repository | Copy framework files without copying this repository's project memory |

## Acceptance Criteria

- [x] All reusable framework files are under `readme/meta/`, with its README as the
  canonical agent entrypoint.
- [x] Mutable project documentation is categorized directly under `readme/` and the
  always-read cursor is `readme/README.md`.
- [x] Full-repository and package-only links pass, startup/onboarding flows are coherent,
  stale active paths are absent, and applicable budgets pass.
- [x] Durable records and the human overview reflect the new contract.

## Constraints

- Preserve the markdown-only runtime and existing safety/verification policy.
- Do not create compatibility stubs or empty on-demand directories.
- Treat packaging, not an in-place deletion command, as the supported reset mechanism.

## Workflow Route

- Route: Initiative
- Why this route: The change crosses all framework process owners, agent startup, project
  memory, templates, and packaging guidance.
- Risk gate: High
- Upstream artifacts required: Approved implementation plan and Decision 0004.
- Escalation trigger: A required historical record contains a unique normative rule not
  represented in reusable framework guidance.
- Next action after this task: Use the new package boundary for future installations.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale startup path | Agents silently skip policy or state | Explicit AGENTS contract plus path and package-only link checks |
| Meta depends on absent project state | Fresh package is broken | Keep dynamic state paths non-linking and exercise first-run bootstrap |
| History loses normative policy | Packaged framework becomes incomplete | Audit historical records before classifying them as mutable state |
| Broad move hides an omission | Broken docs or conflicting rules | One coherent migration, exhaustive scans, full diff and consistency review |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Existing history has no unique normative policy | High | Compared decisions/reviews with active process owners before implementation |
| Root README and AGENTS may remain as pointer integration surfaces | High | User required AGENTS guidance and approved meta as canonical framework home |

## Verification Plan

- Automated checks: Local Markdown links, package-only links/bootstrap, stale-path scan,
  template count, line budgets, fences, whitespace, and `git diff --check`.
- Manual checks: Primary, delegated, onboarded, and fresh-package startup flows; full
  diff review against the decision and threat model.
- Documentation checks: Canonical ownership, paths, task records, changelog,
  retrospective, and human/package overview.
- Baseline or counterfactual evidence for new regression/behavior tests: The current
  package cannot omit state because framework and memory share `readme/`; the temporary
  package check must succeed after the migration without mutable project records.
- Amendments after implementation starts, with reason and impact: Added the existing
  non-cursor `readme/README.md` collision scenario after adversarial review; this
  strengthened preservation and onboarding behavior without changing scope.

## Done When

- The requested structure and startup/package contracts are present, all required checks
  pass, records close consistently, and task-owned changes are locally committed.
