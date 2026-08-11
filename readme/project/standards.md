# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Build portable core archive | `./scripts/package-core.sh` | Node.js 22+, Git, Info-ZIP `zip` 3.0 and `unzip` 6.0 | Created two byte-identical, integrity-checked 49-entry archives; SHA-256 `00fa81259e084ae6f0a1308b05f5dadd7637386a188f60ab150b7dd317b99f8a` | 2026-08-11 |
| Test framework data CLI | `node --test tests/framework-data*.mjs` | Node.js 22+ on a supported local filesystem | 33 tests passed through an installed package fixture, including migration, concurrency, interruption, and 10,000-task bounded queries | 2026-08-11 |
| Test installed package task CLI | `npm run --silent test:tasks` | Node.js 22+, npm 10+, Git, and supported local filesystem | 8 packed-client task/root tests passed, including semantic/control mutations, provider metadata, and hostile-root, Git, compatibility, and lock negatives | 2026-08-11 |
| Test provider probe adapters | `npm run --silent test:provider` | Node.js 22+, Git, and supported POSIX process groups | 11 normalization, redaction, drift, root, environment, protocol, timeout, descendant-cleanup, capability, and public-envelope tests passed | 2026-08-11 |
| Test npm package boundary | `npm run --silent test:package` | Node.js 22+ and npm 10+ | 27 package lifecycle, metadata, pack, local install, task CLI, provider probe, and hostile-boundary tests passed | 2026-08-11 |
| Audit npm package artifact | `npm run --silent package:check` | Node.js 22+ and npm 10+ | Exact reproducible 57-file, 112629-byte inventory passed; SHA-256 `81540dab49bb350a2f40e06386ee74babd9e7c51e832c7f050b7b4fc21dfd5f8` | 2026-08-11 |
| Test all Node suites | `npm test` | Node.js 22+ and npm 10+ | 60 tests passed, including framework-data, installed package, provider, and npm boundary regressions | 2026-08-11 |
| Validate live framework and task store | `node readme/meta/framework-data/cli.mjs doctor` | Run from the repository root | Store and all eight integrated framework checks passed without warnings | 2026-08-11 |
| Lint package script | `shellcheck -s sh scripts/package-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-08-11 |
| Lint piped installer | `shellcheck -s bash scripts/install-core.sh` | ShellCheck 0.10.0 | Completed with no findings | 2026-08-11 |
| Install latest portable core | `curl -fsSL https://raw.githubusercontent.com/tvald/meta-coding-codex/main/scripts/install-core.sh \| bash` | Run from an adopter root with the dependencies documented in top-level README | Exact command structure installed a mocked, validated 49-entry payload; onboarding and recovery fresh/collision/rollback/signal fixtures passed; external fetch intentionally not executed | 2026-08-11 |
| Validate Actions schema and embedded shell | `actionlint .github/workflows/publish-core-latest.yml` | Checksum-verified Actionlint 1.7.12 | Completed with no findings | 2026-08-11 |
| Lint workflow YAML | `yamllint -d '{extends: default, rules: {line-length: disable, truthy: disable}}' .github/workflows/publish-core-latest.yml` | yamllint 1.37.1 | Completed with no findings | 2026-08-11 |

## Release

- Generated archives belong under ignored `dist/` and are not committed.
- The portable archive inventory and normalization contract is owned by
  [Decision 0010](../decisions/0010-automate-portable-core-archive.md).
- The moving `latest` release, permission, and concurrency contract is owned by
  [Decision 0011](../decisions/0011-publish-moving-latest-core-release.md).
