# 0012: Add A Fail-Closed Piped Core Installer

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- The installation procedure in
  [Decision 0011](0011-publish-moving-latest-core-release.md); its publication behavior
  remains current.

Superseded by:

- [Decision 0013](0013-streamline-installer-invocation.md), for the public pipe
  invocation and stream-completion mechanism only; archive and destination behavior
  remain current.
- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), for the remaining
  curl, archive, fresh-copy, collision-bundle, and installer transaction contract.

## Context

Decision 0011 documents a safe but lengthy inline install block. The product owner now
wants those commands in a script usable through a simple `curl` pipe to Bash. In that
mode the shell owns standard input, streamed content can truncate, and both executable
code and its archive are mutable remote inputs writing into an adopter's repository.

## Decision

- Add `scripts/install-core.sh` as distribution tooling outside the portable core zip
  and mutable project documentation.
- Document a fixed HTTPS raw-project URL piped to Bash inside a Bash `pipefail` wrapper.
  Keep all installer work inside a function invoked by a final compound group, so no
  syntactically valid truncated prefix can begin installation and an empty curl failure
  remains nonzero.
- Download the fixed `latest` release asset with curl configuration disabled and HTTPS
  enforced. Check required tools, transfer and expansion limits, archive integrity,
  duplicate/path allowlists, regular-file entry metadata, and the extracted tree before
  destination mutation.
- Embed the exact portable inventory and expose a non-installing print mode so the
  existing release build fails before publication when producer and installer drift.
- Treat this as a fresh-core installer: refuse filesystem root, symbolic parent paths,
  any existing `readme/meta`, and any existing `AGENTS.framework.md`. Preserve an
  existing `AGENTS.md` and install the portable instruction as `AGENTS.framework.md` for
  manual merging.
- Do not read interactive input. Keep root operations relative to the shell's current
  directory, perform the complete meta claim/copy/verification/rollback transaction in
  nested directory-scoped subshells, and recheck parent identity plus an owned
  cooperative lock before writes. Use no-clobber claims and remove only
  identity-matching installer-created paths if later work fails or is interrupted.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Keep multiline README commands | No streamed program | Does not meet requested one-line workflow | Rejected |
| Pipe a script that unzips directly into the destination | Short | Pipe stdin conflicts with prompts; partial writes and collision ambiguity | Rejected |
| Stage, validate, preflight, and fail closed | No blind overwrite or interactive input; testable rollback | Refuses in-place framework updates | Accepted |
| Add installer to the portable zip | Self-contained after download | Cannot bootstrap downloading that zip and makes runtime tooling part of core | Rejected |

## Consequences

Positive:

- Installation becomes one copyable command while retaining the existing instruction
  merge boundary.
- Archive defects and known collisions stop before destination changes.
- The installer remains separable from both reusable framework policy and host state.

Negative:

- `curl | bash` trusts mutable code at the documented project URL with the caller's
  permissions; users who require pinning must inspect or download the script first.
- Existing framework installations require deliberate manual update handling.
- Multi-path installation is not atomic, so correctness depends on directory-scoped,
  identity-checked bounded rollback.

Neutral or follow-up:

- The script requires no elevated privileges and does not modify remote systems.
- The installer lock coordinates installer invocations, not arbitrary same-user
  processes; adopters must not concurrently rename or replace destination paths.
- Signing or immutable version installers remain future, separately authorized work.

## Confidence

Confidence: High after local streamed, collision, hostile-archive, and rollback fixtures;
Medium for external availability until the commit is pushed and served by GitHub.

Why:

The design reduces the streamed surface to a reviewed Bash file, stages all
remote data, and refuses ambiguous destination states instead of automating merges.

## Review Trigger

Revisit when a truncated stream mutates files, an archive escapes staging, rollback
removes pre-existing data, a destination collision is overwritten, the raw URL changes,
or adopters need a signed, immutable, or update-capable installer.
