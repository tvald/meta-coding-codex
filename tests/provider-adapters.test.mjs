import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  inspectCapability,
  inspectClaudeQuota,
  inspectQuota,
  normalizeClaudeQuota,
  normalizeCodexQuota,
} from '../lib/provider-adapters.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const observedAt = '2026-08-11T12:00:00.000Z';
class FixedDate extends Date {
  constructor(value = observedAt) {
    super(value);
  }
}

function run(args, environment, timeout = 15_000) {
  return spawnSync(process.execPath, ['bin/meta-framework.mjs', ...args], {
    cwd: sourceRoot,
    env: environment,
    encoding: 'utf8',
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function jsonResponse(value, status = 200) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(bytes.length) : null },
    arrayBuffer: async () => bytes,
  };
}

function fakeProviderRoot(workRoot) {
  const providerBin = join(workRoot, 'provider-bin');
  const hostileBin = join(workRoot, 'client', 'node_modules', '.bin');
  mkdirSync(providerBin, { recursive: true });
  mkdirSync(hostileBin, { recursive: true });
  const codex = join(providerBin, 'codex');
  writeFileSync(codex, `#!${process.execPath}
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const args = process.argv.slice(2);
if (process.env.FAKE_PROVIDER_SENTINEL) fs.writeFileSync(process.env.FAKE_PROVIDER_SENTINEL, 'ran');
if (process.env.npm_config_secret || process.env.NODE_PATH) process.exit(91);
if (process.env.LD_PRELOAD || process.env.LD_LIBRARY_PATH || process.env.DYLD_INSERT_LIBRARIES || process.env.BASH_ENV) process.exit(90);
  if (args[0] === 'features' && args[1] === 'list') {
  if (process.env.FAKE_FEATURE_BACKGROUND === 'true') {
    const helperCode = "const fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.env.FAKE_HELPER_CLEANUP_SENTINEL,'stopped');process.exit(0)});fs.writeFileSync(process.env.FAKE_HELPER_READY_SENTINEL,'ready');setTimeout(()=>fs.writeFileSync(process.env.FAKE_HELPER_ESCAPE_SENTINEL,'escaped'),400);setInterval(()=>{},1000);";
    spawn(process.execPath, ['-e', helperCode], { env: process.env, stdio: 'ignore' });
    const until = Date.now() + 1000;
    while (!fs.existsSync(process.env.FAKE_HELPER_READY_SENTINEL) && Date.now() < until) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (process.env.FAKE_FEATURE_HANG === 'true' || process.env.FAKE_FEATURE_GRANDCHILD === 'true') {
    if (process.env.FAKE_FEATURE_GRANDCHILD === 'true') {
      const helperCode = "const fs=require('node:fs');fs.writeFileSync(process.env.FAKE_HELPER_READY_SENTINEL,'ready');process.on('SIGTERM',()=>{fs.writeFileSync(process.env.FAKE_HELPER_CLEANUP_SENTINEL,'stopped');process.exit(0)});setInterval(()=>{},1000);";
      spawn(process.execPath, ['-e', helperCode], { env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    }
    process.on('SIGTERM', () => {
      if (process.env.FAKE_CLEANUP_SENTINEL) fs.writeFileSync(process.env.FAKE_CLEANUP_SENTINEL, 'stopped');
      process.exit(0);
    });
    setInterval(() => {}, 1000);
    return;
  }
  console.log('multi_agent                          stable             ' +
    (process.env.FAKE_MULTI_AGENT ?? 'true'));
  if (process.env.FAKE_DUPLICATE_FEATURE === 'true') console.log('multi_agent stable true');
  process.exit(0);
}
if (process.env.FAKE_CODEX_MODE === 'exit') {
  process.exit(0);
} else if (process.env.FAKE_CODEX_MODE === 'oversized') {
  process.stdout.write('x'.repeat(1048577));
  setInterval(() => {}, 1000);
} else if (args[0] === 'app-server' && args[1] === '--listen' && args[2] === 'stdio://') {
  const stop = () => {
    if (process.env.FAKE_CLEANUP_SENTINEL) fs.writeFileSync(process.env.FAKE_CLEANUP_SENTINEL, 'stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  if (process.env.FAKE_CODEX_MODE === 'premature-result') console.log(JSON.stringify({ id: 1, result: {
    rateLimitsByLimitId: { codex: { primary: { usedPercent: 0, windowDurationMins: 10080 } } }
  } }));
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('close', stop);
  lines.on('line', (line) => {
    const request = JSON.parse(line);
    if (request.id === 0) {
      if (process.env.FAKE_CODEX_MODE === 'rpc-error') {
        console.log(JSON.stringify({ id: 0, error: { message: 'DO_NOT_LEAK_RPC_SECRET' } }));
      } else {
        console.log(JSON.stringify({ id: 0, result: { userAgent: 'fake' } }));
      }
    }
    if (request.id === 1 && process.env.FAKE_CODEX_MODE !== 'hang') console.log(JSON.stringify({ id: 1, result: {
      rateLimitsByLimitId: {
        codex: { limitId: 'codex', planType: 'DO_NOT_LEAK_PLAN', credits: { balance: '999' },
          primary: { usedPercent: Number(process.env.FAKE_USED_PERCENT ?? 99),
            windowDurationMins: 10080, resetsAt: 1787014564 }, secondary: null }
      },
      rateLimitResetCredits: { availableCount: 999, credits: [{ id: 'DO_NOT_LEAK_CREDIT' }] }
    } }));
  });
} else process.exit(92);
`);
  chmodSync(codex, 0o755);
  const claude = join(providerBin, 'claude');
  writeFileSync(claude, `#!${process.execPath}
if (process.env.npm_config_secret || process.env.NODE_PATH) process.exit(91);
if (process.env.LD_PRELOAD || process.env.LD_LIBRARY_PATH || process.env.DYLD_INSERT_LIBRARIES || process.env.BASH_ENV) process.exit(90);
if (process.argv[2] === 'agents' && process.argv[3] === '--help') {
  console.log('Usage: claude agents [options]');
  console.log('  --json        Print bounded agent state');
  process.exit(0);
}
if (process.argv[2] === 'agents' && process.argv[3] === '--json') {
  console.log(process.env.FAKE_CLAUDE_STATE === 'invalid' ? '{}' : '[]');
  process.exit(0);
}
process.exit(92);
`);
  chmodSync(claude, 0o755);
  const hostileCodex = join(hostileBin, 'codex');
  writeFileSync(hostileCodex, '#!/bin/sh\n: > "$HOSTILE_PROVIDER_SENTINEL"\nexit 93\n');
  chmodSync(hostileCodex, 0o755);
  return { providerBin, hostileBin };
}

