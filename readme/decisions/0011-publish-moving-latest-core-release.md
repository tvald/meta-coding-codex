# 0011: Publish A Serialized Moving Latest Core Release

Status: Accepted

Date: 2026-07-14

Owners:

- Product owner and Root Orchestrator

Supersedes:

- None

Superseded by:

- [Decision 0012](0012-add-fail-closed-piped-installer.md), for the installation
  procedure only; publication behavior remains current.
- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), for the remaining
  moving `latest` ZIP publication contract. Historical remote state is not mutated by
  this supersession.

## Context

Decision 0010 provides a deterministic, state-free core archive but leaves distribution
manual. The product owner requested a GitHub release tagged `latest` on every push to
`main`, plus commands that download and unpack that stable asset into another project.

Publication introduces repository write permission, mutable tags and release assets,
rapid-push ordering, partial-update states, action supply-chain inputs, and destination
file collisions. GitHub concurrency allows only one running and one pending member of a
group, replaces an older pending member, and does not guarantee arbitrary queued order.
Cancelling an active publisher can also overlap teardown with a newer run. Serialization
plus a live branch-head check gives the stronger final-state guarantee here.

## Decision

- Add one workflow triggered only by pushes to `main`. Serialize the entire workflow in
  one repository-specific concurrency group with `cancel-in-progress: false`.
- Split build and publication jobs. Build checks out with `contents: read`, invokes only
  `scripts/package-core.sh`, verifies the zip, and transfers it as a one-day workflow
  artifact. Publication receives only `contents: write`; the same-run artifact transfer
  does not require an additional token permission.
- Pin official checkout, upload-artifact, and download-artifact actions to full commit
  SHAs, retain version comments, and disable persisted Git credentials.
- Use the runner-provided GitHub CLI with the automatic `GITHUB_TOKEN`. Explicitly export
  it only to the final publication shell; the commit-pinned official download action
  necessarily runs in the same least-privileged publication job. Add no long-lived
  secret or third-party release action.
- Before each tag or release mutation, compare the remote `refs/heads/main` SHA with the
  triggering `github.sha`; a stale run exits successfully and lets the newest pending run
  publish. Serial execution prevents an older run from mutating after a newer run starts.
- Discover the moving release and tag through authenticated list endpoints, filter for
  exact matches, and treat API failures or duplicate exact matches as fatal before the
  first mutation. Prefix refs such as `latest/foo` do not count as `latest`.
- Create or force-update the lightweight `latest` tag. On first publication, create the
  release with `--verify-tag` and its fixed asset. On update, first make the existing
  release draft, replace the fixed asset with `--clobber`, then republish and mark it
  latest. A failed update therefore becomes unavailable instead of publicly inconsistent.
- Document the stable download URL and extraction from a destination repository root.
  Plain `unzip` remains interactive for collisions; an existing `AGENTS.md` must be kept
  and merged with the portable startup instruction rather than overwritten. This
  initial extraction procedure is superseded by Decision 0012's fail-closed installer.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| One write-enabled build/publish job | Fewest steps | Repository code executes in a job holding write permission | Rejected |
| Split build and publish through a workflow artifact | Narrows write token exposure and preserves verified bytes | Requires two additional pinned official actions | Accepted |
| Cancel an active older run | Faster newest-run start | Cancellation teardown can overlap a new publisher | Rejected |
| Serialize and check live `main` before mutations | No concurrent publishers; stale work skips; newest final state wins | An old run may publish briefly before the pending newest run | Accepted |
| Use a third-party release action | Short YAML | Adds release-capable supply-chain dependency | Rejected |
| Publish immutable version tags | Strong provenance | Does not satisfy the requested stable `latest` tag/update behavior | Rejected |

## Consequences

Positive:

- Adopters receive one predictable URL and asset name built by the reviewed package
  command.
- Build steps never hold a repository write token, and the publishing shell is auditable.
- Rapid pushes converge on the current `main`; older runs cannot overwrite a completed
  newer publication.

Negative:

- A running old workflow is not interrupted, so the newest publication may wait.
- Failure after an existing release is made draft can temporarily remove the public
  `latest` release until a rerun or later push repairs it.
- Moving tags and replaceable assets are incompatible with GitHub immutable releases and
  may be blocked by repository tag rules.

Neutral or follow-up:

- The workflow file is committed locally but is not pushed or executed by this task.
- GitHub-hosted runner contents and action versions require periodic freshness review.

## Confidence

Confidence: High for local design and simulated transitions; Medium for first execution
until repository rules and release mutability are exercised by a real push to `main`.

Why:

The design follows current official event, permission, concurrency, ref, CLI, action,
and runner documentation and keeps the external mutations in one small shell step.

## Review Trigger

Revisit when:

- a stale run becomes final, a release remains draft, an asset/tag mismatch is visible,
  a pinned action or runner tool reaches end of support, repository immutable releases or
  tag rules are enabled, or installation overwrites destination instructions.

## Sources

- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
  [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
  and [automatic token authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).
- [Git reference REST endpoints](https://docs.github.com/en/rest/git/refs),
  [release REST endpoints](https://docs.github.com/en/rest/releases/releases), and GitHub CLI
  manuals for [`release create`](https://cli.github.com/manual/gh_release_create),
  [`release upload`](https://cli.github.com/manual/gh_release_upload), and
  [`release edit`](https://cli.github.com/manual/gh_release_edit).
- Official actions and Ubuntu 24.04 runner manifests checked 2026-07-14.
