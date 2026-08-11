# Quality Record: Locked Prompt Extensions

- Date: 2026-08-11
- Change: T-0028 allowlisted lockfile-backed prompt extensions and reusable skill facets
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and Reviewer gates

## Scope And Criteria

- User-visible outcome: an installed client can explicitly allow one or more immutable
  direct dependencies whose reviewed data-only facets compose into declared profiles
  with stable provenance, while undeclared, incompatible, executable, or conflicting
  content fails before prompt output.
- In scope: client allowlist, exact direct dependency and lock binding, extension manifest
  compatibility, bounded package-root reads, namespaced facets, profile targeting,
  conflict/order rules, prompt provenance, reusable skill facets, and packed fixtures.
- Non-goals: package discovery by scanning `node_modules`, extension code execution,
  automatic installation, lifecycle scripts, transitive prompt providers, native plugin
  discovery, provider credentials, publication, or arbitrary client file reads.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Only ordered explicitly allowlisted direct dependencies with exact manifest/lock identity may compose | Clean-client positives plus undeclared, transitive, alias, lock, integrity, symlink, and identity mutations | Ordered packed clients passed; hostile placement/root/lock/identity cases failed with empty stdout | Pass |
| Extension manifests and content are data-only, compatible, bounded, path-safe, and non-executable | Strict unknown-key/version/range/lifecycle/dependency/path/type/encoding/size mutation matrix | Exact 8-facet/64-entry maxima passed; schema, code, mode, control, path, and size negatives failed closed | Pass |
| Namespaced facets target only declared profiles without shadowing core safety, reusing slots, or creating order ambiguity | Namespace, profile, conflict, duplicate, orphan, permutation, and core-shadow mutations | Profile filtering, disjoint-slot reuse, allowlist permutations, namespace/ID/order/slot conflicts passed | Pass |
| Prompt output remains deterministic, bounded, and attributable to exact extension package/manifest/content inputs | Repeat runs, digest reconstruction, one-byte mutations, allowlist-order snapshots, and budget boundaries | Repeat/digest reconstruction and one-byte content/package/manifest provenance passed; root/Claude extension body exceeded 371 bytes within 8,192 | Pass |
| Disabled or absent extensions preserve T-0027 output byte for byte | Existing 15 snapshots and source/installed no-extension regression | All 15 source and packed-installed absent/empty outputs matched T-0027 snapshots | Pass |
| Reusable skill facets add instructions only through reviewed prompt data and never execute or discover provider-native integrations | Static review, hostile scripts/binaries, forbidden discovery text, and no-execution sentinels | Packed hostile `postinstall` sentinel remained absent through real `npm ci --ignore-scripts`; compiler never scanned or executed it | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0028, Decision 0021, and the umbrella brief define allowlisted direct dependencies and data-only composition |
| Architecture and project context | Concern | Exact v1 manifest, allowlist, SemVer, lock, ordering, namespace, slot, provenance, and budget contracts require independent architecture review |
| Data, security, and permissions | Concern | Extension packages are untrusted supply-chain inputs whose text becomes executable agent policy; strict fail-closed validation and Security review are mandatory |
| Slices and ownership | Yes | T-0028 owns composition; T-0029 owns client initialization/bootstrap and T-0031 owns aggregate release proof |
| Verification and rollback | Yes | Packed fixture packages and hostile clients are reproducible; removing the allowlist/dependency disables composition without state migration |

Readiness verdict: Ready. The independent Architect required and accepted the amended
v1 contract below before material implementation; Security remains a completion gate.

## Architecture Amendments

- Prompt compatibility retains compiler `1.0.0` and prompt format `1` and adds exact
  `extensionManifestVersions: [1]` and `extensionApiVersions: [1]`. Extension API v1 is
  static data composition, never a JavaScript/module API. Absent or empty extensions
  preserve all 15 T-0027 outputs byte for byte.
- The only selector is the ordered, unique, maximum-eight
  `client package.json#metaFramework.extensions` array. Names are strict lowercase npm
  names (maximum 214 bytes); implicit scanning, aliases, the framework names, and
  dev/peer/optional/transitive placement are rejected.
- Each selected name must be a direct exact stable-SemVer dependency. A v3 package lock
  must repeat it in the root and mechanical top-level `node_modules/NAME` entry with the
  same version, strict credential/query/fragment-free HTTPS `.tgz` URL, and canonical
  SHA-512 integrity. Link/bundle/dev/optional/dependency-bearing entries and a competing
  `npm-shrinkwrap.json` fail closed. Installed name/version/root must match physically.
- The extension root inventory is limited to 64 entries and 131,072 regular-file bytes.
  Composition reads only ordinary one-link `package.json`, the fixed
  `meta-framework.extension.json`, and declared facets, with T-0027 pre/open/post safe
  reads. Harmless named prose/license files may exist; scripts, dependency/workspace/
  override fields, entrypoints, code-like/unlisted/executable files, symlinks, hardlinks,
  nested dependencies, devices, and provider-discovery trees are rejected.
