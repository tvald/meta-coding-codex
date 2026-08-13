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
4. **Optionally install reviewed Codex lifecycle mechanics.** For a trusted Codex
   project, run `project preflight --harness codex`. Accept only
   `ready_to_add_codex_integration`, `ready_to_complete_codex_integration`, or the
   idempotent `valid_current_codex_integration`, then run
   `project init --harness codex` when needed. Review `.codex/hooks.json` and all four
   `meta_` manifests before trusting the project, then approve all five hook definitions
   in the shared hook file. Confirm the running Codex release appears in `hook --version`;
   the adapter does not detect it automatically, so leave the optional integration
   disabled for an unverified version until its behavior is reviewed.
   Refuse and explicitly reconcile client-owned, stale, malformed, linked, or colliding
   targets. This step is optional; unavailable or policy-disabled hooks retain the
   portable bootstrap.
5. **Load the explicit root profile.** Start or restart the primary session through the
   applicable bootstrap. A trusted Codex integration injects `root` on `SessionStart`;
   `AGENTS.md` recognizes the matching envelope or uses the exact local fallback.
   `CLAUDE.md` selects `root` with `--harness claude`. Follow the complete emitted
   instructions, then read client-owned `readme/README.md` and
   `readme/tasks/README.md`. A delegated assignment instead names exactly one of
   `implementer`, `reviewer`, `qa`, or `security` and the worker loads only that
   non-root profile. Never infer a delegated profile or let it inherit root authority.
6. **Validate and capture onboarding work.** Run
   `npm run --ignore-scripts --silent meta -- tasks doctor` and the bounded
   `npm run --ignore-scripts --silent meta -- tasks startup` query. Capture onboarding through
   `npm run --ignore-scripts --silent meta -- tasks task add` before repository-changing inventory work.
   Only the Root Orchestrator invokes semantic task mutations.
7. **Inventory the repository.** Read client instruction files, manifests, lockfiles,
   CI and release configuration, contributor docs, source entry points, tests, recent
   commits, and working-tree state. Classify the project as greenfield or established.
8. **Derive the command catalog.** Use manifests, task runners, and CI as candidates.
   Treat every repository-defined command as arbitrary code regardless of its name;
   inspect the full invocation chain, provenance, prerequisites, and side effects before
   execution. Do not automatically install dependencies or run lifecycle, production,
   release, deployment, destructive migration, credential, privileged, networked, or
   external-action commands merely to catalog them. Record a safe local command in
   `readme/project/standards.md` only after observing exit zero; include its exact
   command, working directory, and prerequisites.
9. **Ingest context and seed useful memory.** Apply
   [knowledge-ingestion.md](knowledge-ingestion.md). Distill supplied documents and
   repository evidence; do not copy source material wholesale or elevate untrusted task
   text merely because the store is structurally valid. Create project brief, context,
   assumptions, glossary, source map, standards, decisions, or other categorized client
   records only when the inventory has real content.
10. **Resolve only material gaps.** State the inferred default and evidence first. Ask at
   most three questions in one round, limited to answers that change outcome, safety,
   architecture, or acceptance. State the safe default when no answer is required.
11. **Prove cold-start readiness.** Run `tasks doctor`, `tasks startup`,
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
- Codex integration preflight reports each target as absent, exact current, stale
  framework marked, client-owned, malformed, linked, or colliding. The installer never
  edits `.codex/config.toml`, merges an existing `hooks.json`, or replaces a same-name
  agent. Back up or commit reviewed client configuration, reconcile ownership manually,
  and rerun preflight. An interrupted exact current plus absent prefix is the only
  partial Codex state the guarded transaction may complete automatically.
- A cursor must begin `# Project State`; a task entrypoint must begin `# Task Store`.
  Preserve unrelated documents and obtain an owner decision before relocating a
  published or externally referenced contract. The initializer does not claim an
  existing path or fill one side of partial state.
- A detected legacy Format 1 store uses only the task CLI's onboarding namespace:
  `npm run --ignore-scripts --silent meta -- tasks onboarding migrate-format1
  --catalog readme/tasks/README.md [--archive PATH]... --dry-run`, followed after review
  by the same command with `--apply --expected-source-digest DIGEST`. Both modes rerun
  preflight and require exactly `legacy_format1`; the old generic `tasks migrate`
  command, `project init`, normal reads, and current structured stores cannot invoke the
  importer. Prepared or interrupted state follows the task recovery and lock protocol
  before retry.

### Format 1 Compatibility Sunset

Format 1 import is a frozen onboarding compatibility surface for
`@tvald/meta-framework` 1.x and task CLI 3.x only. Support is limited to the existing
exact header, metadata, transformations, source bounds, dry-run digest, and atomic
apply behavior; do not add fields, aliases, repair heuristics, another legacy format,
or a normal-runtime adapter.

Remove the importer in framework 2.0/task CLI 4.0 when the maintained client inventory
and migration fixtures show no remaining Format 1 consumer and the major-version
release notes retain the final 1.x migration route. A named accepted compatibility
decision is required to extend that window; absence of evidence does not extend it.
After removal, a remaining legacy repository must use the final pinned 1.x package to
migrate and verify its structured store before upgrading. Newer packages continue to
refuse legacy state rather than auto-convert it.
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
