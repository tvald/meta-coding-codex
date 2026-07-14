# Threat Model: Latest Core Release Workflow

## Scope

- Change: Build the portable zip on pushes to `main`, move `latest`, replace one release
  asset, and document destination-root installation.
- Assets or data: Repository contents and refs, automatic workflow token, release
  metadata/assets, verified archive, adopter files, and project agent instructions.
- Users, systems, or agents involved: Maintainers, GitHub Actions, official actions,
  GitHub CLI/API, release consumers, shell, curl, and unzip.
- Trust boundaries: Read-only build versus write-enabled publication; workflow artifact
  versus release asset; event SHA versus live `main`; source repository versus adopter;
  portable startup policy versus destination-owned instructions.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Write token reaches repository build code | Malicious or accidental commit mutates refs/releases | Medium | Pushes are limited to main | Single-job designs hold write permission throughout |
| Older workflow finishes after a newer publication | `latest` regresses to stale code | Medium | GitHub concurrency | Cancellation/ordering alone is insufficient |
| Tag changes but asset upload fails | Public release points at mismatched bytes | Medium | Package pre-verification | Ref and asset APIs are not transactional |
| Pinned action or runner tool changes/disappears | Build fails or privileged action behavior drifts | Low | Official providers | Moving tags/images and deprecation still occur |
| Duplicate or stale release assets accumulate | Consumers download the wrong file | Medium | Fixed intended name | Update semantics need explicit replacement |
| Pull request or fork obtains write token | Untrusted code mutates repository releases | Low | Event can be restricted | Broad event declarations would expose privilege |
| Installation overwrites existing AGENTS or framework files | Destination loses policy or becomes a mixed version | Medium | Existing manual merge guidance | Easy commands can encourage blind overwrite |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Trigger only `push` to `main`; define no PR, fork, dispatch, or reusable entry | Workflow | Parsed event assertions | Done |
| Split `contents: read` build from `contents: write` publication | Workflow | Parsed job permission assertions | Done |
| Pin official actions by full SHA and disable checkout credential persistence | Workflow | Action provenance/static checks | Done |
| Serialize the whole workflow and compare live `main` before every mutation | Workflow | Mocked rapid/stale event scenarios | Done |
| Discover release and tag before mutation with exact-match lists; fail closed on API errors or duplicates | Workflow | Mocked absent, prefix-only, and probe-failure scenarios | Done |
| Draft an existing release before tag/asset update; clobber one fixed name | Workflow | Mocked existing/failure/update scenarios | Done |
| Build only with T-0007 and verify integrity before upload and publication | Workflow | Local package and workflow-order checks | Done |
| Use only the automatic token; export it only to the final shell and avoid logging it | Workflow | Environment/secret/diff review | Done |
| Keep unzip collision prompts and warn that existing AGENTS must be merged | README | Fresh, existing-AGENTS, and broken-helper fixtures | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: Workflow inputs are fixed GitHub contexts
  and repository-owned files from `main`; no issue, PR, tag, dispatch input, or remote
  prose is interpolated into shell commands.
- Tool permission risk: Publication can force-move `latest` and edit one release, but it
  cannot change branches, workflows, issues, packages, deployments, or secrets with the
  declared token permissions.
- Dependency, script, or generated-code risk: Three official actions are commit-pinned;
  runner-provided `gh`, `zip`, and `unzip` remain mutable platform dependencies.
- Secret or sensitive-data exposure risk: Only the ephemeral automatic token is used.
  It is job-scoped and therefore accessible to the pinned official download action, but
  it is explicitly injected into only the final shell and is never echoed.
- CI/CD or deployment permission risk: This is a release-capable workflow. Local changes
  do not publish; the first push exercises repository rules and is the rollback point.

## Residual Risk

- Accepted risk: GitHub ref/release/asset operations are not atomic; a failed update can
  leave the release draft until rerun. A hostile main commit can still change the
  workflow itself under repository governance. Direct extraction still requires human
  collision judgment.
- Approval or decision record: Direct user instruction and
  [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md).
- Review trigger: Token leakage, stale final state, public mismatch, persistent draft,
  action compromise/deprecation, unexpected trigger, or destination overwrite.