- The manifest is canonical JSON plus LF, maximum 32,768 bytes, with exact keys
  `apiVersion`, `facets`, `frameworkRange`, `manifestVersion`, `name`, `namespace`,
  `promptFormatVersions`, and `version`. Security-sensitive JSON rejects duplicate keys.
  Versions are `1`; identity matches package/lock; prompt formats equal `[1]`; and range
  grammar is exactly `>=X.Y.Z <N.0.0` where `N = X + 1` and the runtime satisfies it.
- Namespace/local IDs use the core ID grammar; namespace is unique and not reserved.
  One to eight manifest-ordered facets have exact keys `id`, `kind`, `order`, `path`,
  `profiles`, and `slot`; kind is `skill`, order strictly increases in `1..65535`, paths
  stay under `facets/` as `.md` files and exclude nested dependency/provider-discovery
  segments case-insensitively, profiles are nonempty/canonical, emitted IDs are
  `extension.NAMESPACE.ID`, and slots are `extension.ID`. Content is static 1–4,096-byte
  UTF-8/LF text with no template, terminal/control or bidirectional characters, or
  reserved framework framing/marker sentinel. Roots and files reject group/world-write
  and special permission bits in addition to executable modes.
- Validate every package and aggregate before output. Core/harness bytes remain first and
  unchanged; extension facets append by client allowlist then manifest order, apply to
  every harness of each targeted profile, never merge/override, and reject duplicate
  namespaces/IDs or effective-profile slot conflicts. Limits are eight packages, eight
  facets/package, 16 aggregate facets, and 16 selected facets/profile.
- Extension provenance records package name/version, namespace, API/manifest/range,
  SHA-512 lock integrity, package-manifest digest, and extension-manifest digest. Facet
  records retain the core shape with namespaced ID/topic/path and equal raw/rendered
  digests. Resolved URLs, physical/client paths, environment/task/provider data, and
  unselected prose never enter output.
- The T-0027 core body limit remains 24,576 bytes. Extension-enabled limits are measured
  separately: 8,192 extension-body bytes, 32,768 combined body, 24,576 manifest, and
  65,536 final prompt; `explain` remains 8,192. Validate every layer and write stdout
  once without truncation. This replaces the insufficient 371-byte root/Claude margin
  without consuming the protected core allocation.
- Version/docs/core-explain remain rootless. Actual prompt composition and namespaced
  explain resolve the physical Git client root, validate the installed framework alias
  and lock, then extensions. Source mode permits only absent/empty extensions and keeps
  core bytes exact. Contract/resource/compatibility/conflict/budget failures exit `1`;
  malformed syntax or traversal-like IDs exit `2`, with empty stdout and bounded generic
  stderr.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused extension composition and adversarial supply-chain suite | 13 prompt/extension checks passed; extension suite includes 81 hostile mutations and exact boundaries | Pass | — |
| Yes | Prompt/package/task/provider and full regressions | `npm test`: 74/74 passed | Pass | — |
| Yes | Packed clean-client and no-execution matrix | Real packed install/lock normalization passed; hostile lifecycle sentinel absent | Pass | — |
| Yes | Exact package audit, doctor, budgets, staged evidence, and diff checks | Package audit: 64 files, 131,043 bytes, SHA-256 `79ede7579355fd5838de256365c6e286618600069939fdfc243739bcffcb5905`; doctor, final staged doctor, budgets, and diff checks passed without warnings | Pass | — |
| Yes | Independent Architect, Security, QA, and Reviewer gates | Architect: Revise then Ready; Security: Revise then Pass; QA: Revise then Pass; Reviewer: Revise then Pass | Pass | — |

- Criteria or methods amended after implementation began, with reason and impact: the
  pre-implementation Architect gate fixed schemas, roots, locks, namespaces, provenance,
  exits, and a separate extension allowance because the existing root/Claude body had
  only 371 bytes free. No implementation preceded the amendment.
- Counterfactual evidence for new behavior: 81 allowlist, placement, lock, manifest,
  namespace, conflict, lifecycle, mode, control, path, size, digest, ordering, and
  disabled-extension mutations; failures emitted no stdout and no execution sentinel.
- Flaky result and disposition: None observed.

## Batch And Residual Risk

- Large-diff split trigger hit: Reassess after architecture; manifest validation,
  root resolution, prompt composition, and adversarial fixtures share one trust boundary.
- If kept together, why: Root/lock branding, manifest/inventory validation, composition,
  provenance, and packed adversarial fixtures form one fail-before-output trust boundary;
  independent architecture and three completion gates constrained the integrated diff.
- Risk not resolved by passing checks: npm lock integrity proves selected bytes, not
  publisher trust or semantic safety; explicit review/allowlisting remains required.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: None.
- Next action: None; T-0029 may use the stable profile and extension contracts for thin client bootstraps.
