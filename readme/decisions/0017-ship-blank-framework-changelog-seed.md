# 0017: Ship A Blank Framework Changelog Seed

Status: Accepted

Date: 2026-08-05

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0004](0004-package-framework-as-addon.md) only where it treated every file
  under `readme/meta/` as reusable policy or a blank template and left the referenced
  local framework changelog outside the package.
- [Decision 0010](0010-automate-portable-core-archive.md) only where its exact inventory
  predates the blank changelog seed.

Superseded by:

- None

## Context

The portable framework required every local framework edit to be written to
`readme/learning/framework-changelog.md`, but a clean package intentionally excludes all
project-side learning. A fresh adopter therefore received framework policy that pointed
to a missing file and no schema for preserving local evidence that might later support
an upstream backport.

A downstream project moved the log under `readme/meta/` and supplied two useful change
groups, but its imported log also carried foreign task IDs, decisions, paths, metrics,
and project history. Copying that file wholesale would violate the state-free package
boundary. Excluding it would preserve the broken reference. This source repository also
has unique upstream history in `readme/learning/framework-changelog.md` and its archive;
that history must remain available without entering release payloads.

## Decision

- Ship `readme/meta/framework-changelog.md` as an initialized blank seed in the exact
  portable archive and installer inventory.
- Treat its preamble as reusable and any appended entries as the one intentional
  host-state exception under `readme/meta/`. Entries record only local edits to that
  installed framework and remain append-only within that host.
- Never import one host's entries as another project's history. During a downstream
  backport, transfer every unique fact and piece of evidence into upstream task,
  decision, quality, or source-changelog records before restoring the upstream seed.
- Make the supported source packager and installer fail closed on a dated entry anywhere
  or any nonblank content after the seed's local-entry marker. Keep the installer and CI
  on the same exact inventory.
- Keep this upstream repository's own framework history at the excluded project-side
  `readme/learning/framework-changelog.md`, under a standing project override linked
  from the always-read cursor. Framework development is this repository's product work,
  so its tasks, decisions, quality records, and upstream history remain in project-side
  `readme/` paths. A project whose primary product is elsewhere keeps its installed-
  framework deviation log self-contained at the meta path.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Keep pointing outside the package | No new package entry | Fresh installs have a broken owner and no seed | Rejected |
| Package downstream entries wholesale | No reset step | Leaks foreign state and broken links | Rejected |
| Keep full source history at the meta path and strip it during packaging | One path in the checkout | Packaged content differs from source and a transformation bug can leak state | Rejected |
| Ship a blank meta seed and retain upstream history in an excluded source owner | Resolvable clean install, direct source/archive inspection, fail-closed leak guard | This source repository needs one explicit override | Accepted |

## Consequences

Positive:

- Fresh installs have a valid, self-describing owner for local framework changes.
- Downstream evidence can accompany backport proposals without becoming upstream facts.
- Exact-inventory and source-packaging checks prevent accidental host-history release.

Negative:

- The source repository has a documented changelog-path override that maintainers must
  preserve while portable adopters use the default meta path.
- Adding one Markdown file changes the release and installer inventories.

Neutral or follow-up:

- Existing upstream active and archived entries remain unchanged; foreign entries are
  discarded only after T-0016 records their portable dispositions and decisive evidence.
- Manual copying outside the supported packager can still copy populated local entries;
  package guidance explicitly excludes them.

## Confidence

Confidence: High

Why:

The user requested a stub and evidence-preserving backport path, the current missing-file
behavior is directly observable, the downstream log demonstrates both the value and leak
risk, and the exact producer/consumer inventory is locally testable.

## Review Trigger

Revisit this decision when:

- a populated local entry reaches a clean archive, an adopter cannot find or use the
  seed, the source override causes repeated missed audit entries, or packages gain a
  first-class state-stripping manifest that makes one physical source owner safer.

## Sources

- Product-owner instructions and imported downstream diff, 2026-08-05, including the r2
  source-versus-consumer state-location clarification.
- T-0016 brief, notes, quality record, package fixtures, and independent review.
- Decisions 0004, 0010, 0013, and 0016.
