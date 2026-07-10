# AI-Assisted Development Framework

This repository contains a portable, Markdown-only core for AI-assisted software
development plus optional declarative Codex and Claude Code agent adapters. It is
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
- `.claude/agents/`, containing the matching Claude Code subagent adapters.

These adapters expose only Reviewer, Verifier, and Security Reviewer during the pilot.
They do not own process semantics, add executable code or dependencies, pin models, add
MCP servers, or expand parent permissions. Omit them when the destination does not use
the corresponding harness.

Everything else under `readme/` is mutable documentation for this repository as a
project. It is useful here but is intentionally excluded from a clean add-on package.

## Add It To A Project

1. Copy `readme/meta/` into the destination repository.
2. Merge the startup requirement from this repository's `AGENTS.md` into the
   destination's applicable agent instructions.
3. For Claude Code, merge the `@AGENTS.md` import into an existing `CLAUDE.md`, or copy
   this bridge when no project file exists. Never replace established Claude guidance.
4. Optionally merge the files from `.codex/agents/` and `.claude/agents/` for the
   harnesses the destination uses. Resolve same-name agents deliberately; never
   overwrite an existing definition blindly.
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
