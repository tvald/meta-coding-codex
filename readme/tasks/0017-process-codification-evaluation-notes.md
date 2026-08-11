# T-0017 Process Codification Evaluation Notes

## Task Frame

- Goal: evaluate every canonical meta-framework process and recommend whether any
  judgment-heavy procedure should become a reusable skill or any deterministic,
  repeatable mechanic should become a script.
- Scope: `readme/meta/` process owners and the repository's existing automation and
  skill surfaces.
- Non-goals: implement proposed skills or scripts; change framework policy.
- Constraints: preserve Markdown as the canonical policy owner, avoid duplicating
  rules into integration surfaces, and distinguish assistance from enforcement.
- Risk: Low; this task changes only its own durable assessment records.
- Done when: the process inventory is complete; recommendations include rationale,
  boundaries, priority, and rejected candidates; an independent review is reconciled;
  documentation links are checked; and task state is closed consistently.

## Verification Plan

- Read all canonical process owners and relevant templates.
- Inventory existing skills, scripts, CI automation, and package/install behavior.
- Check every process owner against explicit skill and script suitability criteria.
- Run a read-only independent review of the resulting candidate set.
- Validate changed Markdown links and inspect the final diff.

## Agent Roster

| Assignment | Ownership | Status | Expected Output | Restart Policy |
| --- | --- | --- | --- | --- |
| Independent codification review | Read-only review of `readme/meta/`; no file writes | Complete | Ranked skill/script candidates, false-positive cautions, and omissions | No restart needed |

## Findings

### Evaluation Rules

- Keep Markdown as the mandatory owner for policy, authority, schemas, and judgment.
- Prefer a skill when a procedure is conditional, multi-step, tool-using, and benefits
  from trigger discovery or progressive disclosure.
- Prefer a script when inputs and pass/fail outcomes are deterministic, local,
  non-destructive, and portable enough to justify their maintenance surface.
- A skill links canonical process sections rather than copying them. A script reports
  structural facts rather than selecting tasks, assigning trust, judging risk, granting
  approval, or claiming semantic completion.
- Evaluate source-repository tooling, host-project tooling, and shipped portable
  integrations separately. The current portable core is Markdown-only; shipping an
  executable validator requires a deliberate boundary change.

### Process Coverage

| Canonical Owner | Skill Fit | Script Fit | Assessment |
| --- | --- | --- | --- |
| `root-loop.md` | Low as a whole | Partial | Keep the universal loop in Markdown. A validator can check intake and close-state invariants, but no optional skill should own the loop. |
| `workflow-routing.md` | Low | Reject | Route and escalation choices are contextual judgments; a scorer would create false precision. |
| `onboarding.md` | High | Partial | A `project-onboarding` skill can orchestrate the bounded procedure and call a read-only preflight. Collision resolution, safe command choice, and useful artifact selection remain agent decisions. |
| `knowledge-ingestion.md` | High | Low | A synthesis skill would help with document bundles, interviews, and brownfield discovery. Scripts may inventory files, but must not assign trust or resolve conflicts. |
| `knowledge-management.md` | Medium | High | Structural state, graph, link, budget, and cadence checks belong in a validator; stale guidance, canonical ownership, and archival choices remain judgment. |
| `automation-policy.md` | Reject | Per mechanic | Authority and approval boundaries must always be visible. Existing package/install/release scripts correctly automate individually approved deterministic mechanics. |
| `resumption-protocol.md` | High | Preflight only | A `task-recovery` skill can gather durable and live state and propose the next safe action; a validator can check state consistency. It must not guess ownership or repeat uncertain side effects. |
| `agent-definitions.md` | Already appropriate | Validation only | Keep roles in Markdown and the existing thin adapters and provider telemetry skills. Do not add a general delegation skill. |
| `development-standards.md` | Reject | Project-specific | Universal defaults remain policy. Executable project commands belong in project task runners/CI and the observed command catalog. |
| `quality-system.md` | Narrow conditional fit | Low | Existing Reviewer, Verifier, and Security Reviewer adapters cover independent execution. Only a high-risk readiness/planning skill would add value; a generic check runner would not. |
| `framework-improvement.md` | Medium | High for structure | A `framework-maintenance` skill can coordinate evidence, ownership, templates, changelog, and review while a validator checks mechanics. Disposition and evidence sufficiency remain judgment. |
| `references.md` | Reject | Reject | This is provenance, not a workflow; freshness-sensitive facts require current primary-source research. |

