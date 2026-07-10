# Threat Model: Agent Adapter Pilot

## Scope

- Change: Root Claude instruction discovery and project-scoped Codex/Claude agent files.
- Assets or data: User authority, canonical framework policy, repository integrity,
  verification truth, token budget, and shared project documentation.
- Users, systems, or agents involved: Product owner, Root Orchestrator, Codex, Claude
  Code, named subagents, framework adopters, and Git.
- Trust boundaries: Canonical Markdown core versus vendor-native adapters; parent agent
  authority versus subagent tools; package source versus destination-project settings.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Adapter becomes a competing process owner | Roles drift or safety gates are skipped | Medium | One-home rule | Vendor files do not yet have a bounded adapter contract |
| Agent description triggers unnecessary delegation | Token use and coordination overhead increase | Medium | Prefer one agent by default | Native discovery may infer role use from descriptions |
| Reviewer or Security Reviewer modifies files | Independent evidence is contaminated | Low | Role scopes say review only | Native tool restrictions are not yet configured |
| Verifier changes source through shell commands | User or concurrent work is disturbed | Medium | Preserve unrelated work | Tests need write-capable execution but direct edits must be constrained and reported |
| Packaging overwrites host agent configuration | Existing project behavior is lost | Low | Preserve unrelated work | Package steps do not yet cover vendor adapter merging |
| Vendor schema drifts or an adapter is ignored | Expected quality gate silently does not run | Medium | Current primary documentation | No local adapter validation or pilot sunset exists yet |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Keep all role semantics in `readme/meta/agent-definitions.md` | Root Orchestrator | Duplication and link review | Done |
| Give Reviewer and Security Reviewer read-only defaults | Root Orchestrator | Vendor configuration inspection | Done |
| Make Verifier inherit parent policy, remove Claude direct-edit tools, and require worktree status before/after | Root Orchestrator | Definition and scenario review | Done |
| Omit model pins, MCP, hooks, nested delegation, and permission bypasses | Root Orchestrator | Schema-field scan | Done |
| Require merge-not-overwrite packaging and make adapters optional | Root Orchestrator | Package instructions review | Done |
| Validate with installed clients where safely exposed and set a pilot review trigger | Root Orchestrator | Verification record and Decision 0005 | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Repository agent files are trusted project
  instructions only after the adopter trusts the repository; they link canonical owners
  and do not ingest external prompt text.
- Tool permission risk: Reviewer and Security Reviewer declare read-only defaults and
  no-write behavior. Verifier needs shell access for checks but inherits parent sandbox
  and approval authority and may not edit source.
- Dependency, script, or generated-code risk: No executable adapter, dependency, hook,
  generator, or copied external code is introduced.
- Secret or sensitive-data exposure risk: No secrets or private services are configured;
  adapters add no MCP servers or environment access.
- CI/CD or deployment permission risk: No CI/CD, deployment, release, or production
  permissions are added.

## Residual Risk

- Accepted risk: A shell-enabled verifier can create normal test artifacts or run a
  poorly behaved project command. Parent runtime overrides can also take precedence
  over an adapter's narrower defaults. Parent sandbox/approval policy, before/after
  status, and main-thread review remain required controls.
- Approval or decision record: [Decision 0005](../decisions/0005-pilot-optional-agent-adapters.md)
- Review trigger: Five eligible non-trivial tasks, 2026-08-09, a permission or ownership
  violation, or a vendor schema/discovery failure, whichever occurs first.
