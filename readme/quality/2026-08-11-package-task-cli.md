# Quality Record: Package Task CLI And Root Separation

- Date: 2026-08-11
- Change: T-0026 installed task command surface and package/client-root isolation
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, QA, Security, and Reviewer gates

## Scope And Criteria

- User-visible outcome: an installed client runs the existing guarded task store through
  `npm run --silent meta -- tasks ...` without copying reusable `readme/meta` policy.
- In scope: package task dispatch, immutable resource resolution, mutable client Git-root
  resolution, installed-client doctor/startup and semantic mutation, compatibility
  metadata, and existing task-store regression preservation.
- Non-goals: prompts/docs lookup, extensions, initialization UX, provider probes,
  obsolete-delivery retirement, publication, or release credentials.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Package CLI exposes doctor, startup, query, and semantic mutation beneath `tasks` | Source and packed-client CLI fixtures | Packed fixture passed init, doctor, startup, queries, add, amend, dependencies, approvals, select, checkpoint, close, pause, and resume | Pass |
| Package resources and client-owned mutable state resolve from distinct validated physical roots | Clean packed client plus wrong-root, symlink, and hostile client-resource negatives | One branded Git context and package root reached dispatch; wrong, symbolic, nested-Git, direct-internal, client-shadow, and stateful-Git negatives failed closed | Pass |
| Installed doctor passes without a copied `readme/meta` tree | Minimal Git client fixture with package-owned process/template checks | Doctor passed with 11 package processes and 12 package templates; hostile client `readme/meta` Markdown/schema shadows were excluded | Pass |
| Running package, task CLI envelope, and readable/writable store versions are explicit | Exact manifest/runtime agreement, bounded `tasks --version` JSON, and metadata mutations | `package.json#metaFramework.taskCli`, shared runtime/schema constants, standalone package audit, and output all agreed on package/CLI 1.0.0 and envelope/read/write schema 1; incompatible metadata failed before store-byte changes | Pass |
| Whole-store validation, bounded queries, CAS, locking, and atomic writes remain intact | Existing framework-data suite plus installed mutation/counterfactual tests | All 33 framework-data tests passed through installed binary; focused stale-CAS, output-bound, malformed-record, and package-lock controls passed | Pass |
| No task operation writes beneath the installed package | Before/after package-tree digest and exact client mutation assertions | Installed package-tree digest stayed unchanged; nested package Git and direct internal CLI created no store | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0026 and T-0023@r5 define one task-runtime slice |
| Architecture and project context | Yes | Decision 0021 requires mandatory package/client roots and preserves task-store invariants |
| Data, security, and permissions | Concern | Wrong-root or resource-shadowing failures could corrupt package/client state; adversarial fixtures and independent Security review are required |
| Slices and ownership | Yes | Root owns runtime/check/test edits; T-0027+ surfaces remain protected |
| Verification and rollback | Yes | Source-repository direct CLI remains for development; installed direct access fails in favor of the package binary; no data migration is authorized |

Readiness verdict: Ready with concerns. Preserve the existing store format and mutation
implementation, add the package dispatch as a thin boundary, and fail before mutation
when either physical root is missing, symbolic, or mismatched.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused package task CLI and root-boundary tests | `npm run --silent test:tasks`: 7 passed | Pass | Not applicable |
| Yes | Full Node regression suite | `npm test`: 47 passed; framework-data subset 33 passed through installed binary | Pass | Not applicable |
| Yes | Exact/reproducible package audit | Exact 55-file two-pack audit passed; SHA-256 `871cac01d818a126b3f45db6e63dc83f2bdf6f6fbdc4823b5c8134afb94d956a` | Pass | Not applicable |
| Yes | Doctor, links, budgets, staged evidence, and diff check | Package `tasks doctor` passed all eight checks without warnings; `git diff --check` passed | Pass | Not applicable |
| Yes | Independent Architect, QA, Security, and Reviewer gates | Architect findings resolved; QA, Security, and final Reviewer passed with no remaining blockers | Pass | Not applicable |

- Criteria or methods amended after implementation began, with reason and impact:
  independent architecture, QA, and Security review expanded the declared root checks
  to one branded context, exact alias/lock identity, sanitized Git discovery, direct
  internal rejection, rootless help/error handling, manifest/runtime compatibility
  agreement, HTTPS registry resolution with canonical SHA-512 integrity, and nested-Git/
  package-write protection. These strengthened the existing root-isolation and metadata
  criteria without changing the task surface or store format.
- Counterfactual evidence for new regression or behavior tests: hostile client schema
  and Markdown shadows, stale CAS, malformed unrelated records, alias/lock mutations,
  client-local and stateful fake Git, foreign/symbolic roots, direct installed CLI,
  incompatible readable/writable metadata, file/Git/HTTP lock resolutions, missing or
  invalid integrity, and nested package Git each demonstrated the unsafe alternative and
  failed before writes. Rootless help/version succeeded while rootless data commands
  returned bounded Git errors.
- Flaky result and disposition: None observed.

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: dispatch, branded root resolution, doctor resource ownership,
  compatibility metadata, and installed mutation proof form one inseparable public
  task-runtime boundary; splitting would leave a bypass or an unverified mutation path.
- Risk not resolved by passing checks: native Windows remains unsupported; a real-registry
  install/integrity proof, downgrade, and cross-Node/npm compatibility remain aggregate
  T-0031 work. T-0026 uses a locally packed artifact plus validated registry-shaped lock
  metadata and does not claim publication or registry provenance.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: commit the exact T-0026 file set and advance to the next dependency-unblocked task.
