# 0005: Pilot Optional Codex And Claude Code Agent Adapters

Status: Accepted

Date: 2026-07-10

Owners:

- Product owner and Root Orchestrator

Supersedes:

- [Decision 0004](0004-package-framework-as-addon.md) only where its package boundary
  excludes a Claude entrypoint bridge and optional vendor-native agent adapters.

Superseded by:

- [Decision 0016](0016-adopt-adapters-and-skip-pilot-disposition.md) promotes the adapters
  from Pilot to Adopted and skips the Pilot disposition repository-wide.
- [Decision 0021](0021-adopt-immutable-npm-framework-delivery.md), where copied
  provider-discovery files and a client `CLAUDE.md` import are replaced by package-owned
  profiles and independent thin bootstraps. Canonical role ownership remains.

## Context

The portable framework defines agent roles, delegation triggers, shared-work safety, and
handoffs in canonical Markdown. Codex and Claude Code now support project-scoped custom
agent definitions, but the framework does not expose its roles through those native
discovery paths. Claude Code also reads `CLAUDE.md` rather than `AGENTS.md` by default,
so the existing package can miss its startup contract in that harness.

A complete role mirror would duplicate policy across the core and two changing vendor
schemas. The current framework also rejects non-Markdown runtime behavior and Decision
0004 packages only meta Markdown plus merged AGENTS guidance. The user accepted the
recommendation to add a narrow, optional adapter pilot instead of a complete mirror.

## Decision

- Keep `AGENTS.md` and `readme/meta/` as the portable, Markdown-only core and the sole
  owners of startup and process semantics.
- Add root `CLAUDE.md` as a one-line import of `AGENTS.md`, preserving one instruction
  owner.
- Add project-scoped Reviewer, Verifier, and Security Reviewer definitions under both
  `.codex/agents/` and `.claude/agents/`.
- Treat those files as optional declarative harness adapters. They may contain only
  discovery metadata, least-privilege capability settings, and concise directions to
  canonical framework owners.
- Do not pin models, configure MCP servers or hooks, enable recursive delegation, set
  bypass permissions, or move integration ownership into an adapter.
- Give Reviewer and Security Reviewer read-only defaults plus explicit no-write
  instructions. Let Verifier inherit the parent's sandbox and approval policy, remove
  direct editing tools where the harness supports it, and require before/after worktree
  inspection and artifact reporting. Parent runtime overrides remain a documented
  residual control because they can supersede narrower adapter defaults.
- Package the Claude bridge and adapter directories only when the destination uses those
  harnesses. Merge them with existing destination files; never overwrite a conflicting
  entrypoint or agent definition.

The pilot runs until five eligible non-trivial tasks exercise independent review,
verification, or security gates, or until 2026-08-09, whichever occurs first. Promote
only if adapters are useful at least twice, follow the handoff and ownership contract,
and cause no unnecessary delegation, permission expansion, or overlapping edits. Revise
or remove them after any trust-boundary violation; remove them at review if they remain
unused, duplicative, or materially drifted.

An eligible task is a non-trivial task whose existing quality gate calls for an
independent Reviewer, QA And Verification Agent, or Security And Risk Agent and whose
harness supports the matching adapter. A use counts as useful only when the adapter is
invoked by name, returns the canonical Result handoff without manual role restatement,
and the parent records that result as evidence for a review, verification outcome, or
resolved finding. Never spawn an agent solely to increase the pilot count.

## Options Considered

| Option | Pros | Cons | Notes |
| --- | --- | --- | --- |
| Keep generic delegation only | No vendor files or policy exception | Repeats role prompts and leaves Claude startup undiscovered | Rejected after user selected implementation |
| Mirror every framework role in both harnesses | Maximum native discoverability | High duplication, drift, and over-delegation risk | Rejected |
| Add a thin three-role optional pilot | Tests native value while preserving canonical ownership | Adds package and schema maintenance | Accepted |
| Generate adapters from Markdown | Could reduce manual drift | Adds executable tooling and runtime/dependency complexity | Rejected |

## Consequences

Positive:

- Claude Code receives the same startup contract without duplicating it.
- High-value independent quality roles become named and capability-bounded.
- The framework can gather real evidence before committing to more adapters.

Negative:

- The add-on now has optional vendor-native files outside its Markdown core.
- Two schemas require periodic validation against installed clients and current docs.
- Verifier shell access cannot be made completely side-effect-free while still running
  realistic project checks.

Neutral or follow-up:

- The core remains fully usable when all adapter files are omitted.
- Host projects decide which harness adapters to install and own any local extensions.

## Confidence

Confidence: Medium

Why:

Current official product documentation establishes the discovery paths and restriction
mechanisms, and the user directly selected the proposed pilot. This repository has not
yet accumulated repeated real-task evidence that the adapters outperform generic
delegation, so promotion depends on the pilot signals.

## Review Trigger

Revisit when:

- Five eligible non-trivial tasks have run, 2026-08-09 arrives, a vendor changes agent
  discovery/schema, an adapter is ignored, or any adapter violates permission,
  ownership, single-writer, or proportional-delegation boundaries.

## Sources

- User evaluation and implementation instruction dated 2026-07-10.
- OpenAI, "Subagents," checked 2026-07-10:
  https://learn.chatgpt.com/docs/agent-configuration/subagents
- Anthropic, "Create custom subagents," checked 2026-07-10:
  https://code.claude.com/docs/en/sub-agents
- Anthropic, "How Claude remembers your project," checked 2026-07-10:
  https://code.claude.com/docs/en/memory
