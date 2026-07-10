# 0003: Address The Framework Critique

Status: Accepted

Date: 2026-07-10

Owners:

- Root Orchestrator acting on the user's request to judge and address every concern in
  the supplied framework critique

Supersedes:

- The prior implicit choice in [Decision 0001](0001-import-selected-alternative-framework-practices.md)
  not to require a project-wide state file.
- The numeric framework-judge lifecycle and dedicated meta-roles formerly defined by
  `framework-improvement.md` and `agent-definitions.md`.

Superseded by:

- None

## Context

An end-to-end external review praised the framework's security posture, research
provenance, judge calibration, principled guidance, and anti-ceremony intent. It also
identified thirteen gaps: cold-start continuity, non-durable retrospectives, overlapping
taxonomies, template duplication, unenforced hygiene, an overbuilt judge lifecycle, a
verification escape hatch, thin approval mechanics, command ownership, weak onboarding,
parallel integration gaps, repeated rules, and smaller naming/reference drift.

The review is accepted evidence at level 4 under the revised improvement process because
the user explicitly requested a disposition and the findings are concrete against the
full repository. Acceptance as evidence does not require literal adoption when a
recommendation would weaken safety or assume a worker topology the framework does not
control.

## Decision

### Concern Dispositions

| # | Disposition | Decision And Rationale |
| ---: | --- | --- |
| 1 | Adopt | Add mandatory, always-read `readme/state.md` with one current focus, next action, parked approvals, relevant dead ends, recent outcomes, task-note pointers, and an 80-line hard cap. Read at every session start and refresh at task close. Cold-start discoverability justifies the small recurring diff. |
| 2 | Adopt | Add append-only `readme/retrospectives.md`. Search active and archived entries before appending; a repeat invokes the improvement lifecycle. Entries record what happened, the gap, and change/follow-up, with tags and prior links. |
| 3 | Adopt with modification | Replace work modes, scale paths, and lifecycle phases with one provisional six-route table. Retain Low/Medium/High/Critical solely as an independent safety overlay because task shape cannot determine impact: a one-line permission or deletion change can be Critical. Roles remain optional techniques, not classifications. |
| 4 | Adopt | State one-home-per-fact as a first-class rule. Reduce 19 templates to 10; remove embedded assumptions/glossary/source tables from the project brief; merge workflow status into task notes; consolidate readiness, acceptance, checks, review, and consistency into one quality record. Minimal glossary/source schemas live with knowledge management and do not require their own templates. |
| 5 | Adopt | Assign artifact line/entry budgets, overflow/archive rules, and owners. Run a Root-Orchestrator hygiene pass after 10 repository-changing tasks or 30 days, whichever comes first; store its cursor in state. Hard limits apply to `AGENTS.md` and state, with defaults elsewhere. |
| 6 | Adopt | Remove the 0–100 score, thresholds, dedicated Judge/Maintainer roles, and their templates. Retain hard rejects, evidence ladder, bias calibration, Adopt/Pilot/Revise/Reject, and pilot terms. Log every framework edit; review pilots and sunsets during scheduled hygiene. Significant choices still require decisions and focused review. |
| 7 | Adopt | Done now requires all required runnable checks to pass. A failed check keeps work open; a genuinely impossible required check produces Needs verification with the exact check, reason, and unblock condition. Residual risk supplements passing evidence and never substitutes for it. |
| 8 | Adopt with safety exception | Add state-backed parked approvals, make a gate block only its dependent action, and standardize a decision-ready request in ten lines or fewer. Expanding standing authority is itself gated and cannot retroactively authorize an action. Reject the proposed exhaustive-list/blanket-standing-approval rule: an unforeseen irreversible, harmful, or external action must not become authorized merely because a markdown list omitted it. Standing approval is explicitly bounded to safe, reversible, in-scope work. |
| 9 | Adopt | Make `readme/standards.md` the sole command catalog. Onboarding reads manifests, task runners, CI, and docs; executes safe local candidates; and records only successful commands with prerequisites, observed result, and date. Other files link instead of copying. Production or destructive commands retain their approval paths. |
| 10 | Adopt | Add a first-class onboarding procedure: inventory, established/greenfield classification, command derivation, trusted ingestion, one defaults-first clarification round of at most three questions, useful artifact/state seeding, and a cold-start proof. Greenfield choices are decided, then commands are recorded only after runnable. |
| 11 | Adopt with portability modification | Add a default three-child WIP cap, single-writer shared knowledge, integration sequencing, affected checks after each integration batch, final required suite, and orphaned branch/worktree recovery. Require shared context to be durable and visible before spawn, but do not universally require a commit: shared-worktree agents see saved files, while isolated agents need an approved commit, patch, or equivalent. If no safe transfer exists, do not decompose. |
| 12 | Adopt | Make knowledge ingestion the owner of source-trust rules, resumption protocol the owner of interrupt/recovery behavior, quality system and quality record the owners of verification, and knowledge management the owner of canonicality. Entry points summarize and link; redundant detailed copies are removed. |
| 13 | Adopt | Rename the brief template to `project-brief.md`, remove route/phase enums by consolidation, and replace moving BMad repository-layout deep links with stable official documentation pages checked on 2026-07-10. The former template/instance naming was explainable, but exact naming costs less than recurring confusion. |

