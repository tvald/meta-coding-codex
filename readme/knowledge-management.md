# Knowledge Management

Knowledge management keeps agents consistent across sessions. The repository should contain enough durable memory for a new agent to act without repeatedly interviewing the product owner.

## Canonical Artifacts

| Artifact | Purpose | Owner |
| --- | --- | --- |
| `AGENTS.md` | Root instructions and framework links | Agents maintain, humans approve major policy shifts |
| `readme/project-brief.md` | Product purpose, users, outcomes, constraints | Agents update from product evidence |
| `readme/project-context.md` | Concise technical conventions, stack choices, and conflict-prone implementation rules | Agents update from codebase and architecture evidence |
| `readme/workflow-status.md` | Phase, artifact, slice, risk, and next-action state for long-running initiatives | Root Orchestrator updates when work spans phases |
| `readme/standards.md` | Project-specific standards extending defaults | Agents update when patterns stabilize |
| `readme/assumptions.md` | Open assumptions with confidence and validation path | Agents update during work |
| `readme/glossary.md` | Canonical domain language | Agents update during ingestion |
| `readme/source-map.md` | Important sources and freshness | Agents update during research |
| `readme/decisions/` | Append-only decisions | Agents create for durable choices |
| `readme/task-notes/` | Long-running initiative memory | Agents create when work spans sessions |

Create artifacts only when they carry real content.

## Decision Records

Create a decision record when a choice:

- Is hard to reverse.
- Affects architecture, security, privacy, reliability, performance, cost, developer workflow, or product scope.
- Selects or removes a major dependency.
- Resolves a disagreement or source conflict.
- Changes this framework's process in a meaningful way.

Rules:

- One decision per file.
- Use `readme/decisions/NNNN-short-title.md`.
- Status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- Accepted records are append-only. If the decision changes, create a new record and link the old one.
- Include context, options, decision, consequences, confidence, and review trigger.

Use [templates/decision-record.md](templates/decision-record.md).

## Assumptions

Track assumptions when work can proceed safely but uncertainty remains.

Each assumption should include:

- Statement.
- Confidence: High, Medium, or Low.
- Impact if wrong.
- Validation path.
- Date recorded.
- Status: Open, Validated, Invalidated, or Obsolete.

Low-confidence assumptions that could materially change implementation should become clarification questions or spikes.

## Consistency Checks

Run a consistency check when:

- Finishing a multi-file feature.
- Changing product behavior.
- Updating standards, framework docs, or decisions.
- Resolving a major bug.
- Preparing a release.

Check consistency across:

- User request and delivered behavior.
- Acceptance criteria and tests.
- Product brief and UI/API behavior.
- Decision records and implementation.
- Standards and code style.
- Documentation and current commands.
- Assumptions and final response.

Use [templates/consistency-check.md](templates/consistency-check.md).

## Context Hygiene

Keep durable memory concise:

- Store facts, decisions, and rationale, not chat transcripts.
- Remove or supersede stale guidance when it becomes misleading.
- Link to source documents instead of copying long content.
- Mark freshness-sensitive information with date and source.
- Prefer specific commands and paths over general advice.
- Keep root instructions short and link to deeper files.

Give each durable fact, rule, or command catalog one canonical owner. Other artifacts
should link to that owner instead of restating it. When a short summary is necessary in
an entrypoint or handoff, label or link the canonical source and update both in the same
change. If duplicated guidance diverges, reconcile it at the canonical owner and remove
or replace the copies with links.

## Project Context

Use `readme/project-context.md` when implementation agents need a short, always-relevant technical spine. It should capture:

- Technology stack and versions.
- Critical implementation rules.
- Conflict-prone decisions that multiple agents might otherwise make inconsistently.
- Key paths and patterns to follow.
- Pitfalls that are not obvious from local code.

Keep product goals in `readme/project-brief.md`, broad standards in `readme/standards.md`, and task-specific context in task notes. Project context should stay lean enough to load before implementation work.

## Workflow Status

Use `readme/workflow-status.md` only for initiatives that span multiple phases, artifacts, slices, or agents. It should answer:

- What phase and path are active?
- Which artifacts are current, missing, or stale?
- Which slice is in progress, in review, blocked, or done?
- What risks or blockers exist?
- What is the recommended next action?

Do not create workflow status for one-off tasks.

## Standards Management

Standards should become durable when:

- The same review comment appears more than once.
- A defect reveals a missing rule.
- A project-specific convention becomes clear.
- A tool command or setup step is required for reliable work.
- A human explicitly asks for a preference to persist.

Do not add standards for one-off opinions. Standards must be actionable and verifiable.

## Knowledge Freshness

Some knowledge decays quickly:

- Third-party API behavior.
- Security guidance.
- Legal or compliance rules.
- Pricing, limits, model names, and vendor capabilities.
- Release processes and environment configuration.

When these facts matter, verify from current primary sources and update `readme/source-map.md` with the lookup date.
