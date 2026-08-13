# Project Standards

This file extends the shared standards in `readme/meta/development-standards.md` and is
the canonical catalog of successfully executed project commands.

## Commands

| Action | Exact Command | Prerequisites | Observed Result | Last Verified |
| --- | --- | --- | --- | --- |
| Test framework data CLI | `node --test tests/framework-data*.mjs` | Node.js 22+ on a supported local filesystem | 38 tests passed through source and installed package fixtures, including lock-free reads, worktree-scoped mutation locking, migration, interruption, recovery, and 10,000-task bounded queries | 2026-08-13 |
| Test installed package task CLI | `npm run --silent test:tasks` | Node.js 22+, npm 10+, Git, and supported local filesystem | 8 packed-client task/root tests passed, including task CLI 2.0 mutations, provider metadata, and hostile-root, Git, compatibility, and lock negatives | 2026-08-13 |
| Test provider probe adapters | `npm run --silent test:provider` | Node.js 22+, Git, and supported POSIX process groups | 16 normalization, redaction, drift, root, environment, protocol, timeout, descendant-cleanup, capability, and public-envelope tests passed | 2026-08-11 |
| Test npm package boundary | `npm run --silent test:package` | Node.js 22+ and npm 10+ | 66 package lifecycle, metadata, pack, local install, replacement/rollback, initialization, prompt, extension, provider, task CLI 2.0, and hostile-boundary tests passed | 2026-08-13 |
| Audit npm package artifact | `npm run --silent package:check` | Node.js 22+ and npm 10+ | Exact reproducible 60-file package inventory passed; current bytes and SHA-256 are recorded in the task quality evidence | 2026-08-13 |
| Test all Node suites | `npm test` | Node.js 22+ and npm 10+ | 105 tests passed, including aggregate replacement/rollback, retirement, framework-data lifecycle, installed package, initialization, hook, prompt, extension, provider, and npm boundary regressions | 2026-08-12 |
| Validate live framework and task store | `node readme/meta/framework-data/cli.mjs doctor` | Run from the repository root | Store and all nine integrated framework checks passed without errors; the due maintenance warning was cleared by the 2026-08-13 pass | 2026-08-13 |
