# Quality Record: Format 1 Importer Isolation And Sunset

- Date: 2026-08-13
- Task: T-0050 revision 2
- Route and risk: Quick change, Medium
- Decision owner: [Decision 0024](../decisions/0024-revise-structured-task-store-for-adapters.md)

## Acceptance And Evidence

| Criterion | Observed Evidence | Status |
| --- | --- | --- |
| Onboarding-only grammar | Help exposes only `tasks onboarding migrate-format1`; generic `tasks migrate` returns `MIGRATION_ONBOARDING_ONLY` before importer loading, source access, or store mutation | Pass |
| Exact legacy fence | Dry run reruns preflight read-only and apply reruns it under the exclusive FileTaskStore operation; both require exactly `legacy_format1` before preparation or cutover | Pass |
| Ordinary-runtime isolation | The top-level importer dependency is removed; dynamic loading is limited to the recognized legacy-candidate preflight branch and the fenced onboarding handler. Version, help, preflight, init, doctor, and startup pass with deliberately invalid importer bytes in a nonlegacy repository | Pass |
| Frozen behavior | `importer.mjs` remains byte-identical at SHA-256 `ede113017aa5f7152eb8c1a0a749cb4be614a3dad46a442f7c43af4c8226e0a3`; exact parsing, bounds, transformations, source digest/recheck, staging validation, and atomic absent-directory claim are unchanged | Pass |
| Compatibility contract | Breaking grammar advances task CLI metadata from 2.0.0 to 3.0.0 consistently in runtime, package manifest, source tests, and packed-client tests | Pass |
| Finite support | Onboarding policy freezes support to framework 1.x/task CLI 3.x, requires an accepted decision for extension, defines objective removal at 2.0/4.0, and tells remaining legacy clients to migrate with the final pinned 1.x package before upgrade | Pass |
| No expansion | No new legacy format, field, alias, transformation, repair heuristic, automatic migration, normal-runtime adapter, or project-init path was added | Pass |

## Verification

- Focused version/help, lazy-import, preflight, and Format 1 migration: 5/5 passed.
- Focused source framework-data/onboarding: 29/29 passed for independent review.
- Installed task CLI and npm package policy: 20/20 passed.
- Serial framework-data owning file: 39/39 passed, including the 10,000-task case in
  47 seconds. Earlier aggregate and isolated timeouts occurred while Root heavy checks
  overlapped; the unchanged case also passed alone for Root in 53 seconds.
- Independent installed-tarball smoke passed 3.0 version/help, generic-command no-write
  fencing, deterministic dry run, atomic apply, and source immutability.
- Final non-overlapped full repository suite: 162/162 passed; the 10,000-task case
  completed in 47 seconds.
- Package audit: 61 files, 169383 bytes, SHA-256
  `68424c114e4da2f15cbc171207aacb1912609261f87215ee7f6059e3faa336e2`.
- Doctor, syntax, static import/version scans, and `git diff --check` passed.

## Review And Residual Risk

- Independent Reviewer disposition: Adopt with no blocking finding.
- Independent QA disposition: Pass with no finding on frozen hashes.
- The importer intentionally remains shipped throughout framework 1.x, and preflight
  must load it when a repository has the exact legacy-candidate heading and metadata.
  Neither behavior exposes it to an ordinary structured-store command.
