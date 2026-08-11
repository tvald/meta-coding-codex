# Quality Record: Immutable NPM Architecture

- Date: 2026-08-11
- Change: T-0024 immutable package, prompt, client-state, extension, and update decision
- Route: Decide
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect review

## Scope And Criteria

- User-visible outcome: one unambiguous architecture governs the npm dependency,
  locally resolved CLI, complete documentation, derived prompts, mutable client state,
  explicit extensions, provider probes, and replacement-only updates.
- In scope: Decision 0021 and its compatibility/supersession contract.
- Non-goals: package implementation, publishing, registry credentials, client migration,
  or removal of old delivery files before their replacements exist.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Immutable package and mutable client roots are distinct | Decision inspection and pre-mortem | Decision 0021 assigns every resource and write to one root | Pass |
| Local invocation cannot fetch or fall through to a missing package | npm primary-doc/source review and hostile-PATH fixture requirement | Client script executes an explicit local dependency-alias path; T-0025/T-0031 must prove a same-name PATH binary is not invoked | Pass |
| Complete docs remain canonical and prompts are derived | Ownership/provenance consistency review | Stable facets, one owner, profile validation, version/digest metadata, bounded docs/explain are required | Pass |
| Extensions and provider probes have explicit trust boundaries | Threat-model and decision review | Script-disabled install; lifecycle/dependency-free prompt extensions; allowlist/lockfile/compatibility/path/size/conflict checks; bounded fail-unknown probes | Pass |
| Conflicting accepted decisions are explicitly superseded | Cross-decision inventory review | Decision 0021 names the affected portions of Decisions 0004-0020 while retaining applicable invariants | Pass |
| Update and rollback semantics do not risk client state | Compatibility and rollback review | Replacement-only updates, separately versioned data, guarded migrations, and post-migration forward recovery are required | Pass |
| Startup loads dynamic state and only the assigned role | Decision and bootstrap-contract review | Root must run task doctor/startup after prompt loading; delegated work names and loads only its role profile | Pass |
| Initialization preserves existing client files | Threat-model and decision review | Explicit command must validate roots, refuse symlinks/collisions, and stage or roll back interruption safely | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0023 gives a complete product contract and nine dependency-ordered slices |
| Architecture and project context | Yes | Decision 0021 defines roots, interfaces, ownership, versioning, update, and rollback |
| Data, security, and permissions | Concern | Extension, provider, registry, and path boundaries require the negative tests assigned to later tasks |
| Slices and ownership | Yes | T-0025 through T-0032 have non-overlapping primary outcomes and explicit dependencies |
| Verification and rollback | Yes | Each implementation slice retains its own gate; T-0031 owns aggregate clean-client proof |

Readiness verdict: Ready with concerns. Implementation may proceed only while the
threat-model controls and dependency-ordered task gates remain acceptance requirements.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Current npm/Node behavior review | Official package manifest, local script PATH, lifecycle, lockfile, and entry-point documentation reviewed on 2026-08-11 | Pass | — |
| Yes | Registry-name collision check | `npm view meta-framework ... --json` resolved to an unrelated package; scoped implementation default recorded | Pass | — |
| Yes | Independent architecture pre-mortem | Architect approved the direction after six precision gaps were integrated: roots, compatibility versions, digest envelope, extension ordering/resolution, rollback, and supersession | Pass | — |
| Yes | Decision/brief/accepted-decision consistency | Independent Reviewer approved T-0023@r5 and Decision 0021 with zero open blocking findings after four safety/correctness fixes | Pass | — |
| Yes | Repository doctor and documentation links | Full post-close doctor passed all eight checks without warnings, including 269 local links and all document budgets; `git diff --check` passed | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: Yes.
  npm source evidence showed that a bare script binary can fall through to inherited
  `PATH`. T-0023@r5 now requires an exact dependency alias and explicit local path; the
  public npm-run interface is unchanged and the local-only guarantee is stronger.
- Counterfactual evidence for new regression or behavior tests: Not applicable to this
  decision-only task; implementation tasks own executable counterfactuals.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Registry identity | The agreed unscoped package name belongs to unrelated code | Use a scoped package name while keeping the stable binary; verify ownership before release | Resolved in Decision 0021 |
| High | Extension installation | An untrusted extension could execute lifecycle or transitive scripts before prompt validation | Require script-disabled install plus lifecycle-free, dependency-free prompt extensions and negative fixtures | Resolved in Decision 0021; tests assigned to T-0028/T-0031 |
| High | Local CLI resolution | npm scripts preserve inherited PATH after local bin paths, so a missing package could invoke a hostile global binary | Invoke the explicit local dependency-alias path and add a hostile-PATH negative fixture | Resolved in Decision 0021; tests assigned to T-0025/T-0031 |
| High | Rollback install | Plain `npm ci` would re-enable lifecycle scripts on a recovery path | Reuse the script-disabled or reviewed-allowlist install contract | Resolved in Decision 0021; rollback fixture assigned to T-0031 |
| Medium | Initializer | Collision, symlink, and interruption behavior was underspecified for the new client-state writer | Require physical-root validation, preservation, refusal, and staging/rollback fixtures | Resolved in Decision 0021; tests assigned to T-0029 |
| Medium | Startup | Static prompt loading did not explicitly continue into dynamic state or constrain delegated profiles | Require Root task doctor/startup and role-specific delegated loading | Resolved in Decision 0021; tests assigned to T-0029/T-0031 |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Implement all open tasks | T-0024 is Done and the dependency-ordered initiative continues | Select T-0025 after this task commit |
| T-0023 brief | Immutable package, derived prompts, and local-only CLI | T-0023@r5 matches Decision 0021, including the safety-amended explicit local launcher | None |
| Decisions and standards | Explicit supersession; verified commands only | Supersession is explicit; command catalog changes wait for observed implementation checks | None |
| Tests and docs | High-risk review and doctor | Architect and Reviewer gates approved; doctor and diff check passed | None |
| State and assumptions | T-0024 closes only after required gates | Structured store reflects T-0024@r1 Done; no task is Active | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No; this task owns one architecture decision plus its
  quality, threat, source, cursor, and task-state evidence.
- If kept together, why: Not applicable.
- Risk not resolved by passing checks: npm scope ownership and actual registry publish
  credentials are unverified and outside this task; provider surfaces, extension
  packages, and cross-platform consumers still require implementation evidence.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: None.
- Next action: commit T-0024, then select T-0025.
