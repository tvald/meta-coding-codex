# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Build portable core archive | `./scripts/package-core.sh` | Info-ZIP `zip` 3.0 and `unzip` 6.0 | Created an integrity-checked 26-entry archive at `dist/ai-coding-meta-framework-core.zip` | 2026-07-14 |
| Lint package script | `shellcheck -s sh scripts/package-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-07-14 |
| Lint piped installer | `shellcheck -s bash scripts/install-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-07-14 |
| Install latest portable core | `curl -fsSL https://raw.githubusercontent.com/tvald/meta-coding-codex/main/scripts/install-core.sh \| bash` | Run from an adopter root with the dependencies documented in top-level README | Exact command structure installed a mocked, validated 26-entry latest payload; external fetch intentionally not executed | 2026-07-14 |
| Validate Actions schema and embedded shell | `actionlint .github/workflows/publish-core-latest.yml` | Checksum-verified Actionlint 1.7.12 | Completed with no findings | 2026-07-14 |
| Lint workflow YAML | `yamllint -d '{extends: default, rules: {line-length: disable, truthy: disable}}' .github/workflows/publish-core-latest.yml` | yamllint 1.37.1 | Completed with no findings | 2026-07-14 |

## Release

- Generated archives belong under ignored `dist/` and are not committed.
- The portable archive inventory and normalization contract is owned by
  [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
- The moving `latest` release, permission, and concurrency contract is owned by
  [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md).
