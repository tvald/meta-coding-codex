# Command-Launched Implementation Evaluation

## Task Identity

- Task ID: T-0052
- Accepted task revision: 1
- Depends on: T-0051 and its tick-orchestrator evidence
- Scope: Evaluate the command boundary; do not implement it in this task.

## Question And Criteria

Would an explicit command such as
`npm run --ignore-scripts --silent meta -- implement T-0123` provide a simpler or more
reliable boundary between conversational design and autonomous implementation?

The comparison covers phase isolation, determinism, context cost, recovery, worker
control, user redirects, permissions, Git safety, implementation complexity, and likely
effect on semantic quality.

## Observed Foundations

- The repository-pinned `meta` executable currently exposes task, project, prompt, hook,
  documentation, capability, and quota commands, but no implementation runner.
- The current Codex integration injects the Root profile at session startup from a fixed
  repository-pinned hook. A launcher could also build a revision-bound implementation
  prompt directly, making the execution entrypoint independent of the design transcript.
  Current non-root profile binding occurs on `SubagentStart`; separately launched worker
  processes therefore need a new reviewed top-level profile-binding mechanism.
- Official OpenAI documentation defines `codex exec` for non-interactive scripts and CI.
  It supports explicit sandbox settings, JSONL lifecycle/tool events, JSON-Schema final
  output, final-message files, ephemeral sessions, and resumption by session ID. These
  are useful launch and observation primitives, not a durable orchestration ledger.
- Local `codex-cli 0.147.0` help confirms those launch surfaces and matches the project's
  currently reviewed Codex compatibility baseline.
- The task store already provides the canonical task identity, revision, dependencies,
  gates, lifecycle, and optimistic-concurrency boundary needed for launcher preflight.

## Options

| Option | Simplification | Outcome Assessment |
| --- | --- | --- |
| Interactive Root starts implementation inside its design session | No new command | Preserves tacit design context but carries design history and leaves handoff implicit |
| Thin `meta implement` launches one long-running Codex Root | Simple initial boundary | Starts with clean context and reproducible settings, but retains compaction, polling, parent-scoped worker, and crash-recovery problems |
| `meta implement` is a deterministic supervisor that launches fresh Root ticks | Clear user boundary plus one process owner | Best fit: the supervisor can wait without model context and can own the ledger, events, leases, and top-level worker processes |
| One shell command per Root tick, with no continuing supervisor | Small individual invocations | Pushes event ordering, locking, retries, and recovery onto shell scripts or humans and is less reliable |

## Recommendation

**Adopt the command as the user-facing implementation boundary, while retaining the
revised event-driven architecture from T-0051.** The command should be the durable
deterministic supervisor, not merely a wrapper around one long-lived Root session.

This simplifies the architecture in three meaningful ways:

1. The user action is an explicit implementation handoff. The design session can finish
   by publishing a Ready task/capsule and printing the exact revision-bound command.
2. One ordinary process owns run identity, leases, process handles, signals, event
   ingestion, and waiting. It may remain alive for hours without growing an LLM context.
3. Root ticks and workers can be launched as independently addressable top-level harness
   jobs, removing the requirement that a later Root inherit a prior Root's child handles.

It also reduces the initial user-message delivery problem: implementation starts only
when the command is invoked. Ongoing changes still need a durable control surface such as
`implement status`, `implement stop`, and revision-aware resume or reframe. Starting the
command must not grant approval for destructive, external, privileged, or otherwise gated
actions.

## Recommended Flow

`DESIGN SESSION -> READY CAPSULE -> USER COMMAND -> PREFLIGHT -> RUN LEDGER ->`
`EVENT-DRIVEN ROOT TICKS / WORKERS -> VERIFY -> FINALIZE -> TERMINAL RECEIPT`

The design session should emit an invocation similar to:

```sh
npm run --ignore-scripts --silent meta -- implement T-0123 \
  --expected-task-revision 4 --harness codex
```

The initial interface should accept exactly one primary task. Supporting several task IDs
would introduce queue ordering and multi-task recovery while the framework intentionally
keeps one primary implementation task active. A later queue command can be added only if
evidence justifies it.

### Deterministic Command Responsibilities

- Resolve the physical repository and pinned package; parse an allow-listed task ID,
  revision, harness, and mode without shell interpolation.
- Run task-store integrity checks and reject pause, stale revision, unmet dependency,
  unresolved gate/approval, conflicting Active task, or unknown dirty ownership.
