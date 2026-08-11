# 0020: Adopt A Guarded Task-Recovery Skill

Status: Accepted

Date: 2026-08-11

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- None

## Context

Interruption recovery repeatedly crosses the structured task store, delivered guidance,
Git state, worker state, approval boundaries, required verification, external effects,
and usage capacity. Small inference errors can repeat a consequential effect, overwrite
unknown work, revive stale output, or falsely report completion. The accepted task-data
CLI supplies bounded integrity and task queries, while the resumption, delegation,
quality, and automation documents remain the semantic owners.

Codex and Claude Code discover repository skills at different paths. Duplicating the
workflow would invite drift, while adding another parser or state-writing wrapper would
compete with the required CLI boundary.

## Decision

- Adopt one instruction-only `task-recovery` skill for explicit interruption, restart,
  approval, verification, worker, quota, and targeted redirect recovery.
- Keep the maintained body in `.agents/skills/task-recovery/SKILL.md`, Codex UI metadata
  beside it, and a thin `.claude/skills/task-recovery/SKILL.md` link. Package the three
  files as one same-name cross-harness installer collision bundle.
- Keep the skill proposal-only. It may gather and revalidate read-only evidence, but it
  does not select or mutate tasks, continue or retry execution, resume or replace a
  worker, integrate output, perform external effects, or claim semantic completion.
- Resolve only an explicit task ID or the unique bounded `primaryTask`. Run `doctor`,
  bounded startup, targeted task/context/ancestor queries, and bounded Git evidence;
  load worker, approval, quality, and capacity owners only when that path applies.
- Return exactly one finite disposition: `continue`, `retry_proven_safe`, `verify`,
  `wait_approval`, `wait_capacity`, `resume_worker`, `propose_replacement`, `redirect`,
  `reconcile`, `paused`, or `terminal_noop`, with the evidence and exact next action.
- Treat missing receipts, ambiguous ownership, stale revisions, incomplete approvals,
  missing required checks, silent workers, and uncertain external effects as stop or
  reconciliation conditions. Never repeat an uncertain effect or silently reassign
  work.
- Revalidate immediately before returning because durable, Git, worker, and provider
  observations are not atomic. A semantic task-revision change invalidates old output;
  record-only or unrelated store changes require reclassification but do not alone make
  targeted output stale.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| One maintained skill plus thin provider discovery | Discoverable and minimal drift; reuses bounded owners | Harness evidence remains non-atomic | Accepted |
| Duplicate full provider skills | Each provider is self-contained | Recovery rules can diverge | Rejected |
| New recovery CLI or wrapper script | Could mechanically sequence more steps | Duplicates the store runtime and embeds judgment in code | Rejected |
| Documentation only | No discovery or package surface | Repeated recovery ordering remains easy to omit | Rejected |
| Automatic recovery executor | Faster continuation | Unsafe around uncertain effects, authority, and ownership | Rejected |

## Consequences

Positive:

- Recovery starts from bounded authoritative state and makes conflicts, freshness, and
  prohibited retries explicit.
- A stable result vocabulary gives agents and tests a consistent recovery contract.
- Provider discovery shares one maintained workflow without adding executable runtime.

Negative:

- The Root still evaluates and performs the proposed next action in a separate step.
- Non-atomic live evidence can require repeated reconciliation even when no semantic
  task change occurred.

Residual:

- Local evidence cannot prove an unrecorded remote effect did or did not occur.
- Harness worker and process APIs may be incomplete after restart.
- Same-user noncooperative path replacement remains outside the cooperative installer
  boundary.

## Confidence

Confidence: High for bounded repository recovery and conservative stop behavior in the
tested Linux, Git, Node, Codex, and Claude discovery boundary.

## Review Trigger

Revisit after a duplicated effect, overwritten or misattributed work, stale-output use,
false completion, unbounded recovery context, provider discovery change, or repeated
safe recoveries that demonstrate a deterministic helper is warranted.

## Sources

- Product-owner promotion of T-0017 and T-0018 findings on 2026-08-11.
- T-0022 independent design and security reviews and fresh-agent forward tests.
- [Resumption protocol](../meta/resumption-protocol.md),
  [structured-store decision](0018-adopt-node-structured-task-store.md),
  [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills), and
  [Anthropic Extend Claude with skills](https://code.claude.com/docs/en/skills).
