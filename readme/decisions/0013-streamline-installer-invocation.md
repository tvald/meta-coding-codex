# 0013: Streamline The Installer Invocation

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- The public pipe invocation and stream-completion mechanism in
  [Decision 0012](0012-add-fail-closed-piped-installer.md); its archive, collision,
  transaction, and rollback controls remain current.

Superseded by:

- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), which retires the
  public curl-to-shell invocation and replaces copied-core installation with an exact
  locked npm dependency.

## Context

Decision 0012 used an outer `bash -o pipefail -c` wrapper so a zero-byte curl failure
remained nonzero. The product owner prefers the familiar, copyable
`curl -fsSL URL | bash` convention used by mainstream developer tools.

A default shell pipeline reports the final Bash process, so a downloaded program cannot
propagate curl's independent status. A script can still make every incomplete stream
fail and remain inert after its first guard compound has loaded.

## Decision

- Make `curl -fsSL <fixed HTTPS raw URL> | bash` the primary README command.
- Reset the completion sentinel and install an EXIT guard together in the first
  executable compound statement. Set the sentinel true only inside the final compound
  invocation, so inherited environment cannot authorize a prefix and incomplete
  streams return nonzero once the guard has loaded.
- Document the unavoidable upstream-status limitation and retain the existing success
  message. Users needing strict curl status or immutable review download the script
  first or enable pipefail themselves.
- Do not change archive download hardening, exact inventory synchronization, staging,
  collision behavior, directory-scoped transaction, rollback, or package boundaries.

## Consequences

Positive:

- Installation uses the conventional one-line command users immediately recognize.
- Truncations after the first guard compound are diagnosed without an outer wrapper.

Negative:

- A curl failure is not represented in the default pipeline status. Depending on the
  bytes delivered, Bash may do nothing, reject a guarded prefix, or install from the
  complete script while curl separately reports failure.
- The public curl invocation uses the caller's curl configuration; the installer's
  separate archive download continues to disable curl configuration and restrict HTTPS.

## Confidence

Confidence: High for complete and guarded truncated streams after local fixtures;
Medium for user interpretation of the documented upstream-status limitation.

## Review Trigger

Revisit when the command hides a real installation failure, the raw endpoint can supply
a status-preserving launcher without extra ceremony, or users prefer strict failure
propagation over the conventional command shape.
