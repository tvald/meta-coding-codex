# Transactional Prompt Bootstrap And Session Pinning

## Identity And Source

- Task ID: T-0055
- Initial revision: r1
- Task store: `readme/tasks/store/` through
  `npm run --ignore-scripts --silent meta -- tasks task get T-0055`
- Accepted source: Direct user instruction after the 2026-08-14 SessionStart failure
- Source reference and date: User-directed incident follow-up, 2026-08-14
- Parent or split task IDs: None; this does not amend or resume T-0054

## Goal

Prevent Meta Framework prompt development from terminating the Codex session performing
that development. Lifecycle hooks must serve a validated last-known-good prompt generation
that is independent of mutable candidate sources, and a root loading failure must degrade
to the exact local `AGENTS.md` bootstrap without trapping the session in a stopped state.

## Background

The source-repository Codex hook currently recompiles the Root prompt from the live
worktree on every `startup`, `resume`, `clear`, and `compact`. During T-0054, a change
inside the `workflow.delivery` facet increased the Root body from 24,572 bytes to 26,734
bytes against a 24,576-byte limit. Automatic compaction therefore attempted to deploy an
unfinished candidate, received `OUTPUT_LIMIT`, returned `continue: false`, and ended the
turn before the advertised `AGENTS.md` fallback could be used. The same mutable state
then prevented a later session from starting normally.

Pre-commit or CI checks alone cannot close this gap because compaction can occur while
changes are uncommitted. Reading only `HEAD` also remains unsafe after a broken checkpoint.
The runtime prompt generation therefore needs an explicit build, validation, activation,
and rollback boundary comparable to a transactional blue/green deployment.

## Scope

In scope:

- Replace SessionStart compilation from mutable source files with a small, stable bootstrap
  loader outside the candidate mutation boundary.
- Define a content-addressed prompt bundle and manifest containing the exact compiled bytes,
  framework/compiler/schema versions, source identity, profile and harness bindings, facet
  digests, byte counts, and overall digest.
- Compile worktree or release changes into an inactive candidate generation.
- Validate every supported profile and harness plus `startup`, `resume`, `clear`, `compact`,
  and delegated lifecycle behavior before activation.
- Atomically activate a complete candidate with optimistic concurrency against the observed
  active generation; failed, partial, stale, or oversized candidates leave the active
  generation unchanged.
- Pin each new Codex session to one active generation by session identity. Resume, clear,
  and compact must serve byte-identical prompt content from that pin even when sources or
  the globally active generation later change.
- Specify source-repository compiler bootstrapping so immutable generation N operates while
  generation N+1 is developed. Installed-client behavior must retain immutable package and
  trust-review boundaries.
- Make Root prompt-load failure return bounded `continue: true` SessionStart context that
  explicitly selects the exact local `AGENTS.md` fallback, reports a sanitized diagnostic,
  and withholds framework continuation until prompt health is reconciled.
- Preserve fail-closed delegated-agent behavior when its exact role/profile prompt cannot be
  established; Root fallback must not mint specialist authority.
- Add an explicit prompt-capacity reserve rather than treating one byte below the hard limit
  as releasable. Record the chosen reserve and enforce it during candidate validation.
- Provide explicit activation inspection, rollback to a prior valid generation, stale-pin
  cleanup, corruption handling, and bounded operator diagnostics.
- Update package/source documentation, decision records, tests, quality evidence, and threat
  modeling required by the final architecture.

Out of scope:

- Raising prompt limits as the sole remedy.
- Automatically activating worktree or committed prompt changes without a validation gate.
- Rewriting unrelated framework policy merely to reduce prompt size.
- Changing T-0054's controller outcome, lifecycle, authority, or completion state.
- Allowing fallback context to weaken task, approval, permission, or specialist-role checks.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework maintainer | Edit prompt-bearing policy or compiler code | Changes remain inactive candidates until validation and explicit activation pass |
| Running Root session | Compact, resume, or clear during prompt development | The session receives the same pinned, previously validated prompt bytes |
| New Root session | Start after a candidate was activated | The session pins the latest valid generation |
| Root session during bootstrap corruption | Start or compact without a usable active bundle | Codex continues under exact local `AGENTS.md` fallback with a visible degraded-state warning |
| Delegated specialist | Start without its exact validated profile | Work remains fail-closed and no role authority is inferred from fallback prose |
| Release operator | Inspect, activate, or roll back prompt runtime state | Operations are bounded, digest-addressed, auditable, and stale-safe |

## Acceptance Criteria

- [ ] Editing any prompt source, registry, compiler, hook adapter, or prompt-bearing framework
      document cannot change the prompt bytes used by an already-running session.
- [ ] Startup pins one validated generation, and resume, clear, and compact return byte-identical
      content for that session after arbitrary candidate-source changes.
- [ ] A new session observes a newly activated generation, while existing session pins remain
      valid until their defined end or explicit safe retirement.
