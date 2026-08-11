# Task Store

Canonical task state lives under `readme/tasks/store/` and is accessed through the
repository-pinned CLI. This file is a static entrypoint, not a generated catalog or a
second state owner.

## Required Commands

Run from the repository root:

```sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
```

Use bounded queries for discovery and recovery:

```sh
npm run --ignore-scripts --silent meta -- tasks task list
npm run --ignore-scripts --silent meta -- tasks task get T-0001
npm run --ignore-scripts --silent meta -- tasks task context T-0001
npm run --ignore-scripts --silent meta -- tasks task deps T-0001
npm run --ignore-scripts --silent meta -- tasks task candidates
```

Use `npm run --ignore-scripts --silent meta -- tasks --help` for semantic mutation commands,
required optimistic-concurrency values, migration, initialization, pause, and export.

If a crashed process leaves a cooperative lock, inspect it with
`npm run --ignore-scripts --silent meta -- tasks lock inspect`. Recover only after establishing
that no owner is live, using the exact observed token with
`npm run --ignore-scripts --silent meta -- tasks lock recover --expected-token TOKEN
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
- Legacy task catalogs and archives are immutable migration evidence, not query inputs or
  alternate task-state owners.
- Lifecycle, selection, authority, and completion policy:
  `readme/meta/knowledge-management.md#task-lifecycle-and-selection`.
- Intake and close behavior: `readme/meta/root-loop.md`.
- Interruption behavior: `readme/meta/resumption-protocol.md`.
