# Prompt Bootstrap Activation Threat Model

## Scope

- Change: Content-addressed prompt generations, source stage-zero loader, active CAS,
  session pins, degraded Root fallback, rollback, and cleanup.
- Assets or data: Developer instruction bytes, exact role/profile bindings, task and
  approval boundaries, active generation identity, session-to-generation binding, and
  sanitized operational diagnostics.
- Users, systems, or agents involved: Framework maintainers, Codex Root sessions,
  delegated specialists, installed clients, Git common storage, and the package CLI.
- Trust boundaries: Mutable worktree to operational runtime; hook command to stage-zero
  loader; untrusted Codex event JSON to session-pin paths; candidate compiler to active
  pointer; Root fallback to specialist authority; package source to installed client.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Loader imports mutable worktree code | Candidate can disable the session protecting it | High | Fixed hook command | Command trust does not authenticate transitive mutable bytes |
| Session ID becomes a path or log injection | Arbitrary file access or sensitive diagnostics | Medium | Bounded hook input | Requires hash-only filenames, strict value bounds, and sanitized codes |
| Bundle or pointer is symlinked, replaced, or partially written | Wrong instructions or global startup failure | Medium | Git-common ownership | Requires ordinary-file/no-follow checks, content digests, durable rename, and fail-safe reads |
| Concurrent or A→B→A activation satisfies a stale precheck | Unexpected active generation | Medium | None | Requires exclusive lock plus exact revision/nonce/generation CAS inside the lock |
| Root fallback is interpreted as normal Root authority | Work continues without canonical profile | High | Local `AGENTS.md` exists | Degraded context must prohibit continuation/effects until reconciliation |
| Specialist receives Root fallback or wrong profile | Privilege/role confusion | High | Exact matcher and static manifest guard | Failure context must say stop before tools; exact prompt envelope/generation/profile/event remain required because SubagentStart `continue:false` is not mechanically blocking |
| Cleanup guesses an old live session ended | Later compact/resume silently repins | Medium | None | SessionEnd/exact retirement only; missed events leak pins; no age-only pin deletion |
| Diagnostic exposes paths, prompt contents, or session identity | Repository or user data disclosure | Low | Generic current failure | Stable reason allowlist and no raw exception/event/path output |
| Malicious candidate exploits automatic activation | Persistent instruction compromise | Medium | Prompt compiler validation | Mutable source must never auto-activate; activation targets exact published digest |
| Candidate sources drift or lifecycle validation fails during build | Mixed or known-bad instructions become selectable | Medium | Full matrix compilation | Requires a repeated byte-stable snapshot and digest-bound passed receipt before publication |
| Installed lazy seed repairs or upgrades partial state | Unreviewed prompt becomes active | Medium | Immutable package | Seed only canonically absent state under null/revision-zero CAS after package/lock/extension revalidation |
| Crash-left private candidate is hidden as if no build occurred | Recovery confuses construction with activation | Low | Content-addressed final generations | Status and cleanup must report private state separately and never infer writer death |
| Child writes partial stdout before failure | Mixed prompt plus fallback reaches model | Medium | Bounded output | Trusted wrapper must buffer, suppress stderr, discard failure output, and emit one literal envelope |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Standalone digest-addressed loader outside source worktree | Implementer / Root | Break live compiler and show pinned hook still serves bytes | Implemented |
| Canonical bounded manifests and prompt SHA-256 verification on every read | Implementer | Corruption and unknown-schema tests | Implemented |
| Hash-only bounded session pins with atomic create-if-absent | Implementer | Hostile ID and concurrent-pin tests | Implemented |
| Activation lock, durable rename, and revision/nonce/generation CAS | Implementer | Concurrency, ABA, stale CAS, and publication-cut tests | Implemented |
| Root-only `continue: true` degraded envelope with stable codes | Root | Missing loader, invalid event, and corrupt store tests | Implemented |
| Specialist stop-only failure context plus static exact-envelope manifest guard | Root / Security | Exact matcher, absent-marker, wrong-profile, and no-tool failure matrix | Implemented |
| Reserve of 1,024 core-body and output bytes | Root / QA | Near-limit counterfactual and all-profile build | Implemented |
| Repeated stable source snapshot and digest-bound lifecycle receipt | Root / QA | Source-drift and test-failure publication negatives | Implemented |
| SessionEnd/exact pin retirement; no age deletion; dry-run cleanup after 90-day generation minimum; direct rollback | Root / QA | Missed-end leak, reference-race, corruption, age-boundary, and rollback tests | Implemented |
| Installed package auto-seed limited to immutable exact package bytes | Root / Security | Concurrent installed-client and partial-state fixtures | Implemented |
| UID/mode/no-follow/identity checks and durable same-filesystem publication | Implementer / Security | Symlink, hardlink, replacement, permission, and publication-cut tests | Implemented |
| Domain-separated generation and session preimages with closed inventories | Implementer / Security | Recomputed digest, hostile ID, collision, and inventory tests | Implemented |
| Buffered source/installed command wrappers with literal fallbacks | Root / Security | Partial stdout, signal, missing binary/loader, hostile path, and byte-exact success tests | Implemented |

## Agentic Risks

- Untrusted instructions or prompt injection: Candidate prompt content is untrusted until
  compilation, full matrix validation, publication, and explicit activation. Prompt text
  cannot mint activation or task authority.
- Tool permission risk: Root degraded mode withholds framework work and external effects;
  delegated profiles stop before tools when their exact prompt is unavailable.
- Dependency, script, or generated-code risk: Source hooks do not invoke mutable npm scripts;
  stage-zero bytes are copied from a reviewed package file to a digest-addressed operational
  path and a digest change requires hook trust review.
- Secret or sensitive-data exposure risk: Operational manifests contain digests, versions,
  byte counts, stable reason codes, and hashed session identities only. Raw event data,
  account data, prompt contents in diagnostics, and absolute paths are excluded.
- CI/CD or deployment permission risk: Build publishes an inactive local candidate only.
  Activation and rollback remain explicit local commands and grant no release, push, or
  external authority.

## Residual Risk

- Accepted risk: Local processes with the same OS identity and write access to Git common
  storage can still corrupt operational state. The loader detects corruption and Root
  degrades safely; the framework does not claim protection from a fully compromised host.
- Conservative migration state: A recovered session can remain pinned to a pre-receipt
  generation until exact retirement. It remains readable by the stage-zero loader but is
  non-selectable, and cleanup fails closed until the unknown eligibility is reconciled.
- Approval or decision record: Decision 0026 and the direct T-0055 user instruction.
- Review trigger: Codex hook schema/continuation changes, new multi-user storage, non-local
  filesystems, new specialist roles, or any proposal to auto-activate mutable candidates.
