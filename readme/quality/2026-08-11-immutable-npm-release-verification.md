# Quality Record: Immutable NPM Release Verification

- Date: 2026-08-11
- Change: T-0031 aggregate consumer, compatibility, security, deterministic-output,
  and release verification for immutable npm delivery
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and
  Reviewer completion gates

## Scope And Criteria

- User-visible outcome: a clean repository can install and run the exact locked local
  package without copied framework policy, lifecycle execution, fallback resolution,
  package mutation, incompatible state access, or unexplained prompt drift.
- In scope: current registry/release compatibility evidence, exact packed artifact,
  script-disabled install and rollback, clean initialization/startup, every prompt and
  harness profile, explicit extensions, task/state compatibility, hostile boundaries,
  provider probes, retired-delivery absence, documentation consistency, and aggregate
  independent review.
- Non-goals: publishing npm, authenticating to a registry, creating or deleting releases
  or tags, changing package identity, supporting an unpublished registry install, or
  mutating external/client production state.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| No released consumer makes the pre-release documentation identifier removal incompatible | Current public npm registry and repository tag/release inspection | Reachable public npm registry returned 404; the sole GitHub release is the legacy ZIP at `c90211b9a2cd888a1796dbd584384fd1f9eaa132`, which contains neither `package.json` nor the prompt registry | Pass |
| Exact package bytes install locally with lifecycle hooks disabled and no copied policy | Two-pack audit plus clean temporary client install | Exact 52-file artifact installed from its official-URL lock using cached integrity; client retained no `readme/meta` or discovery bundle | Pass |
| Missing local package, hostile PATH, and lifecycle hooks cannot execute fallback code | Hostile sentinels in package/initializer/extension matrices | Aggregate missing-package, pre/post npm-script, dependency lifecycle, hostile-PATH, and offline sentinels remained absent | Pass |
| All role/harness prompts and declared extensions are deterministic, attributable, bounded, and fail closed | Snapshot, parity, one-byte, inventory, compatibility, and hostile mutation matrices | Aggregate client ran all 15 prompts and every declared docs/explain resource; final prompt/extension suites retained deterministic and hostile coverage | Pass |
| Installed commands keep package resources immutable and mutate only validated client state | Packed task/initializer/provider fixtures and tree digests | Aggregate and retained suites preserved package digests, limited initializer footprint, and isolated task/project mutation | Pass |
| Manifest/lock rollback replaces package code without changing compatible client data | Clean-client replacement/rollback rehearsal with script-disabled installs | `1.0.0 → 1.0.1 → 1.0.0` restored prior manifest, lock, and package tree exactly while client state remained byte-identical | Pass |
| Compatibility envelopes reject unsupported package, task, prompt, extension, provider, and initializer state before mutation/output | Cross-surface version and negative fixtures | Package policy, task/client metadata, prompt/extension, provider, and initializer compatibility mutations passed in the 56-test package matrix | Pass |
| Supported docs expose one npm replacement contract and no live copied-core path | Retirement scan, docs checks, doctor, and consistency review | Retirement suite passed 7/7 after final invocation changes; aggregate client resolved every declared document | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0023 revision 6 and T-0031 revision 2 assign one aggregate proof without authorizing publication |
| Architecture and project context | Yes | Decision 0021 and completed T-0024 through T-0030/T-0032 define the package, client, prompt, extension, provider, and retirement contracts |
| Data, security, and permissions | Yes | Work is local/read-only except temporary fixtures; registry and repository release inspection is unauthenticated and nonmutating; publish/tag/release actions are excluded |
| Slices and ownership | Yes | T-0031 owns only aggregate gaps and durable release evidence; it does not reopen completed implementation slices without a failing counterexample |
| Verification and rollback | Yes | Exact package audit, temporary clients, hostile sentinels, compatibility matrices, full regressions, Git restoration, and independent gates provide bounded rollback/evidence |

