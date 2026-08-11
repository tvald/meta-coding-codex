# Quality Record: Immutable NPM Package

- Date: 2026-08-11
- Change: T-0025 package manifest, base executable, exact inventory, and pack boundary
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent QA, Reviewer, and security/package gates

## Scope And Criteria

- User-visible outcome: a lifecycle-free `@tvald/meta-framework` package can be packed
  reproducibly and invoked only through the explicit locally installed dependency path.
- In scope: root npm manifest/lockfile, base binary, exact package inventory, pack audit,
  clean local package fixture, and missing-dependency hostile-PATH proof.
- Non-goals: task command relocation (T-0026), prompt compilation, extensions,
  initialization, obsolete ZIP removal, publication, or registry credentials.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Manifest is structurally publishable and lifecycle-free | Manifest and packed-manifest assertions | Manifest audit rejects runtime/optional/peer/bundled dependencies, 16 lifecycle hooks, implicit node-gyp, private scope, and allowlist drift | Pass |
| Binary reports immutable package version and fails boundedly on unknown commands | Direct and installed-package CLI fixtures | Plain and JSON version fixtures passed; malformed and 100 KiB/control-character arguments returned one fixed 44-byte error with exit 2 | Pass |
| Tarball inventory is exact and excludes project state/secrets/residue | Checked-in inventory compared with `npm pack --json` output | Dry-run and two actual packs each matched the sorted 52-file inventory; binary mode was 0755 and no file was group/world writable | Pass |
| Unchanged source produces byte-identical tarballs | Two isolated `npm pack --ignore-scripts` outputs and SHA-256 comparison | Two packs matched at SHA-256 `690f5b68857def63a2d0c5d5ea3c7095804c78f5306a811a8a2567bd9947c153`; computed SHA-512 matched npm integrity | Pass |
| Missing local dependency cannot execute an inherited same-name binary | Positive-control bare script plus explicit-local-path negative fixture | Bare command executed the sentinel; explicit local path failed without sentinel execution or `node_modules`, including a shell-special temporary path | Pass |
| Packaging performs no publish or client mutation | Temporary pack/install fixtures and worktree inspection | Pack/install used script-disabled temporary destinations; no publish command exists and source inspection showed only intended files | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0025 and T-0023@r5 define one package-only slice |
| Architecture and project context | Yes | Decision 0021 fixes name/alias, launcher, roots, lifecycle, version, and rollback boundaries |
| Data, security, and permissions | Concern | Registry ownership remains unverified and no publication is authorized; lifecycle, implicit-install, hostile-PATH, and shell-special-path negatives now pass |
| Slices and ownership | Yes | Root owns package files; QA is read-only; T-0026+ surfaces remain protected |
| Verification and rollback | Yes | Pack/install occurs only in temporary directories; source changes remain locally revertible before commit |

Readiness verdict: Ready with concerns. Proceed without registry publication and only
with the predeclared lifecycle, inventory, reproducibility, and hostile-PATH checks.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Package unit/integration tests | `npm run --silent test:package`: 6 passed | Pass | Not applicable |
| Yes | Exact/reproducible pack audit | `npm run --silent package:check`: 52 files; two byte-identical packs; integrity and permissions verified | Pass | Not applicable |
| Yes | Existing framework-data regressions | `npm test`: 39 passed, 0 failed | Pass | Not applicable |
| Yes | Doctor, links, budgets, and diff check | Doctor passed all eight integrated checks without warnings; `git diff --check` passed | Pass | Not applicable |
| Yes | Independent review and security/package verification | QA blockers resolved; Security and Reviewer independently approved with no open findings | Pass | Not applicable |

- Criteria or methods amended after implementation began, with reason and impact:
  independent QA expanded lifecycle coverage, bounded unknown-command output, strict CLI
  grammar, artifact integrity/permissions, offline lock stability, a shell-special
  temporary-path counterfactual, and bounded untrusted npm diagnostics. These
  strengthened the declared security criteria without changing scope.
- Counterfactual evidence for new regression or behavior tests: the hostile-PATH fixture
  first proved that a bare script ran the harmless sentinel, then proved the explicit
  local path did not; every forbidden lifecycle field and implicit node-gyp flag was
  injected independently and rejected.
- Flaky result and disposition: None observed.

## Batch And Residual Risk

- Large-diff split trigger hit: No; package metadata, entrypoint, inventory, audit, and
  fixtures are one independently testable distribution boundary.
- If kept together, why: Not applicable.
- Risk not resolved by passing checks: registry scope ownership, publication identity,
  signing/provenance, cross-version/platform reproducibility, and downstream command
  surfaces remain unproved. The packed top-level README still describes the obsolete
  ZIP delivery path and blocks release until T-0030; the local npm executable remains
  a same-user build-environment trust input.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: close T-0025 and continue with the task-command surface in T-0026.
