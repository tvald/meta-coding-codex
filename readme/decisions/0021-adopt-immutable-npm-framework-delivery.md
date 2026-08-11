# 0021: Adopt Immutable NPM Framework Delivery

Status: Accepted

Date: 2026-08-11

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0004](0004-package-framework-as-addon.md) where it makes copying
  `readme/meta/` and merging a packaged root instruction the supported framework
  delivery mechanism. Its separation of reusable framework material from mutable
  project memory remains current.
- [Decisions 0005](0005-pilot-optional-agent-adapters.md) and
  [0016](0016-adopt-adapters-and-skip-pilot-disposition.md) where they make copied
  provider-specific role files and a root `CLAUDE.md` import the normal role/startup
  delivery surface. Canonical role ownership, least privilege, bounded delegation, and
  this repository's skip-Pilot policy remain current.
- [Decisions 0007](0007-add-codex-quota-monitor-skill.md) and
  [0014](0014-add-claude-usage-telemetry-skill.md) where provider quota acquisition is
  shipped as copied repository skills. Their normalized telemetry semantics, secret
  boundaries, and fail-unknown behavior remain requirements behind the package CLI.
- [Decisions 0008](0008-adopt-durable-task-orchestration.md) and
  [0009](0009-authorize-bounded-project-delegation.md) only where onboarding imports
  reusable templates or merges a portable startup instruction. Client-owned state,
  durable task semantics, and client-owned delegation authority remain current.
- [Decisions 0010](0010-automate-portable-core-archive.md),
  [0011](0011-publish-moving-latest-core-release.md),
  [0012](0012-add-fail-closed-piped-installer.md), and
  [0013](0013-streamline-installer-invocation.md) for supported ZIP production,
  moving-release publication, curl installation, and fresh-copy delivery. Their
  state-exclusion, exact-inventory, reproducibility, least-privilege, collision, and
  fail-closed lessons carry forward where applicable.
- [Decision 0017](0017-ship-blank-framework-changelog-seed.md) where an installed
  client receives and maintains a framework-edit changelog. The framework source
  repository retains its project-side history, while clients report defects upstream
  and replace the immutable dependency.
- [Decision 0018](0018-adopt-node-structured-task-store.md) where the task CLI is
  repository-pinned under `readme/meta/` and existing clients reconcile copied core
  files to update it. Its task model, bounded queries, canonical serialization,
  optimistic concurrency, atomic-write, migration, and platform-safety decisions
  remain current.
- [Decisions 0019](0019-adopt-guarded-project-onboarding-skill.md) and
  [0020](0020-adopt-guarded-task-recovery-skill.md) where the procedures are installed
  into provider skill-discovery directories. Their conservative procedure contracts
  remain canonical package content exposed through role facets and bounded docs.

Superseded by:

- None

## Context

The existing framework is delivered by copying a reusable tree and several optional
harness files into each client repository. Updating requires manual reconciliation,
provider procedures are duplicated into discovery paths, and agents must load multiple
long documents before working. The product owner instead requires one immutable,
versioned npm dependency with a local executable, complete packaged documentation,
deterministically derived role prompts, package-owned task tooling, thin project
bootstraps, and explicit extensions.

Current npm behavior supports that boundary: a package `bin` is exposed to scripts of a
depending project, a `files` allowlist controls the packed inventory, and a committed
lockfile records the exact installed tree. npm also runs declared lifecycle scripts in
several install and pack flows, so this package must define no install-time or prepare
hook. The unscoped registry name `meta-framework` is already owned by an unrelated
package; the implementation therefore uses `@tvald/meta-framework` as the publication
name unless the owner selects another available scope before release. The stable binary
name remains `meta-framework`.

## Decision

- Publish the reusable framework as one immutable npm package. Clients declare the exact
  alias `"meta-framework": "npm:@tvald/meta-framework@<version>"`, commit
  `package-lock.json`, and set `"meta": "node ./node_modules/meta-framework/bin/meta-framework.mjs"`.
  Routine use is `npm run --silent meta -- ...`; the explicit local path must fail before
  inherited `PATH` lookup when absent. Never use a global or fetch-on-demand fallback.
