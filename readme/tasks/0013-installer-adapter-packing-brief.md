# Installer Adapter And Skill Packing

## Goal

Make the core packager and piped installer include the harness adapter and skill trees
(`.claude/agents`, `.codex/agents`, `.agents/skills`) so a destination repository receives
every file needed to run the framework, not only `AGENTS.md` and `readme/meta/**`.

## Background

The meta README's package contract already said adopters may merge the matching Codex and
Claude adapters and the quota-monitor skill, but `package-core.sh` staged only
`readme/meta` and `AGENTS.md`. The installer validated downloads against that same partial
inventory, so the dot-directories were silently absent from every release. This record is
backfilled for commit `0a8cd76`, which shipped before its durable records existed.

## Scope

In scope:

- Staging and type-validating the three adapter/skill trees in `package-core.sh`.
- Extending `install-core.sh` inventory, entry allowlist, and post-extract checks, and
  installing the trees additively with same-name preservation and symlink-escape refusal.
- Aligning the CI release verifier inventory.

Out of scope:

- New adapter or skill content, and any capacity-policy change.

## Users And Workflows

| User/Actor | Workflow | Expected Change |
| --- | --- | --- |
| Framework adopter | Install the core into a repository | Receive Codex/Claude adapters and the quota skill additively |
| Root Orchestrator | Rely on native role/skill discovery | Find the adapter and skill files present after install |

## Acceptance Criteria

- [x] The archive contains `.claude/agents`, `.codex/agents`, and `.agents/skills` files.
- [x] Packer, installer, and CI inventories agree exactly and the archive is reproducible.
- [x] Installation is additive: existing same-name agents/skills are preserved and no
      symlinked path component is traversed.
- [x] `shellcheck` is clean and the installer end-to-end offline paths pass.

## Constraints

- The packager admits only the file types each surface publishes (Markdown, TOML, YAML).
- The installer's exact-inventory, size, path-safety, and rollback guards stay intact.

## Workflow Route

- Route: Quick change
- Why this route: A bounded correctness fix to existing packaging and installer scripts.
- Risk gate: High, because it changes installer behavior and file-system handling.
- Escalation trigger: Any change that weakens path-traversal, symlink, or inventory
  guarantees.
- Next action after this task: Ship new skills through the same packaged trees.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A stray non-adapter file is packaged | Larger or unsafe archive | Per-tree file-type validation |
| Symlinked adapter path redirects a write | Escape outside the repo | Refuse symlinked path components on install |
| Existing host agent or skill is overwritten | Host customization lost | Preserve any same-name destination |

## Verification Plan

- Automated checks: `shellcheck`, packer/installer/CI inventory match, reproducibility.
- Manual checks: Fresh install, existing-repo preservation, symlink-escape, and a
  packager negative test on an unsupported file type.

## Done When

- All acceptance criteria and required checks pass and the change is committed locally.
