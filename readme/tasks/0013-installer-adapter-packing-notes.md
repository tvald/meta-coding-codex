# Installer Adapter And Skill Packing Notes

## Task Cursor

- Name: Pack harness adapters and skills into the core installer
- Started: 2026-07-30
- Last updated: 2026-07-30
- Status: Done
- Route: Quick change
- Latest user instruction: Update the installer so it includes all files necessary to
  deploy the framework into an existing repo (the dot-directories were not packed).
- Goal and completion criteria: Package and install the adapter/skill trees additively
  with all inventory, safety, and reproducibility guarantees intact.
- Next safe action: None; records backfilled after commit `0a8cd76`.

## Backfill Note

This task and its records were created on 2026-07-30 after the implementing commit
`0a8cd76`, which was made without first reserving a catalog ID or writing durable records.
See retrospective [R-2026-07-30-01](../learning/retrospectives.md#r-2026-07-30-01).

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Packager | Done | Root Orchestrator | `scripts/package-core.sh` | Type validation, inventory, reproducibility | Extend for new trees |
| Installer | Done | Root Orchestrator | `scripts/install-core.sh` | Inventory, additive install, symlink guard | Review at trigger |
| CI verifier | Done | Root Orchestrator | `.github/workflows/publish-core-latest.yml` | Inventory handshake | Review at trigger |

## Repository And Verification State

- Changed files: `package-core.sh`, `install-core.sh`, `publish-core-latest.yml`.
- Recent commits: `6bf48ed` was `HEAD` when work began; result committed as `0a8cd76`.
- Commands already run and observed results: `shellcheck` clean on both scripts; packer,
  installer, and CI inventories matched and the archive was byte-identical across two
  runs; the offline installer placed the adapter files on a fresh repo, preserved a
  pre-existing custom agent and an unrelated `settings.json`, and refused a symlinked
  `.codex` without writing outside the repo; a packager negative test rejected a stray
  `.txt` in an adapter directory.
- Required checks remaining: None.
- Decisions and assumptions since start: Install adapters additively and best-effort after
  the atomic core install so an optional-file issue never destabilizes the core.

## Parked Approvals

None.

## Usage Capacity

- Last authoritative meter reading: Not separately recorded for this backfilled task; the
  same-session T-0012 reading showed all windows well below cutoff.
- Limiting or unknown windows: None.
- Resume condition and next safe action: Capacity was safe throughout.

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-07-30 | Implemented and committed adapter/skill packing as `0a8cd76` | Packer/installer/CI diff and adversarial installer tests |
| 2026-07-30 | Backfilled catalog, brief, notes, and quality records | This note and the quality record |
