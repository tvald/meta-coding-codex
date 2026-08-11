import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path, { delimiter } from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  CAPACITY_CUTOFFS,
  PROVIDER_CAPABILITIES,
  PROVIDER_HARNESSES,
} from './provider-contract.mjs';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_PROCESS_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_CREDENTIAL_BYTES = 1_048_576;
const MAX_PROCESS_LINE_BYTES = 65_536;
const MAX_PROCESS_MESSAGES = 256;
const MAX_WINDOWS = 64;
const PROCESS_TIMEOUT_MS = 8_000;
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const MODULE_PATH = fileURLToPath(import.meta.url);

function inspectionTimeout(value) {
  return Number.isInteger(value) && value >= 1 && value <= PROCESS_TIMEOUT_MS ? value : PROCESS_TIMEOUT_MS;
}

const REASONS = Object.freeze({
  capabilityDisabled: 'capability_disabled',
  capabilityUnsupported: 'unsupported_capability',
  cutoffReached: 'cutoff_reached',
  harnessUnsupported: 'unsupported_harness',
  inspectionFailed: 'inspection_failed',
  noWindows: 'no_windows',
  platformUnsupported: 'unsupported_platform',
  providerUnavailable: 'provider_unavailable',
});

function isoNow(clock = Date) {
  const value = new clock().toISOString();
  return value;
}

function result(disposition, reason, observedAt, windows = []) {
  return Object.freeze({ disposition, reason, observedAt, windows: Object.freeze(windows) });
}

function failure(reason, clock) {
  return result('failed', reason, isoNow(clock));
}

function unsupported(reason, clock) {
  return result('unsupported', reason, isoNow(clock));
}

function unavailable(reason, clock) {
  return result('unavailable', reason, isoNow(clock));
}

function disabled(reason, clock) {
  return result('disabled', reason, isoNow(clock));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function safeScope(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 &&
    /^[A-Za-z0-9][A-Za-z0-9._ -]*$/u.test(value) ? value : null;
}

function normalizedReset(value, kind) {
  if (value === null || value === undefined) return { valid: true, value: null };
  const milliseconds = kind === 'unix-seconds' && Number.isFinite(value) ? value * 1_000 :
    kind === 'iso' && typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 8_640_000_000_000_000) {
    return { valid: false, value: null };
  }
  try {
    return { valid: true, value: new Date(milliseconds).toISOString() };
  } catch {
    return { valid: false, value: null };
  }
}

function capacityGroup(durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return null;
  if (durationMinutes === 300) return 'five_hour';
  if (durationMinutes === 10_080) return 'weekly';
  if ([40_320, 41_760, 43_200, 44_640].includes(durationMinutes)) return 'monthly';
  return null;
}

function normalizedWindow({ id, group, scope, durationMinutes, usedPercent, resetsAt }) {
  if (!Object.hasOwn(CAPACITY_CUTOFFS, group) ||
      typeof usedPercent !== 'number' || !Number.isFinite(usedPercent) ||
      usedPercent < 0 || usedPercent > 100) return null;
  const cutoffPercent = CAPACITY_CUTOFFS[group];
  return Object.freeze({
    sortKey: id,
    group,
    scope: safeScope(scope),
    durationMinutes,
    usedPercent,
    cutoffPercent,
    resetsAt,
    atOrAboveCutoff: usedPercent >= cutoffPercent,
  });
}

