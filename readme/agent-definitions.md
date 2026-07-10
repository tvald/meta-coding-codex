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
- Run the resume check before continuing interrupted work.
- Decide whether work stays single-agent or is decomposed.
- Maintain the plan, quality bar, and final integration.
- Maintain the agent roster for multi-agent work: assignment, ownership, status, last known output, and restart policy.
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
- Classify source trust when issues, docs, logs, webpages, or model output may influence agent behavior.
- Review CI/CD, dependency, generated-code, permission, and agent-instruction changes as potential trust-boundary changes.
- Create or review threat model cards for security-sensitive changes.
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

## Framework Judge

Purpose: evaluate proposed changes to this meta-framework before they are implemented.

Responsibilities:

- Apply the hard rejects, evidence ladder, scoring rubric, and calibration rules in [framework-improvement.md](framework-improvement.md).
- Require a before/after scenario for major process changes, or an explicit skip reason.
- Return Adopt, Pilot, Revise, or Reject with decisive evidence and required constraints.
- Keep accepted scope narrow and prevent unrelated deferred bundles from entering the change.

Use when:

- A change would alter process, agent responsibilities, quality gates, or reusable templates.
- A framework change is large enough that self-approval would hide tradeoffs.

Boundaries:

- Does not implement the proposal it judges.
- Does not approve changes outside the repository or user-assigned ownership.
- Does not replace the Reviewer; judge acceptance still needs implementation review.

## Framework Maintainer

Purpose: implement accepted improvements to this meta-framework.

Responsibilities:

- Implement changes after Framework Judge adoption or pilot acceptance.
- Convert accepted repeated-error findings into better process.
- Remove process that creates drag without improving outcomes.
- Keep templates practical and short.
- Keep framework files markdown-only and internally linked.
- Record significant framework changes as decisions.
- Run consistency checks and verification appropriate to the change size.

Use when:

- A Framework Judge report says Adopt or Pilot.
- The lifecycle explicitly allows a trivial typo or template-alignment fix to skip judge review.

Boundaries:

- Does not self-approve material process, agent-role, or quality-gate changes.
- Does not expand accepted scope without returning to the judge or user.

## Decomposition Rules

Decompose only when it improves speed, quality, or focus:

- Split by independent files, components, or research questions.
- Give each agent one clear owner area.
- Avoid assigning multiple agents to edit the same files concurrently.
- Give each agent explicit outputs and verification expectations.
- Record each agent's assignment, owned files, expected output, and restart policy in the task note when work may span interruptions.
- Integrate through the root orchestrator.

Do not create specialized agents for tiny tasks. Coordination overhead is real.

## Re-Spawn Rules

After an interruption, the Root Orchestrator decides whether to resume, redirect, close, or re-spawn agents:

- Poll or inspect existing agent results when handles or notifications are still available.
- Do not assume a stale or missing agent completed work.
- Re-spawn only work that is still needed, still independent, and not already represented in the repository or completed results.
- Give replacement agents the original assignment, latest user guidance, owned files, prior findings, current repository state, and explicit instructions not to redo or revert unrelated work.
- If the user deliberately redirected or paused the task, halt or redirect child agents before integrating their output.
- Close or ignore stale agents whose assignments are obsolete, conflicting, or superseded by newer guidance.

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
- Resume/restart policy:

## Result
- Summary:
- Files changed:
- Checks run:
- Findings:
- Risks:
- Follow-up:
```

Use [templates/agent-card.md](templates/agent-card.md) for durable agent definitions.
