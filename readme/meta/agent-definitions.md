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
  `npm run --silent meta -- docs TOPIC` or
  `npm run --silent meta -- explain FACET`; do not locate package-internal files.
<!-- meta-framework-facet:v1:end agents.shared -->
## Optional Harness Adapter Contract

This file is the canonical owner for framework roles, triggers, boundaries, and handoff
behavior. Native files under `.codex/agents/` or `.claude/agents/` are optional discovery
and capability adapters; they are not independent role definitions.

An adapter may contain only:

- the vendor-required agent name and a narrow trigger description;
- least-privilege tool, sandbox, or permission settings that do not widen the parent's
  authority; and
- concise instructions to read this file and the relevant canonical process owner.

Adapters do not copy full responsibilities, pin models, configure MCP servers or hooks,
enable recursive delegation, bypass approvals, own integration, or write shared project
knowledge. Omitting all adapters leaves the core framework behavior unchanged.

Three adopted optional adapters map bounded, independently useful roles:

| Adapter Name | Canonical Role | Write Boundary |
| --- | --- | --- |
| `reviewer` | [Reviewer](#reviewer) | Read-only default and no-write instruction; reports findings to the Root Orchestrator |
| `verifier` | [QA And Verification Agent](#qa-and-verification-agent) | Runs declared checks; does not edit source and reports command-created artifacts |
| `security-reviewer` | [Security And Risk Agent](#security-and-risk-agent) | Read-only default and no-write instruction; returns findings and proposed record updates |

The Root Orchestrator applies the decomposition rules, assigns ownership, and integrates
results; native discovery never mandates delegation.
<!-- meta-framework-facet:v1:start roles.root -->
## Root Orchestrator

Purpose: own the goal end to end.

Responsibilities:

- Run the root loop.
- Run the resume check before continuing interrupted work.
- Solely own semantic task-store mutations, eligibility judgment, and primary selection;
  invoke `npm run --silent meta -- tasks ...` while workers return proposals.
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

The Root Orchestrator owns capacity monitoring whenever any child worker is planned,
running, or quota-suspended. Use package-owned authoritative probes, never estimates: run
`npm run --silent meta -- quota --harness codex`, or use `claude` for Claude Code. The
package owns acquisition only; exclusively exit zero plus `disposition: "proceed"` is safe.

- Read every advertised five-hour, weekly, model-scoped, and monthly window before each
  spawn or resume, after a worker result, and at least every five minutes while a child
  is active. Consumed is `100 - remaining` when only remaining capacity is reported.
- Apply each window independently at **95%** five-hour, **98%** weekly or model-scoped
  weekly, and **99%** monthly. Treat a real limit error as 100%, and a failed, malformed,
  or unknown required reading as at-cutoff. An explicitly omitted window is not
  applicable; never guess or ask the product owner to monitor it.
- At or above any cutoff, start or resume no child. Ask active children to checkpoint and
  suspend at the next safe boundary, then preserve their state and output.
- Before waiting, record the reading time, consumed percentages, reset times, limiting
  windows, worker states, next safe action, and wake method without account or billing
  data. Wake at the latest authoritative limiting reset when possible; otherwise poll
  every five minutes. Re-read every window before resuming and prefer existing handles.
- A quota wait is an operational pause, not **Blocked**, **Needs verification**, or task
  completion. Use the replacement rules below only when a prior worker cannot resume.
<!-- meta-framework-facet:v1:end capacity.guard -->
## Parallel Integration And Recovery

Before starting a worker, make its assignment and shared context durable and visible in
that worker's execution model. A saved task note is enough in a shared worktree. An
isolated checkout needs an approved shared commit, patch, or equivalent transfer; if no
safe transfer exists, do not decompose. Do not create unauthorized checkpoint commits
merely to satisfy parallelism.

- Use one writer for task state and each shared knowledge file. Workers return proposed
  updates to the Root Orchestrator unless explicitly assigned ownership.
- Integrate the smallest coherent worker result first. Run its focused checks before
  integration, then the affected integration checks after each merge or integration
  batch. Run the full task-required suite after all results are combined.
- After interruption, inspect worker handles, `git status`, recent commits,
  `git worktree list`, and relevant branches before replacing work. Never assume a
  missing worker failed or completed.
- Treat orphaned branches, worktrees, commits, and uncommitted changes as owned until
  proven otherwise. Record them in the task note, recover needed results, and remove
  nothing without repository authority and a confirmed safe disposition.
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
Add a durable project-specific role only after repeated use justifies it; keep its purpose,
triggers, inputs, boundaries, loop, verification, and output in the canonical agent file.
