---
name: claude-quota-monitor
description: Invoke the package-owned Claude quota probe and apply the canonical repository capacity guard.
---

# Claude Quota Monitor

Use the immutable package command as the sole Claude Code telemetry adapter:

```sh
npm run --ignore-scripts --silent meta -- quota --harness claude
```

The command owns credential containment, the single bounded HTTPS usage read,
normalization, redaction, and failure handling. Never read or print the credential file,
access or refresh token, raw response, caught provider error, account data, billing data,
or spend fields. Do not recreate the credential reader in instructions or shell snippets.

Only exit status 0 with `disposition: "proceed"` establishes current safe capacity.
`suspend`, `unavailable`, `unsupported`, `failed`, malformed output, or any nonzero exit
all prohibit spawn or resume. Apply thresholds, cadence, checkpointing, waiting, and
resumption only through the canonical
[usage capacity guard](../../../readme/meta/agent-definitions.md#usage-capacity-guard).

For native delegation availability, use the separate bounded probe:

```sh
npm run --ignore-scripts --silent meta -- capability --harness claude --name delegation
```

An enabled provider surface does not grant project authority, prove safe quota, expand
permissions, or establish that the current parent exposed a usable delegation tool.
