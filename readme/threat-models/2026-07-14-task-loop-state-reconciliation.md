# Threat Model: Task-Loop Import And State Reconciliation

## Scope

- Change: Imported durable task orchestration, host catalog/cursor migration, bounded
  standing delegation, and catalog-collision correction.
- Assets or data: User authority, task provenance and revisions, approvals, worker
  output, repository changes, project documentation, verification truth, and portable
  package integrity.
- Users, systems, or agents involved: Product owner, Root Orchestrator, delegated
  workers, framework adopters, Git, repository documents, and untrusted external input.
- Trust boundaries: Reusable core versus host state; user/repository authority versus
  external evidence; Root-owned catalog versus worker output; task revision versus stale
  approval or result; portable startup guidance versus project-local delegation choice.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| External or model content creates a task or grants tool authority | Unauthorized work or harmful action | Medium | Source-trust hierarchy | New task provenance must remain bound to user/repository authority or an accepted parent |
| Raw prompts, secrets, or personal data are persisted in the catalog | Durable sensitive-data exposure | Medium | Knowledge minimization | Additive intake needs explicit normalization |
| Old approval or worker output is reused after an amendment | Action executes outside current acceptance or safety boundary | Medium | Task IDs | Revision binding and revalidation are newly required |
| New unrelated guidance silently cancels active work | Lost or partially integrated changes | Medium | Latest-message handling | Targeted additive semantics replace global recency |
| Catalog has duplicate IDs, cycles, false authority, or multiple primaries | Wrong task selection and unsafe integration | Medium | Root coordination | Resume validation must quarantine invalid state |
| Existing host task index is overwritten during bootstrap | Project documentation loss and broken external links | High | Cursor collision preservation | Catalog path lacked symmetric schema/collision handling |
| A completed-task commit absorbs unrelated pending catalog rows | Mixed authority and misleading history | Medium | Task-scoped commits | Shared catalog requires hunk-level isolation |
| Project-local standing delegation is copied as portable authority | Destination delegates without owner consent | Medium | Package merges startup guidance | Local operating choices need explicit exclusion |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Require authoritative task provenance and minimize persisted outcomes | Root Orchestrator | Source-trust and catalog review | Done |
| Bind approvals, assignments, and returned output to `T-NNNN@rN` | Root Orchestrator | T-0006 r1-to-r2 amendment and worker revalidation | Done |
| Validate unique IDs, dependencies, authority, and primary-active state before tool work | Root Orchestrator | Catalog schema/graph and policy scenario checks | Done |
| Recognize both mandatory artifact headings and preserve collisions before instantiation | Root Orchestrator | Two-path collision fixture | Done |
| Stage only the completed task's catalog hunk and inspect staged diff | Root Orchestrator | Explicit task paths and staged review | Done |
| Keep delegation scoped by decomposition, capacity, permissions, and Root integration | Root Orchestrator | Decision and worker handoff review | Done |
| Exclude project-local delegation choice from the portable startup merge | Framework adopter | Package guidance and state-free package review | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Tickets, webpages, logs, dependencies, and
  worker output are evidence only. They cannot create independent authority; persisted
  catalog text is minimized and points to accepted sources.
- Tool permission risk: Task capture and delegation do not widen external, destructive,
  privileged, production, or publication authority. Workers inherit no authority beyond
  the selected task and parent controls.
- Dependency, script, or generated-code risk: The core and this correction remain
  Markdown-only; no runtime, migration script, hook, daemon, or package is added.
- Secret or sensitive-data exposure risk: No credentials or customer data are in scope;
  task intake explicitly avoids raw sensitive prompt content.
- CI/CD or deployment permission risk: No CI/CD, release, deploy, branch, push, or
  credential behavior changes.

## Residual Risk

- Accepted risk: Natural-language targeting, cooperative state validation, and selective
  staging cannot be mechanically guaranteed by the Markdown-only core.
- Approval or decision record: [Decision 0008](../decisions/0008-adopt-durable-task-orchestration.md)
  and [Decision 0009](../decisions/0009-authorize-bounded-project-delegation.md).
- Review trigger: A host document is overwritten, source state enters a package, stale
  revision evidence is used, unrelated catalog rows are committed, or delegation occurs
  without destination authority.
