# AI Coding Meta-Framework

This directory is the self-contained, reusable entrypoint for a portable framework core
that gives coding agents an operating loop, durable project memory, risk-scaled quality
gates, and explicit autonomy boundaries. Policy remains Markdown; the required
repository-pinned task data boundary uses dependency-free Node.js 22+ and Git. Optional
declarative harness adapters may expose selected roles without becoming framework policy.

Every primary harness session and every delegated agent must read this file before task
work. This file explains what is reusable, what belongs to the host project, and which
process owner to load next.

## Startup Order

1. Read the applicable root `AGENTS.md` instructions.
2. Read this meta README in full.
3. Read `readme/README.md` when it exists; it is the bounded current-project cursor.
4. Read the static `readme/tasks/README.md` entrypoint, then run
   `node readme/meta/framework-data/cli.mjs doctor` and the bounded
   `node readme/meta/framework-data/cli.mjs startup` query.
5. Read only the returned primary task details and process/project documents relevant
   to the assignment.

If `readme/README.md` is missing or does not begin with `# Project State`,
`readme/tasks/README.md` is missing or does not begin with `# Task Store`, or
`readme/tasks/store/` is absent, the add-on is not fully onboarded. A primary session
follows [onboarding.md](onboarding.md), preserving collisions and distinguishing a fresh
store from explicit legacy migration. A delegated agent does not initialize shared
state unless the orchestrator assigned that ownership.

## Directory Contract

`readme/meta/` contains reusable framework policy, references, blank templates, and a
blank [framework changelog](framework-changelog.md) seed. After installation, that log
is the one intentional host-state exception under `readme/meta/`: it records only local
edits to the installed framework so useful evidence can accompany a later upstream
proposal. Its preamble ships in a clean package; entries from one host never do. All
other project facts, decisions, commands, active work, reviews, learning, and archives
remain in the project-side paths below and never become part of the reusable package.
When the project being developed is the framework itself, its framework-development
tasks and state are ordinary project state and remain in those project-side paths; an
explicit source-project policy may therefore keep the distributable seed blank.

The host project's agent-maintained documentation uses these mutable paths:

| Path | Purpose |
| --- | --- |
| `readme/README.md` | Always-read bounded project policy, documentation index, dead ends, and maintenance baseline |
| `readme/project/` | Stable project brief, context, standards, assumptions, glossary, source map, automation backlog, and project-specific agent guidance |
| `readme/decisions/` | Append-only significant project or local-framework decisions |
| `readme/tasks/` | Static `README.md` entrypoint, canonical sharded `store/`, and proportional briefs and resumable notes |
| `readme/quality/` | Durable readiness, verification, and review records |
| `readme/threat-models/` | Lightweight security and trust-boundary analyses |
| `readme/incidents/` | Incident and near-miss records |
| `readme/learning/` | Retrospectives; an excluded upstream framework-source changelog only under explicit source-project policy |
| `readme/archive/` | Overflow moved from active artifacts without rewriting history |

The project cursor, task entrypoint, and structured task store are mandatory after
onboarding. Create other optional files and directories only when useful.
Established host documentation may remain at its required conventional location; link
to its canonical owner instead of copying facts into framework-managed records.

## Required Data Boundary And Optional Harness Integrations

`framework-data/` is required core runtime, not an optional integration. It owns task
shape, deterministic serialization, bounded queries, mechanical transitions, and the
Format 1 importer. Markdown process documents retain policy and judgment. The CLI never
authenticates an agent role or establishes authority, approval truth, priority, risk, or
semantic completion.

The portable core is complete with this `readme/meta/` tree and the merged root
`AGENTS.md` startup instruction. A root `CLAUDE.md` may import `AGENTS.md` so Claude Code
loads the same owner. Project files under `.codex/agents/` and `.claude/agents/` may
expose selected roles through native discovery. Repo skills under
`.agents/skills/codex-quota-monitor/` and `.claude/skills/claude-quota-monitor/` may
expose the Codex and Claude Code telemetry procedures required by the portable usage
capacity guard. The canonical `.agents/skills/project-onboarding/` skill and its thin
`.claude/skills/project-onboarding/` discovery link may expose onboarding without
becoming another policy owner. The matching `.agents/skills/task-recovery/` body and
`.claude/skills/task-recovery/` link may expose targeted interruption recovery while
leaving resumption, delegation, and capacity policy in their Markdown owners.

These files are optional integration surfaces, not additional policy owners. They:

- point to [agent-definitions.md](agent-definitions.md) and other canonical process
  owners instead of copying their rules;
- keep agent adapters limited to vendor-required discovery metadata and least-privilege
  capability settings, and skills limited to bounded procedures and UI metadata;
- do not add executable code, dependencies, model pins, MCP servers, hooks, permission
  bypasses, or integration ownership; and
- can be omitted or removed without changing the core framework workflow.

