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

## Improvement Loop

1. Observe: capture the concrete failure, friction, or user feedback.
2. Diagnose: identify whether the gap is instruction, template, knowledge, tooling, or verification.
3. Patch: make the smallest markdown change that prevents recurrence.
4. Check: verify the new rule does not conflict with existing guidance.
5. Record: create a decision record if the process change is significant.
6. Use: apply the improved framework on the current task if relevant.

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

Patch immediately for small, clear improvements. For larger process changes, create a proposed decision record.

## Consistency Audit For Framework Changes

Before finalizing framework edits:

- Root `AGENTS.md` still points to the right files.
- New guidance has one clear home.
- No duplicate rule conflicts with another file.
- Templates still match process docs.
- The framework remains markdown-only.
- The root entrypoint stays concise.
- The change helps automation rather than increasing babysitting.

