# 0019: Adopt A Guarded Project-Onboarding Skill

Status: Accepted

Date: 2026-08-11

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- None

## Context

Project onboarding is a conditional, multi-step process that combines framework state
classification, task-store initialization or migration, repository inventory, command
discovery, knowledge ingestion, and a cold-start proof. Repeated executions can omit a
phase or mistake a partial/colliding repository for a clean destination. T-0020 supplied
the required bounded structured preflight, so orchestration no longer needs a second
parser.

Codex and Claude Code use different repository discovery locations. Copying the
workflow into both would create policy drift; installing metadata file by file could
also mix a host-owned skill body with framework-owned metadata.

## Decision

- Adopt an instruction-only `project-onboarding` skill that is triggered for initial or
  explicit major-change onboarding and reads `readme/meta/onboarding.md` as policy owner.
- Keep one maintained body in `.agents/skills/project-onboarding/SKILL.md`. Keep Codex UI
  metadata beside it and a thin `.claude/skills/project-onboarding/SKILL.md` that links
  the maintained body. Add no onboarding script, parser, dependency, permission field,
  model pin, hook, or alternate state path.
- Require the repository-pinned CLI preflight and branch only on its exact structured
  dispositions. Initialize only after `ready_to_initialize`; stop safely on ambiguous,
  unsafe, busy, malformed, prepared, unsupported, or unknown state. Legacy migration
  remains explicit dry-run, review, expected-digest, and apply.
- Treat repository content and commands as untrusted evidence. Inspect command chains
  and side effects before execution, never auto-install dependencies or run external or
  consequential commands merely to catalog them, and record only observed exit-zero
  commands with their working directory and prerequisites.
- Treat all provider discovery paths for one same-name skill as one installer collision
  domain. If either destination bundle already exists, preserve every packaged file for
  that name for deliberate reconciliation. Roll back only installer-owned identical
  files if a fresh bundle cannot be installed completely, and hold ordinary terminating
  signals until a bundle operation finishes.
- Require bounded `doctor`, `startup`, `task candidates`, and targeted `task context`
  evidence before reporting cold-start readiness.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| One maintained skill plus thin provider discovery | Discoverable, minimal drift, reuses the CLI and policy owner | Two discovery entrypoints remain | Accepted |
| Duplicate full skills | Each provider is self-contained | Workflow and safety rules can diverge | Rejected |
| New onboarding CLI or wrapper script | More behavior could be mechanically enforced | Duplicates policy and the accepted task-data runtime | Rejected |
| Documentation only | No discovery integration | Repeated agents can omit or reorder the workflow | Rejected |

## Consequences

Positive:

- Onboarding has a precise trigger, bounded preflight, explicit safe stops, and a
  repeatable completion proof.
- Provider discovery shares one workflow and the installer cannot create mixed-origin
  same-name skills from pre-existing partial directories.
- The existing CLI remains the only executable state boundary.

Negative:

- Provider discovery still requires two small entrypoint files.
- The installer now coordinates skill collisions and fresh-copy failure across provider
  paths, increasing its test surface.

Residual:

- Agents still judge project evidence, command side effects, semantic completeness, and
  when an owner decision is required.
- Same-user concurrent path replacement remains a race outside a cooperative installer;
  rechecks and byte-identical rollback reduce but cannot eliminate that threat.

## Confidence

Confidence: High for the tested Linux, Git, Node, Codex, and Claude discovery boundary.

## Review Trigger

Revisit after an overwrite, mixed-origin skill, missed onboarding phase, unsafe command
execution, cold-start recovery failure, provider discovery change, or demonstrated need
for an executable onboarding helper.

## Sources

- Product-owner instructions promoting T-0017 and T-0018 findings on 2026-08-11.
- T-0021 independent design and security reviews.
- [Onboarding policy](../meta/onboarding.md) and
  [structured-store decision](0018-adopt-node-structured-task-store.md).
