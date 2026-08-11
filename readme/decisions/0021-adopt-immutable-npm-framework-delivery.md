# 0021: Adopt Immutable NPM Framework Delivery

Status: Accepted

Date: 2026-08-11

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0004](0004-package-framework-as-addon.md) where it makes copying `readme/meta/`
  and merging a packaged root instruction the supported delivery mechanism. Reusable
  framework and mutable project memory remain separate.
- [Decisions 0005](0005-pilot-optional-agent-adapters.md) and
  [0016](0016-adopt-adapters-and-skip-pilot-disposition.md) where they make copied
  provider role files and a root `CLAUDE.md` import the normal
  role/startup surface. Role ownership, least privilege, bounded delegation, and this
  repository's skip-Pilot policy remain current.
- [Decisions 0007](0007-add-codex-quota-monitor-skill.md) and [0014](0014-add-claude-usage-telemetry-skill.md)
  where quota acquisition ships as copied skills. Normalized telemetry, secret boundaries,
  and fail-unknown behavior remain package CLI requirements.
- [Decisions 0008](0008-adopt-durable-task-orchestration.md) and [0009](0009-authorize-bounded-project-delegation.md)
  only where onboarding imports templates or startup instructions. Client-owned state,
  durable task semantics, and delegation authority remain current.
- [Decisions 0010](0010-automate-portable-core-archive.md), [0011](0011-publish-moving-latest-core-release.md),
  [0012](0012-add-fail-closed-piped-installer.md), and [0013](0013-streamline-installer-invocation.md)
  for ZIP, moving-release, curl, and fresh-copy delivery. Their state exclusion, exact
  inventory, reproducibility, least privilege, collision, and fail-closed lessons remain.
- [Decision 0017](0017-ship-blank-framework-changelog-seed.md) where a client maintains a
  framework changelog. Source history remains project-side; clients report defects
  upstream and replace the immutable dependency.
- [Decision 0018](0018-adopt-node-structured-task-store.md) where the task CLI is pinned
  under copied `readme/meta/`. Its task model, bounded queries, canonical serialization,
  concurrency, atomic writes, migration, and platform safety remain current.
- [Decisions 0019](0019-adopt-guarded-project-onboarding-skill.md) and [0020](0020-adopt-guarded-task-recovery-skill.md)
  where procedures install into provider skill directories. Their conservative contracts
  remain canonical package content exposed through role facets and bounded docs.

Superseded by:

- None

## Context

The existing framework copies a reusable tree and optional harness files into each client.
Updates require manual reconciliation, provider procedures are duplicated, and agents
load multiple long documents. The owner instead requires one immutable npm dependency
with a local executable, complete docs, derived role prompts, package-owned task tooling,
thin bootstraps, and explicit extensions.

npm exposes package `bin` entries to client scripts, a `files` allowlist controls the
tarball, and a committed lockfile records the installed tree. Because npm runs declared
lifecycle scripts in install and pack flows, this package defines no install-time or
prepare hook. The unrelated unscoped `meta-framework` name is occupied, so the
implementation uses `@tvald/meta-framework` unless the owner selects another scope
before release. The stable binary remains `meta-framework`.

## Decision

- Publish the reusable framework as one immutable npm package. Clients declare the exact
  alias `"meta-framework": "npm:@tvald/meta-framework@<version>"`, commit
  `package-lock.json`, and set `"meta": "node ./node_modules/meta-framework/bin/meta-framework.mjs"`.
  Routine use is `npm run --ignore-scripts --silent meta -- ...`; the explicit local path must fail before
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
- Define no installation lifecycle mutation. Framework and dependency-free extensions are lifecycle-free;
  use `npm ci --ignore-scripts` or a reviewed allowlist. Read-only `project preflight` gates `project init`,
  which preserves recognized files, copies no policy, creates only the five-path footprint, and refuses source, legacy, partial, prepared, collision, malformed, or busy state.
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
  Independent `AGENTS.md` and `CLAUDE.md` blocks select Codex and Claude root profiles through the local
  npm command; neither imports the other. Root runs task startup; each delegation names one non-root
  profile and harness, and its worker loads only that profile. Bootstraps omit provider-discovery detail.
