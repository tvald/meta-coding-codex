# Threat Model: Framework Add-on Structure

## Scope

- Change: Agent entrypoints, reusable-framework boundary, project-state paths, packaging,
  and first-run onboarding.
- Assets or data: User authority, framework policy, project memory, verification truth,
  and repository integrity.
- Users, systems, or agents involved: Product owner, primary harness session, delegated
  agents, framework adopters, Git, and local documentation tools.
- Trust boundaries: Reusable meta policy versus mutable project documentation; package
  contents versus destination-project state; root launcher versus canonical guidance.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Agent follows an obsolete entrypoint | Required policy or state is skipped | Medium | Root AGENTS | Paths currently target the mixed layout |
| Packaged meta links to absent source state | Fresh installation starts broken | Medium | Markdown link checks | Package-only validation is not currently possible |
| Mutable history is mistaken for reusable authority | New project inherits irrelevant decisions | Medium | One-home rule | Framework and project state share one directory |
| Existing project documentation occupies the cursor path | Documentation is overwritten or external links break | Medium | Preserve unrelated work | Cursor schema and collision handling need to be explicit |
| Reset guidance deletes host documentation | Irrecoverable knowledge loss | Low | Destructive-action gate | Reset semantics need an explicit non-destructive package contract |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Require every agent to read the meta entrypoint | Root Orchestrator | AGENTS and startup-flow review | Done |
| Validate a state-free package and first-run bootstrap | Root Orchestrator | Temporary package exercise | Done |
| Keep dynamic state paths optional from reusable meta | Root Orchestrator | Package-only link check | Done |
| Detect and preserve non-cursor content at `readme/README.md` | Root Orchestrator | Onboarding and startup-flow review | Done |
| Define package-only reset and no in-place deletion command | Root Orchestrator | Entry and onboarding review | Done |
| Supersede stale path decisions explicitly | Root Orchestrator | Decision and consistency review | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: The user-approved structure is authority;
  historical records remain evidence and cannot override current meta policy.
- Tool permission risk: No external, production, release, or destructive operation is authorized.
- Dependency, script, or generated-code risk: No dependency or runtime code is added.
- Secret or sensitive-data exposure risk: No secrets or customer data are involved.
- CI/CD or deployment permission risk: No CI/CD or deployment changes are in scope.

## Residual Risk

- Accepted risk: Repository-specific root instructions must be merged correctly by each
  adopter; package checks cannot guarantee how an external project resolves conflicts.
- Approval or decision record: [Decision 0004](../decisions/0004-package-framework-as-addon.md)
- Review trigger: An adopter skips meta guidance, packages state unintentionally, or
  requires an in-place reset.
