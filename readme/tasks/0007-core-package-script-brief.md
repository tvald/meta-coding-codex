# Task Brief: Core Package Script

## Identity And Source

- Task ID: T-0007
- Initial revision: r1
- Catalog: `readme/tasks/README.md`
- Accepted source: User instruction
- Source reference and date: Add a shell script that packages all core files needed to
  add the framework to a new repository as a zip archive, 2026-07-14.
- Parent or split task IDs: None

## Goal

Provide a safe, repeatable shell command that produces a zip containing the complete
portable framework core and no repository-specific state.

## Background

Decisions 0004 and 0008 define the core as `readme/meta/` plus the portable startup
portion of root `AGENTS.md`. The existing manual packaging instructions require users to
select that boundary themselves, which risks either omitting startup guidance or copying
this repository's task history and project-local delegation authority.

## Scope

In scope:

- A POSIX-compatible `scripts/package-core.sh` command.
- Exact archive inventory: portable `AGENTS.md` startup guidance and `readme/meta/`.
- Optional output path, documented default, atomic replacement, cleanup, dependency and
  source-contract validation, stable entry ordering, and reproducible output.
- README usage, decision/changelog/task/quality/threat/state records, and verification.

Out of scope:

- Mutable project state under `readme/` outside `meta/`.
- Optional Codex/Claude adapters, quota skill, `CLAUDE.md`, runtime installation, or
  automatic merging into a destination repository.
- Publishing, releasing, or committing a generated zip artifact.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework maintainer | Build a distributable core archive | Run one script and receive an exact reproducible zip |
| Framework adopter | Add the framework to a new repository | Extract the core and merge the portable `AGENTS.md` startup instruction if needed |

## Acceptance Criteria

- [x] The script runs under `/bin/sh`, accepts zero or one output path, and provides
      useful help and failure messages.
- [x] The archive contains exactly portable `AGENTS.md` startup guidance and every file
      under `readme/meta/`, with paths ready for extraction at repository root.
- [x] The archive excludes mutable state, optional integrations, project-local standing
      delegation, packaging automation, and generated host records.
- [x] Repeated builds from unchanged inputs are byte-identical and safely replace only
      the requested archive after a complete build.
- [x] Extraction passes inventory, Markdown link/anchor, bootstrap, collision, and
      executable-permission checks.
- [x] Required shell, negative-path, documentation, risk, diff, and staged checks pass.
- [x] Task-owned changes are committed locally without committing a generated archive.

## Constraints

- Preserve the Markdown-only portable core; the script is repository automation outside
  the archive.
- Use common shell utilities and fail before changing the destination on missing tools
  or invalid source structure.
- Do not overwrite or merge files inside a destination repository.

## Workflow Route Rationale

- Cataloged route and risk: Quick change / High.
- Why this route: The implementation is contained and the archive contract already has
  canonical owners.
- Why this risk gate: The executable distributes agent instructions; an inventory or
  collision error can leak host authority/state or create a broken adopter startup.
- Upstream artifacts required: Decisions 0004, 0008, and 0009; package guidance; root
  entrypoint; state-free package verification from T-0006.
- Escalation trigger: Correct packaging requires copying mutable state, optional
  integrations, privileged installation, or a nonstandard archive format.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Archive includes host state or local delegation authority | Destination inherits false history or authority | Allowlist core paths and generate only the portable AGENTS prefix |
| Partial build replaces a valid archive | Distribution becomes corrupt | Build a temporary archive and move only after validation |
| Output depends on current directory or file enumeration order | Builds are unreliable or non-reproducible | Resolve repository root from script path and sort archive entries |
| Cleanup deletes the wrong path | Local data loss | Use `mktemp`, quoted paths, narrow traps, and no source-tree deletion |
| Archive silently omits new core files | Adopter receives an incomplete framework | Include the complete `readme/meta/` tree and compare archive/source inventories |

## Assumptions

| Assumption | Confidence | Validation |
| --- | --- | --- |
| Info-ZIP `zip` and `unzip` are available in the development environment | Medium | Capability check before implementation and explicit script error path |
| The portable startup instruction is the content before `## Operating Contract` in root `AGENTS.md` | High | Decision 0009 and current package guidance explicitly separate later project-local choices |

## Verification Plan

- Automated checks: Shell syntax and ShellCheck when available; help/argument/tool/source
  failures; default and custom output; spaces in output path; exact inventory; two-build
  hash equality; archive integrity; extracted links/anchors; bootstrap/collision fixture;
  executable bits; budgets; and `git diff --check`.
- Manual checks: Script safety/readability, path quoting, trap scope, archive extraction
  layout, portable startup content, package/state boundary, and staged diff.
- Documentation checks: README, Decisions 0004/0008/0009, Decision 0010, changelog,
  quality, threat, task, catalog, and cursor agree.
- Baseline or counterfactual evidence for new regression/behavior tests: The repository
  currently has no packaging script; package construction was performed manually in
  T-0006.

## Material Amendments

None.

## Done When

- The command and documentation are present, every required runnable check passes, the
  generated archive remains untracked, and the task-scoped local commit is confirmed.
