# 0026: Adopt A Transactional Prompt Bootstrap

Status: Accepted

Date: 2026-08-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- Decision 0022 only where it allowed source-mode SessionStart to compile from the live
  worktree. Its fixed profile bindings, opt-in client integration, trust review, and
  specialist fail-closed rules remain in force.

Superseded by:

- None

## Context

The source Codex hook trusted one fixed command but that command imported the mutable
framework worktree and compiled the Root prompt again at every `startup`, `resume`,
`clear`, and `compact`. During T-0054, unfinished policy made the Root body 26,734 bytes
against a 24,576-byte compiler limit. The adapter converted `OUTPUT_LIMIT` into
`continue: false`, so automatic compaction ended the turn and later sessions repeated
the same failure. CI, pre-commit checks, and reading `HEAD` do not protect a session
from uncommitted edits or a broken checkpoint.

Codex provides a stable `session_id` to hook commands and runs SessionStart for startup,
resume, clear, and compact before the next model request. Its JSON hook protocol can add
bounded context and `continue: false` stops the operation. These semantics make both a
session pin and a non-blocking Root failure envelope necessary.

## Decision

### Adopt

Adopt a versioned prompt runtime under the resolved Git common directory at
`meta-framework/prompt-runtime/v1/`. It is operational state, not project knowledge or
task authority. The runtime contains:

- immutable content-addressed generation directories with one validated prompt per
  Codex profile and a canonical manifest binding package/compiler/schema versions,
  source identity, facet and prompt digests, byte counts, and reserve compliance;
- one small active pointer carrying generation, monotonic revision, and fresh nonce,
  advanced under an exclusive directory lock, durable temporary-file publication, and
  an exact opaque-token compare-and-swap;
- immutable session pins named by a SHA-256 digest of the bounded Codex session ID; and
- a standalone stage-zero loader copied atomically to a digest-addressed path outside
  the worktree it protects.

The generation digest uses a domain-separated canonical preimage that binds schema and
compiler versions, source identity, the closed profile/harness validation matrix, exact
Codex prompt filenames, byte counts, reserve evidence, and SHA-256 digests of the full
prompt bytes. Each embedded prompt envelope is independently recomputed using its
existing canonical-manifest/newline/body contract. Session filenames are SHA-256 of
`meta-framework-prompt-session-v1`, a NUL separator, and a valid UTF-8 session ID of at
most 256 bytes with no controls or surrogate ambiguity; raw IDs never reach paths or
diagnostics.

Candidate construction compiles every supported profile/harness combination twice and
rejects source drift between the two complete snapshots. Extension-enabled candidates
also compile the unextended core independently. The generation binds the compiled
prompt-set source digest, core and combined capacity evidence, and one exact passed
lifecycle-validation receipt. The current receipt version binds that source-set digest,
executes every Root and specialist success event, rejects wrong-source and cross-profile
events, and requires the exact Root degraded and specialist stop-before-tools authority
contracts; a missing or failing receipt prevents publication. Earlier recognized receipt
versions remain integrity-readable for existing pins and conservative cleanup, but only
the current receipt version is selectable for activation or rollback. Unknown eligibility
fails closed and requires operator reconciliation. In
addition to the compiler's hard limits, activation requires at least 1,024 bytes of
remaining core-body and total-output capacity. Candidate publication never advances the
active pointer. `activate` and `rollback` select an already published verified generation
without rebuilding it, and stale CAS, missing files, digest drift, unknown schema, or
partial state leaves the previous active generation untouched. The revision/nonce token
prevents an A→B→A rollback from making an older observation current again.

A source hook invokes the exact digest-addressed stage-zero loader in the physical
absolute Git common directory. An installed hook invokes the immutable exact-package
binary resolved from the physical client root and revalidates its package/client/lock
identity before any seed. Both trusted command wrappers buffer child stdout, suppress stderr, discard
partial output on nonzero/signal/process failure, preserve successful bytes exactly,
and emit one bounded literal Root or specialist fallback without importing repository
code. The source wrapper also verifies the loader bytes before executing them.

On a canonically absent runtime only, the installed immutable package may seed and
activate its exact package plus already validated locked-extension generation. Under a
Git-common seed lock it revalidates package/client manifest/lock identity, the frozen
extension selection, every profile/harness output, reserve evidence, and a
null/revision-zero CAS while constructing the complete runtime at a private sibling.
Only that complete active runtime is atomically published; a concurrent first hook waits
and reuses the winner without seeding again. A partial, colliding, corrupt, existing, or
crash-left private runtime never auto-repairs, seeds, or upgrades. Source mode never
auto-builds or auto-activates.

