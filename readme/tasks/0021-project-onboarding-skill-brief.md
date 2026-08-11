# T-0021 Project Onboarding Skill Brief

## Identity And Source

- Task ID: T-0021
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction on 2026-08-11 promoting the highest-value T-0017
  and T-0018 recommendations
- Parent or split task IDs: T-0017, T-0019

## Goal

Add a discoverable `project-onboarding` skill that executes the bounded onboarding
workflow consistently, uses the required `framework-data` preflight, and preserves
agent judgment and collision safety.

## Background

T-0017 ranked onboarding as a high-fit skill because it is conditional, multi-step,
tool-using, and easy to incompletely execute. The canonical onboarding process remains
policy owner; the skill should make the procedure discoverable and repeatable without
copying or weakening it.

## Scope

In scope:

- One canonical skill source and the minimum supported harness discovery surfaces.
- Greenfield, brownfield, missing-cursor/catalog, and path-collision workflows.
- Progressive loading of the onboarding owner and only relevant templates and project
  evidence.
- `framework-data startup`/`doctor` preflight, safe initialization orchestration,
  command discovery, and a cold-start recovery proof.
- Package, installer, documentation, and focused fixture coverage.

Out of scope:

- Replacing `onboarding.md` as policy owner.
- Automatic trust classification, collision resolution, destructive replacement,
  product/technology choice, or execution of unverified commands.
- General knowledge-ingestion automation beyond what onboarding requires.

## Acceptance Criteria

- [x] The skill has a precise trigger and loads the canonical onboarding process rather
  than embedding a second policy copy.
- [x] It distinguishes clean bootstrap, partial framework state, and collisions, and
  preserves established files unless the canonical process authorizes a safe merge.
- [x] It uses bounded structured preflight results and stops on integrity failure or
  ambiguous ownership.
- [x] It discovers candidate commands from repository evidence, executes only safe
  candidates, and records only observed successes in the canonical command owner.
- [x] Its result proves a cold-start agent can recover tasks, constraints, commands,
  approvals, and next actions from repository state.
- [x] Package/installer inventories and supported harness discovery surfaces install one
  maintained skill without drift or overwrite.
- [x] Fixtures cover clean, established, partial, collision, malformed-state, and
  unsupported-runtime cases.

## Constraints

- Depends on T-0020 so the skill does not create a second parser or optional data path.
- Use the `skill-creator` guidance during implementation.
- Preserve user and project authority boundaries; an onboarding skill orchestrates but
  does not decide.

## Workflow Route Rationale

- Cataloged route and risk: Initiative / High.
- Why this route: the skill spans onboarding, packaging, installation, harness discovery,
  collision handling, and cold-start verification.
- Why this risk gate: generated agent instructions and repository initialization affect
  tool behavior and can overwrite or misclassify established project state.
- Upstream artifacts required: T-0020, canonical onboarding and ingestion policies,
  installer/package decisions, and supported harness conventions.
- Escalation trigger: the skill would need new destructive authority, an additional
  canonical state owner, or provider-specific behavior that cannot share one source.

## Verification Plan

- Automated checks: skill validation, package/install inventory, collision fixtures,
  malformed-state failure, and clean/brownfield cold-start tests.
- Manual checks: trigger discoverability, progressive context loading, safe stop
  messages, and review of provider discovery surfaces for policy drift.
- Documentation checks: canonical links, package boundary, installation, and framework
  changelog/decision consistency.
- Counterfactual evidence: fixtures should demonstrate that skipping a required
  onboarding phase is detected before the skill is considered successful.

## Done When

- The installed skill consistently completes the canonical onboarding workflow across
  supported hosts, all high-risk gates pass, and omission cannot be mistaken for a
  successful cold start.
