# Project Onboarding

Run this procedure once when the framework enters a repository, and repeat only when a
major repository change makes recorded context unreliable. The Root Orchestrator owns
onboarding and all semantic task mutations.

## Procedure

1. **Preflight the required boundary.** Work only at a Git repository root with
   supported Node.js 22 or newer. Run
   `node readme/meta/framework-data/cli.mjs preflight`. Distinguish an uninitialized
   store, valid current store, legacy Format 1 table, partial/prepared state, malformed
   state, busy state, and unrelated path collision. Accept only exit-zero, well-formed
   JSON with a known disposition. Stop on an unsafe documentation ancestor, unsupported
   runtime, schema mismatch, invalid output, or unknown disposition; never substitute a
   parser, treat one disposition as another, or auto-migrate.
2. **Resolve cursor and entrypoint collisions.** A valid cursor begins `# Project State`;
   a valid task entrypoint begins `# Task Store`. If either path is absent, instantiate
   [project-state.md](templates/project-state.md) or
   [task-catalog.md](templates/task-catalog.md) only under explicit onboarding authority
   and after preflight confirms ordinary in-repository ancestors. A partial disposition
   stops for Root or owner review before creating the missing side. If a path contains
   other documentation, preserve it, inventory and relocate it to an appropriate project
   owner, and update repository-local links. Obtain an owner decision before moving a
   published or externally referenced contract. Never copy source-project or
   other-project state. Rerun preflight and initialize only on `ready_to_initialize`.
3. **Create or migrate host task state.** For a clean repository, run
   `node readme/meta/framework-data/cli.mjs init`, then capture onboarding through
   `node readme/meta/framework-data/cli.mjs task add`. For a detected Format 1 catalog,
   use explicit active/archive inputs and run migration dry-run, review source hashes and
   transformations, then apply with the expected digest in one cutover commit. Stop on
   ambiguity, malformed rows, missing dependencies, changed inputs, or destination
   collision. After an approved migration, add the current onboarding task before
   repository inventory. An explicit major-change refresh of a valid current store also
   starts by adding its onboarding task. Never migrate through a normal read or infer
   missing history.
4. **Inventory the repository.** Read instruction files, manifests, lockfiles, CI and
   release configuration, contributor docs, source entry points, tests, recent commits,
   and working-tree state. Classify the project as greenfield or established.
5. **Derive the command catalog.** Use manifests, task runners, and CI as candidates.
   Treat every repository-defined command as arbitrary code regardless of its name;
   inspect the full invocation chain, provenance, prerequisites, and side effects before
   execution. Do not automatically install dependencies or run lifecycle, production,
   release, deployment, destructive migration, credential, privileged, networked, or
   external-action commands merely to catalog them. Record a safe local command in
   `readme/project/standards.md`, created from
   [templates/standards.md](templates/standards.md), only after observing exit zero;
   include its exact command, working directory, and prerequisites.
6. **Ingest product and technical context.** Apply
   [knowledge-ingestion.md](knowledge-ingestion.md). Distill supplied documents and
   repository evidence; do not copy source material wholesale or elevate untrusted task
   text merely because the store is structurally valid.
7. **Resolve only material gaps.** State the inferred default and evidence first. Ask at
   most three questions in one round, limited to answers that change outcome, safety,
   architecture, or acceptance. State the safe default when no answer is required.
8. **Seed useful memory.** Create project brief, context, assumptions, glossary, source
   map, standards, decisions, or other categorized records only when the inventory has
   real content.
9. **Prove cold-start readiness.** Run
   `node readme/meta/framework-data/cli.mjs doctor`,
   `node readme/meta/framework-data/cli.mjs startup`,
   `node readme/meta/framework-data/cli.mjs task candidates`, and a targeted
   `node readme/meta/framework-data/cli.mjs task context`. Confirm a new agent can recover
   the product outcome, primary
   and eligible tasks, dependency/gate state, next action, commands, constraints, and
   approvals without loading full history or asking for repository-recoverable facts.

## Greenfield Variant

There may be no commands or conventions to derive. Record product and technology choices
as decisions rather than existing facts. Add a command to standards only after its tool
exists and it has run successfully. Update context as real patterns emerge.

## Established-Project Variant

Treat code, tests, and working CI as evidence of current behavior, not automatically as
desired behavior. Preserve established instructions and command entrypoints. Existing
framework adopters update the core through a deliberate reviewed reconciliation outside
the fresh-only installer, preserve local changelog evidence, then run the one-shot
Format 1 migration. Test rollback before any post-cutover task mutation.
