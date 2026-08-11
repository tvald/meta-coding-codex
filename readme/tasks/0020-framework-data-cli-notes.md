# T-0020 Framework Data CLI Notes

## Task Identity

- Task ID: T-0020
- Catalog: `readme/tasks/README.md`
- Brief: [T-0020 brief](0020-framework-data-cli-brief.md)
- Started: 2026-08-11
- Last updated: 2026-08-11
- Accepted task revision: r1

## Execution Checkpoint

- Completed safe increment: implemented and live-migrated the dependency-free Node ESM
  store, semantic CLI, Format 1 importer, integrated doctor, process/template cutover,
  and package/install/CI boundary. The 26-test suite and integration matrix pass.
- Current repository state: baseline `c5e7278` plus the complete T-0020 cutover. The live
  store contains 22 migrated tasks, with T-0020 Active and T-0021/T-0022 Pending.
- Resume constraints: keep the Root Orchestrator as the sole writer of shared framework,
  task, decision, quality, and threat-model records until reviews are reconciled.

## Plan

- [x] Complete readiness, architecture decision, and threat model.
- [x] Implement and test the dependency-free Node task store, CLI, schemas, and importer.
- [x] Migrate task records and cut process/template/bootstrap owners to the CLI.
- [x] Update packaging, installer, CI, documentation, decisions, and source history.
- [x] Complete final independent code, security, and verifier refreshes on the current tree.
- [x] Close T-0020 through the CLI for inclusion in its task-scoped commit.

## Worker Roster

| Worker | Assignment | Owned Files Or Domains | Status | Expected Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| Architecture reviewer | T-0020@r1 runtime, schema, command, packaging, and migration decision review | Read-only repository analysis | Complete | Recommended Node ESM, one-file derived-primary design, explicit migration/upgrade/rollback limits | No restart needed |
| Security reviewer | T-0020@r1 trust-boundary and negative-fixture review | Read-only repository analysis | Complete | Ready with concerns after atomicity, canonical JSON, CAS, path, query, and migration controls | No restart needed |
| Integration inventory reviewer | T-0020@r1 package/install/process/template/test surface inventory | Read-only repository analysis | Complete | File-by-file cutover, migration, package, upgrade, fixture, and ownership matrix | No restart needed |
| Final code reviewer | T-0020@r1 correctness, scale, interruption, and evidence audit | Read-only current-tree review | Complete: Pass | No implementation or process blocker | No restart needed |
| Final security reviewer | T-0020@r1 trust boundary and crash-consistency audit | Read-only current-tree review | Complete: Pass | No security blocker on Linux local filesystems | No restart needed |
| Final verifier | T-0020@r1 independent test, migration, package, install, and cold-start matrix | Read-only verification | Complete: Pass | Final hash and evidence reconciled | No restart needed |

## Usage Capacity

- Last authoritative meter reading: 2026-08-11 during final delegated review.
- Advertised windows: generic weekly 26% consumed; model-scoped weekly 0% consumed;
  five-hour not advertised.
- Limiting windows: none; both advertised windows are below the 98% weekly cutoff.
- Wake method and resume condition: not applicable while capacity remains below cutoff.

## Repository And Verification State

- Changed files: T-0020-owned framework policy/templates, project records, package,
  installer, workflow, task state, and this note; the implementer alone owns CLI/tests.
- Recent commits: `c5e7278` promoted T-0020 through T-0022.
- Commands already run: 26-test Node suite; live doctor/startup; exact migration and
  rollback rehearsals; deterministic 43-file package; fresh mocked install/init/doctor/
  startup; unsupported-Node negative; Node and shell syntax; ShellCheck 0.10.0;
  Actionlint 1.7.12; yamllint 1.37.1; inventory comparison; `git diff --check`.
- Review findings resolved: exact pagination liveness, aggregate and directory bounds,
  importer allocation/scheduling limits, terminal-safe output, outside-canonical crash
  staging, empty/malformed lock recovery, process/AGENTS budgets, and staged close proof.
- Required checks remaining: none. The terminal T-0020 record and this evidence are
  ready for staged doctor and the required local task commit.
