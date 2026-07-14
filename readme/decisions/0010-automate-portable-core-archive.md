# 0010: Automate The Portable Core Archive

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- None

## Context

Decision 0004 defines a state-free add-on boundary, and Decisions 0008 and 0009 keep
host task state and project-local delegation authority outside it. Maintainers have
still assembled that package manually. Repeating the boundary by hand can omit startup
guidance, copy repository state, or produce archives whose contents and permissions
depend on the operator's checkout.

The product owner requested one shell command that creates a zip containing everything
needed to add the framework to another repository. Packaging automation is repository
tooling, not reusable framework policy, so putting the script inside the archive would
blur the same core/state separation it is intended to enforce.

## Decision

- Add `scripts/package-core.sh` as a POSIX-shell packaging command outside the portable
  core. Its default output is `dist/ai-coding-meta-framework-core.zip`, and one custom
  `.zip` output path is allowed.
- Define the archive by a narrow allowlist: the complete Markdown-only `readme/meta/`
  tree and a generated root `AGENTS.md` containing only the startup prefix before this
  repository's `## Operating Contract` boundary.
- Exclude mutable project documentation, optional harness adapters and skills,
  project-local delegation authority, packaging/release automation, and generated host
  records.
- Validate source structure, tools, output type, archive integrity, and exact inventory.
  Reject symbolic-link sources, symbolic-link/directory destinations, traversal
  segments, and physical output locations under the core.
- Normalize staged directory modes to 0755, packaged file modes to 0644, timestamps to a
  fixed UTC value, entry order to the C locale, inherited Info-ZIP option variables to
  absent, and zip metadata with Info-ZIP's `-X` option. Build in a validated trailing-`X`
  sibling work directory and replace the output only after validation.
- Ignore generated `dist/` archives and do not commit a built zip. The repository source
  plus packaging command remains the canonical distribution input.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Continue manual selection | No executable tooling | Boundary and reproducibility rely on each operator | Rejected |
| Package the entire repository | Simplest command | Leaks state, integrations, history, and local authority | Rejected |
| Put a self-packaging script inside the core | Adopters receive the build tool | Makes automation part of a Markdown-only runtime core without an adopter need | Rejected |
| Generate an exact normalized archive from an external script | Mechanical boundary, safe output, reproducible artifact | Requires Info-ZIP `zip` and `unzip` | Accepted |
| Commit the generated archive | Direct repository download | Binary drift and duplicate source of truth | Rejected |

## Consequences

Positive:

- Maintainers can build and verify the supported package with one command.
- The executable boundary prevents host state and local authority from entering the
  archive silently.
- Content-identical checkouts produce byte-identical archives with the same Info-ZIP
  implementation, independent of source mtimes and modes.

Negative:

- Builders need external `zip` and `unzip` commands.
- The `AGENTS.md` split depends on one explicit heading boundary in the host file.
- Cross-implementation compression output is not guaranteed to be byte-identical.

Neutral or follow-up:

- Installation still requires deliberate merging when a destination already has
  `AGENTS.md`; the packaging command never edits another repository.
- Release publication is a separate T-0008 change with its own credential and
  concurrency review.

## Confidence

Confidence: High

Why:

The allowlist follows three accepted boundary decisions, and positive, negative,
cross-checkout, extraction, collision, and link fixtures exercise the built artifact.

## Review Trigger

Revisit when:

- the core gains a non-Markdown file, the root operating-contract marker changes, a
  destination needs bundled installation logic, archive output differs for identical
  content under the supported toolchain, or host state/authority enters a release.

## Sources

- Product-owner packaging instruction dated 2026-07-14.
- [Decision 0004](0004-package-framework-as-addon.md),
  [Decision 0008](0008-adopt-durable-task-orchestration.md), and
  [Decision 0009](0009-authorize-bounded-project-delegation.md).
- T-0006 state-free package evidence and T-0007 archive verification.
