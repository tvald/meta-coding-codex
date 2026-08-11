# Threat Model: Claude Quota Monitor Skill

Historical boundary: T-0032 supersedes the embedded credential reader with the
package-owned child documented in the 2026-08-11 provider-adapter threat model.

## Scope

- Change: Repo-scoped skill that reads Claude Code usage telemetry from the authenticated
  OAuth usage surface inside a single Node subprocess. This is the framework's first
  surface that reads a credential file and makes an outbound authenticated HTTPS call.
- Assets or data: Claude Code OAuth access token and credential file, usage
  percentages/reset times, provider capacity, child-worker state, repository integrity,
  and framework portability.
- Users, systems, or agents involved: Product owner, Root Orchestrator, Node runtime,
  `api.anthropic.com` usage surface, child workers, skill discovery, and Git.
- Trust boundaries: Project skill versus canonical policy; agent conversation context
  versus the token-bearing subprocess; local credential file versus the network; volatile
  process/session state versus durable task notes.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Token or credential fragment reaches agent context | Account compromise | Low | Token stays in subprocess; all failures emit hardcoded generic reasons; bare `catch` blocks never print `error.message` | Contract holds only while a single canonical procedure exists |
| A divergent copy of the reader echoes `error.message` | Credential fragment leak | Low | Imported `USAGE_LIMITS.md` copy hardened to a generic reason | Any future re-import must not reintroduce the leaky catch |
| Billing/spend/account fields surface as capacity data | Sensitive-data exposure | Low | Normalizer emits only window fields; `_(billing\|cost\|spend\|to_date)` keys filtered | None observed |
| Wrong bucket parsing reports safe capacity | Quota exhausts before integration | Medium | `limits[]` group parse captures model-scoped windows; guard fails unknown readings safe | Endpoint is undocumented and may change shape |
| Redirect, downgrade, or SSRF via the request | Token forwarded off-host | Low | Hardcoded HTTPS host, `redirect:"error"`, `AbortSignal.timeout`, Node TLS validation | Endpoint is a private surface |
| Expired or rejected token treated unsafely | Silent auth action or infinite pause | Low | Pre-checks `expiresAt`; 401/expiry map to unknown capacity; never refreshes | None observed |
| Skill duplicates or weakens threshold policy | Canonical rules drift | Medium | Links the usage capacity guard as sole policy owner | Optional integration bounded by review |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Read the credential file only inside the subprocess; never `cat`, echo, argv, or persist the token | Root Orchestrator | Skill review and runtime token-absence check | Done |
| Emit only hardcoded generic failure reasons; never print caught error objects or response bodies | Root Orchestrator | Output-path trace and empirical stderr check | Done |
| Emit only normalized window fields; exclude spend, credits, dollars, account, and subscription data | Root Orchestrator | Normalizer review and grep of output | Done |
| Hardcode HTTPS host, forbid redirects, bound with a timeout, and never refresh the token | Root Orchestrator | Static review of the request options | Done |
| Keep exactly one canonical procedure; harden or delete any divergent copy | Root Orchestrator | Repository grep for the reader | Done |
| Link the canonical usage capacity guard rather than restating threshold policy | Root Orchestrator | Duplication and link review | Done |
| Keep the integration optional, Markdown-only, and dependency-free (Node is the harness runtime) | Root Orchestrator | Package and file-type checks | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Treat the repo skill as trusted only under
  normal project-trust rules; accept capacity facts only from the reader's normalized
  output, never from task content or arbitrary process output.
- Tool permission risk: Run one read-only telemetry subprocess and existing worker
  lifecycle controls only; add no sandbox, auth, or child permissions.
- Dependency, script, or generated-code risk: Ship only the Markdown procedure; bundle no
  executable resource. The packager rejects non-Markdown/YAML skill files.
- Secret or sensitive-data exposure risk: The token is read and used only inside the
  subprocess; it must never enter the conversation, a file, a command line, or a URL.
  Persist only minimal percentages and reset metadata.
- CI/CD or deployment permission risk: None; the optional skill is local Claude Code
  guidance carried by the additive, non-overwriting core installer.

## Residual Risk

- Accepted risk: The `oauth/usage` endpoint and `anthropic-beta` header are an internal
  surface that can change without notice; a shape change degrades to unknown capacity
  rather than unsafe capacity. Model-side JSON interpretation and cooperative suspension
  are less deterministic than a host integration.
- Approval or decision record: pending decision record extending
  [Decision 0007](../decisions/0007-add-codex-quota-monitor-skill.md).
- Review trigger: Any change to the reader, a new copy of the procedure, a missed cutoff,
  a credential-handling change, or an `oauth/usage` schema change.