- [ ] Oversized, malformed, incomplete, stale, unsupported, digest-mismatched, or test-failing
      candidates cannot advance the active generation or damage the last-known-good bundle.
- [ ] Candidate publication and active-pointer advancement are crash-safe and atomic; recovery
      can distinguish private candidate creation from successful activation.
- [ ] The hook-serving bootstrap itself is immutable or content-addressed and is not executed
      from the mutable candidate source tree it is protecting.
- [ ] A Root load failure returns a small valid `continue: true` SessionStart response with
      exact local `AGENTS.md` fallback context and a sanitized operator-visible reason.
- [ ] Root fallback does not authorize framework task continuation, external effects, prompt
      activation, or specialist work until the degraded state is reconciled.
- [ ] Missing or mismatched specialist prompts remain fail-closed without inheriting Root or
      fallback authority.
- [ ] Candidate validation exercises all supported profiles/harnesses and every applicable
      lifecycle source, including an actual over-limit counterfactual that fails before the fix.
- [ ] A documented capacity-reserve rule rejects near-limit prompts before the hard compiler or
      Codex delivery boundary is reached.
- [ ] Rollback selects a previously validated content-addressed generation without rebuilding
      it from current source files and does not alter existing session pins unexpectedly.
- [ ] Source and installed-client packaging, update, trust review, and fallback behavior remain
      explicit and are covered by focused integration tests.

## Constraints

- The task store remains the authority for project tasks; prompt runtime state cannot become a
  second task or approval store.
- Prompt bundles and pins are operational artifacts, not a repository-external durable
  knowledge system.
- Never overwrite an active bundle in place. Use immutable generations and an atomic,
  optimistic-concurrency-protected activation pointer.
- Do not rely on hook-definition trust to authenticate mutable script bytes that the trusted
  command invokes.
- Do not solve the incident by weakening compiler bounds or depending on output spill/truncation.
- Preserve the exact local `AGENTS.md` fallback for hook-disabled, untrusted, incompatible,
  unavailable, or operator-disabled conditions.

## Workflow Route Rationale

- Recorded route and risk: Initiative, High
- Why this route: The outcome crosses hook bootstrap, prompt compilation, operational storage,
  session lifecycle, package/source integration, rollback, tests, and documentation.
- Why this risk gate: The change controls developer instructions and failover behavior at every
  Codex session start and compaction boundary; a defect can disable sessions or weaken roles.
- Upstream artifacts required: Existing hook/prompt contracts, Codex integration decision and
  tests, the 2026-08-14 cached incident transcript, and official Codex hook semantics.
- Escalation trigger: Re-route to Decide before implementation if immutable bootstrap ownership,
  session-pin persistence, activation authority, or client/source parity has more than one
  materially different safe design.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Mutable loader preserves the original circular dependency | A candidate can still disable its own session | Run a previous immutable generation or digest-addressed stage-zero loader |
| Active/pinned generation drift | Sessions receive mixed instruction sets | Bind session identity to one bundle digest and verify every read |
| Fallback behaves as an authority bypass | Work proceeds without the intended profile | Restrict Root fallback, name degraded state, and keep specialists fail-closed |
| Partial activation destroys last-known-good state | All later sessions fail | Immutable bundles, atomic CAS pointer, receipts, and rollback tests |
| Prompt grows back to the hard boundary | Minor edits recreate outages | Enforced reserve budget plus per-profile size reporting |
| Cleanup removes a live pin or bundle | Resume/compact fails later | Reference-aware retention and conservative cleanup |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Codex supplies stable session identity and lifecycle source fields to SessionStart | High | Bind tests to the supported Codex schema and adapter version |
| Existing local `AGENTS.md` injection remains available when the project is trusted | High | Startup and compact fallback integration fixtures plus manual supported-version check |
| A content-addressed operational bundle can be stored without becoming project knowledge | Medium | Architecture and knowledge-ownership review before implementation |

## Verification Plan

- Automated checks: prompt compiler/adapter tests for all profiles and lifecycle sources;
  candidate rejection matrix; atomic activation, stale CAS, crash recovery, pin stability,
  rollback, corruption, retention, and package/source parity tests.
- Manual checks: supported Codex startup, automatic compaction, resume, clear, root degraded
  fallback, new-generation activation, and specialist failure behavior.
- Documentation checks: task-store doctor, link validation, command examples, decision and
  quality-record consistency, package file inventory, and exact hook/manifest inspection.
- Baseline or counterfactual evidence: preserve a minimized candidate that exceeds the body
  limit by changing a live facet; show current behavior stops SessionStart and the new design
  rejects activation while the pinned session continues with its last-known-good generation.

## Done When

- The accepted architecture breaks the mutable self-hosting cycle, every acceptance criterion
  has observed evidence, independent review covers instruction and activation boundaries, and
  a supported Codex lifecycle run proves that invalid prompt development cannot terminate the
  running Root session or corrupt later startup.