test('Codex quota normalization evaluates every bucket without account or credit fields', () => {
  const normalized = normalizeCodexQuota({
    rateLimits: { planType: 'ignored-backward-view' },
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        planType: 'pro',
        credits: { balance: '100' },
        primary: { usedPercent: 94.9, windowDurationMins: 300, resetsAt: 1787014564 },
        secondary: null,
      },
      codex_model: {
        limitId: 'codex_model',
        limitName: 'Model Scope',
        primary: { usedPercent: 98, windowDurationMins: 10_080, resetsAt: null },
        secondary: { usedPercent: 99, windowDurationMins: 43_200, resetsAt: 1787019999 },
      },
    },
    rateLimitResetCredits: { availableCount: 1, credits: [{ id: 'secret-credit' }] },
  }, { clock: FixedDate });
  assert.equal(normalized.disposition, 'suspend');
  assert.equal(normalized.reason, 'cutoff_reached');
  assert.equal(normalized.observedAt, observedAt);
  assert.equal(normalized.windows.length, 3);
  assert.deepEqual(normalized.windows.map(({ group, usedPercent, cutoffPercent }) =>
    ({ group, usedPercent, cutoffPercent })), [
    { group: 'five_hour', usedPercent: 94.9, cutoffPercent: 95 },
    { group: 'monthly', usedPercent: 99, cutoffPercent: 99 },
    { group: 'weekly', usedPercent: 98, cutoffPercent: 98 },
  ]);
  assert.doesNotMatch(JSON.stringify(normalized), /plan|credit|balance|secret|Model Scope|codex_model/iu);
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {} }, { clock: FixedDate }).disposition, 'unavailable');
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {
    codex: { primary: { usedPercent: Number.NaN, windowDurationMins: 300 } },
  } }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {
    codex: { primary: { usedPercent: 1, windowDurationMins: 60 } },
  } }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {
    codex: { primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 'not-a-number' } },
  } }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {
    codex: { primary: null, secondary: null },
  } }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeCodexQuota({ rateLimitsByLimitId: {
    codex: {
      primary: { usedPercent: 1, windowDurationMins: 300 },
      secondary: { usedPercent: 2, windowDurationMins: 300 },
    },
  } }, { clock: FixedDate }).disposition, 'failed');
});