Each quota-monitor skill contains only its required Markdown telemetry procedure and UI
metadata and links [agent-definitions.md](agent-definitions.md#usage-capacity-guard) as
policy owner. The Codex skill reads the already-installed Codex App Server; the Claude
skill reads the authenticated Claude Code usage surface within a single subprocess and
never surfaces credentials, tokens, or billing data to the session. Neither is one of the
three role adapters.

The project-onboarding skill contains execution order and fail-closed disposition
handling only. It loads [onboarding.md](onboarding.md) as its policy owner. Its Claude
surface links the maintained `.agents` body instead of copying the workflow. A same-name
skill directory at either provider path is one installer collision domain: preserve the
whole bundle for deliberate reconciliation rather than mixing host and framework files.

The task-recovery skill contains bounded reconciliation order, safe-stop dispositions,
and a recovery result contract. It loads [resumption-protocol.md](resumption-protocol.md)
and only the relevant worker, approval, or usage-capacity owner when that recovery path
applies. Its Claude surface is another thin link to the maintained `.agents` body and
uses the same cross-harness collision boundary.

The three role adapters—Reviewer, QA And Verification Agent, and Security And Risk
Agent—are adopted optional integrations that host projects may omit entirely.

## Principles

- Outcome first; context before code.
- One provisional workflow route, with risk as an independent safety overlay.
- Small reversible steps and observed verification results.
- Durable additive task intake with dependency- and safety-based selection, not FIFO.
- One canonical home for each fact, rule, decision, and command catalog.
- Bounded task queries and semantic, optimistic-concurrency-protected mutations.
- Repository-backed state and learning only. No harness may use an out-of-repository
  memory store for durable project knowledge. Detail and rationale:
  [knowledge-management.md](knowledge-management.md#repository-is-the-only-memory-store).
- Agents maintain process memory; product owners make consequential product decisions.
- Repeated failures improve the system, with every local framework edit auditable.

## Process Map

- [root-loop.md](root-loop.md): additive intake, selection, and operating loop for every
  task.
- [workflow-routing.md](workflow-routing.md): single route table and escalation triggers.
- [onboarding.md](onboarding.md): cold-start inventory, command derivation, ingestion,
  state initialization, and cold-start proof.
- [knowledge-ingestion.md](knowledge-ingestion.md): source trust, synthesis, acceptance
  criteria, and conflict handling.
- [knowledge-management.md](knowledge-management.md): canonical artifacts, budgets,
  archives, and maintenance cadence.
- [automation-policy.md](automation-policy.md): standing authority, approvals, commands,
  and local commits.
- [resumption-protocol.md](resumption-protocol.md): task-targeted interruption and
  worker recovery.
- [agent-definitions.md](agent-definitions.md): optional roles, decomposition, usage
  capacity, integration, and shared-work safety.
- [development-standards.md](development-standards.md): default engineering standards.
- [quality-system.md](quality-system.md): risk gates, verification, review, security, and
  completion statuses.
- [framework-improvement.md](framework-improvement.md): evidence-based local framework
  edits, pilots, and sunset checks.
- [references.md](references.md): primary research basis.

## Template Catalog

- [project-state.md](templates/project-state.md) → `readme/README.md`: bounded project
  cursor and documentation index.
- [project-brief.md](templates/project-brief.md) → `readme/project/brief.md`: product
  outcomes and constraints.
- [project-context.md](templates/project-context.md) → `readme/project/context.md`:
  concise technical conventions.
- [standards.md](templates/standards.md) → `readme/project/standards.md`: project rules
  and verified command catalog.
- [assumptions.md](templates/assumptions.md) → `readme/project/assumptions.md`:
  consequential uncertainty.
- [decision-record.md](templates/decision-record.md) → `readme/decisions/`: significant
  choices.
- [task-catalog.md](templates/task-catalog.md) → `readme/tasks/README.md`: static task
  store entrypoint and command boundary; structured host records own task facts.
- [task-brief.md](templates/task-brief.md) and
  [task-notes.md](templates/task-notes.md) → `readme/tasks/`: scoped outcomes and
  resumable work.
- [quality-record.md](templates/quality-record.md) → `readme/quality/`: readiness,
  verification, review, consistency, and completion evidence.
- [threat-model-card.md](templates/threat-model-card.md) → `readme/threat-models/`:
  lightweight agent-aware threats.
- [incident-note.md](templates/incident-note.md) → `readme/incidents/`: blameless
  incident and near-miss learning.

Blank templates are schemas, not additional homes for project facts. The glossary and
source-map schemas live in [knowledge-management.md](knowledge-management.md); create
every project artifact only after it has useful content.

## Package And Bootstrap

A clean core package contains this `readme/meta/` tree, including the pinned
`framework-data/` runtime, schemas, and blank framework changelog seed, plus a merged
root AGENTS startup instruction. It may also carry the matching `.codex/agents/`,
`.claude/agents/`, quota-monitor skills, and the project-onboarding and task-recovery
discovery bundles as optional integrations.
Never overwrite an established instruction, same-name agent, or same-name skill. The
package excludes local changelog entries, `readme/README.md`, `readme/tasks/store/`, and
every mutable project-documentation sibling.
Packaging is the supported reset path; do not delete an existing project's documentation
to simulate a reset.

On first use:

1. The primary session reads root instructions and this file.
2. It runs [onboarding.md](onboarding.md) because the cursor, task entrypoint, or store
   is absent, or recognizes and safely resolves unrelated or legacy state.
3. It instantiates the project cursor and static task entrypoint from
   [project-state.md](templates/project-state.md) and
   [task-catalog.md](templates/task-catalog.md), then runs
   `node readme/meta/framework-data/cli.mjs init`; legacy
   Format 1 state uses explicit dry-run/hash/apply migration instead.
4. It derives commands from manifests and CI, executes safe candidates, and records
   only observed successes in `readme/project/standards.md`.
5. It creates project knowledge categories only when inventory produces real content.
6. It proves a new agent can recover the outcome, primary and eligible tasks, next
   action, commands, constraints, and approvals from bounded repository queries.

For greenfield work, record product and technology choices as decisions rather than
pretending to derive them. For an established project, preserve existing instruction
and documentation owners and link them from the appropriate project records.
