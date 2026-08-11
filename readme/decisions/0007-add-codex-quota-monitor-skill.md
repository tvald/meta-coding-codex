# 0007: Add A Codex Quota Monitor Skill

Status: Accepted

Date: 2026-07-13

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0006](0006-guard-subagent-usage-capacity.md) only where a successful
  authoritative response that omits a five-hour or weekly window could be treated as
  unavailable telemetry and where Codex telemetry acquisition was unspecified.

Superseded by:

- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), implemented for quota
  acquisition by T-0032, where the immutable package command replaces the copied skill
  procedure and uses one initialized App Server child/full read per stateless invocation.
  Its fail-closed window semantics and prohibition on account mutations remain current.

## Context

Decision 0006 requires authoritative five-hour and weekly quota readings before and
during delegated work, but the portable framework cannot itself name a provider API.
The initial implementation therefore described correct policy without giving Codex a
reliable procedure for obtaining the data.

Current official Codex documentation exposes ChatGPT quota windows through initialized
Codex App Server JSONL: `account/rateLimits/read` returns bucketed `usedPercent`,
`windowDurationMins`, and `resetsAt`, while `account/rateLimits/updated` reports changes.
A live read with the installed `codex-cli 0.144.1` confirmed this path and also showed
that a valid account response can omit a five-hour window. Absence in a successful
response is therefore different from an RPC, authentication, or schema failure.

The product owner selected the smallest integration: a repo-scoped skill with no helper
script. Codex skills can hold reusable instructions and UI metadata while the installed
`codex` executable supplies App Server and authentication.

## Decision

- Add `.agents/skills/codex-quota-monitor/` as an optional Codex integration containing
  only `SKILL.md` and `agents/openai.yaml`.
- Require the Root Orchestrator to use the skill when it is installed and Codex child
  work is planned, running, suspended, or resuming.
- Keep one task-scoped `codex app-server --listen stdio://` connection, perform the
  documented initialize/initialized handshake, use `account/rateLimits/read` for full
  readings, and handle `account/rateLimits/updated` as an early update signal.
- Inspect every returned generic or model-specific bucket. Treat 300-minute windows as
  five-hour and 10,080-minute windows as weekly.
- Treat a successfully omitted or null window as not advertised and not applicable to
  that reading. Treat RPC/authentication failure, invalid JSON, missing result, or an
  applicable window without finite `usedPercent` as unknown capacity. A missing reset
  time uses polling rather than invalidating a known current percentage.
- Never read credentials or private endpoints, use activity summaries as quota data,
  call account mutations, persist raw responses, or consume reset credits.
- Keep threshold, cadence, checkpoint, wait, suspension, and resumption policy solely in
  `readme/meta/agent-definitions.md`; the skill owns only Codex telemetry procedure.
- Add no script, runtime package, daemon, hook, MCP server, plugin, model pin, or
  permission expansion. Package the skill only for destinations using Codex subagents.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Instruction-only repo skill | No new runtime dependency; discoverable; directly uses supported App Server | Cooperative parsing and process lifecycle | Accepted |
| Skill with Node helper | Deterministic parsing | Adds a runtime dependency before evidence requires it | Deferred |
| Persistent daemon or hook | Stronger continuous enforcement | Machine lifecycle, permissions, cleanup, and portability cost | Rejected |
| MCP or plugin wrapper | Structured reusable tool and distribution | Much larger integration surface for one local RPC | Rejected |

## Consequences

Positive:

- Codex can now execute Decision 0006 using a supported, locally validated surface.
- The portable core remains Markdown-only and dependency-free.
- Valid plan differences no longer disable delegation merely because one fixed window is
  absent.

Negative:

- Correct enforcement still depends on Root-Orchestrator compliance and JSON
  interpretation.
- App Server schema or skill discovery changes require revalidation.
- A task-scoped child App Server process must be cleaned up.

Neutral or follow-up:

- Add a deterministic helper only after an observed parsing or lifecycle failure.
- The skill is not evidence for or part of the three-role agent-adapter pilot.

## Confidence

Confidence: High

Why:

The product owner directly selected this design, official documentation covers both the
skill surface and App Server messages, and the installed client returned live telemetry
through the documented handshake.

## Review Trigger

Revisit when:

- Codex fails to discover the skill; a read misclassifies absent or malformed data; a
  cutoff is missed; a process is orphaned; App Server changes its schema; or two real
  tasks show that instruction-only parsing is unreliable.

## Sources

- Product-owner instruction and design selection dated 2026-07-13.
- OpenAI, "Skills," checked 2026-07-13:
  https://learn.chatgpt.com/docs/customization/overview#skills
- OpenAI, "Codex App Server," checked 2026-07-13:
  https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt
