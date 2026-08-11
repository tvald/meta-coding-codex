# Quality Record: Framework Data CLI And Task Store

- Date: 2026-08-11
- Change: T-0020 required CLI, structured task store, migration, and process/package
  cutover
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security Reviewer,
  integration inventory reviewer, Reviewer, and Verifier gates

## Scope And Criteria

- User-visible outcome: agents query and mutate structurally valid task state through a
  bounded deterministic CLI instead of hand-editing or loading an unbounded table.
- In scope: T-0020 brief and Decision 0018.
- Non-goals: T-0021/T-0022 skills, later registries, automatic authority/judgment, or an
  in-place installer updater.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Accepted runtime/store/cutover decision | Independent architecture and security review plus decision inspection | Decision 0018 accepted and reconciled to the implemented outside-canonical staging protocol | Pass |
| Strict bounded query and one-file mutation boundary | Unit/integration/negative/concurrency tests | 26-test suite passed, including exact pagination, aggregate caps, bounded inventories, CAS, linked worktrees, and real SIGKILL recovery | Pass |
| Complete Format 1 migration with normalization report | Dry-run/apply, semantic comparison, interruption and rollback rehearsal | Exact 22-task migration, source-hash recheck, transformation report, collision, rollback, and scheduling-consistency fixtures passed | Pass |
| Archive-free normal operation and process/package cutover | Cold start, package/install inventory, docs/templates/CI review | Live startup/export ignore archives; deterministic 43-file package and fresh mocked install/init/doctor/startup passed | Pass |
| 10,000-task bounded performance | Generated-store doctor/list smoke test with output cap | Passed in 46.4 seconds within the full suite; list/dependency outputs remained bounded and numerically ordered | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0020 brief and promoted user instruction are explicit |
| Architecture and project context | Yes | Decision 0018 selects Node ESM, one-file transitions, task layout, migration, package and rollback boundaries |
| Data, security, and permissions | Yes | Threat controls are implemented and tested; actor authentication and malicious same-user isolation remain explicit residual limits |
| Slices and ownership | Yes | Root writes implementation; independent workers are read-only reviewers; skills remain dependency-gated |
| Verification and rollback | Yes | Negative, multiprocess, interruption, migration, package, cold-start, and pre-mutation rollback checks passed on Linux |

Readiness verdict: Ready with concerns. Proceed only while the threat-model controls and
predeclared checks remain acceptance requirements.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Node unit/integration/negative tests | `node --test tests/framework-data*.mjs`: 26 passed, 0 failed in 61.0 seconds on the final Root run | Pass | — |
| Yes | Concurrent/linked-worktree and durable-write failure tests | Linked-worktree exclusion, stale/malformed lock recovery, controlled write failure, failed first-shard claim, and deterministic pre-claim SIGKILL all passed | Pass | — |
| Yes | Format 1 migration dry-run/apply/equivalence/interruption | Exact 22-task fixture and live cutover preserved fields; source digest `sha256:383d3452f3c5ca6040b6e90da11006f9dd5b90ec9ed986eaeb265a9f3cfcba37`; rollback restored byte-identical sources | Pass | — |
| Yes | 10,000-task bounded-query smoke test | Passed in 46.4 seconds inside the full suite, including 9,999-node ancestor and both-direction closures | Pass | — |
| Yes | Package, installer, workflow, and fresh cold-start checks | Two byte-identical 43-file archives, SHA-256 `a796f42940b35639ff0ad4cd0b9efec91d06e902e6ed9d3836e7e5f65dfe3bd3`; fresh install/init/doctor/startup passed; unsupported Node failed before mutation | Pass | — |
| Yes | Doctor, links, budgets, diff, deterministic archive | Live doctor/startup, Node syntax, ShellCheck, Actionlint, yamllint, shell syntax, inventory comparison, and `git diff --check` passed | Pass | — |
| Yes | Independent security, code, migration/package, and verifier review | Final code/process, security, and verifier verdicts all Pass on the current Linux tree; migration/package verification included fresh rollback and install checks | Pass | — |

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| High | State layout | Separate status/primary/control writes are not portable atomic transactions | Derive primary from one Active record; control owns pause only | Resolved in Decision 0018 |
| High | JSON parser | JSON.parse alone accepts duplicate keys | Validate allowed keys then require normalized canonical bytes | Resolved and tested |
| High | Revision model | Semantic and storage revisions can be confused | Separate taskRevision and recordVersion | Resolved in Decision 0018 |
| High | Migration | Archive links and changed inputs can normalize incorrectly | Original catalog link base, explicit transform report, source hashes/recheck | Resolved and tested |
| Medium | Direct edits | Doctor cannot prove a canonical edit used the CLI | State limitation; detect only noncanonical/invariant corruption | Resolved in Decision 0018 |
| Medium | Upgrade | Fresh installer cannot update existing cores | Document deliberate core reconciliation; do not broaden installer scope | Resolved in Decision 0018 |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: the schema, CLI, migration, process owner, package inventory,
  and current task-state cutover must land in one commit to avoid dual or absent canonical
  state. Implementation proceeds in verified internal slices before the cutover commit.
- Risk not resolved by passing checks: no actor authentication, hostile same-user
  isolation, disconnected-clone serialization, native Windows/network filesystem
  guarantee, or historical transition proof.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition: None.
- Next action: create the required task-scoped commit, then evaluate T-0021 readiness.
