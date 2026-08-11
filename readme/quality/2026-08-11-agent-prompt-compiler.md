# Quality Record: Deterministic Agent Prompt Compiler

- Date: 2026-08-11
- Change: T-0027 bounded prompt profiles, facets, documentation retrieval, and provenance
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and Reviewer gates

## Scope And Criteria

- User-visible outcome: a source or installed client can request one deterministic shared
  role profile and bounded canonical detail without locating package files or loading
  unrelated framework policy.
- In scope: root, implementer, reviewer, QA, and security profiles; stable one-owner
  facets; narrow Codex/Claude mechanics; `agent-prompt`, `docs`, and `explain` commands;
  versioned provenance and digest; budgets; source/installed equivalence; build validation.
- Non-goals: extension facets, client initialization, replacing complete long-form
  documentation, dynamic task/project state, runtime AI summarization, or publication.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Every normative facet has one canonical document owner and every declared profile is complete without orphaned or duplicate-owner facets | Registry mutation tests for missing, duplicate, orphaned, conflicting, and incomplete mappings | Strict registry suite covers 30 marked facets, five profiles, three harnesses, ownership, ordering, required sets, role slots, and combined root/harness conflicts | Pass |
| Prompt output is deterministic, bounded, profile-specific, and attributable to exact package/format/profile/harness/facet inputs | Byte snapshots, repeat runs, digest reconstruction, ordering and budget boundaries | All 15 profile/harness snapshots and independent digest reconstruction passed; largest final output is root/Claude at 30,798/32,768 bytes | Pass |
| Codex and Claude variants preserve the same semantic profile and differ only in declared narrow native mechanics | Cross-harness normalized comparison and forbidden discovery/provider-procedure assertions | Non-root bodies are exact; normalized root adapters are exact and contain none of the forbidden discovery/provider-procedure text | Pass |
| `docs` and `explain` return bounded attributed canonical content only for declared identifiers | Positive exact-content fixtures plus unknown, traversal, symlink, type, size, and arbitrary-path negatives | All 15 documents and 30 facets matched exact sources; malformed/unknown/path/file/encoding/boundary negatives failed closed | Pass |
| Prompt composition cannot absorb mutable task/project data, provider output, environment state, or runtime AI text | Package-root-only static review, hostile client fixtures, environment mutations, and repeatability checks | Hostile client/task/environment fixtures and independent CWD mutation produced byte-identical package-only output | Pass |
| Source and packed-installed commands are equivalent and preserve the package/client root boundary | Source/packed-client snapshots, metadata drift, alias/lock, and package-mutation checks | Packed sweep matched all 15 prompts, 15 documents, and 30 facets byte for byte; compatibility mutations were rejected | Pass |
| Existing task/provider/package behavior remains intact | Focused prompt suite, package audit, full Node suite, doctor, budgets, staged evidence, and diff checks | Prompt 8/8, final full suite 69/69, reproducible 61-file package, doctor valid with zero warnings, and diff check clean | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0027 and the T-0023 brief define profiles, commands, provenance, and exclusions |
| Architecture and project context | Yes | Decision 0021 owns one-owner facets, deterministic projections, bounded lookup, and separate package/client roots |
| Data, security, and permissions | Concern | Prompt text is executable agent policy and lookup could become a file-read primitive; strict static registries and independent Security review are mandatory |
| Slices and ownership | Yes | T-0027 owns core prompt/docs behavior; T-0028 extensions and T-0029 bootstraps remain separate |
| Verification and rollback | Yes | Static fixtures and packed clients are reproducible; reverting registry/runtime/CLI changes removes the new read-only surfaces without client-state migration |

Readiness verdict: Ready. The independent Architect required and accepted the amended
contract below before implementation; Security remains a required pre-completion gate.

## Architecture Amendments

- Public compatibility is `1.0.0` with envelope, prompt-format, and registry schema
  version `1`; profiles are `implementer`, `qa`, `reviewer`, `root`, and `security`, and
  harnesses are `claude`, `codex`, and `portable`.
