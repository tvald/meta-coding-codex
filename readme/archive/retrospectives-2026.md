# Retrospective Log Archive: 2026

Older retrospective entries moved unchanged from
[readme/learning/retrospectives.md](../learning/retrospectives.md) under its budget rule.

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
