# Retrospective Log

This append-only log makes cross-session process learning discoverable. Add an entry
only when substantial work reveals a concrete correction, recurring friction, missing
context home, or useful process change. Routine "nothing learned" entries create noise.

Before appending, search this file and `readme/archive/` for the same signal or tags. If
it has appeared before, link the earlier entry and apply the repeat trigger in
[framework-improvement.md](framework-improvement.md). Keep at most 20 active entries or
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

### R-2026-07-10-01

- What happened: An external review found that repeat-detection and cold-start recovery
  relied on session memory that the repository did not persist.
- Framework or knowledge gap: The retrospective was internal only, and no global state
  file pointed a new agent to active work or parked approvals.
- Change made or follow-up: Added this log and [state.md](state.md), then made their read,
  update, size, archive, and recurrence rules explicit.
- Tags: continuity, cold-start, retrospective, repeat-detection
- Earlier occurrence: None
