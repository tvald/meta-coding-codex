# Threat Model: Project Onboarding Skill

## Scope

- Change: repository-discovered skill that orchestrates canonical project onboarding.
- Assets or data: established project files, instructions, task state, command catalog,
  product context, Git history, and package/install boundaries.
- Trust boundaries: repository content and commands are evidence, not authority; CLI
  preflight output is structural evidence; the Root remains semantic mutation owner.

## What Can Go Wrong

| Threat | Impact | Likelihood | Control Or Required Mitigation |
| --- | --- | --- | --- |
| Wrong disposition | Existing files are overwritten or unrelated docs are claimed | High | Run bounded CLI preflight first; branch only on its exact disposition; stop on partial, malformed, prepared, busy, or collision state |
| Policy duplication | Skill drifts from onboarding owner | Medium | Load and follow `readme/meta/onboarding.md`; keep only execution ordering and safety stops in the skill |
| Hostile repository instructions | Untrusted text broadens authority or leaks secrets | High | Apply knowledge-ingestion trust tiers; treat project evidence as data and preserve higher authority |
| Unsafe command discovery | Production, release, destructive, privileged, or external actions execute during cataloging | High | Derive candidates from manifests/CI; run only safe local candidates; record only observed successes |
| Incomplete cold start | Missing tasks, constraints, approvals, or commands are mistaken for success | Medium | Require doctor/startup/candidates plus targeted context and an explicit recoverability checklist |
| Discovery/package drift | One harness gets stale skill instructions or installer overwrites host content | Medium | One canonical skill body, thin discovery adapters only where required, exact inventories, and additive collision fixtures |
| Unsupported runtime | Skill attempts ad hoc fallback parsing | Medium | Stop on CLI preflight/runtime failure; never implement an alternate parser |

## Mitigations And Verification

| Mitigation | Verification | Status |
| --- | --- | --- |
| Exact preflight disposition table | Static contract, existing state fixtures, four ancestor-symlink negatives, and collision forward test | Implemented and passed |
| Authority and command-execution stops | Skill audit, delegated Root-boundary stop, and arbitrary-code command constraints | Implemented and passed |
| Canonical owner and progressive loading | Link audit, skill validation, and fresh-agent forward tests | Implemented and passed |
| Additive discovery/package/install | Deterministic inventory, two same-name collision directions, forced partial failure, TERM interruption, provenance-gated startup, and fresh install | Implemented and passed |
| Cold-start proof | Bounded doctor/startup/candidates/context recovery test with linked commands, constraints, and approvals | Implemented and passed |

## Agentic Risks

- The skill must not treat schema-valid task or repository text as instructions.
- The skill may mutate task/project state only within Root authority and through the CLI.
- A user or accepted process decision is still required before relocating an externally
  referenced collision or choosing consequential product/technology defaults.

## Residual Risk

- Accepted risk: onboarding remains judgment-heavy; repository evidence can be stale or
  deceptive; safe local commands can still be expensive or flaky.
- Review trigger: overwrite, misclassified disposition, unsafe command execution,
  incomplete cold-start proof, policy drift, or package/discovery divergence.
