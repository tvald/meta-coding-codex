# Quality Record: Agent Adapter Pilot

- Date: 2026-07-10
- Change: Add an optional Claude entrypoint bridge and thin Codex/Claude agent adapters.
- Route: Initiative
- Risk: High, because agent instruction discovery and tool boundaries are trust surfaces.
- Owner or reviewer: Root Orchestrator applying architecture, QA, security, and
  documentation review lenses.

## Scope And Criteria

- User-visible outcome: Framework adopters can use named independent quality agents in
  Codex or Claude Code without duplicating or bypassing canonical framework process.
- In scope: Entrypoint bridge, six adapter definitions, optional-adapter policy,
  packaging, pilot terms, security analysis, verification, and durable records.
- Non-goals: Full role mirroring, custom root orchestration, model/MCP configuration,
  runtime code, expanded authority, or publication.

| Acceptance Criterion | Verification Method | Observed Evidence | Status |
| --- | --- | --- | --- |
| Claude loads the canonical startup contract | Import and startup inspection | `CLAUDE.md` is the exact `@AGENTS.md` import; Claude discovered project agents | Pass |
| Both harnesses expose the same three bounded roles | File/schema and installed-client checks | Three aligned definitions per harness; TOML/YAML parsed; Claude listed all three | Pass |
| Adapters remain thin and canonical owners remain authoritative | Duplication and instruction review | Adapters point to the canonical role, quality, startup, and handoff owners | Pass |
| Tool and permission boundaries do not expand parent authority | Threat and configuration review | Review agents narrow to read-only defaults; Verifier inherits parent policy and Claude denies direct edit tools | Pass |
| Package and policy contracts describe an optional removable layer | Link and consistency review | Root/meta package guidance and framework hard reject use the same adapter exception | Pass |
| Pilot has measurable promotion and sunset criteria | Decision and changelog review | Five eligible tasks or 2026-08-09; useful-use definition and immediate failure triggers recorded | Pass |

## Readiness

| Area | Ready? | Evidence Or Required Action |
| --- | --- | --- |
| Outcome and scope | Yes | User accepted the recommended bridge and three-agent pilot |
| Architecture and project context | Yes | Canonical role, startup, package, and improvement owners are identified |
| Data, security, and permissions | Yes | No secrets or external actions; least-privilege adapter boundaries are declared in the threat model |
| Slices and ownership | Yes | One writer owns bridge, adapters, policy, and integration records |
| Verification and rollback | Yes | Checks are declared; additions and policy edits are locally reversible in Git |

Readiness verdict: Ready

## Verification Results

| Required? | Check Or Method | Observed Result | Status | Unblocking Condition If Not Run |
| --- | --- | --- | --- | --- |
| Yes | Vendor schema and installed-client discovery | Taplo parsed 3 TOML files; js-yaml parsed 3 frontmatters; Claude 2.1.206 listed all 3 project agents; Codex 0.144.1 strict doctor passed | Pass | |
| Yes | Markdown links, anchors, budgets, and package inventory | Final local-link and fence checks passed across 49 Markdown files; 11 templates, 24 meta files, and 7 optional integration files passed | Pass | |
| Yes | Current primary-source availability | OpenAI Subagents and both Claude Code pages returned HTTP 200 | Pass | |
| Yes | Permission, delegation, and single-writer threat review | Forbidden-field and exact-boundary scans passed; no workers or overlapping writers used | Pass | |
| Yes | Full diff and consistency review | All 22 task-owned files reviewed; permission, override, and duplication findings are dispositioned below | Pass | |
| Yes | `git diff --check` and staged-diff inspection | Final task-scoped staged diff passed whitespace, scope, secret, and generated-file review | Pass | |

- Criteria or methods amended after implementation began, with reason and impact: None.
- Counterfactual evidence for new regression or behavior tests: The baseline has no
  Claude bridge or vendor agent definitions, and its package contract excludes them.
- Flaky result and disposition: None observed.

## Review Findings

| Severity | File Or Area | Finding | Required Fix | Status |
| --- | --- | --- | --- | --- |
| Medium | Codex Verifier | An explicit workspace-write sandbox default could widen a read-only parent configuration | Remove the override so Verifier inherits parent sandbox and approvals | Resolved |
| Medium | Review-agent restrictions | Parent live runtime overrides can supersede narrower adapter defaults | Preserve behavioral no-write rules and record parent policy as a required residual control | Accepted |
| Low | Adapter instructions | Early drafts repeated parts of canonical role and quality guidance | Compress prompts to boundaries and links to canonical owners | Resolved |

## Consistency

| Canonical Source | Expected | Actual | Required Update |
| --- | --- | --- | --- |
| User request | Implement the recommended changes | Bridge, adapters, policy, and pilot records implemented | None |
| Task brief | Thin optional three-role pilot | Scope and explicit non-goals match | None |
| Decisions and standards | Preserve core ownership and explicitly authorize adapters | Decision 0005 and adapter contract agree | None |
| Tests and docs | Required checks pass and package guidance is executable | All required schema, client, link, package, security, and diff checks pass | None |
| State and assumptions | Active cursor and pilot trigger are discoverable | Cursor closes idle with the 0/5 pilot action and review date | None |

## Batch And Residual Risk

- Large-diff split trigger hit: Yes.
- If kept together, why: The adapter files are unsafe and undiscoverable without their
  startup, package, policy, security, and pilot contracts; this is one integration
  outcome and one local commit.
- Risk not resolved by passing checks: Vendor clients may change their agent schemas,
  and behavioral instructions cannot absolutely prevent a shell-enabled verifier from
  modifying files.

## Completion

- Required checks all passed: Yes
- Status: Done
- Exact incomplete condition, if not Done: None.
- Next action: Create the task-scoped local commit and confirm `HEAD` and status.
