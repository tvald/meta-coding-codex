# T-0022 Task Recovery Skill Brief

## Identity And Source

- Task ID: T-0022
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction on 2026-08-11 promoting the highest-value T-0017
  and T-0018 recommendations
- Parent or split task IDs: T-0017, T-0019

## Goal

Add a discoverable `task-recovery` skill that gathers bounded durable and live state
after interruption, restart, approval wait, or worker loss and proposes the next safe
action without guessing ownership or repeating uncertain effects.

## Background

T-0017 ranked recovery as a high-fit skill because correct resumption crosses task
state, Git state, worker state, approvals, verification, and usage capacity. T-0018 adds
the bounded structured query path needed to make that procedure reliable at scale.

## Scope

In scope:

- One canonical skill source and the minimum supported harness discovery surfaces.
- Targeted recovery for primary tasks, delivered interruptions, parked approvals,
  verification gaps, stale or lost workers, and quota-suspended delegation.
- Bounded `framework-data task context`, dependency, and integrity queries plus live Git,
  process, worker, and provider state where applicable.
- A structured evidence/result contract that distinguishes safe continuation, retry,
  replacement, verification, approval wait, and blocking conditions.
- Package, installer, documentation, and focused recovery fixtures.

Out of scope:

- Replacing `resumption-protocol.md` or `agent-definitions.md` as policy owners.
- Automatic retry of uncertain external effects, reassignment of owned work, task
  selection, approval, authority acceptance, or semantic completion.
- General workflow orchestration when no recovery trigger exists.

## Acceptance Criteria

- [ ] The skill has precise recovery triggers and progressively loads only the canonical
  state and process owners relevant to the targeted task.
- [ ] It reconciles durable task/checkpoint data with Git status, recent commits, live
  workers, verification evidence, approvals, and usage capacity without hiding conflicts.
- [ ] It never treats missing evidence as success, repeats an uncertain side effect, or
  silently reassigns stale worker output.
- [ ] It returns the task/revision, evidence freshness, integrity state, completed safe
  increment, exact next action, and any blocker or approval needed.
- [ ] It fails safely for missing/corrupt records, revision mismatch, dirty overlapping
  work, unavailable required checks, stale worker messages, and absent quota windows.
- [ ] Package/installer inventories and supported harness discovery surfaces install one
  maintained skill without drift or overwrite.
- [ ] Fixtures cover interruptions before/after commit, partial writes, approval waits,
  Needs verification, worker loss/replacement, quota suspension, and user redirect.

## Constraints

- Depends on T-0020 so recovery uses the canonical bounded query path.
- Use the `skill-creator` guidance during implementation.
- Durable repository evidence outranks transient harness state; conflicts stop recovery
  until ownership and state are reconciled.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: recovery spans durable data, Git, verification, delegation, provider
  telemetry, packaging, and multiple harness discovery surfaces.
- Why this risk gate: an incorrect retry or ownership inference can duplicate external
  effects, overwrite shared work, or falsely claim completion.
- Upstream artifacts required: T-0020, resumption protocol, task lifecycle, agent
  definitions, quota monitor skills, and installer/package decisions.
- Escalation trigger: supported harnesses cannot expose enough live evidence to
  distinguish safe continuation from uncertain effects.

## Verification Plan

- Automated checks: skill validation, package/install inventory, state-mismatch and
  interruption fixtures, worker/quota fixtures, and bounded-context checks at scale.
- Manual checks: trigger discoverability, safe stop/handoff quality, progressive context
  loading, and provider discovery surfaces for policy drift.
- Documentation checks: canonical links, recovery ownership, package boundary, and
  framework changelog/decision consistency.
- Counterfactual evidence: reproduce at least one old-path recovery ambiguity and show
  that the skill stops or selects the safe next action from explicit evidence.

## Done When

- The installed skill recovers every supported interruption class without uncertain
  re-execution or ownership drift, and all high-risk review and verification gates pass.