On the first event observed for a bounded session ID, the loader atomically pins the
current active generation. Startup, resume, clear, and compact then read the same pin
and verify the same prompt bytes regardless of worktree or active-pointer changes. A
first compact/resume/clear without a pin may create one as a migration path for a
session that predates installation. Pins are never repointed. A validated main-thread
`SessionEnd` event retires its exact pin; an explicit operator retirement requires the
same bounded session identity and expected generation. Missed end events leak pins
safely rather than guessing that an old live session ended. Status and cleanup report
crash-left private candidate state separately from published or active generations and
never infer that its writer died. Cleanup is inspect-only by default and never age-deletes
pins. Explicit apply may remove only inactive generations at least 90 days old with no
remaining pin; corrupt or unknown pins make cleanup fail closed.

Root load failures return `continue: true` with small `additionalContext` that says the
repository-pinned prompt was not loaded, directs the model to the exact local
`AGENTS.md` fallback, exposes only a stable sanitized reason code, and prohibits
framework continuation, activation, or external effects until Root reconciles prompt
health. Codex currently parses but does not mechanically enforce `continue: false` for
`SubagentStart`; delegated failure therefore injects an explicit stop-before-tools
context without a prompt marker, while each static `meta_` manifest independently
requires the exact matching prompt envelope before work. Specialists never inherit Root
fallback authority.

The Git-common root is repository-global across linked worktrees. Its physical parent
must not be group/other writable; runtime directories are effective-UID-owned mode
`0700`. Mutable pointer/pin/lock files are ordinary, single-link mode `0600`; immutable
generation and loader files are single-link and non-writable after publication. Reads
use bounded descriptor-anchored `O_NOFOLLOW` access with pre/post identity checks and no
symlinked path components. Writes use same-filesystem private files, file and directory
sync, and atomic rename/claim. Unsupported guarantees fail closed. A corrupt active
pointer or writer lock must not prevent an already pinned session from verifying and
reading its immutable generation. Locks are never broken implicitly by age or PID.

The source prompt is compacted at canonical facet boundaries so the active generation
meets the reserve. Detailed command-controller policy remains retrievable from its
canonical document instead of consuming every interactive Root prompt.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Compile the live worktree on every event | No operational state | Repeats the incident; unfinished edits deploy implicitly | Rejected |
| Compile committed `HEAD` | Avoids uncommitted drift | A broken checkpoint still disables startup; no session pin | Rejected |
| Validate only in CI or pre-commit | Simple | Compaction can run before either boundary | Rejected |
| Raise or truncate limits | Defers failure | Hides incomplete instructions and preserves mutable deployment | Rejected |
| Immutable generations plus active CAS and session pins | Stable sessions, atomic rollout, direct rollback | Adds bounded operational state and maintenance commands | Adopted |

## Consequences

Positive:

- Prompt edits become inactive candidates rather than implicit deployments.
- Existing sessions remain byte-stable through compaction and active-generation changes.
- Root can recover through exact repository instructions even when the prompt runtime is
  absent or corrupt.
- Rollback and diagnostics operate on verified digests without recompiling candidate
  source.

Negative:

- Source maintainers must install the stage-zero loader, build, inspect, and explicitly
  activate a candidate after prompt changes.
- Git-common operational files require conservative permissions, retention, and recovery.
- Changing stage-zero code changes the content-addressed hook command and therefore
  requires normal Codex hook trust review.

Neutral or follow-up:

- The task store remains unchanged and does not record session pins or prompt activation.
- A clean source clone starts safely through `AGENTS.md` until its prompt runtime is
  initialized; this is degraded operation, not framework authorization.
- Linked worktrees intentionally share one active generation and session-pin namespace.

## Confidence

Confidence: High

Why: the design removes the exact circular dependency, uses established immutable-file
and compare-and-swap patterns already present in the package, and maps directly to the
observed Codex lifecycle and session fields.

## Review Trigger

Revisit this decision when:

- Codex changes SessionStart session identity or continuation semantics;
- the package supports a non-local or non-Git-common operational runtime;
- measured prompt growth makes the 1,024-byte reserve insufficient; or
- a supported platform cannot provide the required atomic create/rename and ordinary-file
  checks.

## Sources

- [Official Codex hooks reference](https://learn.chatgpt.com/docs/hooks)
- Cached 2026-08-14 Codex session transcript under `/cache/.codex/sessions/`
- T-0055 task brief and the existing prompt compiler, hook adapter, and Codex integration
  contracts