The meta index, twelve templates, and blank changelog seed do not warrant their own
skills. They should be inputs to structural validation and the applicable process skill.

### Recommended Set

1. **Adopt in a separate task: `framework-doctor`, one read-only validator script.**
   It should validate the two onboarding sentinels; local Markdown links; catalog schema
   and status vocabulary; unique and next task IDs; dependency existence and cycles;
   cursor/catalog primary-task agreement; active-task limits; artifact budgets; process
   and template inventories; maintenance due state; and source-versus-installed
   changelog rules. A staged-diff mode should warn when task-owned file changes omit the
   catalog close record or a framework edit omits its canonical audit owner. It must
   fail closed on malformed input and never auto-fix, archive, schedule, stage, commit,
   execute Markdown commands, or infer that structurally valid work is `Done`.
2. **Adopt after choosing a distribution boundary: `project-onboarding` and
   `task-recovery`, two instruction-only skills.** Each should have a precise trigger,
   progressively load only its canonical owner and relevant templates, use the doctor
   when installed, and return structured evidence. They add orchestration and discovery
   without becoming policy owners.
3. **Adopt after the validator exists: `framework-maintenance`, one instruction-only
   skill.** Trigger it for scheduled hygiene or framework/integration changes. It should
   apply project-local overrides, invoke structural checks, and coordinate evidence,
   changelog, template, decision, and review work without copying policy.
4. **Reject for now, revisit on repeated demand:** separate `knowledge-ingestion` and
   high-risk quality-planning skills. Both are coherent, but the repository has stronger
   evidence for state validation, onboarding, recovery, and framework-change compliance.
   If adopted later, keep quality planning narrowly limited to major or high-risk work.

### Evidence And Reconciliation

- The maintenance cadence, resume loop, and framework consistency audit already repeat
  deterministic checks that no current script performs.
- Retrospective `R-2026-07-30-01` records a real framework-changing commit that skipped
  task intake and required backfill; a staged structural check directly targets that
  recurrence path.
- Earlier packaging work shows the value of turning an exact, repeated boundary into a
  fail-closed script. The current package and installer scripts remain sound and should
  not be duplicated.
- Existing quota skills establish the correct ownership pattern: the skill owns a
  provider procedure while `agent-definitions.md` retains policy. Their accepted
  decisions also correctly defer deterministic helpers until observed parsing or
  lifecycle failures justify them.
- The independent read-only review considered every process owner, all templates,
  current skills and adapters, scripts, CI, and relevant decisions. It ranked onboarding
  and recovery skills above the initial primary framing; those were accepted. Its
  broader quality and ingestion candidates were retained as lower-priority, not-currently-
  justified options to keep the first set small.

### Explicit Rejections

- A monolithic root-loop or “run the framework” skill.
- A task-catalog mutator, scheduler, route/risk scorer, or automatic archival tool.
- Automated trust classification, conflict resolution, approval, staging, or commits.
- A generic runner that executes commands extracted from Markdown.
- A skill per template, checklist, role, or process document.
- Executable helper files bundled into shipped skills under the current Markdown-only
  contract, including extracting the existing inline quota readers without new failure
  evidence.

### Residual Decision Before Implementation

Decide whether `framework-doctor` is source-repository tooling, separately installed
host-project tooling, or a new optional shipped integration. The last choice changes the
portable package boundary and therefore needs a significant decision, security review,
negative fixtures, installer/package inventory updates, and CI coverage. Generic skills
also need one maintained source plus thin harness discovery surfaces so Codex and Claude
copies cannot drift.

## Verification Results

- Pass: read every canonical process owner, the meta index, all twelve templates,
  existing skill and adapter surfaces, repository scripts and CI, relevant decisions,
  and recurrence evidence.
- Pass: an independent read-only review covered the same surfaces, returned a complete
  matrix and ranked candidates, and made no file changes.
- Pass: `git diff --check` reported no whitespace errors.
- Pass: a local-target link check validated 111 Markdown files with no missing targets.
- Pass: structural checks confirmed 17 unique task rows, the expected next task ID,
  row budget, and active-task/cursor agreement before close.
- Pass: `AGENTS.md`, the project cursor, task note, and every core process document are
  within their line budgets; the template directory contains exactly twelve Markdown
  templates.
- Residual risk: this is a design evaluation, not implementation evidence. The proposed
  validator and skills still require their own scoped decisions and verification.
