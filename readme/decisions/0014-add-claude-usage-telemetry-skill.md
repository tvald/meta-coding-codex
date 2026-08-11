# 0014: Add A Claude Code Usage Telemetry Skill

Status: Accepted

Date: 2026-07-30

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0006](0006-guard-subagent-usage-capacity.md) and
  [Decision 0007](0007-add-codex-quota-monitor-skill.md) only where Claude Code telemetry
  acquisition was unspecified. The capacity guard previously named a Codex procedure but
  gave a Claude Code Root Orchestrator no reliable way to obtain authoritative usage.

Superseded by:

- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), implemented for quota
  acquisition by T-0032, where a package-owned child replaces the copied inline reader.
  Its credential containment, hardcoded request, complete-window, and fail-unknown
  requirements remain current.

## Context

Decision 0006 requires authoritative usage readings before and during delegated work, and
Decision 0007 gave Codex a procedure through the App Server without reading credentials.
Claude Code had no equivalent. The product owner imported a reference implementation and
asked whether it should be incorporated and whether the existing App Server path still
works.

Live evaluation on this host settled both questions. The installed `codex-cli 0.144.1`
still answers `account/rateLimits/read` over the documented handshake, so the Codex path
is current and unchanged. Claude Code's interactive `/usage` display is not readable by an
autonomous session, so automated monitoring must use the authenticated OAuth usage
surface: a single `GET https://api.anthropic.com/api/oauth/usage` with the Claude Code
access token and the `anthropic-beta: oauth-2025-04-20` header. A live read returned a
`limits[]` array plus flat `five_hour`, `seven_day`, and model-specific `seven_day_*`
windows with `utilization` and `resets_at`.

Two facts shaped the design. First, the surface returns model-scoped weekly windows
(observed a `Fable` weekly bucket) that a naive flat-key reader silently drops, which is
the "safe capacity while a per-model window is exhausted" failure mode. Second, unlike the
Codex App Server, this surface requires reading the local credential file, making this the
framework's first credential-reading integration. The product owner's controlling
requirement is that credential material must never enter the agent conversation context.

## Decision

- Add `.claude/skills/claude-quota-monitor/` as an optional Claude Code integration
  containing only `SKILL.md`.
- Require the Root Orchestrator on Claude Code to use the skill when it is installed and
  child work is planned, running, suspended, or resuming; prefer the interactive `/usage`
  display only when a human operator can read it authoritatively.
- Obtain telemetry by running one `node` subprocess that reads the credential file, calls
  the usage surface with `redirect:"error"` and an 8-second timeout, and prints only
  normalized window fields (label, group, model, `utilization`, `resets_at`, `is_active`).
- Parse the authoritative `limits[]` array first, mapping `session` to five-hour,
  `weekly` to weekly, and `monthly` to monthly, and preserving model-scoped windows. Fall
  back to the flat `five_hour`, `seven_day`, model-specific, and monthly-named keys only
  when `limits[]` is absent.
- Keep the token inside the subprocess. Never read, print, `cat`, argv, URL-embed, or
  persist the access token, refresh token, credential file, or raw response. Emit only
  hardcoded generic failure reasons; never echo caught errors or response bodies. Never
  surface `spend`, credit, dollar, account, or subscription data.
- Treat an empty window set, a non-zero exit, an expired token, or an HTTP error as
  unknown capacity. Never attempt token refresh; an expired or rejected token is unknown
  capacity that the guard resolves by pausing.
- Keep threshold, cadence, checkpoint, wait, and resume policy solely in
  `readme/meta/agent-definitions.md`; the skill owns only Claude telemetry procedure.
- Ship the skill through the additive, non-overwriting core installer by adding
  `.claude/skills/**` to the packaged trees; never overwrite a same-name host skill.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Instruction-only skill running an inline credential-scoped reader | No bundled code; keeps the core Markdown-only; token stays in the subprocess | Reads a credential file; parsing is model-driven | Accepted |
| Bundled helper script under the skill | Deterministic parsing | Adds executable code the packager forbids and the framework contract bars | Rejected |
| Copy the imported reader verbatim | Fastest | Drops model-scoped windows and echoes `error.message`, leaking credential fragments | Rejected |
| Interactive `/usage` only | No credential read | Not readable by an autonomous Root Orchestrator | Rejected as sole path |

## Consequences

Positive:

- A Claude Code Root Orchestrator can now execute Decision 0006 from a live surface.
- `limits[]` parsing captures session, weekly, model-scoped, and monthly windows,
  removing the model-scoped blind spot.
- The portable core stays Markdown-only; the skill ships through the existing installer.

Negative:

- This is the first framework surface that reads a credential file, a new trust boundary
  documented in the threat-model card.
- The `oauth/usage` endpoint and beta header are an internal surface that can change; a
  shape change degrades to unknown capacity rather than unsafe capacity.
- Correct enforcement still depends on Root-Orchestrator compliance and JSON parsing.

Neutral or follow-up:

- Extending the guard to a monthly window and tiered five-hour/weekly/monthly cutoffs is
  deferred to a separate decision; this change only acquires and normalizes the windows
  the surface advertises.
- Add a deterministic helper only after an observed parsing failure justifies the code.

## Confidence

Confidence: High

Why:

The product owner directed the HTTP-read approach and the credential-containment
requirement, a live read confirmed the surface and its model-scoped windows, an
independent security review found no Critical or High findings, and the token-absence and
malformed-credential no-leak properties were verified empirically.

## Review Trigger

Revisit when:

- Claude Code fails to discover the skill; a read misclassifies absent or malformed data;
  a cutoff is missed; the `oauth/usage` schema or beta header changes; credential handling
  changes; or a second copy of the reader appears.

## Sources

- Product-owner instruction and design selection dated 2026-07-30.
- Live read of `https://api.anthropic.com/api/oauth/usage` with `anthropic-beta:
  oauth-2025-04-20` on this host, and `codex-cli 0.144.1` App Server confirmation.
- Independent security review, 2026-07-30, and
  [threat model](../threat-models/2026-07-30-claude-quota-monitor-skill.md).
