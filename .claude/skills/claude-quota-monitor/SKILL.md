---
name: claude-quota-monitor
description: Read Claude Code usage telemetry through the authenticated OAuth usage surface and apply the repository capacity guard. Use whenever a Root Orchestrator on Claude Code plans, starts, monitors, suspends, or resumes subagents, or must verify five-hour, weekly, or monthly usage and reset state.
---

# Claude Quota Monitor

Obtain and normalize Claude Code usage telemetry only. Apply suspension, waiting, and
resumption through the canonical
[usage capacity guard](../../../readme/meta/agent-definitions.md#usage-capacity-guard);
do not create a second policy owner here.

Prefer Claude Code's interactive `/usage` display when a human operator can read it
authoritatively. An autonomous Root Orchestrator cannot read that display, so it uses the
read command below.

## Credential Safety

The access token is a bearer credential. Keeping it out of the conversation keeps it out
of shared model memory, where it is far more likely to be exposed or logged.

- Never read, print, `cat`, or echo `.credentials.json`, the access token, the refresh
  token, or the raw usage response into the conversation or any file.
- Never pass the token as a command-line argument, environment assignment, or URL
  parameter. Only the read command below may touch it, and only inside its own process.
- Run the read command as written. It loads the credential file, builds the request, and
  prints **only** normalized window fields. Do not modify it to emit additional data.
- The only values that may leave the process are each window's label, group, optional
  model, `utilization`, `resets_at`, and `is_active`. Never surface `spend`, credit
  balances, dollar amounts, account identifiers, or subscription metadata.

## Read Current Usage

Run this command in one execution step. It reads the credential file directly, calls the
authenticated usage surface with an 8-second timeout, and prints normalized windows as
JSON. On any failure it prints a short reason to standard error and exits non-zero,
without printing credential or response contents.

```bash
node <<'NODE'
(async () => {
  const fail = (reason) => { console.error(`capacity unknown: ${reason}`); process.exit(1); };
  let oauth;
  try {
    const fs = require("node:fs");
    const root = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
    oauth = JSON.parse(fs.readFileSync(`${root}/.credentials.json`, "utf8")).claudeAiOauth ?? {};
  } catch { fail("cannot read credentials"); }
  const token = oauth.accessToken;
  if (!token) fail("no access token");
  if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= Date.now()) fail("access token expired");
  let usage;
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) fail(`usage request failed: ${response.status}`);
    usage = await response.json();
  } catch { fail("usage request error"); }
  const windows = [];
  const push = (label, group, percent, resetsAt, model, isActive) => {
    if (typeof percent !== "number") return;
    windows.push({ window: label, group, model: model ?? null, utilization: percent,
      resets_at: resetsAt ?? null, ...(isActive === undefined ? {} : { is_active: isActive }) });
  };
  if (Array.isArray(usage.limits)) {
    for (const l of usage.limits) {
      const group = l.group === "session" ? "five_hour"
        : l.group === "weekly" ? "weekly"
        : l.group === "monthly" ? "monthly" : (l.group ?? "other");
      push(l.kind ?? group, group, l.percent, l.resets_at, l.scope?.model?.display_name, l.is_active);
    }
  } else {
    const flat = (k, label, group, model) => {
      const w = usage[k];
      if (w && typeof w.utilization === "number") push(label, group, w.utilization, w.resets_at, model);
    };
    flat("five_hour", "five_hour", "five_hour");
    flat("seven_day", "weekly", "weekly");
    for (const [k, w] of Object.entries(usage)) {
      if (/^seven_day_[a-z0-9]+$/i.test(k)) flat(k, k, "weekly", k.replace(/^seven_day_/, ""));
      if (/^(?:month|monthly|2[89]_day|3[01]_day)(?:_[a-z0-9]+)*$/i.test(k)
          && !/_(?:billing|cost|spend|to_date)(?:_|$)/i.test(k)) flat(k, k, "monthly");
    }
  }
  if (!windows.length) fail("no usage windows advertised");
  console.log(JSON.stringify({ read_at: new Date().toISOString(), windows }, null, 2));
})();
NODE
```

## Interpret Telemetry

The command prefers the authoritative `limits[]` array and falls back to the flat
`five_hour`, `seven_day`, model-specific `seven_day_<model>`, and monthly-named keys only
when `limits[]` is absent.

- Map `group: "session"` to the five-hour window, `group: "weekly"` to the weekly window,
  and `group: "monthly"` to the monthly window. A `scope.model` entry is a model-specific
  weekly window; treat its `utilization` as binding for that model, not decorative.
- Read `utilization` as consumed capacity and `resets_at` as an ISO 8601 instant. A `null`
  `resets_at` is an unknown reset time for that window, not an unknown percentage.
- A window that the surface does not advertise is not applicable to that reading. An empty
  `windows` list, a non-zero exit, `capacity unknown` on standard error, an expired token,
  or an HTTP error means capacity is unknown.
- Do not attempt to refresh the token. An expired or rejected token is unknown capacity;
  the guard pauses until a later reading succeeds.

Never treat `spend`, `extra_usage` credits, or dollar figures as capacity windows. They
are billing data, not rate-limit windows, and must not leave the read process.

## Monitor And Hand Off

- Run the read before every child spawn or resume, after each child result, and at the
  cadence the capacity guard requires. A prior reading does not prove current capacity.
- Return only the `read_at` time and each applicable window's label, group, optional
  model, `utilization`, and `resets_at` to the guard. Do not persist the raw response,
  credential fields, subscription metadata, or billing data.
- Apply every applicable window's cutoff independently through the capacity guard. When a
  window reaches its cutoff, checkpoint and suspend as the guard directs.
- After an interruption or a failed reading, take a fresh full read instead of trusting
  earlier output. A real Claude Code limit error is a 100% reading and pauses immediately.
