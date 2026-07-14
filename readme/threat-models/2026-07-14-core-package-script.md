# Threat Model: Core Package Script

## Scope

- Change: Add a shell command that builds the portable framework-core zip.
- Assets or data: Repository source, destination files, framework instructions, host
  state and authority, generated archive integrity, and adopter files after extraction.
- Users, systems, or agents involved: Maintainers, framework adopters, POSIX shell,
  Info-ZIP tools, local filesystem, and future release automation.
- Trust boundaries: Portable core versus host state; source tree versus generated
  artifact; requested output versus unrelated filesystem paths; portable startup
  guidance versus destination-owned agent instructions.

## What Can Go Wrong

| Threat | Impact | Likelihood | Existing Control | Gap |
| --- | --- | --- | --- | --- |
| Mutable state or standing delegation enters the zip | A destination inherits false history or authority | Medium | Decisions 0004, 0008, and 0009 define the boundary | Manual packaging did not enforce it |
| Missing or extra entries produce a broken package | Startup or framework links fail | Medium | Prior state-free package fixtures | No executable inventory check |
| Partial failure replaces a valid output | Published package becomes corrupt | Medium | Local Git source remains available | Direct output writes would be unsafe |
| Output path follows a symlink or targets core source | Unrelated data is replaced or source is polluted | Low | User chooses output | Script needs destination validation |
| Source path follows a symlink outside the repository | External instructions or secrets enter a trusted release | Medium | Repository layout is expected | Regular-file tests follow links |
| Checkout metadata changes archive bytes or permissions | Releases drift or extract executable docs | Medium | Git tracks content and executable bit | Filesystem mtimes vary by clone |
| Environment options or platform-specific temp syntax change the build | Archive bytes drift or a supported host fails | Medium | Explicit command arguments | Info-ZIP reads option variables; `mktemp` syntax differs |
| Existing destination instructions are overwritten on extraction | Project authority or documentation is lost | Medium | Package guidance requires merging | Zip cannot perform semantic merges |

## Mitigations

| Mitigation | Owner | Verification | Status |
| --- | --- | --- | --- |
| Allow only generated portable `AGENTS.md` plus every Markdown file in `readme/meta/` | Packaging script | Exact 26-entry source/archive comparison and authority search | Done |
| Validate required tools, source marker, file types, suffix, and destination kind | Packaging script | Negative-path matrix | Done |
| Build a temporary sibling archive, test it, compare inventory, then move it | Packaging script | Preserved-output failure fixture and replacement test | Done |
| Reject output symlinks, directories, and paths under `readme/meta/` | Packaging script | Three destination failure fixtures | Done |
| Resolve physical output ancestors and reject source/ancestor symlinks | Packaging script | Direct, symlink-parent, AGENTS, readme, and meta fixtures | Done |
| Normalize staged directories, file modes, UTC timestamps, ordering, locale, and extra metadata | Packaging script | Read-only-directory and different-mtime/mode fixtures | Done |
| Unset Info-ZIP option variables and use a trailing-`X` sibling work directory | Packaging script | `ZIPOPT` variants and BSD-style `mktemp` wrapper | Done |
| Keep extraction and collision merging outside the packaging command | Maintainer and adopter | README warning plus non-overwrite collision fixture | Done |

## Agentic Risks

- Untrusted instructions or prompt injection: The command packages only repository-owned
  allowlisted files; content review remains required because valid Markdown can still be
  harmful policy.
- Tool permission risk: The script reads repository core inputs and writes only the
  requested zip plus a private temporary directory; it grants no external authority.
- Dependency, script, or generated-code risk: `zip` and `unzip` are external executables
  resolved from `PATH`; documented Info-ZIP versions and local lint/fixtures bound the
  current implementation, but tool substitution remains an environment trust decision.
- Secret or sensitive-data exposure risk: A narrow inventory excludes project records
  and optional integrations; no credentials are read or written.
- CI/CD or deployment permission risk: This task adds no workflow, credential, tag,
  release, push, or deployment behavior. T-0008 reviews publication separately.

## Residual Risk

- Accepted risk: A malicious local process can race filesystem operations, a substituted
  executable can ignore the declared contract, different zip implementations can encode
  compression differently, and direct `unzip` collision behavior still requires adopter
  judgment.
- Approval or decision record: [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
- Review trigger: An unrelated path is replaced, identical supported inputs differ,
  archive contents escape the allowlist, or an adopter collision loses existing files.
