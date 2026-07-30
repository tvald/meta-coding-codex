# Quality Record: Claude Quota Monitor Skill

- Date: 2026-07-30
- Change: Add an optional Claude Code usage-telemetry skill and ship it through the core
  installer.
- Route: Initiative
- Risk: High, because credential-file access, an authenticated outbound call, agent
  instruction discovery, and child-worker lifecycle are trust and reliability surfaces.
- Owner or reviewer: Root Orchestrator with an independent Security And Risk Agent review.

## Scope And Criteria

- User-visible outcome: A Claude Code Root Orchestrator can enforce the existing capacity
  guard using authoritative usage telemetry, with credential material never entering the
  conversation.
- In scope: The `claude-quota-monitor` skill, its `limits[]`-first reader, guard pointer,
  installer/packaging integration, durable records, and validation.
- Non-goals: A monthly-window or tiered-cutoff policy change, a bundled helper script,
  token refresh, or any surfacing of credentials or billing data.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Credential material never reaches agent context | Output-path trace, empirical stdout/stderr scan, malformed-credential test | Token absent from output; a malformed credential file yielded only `usage unavailable: capacity unknown` | Pass |
| Reader returns correct normalized windows | Live read against the usage surface | Five-hour, weekly-all, and model-scoped `Fable` weekly windows normalized; monthly absent and omitted | Pass |
| Model-scoped windows are not dropped | `limits[]` parse review and live read | `weekly_scoped` model window captured, unlike the flat-key reader | Pass |
| Skill ships without weakening installer invariants | Packer/installer inventory match, symlink-escape and preserve tests | packer == installer == CI inventory; symlink refused; existing skill preserved | Pass |
| Core remains Markdown-only and policy stays canonical | Packager file-type check and guard review | Packager admits only Markdown/YAML skill files; guard remains sole policy owner | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | Product owner selected the HTTP-read approach and the credential-containment requirement |
| Architecture and project context | Yes | Skill owns Claude telemetry procedure; agent definitions own policy; installer owns distribution |
| Data, security, and permissions | Yes | Token stays in the subprocess; independent security review completed; threat model recorded |
| Slices and ownership | Yes | Root is the sole writer; the Security And Risk Agent reviewed independently |
| Verification and rollback | Yes | Checks are declared; the optional skill is additive and removable in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Live usage read and normalization | Five-hour 15-17%, weekly 2%, model-scoped `Fable` 0%, monthly not advertised | Pass | |
| Yes | Credential-containment (token grep of stdout+stderr; malformed-credential run) | Token never emitted; malformed file leaked no fragment | Pass | |
| Yes | Packager/installer/CI inventory agreement and reproducibility | Three inventories identical; archive byte-identical across two runs | Pass | |
| Yes | Installer end-to-end offline | Fresh repo installs 9 adapter files; a pre-existing custom skill preserved (8 installed, 1 preserved) | Pass | |
| Yes | `shellcheck` on both scripts and `node --check` on the reader | Clean | Pass | |
| Yes | Independent security review | No Critical or High findings; two lower findings resolved | Pass | |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: The baseline had no
  Claude telemetry surface and no `.claude/skills` packaged tree.
- Flaky result and disposition: A `grep` for `error.message` matched an explanatory
  comment, a false positive resolved by the malformed-credential runtime test.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | `USAGE_LIMITS.md` reader copy | A divergent `catch (error)` echoed `error.message`, which can embed a credential-file fragment | Harden to a bare `catch` with a generic reason | Resolved |
| Low | Threat models | The first credential-reading surface lacked a threat-model card | Add a card capturing the containment invariants | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Proceed with the HTTP read, keep credentials out of context | Skill reads within a subprocess and emits only normalized windows | None |
| Decision 0006 | Authoritative readings drive the capacity guard | Decision 0014 and the skill supply Claude acquisition | None |
| Decision 0007 | Codex telemetry never reads credentials | Claude telemetry reads credentials only inside the subprocess, documented as a new boundary | None |
| Installer contract | Additive, exact-inventory, non-overwriting | New `.claude/skills` tree rides the existing guards; inventories agree | None |
| State and assumptions | Work and remaining checks are recoverable | Task note records the reading, review outcome, and completion | None |

## Batch And Residual Risk

- Large-diff split trigger hit: No; the skill is unusable without its guard pointer,
  packaging, and required risk/quality records.
- If kept together, why: The reader, its distribution, and its security records form one
  reviewable unit.
- Risk not resolved by passing checks: The `oauth/usage` endpoint is internal and may
  change; enforcement still depends on Root-Orchestrator compliance.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Commit the task-scoped change and exercise the skill on the next eligible
  delegated task on Claude Code.