- Capture the capsule digest, task/store revision, base commit and worktree manifest,
  actual harness version/compatibility, quota, sandbox/approval policy, and declared checks.
- Acquire a fenced run lease and publish a durable run/operation intent before launching
  a harness process.
- Invoke Root ticks read-only with explicit argument arrays and least privilege. Consume
  JSONL as untrusted notifications, retain only bounded normalized events, and require a
  typed Root decision/result schema before executing its intent.
- Launch fresh Root ticks only on changed state or due action. Launch workers as separate
  supervised, assignment-bound, write-enabled jobs in isolated worktrees when effects are
  required or they must outlive a Root tick.
- Reconcile every exit, signal, timeout, duplicate event, and ambiguous effect against
  canonical task, provider, result, and Git state before retrying.
- Expose status, stop/checkpoint, and resume commands, and return a terminal receipt whose
  task, commit, checks, and final state have been reconciled.

### Root Tick Responsibilities

The fresh Root still owns semantic decisions: interpreting authority, judging readiness,
decomposition, selecting useful work, integrating results, responding to defects,
determining verification sufficiency, and attesting completion. The command validates and
executes a typed decision; it does not independently decide that the task is Done.

## What The Command Does Not Solve

- A thin wrapper around one `codex exec` still produces a long-running model session.
- Schema-constrained final output does not fence commands already executed inside a
  write-enabled Codex turn; allowing Root ticks to write would weaken intent-before-effect.
- Codex session resumption is not an orchestration transaction or proof that a previous
  effect did or did not occur.
- JSONL events and schema-constrained final output do not authenticate worker identity or
  make model output authoritative.
- Shared Git/file writes still require ownership isolation and fencing.
- Task close and Git commit still require the finalization fence identified by T-0051.
- A lost terminal or killed supervisor still requires a durable ledger and deterministic
  `implement resume`; process lifetime alone is not recovery state.
- Current Codex hooks bind top-level startup to the Root profile and non-root roles to
  native subagent startup. Independent worker jobs require a versioned exact-role launch
  adapter rather than prompt text that merely claims a role.
- Semantic quality can regress if design rationale, constraints, or acceptance evidence
  were never persisted in the capsule. A clean context is beneficial only when the handoff
  is complete.

## Expected Effect

| Dimension | Compared With Chat-Launched Ticks |
| --- | --- |
| Phase isolation | Better: implementation never inherits the design transcript |
| Deterministic authorization boundary | Better: explicit user invocation and expected revision |
| Operational lifecycle | Better: a non-model process can own waits, signals, and child jobs |
| Root context and compaction | Same tick benefits, with a cleaner first tick |
| User redirects | Simpler only if expressed through durable command controls; otherwise worse |
| Worker recovery | Better only when workers are top-level supervised jobs rather than Root children |
| Infrastructure complexity | Lower at handoff, but the ledger/fencing remain and a top-level worker-role adapter is added |
| Semantic outcome | Likely neutral-to-better when the capsule is sufficient; otherwise at risk |

## Evaluation Verdict

The command is a good architectural seam and a better launch UX. It removes the need for
the conversational Root to bootstrap or remain attached to autonomous implementation and
turns the proposed deterministic supervisor into a natural repository-pinned executable.
It does **not** remove most of the hard state-machine work. Its value comes from making
that work explicit and testable outside model context.

A safe first implementation slice would specify the command, capsule, run-ledger, event,
typed Root-output, and exit/stop/resume contracts, then replay T-0051's three histories
through the command without write authority. Direct production implementation should
follow only after those contracts and crash boundaries receive an accepted architecture
decision and threat-model review.

## Evidence

- [T-0051 tick-orchestrator evaluation](0051-tick-orchestrator-evaluation-notes.md)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
  checked 2026-08-14
- Repository `package.json`, `bin/meta-framework.mjs`, task-store contracts, Codex hook
  integration, and resumption protocol

## Verification

- **Pass:** Repository-pinned CLI help confirms that no `implement` command exists today.
- **Pass:** Local `codex-cli 0.147.0` help confirms non-interactive, JSONL, schema-output,
  sandbox, ephemeral, and session-resume surfaces.
- **Pass:** Focused diff review found the recommendation consistent with T-0051's phase,
  trust, idempotency, worker-lifecycle, and finalization findings.
- **Not applicable:** No prototype or harness process was launched; this task evaluates
  the boundary and explicitly leaves implementation to a later accepted design.
