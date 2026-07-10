# AI Coding Meta-Framework

This framework seeds a new project with durable instructions for high-velocity, high-quality AI-assisted development. It is markdown-only by design so it can be copied into any repository without runtime dependencies.

## Principles

- Outcome first: every task starts from the user or business outcome, not from a preferred implementation.
- Context before code: agents inspect existing product knowledge, code, tests, and decisions before changing behavior.
- Small reversible steps: prefer narrow slices with fast verification over large speculative rewrites.
- Quality is a loop: implementation, tests, review, docs, and decision records move together.
- Memory is maintained by agents: product owners should not babysit context hygiene.
- Improve the system: repeated mistakes become better rules, templates, or checks.

## File Map

- [root-loop.md](root-loop.md): the orchestration process used for every task.
- [workflow-routing.md](workflow-routing.md): scale-adaptive path selection, next-action routing, status, and correct-course triggers.
- [knowledge-ingestion.md](knowledge-ingestion.md): how agents absorb documents, discussions, and product context.
- [knowledge-management.md](knowledge-management.md): decision logs, consistency checks, assumptions, standards, and living docs.
- [agent-definitions.md](agent-definitions.md): standard agent roles, loops, handoffs, and delegation rules.
- [automation-policy.md](automation-policy.md): what agents should do automatically and when they must stop.
- [resumption-protocol.md](resumption-protocol.md): how agents resume interrupted work and handle deliberate user interrupts.
- [development-standards.md](development-standards.md): coding, testing, security, documentation, and change-management standards.
- [quality-system.md](quality-system.md): verification, review, risk gates, release readiness, and defect handling.
- [framework-improvement.md](framework-improvement.md): how agents refine this framework from feedback and observed gaps.
- [references.md](references.md): research basis behind the practical rules.

## Responsibility Coverage

| Responsibility | Primary Files |
| --- | --- |
| Knowledge ingestion from documents and product-owner discussion | [knowledge-ingestion.md](knowledge-ingestion.md), [templates/product-brief.md](templates/product-brief.md), [templates/task-brief.md](templates/task-brief.md) |
| Knowledge management, decisions, standards, and consistency checks | [knowledge-management.md](knowledge-management.md), [development-standards.md](development-standards.md), [templates/decision-record.md](templates/decision-record.md), [templates/consistency-check.md](templates/consistency-check.md) |
| Standardized agents and loops | [agent-definitions.md](agent-definitions.md), [root-loop.md](root-loop.md), [templates/agent-card.md](templates/agent-card.md) |
| Root orchestration across speed and quality | [root-loop.md](root-loop.md), [workflow-routing.md](workflow-routing.md), [quality-system.md](quality-system.md), [templates/verification-manifest.md](templates/verification-manifest.md) |
| Scale-adaptive planning, readiness, and status | [workflow-routing.md](workflow-routing.md), [templates/project-context.md](templates/project-context.md), [templates/workflow-status.md](templates/workflow-status.md), [templates/implementation-readiness.md](templates/implementation-readiness.md) |
| Resumption, interruption handling, and agent re-spawn | [resumption-protocol.md](resumption-protocol.md), [automation-policy.md](automation-policy.md), [templates/task-notes.md](templates/task-notes.md) |
| Agentic risk, operational readiness, and incident learning | [quality-system.md](quality-system.md), [development-standards.md](development-standards.md), [templates/threat-model-card.md](templates/threat-model-card.md), [templates/incident-note.md](templates/incident-note.md) |
| Ongoing framework refinement and judge review | [framework-improvement.md](framework-improvement.md), [agent-definitions.md](agent-definitions.md), [templates/framework-change-proposal.md](templates/framework-change-proposal.md), [templates/framework-judge-report.md](templates/framework-judge-report.md) |
| Automation with minimal product-owner maintenance | [automation-policy.md](automation-policy.md), [knowledge-management.md](knowledge-management.md) |

Templates live under [templates/](templates/):

- [product-brief.md](templates/product-brief.md)
- [task-brief.md](templates/task-brief.md)
- [assumptions.md](templates/assumptions.md)
- [glossary.md](templates/glossary.md)
- [source-map.md](templates/source-map.md)
- [standards.md](templates/standards.md)
- [project-context.md](templates/project-context.md)
- [workflow-status.md](templates/workflow-status.md)
- [implementation-readiness.md](templates/implementation-readiness.md)
- [task-notes.md](templates/task-notes.md)
- [decision-record.md](templates/decision-record.md)
- [agent-card.md](templates/agent-card.md)
- [review-report.md](templates/review-report.md)
- [consistency-check.md](templates/consistency-check.md)
- [verification-manifest.md](templates/verification-manifest.md)
- [threat-model-card.md](templates/threat-model-card.md)
- [incident-note.md](templates/incident-note.md)
- [framework-change-proposal.md](templates/framework-change-proposal.md)
- [framework-judge-report.md](templates/framework-judge-report.md)

## Bootstrap In A New Project

1. Copy `AGENTS.md` and the `readme/` directory into the repository.
2. Create `readme/project-brief.md` from [templates/product-brief.md](templates/product-brief.md) when the first product task needs stable context.
3. Create `readme/decisions/` and add the first decision record when the project has a meaningful architectural, product, or process choice.
4. Add project-specific build, test, lint, and run commands to `AGENTS.md` or a repo-specific standards file.
5. Ask the agent to run the root loop on the first real goal and update this framework when it finds gaps.

## Required Project State

Each project using this framework should converge toward these markdown artifacts:

- `AGENTS.md`: concise operating instructions and links to deeper docs.
- `readme/project-brief.md`: current product purpose, users, outcomes, constraints, and glossary.
- `readme/project-context.md`: concise implementation rules, technology choices, and conflict-prone conventions.
- `readme/workflow-status.md`: phase, artifact, slice, risk, and next-action status for long-running initiatives.
- `readme/decisions/NNNN-title.md`: append-only decision records.
- `readme/assumptions.md`: unresolved assumptions, confidence, and validation path.
- `readme/glossary.md`: canonical domain terms, acronyms, and naming.
- `readme/source-map.md`: important sources, owners, freshness, and reliability.
- `readme/standards.md`: project-specific standards that extend the shared defaults.
- `readme/task-notes/`: durable notes for large or paused initiatives.

If an artifact is missing, the agent should create it when a task first needs it. Do not create empty process files that no task uses.
