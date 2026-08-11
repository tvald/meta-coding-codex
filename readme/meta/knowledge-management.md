# Knowledge Management

Repository memory must let a cold-start agent find durable facts, decisions, current
work, and recurrence evidence without asking the product owner to reconstruct them.

## Repository Is The Only Memory Store

All durable project knowledge used as agent memory lives in the repository under version
control. No harness-native memory, assistant profile, home-directory note, scratch file,
hosted note, or external database may substitute for or duplicate project state,
learning, preferences, decisions, or task facts.

This does not prohibit live provider telemetry, ephemeral tool state, or an
owner-authorized external operational source. Ingest required evidence under
[knowledge ingestion](knowledge-ingestion.md). Migrate any discovered auxiliary memory
to its canonical repository owner and stop relying on the external copy.

## Canonical Artifacts

| Artifact | Canonical Purpose | Owner |
| --- | --- | --- |
| `readme/README.md` | Bounded project policies, dead ends, documentation index, and maintenance baseline | Root Orchestrator |
| `readme/tasks/store/` | Versioned task identity, authority, lifecycle, dependencies, route/risk, gates, next action, details, and result | Root Orchestrator through `node readme/meta/framework-data/cli.mjs` only |
| `readme/tasks/README.md` | Static task-store command entrypoint; never a projection | Root Orchestrator |
| `readme/project/brief.md` | Product purpose, users, outcomes, and constraints | Agents update from product evidence |
| `readme/project/context.md` | Concise stack, conventions, and conflict-prone implementation rules | Architect or Root Orchestrator |
| `readme/project/standards.md` | Project rules and sole canonical verified-command catalog | Agents update from observed commands |
| `readme/project/assumptions.md` | Open uncertainty, confidence, impact, and validation | Agent introducing or resolving it |
| `readme/project/glossary.md` | Canonical terms and deprecated synonyms | Agent changing domain language |
| `readme/project/source-map.md` | Important sources, trust, ownership, and freshness | Research owner |
| `readme/project/automation-backlog.md` | Evidence-backed repeated-work candidates | Agent observing the candidate |
| `readme/project/agents.md` | Durable project-specific roles or rules justified by repeated use | Root Orchestrator |
| `readme/decisions/` | Append-only significant choices and consequences | Decision owner or Root Orchestrator |
| `readme/tasks/NNNN-*-brief.md` | Scope, acceptance, route/risk rationale, and amendments beyond the task record | Root Orchestrator or analyst |
| `readme/tasks/NNNN-*-notes.md` | Resumable execution evidence for long, risky, paused, or parallel work | Root Orchestrator |
| `readme/quality/` | Readiness, verification, review, and completion evidence | Root Orchestrator or QA owner |
| `readme/threat-models/` | Security and trust-boundary analysis | Security or risk owner |
| `readme/incidents/` | Blameless incident and near-miss learning | Incident owner |
| `readme/learning/retrospectives.md` | Searchable cross-session correction signals | Agent observing the signal |
| `readme/meta/framework-changelog.md` | Installed-host framework changes | Agent changing the installed framework |

The cursor, task entrypoint, and structured store are mandatory after onboarding. Create
other project artifacts only when they have real content.

## One Home Per Fact

Give each durable fact, rule, decision, or command one canonical home. Other artifacts
link to that owner rather than copying it. A short entrypoint or handoff summary is
allowed only when it links the owner and is updated in the same change. Reconcile any
divergent copies.

The task store owns task facts. A brief expands scope and acceptance; a task note owns
execution checkpoints and evidence. Neither narrative duplicates current status,
dependency, gate, next action, or result merely for convenience. Use
`node readme/meta/framework-data/cli.mjs task get` or
`node readme/meta/framework-data/cli.mjs task context` to join bounded state with linked
narratives.

Task gates are discriminated structured data. An approval must include ID, status,
source, action, boundary, bound `taskRevision`, and detail reference before it can make a
task mechanically eligible. CLI validity does not establish that the source is genuine
or that approval meaning is sufficient; the Root Orchestrator judges both.

## Task Lifecycle And Selection

Every accepted independent instruction receives the next stable task ID, semantic
revision 1, authority reference, and minimal record immediately through `task add`. IDs
are numeric identities, not priority, and expand beyond four digits without reuse. Only
the Root Orchestrator invokes semantic mutations; workers query and propose changes.

Direct user instructions and applicable higher-priority repository authority can create
tasks. An agent-found subtask is accepted only when necessary for an already-authorized
outcome, safety, or verification and cites that parent. Other findings remain proposals
in the active note or automation backlog.

Use `task amend` to increment `taskRevision` for a material outcome, scope, acceptance,
approval-boundary, or safety change. Every physical mutation increments `recordVersion`;
callers use it only for optimistic concurrency. Revalidate approvals, assignments, and
worker output after their bound semantic revision changes.

Lifecycle meanings:

- `Pending`: captured, but framing or acceptance is insufficient for selection.
- `Ready`: framed, dependencies satisfied, and no unresolved gate or safety blocker.
- `Active`: the one selected primary task. Parallel workers remain in its task-note
  roster rather than creating other Active tasks.
- `Parked`: deliberately paused at a recoverable checkpoint.
- `Blocked`: a concrete unresolved condition prevents progress.
- `Needs verification`: implementation exists but a required check cannot run.
- `Done`: requested outcome and every required runnable check are complete.
- `Cancelled`: the user ended the task; history and effects remain.
- `Superseded`: a named replacement task owns the outcome.

