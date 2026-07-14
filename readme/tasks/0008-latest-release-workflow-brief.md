# Task Brief: Latest Core Release Workflow

## Identity And Source

- Task ID: T-0008
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: After adding the core package script, add a GitHub workflow
  that builds the zip on every push to `main` and publishes it as a release tagged
  `latest`; then add top-level README commands that download and unpack that release
  from the destination project's root, 2026-07-14.
- Parent or split task IDs: None

## Goal

Keep a GitHub release tagged `latest` synchronized with every push to `main`, with the
verified portable-core zip produced by T-0007 attached as its release asset and concise
installation commands available to adopters.

## Background

T-0007 creates a deterministic local packaging entrypoint. Automating it in GitHub
Actions removes manual release work, but introduces repository write permission,
moving-tag semantics, concurrent-push behavior, and external publication risk that must
remain isolated from the packaging implementation.

## Scope

In scope:

- A workflow triggered by pushes to `main`.
- Least-privilege checkout, core package generation, archive verification, moving or
  creating the `latest` tag, and creating or updating one GitHub release asset.
- Concurrency behavior for rapid pushes, explicit GitHub token permissions, and safe
  failure before publication.
- Top-level README commands that download the stable asset and unpack it from the root
  of the destination repository, including the existing-`AGENTS.md` merge boundary.
- Workflow/installation documentation and task-specific decision, quality, threat,
  learning, and state records.

Out of scope:

- Running or dispatching the workflow, pushing commits/tags, or publishing a release in
  this session.
- Versioned releases, changelog generation, signing, attestations, deployment, or
  publishing optional integrations.
- Changing repository settings or secrets outside the workflow file.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework maintainer | Push a verified commit to `main` | GitHub rebuilds and publishes the current core zip automatically |
| Framework adopter | Download the newest portable core | Use one stable `latest` release and asset name |

## Acceptance Criteria

- [x] A workflow triggers only on pushes to `main` and uses the T-0007 script as the
      sole package builder.
- [x] Build and archive verification complete before any tag or release mutation.
- [x] The workflow declares only the permissions needed to update the `latest` tag and
      release, and does not expose credentials to untrusted triggers.
- [x] Rapid pushes cannot let an older run overwrite a newer `latest` release.
- [x] The `latest` tag and release asset are created on first run and updated on later
      runs without accumulating stale duplicate assets.
- [x] The top-level README gives copyable download-and-unpack commands using the exact
      release asset URL and warns maintainers to merge rather than overwrite an existing
      root `AGENTS.md`.
- [x] Workflow syntax, action pinning or first-party tooling, shell safety, permissions,
      event scenarios, docs, risk, diff, and staged checks pass.
- [x] Task-owned changes are committed separately after T-0007.

## Constraints

- Use current official GitHub Actions and GitHub CLI behavior as the source of truth.
- Keep `contents: write` scoped to the publication job/workflow and use the automatic
  `GITHUB_TOKEN`; add no repository secret or third-party release credential.
- Do not weaken branch protections or grant pull-request/fork-triggered write access.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: The implementation is small but combines build, concurrency, mutable
  Git reference, release update, permissions, and external publication behavior.
- Why this risk gate: CI/CD write permissions and automated public release are High-risk
  trust boundaries even though the workflow change itself is locally reversible.
- Upstream artifacts required: T-0007 result, Decisions 0004/0008/0009, current official
  GitHub workflow/token/release documentation, and repository Actions conventions.
- Escalation trigger: Correct behavior needs a long-lived secret, broader repository
  permission, force-pushing `main`, deleting versioned releases, or a third-party action
  without an acceptable trust/pinning story.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Older run publishes after newer push | `latest` points at stale framework | Serialized concurrency plus current-ref check before every mutation |
| Write token is exposed to untrusted code | Repository or release compromise | Push-to-main only, automatic token, least permissions, no untrusted checkout/ref |
| Tag moves but asset upload fails | Release metadata and artifact disagree | Verify first, sequence mutations, and make reruns idempotent |
| Asset update leaves stale duplicates | Users download the wrong archive | Fixed asset name and clobber/update behavior |
| Workflow packages state or optional integrations | Published archive violates core boundary | Invoke only the verified T-0007 script and recheck inventory before publication |
| Easy installation overwrites host instructions | Destination loses project-specific agent policy | Keep archive extraction interactive on collision and document the required AGENTS merge |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| GitHub-hosted Ubuntu runners include the GitHub CLI | Medium | Verify against current official GitHub runner/CLI documentation or install explicitly |
| A release tag named `latest` can be safely moved through the GitHub API | Medium | Verify current Git refs and release API behavior before implementation |

## Verification Plan

- Automated checks: YAML parse, trigger/permission/concurrency assertions, action/tool
  provenance, shell/static checks, mocked first-run/update/stale-run scenarios where
  practical, script-driven archive inventory, links, budgets, and `git diff --check`.
- Manual checks: Permission and hostile-trigger review, tag/release sequencing,
  idempotency, concurrency, failure states, and staged diff.
- Documentation checks: README commands use the actual repository/release/asset names;
  workflow, Decisions 0004/0008/0009 and new decision, task, quality, threat, changelog,
  and cursor agree.
- Baseline or counterfactual evidence for new regression/behavior tests: No GitHub
  workflow currently builds or publishes the core archive.

## Material Amendments

| Revision | Date | Source | Change | Reason | Scope Or Acceptance Impact |
| --- | --- | --- | --- | --- | --- |
| r2 | 2026-07-14 | User instruction | Add top-level installation commands for downloading and unpacking the `latest` release | Extends scope and acceptance to the release consumer workflow and existing-AGENTS collision warning |

## Done When

- The workflow and records are present, every locally runnable required check passes,
  no external release action has been performed, and the separate local commit is
  confirmed.
