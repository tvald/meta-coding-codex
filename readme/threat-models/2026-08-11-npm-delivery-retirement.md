# Threat Model: NPM Delivery Retirement

## Scope

- Change: remove supported copied-core delivery and make immutable locked npm replacement
  the only live installation/update path.
- Assets or data: client-owned instructions/state/history, installed package integrity,
  source-framework history, supported commands, repository and remote release evidence.
- Users, systems, or agents involved: source maintainers, installed clients, onboarding
  and recovery skills, npm, Git, Codex, and Claude Code.
- Trust boundaries: package source is editable only in its source repository; installed
  package bytes and arbitrary existing client paths are not migration scratch space;
  historical documents are evidence rather than executable guidance.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Retirement deletes same-named client content | Project authority, state, or history is lost | High | Git, exact project/package inventories, conservative collision policy | Guidance-only transition must require intent, reviewed release manifest/digests, dry run, and recoverability; no cleanup executable |
| One ZIP/curl producer or consumer remains live | Users follow an unsigned or mutable second delivery path | High | Decision 0021 and package tests | Closed live-surface scan required |
| Installed-client guidance edits `node_modules` or copied policy | Package integrity and upgrade determinism fail | High | Exact local alias, lockfile, package audit | Maintained skills/process docs must be reconciled |
| Removing old references destroys audit history | Prior decisions and verification become unverifiable | Medium | Categorized history and terminal task store | Scans must exclude historical owners and diffs must preserve their bodies |
| Source doctor stops requiring framework evidence | Unlogged framework changes can ship | Medium | Staged doctor, source changelog | Source/client detection and compatibility tests must be revised together |
| Remote release/tag is deleted without authority | External consumers or evidence break irreversibly | Medium | Explicit task scope and GitHub permissions | Keep external state out of implementation |
| Unsafe npm invocation permits lifecycle hooks or fallback | Client code executes before framework command | High | Explicit local script and `--ignore-scripts` contract | Remove remaining live unsafe commands |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Closed deletion list and closed live-surface negative test with historical allow classes | T-0030 | Focused retirement fixture/search and mutation matrix | Pass |
| Guidance-only provenance proof before any copied-client removal | T-0030 | Same-name/byte-unproved/modified/link/type/mixed/exact counterfactual assertions | Pass |
| Exact locked npm install/invoke/replace instructions | T-0030 | README/process/skill tests | Pass |
| Separate source changelog evidence from installed clients | T-0030 | Source and packed doctor fixtures | Pass |
| Preserve historical bodies and remote release state | T-0030 | Scoped diff and history exclusions | Pass |
| Independent high-risk gates | Root Orchestrator | Architect, Security, QA, Reviewer verdicts | Pass |

## Agentic Risks

- Untrusted instructions or prompt injection: old installer snippets remain in historical
  evidence; live procedures must not treat them as current commands.
- Tool permission risk: migration guidance cannot authorize recursive deletion or remote
  release mutation; ambiguous provenance stops for maintainer review.
- Dependency, script, or generated-code risk: npm commands use the explicit local alias
  with lifecycle hooks disabled; no install-time framework mutation is introduced.
- Secret or sensitive-data exposure risk: retirement requires no credentials, registry
  tokens, remote API calls, or inspection of arbitrary client content.
- CI/CD or deployment permission risk: the publishing workflow is removed, not invoked;
  no package publish or remote release edit occurs.

## Residual Risk

- Accepted risk: historical records intentionally contain retired commands and filenames,
  so negative searches require a reviewed live-surface allowlist.
- Accepted risk: old remote release artifacts remain reachable until separately retired
  by an authorized owner.
- Accepted risk: copied clients without trustworthy provenance require manual transition
  rather than automatic deletion.
- Approval or decision record:
  [Decision 0021](../decisions/0021-adopt-immutable-npm-framework-delivery.md).
- Review trigger: client data deletion, live ZIP/curl guidance, package mutation,
  unlogged source change, lost historical evidence, unsafe npm command, or remote-state
  mutation.
