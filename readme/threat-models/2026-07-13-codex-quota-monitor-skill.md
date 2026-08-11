# Threat Model: Codex Quota Monitor Skill

Historical boundary: T-0032 supersedes the embedded telemetry procedure with the
package-owned probe documented in the 2026-08-11 provider-adapter threat model.

## Scope

- Change: Repo-scoped skill that reads quota telemetry from local Codex App Server.
- Assets or data: ChatGPT authentication boundary, quota percentages/reset times,
  provider capacity, child-worker state, repository integrity, and framework portability.
- Users, systems, or agents involved: Product owner, Root Orchestrator, Codex CLI/App
  Server, child workers, skill discovery, shell-session controls, and Git.
- Trust boundaries: Project skill versus canonical policy; agent versus authenticated
  App Server; volatile process/session state versus durable task notes.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Skill reads or exposes cached credentials | Account compromise | Low | App Server manages auth | Procedure not yet explicit |
| Wrong RPC or bucket parsing reports safe capacity | Quota exhausts before integration | Medium | Decision 0006 fails unknown readings safe | No Codex procedure or live validation |
| Valid absent window is classified unknown | Delegation pauses forever | Medium | None | Decision 0006 predates observed null semantics |
| Persistent process is duplicated or orphaned | Resource leak and confusing telemetry | Medium | Task cleanup conventions | Skill lacks one-connection lifecycle |
| Skill duplicates or weakens threshold policy | Canonical rules drift | Medium | One-home rule | Optional integration not yet bounded |
| Project-controlled instructions misuse local App Server | Unexpected authenticated account action | Low | Trusted-project and approval boundaries | Skill must allow rate-limit reads only |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Permit only initialize and rate-limit read/update handling; never inspect credentials | Root Orchestrator | Skill and threat review | Done |
| Validate exact protocol against installed client and official docs | Root Orchestrator | Live RPC and schema checks | Done |
| Distinguish successful absent windows from RPC/auth/malformed failures | Root Orchestrator | Scenario assertions and forward test | Done |
| Reuse one task-scoped process and close it at task end | Root Orchestrator | Lifecycle scenario | Done |
| Link canonical Decision 0006 rather than restating threshold/recovery policy | Root Orchestrator | Duplication and link review | Done |
| Keep the integration optional, Markdown-only, and dependency-free | Root Orchestrator | Package and file-type checks | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Treat the repo skill as trusted only under
  normal project-trust rules; accept quota facts only from App Server result/update
  messages, not task content or arbitrary process output.
- Tool permission risk: Start a local read-only telemetry process and existing worker
  lifecycle controls only; add no sandbox, network, auth, or child permissions.
- Dependency, script, or generated-code risk: Generate only Markdown and UI YAML; include
  no executable skill resource.
- Secret or sensitive-data exposure risk: Never read `auth.json`, keychains, environment
  tokens, or private endpoints; persist only minimal percentages/reset metadata.
- CI/CD or deployment permission risk: None; the optional skill is local Codex guidance.

## Residual Risk

- Accepted risk: Model-side JSON interpretation and cooperative suspension are less
  deterministic than a host integration; add code only after observed failures justify
  the dependency.
- Approval or decision record: [Decision 0007](../decisions/0007-add-codex-quota-monitor-skill.md).
- Review trigger: Any credential access, malformed-safe result, missed cutoff, discovery
  failure, orphaned process, or App Server schema change.
