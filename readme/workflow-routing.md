# Workflow Routing

Workflow routing helps agents answer "what should happen next?" without dumping the full process on every task. It is scale-adaptive: small work stays lightweight, while ambiguous or high-impact work earns deeper discovery, architecture, and readiness checks.

## Routing Principles

- Small intent, small path: do not require a full product lifecycle for a contained fix.
- Strong boundary before autonomy: agents may work longer without product-owner input only after the goal, constraints, and verification path are clear.
- Artifacts feed the next phase: product context informs architecture, architecture informs slices, slices inform implementation.
- Correct at the right layer: if a failure came from bad intent or weak specification, repair that layer before patching code.
- Always recommend the next action: every substantial workflow should end with a clear next step, optional alternatives, and blockers.

## Scale-Adaptive Paths

| Path | Use When | Required Output |
| --- | --- | --- |
| Quick path | Small bug, refactor, doc update, or well-understood feature with low blast radius | Short task frame, focused patch, relevant verification |
| Spec slice | The goal is clear but needs examples, edge cases, or acceptance criteria before safe implementation | Task brief or spec section, acceptance criteria, verification plan |
| Full product path | New product area, fuzzy user value, major UX/API/data model, or cross-team impact | Product brief, task brief, architecture or decision record, implementation slices |
| Brownfield path | Existing system with established conventions or undocumented behavior | Project context, source map, codebase intake notes, compatibility constraints |
| Correct-course path | New guidance, defect, or discovery invalidates active work or upstream artifacts | Change impact note, updated affected artifacts, revised plan |

Choose the lightest path that can finish safely. Escalate when risk, ambiguity, or inconsistency increases.

## Phase Map

| Phase | Question | Typical Artifacts | Exit Signal |
| --- | --- | --- | --- |
| Explore | Is this worth doing and for whom? | Product brief, assumptions, source map | Outcome and users are clear enough |
| Define | What exactly must change? | Task brief, examples, acceptance criteria | Scope and non-goals are testable |
| Design | How should it fit the system? | Decision record, project context, architecture notes | Cross-cutting choices are explicit |
| Slice | What is the next shippable unit? | Workflow status, task notes, implementation plan | First slice has owner, files, checks |
| Implement | Build the slice | Code, tests, docs | Checks pass or risk is documented |
| Review | Did it satisfy the right thing? | Review report, verification manifest, readiness result | Findings resolved or deferred |
| Learn | What should future agents remember? | Updated standards, decisions, assumptions, incident notes | Durable knowledge is current |

Not every task enters at Explore. A bug fix may start at Implement after a short frame; a new feature may need Explore through Slice.

## Next Action Router

At the end of substantial work, recommend one next action:

- Continue implementation: a ready slice remains and no blocker exists.
- Review: code or docs changed and need focused critique.
- Verify: behavior changed and checks have not established enough confidence.
- Clarify: a high-impact ambiguity remains and cannot be safely inferred.
- Decide: a hard-to-reverse product, architecture, security, or process choice is pending.
- Correct course: new evidence invalidates an upstream artifact or active plan.
- Record knowledge: durable facts, decisions, standards, or assumptions changed.
- Stop: the goal is complete, cancelled, or blocked by an explicit approval.

Include the reason and the artifact or command that makes the next action concrete.

## Workflow Status

Use [templates/workflow-status.md](templates/workflow-status.md) for long-running initiatives with multiple artifacts, slices, agents, or phases. It should show current phase, artifact status, active slice, risks, and recommended next action.

Do not create workflow status for one-off tasks that fit in a final response.

## Correct-Course Trigger

Run a correct-course pass when:

- User guidance changes the goal, scope, acceptance criteria, or priority midstream.
- Review or testing shows the plan satisfies the wrong requirement.
- Implementation reveals an architectural, data, UX, or security constraint that upstream artifacts missed.
- A slice cannot be completed without changing product or architecture assumptions.

Correct-course output should identify affected artifacts, proposed edits, risk, owner, and whether work can continue locally or needs re-planning.
