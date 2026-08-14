# SessionStart Prompt Load Failure

## Summary

- Date: 2026-08-14
- Status: Resolved
- Impact: Automatic compaction ended a long-running Root turn and the same repository
  state stopped later SessionStart attempts before normal framework work.
- Detection: Codex reported `The repository-pinned Meta Framework prompt was not loaded`
  and `Meta Framework root prompt injection failed`.
- Severity: High

## Timeline

| Time (UTC) | Event |
| --- | --- |
| 06:16 | The cached Codex session started with a valid compiled Root prompt. |
| Before 11:24 | T-0054 added prompt-bearing controller policy in the live worktree; the Root body grew from 24,572 to 26,734 bytes. |
| 11:24:41 | Automatic compaction ran SessionStart with source `compact`; the hook recompiled mutable source, received `OUTPUT_LIMIT`, emitted `continue: false`, and ended the turn. |
| Later | New/resumed attempts ran the same live compiler and repeated the stopped state. |
| 12:24 onward | Recovery preserved T-0054, activated T-0055, restored explicit prompt reserve, and began the transactional bootstrap repair. |
| Later | T-0055 activated a validated immutable generation, moved source hooks to a digest-addressed Git-common loader, and proved pinned lifecycle and degraded fallback behavior. |

## Contributing Factors

- The trusted hook command invoked mutable transitive source bytes on every lifecycle event.
- Candidate compilation and deployment were the same operation; there was no last-known-good
  generation, active-pointer CAS, or session pin.
- The pre-change prompt had only four bytes of body headroom.
- Root and specialist failures shared blocking `continue: false` behavior even though Root
  had an exact local `AGENTS.md` fallback.
- CI and commit boundaries could not protect automatic compaction from uncommitted changes.

## What Worked

- Compiler bounds rejected incomplete prompt content rather than truncating it.
- The hook returned a bounded diagnostic without prompt or credential disclosure.
- The cached transcript, task store, Git history, and task notes preserved enough evidence
  to recover without reconstructing work from memory.

## What Failed Or Was Missing

- The fallback named in the error was unreachable because the same envelope stopped the turn.
- Hook trust covered the command string but not the mutable files imported by that command.
- No counterfactual test edited prompt-bearing source while exercising a pinned compaction.
- No activation reserve kept validated prompts away from the hard delivery boundary.

## Follow-Up

| Action | Owner | Due/Trigger | Artifact Updated | Status |
| --- | --- | --- | --- | --- |
| Implement immutable generations, activation CAS, pins, and stage-zero loader | T-0055 / Root | Before T-0054 resumes | Framework | Done |
| Make Root load failure non-blocking and exact-AGENTS degraded; keep specialists blocking | T-0055 / Root | Before activation | Framework | Done |
| Add reserve, lifecycle, corruption, rollback, and counterfactual tests | T-0055 / QA | Before completion | Test | Done |
| Record architecture and rollback boundary | T-0055 / Root | Before implementation | Decision 0026 | Done |

## Recurrence Check

- New or updated test: T-0055 requires a mutable-source counterfactual and byte-identical
  startup/resume/clear/compact pin tests.
- New or updated standard: Candidate activation requires 1,024 bytes of body and output
  reserve.
- New or updated decision record: Decision 0026.
- New or updated framework rule: Source SessionStart must not execute prompt candidates from
  the mutable worktree it protects.
- Residual risk: A same-identity local process can corrupt operational prompt state; reads
  detect corruption and Root degrades safely, but the framework does not defend a
  compromised host. Provider lifecycle semantics remain version-bound.
