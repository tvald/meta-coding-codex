# 0015: Tiered Per-Window Usage Capacity Cutoffs

Status: Accepted

Date: 2026-07-30

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0006](0006-guard-subagent-usage-capacity.md) where it set a single 95% cutoff
  for only the five-hour and weekly windows. This closes the monthly-and-tiered-cutoff
  item deferred in [Decision 0014](0014-add-claude-usage-telemetry-skill.md).

Superseded by:

- None

## Context

The capacity guard read only the five-hour and weekly windows and paused any child work at
a flat 95%. The shipped quota skills now surface more than that: the Claude skill parses
monthly and model-scoped weekly windows and treats a model-scoped window as binding, and
the Codex skill reads model-specific buckets. So the shipped policy owner was narrower than
its own shipped telemetry, and an orchestrator following the guard literally could ignore a
model-scoped or monthly window near its limit.

A flat 95% is also wasteful on long windows. The cutoff exists only to keep from
accidentally crossing a hard provider limit, which terminates the primary orchestrator
session; it is not a reserve of unused capacity. The safe margin is only as large as what
one reading interval can consume, and the guard already reads before every spawn or resume
and at least every five minutes. A five-hour window resets soon, so pausing at 95% is
cheap. A weekly or monthly window holds far more absolute capacity and resets much later,
so a 5% reserve discards a large amount of usable quota for no safety benefit.

## Decision

- Generalize the guard to read and threshold every advertised window: five-hour, weekly,
  each model-scoped window, and monthly when present.
- Apply cutoffs that rise with window length: pause at 95% for the five-hour window, 98%
  for weekly windows including any model-scoped weekly, and 99% for monthly.
- A model-scoped or provider-named window takes the cutoff of its duration group. A real
  provider limit error is a 100% reading, and a failed, malformed, or unknown required
  reading is treated the same as being at cutoff.
- Apply each window's cutoff independently; if any advertised window is at or above its
  cutoff, start or resume no child and checkpoint active children.
- Record per-window consumed percentages and reset times rather than only two fixed
  windows. Keep threshold policy solely in `readme/meta/agent-definitions.md`; the skills
  own only telemetry.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Tiered 95/98/99 by duration group | Recovers large weekly/monthly capacity; scales the margin to reset distance | Two more numbers to hold | Accepted |
| Keep a flat 95% on all windows | One number | Discards large usable weekly/monthly quota for no added safety | Rejected |
| Dynamic margin from measured per-interval burn | Tightest possible | Needs burn-rate tracking the guard deliberately avoids | Rejected |

## Consequences

Positive:

- Weekly and monthly quota is usable to near its limit while a hard-limit hit that would
  terminate the orchestrator is still avoided.
- The guard now matches the windows its shipped skills already report, so a fresh install
  is internally consistent.

Negative:

- A window whose per-interval burn exceeds its 1–2% margin between readings could still
  cross the limit; the five-minute cadence, pre-spawn reads, and 100%-error stop bound it.
- Two additional cutoff values must be applied correctly per window.

Neutral or follow-up:

- Revisit the specific percentages if an accidental limit crossing occurs or if provider
  reset cadences change materially.

## Confidence

Confidence: High

Why:

The product owner directed tiered cutoffs and their rationale, the margin reasoning
follows from the guard's existing reading cadence, and live readings confirmed the window
shapes the skills report.

## Review Trigger

Revisit when:

- A child accidentally crosses a hard limit despite the guard; a window's per-interval
  burn is shown to exceed its margin; or a provider adds a window class the tiers do not
  cover.

## Sources

- Product-owner instruction dated 2026-07-30.
- Live usage readings on this host and the shipped `claude-quota-monitor` and
  `codex-quota-monitor` window semantics.
