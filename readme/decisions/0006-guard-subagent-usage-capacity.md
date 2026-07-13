# 0006: Guard Subagent Usage Capacity

Status: Accepted

Date: 2026-07-13

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- None

## Context

The framework permits up to three child workers and can recover them after an
interruption, but it does not monitor the provider's five-hour or weekly usage windows.
Workers can therefore consume the last available capacity and leave the root unable to
integrate, verify, or record their results. The product owner directly instructed the
framework to suspend subagents at 95% consumption and resume after the applicable limit
resets.

The portable core is Markdown-only and provider-independent. It cannot manufacture a
usage endpoint, install a daemon, or guarantee that a volatile timer survives a harness
restart. The rule must use native capabilities conservatively and keep paused state
recoverable from the repository.

## Decision

- Adopt a Root-Orchestrator capacity guard whenever child workers are planned, active,
  or quota-suspended.
- Read authoritative five-hour and weekly consumption before child spawn or resume,
  after each child result, and at least every five minutes while any child is active.
- At 95% or greater consumption in either window, start or resume no children. Ask
  active workers to checkpoint and suspend at a safe boundary, preserve minimal usage
  and worker state in the active task note, and stop nonessential work.
- Treat unavailable required telemetry as unknown capacity and apply the same delegation
  pause. This preserves capacity without making the product owner a manual meter.
- Prefer one wake-up timer for the latest reset when every limiting window supplies an
  authoritative reset time and the harness offers a reliable wait. Otherwise poll
  authoritative usage every five minutes.
- Treat timer and poll events only as wake-ups. Resume workers only after a fresh reading
  shows both windows below 95%. Reuse suspended handles where possible and otherwise
  follow worker recovery.
- Keep a capacity wait nonterminal. It is not Done, Needs verification, or Blocked, and
  it does not require user intervention unless the harness lacks both telemetry and a
  way to wait across sessions.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Timer only | Low polling overhead and prompt at a known reset | Volatile timers can be lost; reset time can be absent or stale | Rejected as sole mechanism |
| Poll only | Works without a reset timestamp and verifies state | Repeated wake-ups add overhead | Rejected as default when a reliable timer exists |
| Reset timer with fresh-read verification and polling fallback | Efficient, capability-aware, and safe across both windows | Requires explicit checkpoint and two code paths | Accepted |
| Add a provider-specific daemon | Could monitor outside the agent session | Violates the portable Markdown-only core and adds credentials/dependencies | Rejected |

## Consequences

Positive:

- Delegated work preserves capacity for root integration and verification.
- Long quota waits recover without product-owner babysitting.
- Missing telemetry and overlapping windows fail safe instead of relying on estimates.

Negative:

- A missing usage surface prevents delegation even when capacity may remain.
- Five-minute fallback polling can resume shortly after rather than exactly at reset.
- Harnesses without durable waiting need repository state plus a later session resume.

Neutral or follow-up:

- The rule changes worker lifecycle policy, not provider limits or billing behavior.
- No timer is scheduled when no child work is active or no capacity wait exists.

## Confidence

Confidence: High

Why:

The threshold and desired unattended behavior are a direct durable user instruction.
The hybrid wait is reversible, uses native capabilities only, verifies rather than
assumes reset, and has a conservative fallback for missing telemetry.

## Review Trigger

Revisit this decision when:

- A worker crosses the cutoff before suspension, resumes while either window remains
  limited, loses checkpointed output, or stays paused materially longer than a reset.
- A supported harness changes its usage or wait capabilities, or five-minute polling
  measurably consumes scarce capacity.

## Sources

- Product-owner instruction dated 2026-07-13.
- [Agent definitions](../meta/agent-definitions.md#usage-capacity-guard).
