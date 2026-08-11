# AI-Assisted Development Framework

`@tvald/meta-framework` is an immutable npm package for repository-backed AI-assisted
development. It supplies bounded agent profiles, long-form operating guidance, a
structured task CLI, provider probes, and guarded prompt extensions without copying its
reusable policy into the client repository.

The package requires Node.js 22 or newer and npm 10 or newer. Its canonical process
index is [`readme/meta/README.md`](readme/meta/README.md). The accepted package boundary
and upgrade model are recorded in
[`Decision 0021`](readme/decisions/0021-adopt-immutable-npm-framework-delivery.md).

Project initialization currently requires a local Linux filesystem with usable
`/proc/self/fd` descriptor paths. Other platforms fail closed before initialization;
native Windows and network filesystems remain unsupported.

## Install In A Client Repository

Declare an exact aliased dependency and the exact local script below, then commit both
the manifest and generated lockfile:

```json
{
  "dependencies": {
    "meta-framework": "npm:@tvald/meta-framework@<exact-version>"
  },
  "scripts": {
    "meta": "node ./node_modules/meta-framework/bin/meta-framework.mjs"
  }
}
```

The package has no lifecycle scripts. Install the committed dependency tree with
`npm ci --ignore-scripts`, or use an equivalently reviewed project script allowlist.
Do not substitute a global binary, `npx`, a network fetch, or inherited `PATH` lookup
when the checked-in local command is unavailable. Keep `--ignore-scripts` on every
invocation so client-defined `pre*` or `post*` lifecycle hooks cannot wrap the package
binary.

From the physical Git root, inspect compatibility and initialization readiness before
allowing any client-state write:

```sh
npm run --ignore-scripts --silent meta -- project --version
npm run --ignore-scripts --silent meta -- project preflight
npm run --ignore-scripts --silent meta -- project init
```

These v1 project commands accept no additional flags or positional arguments and emit
one bounded JSON object on success. `preflight` is read-only. `init` may proceed only for
`fresh`, `ready_to_initialize`, or `ready_to_add_bootstraps`; it is an idempotent success
for `valid_current_project`. It refuses source-package repositories, legacy stores,
partial or prepared state, malformed state, unsafe paths, active locks, and bootstrap or
documentation collisions instead of merging, migrating, or repairing them implicitly.

Syntax errors exit 2, refused or unsafe initialization exits 4, an active cooperative
lock exits 5, and other runtime failures exit 1. A failed command writes no success
envelope. Resolve a reported legacy, partial, prepared, or collision disposition through
the package-owned onboarding guidance before retrying:

```sh
npm run --ignore-scripts --silent meta -- docs onboarding
```

## Minimal Client Footprint

A successful clean initialization creates only:

- `AGENTS.md`, a Codex bootstrap;
- `CLAUDE.md`, a Claude Code bootstrap;
- `readme/README.md`, the bounded client-owned project cursor;
- `readme/tasks/README.md`, the static client-owned task entrypoint; and
- `readme/tasks/store/`, an empty version-1 structured task store.

The initializer never copies `readme/meta/`, prompts, roles, templates, adapters,
skills, decisions, quality evidence, framework changelogs, provider settings, caches, or
source-project facts. It does not create `.codex/` or `.claude/`. Package policy remains
inside the immutable dependency; mutable project facts remain in the client repository.

Existing canonical bootstraps and valid state documents are preserved byte for byte.
An existing instruction file without its one exact, harness-specific bootstrap block—or
with malformed, duplicate, or wrong-harness markers—is a collision. The initializer
does not overwrite it, append a companion file, or guess how established instructions
should be merged.

## Start An Agent

The generated `AGENTS.md` selects the Codex root profile and `CLAUDE.md` selects the
Claude root profile through the checked-in local npm command. A primary session follows
the complete emitted instructions, reads the client cursor and task entrypoint, then
runs:

```sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
```

A delegated assignment must name exactly one non-root profile and the applicable
harness. The worker loads only that profile:

```sh
npm run --ignore-scripts --silent meta -- agent-prompt --profile implementer --harness codex
npm run --ignore-scripts --silent meta -- agent-prompt --profile reviewer --harness claude
npm run --ignore-scripts --silent meta -- agent-prompt --profile qa --harness codex
npm run --ignore-scripts --silent meta -- agent-prompt --profile security --harness claude
```

Do not let a delegated worker infer its profile or inherit the primary `root` profile.
Supported profiles are `root`, `implementer`, `reviewer`, `qa`, and `security`; supported
harnesses are `codex`, `claude`, and `portable`.

Use the same local command for task queries, bounded documentation, facet explanations,
and normalized provider probes:

```sh
npm run --ignore-scripts --silent meta -- tasks --help
npm run --ignore-scripts --silent meta -- docs TOPIC
npm run --ignore-scripts --silent meta -- explain FACET
npm run --ignore-scripts --silent meta -- quota --harness codex
npm run --ignore-scripts --silent meta -- capability --harness claude --name delegation
```

## Upgrade And Rollback

Upgrade by changing the exact dependency and lockfile together, reinstalling with
scripts disabled, and rerunning package and client checks. The dependency is replaced as
one unit; there is no supported command that patches package-owned files in place.
Compatible client state stays client-owned. An incompatible data change requires a
separately named guarded migration.

Roll back package code by restoring the prior manifest and lockfile and reinstalling
with the same lifecycle policy. After a data migration or mutation unsupported by the
older package, use an explicit reverse migration when one exists or repair forward.

## Develop This Package

This repository is the framework source project, so `meta-framework project init`
refuses to treat it as an installed client. Source sessions follow root
[`AGENTS.md`](AGENTS.md) and the repository cursor. The principal local checks are:

```sh
npm run package:check
npm test
```

The package is assembled from the exact allowlist in `package-files.json`. Publication,
registry credentials, and release creation require separate authorization.