### Protected Strengths

Retain the praised source-trust and hostile-instruction model, agentic security and threat
coverage, primary-source provenance, evidence ladder, bias calibration, Pilot status,
correct-at-the-right-layer principle, conflict precedence, human attention budget,
acceptance-criteria synthesis, structured second passes, freshness rules, interruption
types, and proportional-ceremony default. Consolidation changes their ownership and
invocation, not their safety or intent.

## Before And After

Before, a cold-start agent selected overlapping mode/path/phase/risk labels, guessed the
relevant task note, could not detect a repeated correction across sessions, chose among
duplicate quality templates, and could call work done by documenting unrun checks.

After, it reads one bounded state cursor, follows one route plus a risk gate, searches a
durable retrospective, uses one quality record when durable evidence is needed, and can
close as Done only after required checks pass. Framework edits are qualitatively
dispositioned, logged, and subject to explicit pilot/sunset review.

## Options Considered

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Reject the critique | No migration or context cost | Leaves structural continuity and verification gaps | Rejected |
| Adopt every recommendation literally | Simple correspondence to review | Weakens unknown-action safety, conflates risk with route, assumes isolated Git workers | Rejected |
| Adopt findings with scoped safety and portability exceptions | Fixes mechanisms while preserving risk and authority boundaries | Requires coordinated multi-file migration | Accepted |
| Pilot all changes | Easy rollback | Treats accepted structural findings and direct user request as weaker evidence than they are | Rejected; targeted sunset triggers retained |

## Consequences

Positive:

- Cold-start and recurrence mechanisms are now backed by durable files.
- Routine task selection and quality recording have fewer competing schemas.
- Verification and approval status are explicit and harder to rationalize around.
- Onboarding, commands, hygiene, and parallel recovery have testable mechanics.
- Framework edits remain auditable without numeric false precision.

Negative:

- `state.md` changes add small commit churn to repository-changing tasks.
- Existing adopters must migrate removed template references and seed state.
- Strict Needs verification status may expose more incomplete handoffs instead of
  allowing optimistic completion.
- Numeric budgets and cadence counters require periodic maintenance.

## Confidence

Confidence: High

Why:

The findings map to concrete repository text, the user requested each be addressed, and
the chosen exceptions preserve independent safety and topology constraints. The changes
are markdown-only, locally reversible, bounded by budgets, and have explicit review
triggers.

## Review Trigger

Revisit when state/log churn outweighs recovery value; route plus risk still produces
classification conflict; a removed template is needed in two real tasks; Needs
verification blocks useful delivery without improving honesty; the three-worker cap is
repeatedly wrong for project tooling; or a hygiene pass shows rules that never fired.

## Sources

- User-provided full-framework critique dated 2026-07-10.
- Existing framework and decisions reviewed on 2026-07-10.
- Stable official BMad documentation links recorded in `readme/references.md`.