test('Claude quota normalization prefers limits, preserves model windows, and excludes billing shapes', () => {
  const limits = normalizeClaudeQuota({
    limits: [
      { group: 'session', percent: 95, resets_at: '2026-08-12T00:00:00Z' },
      { group: 'weekly', kind: 'model', percent: 97.9, resets_at: null,
        scope: { model: { display_name: 'Fable' } } },
      { group: 'monthly', percent: 98.9, resets_at: null },
    ],
    spend: 999,
    account: { email: 'DO_NOT_LEAK@example.invalid' },
  }, { clock: FixedDate });
  assert.equal(limits.disposition, 'suspend');
  assert.deepEqual(limits.windows.map(({ group, resetsAt }) => ({ group, resetsAt })), [
    { group: 'five_hour', resetsAt: '2026-08-12T00:00:00.000Z' },
    { group: 'monthly', resetsAt: null },
    { group: 'weekly', resetsAt: null },
  ]);
  assert.doesNotMatch(JSON.stringify(limits), /"(?:spend|account|email)"|DO_NOT_LEAK|Fable/iu);

  const flat = normalizeClaudeQuota({
    five_hour: { utilization: 94, resets_at: null },
    seven_day: { utilization: 97, resets_at: null },
    seven_day_fable: { utilization: 97, resets_at: null },
    monthly: { utilization: 98, resets_at: null },
    monthly_spend: { utilization: 100, resets_at: null },
    extra_usage: { utilization: 100, spend: 50 },
  }, { clock: FixedDate });
  assert.equal(flat.disposition, 'proceed');
  assert.equal(flat.windows.length, 4);
  const expandedModel = normalizeClaudeQuota({
    seven_day: { utilization: 1, resets_at: null },
    seven_day_model_name: { utilization: 100, resets_at: null },
  }, { clock: FixedDate });
  assert.equal(expandedModel.disposition, 'suspend');
  assert.equal(expandedModel.windows.length, 2);
  assert.equal(normalizeClaudeQuota({
    monthly_credit: { utilization: 1 },
    monthly_credits: { utilization: 1 },
    monthly_balance: { utilization: 1 },
    monthly_extra_usage: { utilization: 1 },
    seven_day_spend: { utilization: 1 },
    seven_day_credit: { utilization: 1 },
  }, { clock: FixedDate }).disposition, 'unavailable');
  assert.equal(normalizeClaudeQuota({
    seven_day: { utilization: 1 },
    unknown_quota_window: { utilization: 100 },
  }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeClaudeQuota({
    seven_day: { utilization: 1 },
    new_weekly_window: { consumed: 100, reset: null },
  }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeClaudeQuota({ limits: [] }, { clock: FixedDate }).disposition, 'unavailable');
  assert.equal(normalizeClaudeQuota({ limits: 'invalid' }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeClaudeQuota({ limits: [
    { group: 'weekly', percent: 1, resets_at: 'not-a-date' },
  ] }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeClaudeQuota({ limits: [
    { group: 'weekly', percent: 1 },
    { group: 'weekly', percent: 2 },
  ] }, { clock: FixedDate }).disposition, 'failed');
  assert.equal(normalizeClaudeQuota({ limits: Array.from({ length: 65 }, (_, index) => ({
    group: 'weekly', percent: index, scope: { model: { name: `model-${index}` } },
  })) }, { clock: FixedDate }).disposition, 'failed');
});

test('Claude inspection contains credentials and raw provider data inside the adapter', async () => {
  let request;
  const inspected = await inspectClaudeQuota({
    clock: FixedDate,
    credentialsReader: async () => ({
      kind: 'available',
      token: 'DO_NOT_LEAK_ACCESS_TOKEN',
      expiresAt: Date.parse('2026-08-12T00:00:00Z'),
    }),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        limits: [{ group: 'weekly', percent: 20, resets_at: null }],
        access_token: 'DO_NOT_LEAK_RESPONSE_TOKEN',
        spend: 100,
        subscription: 'private',
      });
    },
  });
  assert.equal(inspected.disposition, 'proceed');
  assert.equal(request.url, 'https://api.anthropic.com/api/oauth/usage');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, 'Bearer DO_NOT_LEAK_ACCESS_TOKEN');
  assert.equal(request.options.headers['anthropic-beta'], 'oauth-2025-04-20');
  assert.doesNotMatch(JSON.stringify(inspected), /DO_NOT_LEAK|spend|subscription|access_token/iu);

  const unauthorized = await inspectClaudeQuota({
    clock: FixedDate,
    credentialsReader: async () => ({ kind: 'available', token: 'DO_NOT_LEAK', expiresAt: null }),
    fetchImpl: async () => jsonResponse({ error: 'DO_NOT_LEAK_RESPONSE' }, 401),
  });
  assert.deepEqual(unauthorized, {
    disposition: 'failed', reason: 'inspection_failed', observedAt, windows: [],
  });
});

