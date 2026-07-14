# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Build portable core archive | `./scripts/package-core.sh` | Info-ZIP `zip` 3.0 and `unzip` 6.0 | Created an integrity-checked 26-entry archive at `dist/ai-coding-meta-framework-core.zip` | 2026-07-14 |
| Lint package script | `shellcheck -s sh scripts/package-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-07-14 |

## Release

- Generated archives belong under ignored `dist/` and are not committed.
- The portable archive inventory and normalization contract is owned by
  [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
