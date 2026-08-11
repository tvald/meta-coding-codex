# Task Store

Canonical task state lives under `readme/tasks/store/` and is accessed through the
repository-pinned CLI. This file is a static entrypoint, not a generated catalog or a
second state owner.

## Required Commands

Run from the repository root:

```sh
node readme/meta/framework-data/cli.mjs doctor
node readme/meta/framework-data/cli.mjs startup
```

Use bounded queries for discovery and recovery:

```sh
node readme/meta/framework-data/cli.mjs task list
node readme/meta/framework-data/cli.mjs task get T-0001
node readme/meta/framework-data/cli.mjs task context T-0001
node readme/meta/framework-data/cli.mjs task deps T-0001
node readme/meta/framework-data/cli.mjs task candidates
```

Use `node readme/meta/framework-data/cli.mjs --help` for semantic mutation commands,
required optimistic-concurrency values, migration, initialization, pause, and export.

If a crashed process leaves a cooperative lock, inspect it with
`node readme/meta/framework-data/cli.mjs lock inspect`. Recover only after establishing
that no owner is live, using the exact observed token with
`node readme/meta/framework-data/cli.mjs lock recover --expected-token TOKEN
--confirm-owner-not-live`; an incomplete owner write reports the token `incomplete`.
Never infer owner death from lock age, PID, or host.

## Operating Contract

- The Root Orchestrator is the sole semantic mutation authority. Other agents query the
  store and return proposed changes.
- Never edit task JSON directly. Raw files remain inspectable for Git review and
  recovery, but the CLI is the only authorized mutation path.
- CLI success establishes structural integrity and transition prerequisites, not user
  authority, approval truth, route/risk judgment, task priority, or semantic completion.
- Full-store integrity failure blocks every normal query and mutation. Do not skip,
  repair, or partially render malformed records.
- Task briefs and notes remain targeted Markdown narratives beside this entrypoint and
  are linked from their structured task records.
- Legacy task catalogs and archives are immutable migration evidence, not canonical
  state; normal reads never consult them.
- Lifecycle, selection, authority, and completion policy:
  `readme/meta/knowledge-management.md#task-lifecycle-and-selection`.
- Intake and close behavior: `readme/meta/root-loop.md`.
- Interruption behavior: `readme/meta/resumption-protocol.md`.
