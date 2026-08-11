# Threat Model: Immutable NPM Framework Architecture

## Scope

- Change: package/client-root separation, derived role prompts, provider adapters,
  allowlisted extensions, thin bootstraps, and dependency-replacement updates.
- Assets or data: framework policy and executable, client task authority and project
  memory, prompt instructions, dependency lockfile, provider telemetry, and credentials.
- Users, systems, or agents involved: maintainers, npm/registry, client repositories,
  Root Orchestrators and workers, Codex/Claude harnesses, and extension authors.
- Trust boundaries: registry tarballs and extension packages are external input;
  package files are immutable resources; the client Git root is mutable; provider
  telemetry may require privileged local or authenticated access.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Wrong-root resolution | Task mutation writes into `node_modules` or package reads consume hostile client files | High | Existing task CLI safe-path and atomic-write rules | Refactor and negative fixtures required in T-0026 |
| Registry or tarball compromise | Malicious executable or policy enters every client | Medium | Direct dependency and committed lockfile; exact package inventory | Publication provenance and packed-artifact audit required in T-0025/T-0031 |
| Install lifecycle execution | Framework or extension install mutates client state or runs unreviewed code before composition validation | High | Script-disabled supported install; framework/extensions lifecycle-free; prompt extensions dependency-free | Manifest, lockfile, and hostile-extension fixtures required in T-0025/T-0028/T-0031 |
| Missing local CLI path fallback | Inherited PATH executes a hostile same-name global binary | High | Checked-in script addresses the exact local dependency-alias path | Missing-package fixture with hostile PATH binary required in T-0025/T-0031 |
| Prompt/document drift | Agent omits safety rules or follows a second policy owner | High | Stable facet IDs, canonical owners, deterministic profile metadata | Completeness/conflict/snapshot checks required in T-0027 |
| Extension instruction injection | Undeclared or hostile package changes agent behavior | High | Direct dependency plus explicit allowlist and fail-closed manifest contract | Compatibility, path, size, conflict, and negative tests required in T-0028 |
| Provider credential leak | Token, account, billing, or raw response reaches model/log output | High | Existing credential-containment rules and bounded normalized schema | Per-provider redaction/failure tests required in T-0032 |
| False-safe capacity or capability | Root starts unsafe work on missing or malformed evidence | High | Existing capacity guard treats unknown as cutoff | Normalized disposition equivalence tests required in T-0032 |
| Bootstrap or adapter drift | Codex and Claude load different semantic policy | Medium | Thin bootstraps and provider-neutral profiles | Clean-harness equivalence fixtures required in T-0029/T-0031 |
| Initializer collision or interruption | Existing bootstraps/state are overwritten or a partial client becomes runnable | High | Explicit physical-root validation, preservation, collision/symlink refusal, and staging/rollback contract | Existing-file, hostile-path, interruption, and rollback fixtures required in T-0029 |
| Unsafe dependency downgrade | Older CLI reads incompatible new client state | Medium | Separate package/data versions and explicit migrations | Compatibility matrix and rollback proof required in T-0031 |
| Arbitrary docs lookup | Identifier becomes package/client filesystem read primitive | Medium | Declared topics/facets and bounded output only | Traversal/symlink/oversize negatives required in T-0027 |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Explicit immutable package root and mutable client Git root | T-0026 | Installed binary regressions plus foreign, symlink, shadow, hostile-Git, direct-bypass, nested-Git, and package-write negatives | Done |
| Exact lifecycle-free npm inventory and versioned binary | T-0025 | `npm pack` audit, clean install, missing-dependency failure | Done |
| Explicit local CLI path | T-0025 and T-0031 | Missing dependency with hostile same-name PATH executable is never invoked | Done for focused package boundary; aggregate repeat remains T-0031 |
| Script-disabled install and lifecycle/dependency-free prompt extensions | T-0028 and T-0031 | Hostile direct/transitive script fixtures plus manifest/lockfile rejection | Planned |
| One-owner facet registry and deterministic profiles | T-0027 | Completeness, conflicts, budgets, provenance, snapshot equivalence | Planned |
| Lockfile-backed allowlisted extensions | T-0028 | Undeclared, incompatible, conflicting, unsafe-path, and oversized negatives | Planned |
| Thin harness bootstraps | T-0029 | Clean Codex/Claude startup and provider-difference audit | Planned |
| Transactional client initializer | T-0029 | Existing bootstrap/state, symlink, interruption, and exact rollback negatives | Planned |
| Secret-contained normalized provider probes | T-0032 | Stubbed and live normalized probes, malformed/auth failures, output redaction, cutoff equivalence, hostile process boundaries, and independent gates | Done |
| Aggregate consumer/security/release matrix | T-0031 | Packed install, compatibility, downgrade, deterministic output, independent gates | Planned |

## Agentic Risks

- Untrusted instructions or prompt injection: package and extension text is data until
  validated and selected by an explicit profile; attribution remains visible in output.
- Tool permission risk: a profile or extension never widens the parent session's
  authority; provider adapters and extension commands use explicit capability boundaries.
- Dependency, script, or generated-code risk: no install lifecycle; direct pinned
  dependencies only; compiled prompts are deterministic derived output, not runtime AI
  summaries.
- Secret or sensitive-data exposure risk: provider subprocesses emit only schema fields
  required by policy and never raw errors, responses, credentials, account, or billing data.
- CI/CD or deployment permission risk: implementation and dry-run packing do not publish;
  registry authentication and release remain separately authorized actions.

## Residual Risk

- Accepted risk: a lockfile proves selected bytes, not their trustworthiness; maintainers
  must still review dependency and extension changes. Local same-user processes and a
  compromised harness remain outside package isolation. Registry scope ownership is
  unverified until release preparation.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: wrong-root write, prompt owner divergence, undeclared composition,
  credential exposure, false-safe disposition, incompatible rollback, or unexpected
  packed file.
