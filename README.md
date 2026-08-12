# AI-Assisted Development Framework

`@tvald/meta-framework` is an immutable npm package for repository-backed AI-assisted
development. It supplies bounded agent profiles, long-form operating guidance, a
structured task CLI, provider probes, guarded prompt extensions, and optional Codex
lifecycle prompt injection without copying reusable policy into the client repository.

The package requires Node.js 22 or newer and npm 10 or newer. Its canonical process
index is [`readme/meta/README.md`](readme/meta/README.md). The accepted package boundary
and upgrade model are recorded in
[`Decision 0021`](readme/decisions/0021-adopt-immutable-npm-framework-delivery.md).

Project initialization currently requires a local Linux filesystem with usable
`/proc/self/fd` descriptor paths. Other platforms fail closed before initialization;
native Windows and network filesystems remain unsupported.

## Install In A Client Repository

Declare an exact aliased dependency and the exact local script below, then generate and
commit the lockfile with lifecycle scripts disabled:

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

```sh
npm install --package-lock-only --ignore-scripts --save-exact \
  'meta-framework@npm:@tvald/meta-framework@<exact-version>'
npm ci --ignore-scripts
```

Review the manifest and lockfile diff before committing it. The package has no
lifecycle scripts. Do not substitute a global binary, `npx`, a network fetch, or
inherited `PATH` lookup when the checked-in local command is unavailable. Keep
`--ignore-scripts` on every invocation so client-defined `pre*` or `post*` lifecycle
hooks cannot wrap the package binary.

From the physical Git root, inspect compatibility and initialization readiness before
allowing any client-state write:

```sh
npm run --ignore-scripts --silent meta -- project --version
npm run --ignore-scripts --silent meta -- project preflight
npm run --ignore-scripts --silent meta -- project init
```

The argument-free portable commands above accept no flags or positional arguments and emit one
bounded JSON object on success. `preflight` is read-only. `init` may proceed only for
`fresh`, `ready_to_initialize`, or `ready_to_add_bootstraps`; it is an idempotent success
for `valid_current_project`. It refuses source-package repositories, legacy stores,
partial or prepared state, malformed state, unsafe paths, active locks, and bootstrap or
documentation collisions instead of merging, migrating, or repairing them implicitly.

For a trusted Codex project, explicitly review and install the optional lifecycle
integration after the portable project is current:

```sh
npm run --ignore-scripts --silent meta -- project preflight --harness codex
npm run --ignore-scripts --silent meta -- project init --harness codex
```

This separate mode creates only `.codex/hooks.json` and the four exact custom-agent
files `meta_implementer.toml`, `meta_reviewer.toml`, `meta_qa.toml`, and
`meta_security.toml`. It preserves `.codex/config.toml` and unrelated files. Existing,
changed, linked, malformed, stale, or same-name targets are reported and refused rather
than overwritten or merged. An exact-plus-absent framework prefix may be completed
safely after interruption.

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
source-project facts. The portable operation does not create `.codex/` or `.claude/`;
only the explicit Codex integration mode creates the five mechanics files described
above. Package policy remains inside the immutable dependency; mutable project facts
remain in the client repository.

Existing canonical bootstraps and valid state documents are preserved byte for byte.
An existing instruction file without its one exact, harness-specific bootstrap block—or
with malformed, duplicate, or wrong-harness markers—is a collision. The initializer
does not overwrite it, append a companion file, or guess how established instructions
should be merged.

## Start An Agent

In a trusted project with the reviewed Codex integration, `SessionStart` injects the
current compiled root profile for startup, resume, clear, and compaction. The generated
`AGENTS.md` recognizes that envelope and does not duplicate-load it. Automatic source
hooks invoke `node "$(git rev-parse --show-toplevel)/bin/meta-framework.mjs"`;
installed-client hooks use the equivalent fixed dependency path below that Git root.
The quoted root keeps subdirectory sessions and repository names containing shell
metacharacters safe while bypassing mutable client npm scripts. `meta hook` remains the
public CLI. If hooks are disabled, untrusted, or administratively restricted,
`AGENTS.md` uses the checked-in local `agent-prompt` fallback and stops on failure.
Claude continues to load its root profile through `CLAUDE.md`.

