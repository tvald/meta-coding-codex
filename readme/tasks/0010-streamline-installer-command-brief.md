# Task Brief: Streamline Installer Command

## Identity And Source

- Task ID: T-0010
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: Make the installation instruction as streamlined as the
  conventional `curl -fsSL URL | bash` form, 2026-07-14.
- Parent or split task IDs: T-0009

## Goal

Let adopters copy a familiar, minimal curl-to-Bash command while retaining the
installer's fail-closed destination and archive behavior.

## Scope

In scope:

- Replace the README's outer Bash `pipefail` wrapper with a direct curl-to-Bash pipe.
- Add a script-owned completion guard for truncated streams after the guard loads.
- Reconcile the installer decision, threat model, verified command catalog, quality
  evidence, task state, changelog, and project cursor.

Out of scope:

- Changing the core archive, release workflow, archive validation, destination
  semantics, hosted release state, or executing the real remote installer.

## Acceptance Criteria

- [x] The primary README command is exactly the familiar `curl -fsSL URL | bash` shape.
- [x] A complete direct pipe installs the same exact 26-file core as T-0009.
- [x] Non-empty truncated script prefixes that load the guard return nonzero and never
      mutate the destination; failures before the guard loads and independent upstream
      curl status remain documented shell pipeline limitations.
- [x] Existing archive, collision, merge, rollback, and core/state boundaries remain
      unchanged and their focused regression checks pass.
- [x] Bash/ShellCheck, workflow schema, documentation, diff, independent security
      review, staged inspection, commit, and clean-status checks pass.

## Constraints And Risk

- Route and risk: Quick change / High.
- The user explicitly prefers conventional command ergonomics, but a default shell
  pipeline reports only the final Bash process. The script can detect an incomplete
  stream after its first guard compound loads; it cannot propagate curl's status.
- Keep installer tooling and task state outside the portable archive.
- Do not weaken archive or destination validation to shorten the public command.

## Verification Plan

- Positive: direct script, direct pipe, exact README command structure, existing AGENTS,
  and 26-entry inventory fixtures.
- Negative: failing curl with empty, too-short, and complete output; guarded truncation
  points; inherited-sentinel attempt; corrupt archive; collision; and rollback fixtures.
- Static: Bash parse, ShellCheck, Actionlint, yamllint, links, budgets, diff, staged
  security/scope inspection, and clean post-commit status.
- Counterfactual: `71655c4` retains the outer `bash -o pipefail -c` wrapper and has no
  stream-completion sentinel.

## Done When

The streamlined command is accurate, its unavoidable upstream-status limitation and
replacement guard are reviewed, every runnable check passes, state is current, and the
task closes in a clean local commit.
