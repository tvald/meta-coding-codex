# Agent Definitions

This framework supports one capable agent or coordinated specialists. Roles are optional
responsibility bundles within a workflow route, not a menu every task must classify.
<!-- meta-framework-facet:v1:start agents.shared -->
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
- When the loaded profile lacks necessary detail, use
  `npm run --ignore-scripts --silent meta -- docs TOPIC` or
  `npm run --ignore-scripts --silent meta -- explain FACET`; do not locate package-internal files.
<!-- meta-framework-facet:v1:end agents.shared -->
## Optional Harness Adapter Contract

This file is the canonical owner for framework roles, triggers, boundaries, and handoff
behavior. Native files under `.codex/agents/` or `.claude/agents/` are optional discovery
and capability adapters; they are not independent role definitions.

An adapter may contain only:

- the vendor-required agent name and a narrow trigger description;
- least-privilege tool, sandbox, or permission settings that do not widen parent
  authority;
- concise instructions that bind and verify the package-compiled profile before work; and
- an exact package-owned project hook matcher when the accepted provider adapter requires it.

Adapters do not copy responsibilities, pin models, configure MCP servers, dispatch from
provider event data, enable recursive delegation, bypass approvals, own integration, or
write shared knowledge. Omitting them leaves portable behavior unchanged.

Four adopted Codex adapters map exact collision-resistant names to portable profiles:

