# Task Brief: Piped Core Installer

## Identity And Source

- Task ID: T-0009
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: Put the documented install commands in a script that can
  be executed through a simple `curl` pipe to Bash, 2026-07-14.
- Parent or split task IDs: None

## Goal

Let an adopter install the latest portable core from a destination repository root with
one copyable `curl ... | bash` command while preserving project-owned instructions and
failing before destination changes when the archive or destination is unsafe.

## Background

T-0008 documented a multiline inline shell block. Streaming a script makes installation
easier, but Bash owns the pipe's standard input, so the installer cannot safely depend
on interactive `unzip` prompts. The downloaded program and archive are also moving
remote inputs that cross into adopter-owned files.

## Scope

In scope:

- An executable repository script outside the portable core archive.
- A fixed HTTPS latest-archive download, integrity/inventory validation, temporary
  extraction, collision preflight, rollback of installer-created paths, and concise
  completion guidance.
- A top-level README one-line `curl`-to-Bash command and collision explanation.
- Task-specific decision, quality, threat, command, learning, catalog, and cursor state.

Out of scope:

- Adding the installer to the portable core zip or changing core policy.
- Updating an existing `readme/meta`, automatically merging instruction files, signing,
  checksums hosted outside the moving release, package managers, or executing a real
  remote install in this session.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework adopter | Run one command from a project root | Latest core is staged, validated, and installed without replacing host instructions |

## Acceptance Criteria

- [x] `scripts/install-core.sh` works both as an executable and when its bytes are piped
      to Bash, without reading interactive input.
- [x] The installer downloads the fixed latest-release zip over HTTPS, validates the
      archive and allowlisted inventory, and extracts only to temporary staging first.
- [x] Existing `AGENTS.md` remains unchanged and receives `AGENTS.framework.md` for a
      manual merge; existing helper or `readme/meta` paths abort before installation.
- [x] Failure after destination mutation rolls back only paths created by the installer.
- [x] The README replaces the inline block with a simple copyable pipe command and
      accurately describes collision behavior and the mutable remote-code trust boundary.
- [x] Shell lint, direct/piped install fixtures, truncation/collision/corrupt/archive
      boundary checks, docs, diff, security review, and staged checks pass.

## Constraints

- Preserve the T-0007 package inventory and T-0008 release URL/publication behavior;
  add only a build-time producer/installer inventory synchronization check.
- Keep project state, installer tooling, and local authority outside the portable core.
- Do not silently replace any adopter-owned instruction or installed core path.

## Workflow Route Rationale

- Cataloged route and risk: Quick change / High.
- Why this route: One installer and its documentation are clear, contained, and locally
  testable.
- Why this risk gate: `curl | bash` executes mutable remote code that writes into another
  repository, creating code-origin, archive, path traversal, collision, and partial-write
  trust boundaries.
- Upstream artifacts required: T-0007 package contract, T-0008 release behavior,
  Decisions 0010 and 0011, and the existing install fixtures.
- Escalation trigger: Safe behavior requires overwriting destination files, elevated
  privileges, a non-HTTPS source, a new dependency, or a change to the core inventory.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stream truncates or outer curl fails | Partial program mutates destination or failure looks successful | Parse a final compound invocation and wrap the documented pipe with Bash `pipefail` |
| Archive contains traversal, duplicate, or special entries | Files escape staging or replace unexpected paths | Validate inventory, extract only to staging, then verify regular-file tree |
| Existing framework or instructions are replaced | Host policy or installation becomes mixed | Fail on existing meta/helper and preserve AGENTS through a merge file |
| Installation fails after its first durable claim | Destination is left partially installed | Atomically claim paths under an owned lock and roll back only identity-matching claims |
| Remote moving script is compromised | Arbitrary code runs with the caller's permissions | Use fixed project HTTPS URL, document trust, require no privilege, and retain review triggers |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| The command runs from the intended destination root | High | State prominently in README and refuse filesystem root |
| Bash, curl, Info-ZIP unzip, and common POSIX file tools are available | High | Explicit command checks and tested failure messages |

## Verification Plan

- Automated checks: ShellCheck; fresh direct and piped installs; existing AGENTS,
  helper, meta, symlink, corrupt, duplicate, traversal, special-entry, rollback,
  root/readme path-race, and truncated-stream fixtures; exact URL/inventory assertions;
  links, budgets, and diff.
- Manual checks: Review pipe semantics, temporary extraction, path trust, rollback,
  quoting, dependency checks, README accuracy, and core/state separation.
- Documentation checks: Decision 0012, threat/quality records, standards, task state,
  changelog, retrospective, and cursor/catalog agree.
- Baseline or counterfactual evidence for new regression/behavior tests: Clean
  `a68b2fb` has no installer script and requires executing the README's multiline block.

## Material Amendments

- Independent review strengthened the declared race matrix to cover replacement of an
  existing `readme/` parent and the physical project path. Acceptance remained the same;
  current-directory-relative root paths and directory-scoped meta transactions made the
  rollback criterion testable under those races without a Linux-only descriptor path.

## Done When

The one-line command is backed by a reviewed fail-closed script, every locally runnable
required check passes, durable state is current, and a separate local commit is clean.