- Use `@tvald/meta-framework` as the implementation-time package name because the
  agreed unscoped name is unavailable. Registry-scope ownership is a release
  prerequisite, not permission to publish. The binary and CLI command contract do not
  depend on the registry name.
- Keep the package source repository as the canonical framework owner. The installed
  package contains complete long-form policy, schemas, runtime code, built-in facets,
  role/profile manifests, reusable procedure content, and immutable version metadata.
  Its `files` allowlist and pack audit exclude source-project tasks, decisions, quality
  records, credentials, caches, release residue, and all client state.
- Define no installation lifecycle mutation. The supported framework/extension install is `npm ci --ignore-scripts` or an equivalently reviewed project script allowlist.
  Framework and prompt extensions are lifecycle-free; prompt extensions have no dependencies. A client that enables unrelated dependency scripts owns that separate trust decision.
  A separately invoked initializer may create client state only after physical-root checks; it preserves existing bootstraps/state and uses collision-, symlink-, and interruption-safe staging/rollback. It never copies reusable policy.
- Treat the package root and client project root as separate mandatory runtime inputs.
  Resolve and physically validate the package root from the executing module URL.
  Resolve the client root once as the physical Git top level containing the invoking
  client package, anchored at the caller working directory; reject a missing, ambiguous,
  symbolic, or mismatched root. Internal test injection cannot weaken those checks.
  Package resources resolve only beneath the package root and mutable project data only
  beneath the client root. Never write into `node_modules`.
- Expose the existing task-store behavior beneath `meta-framework tasks ...` without
  weakening whole-store validation, bounded output, Root-only semantic mutation,
  optimistic concurrency, cooperative locking, atomic replacement, or safe-path rules.
  Report the running package version and supported client data-format versions.
- Keep complete long-form documentation independently readable. Give each normative
  instruction facet one stable identifier and one canonical owner. Documents reference
  facets for normative rules and add mechanics, rationale, tradeoffs, and exceptional
  paths; profile manifests select facet identifiers rather than rewriting those rules.
- Compile `agent-prompt` deterministically from reviewed facets. Canonical UTF-8/LF
  payload bytes cover the prompt body plus an ordered manifest of package name/version,
  prompt-format version, profile, harness adapter, facet IDs/origins, and extension
  names/versions/manifest digests; SHA-256 excludes only its own displayed digest field and proves reproducibility, not authenticity.
  Build checks reject missing, orphaned, duplicate-owner, conflicting, over-budget, or
  incomplete mappings. `docs` and `explain` accept declared identifiers only, return
  bounded attributed content, and cannot read arbitrary package or client paths.
- Define provider-neutral root, implementer, reviewer, QA, and security profiles.
  Provider adaptations may add only mechanics that cannot be expressed portably, such
  as native delegation or capability invocation; they cannot fork semantic role policy.
  Thin `AGENTS.md`/`CLAUDE.md` bootstraps invoke and follow the explicit profile. Root then
  runs `tasks doctor` and bounded `tasks startup`; delegation names and loads only the
  assigned role profile. Prompt and bootstrap text do not explain provider discovery.
- Put quota and capability probes behind normalized package commands. Provider adapters
  may observe provider-specific surfaces, but emit only the bounded disposition and
  fields needed by framework policy. Unavailable, unsupported, malformed, unauthorized,
  or failed inspection remains distinguishable from safe capacity, and credentials,
  tokens, raw responses, account identity, and unrelated billing data never enter output.
- Load extension facets only from the ordered
  `package.json#metaFramework.extensions` allowlist. Each name must be an exact direct
  dependency resolved from the client package and lockfile, with a bounded data-only
  `meta-framework.extension.json` at its validated package root. Treat all extension
  content as untrusted; validate identity, compatibility, lifecycle/dependency absence,
  schema, profiles, paths, file types, sizes, namespaces, conflicts, and attribution, and
  never let extension ordering create last-writer-wins behavior or shadow core safety.
  Prompt composition loads no extension code; a named command is a separate boundary.
