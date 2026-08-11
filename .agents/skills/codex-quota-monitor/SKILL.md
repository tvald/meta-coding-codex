---
name: codex-quota-monitor
description: Invoke the package-owned Codex quota probe and apply the canonical repository capacity guard.
---

# Codex Quota Monitor

Use the immutable package command as the sole Codex telemetry adapter:

```sh
npm run --silent meta -- quota --harness codex
```

The command owns App Server discovery, initialization, full rate-limit reading,
normalization, output bounds, and process cleanup. Do not reproduce those provider
mechanics, read credentials, invoke account mutations, consume reset credits, or use
activity summaries as quota evidence.

Only exit status 0 with `disposition: "proceed"` establishes current safe capacity.
`suspend`, `unavailable`, `unsupported`, `failed`, malformed output, or any nonzero exit
all prohibit spawn or resume. Apply thresholds, cadence, checkpointing, waiting, and
resumption only through the canonical
[usage capacity guard](../../../readme/meta/agent-definitions.md#usage-capacity-guard).

For native delegation availability, use the separate bounded probe:

```sh
npm run --silent meta -- capability --harness codex --name delegation
```

An enabled provider surface does not grant project authority, prove safe quota, expand
permissions, or establish that the current parent exposed a usable delegation tool.
