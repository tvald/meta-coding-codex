# Quality Record: Client Bootstrap And Initializer

- Date: 2026-08-11
- Change: T-0029 thin Codex/Claude bootstraps and clean-client initialization
- Route: Initiative
- Risk: High
- Owner or reviewer: Root Orchestrator with independent Architect, Security, QA, and Reviewer gates

## Scope And Criteria

- User-visible outcome: a clean Git client with the exact installed framework alias can
  create the minimum client-owned cursor/task state and thin harness entrypoints, then a
  primary or delegated Codex/Claude session can load the correct packaged profile
  without copied framework policy or package mutation.
- In scope: initializer grammar, package/client root validation, exact bootstrap and
  client-state seeds, task-store initialization, collision and interruption behavior,
  Codex/Claude profile selection, packed clean-client fixtures, and bounded output.
- Non-goals: dependency installation, package.json/lock editing, framework-source copy,
  legacy migration, semantic merging of existing instructions, provider configuration,
  registry/network access, or project-knowledge synthesis.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Initializer mutates only one validated client Git root and never package bytes | Packed-client tree digests plus unrelated/nested/symlinked root negatives | Exact package/client digests and descriptor-swap outside sentinels passed | Pass |
| Fresh initialization creates only exact thin bootstraps and minimum client-owned task/cursor state | Exact inventory/content snapshot and absence checks for copied `readme/meta`, adapters, skills, caches, and framework logs | Exact 0644/0755 inventory and forbidden-copy absence assertions passed | Pass |
| Existing or partial client instructions/state are preserved and unsafe collisions fail before unrelated writes | Existing-file, directory, link, hardlink, malformed, partial, concurrency, and interruption matrix | Collision, rollback, lock, SIGKILL, metadata/mode drift, populated-store, ownership-loss, and exact-prefix fixtures passed | Pass |
| Codex and Claude primary/delegated entrypoints select only the matching harness and assigned profile | Static byte checks plus clean local Codex/Claude startup fixtures | All 15 compiled profiles passed; local Claude and Codex discovery probes selected the expected harness | Pass |
| Missing local dependency or hostile inherited PATH cannot initialize or start the framework | Packed-script missing-alias/PATH sentinel tests | Missing-local hostile-PATH and npm pre/post lifecycle sentinels remained untouched | Pass |
| Repeated successful invocation is deterministic and reports a bounded stable result | Repeat/idempotency, envelope, stdout/stderr, and size checks | Repeat tree digest and store digest were identical; all outputs stayed within bounds | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | T-0029, the T-0023 umbrella brief, and Decision 0021 bound initialization to client-owned state and thin discovery files |
| Architecture and project context | Yes | Independent Architect fixed the v1 command, compatibility, bootstrap/state bytes, dispositions, locking, recovery, output, and verification contract below |
| Data, security, and permissions | Concern | The command creates root instructions and canonical task state; wrong-root, overwrite, symlink, concurrent, or partial writes are high-impact |
| Slices and ownership | Yes | T-0029 owns initialization and the directly conflicting client-start guidance removed with it; T-0030 owns obsolete executable/test retirement plus broader migration reconciliation; T-0031 owns aggregate release proof |
| Verification and rollback | Yes | Packed temporary Git clients and local harness CLIs can provide deterministic positive/negative evidence; Git removal reverts newly created client files |

Readiness verdict: Ready. The independent Architect required and accepted the exact v1
amendments below before material implementation; Security remains a completion gate.

## Architecture Amendments

- The public family is `meta-framework project --version|preflight|init`, invoked through
  `npm run --ignore-scripts --silent meta -- project ...`, with no v1 flags or positionals. Package metadata
  adds exact `projectInit` compatibility for version/envelope/bootstrap/state-template
  v1. Help/version stay rootless. Preflight reports source mode; init is installed-only.
- Installed init reuses the exact alias/v3-lock/physical package and Git-client root
  boundary and additionally requires
  `scripts.meta === "node ./node_modules/meta-framework/bin/meta-framework.mjs"` with no
  `premeta`/`postmeta`. It never edits manifests, locks, dependencies, Git, or package bytes.
- Generated `AGENTS.md` and `CLAUDE.md` are separate, structurally identical UTF-8/LF
  bootstraps differing only by explicit `codex`/`claude`. Primary sessions load `root`;
  delegated assignments must name exactly one of `implementer`, `reviewer`, `qa`, or
  `security` and must not infer or broaden to root. Missing local commands stop without
  global, npx, network, or package-path fallback.
- An existing instruction file is recognized only when one canonical line-bounded v1
  block for its harness occurs in one bounded ordinary safe file; surrounding client
  bytes are preserved. Missing files may be created. Wrong/duplicate/malformed markers,
  unsafe types/modes, or an unrelated file are `bootstrap_collision`; no auto-merge,
  companion file, or overwrite is allowed.
