# Project Onboarding

Run this procedure when the immutable framework dependency first enters a client
repository, and repeat the inventory stages only when a major repository change makes
recorded context unreliable. The Root Orchestrator owns onboarding and every semantic
task mutation.

## Clean Installed-Client Procedure

1. **Verify the local package boundary.** Work only at the physical root of an
   initialized Git repository with Node.js 22 or newer. The client manifest must declare
   an exact `meta-framework` alias, a committed lockfile, and exactly
   `"meta": "node ./node_modules/meta-framework/bin/meta-framework.mjs"`, with no
   `premeta` or `postmeta` script. Run
   `npm run --ignore-scripts --silent meta -- project --version`. The lifecycle-suppression
   flag prevents client `pre*` and `post*` hooks from wrapping the binary. If the
   checked-in local command is unavailable or incompatible, stop; do not substitute a
   global binary, `npx`, a network fetch, or package-internal path.
2. **Preflight without mutation.** Run
   `npm run --ignore-scripts --silent meta -- project preflight` and accept only exit-zero,
   well-formed JSON with a known disposition. The safe initialization dispositions are `fresh`,
   `ready_to_initialize`, and `ready_to_add_bootstraps`; `valid_current_project` is an
   idempotent no-op. Legacy, partial, prepared, collision, busy, malformed, unsafe, and
   source-repository states require the specific resolution below. Never reinterpret an
   unknown disposition or substitute a parser.
3. **Initialize the minimal client footprint.** Run
   `npm run --ignore-scripts --silent meta -- project init` with no flags or positionals.
   The guarded operation creates only harness bootstraps, the bounded project cursor, the static
   task entrypoint, and an empty version-1 task store. It copies no package-owned policy,
   prompts, roles, templates, adapters, skills, decisions, quality records, provider
   settings, caches, or source-project facts. Preserve the success envelope as current
   session evidence; a repeat must report `already_initialized` without changing bytes.
4. **Load the explicit root profile.** Start or restart the primary session through the
   applicable generated bootstrap. `AGENTS.md` selects `root` with `--harness codex`;
   `CLAUDE.md` selects `root` with `--harness claude`. Follow the complete emitted
   instructions, then read client-owned `readme/README.md` and
   `readme/tasks/README.md`. A delegated assignment instead names exactly one of
   `implementer`, `reviewer`, `qa`, or `security` and the worker loads only that
   non-root profile. Never infer a delegated profile or let it inherit root authority.
5. **Validate and capture onboarding work.** Run
   `npm run --ignore-scripts --silent meta -- tasks doctor` and the bounded
   `npm run --ignore-scripts --silent meta -- tasks startup` query. Capture onboarding through
   `npm run --ignore-scripts --silent meta -- tasks task add` before repository-changing inventory work.
   Only the Root Orchestrator invokes semantic task mutations.
6. **Inventory the repository.** Read client instruction files, manifests, lockfiles,
   CI and release configuration, contributor docs, source entry points, tests, recent
   commits, and working-tree state. Classify the project as greenfield or established.
7. **Derive the command catalog.** Use manifests, task runners, and CI as candidates.
   Treat every repository-defined command as arbitrary code regardless of its name;
   inspect the full invocation chain, provenance, prerequisites, and side effects before
   execution. Do not automatically install dependencies or run lifecycle, production,
   release, deployment, destructive migration, credential, privileged, networked, or
   external-action commands merely to catalog them. Record a safe local command in
   `readme/project/standards.md` only after observing exit zero; include its exact
   command, working directory, and prerequisites.
8. **Ingest context and seed useful memory.** Apply
   [knowledge-ingestion.md](knowledge-ingestion.md). Distill supplied documents and
   repository evidence; do not copy source material wholesale or elevate untrusted task
   text merely because the store is structurally valid. Create project brief, context,
   assumptions, glossary, source map, standards, decisions, or other categorized client
   records only when the inventory has real content.
9. **Resolve only material gaps.** State the inferred default and evidence first. Ask at
   most three questions in one round, limited to answers that change outcome, safety,
   architecture, or acceptance. State the safe default when no answer is required.
10. **Prove cold-start readiness.** Run `tasks doctor`, `tasks startup`,
    `tasks task candidates`, and a targeted `tasks task context` through
    `npm run --ignore-scripts --silent meta --`. Confirm a new agent can recover the product outcome,
    primary and eligible tasks, dependency/gate state, next action, commands,
    constraints, and approvals without loading full history or asking for
    repository-recoverable facts.

## Refused Preflight Dispositions

- For an existing `AGENTS.md` or `CLAUDE.md`, the initializer recognizes only one exact,
  line-bounded block for the matching harness. It preserves a recognized file byte for
  byte. A missing canonical block in an existing file, or any malformed, duplicate, or
  wrong-harness marker, is `bootstrap_collision`; do not overwrite it, auto-merge it, or
  create a companion instruction file. Reconcile established instruction ownership
  deliberately, then rerun preflight.
- A cursor must begin `# Project State`; a task entrypoint must begin `# Task Store`.
  Preserve unrelated documents and obtain an owner decision before relocating a
  published or externally referenced contract. The initializer does not claim an
  existing path or fill one side of partial state.
- A detected legacy Format 1 store uses the task CLI's explicit migration dry run,
  reviewed source hashes and transformations, and expected-digest apply path. Never
  migrate through `project init` or a normal read. Prepared or interrupted state follows
  the task recovery and lock protocol before retry.
- A busy store remains unchanged until the known live owner finishes. Inspect and
  recover a stale lock only through the exact-token task CLI protocol after establishing
  that no owner is live. Never infer owner death from age, PID, or host.
- A client containing a pre-npm copied framework loads
  `npm run --ignore-scripts --silent meta -- docs copied-client-transition`. That
  guidance requires a reviewed snapshot, per-file provenance and whole-byte matches, a
  dry run, and a recoverable boundary. It supplies no cleanup executable. Never infer
  ownership from a path, name, directory, mode, digest, or matching bytes alone; never
  recursively remove a copied tree. Modified, unproved, linked, mixed-version, or
  same-named client content stops for maintainer review.
- `source_repository` is final for this initializer. Framework-source sessions use the
  source root instructions and repository-pinned development CLI; they do not initialize
  the source repository as a client.

## Greenfield And Established Variants

For greenfield work, record product and technology choices as decisions rather than
pretending to derive them. There may be no commands or conventions to catalog; add one
only after its tool exists and it has run successfully.

For an established project, treat code, tests, and working CI as evidence of current
behavior, not automatically desired behavior. Preserve established instructions and
documentation owners. Resolve every preflight collision explicitly before initialization
and link established canonical owners from the appropriate client records.
