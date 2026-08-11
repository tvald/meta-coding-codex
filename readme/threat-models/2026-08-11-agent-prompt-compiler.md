# Threat Model: Deterministic Agent Prompt Compiler

## Scope

- Change: package-owned facet registry, shared role profiles, narrow harness mechanics,
  deterministic prompt composition, and bounded canonical `docs`/`explain` retrieval.
- Assets or data: normative framework policy, role boundaries, package identity, prompt
  provenance, complete long-form documentation, and client task/project authority.
- Users, systems, or agents involved: package maintainers, Root Orchestrators, delegated
  workers, installed clients, and Codex/Claude harnesses.
- Trust boundaries: registry and fragments are reviewed immutable package data; client
  files/environment are untrusted and must not influence composition; generated prompt
  text is executable policy for an agent but never grants new authority.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Missing safety facet still yields a prompt | Agent omits authorization, task, quota, or verification constraints | High | Decision 0021 requires complete profile validation | Explicit per-profile requirements and negative completeness fixtures required |
| Duplicate or divergent normative owner | Prompt and long-form docs silently disagree | High | Canonical meta documents and one-owner decision | Machine-readable exact owner/source mapping and conflict rejection required |
| Harness adapter changes semantics | Codex and Claude perform different roles | High | Provider-neutral role definitions | Narrow adapter schema and semantic-equivalence proof required |
| Digest is ambiguous or self-referential | Reproduction or attribution claims are false | Medium | SHA-256 package precedent | Canonical byte framing and independent reconstruction fixture required |
| `docs`/`explain` accepts a path | Arbitrary package/client file disclosure | High | Package/client physical-root validation | Identifier-only registry, ordinary-file checks, byte/type bounds, and traversal negatives required |
| Mutable client/environment affects output | Hostile project instructions enter trusted framework prompt | High | Immutable package root | Package-only inputs and environment/cwd equivalence fixtures required |
| Oversized facet or document exhausts context | Safety content truncates or crowds out task evidence | Medium | Framework document budgets | Hard per-file/final-output budgets and failure-before-output required |
| Generated policy grants authority | Worker expands permissions or delegation scope | High | Shared agent and task authority contracts | Profiles must state authority limits and adapters may expose mechanics only |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Versioned exact facet/document/profile registry with one canonical owner | T-0027 | Missing, orphaned, duplicate, unknown-key, and owner-drift mutations | Verified |
| Declared requirement matrix for all five role profiles | T-0027 | Remove/replace/conflict and combined root/harness slot mutations | Verified |
| Deterministic canonical prompt framing, digest, ordering, and byte budgets | T-0027 | Repeat, permutation, boundary, one-byte mutation, snapshots, and independent digest fixtures | Verified |
| Narrow enumerated harness mechanics with semantic equivalence | T-0027 | Codex/Claude normalized comparison and forbidden-text checks | Verified |
| Identifier-only bounded docs/explain lookup beneath the physical package root | T-0027 | Unknown/traversal/symlink/hardlink/type/encoding/size and hostile-client fixtures | Verified |
| Static package-only inputs and no runtime AI/provider/task data | T-0027 | CWD/environment/client-content mutation and all-resource installed equivalence | Verified |

## Agentic Risks

- Untrusted instructions or prompt injection: only reviewed package fragments selected by
  an exact registry enter core profiles; mutable client and provider content are excluded.
- Tool permission risk: profile and adapter text cannot widen the caller's authority;
  tools remain governed by the parent harness and repository policy.
- Dependency, script, or generated-code risk: compilation is dependency-free and reads
  data only; output is deterministic derived text, not code execution or AI synthesis.
- Secret or sensitive-data exposure risk: lookup exposes only declared framework docs;
  client data, environment values, provider output, and credentials are not inputs.
- CI/CD or deployment permission risk: commands are local read-only package surfaces and
  do not initialize clients, install dependencies, publish, or deploy.

## Residual Risk

- Accepted risk: concise projections cannot contain every rationale and exceptional path;
  users and agents must use attributed progressive disclosure when more context is needed.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: omitted or duplicated facet, digest mismatch, cross-harness semantic
  drift, arbitrary file read, client-dependent prompt bytes, output overflow, or profile
  text interpreted as new authority.
- Final independent Security disposition: Pass. Package paths, authority wording,
  identifier-only disclosure, strict schemas, safe reads, error bounds, and cleanup
  fixtures were rechecked after the final canonical prompt edits.