function finalizeWindows(windows, clock) {
  if (windows.length === 0) return unavailable(REASONS.noWindows, clock);
  if (windows.length > MAX_WINDOWS) return failure(REASONS.inspectionFailed, clock);
  const keys = new Set();
  for (const window of windows) {
    const key = `${window.group}\0${window.scope ?? ''}\0${window.durationMinutes ?? ''}`;
    if (keys.has(key)) return failure(REASONS.inspectionFailed, clock);
    keys.add(key);
  }
  windows.sort((left, right) => `${left.group}\0${left.scope ?? ''}\0${left.sortKey}`
    .localeCompare(`${right.group}\0${right.scope ?? ''}\0${right.sortKey}`, 'en'));
  const counts = new Map();
  const publicWindows = windows.map(({
    sortKey: _sortKey,
    scope: _scope,
    durationMinutes: _durationMinutes,
    atOrAboveCutoff: _atOrAboveCutoff,
    ...window
  }) => {
    const count = (counts.get(window.group) ?? 0) + 1;
    counts.set(window.group, count);
    return Object.freeze({ id: `${window.group}.${count}`, ...window });
  });
  const limiting = publicWindows.some(({ usedPercent, cutoffPercent }) => usedPercent >= cutoffPercent);
  return result(limiting ? 'suspend' : 'proceed', limiting ? REASONS.cutoffReached : null,
    isoNow(clock), publicWindows);
}

