# Retrospective Log

This append-only log makes cross-session process learning discoverable. Add an entry
only when substantial work reveals a concrete correction, recurring friction, missing
context home, or useful process change. Routine "nothing learned" entries create noise.

Before appending, search this file and `readme/archive/` for the same signal or tags. If
it has appeared before, link the earlier entry and apply the repeat trigger in
[framework improvement](../meta/framework-improvement.md). Keep at most 20 active entries or
160 lines; move older entries unchanged to a dated file under `readme/archive/` and link
the archive here.

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

### R-2026-07-10-01

- What happened: An external review found that repeat-detection and cold-start recovery
  relied on session memory that the repository did not persist.
- Framework or knowledge gap: The retrospective was internal only, and no global state
  file pointed a new agent to active work or parked approvals.
- Change made or follow-up: Added this log and the
  [project cursor](../README.md), then made their read, update, size, archive, and
  recurrence rules explicit.
- Tags: continuity, cold-start, retrospective, repeat-detection
- Earlier occurrence: None
