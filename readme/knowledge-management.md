# Knowledge Management

Repository memory must let a cold-start agent find the current cursor, durable facts,
decisions, and recurrence evidence without asking the product owner to reconstruct them.

## Canonical Artifacts

| Artifact | Canonical Purpose | Owner |
| --- | --- | --- |
| `readme/state.md` | Always-read current focus, next actions, parked approvals, recent outcomes, and maintenance cursor | Root Orchestrator, every session and close |
| `readme/project-brief.md` | Product purpose, users, outcomes, and constraints | Agents update from product evidence |
| `readme/project-context.md` | Concise stack, technical conventions, and conflict-prone implementation rules | Agents update from code and decisions |
| `readme/standards.md` | Project-specific rules and the sole canonical command catalog | Agents update only from observed practice and executed commands |
| `readme/assumptions.md` | Open uncertainty, confidence, impact, and validation | Agent that introduces or resolves the assumption |
| `readme/glossary.md` | Canonical domain terms and deprecated synonyms | Agent ingesting or changing domain language |
| `readme/source-map.md` | Important sources, trust, ownership, and freshness | Agent relying on the source |
| `readme/decisions/` | Append-only significant choices and consequences | Decision owner or Root Orchestrator |
| `readme/task-notes/` | Status and resume detail for long-running, paused, or parallel work | Root Orchestrator |
| `readme/retrospectives.md` | Searchable cross-session correction and process-learning signals | Agent observing the signal |
| `readme/framework-changelog.md` | Auditable framework edits, pilots, and sunset triggers | Agent changing the framework |

`state.md` is mandatory because it is the cold-start index. Create every other project
artifact only when it has real content.

## One Home Per Fact

Give each durable fact, rule, decision, or command catalog one canonical home. Other
artifacts link to that owner instead of restating it. A short entrypoint or handoff
summary is allowed only when it links the canonical source and is updated in the same
change. If copies diverge, reconcile the owner and replace the copies with links.

Templates define structure; instantiated project artifacts own facts. A fact appearing
in a blank example is not a second home, but product-specific values must not be copied
between the brief, assumptions, glossary, and source map.

## State Rules

Read `state.md` at every session start and refresh it at every task close. During active
work it answers:

- What outcome is active, by which route, and where is the detailed task note?
- What is the next safe action?
- Which approvals are parked, and what action does each gate?
- Which dead ends are still relevant?
- What recently completed, and what durable record explains it?
- When is the next hygiene pass due?

Keep one current focus, at most five recently completed entries, and only currently
relevant dead ends. Detail belongs in the linked task note or decision.

## Decision Records

Create a decision record for a choice that is hard to reverse; materially changes
product scope, architecture, security, privacy, reliability, cost, workflow, or policy;
selects a major dependency; or resolves an important conflict.

- One decision per `readme/decisions/NNNN-short-title.md`.
- Status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- Accepted records are append-only. Supersede them with a linked new record.
- Include context, options, decision, consequences, confidence, sources, and trigger.

Use [templates/decision-record.md](templates/decision-record.md).

## Assumptions, Terms, And Sources

Use [templates/assumptions.md](templates/assumptions.md) for uncertainty that can proceed
safely. A low-confidence, high-impact assumption becomes a question, spike, or decision.

When first needed, use these minimal tables in the canonical files:

```md
# Glossary
| Term | Meaning | Use Instead Of | Source | Last Checked |
| --- | --- | --- | --- | --- |

# Source Map
| ID | Source | Owner/Publisher | Date Checked | Trust Tier | Scope | Notes |
| --- | --- | --- | --- | --- | --- | --- |
```

Mark stale sources and deprecated terms; do not erase history that explains decisions.
Re-check current vendor, legal, security, pricing, release, and API facts from primary
sources when they matter.

## Consistency Checks

Run a consistency pass when finishing a multi-file or behavior change, changing this
framework or a decision, resolving a major defect, preparing a release, or when the
maintenance cadence below fires. Check the request, acceptance criteria, implementation,
tests, brief, decisions, standards, assumptions, commands, docs, and state as applicable.
Use the consistency section of [templates/quality-record.md](templates/quality-record.md)
when the result needs a durable record.

## Artifact Budgets And Overflow

Budgets are defaults except for the two hard cursors. Exceed a default only with a short
rationale in the artifact; otherwise compress active material and archive history
without changing it.

| Artifact | Budget | Overflow Rule | Maintenance Owner |
| --- | ---: | --- | --- |
| `AGENTS.md` | 120 lines, hard | Move detail to an owning process doc and link it | Root Orchestrator |
| `state.md` | 80 lines, hard | Move detail to task notes or decisions; retain only current pointers | Root Orchestrator |
| Project brief | 200 lines | Split stable technical detail to project context | Product Analyst or Root Orchestrator |
| Project context | 160 lines | Move broad standards or decision rationale to their owners | Architect or Root Orchestrator |
| Standards and command catalog | 240 lines | Split topic-specific standards only when one owner remains explicit | Root Orchestrator |
| Assumptions | 120 lines | Archive closed rows to `readme/archive/` | Root Orchestrator |
| Glossary | 160 lines | Archive deprecated terms after dependent docs migrate | Documentarian |
| Source map | 200 lines | Archive stale sources while preserving decision links | Research owner |
| Active task note | 300 lines | Move completed chronology to a dated archive; keep resume state | Root Orchestrator |
| Decision record | 220 lines each | Prefer linked supporting evidence; never truncate an accepted decision | Decision owner |
| Retrospective or framework changelog | 20 entries or 160 lines | Move old entries unchanged to a dated archive and link it | Root Orchestrator |
| Core framework process doc | 300 lines | Split only by a clear ownership boundary and update the index | Root Orchestrator |

Archive under `readme/archive/` with a date or sequence in the filename. Do not create an
empty archive directory. Archives are read on a targeted lookup, not every task.

## Maintenance Cadence

The Root Orchestrator runs a consistency and pruning pass after 10 completed
repository-changing tasks or 30 days since the last pass, whichever occurs first. The
state file holds both counters. The pass must:

1. validate state pointers, parked approvals, and canonical command links;
2. find budgets over limit and apply their overflow rules;
3. mark or supersede stale guidance and sources;
4. search retrospective repeats and evaluate due framework pilots or sunsets;
5. reconcile duplicated or conflicting guidance at its canonical owner; and
6. record the date, reset the task counter, and name any incomplete maintenance action.

This scheduled pass owns pruning; agents should still correct dangerous stale guidance
immediately when they encounter it.