export function normalizeCodexQuota(payload, { clock = Date } = {}) {
  try {
    if (!isPlainObject(payload)) return failure(REASONS.inspectionFailed, clock);
    const multi = payload.rateLimitsByLimitId;
    let buckets;
    if (multi !== undefined) {
      if (!isPlainObject(multi)) return failure(REASONS.inspectionFailed, clock);
      buckets = Object.entries(multi).sort(([left], [right]) => left.localeCompare(right, 'en'));
    } else if (isPlainObject(payload.rateLimits)) {
      buckets = [['rateLimits', payload.rateLimits]];
    } else {
      return failure(REASONS.inspectionFailed, clock);
    }
    const windows = [];
    for (const [bucketKey, bucket] of buckets) {
      if (!isPlainObject(bucket)) return failure(REASONS.inspectionFailed, clock);
      const scope = safeScope(bucket.limitName) ?? safeScope(bucket.limitId) ?? safeScope(bucketKey);
      let bucketWindows = 0;
      for (const slot of ['primary', 'secondary']) {
        const window = bucket[slot];
        if (window === null || window === undefined) continue;
        if (!isPlainObject(window)) return failure(REASONS.inspectionFailed, clock);
        const durationMinutes = window.windowDurationMins;
        const group = capacityGroup(durationMinutes);
        if (group === null) return failure(REASONS.inspectionFailed, clock);
        const reset = normalizedReset(window.resetsAt, 'unix-seconds');
        if (!reset.valid) return failure(REASONS.inspectionFailed, clock);
        const normalized = normalizedWindow({
          id: `codex:${group}:${windows.length + 1}`,
          group,
          scope,
          durationMinutes,
          usedPercent: window.usedPercent,
          resetsAt: reset.value,
        });
        if (normalized === null) return failure(REASONS.inspectionFailed, clock);
        windows.push(normalized);
        bucketWindows += 1;
      }
      if (bucketWindows === 0) return failure(REASONS.inspectionFailed, clock);
    }
    return finalizeWindows(windows, clock);
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
}

function claudeGroup(value) {
  if (value === 'session') return 'five_hour';
  if (value === 'weekly') return 'weekly';
  if (value === 'monthly') return 'monthly';
  return null;
}

function isFlatIgnoredMetadata(key) {
  if (['account', 'balance', 'billing', 'credits', 'extra_usage', 'plan', 'plan_type',
    'spend', 'subscription'].includes(key)) return true;
  return /^(?:month|monthly|2[89]_day|3[01]_day|seven_day)_(?:amount|balance|billing|cost|credit|credits|currency|dollar|dollars|extra_usage|overage|purchase|spend|to_date|usd)(?:_[a-z0-9]+)*$/iu
    .test(key);
}

export function normalizeClaudeQuota(payload, { clock = Date } = {}) {
  try {
    if (!isPlainObject(payload)) return failure(REASONS.inspectionFailed, clock);
    const windows = [];
    if (Object.hasOwn(payload, 'limits')) {
      if (!Array.isArray(payload.limits)) return failure(REASONS.inspectionFailed, clock);
      for (const item of payload.limits) {
        if (!isPlainObject(item)) return failure(REASONS.inspectionFailed, clock);
        const group = claudeGroup(item.group);
        if (group === null) return failure(REASONS.inspectionFailed, clock);
        const scope = safeScope(item.scope?.model?.display_name) ?? safeScope(item.scope?.model?.name);
        const reset = normalizedReset(item.resets_at, 'iso');
        if (!reset.valid) return failure(REASONS.inspectionFailed, clock);
        const normalized = normalizedWindow({
          id: `claude:${group}:${windows.length + 1}`,
          group,
          scope,
          durationMinutes: null,
          usedPercent: item.percent,
          resetsAt: reset.value,
        });
        if (normalized === null) return failure(REASONS.inspectionFailed, clock);
        windows.push(normalized);
      }
    } else {
      const addFlat = (key, group, scope = null) => {
        const window = payload[key];
        if (window === undefined || window === null) return true;
        if (!isPlainObject(window)) return false;
        const reset = normalizedReset(window.resets_at, 'iso');
        if (!reset.valid) return false;
        const normalized = normalizedWindow({
          id: `claude:${group}:${windows.length + 1}`,
          group,
          scope,
          durationMinutes: null,
          usedPercent: window.utilization,
          resetsAt: reset.value,
        });
        if (normalized === null) return false;
        windows.push(normalized);
        return true;
      };
      if (!addFlat('five_hour', 'five_hour') || !addFlat('seven_day', 'weekly')) {
        return failure(REASONS.inspectionFailed, clock);
      }
      for (const key of Object.keys(payload).sort()) {
        if (['five_hour', 'seven_day'].includes(key)) continue;
        if (isFlatIgnoredMetadata(key)) continue;
        if (/^seven_day_[a-z0-9]+(?:_[a-z0-9]+)*$/iu.test(key)) {
          if (!addFlat(key, 'weekly', key.replace(/^seven_day_/iu, ''))) {
            return failure(REASONS.inspectionFailed, clock);
          }
          continue;
        }
        if (/^(?:month|monthly|2[89]_day|3[01]_day)(?:_[a-z0-9]+)*$/iu.test(key)) {
          if (!addFlat(key, 'monthly')) return failure(REASONS.inspectionFailed, clock);
          continue;
        }
        return failure(REASONS.inspectionFailed, clock);
      }
    }
    return finalizeWindows(windows, clock);
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
}

function inside(root, target) {
  if (typeof root !== 'string') return false;
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function providerEnvironment(environment = process.env, clientRoot = null) {
  const sanitized = {};
  for (const [name, value] of Object.entries(environment)) {
    if (typeof value !== 'string' || /^GIT_/u.test(name) || /^npm_/iu.test(name) ||
        /^NODE_/u.test(name) || /^DYLD_/u.test(name) || /^LD_/u.test(name) ||
        ['BASH_ENV', 'ENV'].includes(name)) continue;
    sanitized[name] = value;
  }
  sanitized.PATH = (environment.PATH ?? '').split(delimiter)
    .filter((entry) => entry !== '' && !entry.split(/[\\/]/u)
      .some((part, index, parts) => part === '.bin' && parts[index - 1] === 'node_modules'))
    .filter((entry) => {
      try {
        return !inside(clientRoot, fs.realpathSync(entry));
      } catch {
        return false;
      }
    })
    .join(delimiter);
  return sanitized;
}

function providerExecutable(name, environment, clientRoot) {
  const search = providerEnvironment(environment, clientRoot).PATH;
  for (const directory of search.split(delimiter)) {
    if (directory === '') continue;
    const candidate = path.resolve(directory, name);
    let target;
    try {
      target = fs.realpathSync(candidate);
      const info = fs.statSync(target);
      if (info.isFile() && (info.mode & 0o111) !== 0 && !inside(clientRoot, target)) return target;
    } catch {
      // Continue to the next bounded PATH entry.
    }
  }
  return null;
}

function decodeProcessBytes(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return null;
  try {
    return UTF8.decode(bytes);
  } catch {
    return null;
  }
}

function stopProcessGroup(child, signal) {
  if (!Number.isInteger(child?.pid) || child.pid <= 0) return false;
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    try {
      return child.kill(signal);
    } catch {
      return false;
    }
  }
}

function processGroupExists(child) {
  if (!Number.isInteger(child?.pid) || child.pid <= 0) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcessGroup(child) {
  const hadGroup = processGroupExists(child);
  stopProcessGroup(child, 'SIGTERM');
  const started = Date.now();
  let escalated = false;
  while (processGroupExists(child) && Date.now() - started < 2_000) {
    if (!escalated && Date.now() - started >= 1_000) {
      stopProcessGroup(child, 'SIGKILL');
      escalated = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (processGroupExists(child)) stopProcessGroup(child, 'SIGKILL');
  return hadGroup;
}

async function runBoundedCommand(executable, args, environment, clientRoot, timeoutMs = PROCESS_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let finished = false;
    let cleaning = false;
    let child;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const cleanAndFinish = (value, failOnRemainder = false) => {
      if (cleaning || finished) return;
      cleaning = true;
      clearTimeout(timer);
      void terminateProcessGroup(child).then((hadGroup) => {
        finish(hadGroup && failOnRemainder ? { ok: false, kind: 'failed' } : value);
      }, () => finish({ ok: false, kind: 'failed' }));
    };
    const timer = setTimeout(() => {
      cleanAndFinish({ ok: false, kind: 'failed' });
    }, inspectionTimeout(timeoutMs));
    try {
      child = spawn(executable, args, {
        env: providerEnvironment(environment, clientRoot),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      finish({ ok: false, kind: 'unavailable' });
      return;
    }
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > MAX_PROCESS_BYTES) {
        cleanAndFinish({ ok: false, kind: 'failed' });
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_PROCESS_BYTES) cleanAndFinish({ ok: false, kind: 'failed' });
    });
    child.on('error', () => {
      if (Number.isInteger(child.pid)) cleanAndFinish({ ok: false, kind: 'unavailable' });
      else finish({ ok: false, kind: 'unavailable' });
    });
    child.on('close', (code, signal) => {
      if (cleaning) return;
      if (stdout.length > MAX_PROCESS_BYTES || stderrBytes > MAX_PROCESS_BYTES || signal) {
        cleanAndFinish({ ok: false, kind: 'failed' }, true);
        return;
      }
      const text = decodeProcessBytes(stdout);
      cleanAndFinish(code === 0 && text !== null ? { ok: true, text } : { ok: false, kind: 'failed' }, true);
    });
  });
}

async function codexQuota({
  environment = process.env,
  clock = Date,
  clientRoot = null,
  timeoutMs = PROCESS_TIMEOUT_MS,
} = {}) {
  const executable = providerExecutable('codex', environment, clientRoot);
  if (executable === null) return unavailable(REASONS.providerUnavailable, clock);
  return new Promise((resolve) => {
    let child;
    let bytes = 0;
    let buffer = '';
    let initialized = false;
    let messages = 0;
    let pending = null;
    let resolved = false;
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const finish = (value) => {
      if (pending !== null || resolved) return;
      pending = value;
      clearTimeout(timeout);
      try { child.stdin.end(); } catch {}
      void terminateProcessGroup(child).then(() => complete(value), () => complete(value));
    };
    const complete = (value) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(failure(REASONS.inspectionFailed, clock)), inspectionTimeout(timeoutMs));
    try {
      child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
        env: providerEnvironment(environment, clientRoot),
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      complete(unavailable(REASONS.providerUnavailable, clock));
      return;
    }
    const handleLine = (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        finish(failure(REASONS.inspectionFailed, clock));
        return;
      }
      if (!isPlainObject(message)) {
        finish(failure(REASONS.inspectionFailed, clock));
        return;
      }
      if (message.id === 0 && !initialized) {
        if (!isPlainObject(message.result) || message.error !== undefined) {
          finish(failure(REASONS.inspectionFailed, clock));
          return;
        }
        initialized = true;
        try {
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ method: 'account/rateLimits/read', id: 1 })}\n`);
        } catch {
          finish(failure(REASONS.inspectionFailed, clock));
        }
      } else if (message.id === 1) {
        if (!initialized || message.error !== undefined || !isPlainObject(message.result)) {
          finish(failure(REASONS.inspectionFailed, clock));
          return;
        }
        finish(normalizeCodexQuota(message.result, { clock }));
      }
    };
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_PROCESS_BYTES) {
        finish(failure(REASONS.inspectionFailed, clock));
        return;
      }
      let text;
      try {
        text = decoder.decode(chunk, { stream: true });
      } catch {
        finish(failure(REASONS.inspectionFailed, clock));
        return;
      }
      buffer += text;
      if (Buffer.byteLength(buffer) > MAX_PROCESS_LINE_BYTES) {
        finish(failure(REASONS.inspectionFailed, clock));
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        messages += 1;
        if (Buffer.byteLength(line) > MAX_PROCESS_LINE_BYTES || messages > MAX_PROCESS_MESSAGES) {
          finish(failure(REASONS.inspectionFailed, clock));
          return;
        }
        handleLine(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_PROCESS_BYTES) finish(failure(REASONS.inspectionFailed, clock));
    });
    child.stdin.on('error', () => {
      if (pending === null) finish(failure(REASONS.inspectionFailed, clock));
    });
    child.on('error', () => {
      if (Number.isInteger(child.pid)) finish(unavailable(REASONS.providerUnavailable, clock));
      else complete(unavailable(REASONS.providerUnavailable, clock));
    });
    child.on('close', () => finish(pending ?? failure(REASONS.inspectionFailed, clock)));
    try {
      child.stdin.write(`${JSON.stringify({
        method: 'initialize',
        id: 0,
        params: {
          clientInfo: {
            name: 'meta_framework',
            title: 'Meta Framework',
            version: '1.0.0',
          },
        },
      })}\n`);
    } catch {
      finish(failure(REASONS.inspectionFailed, clock));
    }
  });
}

function ordinaryCredentialFile(environment) {
  const configured = environment.CLAUDE_CONFIG_DIR;
  const configRoot = configured === undefined ? path.join(homedir(), '.claude') : configured;
  if (typeof configRoot !== 'string' || configRoot.length < 1 || configRoot.length > 4_096) {
    return { kind: 'invalid' };
  }
  const credentialPath = path.resolve(configRoot, '.credentials.json');
  let info;
  try {
    info = fs.lstatSync(credentialPath);
  } catch (error) {
    return { kind: error?.code === 'ENOENT' ? 'unavailable' : 'invalid' };
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      info.size < 2 || info.size > MAX_CREDENTIAL_BYTES) return { kind: 'invalid' };
  let descriptor;
  try {
    descriptor = fs.openSync(credentialPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== info.dev ||
        opened.ino !== info.ino || opened.size !== info.size) return { kind: 'invalid' };
    const bytes = fs.readFileSync(descriptor);
    const finalInfo = fs.lstatSync(credentialPath);
    if (bytes.length !== opened.size || finalInfo.isSymbolicLink() || finalInfo.dev !== opened.dev ||
        finalInfo.ino !== opened.ino || finalInfo.size !== opened.size ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      return { kind: 'invalid' };
    }
    const value = JSON.parse(UTF8.decode(bytes));
    const oauth = value?.claudeAiOauth;
    if (!isPlainObject(oauth) || typeof oauth.accessToken !== 'string' ||
        oauth.accessToken.length < 1 || oauth.accessToken.length > 16_384 ||
        /[\r\n\u0000]/u.test(oauth.accessToken)) return { kind: 'invalid' };
    if (oauth.expiresAt !== undefined &&
        (typeof oauth.expiresAt !== 'number' || !Number.isFinite(oauth.expiresAt))) return { kind: 'invalid' };
    return { kind: 'available', token: oauth.accessToken, expiresAt: oauth.expiresAt ?? null };
  } catch {
    return { kind: 'invalid' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

async function boundedResponseJson(response) {
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    throw new Error('response bound');
  }
  const chunks = [];
  let size = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('response bound');
      }
      chunks.push(Buffer.from(value));
    }
  } else {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) throw new Error('response bound');
    chunks.push(bytes);
    size = bytes.length;
  }
  const bytes = Buffer.concat(chunks, size);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error('response encoding');
  }
  return JSON.parse(UTF8.decode(bytes));
}

export async function inspectClaudeQuota({
  environment = process.env,
  clock = Date,
  credentialsReader = ordinaryCredentialFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  let credential;
  try {
    credential = await credentialsReader(environment);
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
  if (credential?.kind === 'unavailable') return unavailable(REASONS.providerUnavailable, clock);
  if (credential?.kind !== 'available') return failure(REASONS.inspectionFailed, clock);
  if (credential.expiresAt !== null && credential.expiresAt <= new clock().getTime()) {
    return failure(REASONS.inspectionFailed, clock);
  }
  let response;
  try {
    response = await fetchImpl(CLAUDE_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credential.token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
    });
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
  if (response?.status === 401 || response?.status === 403) {
    return failure(REASONS.inspectionFailed, clock);
  }
  if (!response?.ok) return failure(REASONS.inspectionFailed, clock);
  try {
    return normalizeClaudeQuota(await boundedResponseJson(response), { clock });
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
}

function validatedChildResult(value) {
  if (!isPlainObject(value) ||
      !['proceed', 'suspend', 'unavailable', 'failed'].includes(value.disposition) ||
      !(value.reason === null || Object.values(REASONS).includes(value.reason)) ||
      typeof value.observedAt !== 'string' || new Date(value.observedAt).toISOString() !== value.observedAt ||
      !Array.isArray(value.windows) || value.windows.length > MAX_WINDOWS) return null;
  const dispositionReasons = {
    proceed: [null],
    suspend: [REASONS.cutoffReached],
    unavailable: [REASONS.providerUnavailable, REASONS.noWindows],
    failed: [REASONS.inspectionFailed],
  };
  if (!dispositionReasons[value.disposition].includes(value.reason) ||
      (['proceed', 'suspend'].includes(value.disposition) ? value.windows.length === 0 : value.windows.length !== 0)) {
    return null;
  }
  const counts = new Map();
  let previousSortKey = null;
  let limiting = false;
  for (const window of value.windows) {
    if (!isPlainObject(window) || !/^\w+(?:_\w+)*\.[1-9]\d*$/u.test(window.id) ||
        !Object.hasOwn(CAPACITY_CUTOFFS, window.group) || window.cutoffPercent !== CAPACITY_CUTOFFS[window.group] ||
        typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent) ||
        window.usedPercent < 0 || window.usedPercent > 100 ||
        !(window.resetsAt === null || (typeof window.resetsAt === 'string' &&
          new Date(window.resetsAt).toISOString() === window.resetsAt)) ||
        Object.keys(window).sort().join(',') !==
          ['cutoffPercent', 'group', 'id', 'resetsAt', 'usedPercent'].sort().join(',')) return null;
    const count = (counts.get(window.group) ?? 0) + 1;
    counts.set(window.group, count);
    if (window.id !== `${window.group}.${count}`) return null;
    const sortKey = `${window.group}\0${window.id}`;
    if (previousSortKey !== null && previousSortKey.localeCompare(sortKey, 'en') > 0) return null;
    previousSortKey = sortKey;
    limiting ||= window.usedPercent >= window.cutoffPercent;
  }
  if ((value.disposition === 'suspend') !== limiting) return null;
  return Object.freeze({
    disposition: value.disposition,
    reason: value.reason,
    observedAt: value.observedAt,
    windows: Object.freeze(value.windows.map((window) => Object.freeze({ ...window }))),
  });
}

async function claudeQuotaProcess({
  environment = process.env,
  clock = Date,
  clientRoot = null,
  timeoutMs = PROCESS_TIMEOUT_MS,
} = {}) {
  const inspected = await runBoundedCommand(process.execPath,
    [MODULE_PATH, '--claude-quota-child'], environment, clientRoot, timeoutMs);
  if (!inspected.ok) return failure(REASONS.inspectionFailed, clock);
  try {
    const lines = inspected.text.split(/\r?\n/u).filter((line) => line !== '');
    if (lines.length !== 1 || Buffer.byteLength(lines[0]) > 16_384) {
      return failure(REASONS.inspectionFailed, clock);
    }
    return validatedChildResult(JSON.parse(lines[0])) ?? failure(REASONS.inspectionFailed, clock);
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
}

async function delegationCapability(harness, {
  environment = process.env,
  clock = Date,
  clientRoot = null,
  timeoutMs = PROCESS_TIMEOUT_MS,
} = {}) {
  const executable = providerExecutable(harness, environment, clientRoot);
  if (executable === null) return unavailable(REASONS.providerUnavailable, clock);
  if (harness === 'codex') {
    const inspected = await runBoundedCommand(executable, ['features', 'list'], environment, clientRoot, timeoutMs);
    if (!inspected.ok) {
      return inspected.kind === 'unavailable' ? unavailable(REASONS.providerUnavailable, clock) :
        failure(REASONS.inspectionFailed, clock);
    }
    const rows = inspected.text.split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
      .filter((fields) => fields[0] === 'multi_agent');
    if (rows.length !== 1 || rows[0].length !== 3) return failure(REASONS.inspectionFailed, clock);
    const enabled = rows[0].at(-1);
    if (enabled === 'true') return result('enabled', null, isoNow(clock));
    if (enabled === 'false') return disabled(REASONS.capabilityDisabled, clock);
    return failure(REASONS.inspectionFailed, clock);
  }
  const help = await runBoundedCommand(executable, ['agents', '--help'], environment, clientRoot, timeoutMs);
  if (!help.ok) {
    return help.kind === 'unavailable' ? unavailable(REASONS.providerUnavailable, clock) :
      failure(REASONS.inspectionFailed, clock);
  }
  if (!/^Usage: claude agents \[options\]$/mu.test(help.text) || !/^\s*--json\s+/mu.test(help.text)) {
    return failure(REASONS.inspectionFailed, clock);
  }
  const state = await runBoundedCommand(executable, ['agents', '--json'], environment, clientRoot, timeoutMs);
  if (!state.ok) return failure(REASONS.inspectionFailed, clock);
  try {
    if (!Array.isArray(JSON.parse(state.text))) return failure(REASONS.inspectionFailed, clock);
  } catch {
    return failure(REASONS.inspectionFailed, clock);
  }
  return result('enabled', null, isoNow(clock));
}

function supportedPlatform(clock) {
  return process.platform === 'win32' ? unsupported(REASONS.platformUnsupported, clock) : null;
}

export async function inspectQuota(harness, options = {}) {
  const clock = options.clock ?? Date;
  if (!PROVIDER_HARNESSES.includes(harness)) return unsupported(REASONS.harnessUnsupported, clock);
  const platform = supportedPlatform(clock);
  if (platform !== null) return platform;
  return harness === 'codex' ? codexQuota(options) : claudeQuotaProcess(options);
}

export async function inspectCapability(harness, capability, options = {}) {
  const clock = options.clock ?? Date;
  if (!PROVIDER_HARNESSES.includes(harness)) return unsupported(REASONS.harnessUnsupported, clock);
  if (!PROVIDER_CAPABILITIES.includes(capability)) return unsupported(REASONS.capabilityUnsupported, clock);
  const platform = supportedPlatform(clock);
  if (platform !== null) return platform;
  return delegationCapability(harness, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH &&
    process.argv.length === 3 && process.argv[2] === '--claude-quota-child') {
  const inspected = await inspectClaudeQuota();
  process.stdout.write(`${JSON.stringify(inspected)}\n`);
}
