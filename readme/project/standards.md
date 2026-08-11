# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Build portable core archive | `./scripts/package-core.sh` | Node.js 22+, Git, Info-ZIP `zip` 3.0 and `unzip` 6.0 | Created two byte-identical, integrity-checked 46-entry archives; SHA-256 `4b77df022a622b85cb61b866af10b70ca163f954d464aac0d9f51eef6001f674` | 2026-08-11 |
| Test framework data CLI | `node --test tests/framework-data*.mjs` | Node.js 22+ on a supported local filesystem | 26 tests passed, including migration, concurrency, interruption, and 10,000-task bounded queries | 2026-08-11 |
| Validate live framework and task store | `node readme/meta/framework-data/cli.mjs doctor` | Run from the repository root | Store and all eight integrated framework checks passed without warnings | 2026-08-11 |
| Lint package script | `shellcheck -s sh scripts/package-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-08-05 |
| Lint piped installer | `shellcheck -s bash scripts/install-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-08-05 |
| Install latest portable core | `curl -fsSL https://raw.githubusercontent.com/tvald/meta-coding-codex/main/scripts/install-core.sh \| bash` | Run from an adopter root with the dependencies documented in top-level README | Exact command structure installed a mocked, validated 46-entry payload; fresh and collision/rollback/signal fixtures passed; external fetch intentionally not executed | 2026-08-11 |
| Validate Actions schema and embedded shell | `actionlint .github/workflows/publish-core-latest.yml` | Checksum-verified Actionlint 1.7.12 | Completed with no findings | 2026-07-14 |
| Lint workflow YAML | `yamllint -d '{extends: default, rules: {line-length: disable, truthy: disable}}' .github/workflows/publish-core-latest.yml` | yamllint 1.37.1 | Completed with no findings | 2026-07-14 |

## Release

- Generated archives belong under ignored `dist/` and are not committed.
- The portable archive inventory and normalization contract is owned by
  [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
- The moving `latest` release, permission, and concurrency contract is owned by
  [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md).
