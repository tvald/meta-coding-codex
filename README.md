# AI-Assisted Development Framework

This repository contains a portable, Markdown-only core for AI-assisted software
development plus optional Codex and Claude Code harness integrations. It is
designed to be added to an existing project without bringing along the decisions, task
history, or documentation state of the framework repository itself.

The canonical framework introduction and complete file map are in
[`readme/meta/README.md`](readme/meta/README.md). Root [`AGENTS.md`](AGENTS.md) is the
canonical agent launcher; [`CLAUDE.md`](CLAUDE.md) imports it for Claude Code.

## Package Boundary

The reusable add-on consists of:

- `readme/meta/`, containing the framework entrypoint, process guidance, references,
  and templates; and
- the root AGENTS entry instruction, merged into rather than blindly replacing a
  destination project's existing instructions.

Optional harness integration files are:

- `CLAUDE.md`, which imports the canonical root instructions for Claude Code;
- `.codex/agents/`, containing thin Codex custom-agent adapters; and
- `.claude/agents/`, containing the matching Claude Code subagent adapters; and
- `.agents/skills/codex-quota-monitor/`, containing the dependency-free Codex App
  Server telemetry procedure used by the capacity guard.

These adapters expose only Reviewer, Verifier, and Security Reviewer during the pilot.
They do not own process semantics, add executable code or dependencies, pin models, add
MCP servers, or expand parent permissions. Omit them when the destination does not use
the corresponding harness. The quota-monitor skill is separate from that pilot, owns no
threshold policy, and can be omitted when the destination does not use Codex subagents.

Everything else under `readme/` is mutable documentation for this repository as a
project. It is useful here but is intentionally excluded from a clean add-on package.

## Install The Latest Core

With `curl`, `unzip`, and `mktemp` installed, run this from the root of the project that
will receive the framework:

```sh
(
  set -eu
  framework_zip=$(mktemp "${TMPDIR:-/tmp}/framework-core.XXXXXX")
  trap 'rm -f "$framework_zip"' EXIT HUP INT TERM

  curl --fail --location --retry 3 \
    --output "$framework_zip" \
    https://github.com/tvald/meta-coding-codex/releases/download/latest/ai-coding-meta-framework-core.zip
  unzip -tq "$framework_zip" >/dev/null

  if [ -e AGENTS.md ] || [ -L AGENTS.md ]; then
    if [ -e AGENTS.framework.md ] || [ -L AGENTS.framework.md ]; then
      printf '%s\n' 'Refusing to replace existing AGENTS.framework.md.' >&2
      exit 1
    fi
    unzip -p "$framework_zip" AGENTS.md > AGENTS.framework.md
    unzip "$framework_zip" -x AGENTS.md -d .
  else
    unzip "$framework_zip" -d .
  fi
)
```

If the project already has `AGENTS.md`, the commands preserve it and write the packaged
startup instruction to `AGENTS.framework.md`. Merge that instruction into the existing
file, then delete `AGENTS.framework.md`; do not replace project-specific agent guidance.
`unzip` also prompts before replacing any existing framework file, so resolve those
collisions deliberately rather than creating a mixed installation.

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

The archive contains the complete `readme/meta/` tree and only the portable startup
portion of `AGENTS.md`. It excludes project state, optional harness integrations, the
quota-monitor skill, and this repository's standing delegation request. Generated
archives under `dist/` are ignored by Git. Packaged timestamps, modes, entry order, and
extra metadata are normalized so unchanged content produces a byte-identical archive
with the supported Info-ZIP tools.

## Add It To A Project

1. Copy `readme/meta/` into the destination repository.
2. Merge the startup requirement from this repository's `AGENTS.md` into the
   destination's applicable agent instructions. Do not copy project-local operating
   choices such as the standing delegation request unless the destination owner adopts
   them explicitly.
3. For Claude Code, merge the `@AGENTS.md` import into an existing `CLAUDE.md`, or copy
   this bridge when no project file exists. Never replace established Claude guidance.
4. Optionally merge the files from `.codex/agents/`, `.claude/agents/`, and
   `.agents/skills/codex-quota-monitor/` for the harnesses and quota monitoring the
   destination uses. Resolve same-name agents or skills deliberately; never overwrite
   an existing definition blindly.
5. Do not copy `readme/README.md` or the sibling project-documentation directories.
6. Start a primary agent session. It reads the meta README and follows onboarding to
   initialize useful project documentation. If `readme/README.md` already contains
   non-framework documentation, onboarding preserves and resolves that collision rather
   than overwriting it.

This packaging workflow is the supported clean-start mechanism. The framework does not
prescribe an in-place command that deletes an existing project's documentation.

## What It Provides

The framework supplies a context-first operating loop, risk-scaled verification,
explicit autonomy boundaries, durable project knowledge, interruption recovery, and an
evidence-based improvement process. It adds no runtime dependency and does not require
a particular programming language, platform, or agent product. The optional harness
adapters are removable without changing core behavior.

For behavior, startup order, state categories, templates, and bootstrap details, use
the [meta framework entrypoint](readme/meta/README.md) as the canonical source.
