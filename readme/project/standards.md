# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Test framework data CLI | `node --test tests/framework-data*.mjs` | Node.js 22+ on a supported local filesystem | 31 tests passed through source and installed package fixtures, including migration, concurrency, interruption, recovery, and 10,000-task bounded queries | 2026-08-11 |
| Test installed package task CLI | `npm run --silent test:tasks` | Node.js 22+, npm 10+, Git, and supported local filesystem | 8 packed-client task/root tests passed, including semantic/control mutations, provider metadata, and hostile-root, Git, compatibility, and lock negatives | 2026-08-11 |
| Test provider probe adapters | `npm run --silent test:provider` | Node.js 22+, Git, and supported POSIX process groups | 16 normalization, redaction, drift, root, environment, protocol, timeout, descendant-cleanup, capability, and public-envelope tests passed | 2026-08-11 |
| Test npm package boundary | `npm run --silent test:package` | Node.js 22+ and npm 10+ | 56 package lifecycle, metadata, pack, local install, replacement/rollback, initialization, prompt, extension, provider, task CLI, and hostile-boundary tests passed | 2026-08-11 |
| Audit npm package artifact | `npm run --silent package:check` | Node.js 22+ and npm 10+ | Exact reproducible 55-file, 153215-byte inventory passed; SHA-256 `ea2566ddcd88e611c76b2e2d94a887d9da81ec7217e561abd90fd41c9301aaf1` | 2026-08-12 |
| Test all Node suites | `npm test` | Node.js 22+ and npm 10+ | 105 tests passed, including aggregate replacement/rollback, retirement, framework-data lifecycle, installed package, initialization, hook, prompt, extension, provider, and npm boundary regressions | 2026-08-12 |
| Validate live framework and task store | `node readme/meta/framework-data/cli.mjs doctor` | Run from the repository root | Store and all nine integrated framework checks passed without warnings | 2026-08-11 |
