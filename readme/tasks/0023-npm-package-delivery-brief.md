# T-0023 Immutable NPM Package Delivery Brief

## Identity And Source

- Umbrella task: T-0023
- Accepted source: user direction on 2026-08-11 after evaluating npm delivery,
  locally installed CLI execution, package-owned process guidance, and harness loading
- Subtasks: T-0024 through T-0032

## Goal

Deliver the reusable meta framework as an immutable, versioned npm package that client
repositories install and lock normally. Agents invoke its locally installed executable
through a checked-in npm script, load one deterministic shared role prompt with only
the narrow native adapter their harness requires, and operate on mutable project state
without copying or editing the framework source inside the client repository.

## Agreed Product Contract

### Installation And Invocation

- The client repository declares `meta-framework` as a direct dependency and commits
  `package-lock.json`.
- The client exposes the package binary through a stable script:

  ```json
  {
    "scripts": {
      "meta": "meta-framework"
    }
  }
  ```

- Routine commands use `npm run --silent meta -- ...`. This resolves only the locally
  installed binary and fails when it is unavailable instead of fetching a package on
  demand.
- Dependency installation is a documented environmental prerequisite. The framework
  does not add special behavior for sessions started before dependencies are installed.
- Package installation has no lifecycle hook that mutates the client repository.

### Immutable Framework Boundary

- Framework policy, schemas, runtime code, built-in prompt facets, role definitions,
  and reusable skill content remain inside the installed package.
- Client agents do not edit package contents or keep a client-side framework changelog.
- Framework defects are reported to or fixed in the framework source repository through
  issues and pull requests. A new published version delivers accepted fixes.
- Updating the dependency replaces the framework package as a versioned unit. There is
  no client command that patches or merges framework source in place.
- Mutable project facts, task records, decisions, quality evidence, and other project
  memory remain ordinary version-controlled client files outside `node_modules`.
- A separately named migration may change client-owned data only when a future package
  cannot retain backward compatibility; it is not a framework-source updater.

### Canonical Documentation And Derived Prompt Views

- The complete long-form meta framework remains in the package and its source
  repository. It continues to document mechanics, rationale, tradeoffs, overall intent,
  maintenance guidance, and exceptional paths independently of any agent profile.
- `agent-prompt` output is a bounded operational projection for one role. It does not
  replace the long-form framework, become a second policy owner, or contain enough
  flattened prose to maintain the framework by itself.
- Normative instruction facets have stable identifiers and exactly one canonical owner.
  Long-form documents reference those owners and add rationale; profile manifests select
  facet identifiers rather than maintaining rewritten copies of their rules.
- The build validates document-to-facet references, profile coverage, missing or orphaned
  facets, conflicting selections, and deterministic ordering. A profile and its
  canonical sources cannot silently diverge.
- Compiled output reports the package version, role profile, selected facet identifiers,
  and content digest. This provenance lets maintainers reproduce the prompt and trace an
  instruction back to its complete explanation.
- Agents use progressive disclosure when the bounded profile is insufficient. Stable CLI
  topics return exact packaged documentation or the explanation and canonical source for
  a facet without requiring agents to navigate physical `node_modules` paths:

  ```sh
  npm run --silent meta -- docs root-loop
  npm run --silent meta -- docs quality-system
  npm run --silent meta -- explain tasks.selection
  ```

- Documentation lookup accepts only declared topic or facet identifiers, emits bounded
  output with source attribution, and never treats mutable client paths as package
  documentation.

### Agent Prompt Compilation

- `agent-prompt` replaces a startup sequence that asks an agent to locate and read many
  package-internal Markdown files.
- A primary example is:

  ```sh
  npm run --silent meta -- agent-prompt --profile root
  ```

- Profiles describe framework roles rather than providers. Initial shared profiles cover
  root orchestration plus the maintained implementer, reviewer, QA, and security roles
  that have distinct contracts.
- Output is a single bounded text document assembled deterministically from reviewed,
  version-controlled fragments. It is not summarized by an AI at runtime.
- Each output identifies at least the framework version, selected profile, selected
  facet identifiers, and a stable content digest so reports can establish which
  instructions were loaded and trace them to their canonical explanations.
- Composition separates common policy, orchestration or delegation rules, role rules,
  narrow native harness adaptations, applicable quality gates, and enabled skill
  facets. A role produces the same semantic policy for Codex and Claude.
- Prompt text does not explain whether a provider discovers `AGENTS.md` or `CLAUDE.md`,
  nor where that provider searches for skills. The harness has already performed that
  discovery before it can invoke the command.
- The package build validates every supported profile, detects missing or conflicting
  facets, enforces a prompt-size budget, and snapshot-tests deterministic output.
