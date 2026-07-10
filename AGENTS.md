# Agentic Development Entrypoint

This repository uses the AI development meta-framework in `readme/`. Read this file first, then open [readme/README.md](readme/README.md) and the linked process files relevant to the task.

## Operating Loop

For every task, run this loop until the goal is genuinely handled:

1. Frame the goal: identify the user outcome, constraints, risks, and completion criteria.
2. Gather context: inspect the repository, existing docs, decision records, tests, and relevant external sources when facts may have changed or are not in the repo.
3. Plan the smallest useful path: choose direct implementation, discovery, product clarification, architecture decision, or multi-agent decomposition.
4. Execute in small increments: keep changes scoped, preserve existing conventions, and update docs when behavior or process changes.
5. Verify: run the relevant checks, review the diff, inspect user-facing behavior when applicable, and note anything not verified.
6. Record knowledge: update decisions, assumptions, task notes, or framework guidance when new durable information appears.
7. Improve the framework: if the same mistake can happen again, patch the relevant markdown rule or template.
8. Commit completed changes: in a Git repository, create a local commit containing only task-owned changes before reporting completion. If the user opts out or a concrete repository, technical, or safety blocker prevents it, report an explicitly uncommitted, incomplete handoff. Follow [readme/automation-policy.md](readme/automation-policy.md#local-commit-completion).

## Autonomy

- Ask clarifying questions only when the answer is necessary and cannot be safely inferred from the repository or product context.
- If the user gives a clarification window, ask bounded questions during that window, then continue with explicit assumptions.
- Prefer making reversible, well-documented decisions over stopping for low-risk ambiguity.
- When resuming after an interruption, reconstruct state from the repository, task notes, plan, agent roster, and latest user instruction before continuing.
- When the user deliberately says stop, pause, cancel, or redirects the goal, halt conflicting work before continuing.
- Do not require the product owner to maintain the framework. Agents are responsible for keeping the knowledge base, decision log, and process docs current as part of normal work.

## Quality Bar

- A task is not done until code, tests, documentation, and decision records are consistent with the requested outcome.
- Use the standards in [readme/development-standards.md](readme/development-standards.md) and the review process in [readme/quality-system.md](readme/quality-system.md).
- When work is high-risk, user-facing, security-sensitive, data-destructive, or architecturally significant, run the deeper verification and decision-record paths.

## Knowledge Map

- Framework index: [readme/README.md](readme/README.md)
- Root orchestration loop: [readme/root-loop.md](readme/root-loop.md)
- Workflow routing: [readme/workflow-routing.md](readme/workflow-routing.md)
- Knowledge ingestion: [readme/knowledge-ingestion.md](readme/knowledge-ingestion.md)
- Knowledge management: [readme/knowledge-management.md](readme/knowledge-management.md)
- Agent definitions: [readme/agent-definitions.md](readme/agent-definitions.md)
- Automation policy: [readme/automation-policy.md](readme/automation-policy.md)
- Resumption protocol: [readme/resumption-protocol.md](readme/resumption-protocol.md)
- Development standards: [readme/development-standards.md](readme/development-standards.md)
- Quality system: [readme/quality-system.md](readme/quality-system.md)
- Framework improvement: [readme/framework-improvement.md](readme/framework-improvement.md)