- Put quota and capability probes behind normalized package commands. Provider adapters
  may observe provider-specific surfaces, but emit only the bounded disposition and
  fields needed by framework policy. Unavailable, unsupported, malformed, unauthorized,
  or failed inspection remains distinguishable from safe capacity, and credentials,
  tokens, raw responses, account identity, and unrelated billing data never enter output.
- Load extension facets only from the ordered `package.json#metaFramework.extensions`
  allowlist. Bind each exact stable direct dependency to the v3 root/installed lock
  version, HTTPS tarball, SHA-512 integrity, physical root, and package identity. Accept
  only a canonical bounded `meta-framework.extension.json` plus lifecycle-free, dependency-
  free, non-executable Markdown facets beneath that package. Treat every instruction as
  untrusted; validate compatibility, profiles, paths, modes, sizes, namespaces, conflicts,
  attribution, and aggregate budgets before one stdout write. Never scan, import, execute,
  merge, override core safety, or expose client paths and lock URLs in prompt provenance.
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
- T-0030 removes obsolete repository delivery artifacts after focused checks; the
  historical remote moving release and tag remain untouched external state.
- `@tvald/meta-framework` is a reversible default until publication. A different scoped
  registry name changes dependency metadata, not the binary or CLI contract.

## Implementation And Compatibility

- Source harness discovery bundles remain in `.agents/`, `.codex/`, and `.claude/` for
  maintainers but outside the npm tarball. Clients receive canonical documents, compiled
  facets, explicit profiles, and thin generated bootstraps, not discovery bundles.
- Clients have no package-local framework changelog. Source edits stay in
  `readme/learning/framework-changelog.md`; upstream fixes arrive through exact manifest
  and lockfile replacement.
- The guidance-only copied-client transition has a closed data manifest anchored to
  pre-npm commit `c90211b9a2cd888a1796dbd584384fd1f9eaa132`. It records all 49 archive
  files by path, mode, bytes, and SHA-256; matching data without independent provenance
  never authorizes deletion.
- T-0031 confirmed the public scoped package was absent and the sole legacy release
  predated its manifest/registry, so identifier removal was pre-release compatible; contrary evidence reopens SemVer treatment.
- It also proved script-disabled install, replacement, and byte-exact rollback; public
  ownership, licensing, authentication, provenance, and publication remain unauthorized prerequisites.

## Confidence

Confidence: High for the package/client boundary, local invocation, and normalized provider
adapters; Medium for the unpublished registry identity until release evidence exists.

Why:

The owner supplied the target contract; npm documentation confirms binary, pack, lifecycle, and lock behavior; T-0026 proves roots/task mutation; T-0032 proves bounded
fail-closed probes; and T-0027 proves facet ownership, profiles, provenance, disclosure,
adapter equivalence, and source/installed parity. T-0031 proves the unpublished local
release candidate and rollback; public registry installation remains a release-time gate.

## Review Trigger

Revisit when root isolation fails, a prompt diverges, an undeclared extension composes, a
probe leaks data or reports false capacity, a revert damages client state, npm changes
local-binary or lockfile semantics, or registry ownership blocks release.

## Sources

- [T-0023 immutable npm delivery brief](../tasks/0023-npm-package-delivery-brief.md).
- npm [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/),
  [scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/), and
  [package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/), checked 2026-08-11.
- Node.js, [package entry points](https://nodejs.org/api/packages.html), checked 2026-08-11.
- `npm view meta-framework name version description dist-tags --json`, 2026-08-11:
  unscoped name owned by an unrelated package at version 1.5.0.
- Decisions 0004-0020, reviewed 2026-08-11.
