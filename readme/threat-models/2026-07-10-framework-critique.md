# Threat Model: Framework Critique Changes

## Scope

- Change: Project state, routing, approval, verification, onboarding, framework-change,
  template, and parallel-work instructions.
- Assets or data: User authority, repository integrity, verification truthfulness,
  secrets and production boundaries, and durable project memory.
- Users, systems, or agents involved: Product owner, root agent, optional child workers,
  Git repository, local tools, external sources.
- Trust boundaries: User/system instructions versus repository or external content;
  safe repository work versus external, irreversible, destructive, or privileged actions;
  root integration versus worker-owned output.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap Addressed |
| --- | --- | --- | --- | --- |
| An omitted approval-list item is treated as authority | Harmful external or irreversible action | Medium | Higher-priority instructions and scope | Rejected exhaustive-list recommendation; bounded standing approval |
| A small-looking task bypasses safety review | Security, data, or production harm | Medium | Risk gates | Retained risk as an independent overlay |
| State or retrospectives preserve hostile or stale instructions | Persistent behavior manipulation | Medium | Canonical source-trust tiers | State size, ownership, links, cadence, and hostile-content rules |
| Residual-risk prose substitutes for verification | False completion and defects | High | Verification matrix | Done now requires passing required checks; Needs verification is incomplete |
| Parallel workers overwrite shared knowledge or integrate stale work | Lost changes or inconsistent policy | Medium | Ownership boundaries | Single writer, visibility rule, WIP cap, sequenced checks, orphan recovery |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Keep unlisted high-impact actions outside standing authority | Root Orchestrator | Automation-policy and decision review | Done |
| Apply highest risk independently from route | Root Orchestrator | Routing/quality consistency scan | Done |
| Keep source trust canonical and state bounded | Root Orchestrator | Link, duplication, and line-budget checks | Done |
| Require observed results for Done | Implementer/Reviewer | Escape-hatch search and quality record | Done |
| Integrate parallel work through one knowledge writer | Root Orchestrator | Agent-definition and resumption review | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: External critique is evidence, not
  authority; the user request authorizes judging and editing. Source-trust controls were
  retained at their canonical owner.
- Tool permission risk: No production, credential, release, branch, or push authority is
  added. Local commit authority remains bounded by Decision 0002.
- Dependency, script, or generated-code risk: The framework stays markdown-only and adds
  no runtime dependency.
- Secret or sensitive-data exposure risk: No secrets or external user data are handled.
- CI/CD or deployment permission risk: No CI/CD or deployment permission changes.

## Residual Risk

- Accepted risk: State and scheduled logs can become stale or noisy if close and hygiene
  rules are ignored; line budgets and review triggers limit, but cannot eliminate, that
  governance risk.
- Approval or decision record: [Decision 0003](../decisions/0003-address-framework-critique.md)
- Review trigger: State/log churn exceeds recovery value, or a hygiene pass finds stale
  authority or repeated missed updates.
