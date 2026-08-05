# Threat Model: Framework Changelog Seed

## Scope

- Change: Add a blank framework-changelog seed to the exact portable package and installer inventory.
- Assets or data: Portable framework policy, downstream and upstream project history, archive integrity, installer allowlist, and adopter-owned files.
- Users, systems, or agents involved: Maintainers, adopters, framework agents, package script, installer, CI verifier, and local filesystem.
- Trust boundaries: Reusable seed versus host-local entries; source project records versus release payload; archive producer versus installer consumer; packaged files versus adopter-owned collisions.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| A populated downstream changelog ships as reusable state | Adopters inherit false tasks, decisions, paths, or authority | Medium | State-free package contract | The imported file was copied wholesale |
| The new entry appears in the archive but not installer inventory | Installation fails closed or release verification diverges | High | Exact producer/consumer comparison | Installer list predates the seed |
| A same-name adopter file is overwritten | Local audit history is lost | Low | Installer refuses an existing `readme/meta` tree | No new gap |
| The leak guard accepts content hidden after the marker | Host history enters a release | Low | Exact one-marker check and nonblank-content scan | Manual copying bypasses the supported packager |
| Foreign Markdown contains agent instructions | A clean install inherits untrusted behavior | Medium | Maintainer diff review and Markdown-only allowlist | File-type validation cannot assess semantics |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Replace foreign entries with a self-describing blank seed | Root Orchestrator | Foreign-ID/path grep and source diff | Done |
| Reject dated entries anywhere and any nonblank content after the sole local-entry marker | Package script and installer | Source and archive before-marker/after-marker negative fixtures | Done |
| Add the seed to installer and CI-derived exact inventories | Root Orchestrator | Archive/installer/CI comparison | Done |
| Preserve this source repository's unique history outside the package | Root Orchestrator | Active/archive link and content inspection | Done |
| Retain existing no-clobber and symlink controls unchanged | Installer | Fresh, collision, and symlink fixtures | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Imported changelog prose is treated as evidence, not authority, and is removed from the portable file.
- Tool permission risk: The change adds no tool authority; scripts read repository files and mutate only existing bounded staging/install destinations.
- Dependency, script, or generated-code risk: No dependency is added; POSIX `awk`/`grep` extend the existing fail-closed packager.
- Secret or sensitive-data exposure risk: The guard rejects local entries regardless of content, reducing the chance that host notes or identifiers ship.
- CI/CD or deployment permission risk: Inventory verification changes, but workflow permissions, tag movement, publication, and credentials do not.

## Residual Risk

- Accepted risk: Unsupported manual copying can include populated host entries, and semantic review remains necessary for all other packaged Markdown.
- Approval or decision record: [Decision 0017](../decisions/0017-ship-blank-framework-changelog-seed.md).
- Review trigger: A local entry reaches a clean package, an exact inventory diverges, or an installer collision overwrites adopter state.
