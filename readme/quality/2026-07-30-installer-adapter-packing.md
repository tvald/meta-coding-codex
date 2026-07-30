# Quality Record: Installer Adapter And Skill Packing

- Date: 2026-07-30 (backfilled for commit `0a8cd76`)
- Change: Package and install the `.claude/agents`, `.codex/agents`, and `.agents/skills`
  trees so the installer deploys every framework file.
- Route: Quick change
- Risk: High, because it changes installer behavior, archive contents, and file-system
  handling.
- Owner or reviewer: Root Orchestrator with adversarial installer testing.

## Scope And Criteria

- User-visible outcome: A deployed repository receives the harness adapters and the
  quota-monitor skill, not only the core docs.
- In scope: Packager staging/validation, installer inventory/allowlist/install, CI
  verifier, and reproducibility.
- Non-goals: New adapter or skill content and any capacity-policy change.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Adapter/skill trees are packaged | Archive inventory listing | `.claude/agents`, `.codex/agents`, `.agents/skills` present | Pass |
| Inventories agree and archive is reproducible | packer/installer/CI diff and double-build | Three inventories identical; byte-identical archives | Pass |
| Installation is additive and safe | Fresh, collision, and symlink-escape runs | Existing agent/skill and `settings.json` preserved; symlinked `.codex` refused with no external write | Pass |
| Guards and lint intact | `shellcheck` and negative packager test | Clean; stray `.txt` in an adapter dir rejected | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Direct user bug report about missing dot-directories |
| Data, security, and permissions | Yes | Path-traversal, symlink, and inventory guards retained and tested |
| Verification and rollback | Yes | Additive install; change removable in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | `shellcheck` on both scripts | Clean | Pass | |
| Yes | packer/installer/CI inventory match and reproducibility | Identical inventories; byte-identical archives | Pass | |
| Yes | Installer end-to-end (fresh, collision, symlink) | Adapters installed; same-name files preserved; symlink escape refused | Pass | |
| Yes | Packager negative test | Unsupported file type rejected | Pass | |

- Criteria or methods amended after implementation began: None.
- Flaky result and disposition: None.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Process | Records | Implementation was committed (`0a8cd76`) before its catalog ID and durable records existed | Backfill task, quality, and retrospective records | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Pack all files needed to deploy | Adapter/skill trees are packaged and installed additively | None |
| Package contract (meta README) | Adopters may merge matching adapters and the skill | Installer now ships them | None |
| Installer safety guards | Exact-inventory, path-safe, non-overwriting | Retained and tested for the new trees | None |

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: None; superseded packaging is extended by T-0012's `.claude/skills` tree.
