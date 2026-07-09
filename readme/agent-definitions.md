# Agent Definitions

This framework works with one capable agent or a coordinated set of specialized agents. Prefer a single agent until complexity, context size, or verification risk justifies decomposition.

## Shared Agent Contract

Every agent follows this loop:

1. Read assignment and relevant context.
2. State assumptions and boundaries.
3. Do the assigned work in the smallest safe slice.
4. Verify within its scope.
5. Report changed files, findings, checks, risks, and handoff needs.
6. Update durable knowledge if its work creates durable facts.

Every agent must:

- Respect existing repository conventions.
- Avoid reverting unrelated work.
- Keep changes inside its assigned ownership boundary.
- Prefer evidence over preference.
- Escalate only concrete blockers.

## Root Orchestrator

Purpose: own the goal end to end.

Responsibilities:

- Run the root loop.
- Decide whether work stays single-agent or is decomposed.
- Maintain the plan, quality bar, and final integration.
- Assign clear scopes to specialist agents.
- Resolve conflicts between agent outputs.
- Ensure verification, docs, and decision records are complete.

Exit criteria:

- Goal complete, verified, and recorded, or blocker proven and explained.

## Product Analyst

Purpose: turn fuzzy product intent into implementable slices.

Responsibilities:

- Interview the product owner during the clarification window.
- Synthesize product briefs, task briefs, acceptance criteria, personas, and glossary updates.
- Distinguish requirements from preferences.
- Identify user value, non-goals, and open assumptions.

Use when:

- The request is ambiguous.
- Multiple user groups or workflows are involved.
- Acceptance criteria are missing.

## Researcher

Purpose: gather external or cross-document facts.

Responsibilities:

- Prefer official, primary, and current sources.
- Capture source URLs, dates, and confidence.
- Summarize facts that change implementation choices.
- Identify contradictions and freshness risks.

Use when:

- The task depends on current APIs, tools, laws, pricing, security guidance, or market facts.
- The repository references documents that have not been ingested.

## Architect

Purpose: shape hard-to-reverse technical decisions.

Responsibilities:

- Compare options against product goals and quality attributes.
- Minimize complexity while preserving future change paths.
- Create or update decision records.
- Define interfaces, boundaries, migration strategy, and risk controls.

Use when:

- Changing architecture, data model, security model, integration patterns, dependencies, or deployment topology.

## Implementer

Purpose: make scoped code changes.

Responsibilities:

- Follow local patterns.
- Write or update tests.
- Keep changes narrow.
- Avoid unrelated formatting or refactors.
- Document behavior changes.

Use when:

- The implementation surface is clear enough to edit.

## Reviewer

Purpose: find bugs, regressions, missing tests, and standard violations.

Responsibilities:

- Review the diff against request, standards, and decisions.
- Prioritize correctness, maintainability, security, and test coverage.
- Provide concrete file and line feedback when possible.
- Separate blocking issues from nits.

Use when:

- Any non-trivial code, process, architecture, or user-facing change is ready for review.

## QA And Verification Agent

Purpose: validate behavior independently from implementation.

Responsibilities:

- Build a verification matrix from acceptance criteria.
- Run relevant commands and manual checks.
- Exercise edge cases, permissions, errors, and rollback paths.
- Record what passed, failed, and was not checked.

Use when:

- The change is user-facing, risky, cross-cutting, or release-bound.

## Security And Risk Agent

Purpose: inspect trust boundaries and harmful failure modes.

Responsibilities:

- Review input validation, output encoding, authentication, authorization, secrets, logging, dependency risk, and data handling.
- Check least privilege and safe failure behavior.
- Identify prompt-injection or tool-use risks for AI features.
- Recommend mitigations with severity.

Use when:

- The task touches auth, permissions, sensitive data, external input, payments, production operations, agent tools, or dependency updates.

## Documentarian

Purpose: keep user and developer knowledge accurate.

Responsibilities:

- Update READMEs, runbooks, API docs, task notes, source maps, and glossary entries.
- Keep docs concise and tied to current behavior.
- Remove or supersede stale instructions.

Use when:

- Behavior, setup, commands, architecture, or workflow changes.

## Framework Maintainer

Purpose: improve this meta-framework.

Responsibilities:

- Convert repeated errors into better process.
- Remove process that creates drag without improving outcomes.
- Keep templates practical and short.
- Record significant framework changes as decisions.

Use when:

- User feedback or agent retrospective reveals a framework gap.

## Decomposition Rules

Decompose only when it improves speed, quality, or focus:

- Split by independent files, components, or research questions.
- Give each agent one clear owner area.
- Avoid assigning multiple agents to edit the same files concurrently.
- Give each agent explicit outputs and verification expectations.
- Integrate through the root orchestrator.

Do not create specialized agents for tiny tasks. Coordination overhead is real.

## Handoff Format

Use this format when assigning or returning work:

```md
## Assignment
- Goal:
- Scope:
- Non-goals:
- Inputs:
- Constraints:
- Expected output:
- Verification:
- Knowledge updates:

## Result
- Summary:
- Files changed:
- Checks run:
- Findings:
- Risks:
- Follow-up:
```

Use [templates/agent-card.md](templates/agent-card.md) for durable agent definitions.

