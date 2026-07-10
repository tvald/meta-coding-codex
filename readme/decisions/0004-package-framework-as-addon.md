# 0004: Package The Framework As A Self-Contained Add-on

Status: Accepted

Date: 2026-07-10

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0001](0001-import-selected-alternative-framework-practices.md) and
  [Decision 0003](0003-address-framework-critique.md) only where they name the former
  flat framework or project-documentation paths, fix project state at `readme/state.md`,
  fix the reusable template count at ten, or describe copying the mixed `readme/` tree
  into a new project. Their behavioral decisions remain accepted.

Superseded by:

- [Decision 0005](0005-pilot-optional-agent-adapters.md), only where the package
  boundary excludes a Claude entrypoint bridge and optional vendor-native agent
  adapters.

## Context

Reusable process policy and this repository's mutable project memory currently share one
flat directory. Copying the framework therefore also copies decisions, task history,
reviews, and state from the framework project, while an agent cannot discover a single
self-contained reusable entrypoint.

## Decision

- Put every reusable framework process, reference, and template under `readme/meta/`,
  whose README is the canonical entrypoint read by primary and delegated agents.
- Put the mutable project cursor at `readme/README.md` and organize project knowledge in
  categorized sibling directories: `project/`, `decisions/`, `tasks/`, `quality/`,
  `threat-models/`, `incidents/`, `learning/`, and `archive/`.
- Package the add-on by copying `readme/meta/` and merging its root AGENTS entry
  instruction. Do not package this repository's mutable project documentation.
- Support reset only through clean packaging into a project, not an in-place deletion
  command.
- Add a project-state template for first-run onboarding, making eleven reusable
  templates.
- Keep root `AGENTS.md` and root `README.md` as concise integration surfaces; normative
  framework behavior remains under `readme/meta/`.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| `readme/state/` wrapper | One directory can be deleted | Extra nesting; separates state from ordinary project documentation artificially | Rejected by user |
| Categorized state directly under `readme/` | Clear semantic locations and short paths | Reset is not one-directory deletion | Accepted with package-only reset |
| Mostly flat mutable state | Shortest paths | Mixes project facts, learning, and cursors | Rejected |

## Consequences

Positive:

- The framework has a self-contained, testable package boundary and entrypoint.
- New projects cannot inherit this repository's decisions or task history accidentally.
- Project documentation has explicit homes without another wrapper directory.

Negative:

- Existing adopters must migrate paths without compatibility stubs.
- Root and meta README files have distinct roles that agents must follow in order.
- A host project already using `readme/README.md` must resolve that path collision during
  onboarding without overwriting established documentation.

Neutral or follow-up:

- Existing historical records remain this repository's state because their operative
  rules already exist in reusable process owners.

## Confidence

Confidence: High

Why:

The user selected the directory and reset contracts directly after reviewing concrete
trees, and the migration remains markdown-only and locally reversible.

## Review Trigger

Revisit when:

- A real installation requires project state in the reusable package, the two README
  roles repeatedly confuse agents, or an in-place reset becomes a demonstrated need.

## Sources

- User request and planning decisions dated 2026-07-10.
- Existing framework and historical records inspected on 2026-07-10.
