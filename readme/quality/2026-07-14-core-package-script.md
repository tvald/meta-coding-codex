# Quality Record: Core Package Script

- Date: 2026-07-14
- Change: Add a safe, reproducible command for the portable framework-core zip.
- Route: Quick change
- Risk: High, because the executable distributes agent instructions and must exclude
  host state, local authority, and unsafe filesystem behavior.
- Owner or reviewer: Root Orchestrator with independent Reviewer analysis.

## Scope And Criteria

- User-visible outcome: One shell command builds an exact root-ready framework archive
  without repository-specific state.
- In scope: POSIX shell implementation, package boundary, deterministic metadata, safe
  destination handling, usage docs, durable records, and extraction verification.
- Non-goals: Installation/merging, optional integrations, release publication, committed
  binary artifacts, or modification of the Markdown-only core.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Command has a useful and bounded shell interface | Syntax, ShellCheck, help, arguments, suffix, and missing-tool cases | `/bin/sh` syntax and ShellCheck pass; help succeeds; invalid cases return 1 or 2 with named diagnostics | Pass |
| Zip is the exact portable core | Source/archive inventory and extracted-content comparison | 26 entries: generated portable `AGENTS.md` plus all 25 `readme/meta/` files; no host state, integrations, script, or standing delegation | Pass |
| Builds are reproducible and replace safely | Hash, altered-checkout metadata/environment, partial-failure, source/destination symlink, directory/core path, and replacement cases | Content-identical trees with different mtimes/modes/options share SHA-256 `63efb6f...1954a8`; failed builds preserve output; valid build replaces it | Pass |
| Built package is usable at repository root | Integrity, link/anchor, mode, bootstrap, and collision fixtures | 26 Markdown files and 76 local links/anchors pass; 12 templates; fresh/missing-catalog bootstrap and non-overwrite collisions pass | Pass |
| Repository records and artifact hygiene agree | README, decision, threat, standards, changelog, task, ignore, diff, and status review | Required records, repository checks, and 14-file staged scope pass; generated archive absent | Pass |

## Readiness

The archive contract was recovered from accepted Decisions 0004, 0008, and 0009 before
the script was implemented. Packaging and release were split so credential-bearing CI
work receives a separate task, risk review, verification set, and commit.

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0007@r1 defines exact inventory, exclusions, and non-goals |
| Architecture and project context | Yes | Portable core/state boundary already has accepted owners |
| Data, security, and permissions | Yes | Threat model covers path, state, authority, dependency, and collision risks |
| Slices and ownership | Yes | Root writes files; independent reviewer is read-only after implementation |
| Verification and rollback | Yes | Positive/negative archive matrix declared; local changes are Git-reversible |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | `sh -n` and ShellCheck 0.10.0 | No errors or findings | Pass | |
| Yes | Help, argument, suffix, dependency, marker, and unexpected-file cases | Expected statuses and useful diagnostics observed | Pass | |
| Yes | Output directory, traversal, logical/physical symlink, in-core path, preserved failure, and valid replacement cases | Unsafe destinations rejected before source mutation; failed build unchanged; valid archive replaced regular output | Pass | |
| Yes | Two-build, altered-checkout, and environment reproducibility | Byte-identical SHA-256 across repeated builds, source mtime/mode differences, and `ZIPOPT` variants | Pass | |
| Yes | Source file/ancestor and unsupported-entry cases | Symlinked AGENTS/readme/meta and FIFO core entry rejected without output | Pass | |
| Yes | Portable temporary-work behavior | Trailing-`X`-only `mktemp` wrapper passes; forced zip failure cleans the sibling work directory and preserves output | Pass | |
| Yes | Archive inventory, source content, integrity, and permission review | Exactly 26 expected 0644 files; no directory or executable entries | Pass | |
| Yes | Extracted local links/anchors and bootstrap/collision scenarios | 76 links across 26 Markdown files; fresh, missing-catalog, and three existing-file collisions pass | Pass | |
| Yes | Independent package safety and boundary review | Five Medium and one Low finding resolved; final review found no blocker and confirmed core/state separability | Pass | |
| Yes | Final links, budgets, docs, diff, and staged review | Repository links/anchors, file budgets, core structure, fences, whitespace, and 14 intended staged files pass | Pass | |

- Criteria or methods amended after implementation began, with reason and impact:
  Reproducibility testing was strengthened from repeated same-tree builds to
  content-identical trees with different modes and mtimes; this found and corrected
  source-mtime leakage before review.
- Counterfactual evidence for new regression or behavior tests: Before T-0007 the
  repository had no package command, and T-0006 assembled the 26-file package manually.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Reproducibility | Initial implementation preserved checkout mtimes, so fresh clones could differ | Normalize packaged timestamps and modes | Resolved |
| Medium | Output paths | Logical `pwd` allowed a symlinked missing parent to write under the core | Resolve physical paths and reject in-core ancestors before creation | Resolved |
| Medium | Reproducibility | Inherited `ZIPOPT` changed compression and archive bytes | Unset Info-ZIP option variables before build/validation | Resolved |
| Medium | Source boundary | Symlinked AGENTS or readme/meta ancestors could import external content | Reject source files and direct ancestors that are symbolic links | Resolved |
| Medium | Portability | Temporary filename put `.zip` after the X run, which BSD `mktemp` does not support | Use a trailing-`X` sibling work directory with `archive.zip` inside | Resolved |
| Medium | Cleanup | Preserved read-only source directory modes prevented staged-tree removal | Normalize staged directory modes to 0755 before packaging | Resolved |
| Low | Core entry types | Special entries such as FIFOs were not rejected explicitly | Allow only directories and Markdown regular files | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Shell script packages everything needed for a new repo | Exact state-free root-ready zip is produced | None |
| T-0007@r1 | Safe, deterministic, tested output with no binary commit | Implementation, review, and final checks match | None |
| Decisions 0004/0008/0009/0010 | Core and portable startup are separable from host state and authority | Script mechanically enforces that boundary without changing core | None |
| Tests and docs | Commands, exclusions, risks, and evidence are recoverable | README, standards, quality, threat, task, learning records pass final checks | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No; script, direct usage documentation, and required
  state records describe one independently releasable behavior. Publication is T-0008.
- If kept together, why: The executable package boundary is unsafe without its decision,
  threat analysis, test evidence, and adopter-facing usage.
- Risk not resolved by passing checks: Local dependency substitution and filesystem
  races remain possible; archive merging still depends on adopter judgment.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Create the task-scoped local commit and confirm repository status.