- Version the immutable package with SemVer and independently version the CLI envelope,
  prompt format, task-store schema, and extension manifest/API. Package metadata declares
  readable and writable compatibility sets; unsupported state fails before mutation.
  Removing or rebinding a public command, identifier, schema, or supported runtime is a
  major change; additive compatible surfaces are minor and corrections are patch.
  A package upgrade replaces the dependency as one unit. Preserve compatible client
  state in place; when compatibility cannot be retained, ship a separately named,
  explicit, guarded data migration. There is no command that patches framework source
  inside a client repository.
- Roll back framework code by restoring the prior manifest and lockfile and running the
  same script-disabled or reviewed-allowlist install. Before an explicit data migration, require a dry run, input digest, clean
  state or backup, apply, and verification. After migration or new-format mutation,
  downgrade only through an expressly supported reverse path; otherwise repair forward.
- Retire the ZIP, moving `latest` release, curl installer, copied adapter/skill bundle,
  in-client framework edit log, and manual core-reconciliation workflow in the delivery
  initiative. Publishing to a registry, creating credentials, or releasing a version
  remains separately authorized external work.

## Options Considered

| Option | Benefits | Costs And Risks | Disposition |
| --- | --- | --- | --- |
| Keep ZIP/curl and manual reconciliation | Existing implementation and no registry namespace | Mutable remote installer, copied policy, update drift, duplicate provider surfaces | Rejected |
| Vendor an npm package's files into each client | Lockable source snapshot | Restores copied framework edits and reconciliation ownership | Rejected |
| Use global install or fetch-on-demand execution | Short invocation | Version ambiguity and execution outside the client's committed dependency tree | Rejected |
| Ship only compiled prompts | Small package and startup context | Loses full rationale, maintenance guidance, and progressive disclosure | Rejected |
| Immutable local dependency with derived prompts and explicit extensions | Lockfile-backed version, one package boundary, bounded role context, clean replacement updates | Adds manifest/compiler/compatibility validation and registry trust | Adopted |

## Consequences

Positive:

- Clients have one reviewable dependency and lockfile change instead of a file merge.
- The same semantic roles and task safety rules serve Codex and Claude while startup
  context stays bounded and attributable.
- Framework code and mutable project memory have enforceable, testable root boundaries.
- Extensions and provider probes become explicit trust boundaries with fail-closed
  schemas rather than copied or implicitly discovered content.

Negative:

- Clients must install the declared dependency before agents can invoke the framework.
- npm registry, namespace, tarball, and lockfile integrity become supply-chain inputs.
- Prompt/facet ownership, compatibility, and packed inventory add release validation.
- Existing copied-framework clients need a documented one-time transition; no in-place
  framework updater is provided.

Neutral or follow-up:

- T-0025 through T-0032 implement and independently verify the slices defined by the
  umbrella brief; this decision does not authorize publication.
- The source repository may retain obsolete delivery artifacts until T-0030 removes or
  supersedes them after their replacements pass focused checks.
- `@tvald/meta-framework` is a reversible default until publication. A different scoped
  registry name changes dependency metadata, not the binary or CLI contract.

## Confidence

Confidence: High for the package/client boundary and local invocation; Medium for the
unpublished registry identity and provider-specific adapters until their fixture matrix
passes.

Why:

The product owner supplied the complete target contract, current npm documentation
confirms local binary, pack-inventory, lifecycle, and lockfile behavior, and the design
preserves the already-tested task-store invariants while removing update reconciliation.

## Review Trigger

Revisit when package-root/client-root isolation fails, a prompt diverges from its owner,
an undeclared extension composes, a provider probe leaks sensitive data or reports false
capacity, a dependency revert damages client state, npm changes local binary or lockfile
semantics, or registry namespace ownership blocks release.

## Sources

- [T-0023 immutable npm delivery brief](../tasks/0023-npm-package-delivery-brief.md).
- npm, [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/),
  [scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/), and
  [package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/),
  checked 2026-08-11.
- Node.js, [package entry points](https://nodejs.org/api/packages.html), checked
  2026-08-11.
- `npm view meta-framework name version description dist-tags --json`, observed
  2026-08-11: the unscoped name resolves to an unrelated package at version 1.5.0.
- Decisions 0004-0020, reviewed 2026-08-11.
