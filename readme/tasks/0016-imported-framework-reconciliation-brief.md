# T-0016 Imported Framework Reconciliation Brief

## Identity And Source

- Task ID: T-0016
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: Pending imported framework changes and changelog, 2026-08-05
- Parent or split task IDs: None

## Goal

Reconcile the downstream-imported changes with the portable framework, retain only
evidence-backed reusable improvements, and ship a blank changelog seed without leaking
one host project's history into another.

## Scope

In scope:

- Disposition every imported policy group as Adopt, Revise, or Reject.
- Align canonical policy owners and affected templates.
- Define the portable changelog stub and this source repository's excluded audit owner.
- Keep package, installer, CI inventory, public docs, and project command evidence aligned.

Out of scope:

- Importing the downstream project's task catalog, decisions, knowledgebase rules, or archives.
- Changing installer overwrite, permission, release, or publication behavior.
- Retrofitting already accepted decisions or historical records to the new catalog budget.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework adopter | Installs the clean core, then customizes its local framework | Receives a resolvable blank changelog and records local changes without foreign history |
| Upstream maintainer | Imports a downstream framework improvement | Transfers unique evidence into upstream records, then restores the distributed changelog stub |
| Agent | Maintains task and framework state | Finds one explicit owner for local framework deviations and keeps task records concise |

## Acceptance Criteria

- [x] Every imported group has an evidence-backed Adopt, Revise, or Reject disposition.
- [x] No foreign task ID, decision, path, metric, or project-specific KB rule remains in the portable core.
- [x] The packaged and installed core contains the blank changelog stub, and source packaging fails if dated host entries appear there.
- [x] This repository's existing framework history remains intact in an excluded project-side owner.
- [x] Framework owners and templates agree; the live task schema is not silently changed.
- [x] Link, budget, package, reproducibility, installer, negative-leak, and diff checks pass.
- [x] An independent Reviewer finds no unresolved blocking issue.

## Constraints

- Preserve unrelated and imported work until each hunk is dispositioned.
- Keep the portable core Markdown-only and the installer additive and fail-closed.
- Follow Decision 0016: use Adopt, Revise, or Reject, never Pilot, in this repository.
- Do not amend accepted historical decisions; supersede their affected boundary explicitly.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: The outcome spans framework ownership, templates, package and installer inventory, source-project records, and verification artifacts.
- Why this risk gate: The changelog itself is documentation, but adding it to the exact installer allowlist changes the release payload and fail-closed installation contract.
- Upstream artifacts required: Decisions 0004, 0010, 0013, and 0016; current package/install scripts; both changelog locations; imported diff.
- Escalation trigger: Any need to change overwrite behavior, permissions, release publication, or the live task-catalog schema.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Downstream facts leak into the reusable package | Misleading state and broken links in every adopter | Blank stub, source-package dated-entry rejection, archive inspection |
| Producer and installer inventories diverge | Latest install fails closed | Exact inventory comparison, fresh install fixture, CI path review |
| Imported schema edits partially land | Process docs and live catalogs disagree | Retain Format 1 Details/Result columns and grep all owners/templates |
| Useful downstream evidence is discarded | Backported rules lose rationale | Record dispositions and decisive evidence in T-0016 and Decision 0017 before resetting the stub |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| The foreign changelog entries are evidence, not this repository's history | High | Their T-0038/T-0039 IDs, decisions, paths, and metrics do not exist here |
| Existing source history under `readme/learning/` is unique and must remain | High | Active and archived entries trace accepted local decisions and tasks |
| A blank in-tree stub is preferable to a referenced absent optional file | High | Package/install/link fixtures can verify the file mechanically |

## Verification Plan

- Automated checks: `git diff --check`; Markdown relative-link scan; line and task-row budgets; shell syntax/lint where available; package build twice; exact archive/installer inventory comparison; fresh install; collision and symlink fixtures; negative dated-entry packaging fixture.
- Manual checks: Diff review, foreign-identifier grep, disposition-to-diff trace, source-versus-portable boundary review.
- Documentation checks: Meta README, public README, framework improvement, knowledge management, templates, decision, changelog owners, catalog, cursor, and quality record agree.
- Baseline or counterfactual evidence for new regression/behavior tests: The current imported tree packages the untracked foreign changelog but the installer inventory omits it, so producer/installer comparison fails; the negative fixture will add a dated entry and require the revised packager to reject it.

## Material Amendments

| Revision | Date | Source | Change | Reason | Scope Or Acceptance Impact |
| --- | --- | --- | --- | --- | --- |
| r2 | 2026-08-05 | Product-owner clarification | The meta-framework source repository keeps framework-development tasks and state in project-side `readme/`; downstream product projects keep installed-framework deviation state under `readme/meta/` | Makes the source/consumer distinction explicit; validates the blank upstream seed plus downstream-local meta log |

## Done When

The reconciled diff contains only adopted or revised portable improvements, the blank
stub is safely packaged and installed, all declared checks pass, review findings are
resolved, durable records agree, and the task-scoped commit is confirmed.
