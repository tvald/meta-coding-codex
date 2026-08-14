# AI Coding Meta-Framework

This directory is the self-contained policy entrypoint for an immutable npm framework
package that gives coding agents an operating loop, durable project memory, risk-scaled
quality gates, and explicit autonomy boundaries. Policy remains Markdown; the required
task data boundary uses dependency-free Node.js 22+ and Git. Optional declarative source
harness adapters may expose selected roles without becoming framework policy.

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
onboarding-only Format 1 importer during its declared compatibility window. Markdown
process documents retain policy and judgment. The CLI never
authenticates an agent role or establishes authority, approval truth, priority, risk, or
semantic completion.

Provider-neutral profiles and narrow provider mechanics remain package-owned. Clients
select them explicitly with
`npm run --ignore-scripts --silent meta -- agent-prompt --profile PROFILE --harness HARNESS`.
The optional accepted Codex integration instead runs the package-owned
`meta hook --harness codex --profile PROFILE` adapter from one project hook file and
four thin project custom-agent manifests. These files contain mechanics, exact
`agent_type` matchers, and a static prompt-envelope guard, not semantic role policy. A
delegated assignment names exactly one of `implementer`, `reviewer`, `qa`, or `security`,
maps it to the exact corresponding `meta_` custom agent, and never infers a role or
inherits root authority.

Source-repository discovery bundles under `.agents/`, `.codex/`, and `.claude/` support
maintainers in this checkout and remain excluded from the npm tarball. Installed clients
may opt into byte-equivalent package templates only through guarded
`project preflight/init --harness codex`; no provider directory is copied wholesale.
Installed agents receive semantics through canonical facets and compiled profiles.

Quota and capability inspection run through normalized package commands governed by
[agent-definitions.md](agent-definitions.md#usage-capacity-guard). Provider protocol and
credential mechanics remain behind the package adapter and never surface credentials,
tokens, raw responses, account identity, or unrelated billing data to the session.
Onboarding and recovery are retrieved as bounded package documents whose policy owners
remain [onboarding.md](onboarding.md) and
[resumption-protocol.md](resumption-protocol.md).

The optional autonomous implementation phase starts only at the explicit local
`meta implement TASK --expected-task-revision N --harness HARNESS` boundary described by
[the root loop](root-loop.md#command-launched-implementation-phase). Its deterministic
supervisor owns an operational ledger in the Git common directory while the task store
retains task authority. Fresh bounded model jobs emit proposals; a single trusted writer
owns effects. The initial package exposes effect-free shadow/read surfaces and keeps all
live effects fail-closed behind exact activation evidence.

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
- Repeated failures improve the system, with every source-framework edit auditable and
  every installed-package fix delivered by version replacement.

## Process Map

- [root-loop.md](root-loop.md): additive intake, selection, and operating loop for every
  task.
- [workflow-routing.md](workflow-routing.md): single route table and escalation triggers.
- [onboarding.md](onboarding.md): cold-start inventory, command derivation, ingestion,
  state initialization, and cold-start proof.
- [copied-client-transition.md](copied-client-transition.md): conservative one-time
  retirement of provenance-proven pre-npm copies without touching client-owned state.
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

The current initializer supports local Linux filesystems only and requires usable
`/proc/self/fd` descriptor paths for anchored transaction mutations. Other platforms,
network filesystems, or an unavailable descriptor surface fail closed before a write.

The project-initializer contract is versioned independently. From the physical client
Git root, run these argument-free portable commands in order:

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

After that portable state is current, a maintainer may opt into trusted-project Codex
prompt injection:

```sh
npm run --ignore-scripts --silent meta -- project preflight --harness codex
npm run --ignore-scripts --silent meta -- project init --harness codex
```

This mode owns only `.codex/hooks.json` and the exact `meta_implementer`,
`meta_reviewer`, `meta_qa`, and `meta_security` agent manifests. It preserves unrelated
Codex configuration and refuses client-owned, stale, malformed, linked, and colliding
targets without overwrite or merge. Exact current files are preserved, and an
exact-plus-absent interrupted prefix may be completed through the same anchored
transaction. Hook-disabled, untrusted, managed-only, and operator-disabled unverified
versions use the `AGENTS.md` fallback; a delegated manifest with missing or mismatched
injected context stops before tool work. Codex trusts each lifecycle definition
independently even though they share one `hooks.json`. Every custom-agent layer disables its own multi-agent
tools as a mechanical nested-delegation boundary. Source and installed-client hooks use
a buffered trusted wrapper from any repository subdirectory. Source hooks verify and
invoke a digest-addressed standalone loader in the physical Git-common prompt runtime;
installed hooks invoke the exact local package binary and may seed only a canonically
absent runtime. They never dispatch through a mutable client npm script or compile the
live source worktree during a lifecycle event. Review the Root SessionStart, four
SubagentStart, and SessionEnd definitions; a loader digest change receives normal hook
trust review.
The adapter does not detect the running Codex version: versions absent from
`hook --version` are unverified and require explicit review or operator disablement to
use the fallback.

Source maintainers publish prompt changes transactionally:

```sh
npm run --ignore-scripts --silent meta -- prompt-runtime build
npm run --ignore-scripts --silent meta -- prompt-runtime install-bootstrap
npm run --ignore-scripts --silent meta -- prompt-runtime status
npm run --ignore-scripts --silent meta -- prompt-runtime activate GENERATION --expected-active TOKEN
```

Candidate build requires two byte-stable profile/harness compilations, independent core
reserve evidence for extensions, and a digest-bound passed lifecycle receipt before it
publishes an inactive content-addressed generation. Activation and rollback require the
exact opaque token returned by `status`. SessionStart pins startup/resume/clear/compact
to one generation; validated SessionEnd retires the pin. Status reports crash-left
private candidates without treating them as published generations. `prompt-runtime
cleanup` is inspect-only, while `cleanup --apply` can remove only inactive, unreferenced
generations at least 90 days old. Missing end events intentionally leak pins rather than
guessing that a resumable session ended. See
[Decision 0026](../decisions/0026-adopt-transactional-prompt-bootstrap.md).

After initialization, follow [onboarding.md](onboarding.md): load the root profile,
create an onboarding task through the package task CLI, inventory the repository, and
record only useful client-owned knowledge. For greenfield work, record product and
technology choices as decisions rather than pretending to derive them. For an
established project, preserve existing instruction and documentation owners and resolve
reported collisions deliberately.

Clients update or roll back by replacing the exact alias and lockfile together and
reinstalling with lifecycle scripts disabled. They never patch package bytes, maintain a
client framework changelog, or reconcile one package version into another. A client
that still contains a reviewed pre-npm copy uses
[copied-client-transition.md](copied-client-transition.md); ambiguous or modified paths
remain client-owned until a maintainer resolves them. Framework defects are reported
upstream and accepted fixes arrive in a new immutable package version.
