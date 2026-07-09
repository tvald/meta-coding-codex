# Framework Improvement

This framework is a living system. Agents are expected to improve it when evidence shows that the current process causes avoidable mistakes, ambiguity, or drag.

## Improvement Triggers

Patch the framework when:

- The product owner repeats the same instruction across tasks.
- An agent makes the same mistake twice.
- A review finds a missing standard or quality gate.
- A task stalls because required context had no obvious home.
- A decision is rediscovered instead of referenced.
- A process step is consistently skipped because it is too vague or too heavy.
- New tooling changes how agents should build, test, research, or verify.

Do not patch the framework for one-off preferences unless the user asks to make them durable.

## Change Lifecycle

Use this lifecycle for non-trivial framework changes. Small typo fixes may skip directly to review and commit.

1. Proposal: describe the observed problem, affected files, intended behavior, evidence, context cost, and verification plan. Use [templates/framework-change-proposal.md](templates/framework-change-proposal.md).
2. Judge: a Framework Judge scores the proposal, checks hard rejects, and returns Adopt, Pilot, Revise, or Reject. Use [templates/framework-judge-report.md](templates/framework-judge-report.md).
3. Implement: after judge acceptance, the Framework Maintainer edits the smallest useful markdown surface and keeps templates aligned.
4. Review: run a consistency check against `AGENTS.md`, this framework, templates, and the request. For larger edits, use a verification manifest.
5. Commit: commit only after required checks pass or residual risk is documented. Use a clear conventional commit message.

## Hard Rejects

Reject a proposal without scoring when it:

- Contradicts `AGENTS.md`, the user request, or established project ownership.
- Adds non-markdown dependencies, generated runtime behavior, or tooling to this markdown-only framework.
- Duplicates guidance that already has a clear home instead of patching that home.
- Creates vague duties that cannot be verified by another agent.
- Requires product-owner babysitting for routine agent responsibilities.
- Expands scope into unrelated deferred work.
- Lowers an existing safety, verification, or documentation gate without evidence and replacement controls.

## Evidence Ladder

Prefer higher evidence, but do not require perfect evidence for reversible process improvements.

| Level | Evidence | Typical Use |
| --- | --- | --- |
| 4 | Repeated observed failures, accepted review findings, or pilot results | Adopt when the rule is low-cost and scoped |
| 3 | One concrete failure plus a clear recurrence path | Pilot or adopt a narrow rule |
| 2 | Strong external practice or analogous project evidence | Pilot with explicit validation |
| 1 | Plausible preference or speculative concern | Reject or ask for more evidence |

Major process changes must include a before/after scenario showing how an agent would behave differently. If no scenario is practical, the proposal must state an explicit skip reason.

## Judge Rubric

Score proposals out of 100 after hard rejects:

| Category | Points | Question |
| --- | ---: | --- |
| Problem clarity | 15 | Is the failure, friction, or user need concrete? |
| Evidence strength | 20 | Does the proposal sit high enough on the evidence ladder for its risk? |
| Outcome fit | 15 | Would the change prevent recurrence or improve execution? |
| Scope control | 15 | Is the guidance in the right files with minimal overlap? |
| Verifiability | 15 | Can agents check whether they followed it? |
| Context cost | 10 | Is added reading burden justified by expected value? |
| Maintainability | 10 | Is the wording short, durable, and easy to update? |

Decision thresholds:

- Adopt: 85-100 and no major unresolved risks.
- Pilot: 70-84, or higher-scoring changes that need real-task validation.
- Revise: 55-69 when a narrower or clearer version could pass.
- Reject: below 55, hard reject, or no credible evidence path.

Pilot rules:

- State the pilot scope, owner, success signal, and review trigger.
- Promote to Adopt only after the success signal is observed.
- Reject or revise when the pilot adds drag, creates conflicts, or fails to change outcomes.

## Context-Cost Budget

Framework changes spend shared agent attention. Keep added root-path reading small:

- Prefer one clear home over repeating the same rule across files.
- Add templates for structured work instead of long procedural prose.
- Keep new default instructions concise enough to scan during normal task setup.
- Justify any rule that agents must read on every task.
- Remove or compress stale guidance when adding an equivalent replacement.

## Judge Calibration

The Framework Judge should:

- Score the substance before judging wording quality.
- For close calls within 5 points of a threshold, choose the lower-ceremony outcome unless risk or evidence clearly favors adoption.
- Check for verbosity bias: a long proposal is not stronger unless it adds relevant evidence.
- Check for position bias: evaluate every option against the rubric, not against where it appears in the proposal.
- Name the decisive evidence, not just the final score.
- Require revision when the proposal is directionally good but too broad, duplicated, or expensive to keep in context.

## Rule Quality Bar

A good framework rule is:

- Actionable: an agent can follow it without interpretation gymnastics.
- Verifiable: success or failure can be checked.
- Scoped: it says when it applies.
- Short: it does not bloat the root context.
- Evidence-based: it came from observed need or strong external practice.
- Non-conflicting: it does not contradict higher-priority project rules.

## Retrospective Prompt

At the end of substantial work, agents should ask internally:

```md
## Retrospective
- What slowed the work down?
- What mistake was caught late?
- What did I have to infer that should be documented?
- What check gave the most confidence?
- What check was missing?
- What framework rule or template would reduce future rework?
- Should I patch the framework now?
```

Patch immediately for small, clear improvements. For larger process changes, use the change lifecycle above and create a decision record when the choice is significant or hard to reverse.

## Consistency Audit For Framework Changes

Before finalizing framework edits:

- Root `AGENTS.md` still points to the right files.
- New guidance has one clear home.
- No duplicate rule conflicts with another file.
- Templates still match process docs.
- The framework remains markdown-only.
- The root entrypoint stays concise.
- The change helps automation rather than increasing babysitting.