Readiness verdict: Ready. Implementation is limited to aggregate verification assets and
corrections exposed by the matrix; any released-consumer evidence stops the pre-release
identifier removal and reopens compatibility/versioning before release.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Current registry and repository release/tag evidence | Repeated pre-close: npm endpoint 404; sole `latest` release/tag remained at `c90211b9a2cd888a1796dbd584384fd1f9eaa132`, legacy ZIP download count zero, with no package manifest or prompt registry | Pass | N/A |
| Yes | Aggregate clean-client install, startup, rollback, and hostile-boundary matrix | New focused aggregate journey passed 1/1; package/prompt focus passed 19/19 | Pass | N/A |
| Yes | Exact package audit, publish dry run, and package-only suite | 52 files, 145182 bytes, SHA-256 `f7e5c23ec77994cded84b156d108a0ab0e346853e3982ea8410988ee1c299d5d`; `npm publish --dry-run --ignore-scripts --json` matched the 52-file size/integrity and performed no publish; package suite 56/56 | Pass | N/A |
| Yes | Full regression suite, diff check, and terminal staged doctor | `npm test` passed 94/94, `git diff --check` passed, and terminal staged doctor passed over 9 paths/2 framework paths with 158 Markdown files and zero warnings | Pass | N/A |
| Yes | Independent Architect, Security, QA, and Reviewer gates | Architect, Security, and Reviewer passed. QA found no test defect and identified three stale/ambiguous evidence rows; the exact publish-dry-run command was recorded and the consistency/threat rows were corrected | Pass | N/A |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: the aggregate fixture
  installs lifecycle and npm-run sentinels, poisons missing-package PATH/registry inputs,
  upgrades package bytes, and would expose any manifest, lock, package-tree, or client-state
  drift. Existing focused suites retain deeper one-boundary mutations.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Public compatibility | Removing `framework-changelog` is valid only before any released consumer can rely on it | Prove current unpublished status or reopen SemVer/compatibility | Resolved: no public package; legacy release predates identifier |
| High | Rollback install | Documentation requires script-disabled rollback but no aggregate rehearsal had been recorded | Rehearse exact manifest/lock restoration and compatible client-state preservation | Resolved by aggregate offline replacement/rollback fixture |
| Medium | Publication license | `package.json` declares `UNLICENSED`, which is not a public-use license | Require an explicit owner licensing decision before any public publish | Accepted external publication prerequisite |
| Low | Completion evidence | QA found stale pending consistency text, a still-Planned threat row, and insufficiently explicit dry-run provenance | Record the executed `npm publish --dry-run --ignore-scripts --json`, update current consistency, and mark the executed matrix Done | Resolved; no test correctness blocker remained |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Implement all open tasks | T-0031 implementation and aggregate checks pass; independent gates and umbrella close remain | Complete gates and T-0023 |
| T-0023 brief | One immutable local npm package and complete aggregate proof | Completed slices plus the clean-client replacement/rollback journey cover the criteria | Close after final gates |
| Decision 0021 | Pre-release identifier removal, exact replacement/rollback, no publish authority | Public package is absent; legacy release predates the identifier; exact rollback passed without remote mutation | None |
| Tests and docs | Positive, counterfactual, compatibility, security, and deterministic evidence | Focused 19/19, package 56/56, full 94/94, retirement 7/7, exact audit and dry run pass | Terminal doctor/gates only |
| State and assumptions | T-0031 Active; registry/package publication not assumed | Structured store is valid and no external mutation is authorized | Close only after all runnable checks pass |

## Batch And Residual Risk

- Large-diff split trigger hit: No; this task should remain an evidence-focused aggregate
  gate and add only the smallest missing verification surface.
- If kept together, why: installation, prompts, extensions, provider probes, mutable
  state, and rollback are one clean-client release decision.
- Risk not resolved by passing checks: a local tarball is not a public registry release;
  registry ownership/credentials, cross-platform behavior beyond observed environments,
  and future npm/provider behavior remain release-time inputs.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: commit T-0031 and close umbrella T-0023 against the completed subtask set.