test('public Codex probes sanitize PATH/environment, bound output, and stop App Server',
  { skip: process.platform === 'win32' }, () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-codex-'));
    try {
      const { providerBin, hostileBin } = fakeProviderRoot(workRoot);
      const cleanup = join(workRoot, 'cleanup');
      const hostile = join(workRoot, 'hostile');
      const environment = {
        ...process.env,
        PATH: `${hostileBin}${delimiter}${providerBin}${delimiter}${process.env.PATH ?? ''}`,
        HOSTILE_PROVIDER_SENTINEL: hostile,
        FAKE_CLEANUP_SENTINEL: cleanup,
        npm_config_secret: 'DO_NOT_INHERIT_NPM_SECRET',
      };
      const quota = run(['quota', '--harness', 'codex'], environment);
      assert.equal(quota.status, 1, quota.stderr);
      const output = JSON.parse(quota.stdout);
      assert.equal(output.disposition, 'suspend');
      assert.equal(output.reason, 'cutoff_reached');
      assert.equal(output.result.windows.length, 1);
      assert.doesNotMatch(quota.stdout, /DO_NOT_LEAK|credit|plan|balance/iu);
      assert.equal(lstatSync(hostile, { throwIfNoEntry: false }), undefined);
      assert.equal(lstatSync(cleanup).isFile(), true);

      const safe = run(['quota', '--harness', 'codex'], {
        ...environment,
        FAKE_USED_PERCENT: '97.9',
      });
      assert.equal(safe.status, 0, safe.stderr);
      assert.equal(JSON.parse(safe.stdout).disposition, 'proceed');
      assert.equal(JSON.parse(safe.stdout).reason, null);
      assert.deepEqual(JSON.parse(safe.stdout).result.windows.map(({ group, usedPercent, cutoffPercent }) =>
        ({ group, usedPercent, cutoffPercent })), [
        { group: 'weekly', usedPercent: 97.9, cutoffPercent: 98 },
      ]);

      const capability = run(['capability', '--name', 'delegation', '--harness', 'codex'], environment);
      assert.equal(capability.status, 0, capability.stderr);
      assert.equal(JSON.parse(capability.stdout).disposition, 'enabled');
      const disabled = run(['capability', '--harness', 'codex', '--name', 'delegation'], {
        ...environment,
        FAKE_MULTI_AGENT: 'false',
      });
      assert.equal(disabled.status, 1, disabled.stderr);
      assert.equal(JSON.parse(disabled.stdout).disposition, 'disabled');
      assert.equal(JSON.parse(disabled.stdout).reason, 'capability_disabled');
      const duplicate = run(['capability', '--harness', 'codex', '--name', 'delegation'], {
        ...environment,
        FAKE_DUPLICATE_FEATURE: 'true',
      });
      assert.equal(duplicate.status, 1, duplicate.stderr);
      assert.equal(JSON.parse(duplicate.stdout).disposition, 'failed');

      const failed = run(['quota', '--harness', 'codex'], {
        ...environment,
        FAKE_CODEX_MODE: 'rpc-error',
        FAKE_CLEANUP_SENTINEL: join(workRoot, 'error-cleanup'),
      });
      assert.equal(failed.status, 1, failed.stderr);
      assert.equal(JSON.parse(failed.stdout).disposition, 'failed');
      assert.doesNotMatch(failed.stdout, /DO_NOT_LEAK_RPC_SECRET/u);

      const premature = run(['quota', '--harness', 'codex'], {
        ...environment,
        FAKE_CODEX_MODE: 'premature-result',
        FAKE_CLEANUP_SENTINEL: join(workRoot, 'premature-cleanup'),
      });
      assert.equal(premature.status, 1, premature.stderr);
      assert.equal(JSON.parse(premature.stdout).disposition, 'failed');

      const oversized = run(['quota', '--harness', 'codex'], {
        ...environment,
        FAKE_CODEX_MODE: 'oversized',
        FAKE_CLEANUP_SENTINEL: join(workRoot, 'oversized-cleanup'),
      });
      assert.equal(oversized.status, 1, oversized.stderr);
      assert.equal(JSON.parse(oversized.stdout).disposition, 'failed');
      assert.ok(Buffer.byteLength(oversized.stdout) < 4_096);

      const exited = run(['quota', '--harness', 'codex'], {
        ...environment,
        FAKE_CODEX_MODE: 'exit',
      });
      assert.equal(exited.status, 1);
      assert.equal(JSON.parse(exited.stdout).disposition, 'failed');
      assert.equal(exited.stderr, '');
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('public Claude capability and unavailable quota remain normalized and rootless',
  { skip: process.platform === 'win32' }, () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-claude-'));
    try {
      const { providerBin } = fakeProviderRoot(workRoot);
      const environment = {
        ...process.env,
        PATH: `${providerBin}${delimiter}${process.env.PATH ?? ''}`,
        CLAUDE_CONFIG_DIR: join(workRoot, 'missing-config'),
        npm_config_secret: 'DO_NOT_INHERIT_NPM_SECRET',
      };
      const capability = run(['capability', '--harness', 'claude', '--name', 'delegation'], environment);
      assert.equal(capability.status, 0, capability.stderr);
      assert.equal(JSON.parse(capability.stdout).disposition, 'enabled');
      const invalidCapability = run(['capability', '--harness', 'claude', '--name', 'delegation'], {
        ...environment,
        FAKE_CLAUDE_STATE: 'invalid',
      });
      assert.equal(invalidCapability.status, 1, invalidCapability.stderr);
      assert.equal(JSON.parse(invalidCapability.stdout).disposition, 'failed');
      const quota = run(['quota', '--harness', 'claude'], environment);
      assert.equal(quota.status, 1, quota.stderr);
      assert.deepEqual(JSON.parse(quota.stdout), {
        schemaVersion: 1,
        probeVersion: '1.0.0',
        package: { name: '@tvald/meta-framework', version: '1.0.0' },
        kind: 'quota',
        harness: 'claude',
        checkedAt: JSON.parse(quota.stdout).checkedAt,
        disposition: 'unavailable',
        reason: 'provider_unavailable',
        result: { windows: [] },
      });
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('probe versions and unsupported requests use stable bounded envelopes', () => {
  for (const command of ['quota', 'capability']) {
    const version = run([command, '--version'], process.env);
    assert.equal(version.status, 0, version.stderr);
    assert.deepEqual(JSON.parse(version.stdout).providerProbe, {
      version: '1.0.0',
      envelopeVersions: [1],
      harnesses: ['claude', 'codex'],
      capabilities: ['delegation'],
    });
  }
  const harness = run(['quota', '--harness', 'unknown'], process.env);
  assert.equal(harness.status, 1, harness.stderr);
  assert.equal(JSON.parse(harness.stdout).disposition, 'unsupported');
  assert.equal(JSON.parse(harness.stdout).reason, 'unsupported_harness');
  const capability = run(['capability', '--harness', 'codex', '--name', 'unknown'], process.env);
  assert.equal(capability.status, 1, capability.stderr);
  assert.equal(JSON.parse(capability.stdout).disposition, 'unsupported');
  assert.equal(JSON.parse(capability.stdout).reason, 'unsupported_capability');
  for (const args of [
    ['quota'],
    ['quota', '--harness', 'codex', '--extra', 'value'],
    ['capability', '--harness', 'codex'],
    ['capability', '--harness', 'codex', '--name', 'bad/value'],
  ]) {
    const invalid = run(args, process.env);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /^meta-framework: invalid (?:quota|capability) command; run --help\n$/u);
  }
});

test('direct capability helpers fail closed when provider executables are absent', async () => {
  const environment = { PATH: '/definitely/not/a/provider/path' };
  assert.equal((await inspectCapability('codex', 'delegation', { environment, clock: FixedDate })).disposition,
    'unavailable');
  assert.equal((await inspectCapability('claude', 'delegation', { environment, clock: FixedDate })).disposition,
    'unavailable');
  assert.equal((await inspectCapability('codex', 'unknown', { environment, clock: FixedDate })).disposition,
    'unsupported');
});

test('provider processes reject client-root executables and dynamic-loader injection',
  { skip: process.platform === 'win32' }, async () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-environment-'));
    try {
      const { providerBin } = fakeProviderRoot(workRoot);
      const base = {
        PATH: providerBin,
        LD_PRELOAD: 'DO_NOT_LOAD',
        LD_LIBRARY_PATH: 'DO_NOT_LOAD',
        DYLD_INSERT_LIBRARIES: 'DO_NOT_LOAD',
        BASH_ENV: 'DO_NOT_LOAD',
      };
      const scrubbed = await inspectCapability('codex', 'delegation', {
        environment: base,
        clock: FixedDate,
      });
      assert.equal(scrubbed.disposition, 'enabled');
      const rejected = await inspectCapability('codex', 'delegation', {
        environment: base,
        clientRoot: workRoot,
        clock: FixedDate,
      });
      assert.equal(rejected.disposition, 'unavailable');

      const clientRoot = join(workRoot, 'client');
      const outsideBin = join(workRoot, 'outside-bin');
      const linkedTarget = join(clientRoot, 'linked-provider');
      const linkedSentinel = join(workRoot, 'linked-provider-ran');
      mkdirSync(clientRoot, { recursive: true });
      mkdirSync(outsideBin);
      writeFileSync(linkedTarget, `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.LINKED_SENTINEL, 'ran');\nconsole.log('multi_agent stable true');\n`);
      chmodSync(linkedTarget, 0o755);
      symlinkSync(linkedTarget, join(outsideBin, 'codex'));
      const linked = await inspectCapability('codex', 'delegation', {
        environment: { PATH: outsideBin, LINKED_SENTINEL: linkedSentinel },
        clientRoot,
        clock: FixedDate,
      });
      assert.equal(linked.disposition, 'unavailable');
      assert.equal(lstatSync(linkedSentinel, { throwIfNoEntry: false }), undefined);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('provider timeouts terminate capability and App Server children before returning',
  { skip: process.platform === 'win32' }, async () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-timeout-'));
    try {
      const { providerBin } = fakeProviderRoot(workRoot);
      const capabilityCleanup = join(workRoot, 'capability-cleanup');
      const grandchildCleanup = join(workRoot, 'grandchild-cleanup');
      const grandchildReady = join(workRoot, 'grandchild-ready');
      const quotaCleanup = join(workRoot, 'quota-cleanup');
      const base = { PATH: providerBin };
      const capability = await inspectCapability('codex', 'delegation', {
        environment: {
          ...base,
          FAKE_FEATURE_HANG: 'true',
          FAKE_CLEANUP_SENTINEL: capabilityCleanup,
        },
        clock: FixedDate,
        timeoutMs: 250,
      });
      assert.equal(capability.disposition, 'failed');
      assert.equal(lstatSync(capabilityCleanup).isFile(), true);
      const grandchild = await inspectCapability('codex', 'delegation', {
        environment: {
          ...base,
          FAKE_FEATURE_GRANDCHILD: 'true',
          FAKE_CLEANUP_SENTINEL: capabilityCleanup,
          FAKE_HELPER_CLEANUP_SENTINEL: grandchildCleanup,
          FAKE_HELPER_READY_SENTINEL: grandchildReady,
        },
        clock: FixedDate,
        timeoutMs: 300,
      });
      assert.equal(grandchild.disposition, 'failed');
      assert.equal(lstatSync(grandchildReady).isFile(), true);
      assert.equal(lstatSync(grandchildCleanup).isFile(), true);
      const quota = await inspectQuota('codex', {
        environment: {
          ...base,
          FAKE_CODEX_MODE: 'hang',
          FAKE_CLEANUP_SENTINEL: quotaCleanup,
        },
        clock: FixedDate,
        timeoutMs: 250,
      });
      assert.equal(quota.disposition, 'failed');
      assert.equal(lstatSync(quotaCleanup).isFile(), true);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('successful provider commands terminate unexpected background descendants',
  { skip: process.platform === 'win32' }, async () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-background-'));
    try {
      const { providerBin } = fakeProviderRoot(workRoot);
      const ready = join(workRoot, 'ready');
      const cleanup = join(workRoot, 'cleanup');
      const escaped = join(workRoot, 'escaped');
      const capability = await inspectCapability('codex', 'delegation', {
        environment: {
          PATH: providerBin,
          FAKE_FEATURE_BACKGROUND: 'true',
          FAKE_HELPER_READY_SENTINEL: ready,
          FAKE_HELPER_CLEANUP_SENTINEL: cleanup,
          FAKE_HELPER_ESCAPE_SENTINEL: escaped,
        },
        clock: FixedDate,
        timeoutMs: 2_000,
      });
      assert.equal(capability.disposition, 'failed');
      assert.equal(lstatSync(ready).isFile(), true);
      assert.equal(lstatSync(cleanup).isFile(), true);
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      assert.equal(lstatSync(escaped, { throwIfNoEntry: false }), undefined);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('known public probes validate the client Git/package boundary before provider execution',
  { skip: process.platform === 'win32' }, () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-provider-root-'));
    try {
      const { providerBin } = fakeProviderRoot(workRoot);
      const unrelated = join(workRoot, 'unrelated');
      const sentinel = join(workRoot, 'provider-ran');
      mkdirSync(unrelated);
      spawnSync('git', ['init', '-q'], { cwd: unrelated });
      const probe = spawnSync(process.execPath, [
        join(sourceRoot, 'bin', 'meta-framework.mjs'), 'capability', '--harness', 'codex', '--name', 'delegation',
      ], {
        cwd: unrelated,
        env: {
          ...process.env,
          PATH: `${providerBin}${delimiter}${process.env.PATH ?? ''}`,
          FAKE_PROVIDER_SENTINEL: sentinel,
        },
        encoding: 'utf8',
      });
      assert.equal(probe.status, 1);
      assert.equal(probe.stdout, '');
      assert.match(probe.stderr, /^meta-framework: CLIENT_METADATA: /u);
      assert.equal(lstatSync(sentinel, { throwIfNoEntry: false }), undefined);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
