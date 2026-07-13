---
name: codex-quota-monitor
description: Read Codex ChatGPT quota telemetry through local App Server and apply the repository capacity guard. Use whenever a Root Orchestrator on Codex plans, starts, monitors, suspends, or resumes subagents, or must verify five-hour or weekly usage and reset state.
---

# Codex Quota Monitor

Obtain and normalize Codex quota telemetry only. Apply suspension, waiting, and
resumption through the canonical
[usage capacity guard](../../../readme/meta/agent-definitions.md#usage-capacity-guard);
do not create a second policy owner here.

## Open One App Server Connection

1. Confirm `codex app-server --help` exposes the local App Server. Treat an unavailable
   command as unknown capacity and start or resume no child.
2. Start `codex app-server --listen stdio://` in one long-running execution session.
   Retain its session handle and reuse it for the root task; do not start one process per
   reading or enable a daemon.
3. Send this newline-delimited initialization request without a `jsonrpc` field:

   ```json
   {"method":"initialize","id":0,"params":{"clientInfo":{"name":"framework_quota_monitor","title":"Framework Quota Monitor","version":"1.0.0"}}}
   ```

4. Wait for the successful response with `"id":0`, then send:

   ```json
   {"method":"initialized","params":{}}
   {"method":"account/rateLimits/read","id":1}
   ```

Use a new numeric request ID for every later read. Ignore non-JSON diagnostics and JSON
messages unrelated to the matching request or `account/rateLimits/updated`.

## Interpret Telemetry

Prefer `result.rateLimitsByLimitId` when it is present; otherwise use
`result.rateLimits`. Inspect every returned bucket's non-null `primary` and `secondary`
windows so a generic or model-specific limit can stop delegated work.

- Treat `windowDurationMins: 300` as the five-hour window and `10080` as the weekly
  window.
- Read `usedPercent` as consumed capacity and `resetsAt` as a Unix timestamp in seconds.
- Treat a successful response that omits one of those durations, or returns that window
  as `null`, as not advertised and therefore not applicable to that reading.
- Treat an RPC/authentication error, process exit, invalid JSON, missing result, or an
  applicable window without a finite `usedPercent` as unknown capacity.
- Treat a missing or invalid `resetsAt` as an unknown reset time, not an unknown current
  percentage; use the guard's polling fallback if that window reaches the cutoff.

Never use `account/usage/read` for the cutoff. It reports activity summaries rather than
the rate-limit windows. Never read credential files, tokens, keychains, or private HTTP
endpoints, and never call account mutation methods or consume reset credits.

## Monitor And Hand Off

- Obtain a full `account/rateLimits/read` result before every child spawn or resume and
  at the cadence required by the capacity guard. A cached notification does not prove
  capacity is currently safe.
- Merge `account/rateLimits/updated` notifications into the current view. If a
  notification shows any applicable window at or above the cutoff, apply the guard
  immediately; still use a full read before resuming.
- Return only the reading time and each applicable window's bucket ID, duration,
  `usedPercent`, and `resetsAt` to the guard. Do not persist the full response, plan
  metadata, credit records, account identifiers, or execution-session handle.
- At task completion, or after all child work becomes obsolete, stop the task-scoped App
  Server process. After interruption or a lost handle, start a new connection and obtain
  a fresh full reading instead of trusting prior process state.
