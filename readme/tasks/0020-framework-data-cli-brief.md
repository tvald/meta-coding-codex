# T-0020 Framework Data CLI Brief

## Identity And Source

- Task ID: T-0020
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction on 2026-08-11 promoting the highest-value T-0017
  and T-0018 recommendations
- Parent or split task IDs: T-0017, T-0018, T-0019

## Goal

Adopt a portable `framework-data` CLI that is the required mutation and normal query
boundary for authority-bearing task state, includes the proposed `framework-doctor`
checks, and migrates the task catalog without losing history or Git reviewability.

## Background

T-0017 identified structural validation as the highest-value script opportunity. T-0018
then found direct evidence of malformed catalog rows, valid escaped delimiters that
defeat naive parsing, unbounded context growth, and archive churn. Its assessment
revised the earlier rejection of mutation tooling and consolidated validation into a
guarded structured-data boundary.

## Scope

In scope:

- An accepted runtime, schema, package, install, portability, and rollback decision.
- Versioned, deterministic, sharded per-task structured records and minimal global
  scheduling state.
- Bounded task/startup/dependency/context queries, semantic task mutations, and
  integrated `doctor` validation.
- One explicit migration from active and archived Format 1 Markdown rows, with no dual
  canonical store.
- Locking, optimistic revisions, atomic replacement, negative fixtures, CI checks, and
  package/install integration.
- Updates to every process, template, bootstrap, and cursor owner affected by the new
  required boundary.

Out of scope:

- Automatic task selection, route/risk judgment, approval, authority acceptance, or
  semantic completion.
- Structured conversion of task narratives, decisions, quality records, threats,
  incidents, registries, retrospectives, or changelogs.
- Canonical SQLite, an external memory service, or a duplicate event log.
- The onboarding and recovery skills tracked by T-0021 and T-0022.

## Acceptance Criteria

- [ ] An accepted decision selects and justifies the runtime, schema, record layout,
  distribution boundary, lock semantics, migration, and rollback strategy.
- [ ] Normal reads are bounded and disclose filters, totals, omissions, truncation,
  continuation state, schema version, and integrity status; exact-ID and dependency
  queries retain terminal records.
- [ ] Mutations use semantic commands, validate the complete store, reject stale writes
  and unsafe paths, and replace records atomically under a repository-wide lock.
- [ ] `doctor` fails closed on malformed schemas, duplicate IDs, invalid transitions,
  dependency cycles, inconsistent scheduling state, merge markers, and direct-edit
  corruption without auto-repairing or making semantic judgments.
- [ ] A dry-run-first, escaping-aware importer proves field-for-field migration from
  active and archived Format 1 rows and supports rollback from the prior Git commit.
- [ ] Task archives are no longer needed after cutover; default queries hide terminal
  records without making them undiscoverable.
- [ ] Package, installer, bootstrap, process, template, and CI surfaces use one canonical
  tool implementation and cannot silently fall back to hand-edited task state.
- [ ] Tests cover malformed and oversized input, interruption, concurrency, stale
  revisions, lock ownership, symlink/path substitution, schema evolution, collision,
  deterministic output, and representative 10,000-task bounded-query performance.

## Constraints

- Repository files and Git history remain the only durable project memory and audit
  trail.
- Raw records remain human-inspectable for review and recovery, but direct mutation is
  unauthorized.
- Do not implement structured mutation with shell delimiter parsing, regex, `awk`, or
  `sed`.
- Apply this repository's Adopt/Revise/Reject policy; do not use a Pilot disposition.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: it crosses storage, process, package, installer, migration, and CI
  ownership and needs independently verifiable slices.
- Why this risk gate: it changes the authority and migration boundary for durable task
  state and adds a required runtime.
- Upstream artifacts required: T-0017 and T-0018 assessments, Decision 0008, current
  task/cursor schemas, packaging and installer decisions.
- Escalation trigger: no runtime satisfies supported-host portability, or migration
  cannot preserve every legacy field without ambiguity.

## Verification Plan

- Automated checks: schema/unit/integration tests, negative fixtures, migration
  round-trip, deterministic export, package/install inventory, CI doctor, concurrency
  and interruption tests, and a 10,000-task performance smoke test.
- Manual checks: Git diff readability, raw-record recovery, clean-install and existing-
  project collision workflows, and rollback rehearsal.
- Documentation checks: local links, budgets, package boundary, bootstrap cold start,
  task lifecycle, resumption, archive removal, and changelog/decision consistency.
- Counterfactual evidence: demonstrate legacy malformed/escaped rows fail or misparse
  under the old ad hoc path and are rejected or imported correctly by the new boundary.

## Done When

- The accepted architecture is implemented, the task store is migrated in one cutover,
  all required checks and independent high-risk gates pass, and no active workflow
  depends on the hand-edited Markdown catalog.