| Adapter Name | Canonical Role | Write Boundary |
| --- | --- | --- |
| `meta_implementer` | [Implementer](#implementer) | Workspace-write within the explicit assignment |
| `meta_reviewer` | [Reviewer](#reviewer) | Read-only; reports findings to the Root Orchestrator |
| `meta_qa` | [QA And Verification Agent](#qa-and-verification-agent) | Workspace-write for normal declared check artifacts; no source edits |
| `meta_security` | [Security And Risk Agent](#security-and-risk-agent) | Read-only; returns findings and proposed record updates |

The project hook file owns one fixed `SubagentStart` profile command for each exact
`agent_type`. Every Codex manifest disables its child multi-agent tools, and its static
guard also stops work without the matching envelope and prohibits delegation.

Separately launched implementation-controller jobs are not native subagents and never
claim a role in prose. A controller `SessionStart` binds one protected, descriptor-
anchored run/task/assignment/attempt/job identity to the exact compiled profile and
prompt digests. Startup, resume, and compaction revalidate that identity; a missing,
linked, changed, wrong-role, or stale descriptor stops before tools. The controller
removes descriptor capability from the worker environment and keeps provider launch
disabled when the host cannot prove that boundary. Normal interactive top-level startup
continues to load Root and cannot be repurposed as a specialist binding.

The Root Orchestrator assigns, integrates, and applies decomposition rules; discovery never mandates delegation.
<!-- meta-framework-facet:v1:start roles.root -->
## Root Orchestrator

Purpose: own the goal end to end.

Responsibilities:

- Run the root loop.
- Run the resume check before continuing interrupted work.
- Solely own semantic task-store mutations, eligibility judgment, and primary selection;
  invoke `npm run --ignore-scripts --silent meta -- tasks ...` while workers return proposals.
- Decide whether selected work stays single-agent or is decomposed.
- Maintain the plan, quality bar, and final integration.
- Maintain the agent roster for multi-agent work: assignment, ownership, status, last known output, and restart policy.
- Assign clear scopes to specialist agents.
- Resolve conflicts between agent outputs.
- Ensure verification, docs, and decision records are complete.

Exit criteria:

- Goal complete, verified, and recorded, or blocker proven and explained.
<!-- meta-framework-facet:v1:end roles.root -->
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
<!-- meta-framework-facet:v1:start roles.implementer -->
## Implementer

Purpose: make scoped code changes.

Responsibilities:

- Follow local patterns.
- Write or update tests.
- Keep changes narrow.
- Avoid unrelated formatting or refactors.
- Document behavior changes.

Use when: the implementation surface is clear enough to edit.
<!-- meta-framework-facet:v1:end roles.implementer -->
<!-- meta-framework-facet:v1:start roles.reviewer -->
## Reviewer

Purpose: find bugs, regressions, missing tests, and standard violations.

Responsibilities:

- Review the diff against request, standards, and decisions.
- Prioritize correctness, maintainability, security, and test coverage.
- Provide concrete file and line feedback when possible.
- Separate blocking issues from nits.

Use when: any non-trivial code, process, architecture, or user-facing change is ready
for review.
<!-- meta-framework-facet:v1:end roles.reviewer -->
<!-- meta-framework-facet:v1:start roles.qa -->
## QA And Verification Agent

Purpose: validate behavior independently from implementation.

Responsibilities:

- Build a verification matrix from acceptance criteria.
- Run relevant commands and manual checks.
- Exercise edge cases, permissions, errors, and rollback paths.
- Record what passed, failed, and was not checked.

Use when: the change is user-facing, risky, cross-cutting, or release-bound.
<!-- meta-framework-facet:v1:end roles.qa -->
<!-- meta-framework-facet:v1:start roles.security -->
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

Use when: the task touches auth, permissions, sensitive data, external input, payments,
production operations, agent tools, or dependency updates.
<!-- meta-framework-facet:v1:end roles.security -->
## Documentarian

Purpose: keep user and developer knowledge accurate.

Responsibilities:

- Update READMEs, runbooks, API docs, task notes, source maps, and glossary entries.
- Keep docs concise and tied to current behavior.
- Remove or supersede stale instructions.

Use when:

- Behavior, setup, commands, architecture, or workflow changes.
<!-- meta-framework-facet:v1:start delegation.control -->
## Decomposition Rules

Delegation requires standing repository or task authority; neither this role nor a
harness adapter grants it. Task-level decomposition remains a separate decision with no
minimum worker count. Keep work primary when it is small,
tightly coupled, shares mutable canonical files, or costs more to coordinate than to
complete. Keep at most one primary implementation task active by default. Delegate only
an independently useful, non-overlapping result; a separate delegated task also requires
isolated worktree, integration, and capacity safety. Task count is not a delegation
trigger. Decompose only when it improves speed, quality, or focus:

- Split by independent files, components, or research questions.
- Give each agent one clear owner area.
- Avoid assigning multiple agents to edit the same files concurrently.
- Give each agent its task ID/revision, explicit output, and verification expectations.
- Record each agent's assignment, owned files, expected output, and restart policy in the task note when work may span interruptions.
- Integrate through the root orchestrator.
- Keep at most three child workers active by default. Integrate or close work before
  adding more unless project policy sets a different evidence-based cap.
<!-- meta-framework-facet:v1:end delegation.control -->
<!-- meta-framework-facet:v1:start capacity.guard -->
## Usage Capacity Guard

Root monitors capacity for planned, running, or quota-suspended children. Run only
`npm run --ignore-scripts --silent meta -- quota --harness codex` (or `claude`); safety
requires exit zero with `disposition: "proceed"`.

- Check every advertised five-hour, weekly/model-weekly, and monthly window before each
  spawn/resume, after each result, and every five minutes while children run. Consumed is
  `100 - remaining` when needed.
- Cutoffs are **95%** five-hour, **98%** weekly/model-weekly, **99%** monthly. Limit
  errors equal 100%; failed, malformed, or unknown required data is at cutoff. Omitted
  windows are inapplicable; never estimate or ask the owner to monitor.
- At cutoff, spawn/resume nothing; have children checkpoint and suspend safely.
- Before waiting, record time, consumption, resets, limiting windows, worker state, next
  action, and wake method without account data. Wake at the latest reset or poll every
  five minutes; re-read before resuming and reuse handles.
- Quota wait is operational, not task completion, **Blocked**, or **Needs verification**;
  replace only a worker that cannot resume.
<!-- meta-framework-facet:v1:end capacity.guard -->
## Parallel Integration And Recovery

Before starting a worker, make its assignment and shared context durable in its execution
model. A task note is enough in a shared worktree; an isolated checkout needs an approved
commit, patch, or equivalent transfer. Without one, do not decompose or create an
unauthorized checkpoint merely for parallelism.

- Use one writer for task state and each shared knowledge file. Workers return proposed
  updates to the Root Orchestrator unless explicitly assigned ownership.
- Integrate the smallest coherent worker result first. Run focused checks before it,
  affected checks after each batch, and the full required suite after all results.
- After interruption, inspect handles, `git status`, commits, worktrees, and branches
  before replacing work. Never assume a missing worker failed or completed.
- Treat orphaned branches, worktrees, commits, and changes as owned until proven otherwise.
  Record and recover them; remove nothing without authority and a safe disposition.
- Reassign only work still needed, independent, and absent from integrated results.
  Replacement instructions include prior evidence, current state, owned files, what not
  to redo or revert, checks, and handoff format.
- A stop or redirect stales output only for affected tasks. Unrelated task arrival does
  not stale a worker. Halt affected workers and review later output before integration.
<!-- meta-framework-facet:v1:start handoff.result -->
## Handoff Format

Use this format when assigning or returning work:

```md
## Assignment
- Task ID, revision, and goal:
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
<!-- meta-framework-facet:v1:end handoff.result -->
Add a durable project-specific role only after repeated use; keep its purpose, triggers, inputs, boundaries, loop, verification, and output in the canonical agent file.
