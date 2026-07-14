# Quality Record: Streamlined Installer Command

- Date: 2026-07-14
- Change: Replace the verbose outer `pipefail` wrapper with a conventional direct
  curl-to-Bash command and move guarded-stream completeness detection into the script.
- Route: Quick change
- Risk: High, because mutable remote executable input writes into adopter-owned paths
  and the command changes how an upstream fetch failure is reported.
- Owner or reviewer: Root Orchestrator and `streamlined_installer_reviewer`.

## Scope And Criteria

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Public command is minimal | Exact README text assertion | Primary command is `curl -fsSL` fixed HTTPS URL piped directly to Bash | Pass |
| Complete pipe preserves installation | Direct/piped 26-entry fixtures | Exact command installs AGENTS plus 25 meta files and prints success | Pass |
| Guarded truncations fail without mutation | Prefix/preseed matrix with counterfactual | Every guarded boundary and inherited-true attempt exits 1 with no paths; baseline definitions prefix exits 0 | Pass |
| Upstream-status limitation is accurate | Mock curl failures with empty, small-prefix, guarded-prefix, and complete output | Results are respectively 0/no files, 0/no files, 1/no files, and 0/26 installed, all with curl diagnostic | Pass |
| Prior safety contract remains intact | Focused archive/collision/rollback/static regression | AGENTS preserved; corrupt/meta collision/injected copy fail cleanly; exact inventory and static checks pass | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | User supplied the desired command shape; archive/destination behavior is protected |
| Architecture and context | Yes | T-0009 owns the installer; T-0010 changes only stream invocation/completion behavior |
| Security and permissions | Yes, with concern | Direct pipelines report Bash rather than curl status; guard streams after the first compound and document the general limitation |
| Verification and rollback | Yes | Prefix, failing-curl, install, prior regression, review, and repository checks declared |

Readiness verdict: Ready with concerns

## Verification Results

| Required? | Check Or Method | Observed Result | Status |
| --- | --- | --- | --- |
| Yes | Bash/ShellCheck and direct/piped install | Bash parse and ShellCheck pass; exact command installs 26 entries | Pass |
| Yes | Guarded prefix, inherited-sentinel, and failing-curl output matrix | All observed statuses and destination outcomes match the table above | Pass |
| Yes | Archive/collision/rollback regression | Corrupt archive, existing meta, and injected copy failure leave no installer-owned partial state | Pass |
| Yes | Independent security/correctness review | Two Medium and two Low findings resolved; final verdict no blocker | Pass |
| Yes | Docs, diff, staged inspection, and status | Links, budgets, state, diff, scoped staging, security scan, and clean post-commit status pass | Pass |

- Criteria or methods amended after implementation began: Review showed the upstream
  limitation is general rather than zero-byte-only and added inherited-sentinel plus
  empty/small/guarded/complete failing-curl cases. Acceptance became more precise without
  changing the requested command shape.
- Counterfactual evidence: At `71655c4`, the README uses the outer pipefail wrapper and
  a definitions-only installer prefix exits 0 because no completion guard exists.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Stream sentinel | Inherited `FRAMEWORK_INSTALLER_STREAM_COMPLETE=true` bypassed the prefix diagnostic | Reset false in the same first parsed compound that installs the trap | Resolved |
| Medium | README/decision/threat | Wording incorrectly treated masked curl status as zero-byte-only | Document final-Bash status for empty, partial, guarded, and complete output | Resolved |
| Low | Threat model | Curl-config disabling was stated for both downloads | Limit that control to archive curl and record public caller configuration | Resolved |
| Low | Guard wording | “Loaded stream” included a shebang-only prefix before the guard loaded | Say “once the guard has loaded” consistently | Resolved |

## Batch And Residual Risk

- Large-diff split trigger hit: No. The command, completion guard, and owning safety
  records form one tightly coupled behavior change.
- Residual risk: A default `curl ... | bash` pipeline reports Bash's status and can mask
  curl's failure whether curl produced no script, a too-short prefix, or the complete
  script. Curl still emits its own diagnostic; users requiring strict upstream status
  can download/inspect first or enable shell pipefail.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition: None.
- Next action: None.