The adapter is live-tested only against the versions in `meta hook --version` (currently
Codex 0.147.0). It does not inspect the running Codex version. Treat another version as
unverified: review it before enabling the integration, or revert/disable the optional
Codex integration files so the `AGENTS.md` fallback remains authoritative.

A primary session then reads the client cursor and task entrypoint and runs:

```sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
```

A Codex delegated assignment passes exactly one custom-agent name as `agent_type`.
Project-level exact `SubagentStart` matchers load only the corresponding fixed profile:

| Custom agent | Compiled profile |
| --- | --- |
| `meta_implementer` | `implementer` |
| `meta_reviewer` | `reviewer` |
| `meta_qa` | `qa` |
| `meta_security` | `security` |

Do not use built-in, unprefixed, or inferred names for these roles. Each standalone
manifest sets `features.multi_agent = false` and also tells the specialist not to
delegate.
For a harness without this accepted lifecycle adapter, the worker uses the portable
explicit command:

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

Replace the package by changing the exact alias and lockfile together:

```sh
npm install --package-lock-only --ignore-scripts --save-exact \
  'meta-framework@npm:@tvald/meta-framework@<replacement-version>'
npm ci --ignore-scripts
npm run --ignore-scripts --silent meta -- project --version
npm run --ignore-scripts --silent meta -- project preflight
npm run --ignore-scripts --silent meta -- project preflight --harness codex
```

Review the complete manifest and lockfile change before installation. The dependency is
replaced as one unit; there is no supported command that patches package-owned files in
place, copies a new framework tree over an old one, or reconciles package files inside a
client. Compatible client state stays client-owned. An incompatible data change
requires a separately named guarded migration.

If `project preflight` reports `fresh`, `ready_to_initialize`,
`ready_to_add_bootstraps`, or `valid_current_project`, run
`npm run --ignore-scripts --silent meta -- project init`; the valid-current case is an
idempotent success. Never run initialization after any refused, unsafe, busy, malformed,
legacy, partial, prepared, or collision disposition.

If Codex integration preflight reports `ready_to_add_codex_integration` or
`ready_to_complete_codex_integration`, review the target inventory and run
`project init --harness codex`. `valid_current_codex_integration` is idempotent. A
client-owned, stale, malformed, linked, or colliding target requires explicit maintainer
reconciliation; do not delete or replace it based on a marker or matching path alone.

After initialization is complete, verify the client task state:

```sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
```

Roll back package code by restoring both the prior manifest and prior lockfile, running
`npm ci --ignore-scripts`, and repeating the local version, preflight, doctor, and
startup checks above. After a data migration or mutation unsupported by the older
package, use an explicit reverse migration when one exists or repair forward; restoring
package code alone is not a data rollback.

Disable or roll back the Codex mechanics by reverting only the reviewed five `.codex`
integration files through Git. Never remove an existing collision or unrelated Codex
configuration. Trust the project and approve changed hook hashes only after reviewing
the exact checked-in command. The root hook and four fixed-profile agent hooks are five
distinct definitions, so review and approve every changed hash; trusting one does not
approve the others. `allow_managed_hooks_only` or disabled hooks intentionally leave
the `AGENTS.md` fallback active.

Clients that previously received the framework through the retired copied-core
installer must not delete same-named paths merely because they resemble old framework
files. Use the bounded
[`copied-client-transition`](readme/meta/copied-client-transition.md) procedure, which
requires an exact reviewed legacy snapshot, per-file provenance and digest matches, a
dry run, and a recoverable Git boundary. It supplies guidance and inert ownership data,
not a cleanup executable.

## Report Framework Defects

Do not edit installed files under `node_modules`, keep a client-side framework
changelog, or carry a local patch into the next install. Capture the output of
`npm run --ignore-scripts --silent meta -- project --version`, minimize sensitive client
details, and report the defect through the
[framework issue tracker](https://github.com/tvald/meta-coding-codex/issues). Accepted
fixes belong in the framework source repository and reach clients through a newly
reviewed exact dependency and lockfile replacement. Opening an issue or pull request is
an external action and still requires the applicable user or repository authority.

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
