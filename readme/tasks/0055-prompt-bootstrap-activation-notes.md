# T-0055 Prompt Bootstrap Activation Notes

## Current State

- Task revision: r2; artifact links and architecture/readiness controls are current.
- Route / risk: Initiative / High.
- Recovery: T-0054 implementation remains preserved at `9ed2d59` and is blocked on this
  repair. T-0055 intake was checkpointed at `a5405b8` before selection.
- Incident finding: the live Root body grew from 24,572 to 26,734 bytes against the
  24,576-byte hard limit; compaction converted `OUTPUT_LIMIT` to `continue: false`.
- Architecture: Decision 0026 adopts Git-common immutable generations, active CAS,
  session pins, a digest-addressed source loader, and Root-only degraded fallback.
- Implementation: the Git-common generation store, standalone loader, session pins,
  revision/nonce activation CAS, SessionEnd retirement, 90-day cleanup, operator CLI,
  buffered source/client wrappers, and installed-client absent-state seed are integrated.
- Verification: runtime 14/14, hooks 7/7, compiler 8/8, extensions 5/5,
  initializer 19/19, package 104/104, and full 294/294 tests pass. The 77-file package
  audit, exact four-source wrapper check, and Codex 0.147.0 startup/resume smoke pass;
  final independent Reviewer, QA, and Security reruns all returned Pass.
- Active runtime: lifecycle-v2 generation `9c0222…` is active at revision 5 through
  loader `6f6e2e…`; the recovered Root remains intentionally pinned to its older
  generation until final retirement.

## Plan And Required Checks

1. Implement and fault-test the operational store, generation builder, loader, pinning,
   activation, rollback, and cleanup.
2. Wire source and installed-client hook paths plus bounded operator commands.
3. Compact canonical prompt facets enough to enforce a 1,024-byte body/output reserve.
4. Prove the pre-fix counterfactual and lifecycle byte stability.
5. Run prompt/hook/initializer/package tests, full tests, task doctor, links, budgets,
   staged diff review, and a supported Codex smoke.
6. Obtain independent Reviewer, QA, and Security results and resolve every blocker.

## Worker Roster

| Worker | Assignment And Ownership | State | Restart Policy |
| --- | --- | --- | --- |
| Root Orchestrator | Task state; Decision 0026; shared docs; CLI and hook integration; final integration and commit | Active | Resume from this note and current Git diff |
| `prompt_store` Implementer | Runtime/store slice was assigned, but no file checkpoint was produced before interruption | Stopped; Root assumed ownership | Do not resume; Root integrated the slice |
| `prompt_qa` QA | Lifecycle/counterfactual/fault matrix; found pin and seed-result/status races plus seed gaps | Final Pass; 20/20 cumulative contention runs after the last race fix | Closed; reuse only for a new revision |
| `prompt_security` Security | Session retirement, CAS, fallback, specialist, filesystem, disclosure, and installed-seed boundaries | Final Pass; loader identity and path-free diagnostics confirmed | Closed; reuse only for a new revision |
| `prompt_reviewer_trusted` Reviewer | Architecture and implementation review across reserve, seed, receipt, CLI, source snapshot, and docs | Final Pass after lifecycle-v2 exact authority/mismatch validation | Closed; reuse only for a new revision |

All workers share the repository and are not alone in the codebase. They must preserve
others' edits, stay within named ownership, and return the canonical handoff format.

## Resume Checklist

- Run task doctor/startup and load T-0055 context.
- Inspect `git status`, recent commits, worker handles, and this roster.
- Re-run the Codex quota guard before any spawn/resume and after each result.
- Do not execute source hooks from mutable candidate files.
- Do not report completion until active-generation smoke and all independent gates pass.