- Static framework instructions remain separate from dynamic task and project state.
  Root sessions load their prompt and then run the package-owned task doctor and bounded
  startup query.

### Task CLI And Project Roots

- The package binary exposes the task-store commands beneath one stable surface, for
  example:

  ```sh
  npm run --silent meta -- tasks doctor
  npm run --silent meta -- tasks startup
  ```

- Runtime code distinguishes the immutable package root from the current client project
  or Git root. Schemas and prompt fragments resolve from the package; task records and
  project documents resolve from the client repository.
- Task-store invariants, bounded queries, optimistic concurrency, atomic writes, and
  fail-closed validation remain intact after relocation.
- The CLI reports its running package version and verifies relevant client format or
  compatibility versions where that evidence affects safe operation.

### Quota And Capability Probes

- Provider-specific quota and capability inspection lives behind normalized package CLI
  commands instead of being reproduced as prompt procedures or copied provider skills.
- A representative invocation is:

  ```sh
  npm run --silent meta -- quota --harness codex
  ```

- Shared role instructions state when to run the command and how to act on its normalized
  disposition. They do not describe Codex App Server telemetry, Claude subprocess
  inspection, provider file locations, or credential handling.
- Harness adapters own the provider-specific implementation but emit one bounded schema
  that distinguishes proceed, suspend, unavailable, unsupported, and failed inspection
  without exposing credentials, tokens, or unrelated billing data.
- Capability probes use the same boundary: the shared prompt names a required capability
  and invokes a stable CLI command, while the adapter determines how that capability is
  observed for the selected harness.

### Harness Entrypoints And Extensions

- Client `AGENTS.md` and `CLAUDE.md` remain thin checked-in bootstrap files because the
  harnesses discover those project files directly. They instruct the primary session to
  run the matching explicit `agent-prompt` profile and then follow its output.
- Each harness already owns its instruction and skill discovery rules. Bootstrap and
  prompt content do not teach Codex how to find `AGENTS.md` or Claude how to find
  `CLAUDE.md`, and they do not restate provider skill search paths.
- A harness adapter is added only for mechanics that cannot be expressed portably, such
  as native delegation, permission, plugin, or provider capability behavior. It is not
  a separately maintained copy of a role profile.
- Delegation prompts name the delegated profile. A worker loads only the framework
  facets necessary for its assigned role and shared safety contract.
- Built-in role procedures may be compiled into profiles; they do not need to be copied
  into harness skill-discovery directories merely to supply instruction text.
- Pluggable extensions are direct, lockfile-covered npm dependencies declared through an
  explicit project allowlist. The framework never scans arbitrary `node_modules`
  packages for executable or prompt content.
- Extension manifests declare their compatible framework range, contributed facets,
  applicable profiles, and any separately invokable assets or commands. Composition
  validates names, paths, sizes, conflicts, and compatibility before emitting a prompt.
- Provider-native plugins or discovered skills remain optional adapters when they add
  capabilities beyond prompt text. They do not become competing policy owners.

## Client Repository Footprint

The normal installed client keeps only bootstrap, dependency, and mutable project state
under version control:

```text
AGENTS.md
CLAUDE.md
package.json
package-lock.json
readme/README.md
readme/tasks/
readme/decisions/
readme/quality/
```

The exact project-document categories remain demand-driven. The reusable meta process
tree is not copied into the client.

## Scope

In scope:

- A new architecture decision superseding package, bootstrap, and repository-pinned CLI
  portions of accepted decisions that conflict with this contract.
- A publishable npm manifest, package inventory, executable, version policy, and
  reproducible package checks.
- Complete package-owned long-form framework documentation and a validated one-owner
  mapping between that documentation, normative facets, and derived profiles.
- Relocation of the task CLI and schemas behind the installed package binary without
  weakening existing task-store behavior.
- Deterministic shared role facets and narrow native harness adapters.
- Bounded `docs` and `explain` retrieval for progressive disclosure and provenance.
- Normalized CLI adapters for provider quota and capability checks.
- An allowlisted extension and skill contribution contract.
- Thin Codex and Claude project bootstraps and the minimum initializer needed to create
  client-owned state without copying framework policy.
- Retirement of ZIP/curl delivery, vendored framework updates, package-local edit logs,
  and documentation that makes client reconciliation the normal update path.
- Clean-consumer, compatibility, security, and release verification.

Out of scope:

- Supporting execution before the client has installed its declared dependencies.
- Fetching a missing CLI on demand.
- Editing or hot-patching installed framework files in a client project.
- Runtime AI summarization of framework policy.
- Automatic discovery of undeclared npm extensions.
- Moving mutable project memory into the package, a hosted service, or harness-native
  memory.
