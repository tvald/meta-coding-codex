# Retrospective Log

This append-only log makes cross-session process learning discoverable. Add an entry
only when substantial work reveals a concrete correction, recurring friction, missing
context home, or useful process change. Routine "nothing learned" entries create noise.

Before appending, search this file and `readme/archive/` for the same signal or tags. If
it has appeared before, link the earlier entry and apply the repeat trigger in
[framework improvement](../meta/framework-improvement.md). Keep at most 20 active entries or
160 lines; move older entries unchanged to a dated file under `readme/archive/` and link
the archive here.

Archived entries: [2026](../archive/retrospectives-2026.md).

Each entry has exactly these durable fields, plus tags for search:

```md
## R-YYYY-MM-DD-NN
- What happened:
- Framework or knowledge gap:
- Change made or follow-up:
- Tags:
- Earlier occurrence: None / link
```

## Entries

### R-2026-07-30-01

- What happened: A request framed as a small urgent bug ("there is an issue with the
  installer") was designed, verified, and committed (`0a8cd76`) straight through. The root
  loop was not run first: no catalog ID was reserved and no task, quality, or decision
  records existed until a later turn prompted the backfill as T-0013.
- Framework or knowledge gap: A trivial-looking fix pattern-matched to "just fix it" and
  bypassed the entrypoint's mandate that every repository-changing task be recorded. No
  forcing function ties a framework-modifying commit to a catalog row, so the catalog
  silently jumped from T-0011 to T-0012 with an unrecorded change in between.
- Change made or follow-up: Backfilled T-0013 and its records; treat any change to the
  installer or framework files as an accepted task that needs at least a catalog row and
  route before its commit, however small the request appears. Watch for repeats of a
  quick fix skipping intake.
- Tags: process, root-loop, task-catalog, records, installer, backfill
- Earlier occurrence: None

### R-2026-07-14-04

- What happened: Moving safe install commands into a streamed script exposed three
  independent completeness boundaries: Bash can execute a valid prefix before curl
  finishes, an allowlisted zip can still omit most core files, and pathname rechecks can
  race with local directory replacement. A Linux descriptor-path fix then proved
  unsuitable for the portable installer because macOS cannot traverse directory FDs.
- Framework or knowledge gap: The package boundary was exact at production time but not
  yet enforced by the consumer, and installer safety had no durable stream-completion,
  directory-transaction, or cross-platform race contract.
- Change made or follow-up: Added a final compound invocation plus outer `pipefail`, an
  installer/workflow exact-inventory handshake, noninteractive capped staging, and
  no-clobber AGENT plus CWD-relative directory-scoped meta transactions with rollback.
- Tags: installer, streaming, packaging, inventory, races, rollback, portability, state
- Earlier occurrence: [R-2026-07-14-02](#r-2026-07-14-02)

### R-2026-07-14-03

- What happened: Designing a moving `latest` release for rapid main pushes showed that
  cancelling active workflow runs can overlap publisher teardown, while GitHub does not
  guarantee arbitrary concurrency ordering.
- Framework or knowledge gap: The repository had an exact package boundary but no
  durable release ordering, partial-update, permission-isolation, or consumer-collision
  contract.
- Change made or follow-up: Serialized whole workflow runs, added live-main checks before
  mutations, split read-only build from write publication, made release/ref discovery
  exact and fail-closed, drafted existing releases during asset replacement, and made
  installation preserve existing AGENTS instructions.
- Tags: releases, github-actions, concurrency, permissions, packaging, collisions
- Earlier occurrence: [R-2026-07-14-02](#r-2026-07-14-02)

### R-2026-07-14-02

- What happened: T-0006 had to reconstruct and verify the state-free package manually,
  and the next requested distribution workflow needed the same exact boundary again.
  The first script draft also showed that source mtimes make fresh clones differ.
- Framework or knowledge gap: The core/state boundary was documented but not executable,
  and reproducibility did not yet include checkout-independent metadata normalization.
- Change made or follow-up: Added an allowlisted packaging command that generates only
  the portable startup prefix plus `readme/meta/`, normalizes modes and UTC timestamps,
  verifies its own inventory, and leaves release publication to a separate task.
- Tags: packaging, automation, reproducibility, state, metadata, task-splitting
- Earlier occurrence: [R-2026-07-14-01](#r-2026-07-14-01)

### R-2026-07-14-01

- What happened: A substantial task-loop update was imported from a separate framework
  repository without its mutable state, leaving this host on the old cursor schema and
  without the newly mandatory catalog. Review also found that catalog-path collisions
  lacked the cursor path's preservation rules.
- Framework or knowledge gap: State-free imports correctly exclude foreign project
  memory, but each host still needs explicit adoption records and symmetric migration
  safety for every mandatory state path. Project-local authority in root instructions
  must also remain outside the portable startup merge.
- Change made or follow-up: Migrated this host to the catalog/cursor contract, recorded
  Decisions 0008 and 0009, added schema-aware catalog collision handling, and required a
  state-free package/bootstrap fixture without otherwise redesigning the imported core.
- Tags: imports, packaging, state, tasks, catalog, onboarding, collisions, delegation
- Earlier occurrence: [R-2026-07-10-02](#r-2026-07-10-02)

### R-2026-07-13-02

- What happened: Follow-up evaluation found that the installed Codex App Server exposes
  supported rate-limit RPC data even though the CLI has no `usage` subcommand, and a
  valid response exposed a weekly window while omitting a five-hour window.
- Framework or knowledge gap: Decision 0006 named no Codex acquisition path and could
  conflate an explicitly absent window with failed telemetry, causing permanent
  conservative suspension.
- Change made or follow-up: Added the dependency-free `codex-quota-monitor` repo skill
  and Decision 0007, with initialized App Server reads, valid-absence semantics, and
  failed-read safety linked back to the canonical guard.
- Tags: codex, skills, app-server, telemetry, quota, null-semantics, dependencies
- Earlier occurrence: [R-2026-07-13-01](#r-2026-07-13-01)

### R-2026-07-13-01

- What happened: The product owner required child workers to stop before five-hour or
  weekly capacity exhaustion and to resume after reset without manual monitoring.
- Framework or knowledge gap: Delegation had a concurrency cap and worker recovery but
  no usage meter, capacity cutoff, reset wait, or safe behavior for missing telemetry.
- Change made or follow-up: Adopted Decision 0006 with authoritative dual-window checks,
  a 95% suspension boundary, durable checkpoints, timer-plus-verification behavior, and
  a five-minute polling fallback.
- Tags: subagents, usage, quota, capacity, suspension, resumption, timers, polling
- Earlier occurrence: None

### R-2026-07-10-03

- What happened: The portable package used only `AGENTS.md` as its root launcher even
  though Claude Code reads `CLAUDE.md` by default, and the framework's specialist roles
  were not discoverable through either supported harness-native agent directory.
- Framework or knowledge gap: The package had neither a non-duplicative Claude startup
  bridge nor a bounded policy for optional vendor-native role adapters.
- Change made or follow-up: Added a `CLAUDE.md` import bridge and a three-role Codex and
  Claude Code adapter pilot, with canonical ownership, least-privilege, packaging, and
  sunset controls in Decision 0005.
- Tags: portability, instruction-discovery, subagents, codex, claude-code, adapters
- Earlier occurrence: None

### R-2026-07-10-02

- What happened: Packaging the framework for an existing project would also copy this
  repository's cursor, decisions, tasks, and review history because reusable policy and
  project memory shared one directory.
- Framework or knowledge gap: The framework had no self-contained reusable boundary or
  state-free bootstrap contract.
- Change made or follow-up: Moved reusable policy and templates under `readme/meta/`,
  categorized project documentation separately, and made packaging plus onboarding the
  clean-start path.
- Tags: packaging, portability, state, onboarding, documentation-boundary
- Earlier occurrence: None
