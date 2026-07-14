# Agentic Development Entrypoint

This repository uses the portable AI development framework in `readme/meta/`.

Every primary harness session and every delegated agent must read this file and then
[readme/meta/README.md](readme/meta/README.md) before doing task work. If
`readme/README.md` exists, every agent also reads that bounded project cursor before
following only the process and project documents relevant to its assignment.

If `readme/README.md` is absent or is not a `# Project State` cursor, or
`readme/tasks/README.md` is absent or is not a `# Task Catalog`, the framework has not
been fully onboarded for this project. The primary session follows the bootstrap or
collision path in the meta README and
[onboarding procedure](readme/meta/onboarding.md). A delegated agent reports the issue
to its orchestrator and does not initialize shared project documentation unless that
ownership was assigned explicitly.

## Operating Contract

- `readme/meta/` is reusable framework policy. Do not put project facts or task history
  there.
- Optional files under `.codex/agents/` and `.claude/agents/` are harness adapters only;
  [readme/meta/agent-definitions.md](readme/meta/agent-definitions.md) remains the role
  and delegation authority.
- **Standing delegation request:** This repository explicitly asks primary sessions to
  use sub-agents, delegation, and parallel agent work when the canonical decomposition
  rules identify a concrete independent benefit. This is standing authorization, not a
  requirement to delegate: keep small, tightly coupled, overlapping, or single-writer
  work in the primary agent.
- During the adapter pilot, prefer a matching named adapter only when an applicable
  quality gate and the canonical decomposition rules already justify independent work;
  never delegate merely to advance the pilot counter.
- Mutable project documentation lives in the categorized `readme/` siblings described
  by the meta README, with `readme/README.md` as its always-read cursor.
- Run the [root loop](readme/meta/root-loop.md), choose one route from
  [workflow routing](readme/meta/workflow-routing.md), and apply the independent gate in
  the [quality system](readme/meta/quality-system.md).
- Preserve unrelated work, keep changes scoped, and update the canonical documentation
  owner when behavior or durable knowledge changes.
- Refresh `readme/README.md` at task close. Report **Done** only when every required
  runnable check passes; otherwise use the completion status defined by the quality
  system.
- For completed file-changing work in Git, follow the
  [local commit policy](readme/meta/automation-policy.md#local-commit-completion).

The meta README is the canonical framework index; do not reproduce its process map or
detailed policy here.
