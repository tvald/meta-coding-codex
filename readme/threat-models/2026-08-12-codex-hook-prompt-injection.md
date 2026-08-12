# Threat Model: Codex Hook Prompt Injection

## Scope

- Change: package-compiled developer-context injection through project Codex hooks and
  exact custom agents, with guarded installed-client delivery.
- Assets or data: semantic prompt authority, delegated-role boundary, package/client
  roots, existing `.codex` policy, hook event data, task state, and tool permissions.
- Users, systems, or agents involved: client maintainers, Root Orchestrators, delegated
  agents, immutable package runtime, npm, Git, and Codex 0.147.0.
- Trust boundaries: package facets/compiler are reviewed immutable inputs; hook events,
  mutable client paths, project trust, administrator policy, and model behavior are not.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Event field selects root or wrong delegated profile | Worker receives excess or incorrect authority | High | Exact project matchers, fixed commands, and runtime event/profile validation | Independent review pending |
| Hook input reaches shell/path/compiler selectors | Command injection, arbitrary reads, or policy injection | Medium | Static command and bounded JSON schema | Independent security review pending |
| Large output spills to a file preview | Model works from incomplete policy | Medium | `additionalContextLimit = 0` and prompt aggregate limit | Mitigated and tested at maximum |
| Root compile failure lets work continue | Session lacks framework authority controls | High | Stop response plus `AGENTS.md` fallback | Provider policy can disable hooks; fallback remains required |
| Delegated compile failure still starts child | Tool work without assigned policy | High | Static manifest envelope/profile guard | Codex cannot stop child mechanically |
| Existing `.codex` files are overwritten or merged | Client policy loss or malicious mixed hook | High | Read-only preflight, exclusive fixed inventory, collision refusal | Mitigated and tested |
| Path link/race redirects installation | Arbitrary client/outside write | High | Validated physical root and guarded descriptor transaction | Mitigated and tested |
| Package update leaves incompatible config | Old dispatch binds to new prompt contract | Medium | Versioned compatibility and exact preflight | Mitigated by replacement/rollback matrix |
| Specialist recursively delegates | Authority and WIP controls are bypassed | Medium | Per-agent `features.multi_agent = false`, static prohibition, and parent policy | Provider behavior remains version-coupled |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Closed harness/profile/event schemas with bounded one-write output | T-0033 | Unit, mutation, and failure fixtures | Done |
| One fixed project-hook command per exact `meta_` `agent_type` | T-0033 | Static snapshots, mismatch tests, and live 0.147.0 probe | Done |
| Full-context root/delegated hook configuration | T-0033 | Maximum extension prompt inspection | Done |
| Thin missing/mismatch guard plus disabled child multi-agent tools | T-0033 | Manifest snapshots and live tool-absence probe | Done |
| Preserve-first opt-in Codex integration transaction | T-0033 | Collision/link/race/interruption/rollback matrix | Done |
| Minimal exact-local `AGENTS.md` fallback | T-0033 | Disabled/failure fixtures | Done |
| Compatibility metadata and package audit | T-0033 | Source/packed replacement/rollback tests | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: event fields never become instructions;
  only the reviewed package compiler and allowlisted extension loader contribute text.
- Tool permission risk: custom agents declare least-privilege sandboxes, but parent
  configuration may override them and static policy remains required.
- Dependency, script, or generated-code risk: automatic hooks invoke the fixed local
  source or installed-package entrypoint below a quoted Git-root substitution and bypass
  mutable client npm scripts. Nested-cwd and metacharacter-root fixtures prove the root
  text remains one shell word; no network, global framework binary, `npx`, or eval exists.
- Secret or sensitive-data exposure risk: hook results contain no event, environment,
  path, account, task, or arbitrary repository content.
- CI/CD or deployment permission risk: integration is local and does not commit,
  install, publish, fetch, or contact a provider.

## Residual Risk

- Accepted risk: `SubagentStart continue: false` does not stop a child. Thin manifest
  guards stop tool work on a missing/mismatched envelope, while
  `features.multi_agent = false` mechanically removes nested delegation on the
  supported release.
- Accepted operational constraint: the root and four delegated hook definitions use
  distinct commands and therefore distinct Codex trust hashes; maintainers must review
  and trust all five definitions in the shared hook file.
- Accepted compatibility constraint: the adapter publishes its tested Codex versions
  but cannot detect the running one; operators review another version or disable the
  integration and use the portable fallback.
- Accepted environment constraint: hook launch relies on the operator-provided `node`
  and `git` executables on `PATH`; package and client-root validation begins after those
  reviewed prerequisites resolve.
- Approval or decision record:
  [Decision 0022](../decisions/0022-adopt-codex-hook-prompt-injection.md).
- Review trigger: wrong/missing profile, continued work after failure, escaped or partial
  client write, client-policy overwrite, prompt spill, provider-version drift, or a new
  mechanical nested-delegation control.
