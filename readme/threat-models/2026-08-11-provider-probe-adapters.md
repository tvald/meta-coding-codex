# Threat Model: Package Provider Probe Adapters

## Scope

- Change: package-owned normalized quota and delegation-capability commands for Codex
  and Claude Code.
- Assets or data: Claude OAuth bearer credential, provider quota windows, delegation
  availability, client dependency/lock identity, process environment, and Root capacity
  decisions.
- Users, systems, or agents involved: Root Orchestrator, immutable package CLI, Codex
  and Claude executables, Codex App Server, Anthropic OAuth usage service, and client Git
  repository.
- Trust boundaries: client PATH/environment and provider process/network output are
  untrusted; the package adapter may invoke a physically resolved provider executable;
  the Claude credential exists only inside a package-owned child.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Missing/malformed window is treated as safe | Delegation exhausts provider capacity before Root integration | Medium | Capacity guard treats unknown as cutoff | Exact full-reading normalization and negative fixtures required |
| Claude token or raw response reaches parent/session | Account compromise or sensitive-data disclosure | Low | Prior subprocess-containment contract | Credential must remain in the package child; parent accepts normalized fields only |
| Provider stderr/account/billing fields leak | Sensitive metadata enters model logs | Medium | Bounded CLI envelope | Discard all provider diagnostics and reject unknown output shapes |
| Client shadows `codex` or `claude` in PATH | Project code executes with provider credentials | Medium | Explicit local framework binary | Exclude client root and all `node_modules/.bin` entries before provider lookup |
| Loader or npm environment injects provider child code | Credentials or telemetry are stolen/altered | Medium | No shell invocation | Scrub npm, Git, Node loader, dynamic-library, and shell-startup variables |
| App Server or provider child remains running | Resource leak or stale telemetry reuse | Medium | Stateless command boundary | Close input, terminate/escalate, await exit, and test cleanup |
| Capability evidence grants authority | Agent delegates without project authorization or safe quota | Medium | Agent definitions own delegation policy | Output states only observed provider-surface availability and documents its limits |
| Provider schema grows beyond bounds | Memory/CPU exhaustion or partial parse | Low | Dependency-free local process | Bound time, bytes, line size, message/window count, and final envelope |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| One manifest-versioned provider-neutral envelope and safe-stop exit contract | T-0032 | Exact CLI/version assertions and syntax/unsupported mutations | Done |
| Complete finite `0..100` window validation with shared 95/98/99 cutoffs | T-0032 | Multi-bucket, model, boundary, duplicate, unknown-group, empty, drift, and oversize fixtures | Done |
| Package/client alias validation before provider execution | T-0032 | Foreign Git/package root and outside-PATH client-target symlink sentinels | Done |
| Sanitized physical provider executable resolution with no shell | T-0032 | Hostile client PATH and environment injection fixtures | Done |
| One initialized/full-read Codex App Server child with deterministic cleanup | T-0032 | Stateful fake server, EPIPE/protocol errors, bounds, process groups, descendant cleanup, and sentinels | Done |
| Claude credential and HTTPS request confined to one package-owned child | T-0032 | Injected credential/fetch tests plus parent-output and auth/error redaction checks | Done |
| Read-only delegation probes with no authority claim | T-0032 | Effective feature/agent surface enabled, disabled, drift, absent, and live local fixtures | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: provider output is parsed as data and can
  select only enumerated dispositions/reasons; no provider text becomes instructions.
- Tool permission risk: capability evidence never grants authority, expands permissions,
  or proves the current parent has a callable delegation tool.
- Dependency, script, or generated-code risk: the package remains dependency-free and
  invokes absolute physically resolved executables without a shell or install hook.
- Secret or sensitive-data exposure risk: only the Claude child reads the bearer token;
  parent stdout contains normalized windows or generic reasons and never raw diagnostics.
- CI/CD or deployment permission risk: probes are local read-only commands; no account
  mutation, reset-credit use, token refresh, publication, or deployment is authorized.

## Residual Risk

- Accepted risk: same-user replacement of a global provider executable and compromise of
  the provider CLI itself are outside package isolation. Claude's OAuth usage endpoint is
  non-public and may drift; drift fails closed, as the live local quota probe did during
  final verification. A capability probe demonstrates only the observed local surface.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: credential/provider text in output, false `proceed`, orphan process,
  client executable invocation, provider-schema drift, or authority inferred from an
  enabled capability.
