# Quality Record: NPM Delivery Retirement

- Date: 2026-08-11
- Change: T-0030 retirement of ZIP/curl/vendored framework delivery and in-client edits
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and Reviewer gates

## Scope And Criteria

- User-visible outcome: installation and update guidance has one immutable npm dependency
  path; no live repository surface publishes, downloads, installs, reconciles, or edits a
  copied framework core.
- In scope: executable/workflow deletion, package and prompt inventory cleanup, live
  process/skill/user guidance, conservative one-time copied-client transition, source
  framework checks/changelog ownership, reciprocal decision supersession, and focused
  negative tests.
- Non-goals: deleting remote releases/tags, rewriting terminal task or historical quality
  evidence, deleting same-named client content by path, publishing npm, or migrating
  mutable client task/project state.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| No live executable or workflow can build, publish, fetch, or install the ZIP core | Exact deletion/inventory assertions and live-surface negative search | Exact deletion and closed live-owner mutation cases passed in the 10-test retirement suite | Pass |
| Supported install, startup, issue, and update guidance uses exact locked npm replacement | Documentation/skill contract tests and command search | Maintained docs and both provider skill contracts passed the locked-command and retired-token assertions | Pass |
| Installed clients never edit package bytes or keep a client framework changelog | Package/runtime doctor fixtures and live-owner review | Packed client fixtures remained immutable and installed doctor returned `{sourceRepository:false,activePath:null}` | Pass |
| One-time copied-client transition preserves client state and removes only provenance-proven framework copies | Static safety contract plus collision/ownership review | Guidance and the independently recomputed 49-entry legacy manifest passed all conservative counterfactual assertions | Pass |
| Historical tasks, decisions, quality records, and retrospectives remain accurate and discoverable | Scoped diff/repository link and history checks | Retirement suite preserved historical allow classes and substantive decision bodies while requiring reciprocal Decision 0021 links | Pass |
| Source-repository framework edits still require task and source changelog evidence | Doctor staged-evidence fixtures | Source conjunction and staged evidence positive/negative fixtures passed in the runtime suite | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0030 and T-0023 revision 6 make immutable replacement the only supported update model |
| Architecture and project context | Yes | Independent Architect accepted the exact inventory, compatibility, source/client, history, and transition boundaries below |
| Data, security, and permissions | Yes | Independent Security accepted guidance-only cleanup, exact provenance/dry-run/recovery, installed immutability, and remote-nonmutation controls |
| Slices and ownership | Yes | T-0030 owns retirement/reconciliation; T-0031 owns aggregate clean-client release proof; remote release mutation is excluded |
| Verification and rollback | Yes | Git restores deleted sources; focused static/runtime fixtures can prove absence and retained source evidence before commit |

Readiness verdict: Ready. Independent Architect and Security gates accepted the frozen
contract below before material retirement edits; QA supplied the exact focused test and
live/historical mutation matrix.

## Proposed Architecture Boundaries

- Delete the moving-release workflow, ZIP packer, curl installer, their dedicated shell
  fixtures/helpers, the two Node installer-inventory cases in the onboarding/recovery
  skill suites, and the package-local blank changelog seed. Remove their package,
  registry, source-map, standards, and live-process owners.
- Keep `.agents/`, `.codex/`, and `.claude/` skill/agent sources in Git for this source
  repository's harnesses, but exclude every such discovery bundle from the npm tarball
  by removing the package `files`, exact inventory, and audit requirements. Installed
  consumers use packaged canonical docs/facets, not provider discovery in `node_modules`.
- Preserve completed task narratives/records, prior quality and threat evidence,
  retrospectives, archives, and substantive superseded-decision bodies. Old execution
  paths remain accurate history; only reciprocal supersession metadata is added.
- Do not mutate the existing remote `latest` release or tag. That external destructive
  action requires separate authority and is unnecessary to retire repository support.
- Source-repository framework work remains editable and recorded in
  `readme/learning/framework-changelog.md`. Installed clients treat package bytes as
  immutable, report defects upstream, replace the exact locked dependency, and keep no
  client framework changelog.
- The copied-client transition is guidance-only: T-0030 ships no cleanup or migration
  executable. Removal requires explicit transition intent, a known legacy release/commit
  with a reviewed per-path manifest and expected digests, ordinary in-root paths,
  whole-file matches, a per-path dry run, and a clean backup/recoverable boundary. Path,
  directory, name, or matching bytes alone is not provenance. Never glob or recursively
  delete a copied tree. Modified, unproved, linked/unsafe, mixed-version, or same-named
  client paths stop for manual review. Bootstraps, manifests/locks, task/project state,
  decisions, quality/threat evidence, and unproved client content are never cleanup input.
