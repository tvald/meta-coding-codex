# Threat Model: Client Bootstrap And Initializer

## Scope

- Change: package-owned creation of thin root harness entrypoints and minimum mutable
  client project/task state.
- Assets or data: existing client instructions and documentation, physical Git root,
  package immutability, task-store integrity, harness/profile identity, and Git recovery.
- Users, systems, or agents involved: client maintainers, Root Orchestrators, delegated
  agents, installed package runtime, Git, Codex, and Claude Code.
- Trust boundaries: package templates/runtime are immutable framework inputs; the client
  Git worktree and every pre-existing path are untrusted mutable state; harness discovery
  loads root instruction files automatically.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Wrong or nested Git root receives files | Unrelated repository is initialized or package bytes change | High | Exact alias/lock/entrypoint/Git-root validation and package digest checks | None observed |
| Existing AGENTS/CLAUDE/readme/task state is overwritten or mixed | Project authority and history are lost or silently changed | High | Exact recognized blocks/state, no-clobber claims, byte/mode/inode preservation, populated-store inventory proof | None observed |
| Symlink/hardlink/directory race redirects a write | Arbitrary file overwrite outside client root | High | Linux descriptor anchors, no-follow handles, exclusive claims, identity rechecks, outside sentinels | Pure Node has no unlink-by-inode primitive; detected loss retains recovery state |
| Crash or concurrent initializer leaves ambiguous partial state | Later session follows incomplete instructions or corrupt task ownership | Medium | Git-common lock, lock-token stage, persistent journal fd, exact-prefix recovery | Non-exact windows require explicit manual recovery rather than guessing |
| Bootstrap selects the wrong harness/profile | Session loads divergent mechanics or root authority when delegated | High | Exact harness seeds, closed profile registry, deterministic snapshots, live discovery probes | Provider discovery may change between releases |
| Bootstrap copies package policy into client | Framework/client drift and in-place editing model returns | Medium | Closed five-path inventory and explicit forbidden-copy assertions | None observed |
| Missing dependency or npm hook runs unintended code | Hostile or unintended executable runs | High | Explicit local script plus `--ignore-scripts`; missing/PATH/pre/post sentinels | A client can deliberately ignore the documented safe command |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Validate installed alias, lock, physical package, entrypoint, and client Git root before writes | T-0029 | Unrelated/nested/alias/lock/root mutations | Verified |
| Closed exact target inventory with exclusive no-clobber claims and preserve-first collisions | T-0029 | Existing file/directory/link/hardlink/partial, restrictive-umask, and populated-store matrix | Verified |
| Git-common serialization and explicit recoverable interruption state | T-0029 | Contention, rollback, killed-window, exact-prefix, and ownership-loss fixtures | Verified |
| Thin exact Codex/Claude primary and delegated profile commands only | T-0029 | Byte budgets, forbidden-policy grep, deterministic and local harness fixtures | Verified |
| Descriptor-anchored empty-store creation after recognized static client seeds | T-0029 | Doctor/startup, store ownership, fd-swap, and package/client tree digests | Verified |
| Stable bounded result and empty stdout on failure | T-0029 | Repeat, error sanitization, size, and one-write checks | Verified |

## Agentic Risks

- Untrusted instructions or prompt injection: an existing root instruction file is a
  collision, never input to automatic merging or template interpolation.
- Tool permission risk: bootstrap text selects a packaged profile but cannot expand the
  harness or parent-granted tool permissions.
- Dependency, script, or generated-code risk: initialization runs no install, lifecycle,
  provider, shell, or project command and writes only reviewed static bytes plus task data.
- Secret or sensitive-data exposure risk: templates and results exclude environment,
  account, provider, task, and arbitrary client content.
- CI/CD or deployment permission risk: initialization is local-only and does not commit,
  publish, fetch, install, or contact a provider.
- Client npm command-chain risk: all generated and documented commands use
  `--ignore-scripts`, and v1 also refuses a manifest containing `premeta` or `postmeta`.
  A client can deliberately bypass that safe invocation, but it cannot be mistaken for
  the generated framework command.

## Residual Risk

- Accepted risk: provider discovery behavior is external and versioned independently;
  local native CLI fixtures and aggregate release tests detect but cannot prevent drift.
- Accepted risk: v1 initialization supports local Linux with `/proc/self/fd`; other
  platforms and unavailable descriptor surfaces fail closed. Pure Node cannot express
  unlink-by-inode, so detected same-UID ownership loss retains the lock and journal for
  explicit recovery instead of guessing.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: overwrite, escaped or partial write, wrong-root initialization,
  package mutation, wrong profile/harness, copied policy, provider discovery drift, or
  fallback to a nonlocal executable.
