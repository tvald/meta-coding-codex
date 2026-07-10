# AI-Assisted Development Framework

This repository contains a portable, markdown-only framework for AI-assisted software
development. It is designed to be added to an existing project without bringing along
the decisions, task history, or documentation state of the framework repository itself.

The canonical framework introduction and complete file map are in
[`readme/meta/README.md`](readme/meta/README.md). Root [`AGENTS.md`](AGENTS.md) is the
agent launcher for this repository.

## Package Boundary

The reusable add-on consists of:

- `readme/meta/`, containing the framework entrypoint, process guidance, references,
  and templates; and
- the root AGENTS entry instruction, merged into rather than blindly replacing a
  destination project's existing instructions.

Everything else under `readme/` is mutable documentation for this repository as a
project. It is useful here but is intentionally excluded from a clean add-on package.

## Add It To A Project

1. Copy `readme/meta/` into the destination repository.
2. Merge the startup requirement from this repository's `AGENTS.md` into the
   destination's applicable agent instructions.
3. Do not copy `readme/README.md` or the sibling project-documentation directories.
4. Start a primary agent session. It reads the meta README and follows onboarding to
   initialize useful project documentation. If `readme/README.md` already contains
   non-framework documentation, onboarding preserves and resolves that collision rather
   than overwriting it.

This packaging workflow is the supported clean-start mechanism. The framework does not
prescribe an in-place command that deletes an existing project's documentation.

## What It Provides

The framework supplies a context-first operating loop, risk-scaled verification,
explicit autonomy boundaries, durable project knowledge, interruption recovery, and an
evidence-based improvement process. It adds no runtime dependency and does not require
a particular programming language, platform, or agent product.

For behavior, startup order, state categories, templates, and bootstrap details, use
the [meta framework entrypoint](readme/meta/README.md) as the canonical source.
