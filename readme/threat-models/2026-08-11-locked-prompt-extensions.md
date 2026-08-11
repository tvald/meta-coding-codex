# Threat Model: Locked Prompt Extensions

## Scope

- Change: explicit client allowlist and lockfile-backed data-only prompt facet composition.
- Assets or data: core safety facets, role completeness, client dependency/lock metadata,
  immutable package roots, prompt provenance/digest, output budgets, and agent authority.
- Users, systems, or agents involved: client maintainers, package publishers, Root
  Orchestrators, installed framework runtime, and generated agent sessions.
- Trust boundaries: the client allowlist is project-owned authorization evidence;
  package/lock metadata binds selected bytes; every extension manifest and content byte
  remains untrusted data; core package policy and mutable client state remain separate.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Implicit scan or transitive package composes | Unreviewed dependency injects agent policy | High | Decision 0021 requires an ordered explicit allowlist | Exact direct-dependency and lock binding needed |
| Extension code or lifecycle runs during composition | Arbitrary client-host code execution | High | Prompt compiler is dependency-free and data-only | Reject scripts/dependencies/code entrypoints and never import extension modules |
| Facet shadows core ID/slot or targets a safety profile unexpectedly | Authority or safety policy is replaced or contradicted | High | T-0027 core namespace and slot validation | Extension namespaces, allowed profiles, conflict matrix, and no override semantics needed |
| Manifest range or identity is ambiguous | Incompatible bytes appear accepted | High | Exact framework version and npm lock metadata exist | Closed compatibility grammar, exact alias/root/lock identity, and integrity validation needed |
| Extension path escapes or races | Arbitrary client/package read or content substitution | High | T-0027 package safe-reader model | Separate validated extension roots, bounded inventory, ordinary-file and TOCTOU checks needed |
| Extension prompt overflows the core budget | Core safety instructions are crowded out or compilation fails after partial output | Medium | Hard prompt limits and one-write output | Preflight aggregate extension and final-output budgets needed |
| Provenance omits manifest/package/content inputs | Prompt cannot be reproduced or reviewed accurately | Medium | Core canonical digest framing | Extension identity/version/manifest/content digests and ordered records needed |
| Skill facet explains provider discovery or grants tool authority | Agent expands permissions or invokes unreviewed native surfaces | High | Shared authority and harness boundaries | Skill facets must be instruction data only and cannot add capability or authority |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Ordered explicit allowlist bound to exact direct dependency and lock entry | T-0028 | Undeclared/transitive/alias/lock/root/integrity mutations | Implemented and independently reviewed |
| Strict bounded data-only manifest and no dependency/lifecycle/entrypoint surface | T-0028 | Unknown-key, scripts, dependency, code-file, encoding, control, and size negatives | Implemented; packed lifecycle sentinel remained absent |
| Reserved namespace, declared profile targets, core shadow and slot-conflict rejection | T-0028 | ID/slot/profile/order/duplicate/permutation mutation matrix | Implemented and focused suite passed |
| Physical extension-root and file validation without client-path lookup | T-0028 | Symlink/hardlink/type/traversal/mode/reserved-path/TOCTOU/boundary fixtures | Implemented; independent Security re-review passed after control, mode, and discovery-path hardening |
| Canonical ordered provenance and aggregate/final budgets before one stdout write | T-0028 | Digest reconstruction, permutation, one-byte package/manifest/content, and 8/16/64 boundary tests | Implemented and focused suite passed |
| No-extension byte compatibility and no extension execution | T-0028 | All 15 source/installed snapshots plus hostile packed lifecycle sentinel | Implemented; independent Security and QA gates passed |

## Agentic Risks

- Untrusted instructions or prompt injection: an allowlisted publisher can still provide
  malicious instructions; schema validation prevents structural escalation, while human
  review and explicit allowlisting own semantic trust.
- Tool permission risk: extension text cannot widen parent authority, request provider
  discovery, select harness adapters, or enable tools; runtime permissions remain external.
- Dependency, script, or generated-code risk: composition imports no package code and
  accepts only bounded declared text; installation remains script-disabled or separately reviewed.
- Secret or sensitive-data exposure risk: environment, provider, task, arbitrary client,
  and credential content are excluded from inputs and provenance.
- CI/CD or deployment permission risk: the read-only compiler does not install, publish,
  mutate locks, run package scripts, or change external state.

## Residual Risk

- Accepted risk: cryptographic lock integrity and strict schemas cannot prove that an
  allowlisted publisher's prose is honest or safe; review ownership remains with the client.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: implicit composition, code execution, core shadow/conflict, lock/root
  mismatch, unsafe file read, ambiguous provenance, nondeterminism, or budget exhaustion.
