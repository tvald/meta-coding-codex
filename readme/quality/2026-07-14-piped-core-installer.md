# Quality Record: Piped Core Installer

- Date: 2026-07-14
- Change: Replace inline installation commands with a fail-closed script usable through
  a simple curl-to-Bash pipe.
- Route: Quick change
- Risk: High, because mutable remote code and archive content write into adopter-owned
  instruction and framework paths.
- Owner or reviewer: Root Orchestrator and `piped_installer_reviewer`.

## Scope And Criteria

- User-visible outcome: One copyable command safely installs a fresh latest core from a
  destination repository root.
- In scope: Stream completeness, HTTPS download, archive/path validation, staging,
  collision behavior, bounded rollback, existing-AGENTS merge guidance, and docs.
- Non-goals: Remote execution here, update-in-place, automatic merge, core changes,
  signatures, checksums outside the moving release, or package-manager integration.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Script works directly and through a pipe | Fresh direct/piped/exact-command fixtures and ShellCheck | All three install the exact 26-file payload; no prompt reads; shell checks pass | Pass |
| Archive and destination fail closed | Hostile archive, collision, stream, and path-race fixtures | Invalid bytes, unsafe inventories, collisions, truncation, symlink-parent, and root replacement stop without escaped or partial content | Pass |
| Existing instructions and failure rollback are safe | Checksum and injected copy/link/post-link fixtures | AGENTS checksum unchanged with helper; only identity-matching installer claims are removed | Pass |
| README command and durable state agree | URL, workflow sync, links, budgets, consistency, and diff | One-line wrapper, exact embedded inventory, Decisions 0011/0012, threat/state/learning records agree | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0009 defines fresh installation and explicit update/signing non-goals |
| Architecture and project context | Yes | Decisions 0010/0011 own the unchanged core archive and release; installer is separate tooling |
| Data, security, and permissions | Yes | Decision 0012 and task threat model define pipe, remote input, path, collision, and rollback controls |
| Slices and ownership | Yes | One Root writer for the tightly coupled script/docs; read-only review follows fixtures |
| Verification and rollback | Yes | Positive, hostile-input, collision, interruption, counterfactual, and final repository checks declared |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Shell lint and direct/piped/exact-command fixtures | Bash parse and ShellCheck pass; executable, stdin stream, and documented wrapper install 26 exact entries | Pass | |
| Yes | Negative archive and expansion fixtures | Corrupt, missing, extra, traversal, newline, duplicate, symlink/special, encrypted, excessive-entry, and >10 MiB cases fail before destination content | Pass | |
| Yes | Destination, truncation, and rollback fixtures | Root/meta/helper/symlink collisions, four meaningful stream prefixes, curl status 22, injected copy/link/post-link failures, and empty-directory races pass | Pass | |
| Yes | Parent/root pathname-race fixtures | Replacing `readme` with an outside symlink writes no outside meta; renaming/replacing root preserves the replacement sentinel and cleans the original root | Pass | |
| Yes | Package/workflow inventory contract | Two package builds are byte-identical; source, zip, and installer print mode match 26 entries; Actionlint and yamllint pass | Pass | |
| Yes | Independent security/correctness/portability review | All findings below resolved; final portable implementation has no blocker | Pass | |
| Yes | Documentation, state, diff, staged security, and status | Repository links/budgets/state, whitespace, scoped staged diff, and final status pass | Pass | |

- Criteria or methods amended after implementation began, with reason and impact:
  Independent review added exact incomplete-inventory, encrypted-prompt, stream-prefix,
  parent-symlink, root-rename, and portability checks. Acceptance remained unchanged and
  the verification method became stricter.
- Counterfactual evidence for new regression or behavior tests: At clean `a68b2fb`,
  `scripts/install-core.sh` is absent and README embeds the commands instead.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | Rollback ownership | Pre-set ownership flags and pathname cleanup could remove a race-created destination | Use atomic claims, owned lock/markers, hard-link identity, and injected race fixtures | Resolved |
| High | Archive contract | A two-file allowlisted archive could pass without the complete core | Embed all 26 entries and compare installer/producer inventories in the workflow | Resolved |
| High | Parent path race | `readme` could become an outside symlink between check and meta mkdir | Run meta work in parent-checked directory-scoped transactions; add exact symlink fixture | Resolved |
| Medium | Stream completion | Curl failure was masked and a valid truncated final call could execute | Use a `pipefail` wrapper and final compound invocation; test four truncation points and status 22 | Resolved |
| Medium | Archive inflation | Encrypted input could prompt and expansion limits followed inflation | Supply an empty password noninteractively and enforce central-directory count/type/size before test/extract | Resolved |
| Medium | Root/workspace path | Physical root/work paths could redirect cleanup after a rename | Keep root, work, lock, and destination operations relative to the process CWD; add replacement-sentinel fixture | Resolved |
| Medium | Portability | Descriptor traversal fixed Linux races but `/dev/fd` directory traversal is unavailable on macOS | Replace descriptor paths with portable CWD-relative and nested directory-scoped operations | Resolved |
| Low | Collision/docs | Helper-only collision and stated prerequisites were incomplete | Reject helper independently and document Bash, Info-ZIP, mktemp, and file tools | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Install commands live in a curl-to-Bash script | README downloads and pipes `scripts/install-core.sh` through a failing-status-preserving wrapper | None |
| T-0009 and Decision 0012 | Staged fresh install with fail-closed collision and rollback | Exact archive validation, no-clobber claims, scoped meta transaction, and bounded rollback pass | None |
| Decisions 0010/0011 | Core content and latest publication behavior remain unchanged | No core file changed; build adds only producer/installer inventory synchronization; Decision 0012 supersedes only 0011's install procedure | None |
| Tests and docs | Exact command and safety behavior are executable and documented | Full local matrix, independent review, README, threat, standards, learning, catalog, and cursor agree | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No. Script, one-line documentation, and risk/state
  records are one installer outcome; core and publication are intentionally unchanged.
- If kept together, why: The command cannot be verified independently of the script it
  downloads.
- Risk not resolved by passing checks: Mutable remote code still relies on repository,
  GitHub, TLS, DNS, curl, unzip, and caller-environment integrity.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: None.
