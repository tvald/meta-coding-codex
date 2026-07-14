# Threat Model: Piped Core Installer

## Scope

- Change: Stream a repository installer into Bash, download the moving latest core, and
  install it into the caller's current project root.
- Assets or data: Caller permissions, destination instructions/framework files, remote
  installer and zip bytes, temporary staging, and project path boundaries.
- Users, systems, or agents involved: Adopter, shell, curl, GitHub raw/release hosting,
  unzip, filesystem, and framework repository maintainers.
- Trust boundaries: Network to executable shell; archive to staging; staging to adopter;
  portable instructions to project-owned instructions; temporary to durable paths.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Stream truncates after mutations begin | Partial or inconsistent destination | Medium | Curl fail flag | Pipeline status and progressive Bash execution are insufficient |
| Archive traverses or contains unexpected/special paths | Arbitrary destination writes | Low | Producer inventory check | Consumer must distrust downloaded bytes independently |
| Installer overwrites existing framework/instructions | Project policy loss or mixed version | Medium | Prior interactive unzip | Pipe stdin cannot safely carry prompts |
| Failure occurs after one durable claim | Partial fresh installation | Medium | Temporary download | Multi-path destination update is not atomic |
| Project or documentation path is replaced during installation | Writes or cleanup escape into another directory | Low | Initial symlink checks | Pathname checks alone have time-of-check/time-of-use races |
| Mutable raw script is compromised | Arbitrary code under caller identity | Low | HTTPS and repository governance | No immutable pin or signature in requested simple command |
| Curl configuration changes transfer behavior | Credentials leak or source/protocol changes | Low | Fixed URL | User curl config is otherwise implicit input |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Define all work before a final compound invocation and wrap the documented pipe with `pipefail` | Installer/README | Truncated-stream and outer-fetch-failure fixtures | Done |
| Disable curl config and require HTTPS/TLS for fixed project URLs | Installer/README | Static argument assertions | Done |
| Limit transfer/expansion and validate exact producer-synchronized inventory and regular entry types before extraction | Installer/workflow | Hostile archive and workflow-sync fixtures | Done |
| Refuse root, symlink parents, existing meta, and existing merge helper | Installer | Destination collision fixtures | Done |
| Keep root paths current-directory-relative and complete meta work in parent-checked directory-scoped subshells | Installer | Parent-symlink and root-rename replacement fixtures | Done |
| Preserve existing AGENTS and create only a merge file | Installer | Checksum fixture | Done |
| Roll back only atomically claimed, identity-matching paths owned by this invocation | Installer | Injected copy/link/post-link and path-race fixtures | Done |
| Document mutable-code trust and inspect/download alternative | README | Documentation review | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: No downloaded prose is interpreted by an
  agent, but the remote script itself is executable; repository governance is the trust
  root and archive names/content remain untrusted until staged validation.
- Tool permission risk: The script inherits the caller's filesystem authority and must
  not request privilege or access paths outside the current project.
- Dependency, script, or generated-code risk: Curl, unzip, and common POSIX tools are
  host dependencies; the installer and archive are moving remote artifacts.
- Secret or sensitive-data exposure risk: No token is required. Curl configuration files
  are disabled; caller environment, trust-store, DNS, and proxy behavior remain inputs.
- CI/CD or deployment permission risk: The existing workflow adds one read-only
  installer/producer inventory comparison before publishing; permissions and mutations
  are unchanged.

## Residual Risk

- Accepted risk: A compromised repository/raw host or caller environment can execute
  malicious code; TLS and review do not provide immutable provenance. Abrupt power loss
  between claims can still leave one installer-created path despite signal rollback. A
  malicious same-user process can race or forge cooperative path ownership; the README
  requires a quiescent destination and the lock serializes installer invocations only.
- Approval or decision record: Direct user instruction and
  [Decision 0012](../decisions/0012-add-fail-closed-piped-installer.md).
- Review trigger: Unexpected overwrite, path escape, partial install, remote-source
  mismatch, credential use, need for update semantics, or demand for immutable signing.