- A strict data-only registry owns declared document identifiers, package-relative POSIX
  paths, ordered facet identifiers, profile membership, and closed harness substitutions.
  Unknown keys, versions, references, duplicates, ordering drift, or incomplete profiles
  fail before output.
- Canonical facet payloads are extracted from unique, unnested, exact-line
  `meta-framework-facet:v1` marker pairs in their one owning long-form document. Role
  facets share one conflict slot; code-owned matrices enforce every role's required
  safety, quality, authority, and handoff facets.
- Omitted `--harness` means `portable`. Explicit Codex or Claude selection may add only
  `harness.delegation` and `capacity.guard` to the root profile. The same marked template
  permits only the validated harness identifier and closed native-surface label to vary;
  provider protocols, credentials, discovery paths, and mutable client state are barred.
- Prompt provenance uses canonical JSON and SHA-256 over
  `manifest-without-digest + LF + exact-body-bytes`; facet records carry stable source
  origins and raw/rendered digests. `docs` and `explain` use equivalent versioned,
  attributed envelopes and return only declared identifiers.
- Package-only reads require a validated package root, a bounded ordinary non-symlink
  file with one hard link, pre/open/post identity checks, fatal UTF-8, no BOM or CR, and
  final LF. Hard limits cover the registry, inventory, facets, documents, manifest,
  body, and complete outputs; composition completes before one stdout write.
- Command grammar and exit behavior are closed: version and successful retrieval exit
  `0`; well-formed unknown, resource, contract, or runtime failures exit `1`; malformed
  or traversal-like input exits `2`; failures have empty stdout and bounded generic
  stderr.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused prompt/profile/docs tests | 8/8 passed; all declared profiles, harnesses, documents, facets, mutations, filesystems, and packed parity covered | Pass | Not applicable |
| Yes | Package and full Node regression suites | Package-focused 36/36 and final full suite 69/69 passed | Pass | Not applicable |
| Yes | Exact/reproducible package audit | 61 files, 120,801 bytes, SHA-256 `77cd7425dcdb1a8a868566737a07ce85112f5819902081e911e5ed7a0566f0ef` | Pass | Not applicable |
| Yes | Doctor, budgets, staged evidence, and diff check | Doctor valid with zero warnings; document budgets and diff check passed; staged checks run at close | Pass | Not applicable |
| Yes | Independent Architect, Security, QA, and Reviewer gates | Architect: Revise then Ready; Security: Pass; QA: Pass; Reviewer: Pass | Pass | Not applicable |

- Criteria or methods amended after implementation began, with reason and impact: the
  pre-implementation Architect gate fixed exact schemas, profiles, marker ownership,
  framing, root boundary, limits, CLI grammar, and exit semantics. These amendments
  tighten the implementation and fixture surface without changing T-0027's outcome.
- Counterfactual evidence for new regression or behavior tests: removing required facets,
  duplicating or moving ownership, reusing role/root-harness slots, drifting schemas,
  changing one source byte, unsafe filesystem forms, hostile client state, and forbidden
  adapter prose all fail the focused suite.
- Flaky result and disposition: one concurrency-heavy full run timed out the existing
  10,000-task query at 60 seconds; it passed unchanged in isolation at 35.6 seconds and
  in the final full run at 52.0 seconds. A separate 50 ms provider child-start fixture
  also exposed scheduler sensitivity; raising only that test timeout to 250 ms preserved
  its timeout/cleanup assertion and the final provider suite passed 11/11.

## Batch And Residual Risk

- Large-diff split trigger hit: Yes; canonical owner markers span several framework
  documents and the change exceeds 500 lines across implementation, tests, and fixtures.
- If kept together, why: registry validation, marked owners, deterministic outputs, and
  snapshots form one atomic one-owner contract; splitting them would leave either
  unvalidated policy or unusable package commands between commits.
- Risk not resolved by passing checks: a concise profile can still be less explanatory
  than complete documentation; provenance and progressive disclosure mitigate but do not
  eliminate agent misinterpretation.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: Not applicable.
- Next action: close T-0027 with this evidence and proceed to dependency-ready T-0028.
