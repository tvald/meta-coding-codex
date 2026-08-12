# T-0033 Working Notes

## Current State

- Route and risk: Initiative / High.
- Accepted architecture: Decision 0022.
- Primary owner: Root Orchestrator.
- Independent completion gates: Reviewer and Security.
- Candidate state: T-0033@r6 verification complete; Reviewer and Security gates pass
  with no remaining findings.

## Compatibility Evidence

Local compatibility probes on 2026-08-12 established:

- Codex 0.144.1 runs the root lifecycle hook and can load a custom manifest, but its
  `spawn_agent` tool cannot select an exact custom `agent_type`; the earlier apparent
  per-manifest delegated-hook result was inherited root/static context and is invalid.
- Codex 0.147.0 exposes exact custom `agent_type` selection and loads the corresponding
  `meta_` manifest.
- A `SubagentStart` hook nested inside that custom-agent layer does not run; the trusted
  project `.codex/hooks.json` exact matcher does run and injected a real 14,657-byte
  compiler envelope with `harness: codex` and `profile: security`.
- `[agents] enabled = false` is accepted in the 0.147.0 standalone custom layer and the
  live child confirmed `spawn_agent` was absent.
- `additionalContextLimit = 0` delivered both ends of a 16,000-character payload.
- Codex trusts each distinct hook command definition independently. The shared project
  hook file contains one root and four fixed-profile definitions, so maintainers review
  five command hashes.

These findings require project-level exact matchers, make Codex 0.147.0 the supported
baseline, and provide a mechanical recursive-delegation denial.

## Implementation Slices

1. Add the versioned hook contract and bounded Codex adapter around the existing prompt
   compiler and extension loader.
2. Add exact root and `meta_` manifest templates plus source discovery files.
3. Add explicit `project preflight/init --harness codex` delivery using the existing
   guarded client transaction; preserve the argument-free portable initializer.
4. Revise the minimal Codex fallback, metadata, policy, tests, and package audits.
5. Freeze the candidate, run complete/live evidence, then independent Reviewer and
   Security gates before task closure.

## Frozen Candidate Evidence

- `meta hook --harness codex --profile PROFILE` implements a versioned, closed Codex
  event/profile contract with bounded JSON input, fixed selectors, complete prompt
  output, and bounded stop responses.
- Source and installed-client Codex integration uses `.codex/hooks.json` plus exact
  `meta_implementer`, `meta_reviewer`, `meta_qa`, and `meta_security` manifests. The
  optional initializer creates only absent exact targets through the existing anchored
  transaction and preserves unrelated Codex state.
- Automatic source and client hooks invoke their fixed local binary paths directly,
  anchored below a quoted Git-root lookup and bypassing mutable client npm scripts. A
  packed-client fixture with a hostile `scripts.meta`, nested working directory, spaces,
  `$()`, semicolon, and brackets in the root proves neither dispatch nor root text can
  redirect an already trusted hook command.
- `project --version` reports initializer contract 1.1.0 with optional `codex`
  integration config v1; the portable state, envelope, bootstrap, and template schemas
  remain version 1.
- On the frozen r6 candidate, full `npm test` passed 104/104, the focused
  hook/compiler/initializer/package matrix exited zero, the reproducible package audit
  contained 55 files and 152,764 bytes with SHA-256
  `94d5ecc7c8bfe9eb58a215955dd8390354f3b6fddcf411d44efc810f316bb321`, and
  `git diff --check` plus task-store doctor passed.
- Live Codex 0.147.0 verified all four trusted project-level exact agent mappings with
  complete attributable envelopes and no child `spawn_agent` tool. A final session
  started from `/workspace/readme`, loaded the root hook there, spawned exact
  `meta_security`, and its child transcript contained the real security compiler
  envelope before returning `T0033_NESTED_CWD_OK` without tools.
- Independent Reviewer and Security repeat gates both passed the frozen r6 candidate
  with no remaining blocking or advisory findings.

## Worker Roster

| Role | Assignment | State | Outcome |
| --- | --- | --- | --- |
| Root Orchestrator | Integrated implementation and deterministic/live verification | Complete | Frozen r6 checks and nested-cwd live probe pass |
| Reviewer | Correctness, compatibility, package/client boundary, and evidence gate | Passed | No blocking or advisory findings remain |
| Security | Hook parsing, identity binding, trust/fallback, and path-safety gate | Passed | No blocking or advisory findings remain |

## Rollback

- Revert the T-0033 commit for source rollback.
- In an installed client, revert the reviewed `.codex/hooks.json` and four
  `.codex/agents/meta_*.toml` files through Git; do not delete colliding client files.
- Restore the prior exact package manifest/lock and run the script-disabled install for
  package rollback. Run Codex integration preflight before starting a new session.