- Publishing a package release as part of implementation unless separately authorized.

## Subtask Slices

- T-0024 owns the architecture decision and compatibility contract.
- T-0025 owns the npm package, executable entrypoint, inventory, and publication-safe
  build boundary.
- T-0026 owns task CLI relocation, package-root/project-root separation, and the
  `tasks` command surface.
- T-0027 owns deterministic prompt facets, shared role profiles, canonical-source
  mapping, output metadata, progressive disclosure, budgets, and profile validation.
- T-0028 owns allowlisted extension and reusable skill composition.
- T-0029 owns thin Codex and Claude bootstraps plus clean client initialization.
- T-0030 owns retirement of the ZIP/vendored/update model and reconciliation of process,
  decision, and user documentation.
- T-0031 owns end-to-end consumer, release, security, and regression verification.
- T-0032 owns normalized provider quota and capability commands and their security
  boundary.

## Umbrella Acceptance Criteria

- [ ] A clean fixture can install a locked package, expose the local `meta` npm script,
  load each supported prompt profile, and run task doctor/startup without a copied
  `readme/meta` tree.
- [ ] Removing or withholding the local dependency makes the npm script fail without a
  registry download or cache-installed fallback.
- [ ] Prompt output is deterministic, bounded, profile-specific, attributable to a
  package version and digest, and complete for every role contract it claims to serve.
- [ ] Complete long-form mechanics, rationale, and intent remain inspectable in the
  package and source repository; prompt profiles are derived projections rather than
  replacement documentation or independent policy owners.
- [ ] Every emitted instruction is attributable through stable facet identifiers to one
  canonical owner, and build checks reject missing, orphaned, conflicting, or divergent
  document, facet, and profile mappings.
- [ ] Bounded `docs` and `explain` commands retrieve exact canonical detail by declared
  identifier without exposing arbitrary package or client filesystem reads.
- [ ] Codex and Claude use the same semantic role profiles; provider discovery behavior
  is absent from compiled prompts, and any native adapter difference is narrow and
  covered by a harness-specific test.
- [ ] Existing task-store safety and bounded-query tests pass through the package CLI;
  package-internal resources never redirect project mutations into `node_modules`.
- [ ] Codex and Claude primary bootstraps are thin, project-owned, and sufficient to
  load the correct framework prompt and dynamic project state.
- [ ] Declared extensions compose only into allowed profiles, while undeclared,
  incompatible, conflicting, oversized, or unsafe extensions fail closed.
- [ ] Quota and capability commands hide provider mechanics behind a stable bounded
  result, distinguish unavailable evidence from safe capacity, and do not expose
  credentials or unrelated account data.
- [ ] The packed artifact contains exactly the intended immutable framework files and
  excludes client state, local framework edits, credentials, caches, and release-only
  residue.
- [ ] Supported installation and update documentation uses npm dependency replacement;
  no supported path copies or edits framework source in a client repository.
- [ ] Relevant unit, integration, package, clean-consumer, negative, compatibility,
  security, documentation, and deterministic-output checks pass, with independent gates
  applied according to each subtask's risk.

## Principal Risks And Mitigations

- **Prompt omissions:** maintain explicit facet ownership and validate the profile
  matrix against role requirements rather than hand-maintaining flattened prompts.
- **Documentation/profile drift:** keep one normative owner per facet, emit source
  identifiers, and fail package validation when documents, facets, or profiles reference
  missing or conflicting owners.
- **Instruction injection through extensions:** require an explicit dependency
  allowlist, strict manifests, compatibility checks, bounded content, and visible source
  attribution in compiled output.
- **Wrong-root writes:** make package and client roots explicit CLI inputs internally and
  retain path, symlink, Git-root, and atomic-write negative tests.
- **Unreviewed dependency execution:** avoid install-time mutation, lock exact resolved
  artifacts, audit the packed inventory, and document release provenance.
- **Harness drift:** keep provider-specific fragments narrow, test both thin bootstrap
  paths, and keep semantic policy in shared facets.
- **Provider telemetry leakage or false confidence:** normalize only the fields needed by
  framework policy, preserve an explicit unknown state, and test redaction and failure
  paths independently for each adapter.
- **Decision inconsistency:** supersede conflicting portions of accepted decisions
  explicitly and remove obsolete supported commands in the same delivery initiative.

## Done When

All subtasks are Done, their required checks and independent gates have passed, the
clean-client proof satisfies the umbrella criteria, and the repository documents one
unambiguous npm-based installation, agent startup, extension, and update contract.