Before `Ready` or `Active`, validate authority structure, observable acceptance,
dependencies, gates, repository safety, and ownership. `task candidates` reports only
mechanical eligibility; the Root selects from user intent, unblock value, risk, and
coherent change boundaries. Arrival order breaks only an immaterial tie.

`Paused` is global scheduling state in the control record. Checkpoint the Active task
first, then pause; select nothing until authoritative guidance resumes it. A blocked or
unverified task blocks its dependents, not independent eligible work.

## Structured Store Contract

Use `node readme/meta/framework-data/cli.mjs` from the repository root. Every normal read
validates the whole store before emitting a bounded JSON envelope. Exact-ID and
dependency queries include terminal records; default lists omit only `Done`,
`Cancelled`, and `Superseded` while reporting omissions and truncation.
List/export queries support exact authority and tag filters plus accepted/completed date
bounds, dependency, route/risk, status, and repository-change filters; use those
projections instead of loading or maintaining archives.

Never hand-edit task JSON. Raw records remain inspectable for Git review and recovery,
but the CLI is the only authorized mutation path. It enforces schema, canonical bytes,
graph/state invariants, safe paths, locks, CAS, and atomic replacement; it does not
authenticate a caller or judge authority, priority, approval truth, risk, or Done.

Task records never move because of status or age. Numeric sharding occurs at creation.
Legacy Markdown catalogs and archives may remain immutable, explicitly noncanonical
migration evidence; normal commands never read them.

## Project Cursor

Read `readme/README.md` at startup, then run
`node readme/meta/framework-data/cli.mjs doctor` and
`node readme/meta/framework-data/cli.mjs startup`. Keep the cursor at or below 80 lines
with only standing project policies, current cross-task dead ends, the
documentation map, and maintenance baseline. Do not copy primary task, recent outcomes,
task gates, scheduling, or completion counts into it.

## Decision Records

Create a decision for a hard-to-reverse choice or a material change to product scope,
architecture, security, privacy, reliability, cost, workflow, policy, or dependency.

- One decision per `readme/decisions/NNNN-short-title.md`.
- Status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- Accepted records are append-only; supersede them through a linked new record.
- Include context, options, decision, consequences, confidence, sources, and trigger.

Use [templates/decision-record.md](templates/decision-record.md).

## Assumptions, Terms, And Sources

Use [templates/assumptions.md](templates/assumptions.md) for uncertainty that can proceed
safely. A low-confidence, high-impact assumption becomes a question, spike, or decision.

When first needed, use these minimal tables:

```md
# Glossary
| Term | Meaning | Use Instead Of | Source | Last Checked |
| --- | --- | --- | --- | --- |

# Source Map
| ID | Source | Owner/Publisher | Date Checked | Trust Tier | Scope | Notes |
| --- | --- | --- | --- | --- | --- | --- |
```

Mark stale sources and deprecated terms; do not erase history needed by decisions.
Recheck vendor, legal, security, pricing, release, and API facts when they matter.

## Consistency Checks

Run a consistency pass when finishing a multi-file behavior change, changing this
framework or a decision, resolving a major defect, preparing a release, or when the
maintenance cadence fires. Check request, acceptance, implementation, tests, briefs,
decisions, standards, assumptions, commands, docs, task state, and package boundaries as
applicable. Use the quality-record consistency section when evidence needs persistence.

## Artifact Budgets And Overflow

Budgets are defaults except for the two hard entrypoints. Exceed a default only with a
short rationale; otherwise compress active material and archive history unchanged.

| Artifact | Budget | Overflow Rule | Owner |
| --- | ---: | --- | --- |
| `AGENTS.md` | 120 lines, hard | Move detail to an owning process doc | Root |
| `readme/README.md` | 80 lines, hard | Keep only cursor-owned facts | Root |
| Project brief | 200 lines | Split stable technical detail to context | Product Analyst or Root |
| Project context | 160 lines | Move broad rules/rationale to owners | Architect or Root |
| Standards/command catalog | 240 lines | Split only with one explicit owner | Root |
| Assumptions | 120 lines | Archive closed rows | Root |
| Glossary | 160 lines | Archive deprecated terms after migration | Documentarian |
| Source map | 200 lines | Archive stale sources preserving links | Research owner |
| Structured task record | CLI schema/byte limits | Reject oversize; move narrative to linked brief/note | Root through CLI |
| Static task entrypoint | 80 lines, hard | Keep only commands and boundary | Root |
| Active task note | 300 lines | Archive completed chronology; keep resume state | Root |
| Decision record | 220 lines | Link evidence; never truncate accepted decisions | Decision owner |
| Retrospective/changelog | 20 entries or 160 lines | Move older entries unchanged to dated archive | Root |
| Core process doc | 300 lines | Split only by clear ownership boundary | Root |

## Maintenance Cadence

Run consistency and pruning after 10 structured task completions marked
`repositoryChanged: true` since the last pass or 30 days, whichever occurs first. The
cursor stores only the last pass and next date trigger; derive the count with a bounded
task query. A migrated legacy baseline may remain explicitly until the first post-cutover
pass because Format 1 lacks trustworthy per-task completion fields.

The pass must:

1. run `doctor` and validate pause/primary state, dependencies, gates, links, Git
   conflicts, command owners, and package boundaries;
2. apply artifact overflow rules and find noncanonical projections or caches;
3. mark or supersede stale guidance/sources and re-examine changed assumptions;
4. search retrospective repeats and evaluate due framework reviews;
5. reconcile duplicated/conflicting guidance at its canonical owner; and
6. record the date, reset the legacy baseline if present, and name incomplete work.

Scheduled maintenance owns pruning; correct dangerous stale guidance immediately.
