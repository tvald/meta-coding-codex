# AI Coding Meta-Framework

This directory is the self-contained, reusable entrypoint for a portable framework core
that gives coding agents an operating loop, durable project memory, risk-scaled quality
gates, and explicit autonomy boundaries. Policy remains Markdown; the required
repository-pinned task data boundary uses dependency-free Node.js 22+ and Git. Optional
declarative harness adapters may expose selected roles without becoming framework policy.

Every primary harness session and every delegated agent reads this file before task
work in source mode. An installed client instead loads the applicable compiled agent
profile, which contains the bounded operational projection below without requiring a
package-internal path.
## Startup Order

1. Read the applicable root `AGENTS.md` instructions.
2. Read this meta README in full.

<!-- meta-framework-facet:v1:start tasks.startup -->
## Project Startup After Profile Load

After loading this profile, do not locate or read package-internal policy files.

1. Read `readme/README.md` when it exists; it is the bounded current-project cursor.
2. Read the static `readme/tasks/README.md` entrypoint, then run
   `npm run --ignore-scripts --silent meta -- tasks doctor` and the bounded
   `npm run --ignore-scripts --silent meta -- tasks startup` query.
3. Read only the returned primary task details and process/project documents relevant
   to the assignment.

If `readme/README.md` is missing or does not begin with `# Project State`,
`readme/tasks/README.md` is missing or does not begin with `# Task Store`, or
`readme/tasks/store/` is absent, the project is not fully onboarded. A primary session
loads `npm run --ignore-scripts --silent meta -- docs onboarding` and preserves collisions while
distinguishing fresh initialization from explicit legacy migration. A delegated agent
does not initialize shared state unless the orchestrator assigned that ownership.
<!-- meta-framework-facet:v1:end tasks.startup -->
## Directory Contract

`readme/meta/` contains reusable framework policy, references, and blank schemas owned
by the immutable package. An installed client reads that material only through bounded
`npm run --ignore-scripts --silent meta -- docs TOPIC` and compiled-profile commands; it does not copy,
patch, or place mutable state under the package tree. All project facts, decisions,
commands, active work, reviews, learning, and archives remain in the project-side paths
below and never become part of the reusable package. When the project being developed
is the framework itself, its framework-development tasks and state are ordinary
project state and remain in those project-side paths.

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

## Required Data Boundary And Harness Surfaces

`framework-data/` is required package runtime, not an optional integration. It owns task
shape, deterministic serialization, bounded queries, mechanical transitions, and the
Format 1 importer. Markdown process documents retain policy and judgment. The CLI never
authenticates an agent role or establishes authority, approval truth, priority, risk, or
semantic completion.

Provider-neutral profiles and narrow provider mechanics remain package-owned. Clients
select them explicitly with
`npm run --ignore-scripts --silent meta -- agent-prompt --profile PROFILE --harness HARNESS`; no client
copy of `.codex/agents/`, `.claude/agents/`, framework skills, prompts, roles, or policy
is part of the installed contract. The only generated harness surfaces are root
`AGENTS.md` and `CLAUDE.md` bootstrap blocks. Each selects the matching harness and the
`root` profile for a primary session. A delegated assignment names exactly one of
`implementer`, `reviewer`, `qa`, or `security` and loads that non-root profile; a worker
does not infer its role or inherit root authority.

Quota and capability inspection run through normalized package commands governed by
[agent-definitions.md](agent-definitions.md#usage-capacity-guard). Provider protocol and
credential mechanics remain behind the package adapter and never surface credentials,
tokens, raw responses, account identity, or unrelated billing data to the session.
Onboarding and recovery are retrieved as bounded package documents whose policy owners
remain [onboarding.md](onboarding.md) and
[resumption-protocol.md](resumption-protocol.md).

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
- [harness-facets.md](../../prompts/harness-facets.md): the sole owner for narrow,
  rendered native-delegation mechanics.
- [prompt-extensions.md](prompt-extensions.md): the closed data-only extension package,
  lock, composition, limits, and provenance contract.
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
every project artifact only after it has useful content. The guarded initializer writes
only its versioned minimal cursor and task-entrypoint seeds; it does not materialize this
catalog or copy package policy.

## Package And Client Bootstrap

Clients declare the exact alias
`"meta-framework": "npm:@tvald/meta-framework@<version>"`, commit their lockfile, and
define exactly
`"meta": "node ./node_modules/meta-framework/bin/meta-framework.mjs"`. Use
`npm run --ignore-scripts --silent meta -- ...` for every framework command so client
`pre*` and `post*` hooks cannot wrap it; never fall back to a global binary, `npx`, a
network fetch, or an inherited executable. Install with lifecycle scripts disabled or
with an equivalently reviewed project allowlist.

The v1 initializer supports local Linux filesystems only and requires usable
`/proc/self/fd` descriptor paths for anchored transaction mutations. Other platforms,
network filesystems, or an unavailable descriptor surface fail closed before a write.

The project-initializer contract is versioned independently. From the physical client
Git root, run these argument-free v1 commands in order:

```sh
npm run --ignore-scripts --silent meta -- project --version
npm run --ignore-scripts --silent meta -- project preflight
npm run --ignore-scripts --silent meta -- project init
```

`preflight` is read-only and distinguishes `fresh`, `ready_to_initialize`,
`ready_to_add_bootstraps`, `valid_current_project`, legacy, partial, prepared, collision,
busy, malformed, and source-repository states. `init` mutates only the first three safe
dispositions and is an idempotent success for a valid current project. Every other
disposition stops without auto-merging instructions, repairing partial state, or
migrating legacy data. The framework source repository is not a client and is always
refused by this initializer.

A clean initialization creates only `AGENTS.md`, `CLAUDE.md`, `readme/README.md`,
`readme/tasks/README.md`, and an empty version-1 `readme/tasks/store/`. It creates no
provider directories and copies no package policy, prompts, roles, templates, adapters,
skills, decisions, quality records, source-project facts, settings, or caches. The two
instruction files contain one bounded harness-specific bootstrap each. Existing exact
blocks and recognized client state are preserved byte for byte; any noncanonical,
malformed, duplicate, or wrong-harness marker at an existing instruction path is a
collision, not an invitation to rewrite or create a companion file.

After initialization, follow [onboarding.md](onboarding.md): load the root profile,
create an onboarding task through the package task CLI, inventory the repository, and
record only useful client-owned knowledge. For greenfield work, record product and
technology choices as decisions rather than pretending to derive them. For an
established project, preserve existing instruction and documentation owners and resolve
reported collisions deliberately.
