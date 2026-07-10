# Project Onboarding

Run this procedure once when the framework enters a repository, and repeat only when a
major repository change makes the recorded context unreliable. The Root Orchestrator
owns onboarding and records the result in [state.md](state.md).

## Procedure

1. **Inventory the repository.** Read instruction files, manifests, lockfiles, CI and
   release configuration, contributor docs, source entry points, tests, recent commits,
   and current working-tree state. Classify the project as greenfield or established.
2. **Derive the command catalog.** Use manifests, task runners, and CI as candidates.
   Execute each safe local setup, run, and verification candidate in the current
   environment and record only observed successes in `readme/standards.md`, created from
   [templates/standards.md](templates/standards.md). Do not exercise production,
   release, destructive migration, or external-action commands merely to catalog them;
   those need their established approval path and evidence. Include prerequisites and
   the verification date. Link to the catalog elsewhere.
3. **Ingest product and technical context.** Apply the source-trust rules in
   [knowledge-ingestion.md](knowledge-ingestion.md). Distill supplied documents and
   current repository evidence; do not copy source material wholesale.
4. **Resolve only material gaps.** First state the inferred default and its evidence.
   Ask at most three questions in one onboarding round, limited to answers that change
   the product outcome, safety boundary, architecture, or acceptance criteria. State
   what default will be used if the owner does not answer.
5. **Seed useful memory.** Initialize [state.md](state.md). Create `project-brief.md`,
   `project-context.md`, assumptions, glossary, source map, standards, or a decision
   record only when the inventory produced real content for them.
6. **Prove cold-start readiness.** From the recorded files, confirm that a new agent can
   identify the product outcome, current focus, next safe action, canonical commands,
   important constraints, and any parked approvals without asking the owner to repeat
   repository-recoverable facts.

## Greenfield Variant

For a greenfield repository, there may be no commands or conventions to derive. Record
product and technology choices as decisions instead of presenting guesses as existing
facts. Add a command to `readme/standards.md` only after its underlying tool exists and
the command has run successfully. Update project context as implementation establishes
real patterns.

## Established-Project Variant

Treat code, tests, and working CI as evidence of current behavior, not automatically as
desired behavior. Record compatibility constraints and conflicts between docs and code.
Do not replace established instruction files or command entry points; make
`readme/standards.md` the catalog that points to the exact verified invocation.