- The only client-state footprint is the two bootstraps, a small client-owned
  `# Project State` cursor, a static `# Task Store` entrypoint, and an empty v1 task store.
  Seeds contain npm package commands and no copied `readme/meta`, policy, prompt, adapter,
  skill, project fact, decision, quality record, changelog, cache, or provider setting.
- Preflight emits one canonical <=8,192-byte envelope with closed bootstrap states and
  conservative task disposition. Only `fresh`, `ready_to_initialize`, and
  `ready_to_add_bootstraps` mutate; `valid_current_project` is an idempotent no-op.
  Legacy, partial, prepared-without-provenance, collision, busy, malformed, and source
  states refuse without repair or migration.
- Hold the existing Git-common task lock once. Build a root-local 0700 transaction stage
  named for the originating lock token and maintain a canonical journal through a held
  no-follow descriptor. On local Linux, hold `/proc/self/fd` anchors for the client root,
  stage, and every destination parent; create the empty store exclusively through those
  anchors. Revalidate package/client metadata, preserved state, store ownership, and final
  bytes before the stage-removal commit point. Caught failures roll back only proved
  invocation identities; ownership loss retains the branded lock and journal for explicit
  recovery. Killed runs retain lock/journal and only an exact phase prefix may resume.
- Syntax exits `2`, unsafe/collision/legacy/partial/source exits `4`, shared lock failures
  exit `5`, and other runtime/I/O failures exit `1`. Failure stdout is empty; generic
  stderr is <=1,024 bytes and exposes no absolute path, content, URL, environment, or
  lock owner. Success paths/result arrays use only fixed relative names.
- Mandatory tests cover reproducible packs, fresh/current/bootstrap-add/source/all task
  dispositions, exact bytes/modes/no-copy/package invariance, all profiles and both
  harnesses, missing-local/PATH/offline no-fetch, links/types/modes/encodings/races,
  injected phase failures, rollback, killed-stage recovery, lock contention/concurrency,
  and bounded outputs. Local native Codex/Claude smokes are required environment evidence
  but remain separate from deterministic CI.

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Focused initializer/bootstrap unit and adversarial packed-client suite | 13/13 passed, including npm-hook, metadata/readiness races, populated-store, umask, fd-swap, ownership-loss, SIGKILL, rollback, and recovery cases | Pass | N/A |
| Yes | Local Codex and Claude startup/profile evidence | Claude Code 2.1.206 live fixtures loaded `CLAUDE.md` and selected `claude`; Codex 0.144.1 prompt-input inspection loaded `AGENTS.md` and selected `codex` | Pass | N/A |
| Yes | Task/prompt/package/provider and full regressions | Task/framework 36/36, prompt 8/8, package 55/55, and full 88/88 passed | Pass | N/A |
| Yes | Exact package audit, doctor, budgets, staged evidence, and diff checks | 66 files, 148,177 bytes, sha256 `4eb5daf76d206e2779b1aa0c538f5fb4e8c574e94ec2d51a20c5f11a0eb3d311`; unstaged and 35-path staged doctors plus diff checks passed without warnings/errors | Pass | N/A |
| Yes | Independent Architect, Security, QA, and Reviewer gates | All four independent gates passed the final frozen implementation; no blocker remains | Pass | N/A |

- Criteria or methods amended after implementation began, with reason and impact: the
  pre-implementation Architect fixed the command namespace, exact bytes, disposition,
  transaction/recovery, errors, and live-harness split. No material implementation
  preceded the amendment.
- Counterfactual evidence for new behavior: wrong roots, script hooks, instruction/state
  collisions, modes, links, descriptor-parent swaps, partial and killed windows,
  ownership loss, missing package, hostile PATH, profile drift, copied-policy inventory,
  metadata drift, and output overflow all failed closed in isolated fixtures.
- Flaky result and disposition: None observed.

## Batch And Residual Risk

- Large-diff split trigger hit: Reassess after architecture; templates, root validation,
  task-store claim, CLI framing, and clean-harness fixtures share one initialization effect.
- If kept together, why: exact seeds, task-store claim, descriptor transaction, root
  validation, CLI framing, and recovery form one externally atomic initialization effect.
- Risk not resolved by passing checks: harness auto-discovery can change across provider
  versions; pure Node lacks unlink-by-inode for the final same-UID check/unlink interval;
  and v1 intentionally requires local Linux `/proc/self/fd`. Identity loss fails closed
  with retained recovery evidence, while release verification detects provider drift.

## Completion

- Required checks all passed: Yes.
- Status: Done.
- Exact incomplete condition, if not Done: N/A.
- Next action: T-0030 retires the superseded ZIP/curl delivery surface and reconciles
  remaining live migration guidance.
