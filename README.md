# AI-Assisted Development Framework

This repository contains a portable core for AI-assisted software development plus
optional Codex and Claude Code harness integrations. Policy is Markdown; a
dependency-free Node.js CLI provides the required structured task boundary. It is
designed to be added to an existing project without bringing along the decisions, task
history, or documentation state of the framework repository itself.

The canonical framework introduction and complete file map are in
[`readme/meta/README.md`](readme/meta/README.md). Root [`AGENTS.md`](AGENTS.md) is the
canonical agent launcher; [`CLAUDE.md`](CLAUDE.md) imports it for Claude Code.

## Package Boundary

The reusable add-on consists of:

- `readme/meta/`, containing the framework entrypoint, process guidance, references,
  templates, pinned task CLI, and schemas; and
- the root AGENTS entry instruction, merged into rather than blindly replacing a
  destination project's existing instructions.

Optional harness integration files are:

- `CLAUDE.md`, which imports the canonical root instructions for Claude Code;
- `.codex/agents/`, containing thin Codex custom-agent adapters; and
- `.claude/agents/`, containing the matching Claude Code subagent adapters; and
- `.agents/skills/codex-quota-monitor/`, containing the dependency-free Codex App
  Server telemetry procedure used by the capacity guard; and
- `.claude/skills/claude-quota-monitor/`, containing the credential-contained Claude
  Code telemetry procedure.

These adopted adapters expose only Reviewer, Verifier, and Security Reviewer.
They do not own process semantics, add executable code or dependencies, pin models, add
MCP servers, or expand parent permissions. Omit them when the destination does not use
the corresponding harness. The quota-monitor skills own no threshold policy and can be
omitted when the destination does not use that harness for delegated work. The release
archive carries these optional files so the installer can add them without a second
download; their presence does not make their use mandatory.

Everything else under `readme/` is mutable documentation for this repository as a
project. It is useful here but is intentionally excluded from a clean add-on package.

## Install The Latest Core

From the root of the project that will receive the framework, run:

```sh
curl -fsSL https://raw.githubusercontent.com/tvald/meta-coding-codex/main/scripts/install-core.sh | bash
```

This requires Git, Node.js 22 or newer, Bash, `curl`, Info-ZIP `unzip`, `mktemp`, and
common POSIX file tools. Run it from the root of an initialized Git repository.

The [installer script](scripts/install-core.sh) validates and stages the latest release
before changing the project. If the project already has `AGENTS.md`, it preserves it
and writes the packaged startup instruction to `AGENTS.framework.md`. Merge that
instruction into the existing file, then delete `AGENTS.framework.md`; do not replace
project-specific agent guidance.
The installer refuses an existing `AGENTS.framework.md` or `readme/meta` instead of
overwriting or mixing an installation. Its lock serializes installer runs only; run it
while no other local process is renaming or replacing the destination paths.

The installer is fresh-only. To update an existing framework installation, stage the
new core outside the target repository, review and deliberately reconcile its files
while preserving local `readme/meta/framework-changelog.md` entries, then run the pinned
Format 1 migration dry-run/hash/apply path. Rehearse a Git revert before any
post-cutover structured task mutation; after new records exist, use forward
reconciliation rather than a revert that could discard them.

This convenience command executes the current installer from this repository with your
user's permissions. Inspect or download the linked script before running it when you
need to review or pin the exact code first. Once its guard has loaded, the script rejects
an incomplete stream before installation. Like other direct curl-to-shell commands, the
pipeline reports Bash's status rather than curl's independent status; curl still prints
its own failure. Confirm the installer's success message or download first when strict
fetch-status handling is required.

## Build The Core Archive

With Info-ZIP `zip` and `unzip` installed, run:

```sh
./scripts/package-core.sh
```

The default output is `dist/ai-coding-meta-framework-core.zip`. Pass one `.zip` path to
write elsewhere; paths containing a `..` segment are rejected:

```sh
./scripts/package-core.sh /tmp/ai-coding-meta-framework-core.zip
```

The archive contains the complete `readme/meta/` tree—including the pinned data CLI,
schemas, and blank framework changelog seed—the portable startup portion of `AGENTS.md`,
and the optional adapter and quota-monitor skill trees above. It excludes local
changelog entries, structured host task records, project state, the root `CLAUDE.md`
bridge, and this repository's standing delegation request.
Generated archives under `dist/` are ignored by Git. Packaged timestamps, modes, entry
order, and extra metadata are normalized so unchanged content produces a byte-identical
archive with the supported Info-ZIP tools.

## Add It To A Project

1. Copy `readme/meta/` into the destination Git repository and verify supported Node.
2. Merge the startup requirement from this repository's `AGENTS.md` into the
   destination's applicable agent instructions. Do not copy project-local operating
   choices such as the standing delegation request unless the destination owner adopts
   them explicitly.
3. For Claude Code, merge the `@AGENTS.md` import into an existing `CLAUDE.md`, or copy
   this bridge when no project file exists. Never replace established Claude guidance.
4. Optionally merge the files from `.codex/agents/`, `.claude/agents/`,
   `.agents/skills/codex-quota-monitor/`, and `.claude/skills/claude-quota-monitor/` for
   the harnesses and quota monitoring the destination uses. Resolve same-name agents or
   skills deliberately; never overwrite an existing definition blindly.
5. Do not copy `readme/README.md`, `readme/tasks/store/`, or other project-state
   siblings.
6. Start a primary agent session. It reads the meta README and follows onboarding to
   initialize useful project documentation. If `readme/README.md` already contains
   non-framework documentation, onboarding preserves and resolves that collision rather
   than overwriting it.

This packaging workflow is the supported clean-start mechanism. The framework does not
prescribe an in-place command that deletes an existing project's documentation.

## What It Provides

The framework supplies a context-first operating loop, risk-scaled verification,
explicit autonomy boundaries, durable project knowledge, interruption recovery, and an
evidence-based improvement process. It requires Node.js 22+, Git, and tested local Linux
filesystem semantics for task state; macOS and WSL remain unverified design targets,
while native Windows and network filesystems are unsupported. Project implementation
remains language-agnostic.
Optional harness adapters are removable without changing core behavior.

For behavior, startup order, state categories, templates, and bootstrap details, use
the [meta framework entrypoint](readme/meta/README.md) as the canonical source.