- Publish the transition as a separately named package-audited documentation topic with
  a closed legacy ownership manifest tied to reviewed commit/release snapshots. Each
  entry records exact relative path, ordinary file type, mode, and SHA-256/bytes. The
  procedure installs/locks the exact npm package first; dry-runs exact-owned,
  preserved-state, and ambiguous paths; aborts on any ambiguity; removes proved files
  individually and only then empty directories; regenerates bootstraps; and verifies
  project preflight/init, task doctor/startup, Git diff, and rollback state. Installer
  ownership remnants and populated old changelogs stop unless individually manifested.
- Live client commands use
  `npm run --ignore-scripts --silent meta -- ...`; source-only root/task entrypoints may
  retain repository-pinned direct CLI commands. No guidance uses npx, global fallback,
  network fetch, or in-place package patching.
- Framework checks identify source mode only when physical package and repository roots
  are equal and the exact source conjunction is present: package identity,
  `package-files.json`, `scripts/check-npm-package.mjs`, and
  `readme/learning/framework-changelog.md` (all safe ordinary source artifacts absent as
  a conjunction from the tarball/client root).
  Source staged checks still require project-side changelog, decision, quality, and
  terminal-task evidence. Packed installed clients report no active framework changelog,
  ignore client shadow meta/changelog paths as package authority, and cannot classify
  bootstrap or project edits as source framework edits. Compatibility IDs remain stable.
- The source staged-evidence path predicate is closed over `bin/**`, `lib/**`,
  `prompts/**`, `tests/**`, `package.json`, `package-lock.json`, `package-files.json`,
  `scripts/check-npm-package.mjs`, root entry documentation, `readme/meta/**`, and source
  adapters/skills. Installed client bootstrap/state edits never use this predicate.
- A focused retirement test uses a closed live owner set: current decisions, top-level
  and process docs, maintained skill bodies/wrappers, prompt registry/snapshots, package
  manifests/inventory, scripts/tests, and workflow YAML. Only terminal task/quality/threat,
  retrospective/archive bodies, and explicitly superseded decision bodies may retain
  retired tokens. Mutation fixtures seed every live class and must fail while equivalent
  historical evidence remains allowed. The Git deletion set is an exact allowlist.
- Negative fixtures cover same-name, same-byte-but-unproved, modified, symlink, hardlink,
  directory, mixed-version, and exactly proved legacy copies without executing cleanup;
  hostile client shadows and npm pre/post sentinels prove package/client immutability.
- No implementation or test invokes `gh`, npm publish, remote deletion, or a release API.
- Standard replacement uses
  `npm install --package-lock-only --ignore-scripts --save-exact
  'meta-framework@npm:@tvald/meta-framework@<exact-version>'`, then
  `npm ci --ignore-scripts`, local project compatibility/preflight/init as applicable,
  and task doctor/startup. Rollback restores both manifest and lockfile, then runs the
  same script-disabled clean install. No bare, global, npx, publish, lifecycle, or
  in-place patch variant is supported.
- Removing the `framework-changelog` docs registry identifier is a pre-release removal
  contingent on T-0031 proving no released consumer. If that check finds a release, stop
  and reopen compatibility/versioning instead of silently deleting the public topic.
- Add scoped reciprocal Decision-0021 supersession metadata to Decisions 0004, 0005,
  0008–0013, and 0016–0020 (0007/0014 already link), preserving their bodies, statuses,
  and chains. Reconcile the live changelog/pipeline owners in `framework-improvement.md`,
  `knowledge-management.md`, `automation-policy.md`, `readme/README.md`,
  `source-map.md`, `standards.md`, and only the live preamble of the source changelog.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused retirement, skill, doctor, prompt, and package tests | Retirement 10/10 and combined runtime 44/44 passed | Pass | N/A |
| Yes | Full and package regression suites plus exact package audit | `npm test` 93/93; `test:package` 55/55; exact 52-file, 145182-byte artifact SHA-256 `f7e5c23ec77994cded84b156d108a0ab0e346853e3982ea8410988ee1c299d5d` | Pass | N/A |
| Yes | Live-surface negative search, links, budgets, doctor, staged doctor, and diff checks | Closed live/history scans and `git diff --check` passed; staged doctor passed with 65 paths, 39 framework paths, 157 Markdown files, and zero warnings | Pass | N/A |
| Yes | Independent Architect, Security, QA, and Reviewer gates | All four completion gates passed after correcting reciprocal Decision 0019/0020 wording and adding `CLAUDE.md` to the mutation-tested live inventory | Pass | N/A |

## Batch And Residual Risk

- Large-diff split trigger hit: Reassess after architecture; deletion, package registry,
  maintained skills, live process owners, decisions, and tests express one retirement.
- If kept together, why: leaving any live producer, consumer, or normal-update owner
  would preserve an ambiguous and unsafe second delivery contract.
- Risk not resolved by passing checks: historical evidence intentionally retains obsolete
  names; external remote release state remains untouched; copied clients without reliable
  provenance require manual transition review.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: commit T-0030 and activate aggregate release verification T-0031.
