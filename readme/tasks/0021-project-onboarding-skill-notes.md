# T-0021 Project Onboarding Skill Notes

## Task Identity

- Task ID: T-0021
- Brief: [T-0021 brief](0021-project-onboarding-skill-brief.md)
- Started: 2026-08-11
- Last updated: 2026-08-11
- Accepted task revision: r1

## Execution Checkpoint

- Completed safe increment: implemented one canonical instruction-only onboarding
  skill, thin Claude discovery, fail-closed preflight ancestor checks, cross-harness
  atomic skill collisions, package/install integration, and focused fixtures.
- T-0020 is Done in `22412d0`; T-0021@r2 is Done at record version 7 with all
  resumable evidence linked through structured task context.
- The skill-creator initializer and both required skill validations passed using the
  temporary Python 3/PyYAML environment.

## Plan

- [x] Establish readiness and threat boundaries.
- [x] Obtain independent design and security preimplementation reviews.
- [x] Initialize and implement the canonical skill and minimum discovery adapter.
- [x] Add disposition, package, installer, collision, and cold-start fixtures.
- [x] Run skill validation and clean/collision forward tests.
- [x] Complete independent current-tree review and verification.
- [x] Close and commit T-0021 before activating T-0022.

## Worker Roster

| Worker | Assignment | Ownership | Status | Output |
| --- | --- | --- | --- | --- |
| Design reviewer | Skill/discovery/package/test architecture | Read-only | Complete | Ready with concerns; one body, thin adapter, no new runtime, bundled collision domain |
| Security reviewer | Collision, authority, command, and hostile-content pre-mortem | Read-only | Complete | Two blocking guardrails identified and implemented: ancestor checks and atomic skill preservation |
| Clean forward tester | Minimal-context uninitialized established fixture | Disposable fixture only | Complete | Initialized safely, verified `node --test`, and stopped at Root-only `task add` boundary |
| Collision forward tester | Minimal-context published-cursor collision fixture | Disposable fixture only | Complete | No mutation; exact `collision` stop and owner-decision handoff |
| Final Reviewer | Current-tree correctness, drift, and evidence audit | Read-only | Complete: Pass | Provenance, ordering, and signal findings resolved; no blockers |
| Final Security reviewer | Current-tree trust and path audit | Read-only | Complete: Pass | No Critical or High blocker; residual risks documented |
| Final Verifier | Full current-tree runnable verification | Read-only | Complete: Pass | 30 tests, validators, 46-entry package, installer matrix, lint, doctor, and context pass |
| Root Orchestrator | Canonical implementation and disposable Root completion | T-0021 files and fixture | Complete | Closed T-0021 with four linked evidence owners and final gate evidence |

## Usage Capacity

- Last authoritative reading: 2026-08-11 after final verification.
- Advertised windows: generic weekly 32% consumed; model-scoped weekly 0%; five-hour
  not advertised.
- Limiting windows: none; both weekly buckets remain below the 98% cutoff.

## Verification State

- `node --test tests/framework-data-project-onboarding.test.mjs
  tests/framework-data.test.mjs`: 30 passed in the isolated final run.
- Skill-creator `quick_validate.py`: canonical Codex skill and thin Claude adapter both
  valid.
- Shell syntax and ShellCheck 0.10.0: pass for package, installer, and fixture scripts.
- Yamllint 1.37.1 and Actionlint 1.7.12: pass.
- Installer fixtures: fresh install, canonical partial collision, Claude-only collision,
  forced mid-bundle failure rollback, TERM after first-file verification between bundle
  files, and established `AGENTS.md` preservation pass.
- Two package builds are byte-identical with 46 entries and SHA-256
  `4b77df022a622b85cb61b866af10b70ca163f954d464aac0d9f51eef6001f674`.
- Clean Root proof: doctor, startup, candidates, targeted context, and `node --test` pass;
  the disposable onboarding task closed Done. Collision proof: no fixture mutation.
- Repository doctor, terminal staged doctor (28 staged paths; 10 framework paths), link
  checks, document budgets, workflow lint, and diff check pass.

## Review Findings Resolved

- Preflight now rejects `readme` or `readme/tasks` symlinks before classifying a clean
  state; four absent/recognized external-target fixtures prove no outside write.
- Installer collision state is snapshotted by skill name across both discovery roots.
  Any pre-existing side preserves the full bundle; a fresh mid-copy failure removes only
  still-owned hard links, and normal termination signals remain blocked until the whole
  bundle is complete.
- Portable AGENTS guidance uses the skill only after framework ownership or explicit
  reconciliation; discovery alone cannot authorize a preserved host-owned skill.
- Repository commands are treated as arbitrary code, dependency installation and
  consequential/external commands are prohibited by default, and only observed exit-zero
  commands enter standards with cwd and prerequisites.
- Forward testing clarified that assigned file initialization does not grant a delegated
  agent Root-only semantic task mutation, and task capture now occurs immediately after
  initialization or migration before repository inventory.

## Next Safe Action

Create the required task-scoped local commit from the verified staged boundary.
