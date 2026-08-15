import { IMPLEMENTATION_CONTROLLER_COMPATIBILITY } from './implementation-controller.mjs';
import {
  inspectRunLock,
  openImplementationLedger,
  readEvents,
  readRunStatus,
  replayRun,
} from './implementation-ledger.mjs';
import {
  canonicalBytes,
  canonicalDigest,
  validateControllerId,
  validateTaskId,
} from './implementation-protocol.mjs';
import { deriveImplementationRuntimeState } from './implementation-runtime.mjs';

export const IMPLEMENTATION_CLI_VERSION = '1.0.0';
export const IMPLEMENTATION_COMMAND_ADAPTER_VERSION = 1;
export const IMPLEMENTATION_COMMAND_RESULT_BYTES = 256 * 1024;

const IMPLEMENTATION_COMMAND_ADAPTERS = new WeakSet();
const COMMAND_ADAPTER_METHODS = Object.freeze([
  'shadow',
  'status',
  'events',
  'doctor',
  'lockInspect',
  'start',
  'stop',
  'resume',
  'clean',
  'lockRecover',
]);
const EFFECT_METHODS = Object.freeze({
  start: 'start',
  stop: 'stop',
  resume: 'resume',
  clean: 'clean',
  lock_recover: 'lockRecover',
});
const TERMINAL_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);

export class ImplementationCliError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.name = 'ImplementationCliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message, exitCode = 2) {
  throw new ImplementationCliError(code, message, exitCode);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeIssueCode(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value) ? value : fallback;
}

function assertCommandAdapter(adapter) {
  if (!IMPLEMENTATION_COMMAND_ADAPTERS.has(adapter)) {
    fail('RUNTIME_INVALID', 'implementation command adapter is unrecognized', 1);
  }
}

export function isImplementationCommandAdapter(value) {
  return IMPLEMENTATION_COMMAND_ADAPTERS.has(value);
}

export function createImplementationCommandAdapter(methods = {}) {
  if (!plainObject(methods)) {
    fail('RUNTIME_INVALID', 'implementation command adapter methods are invalid', 1);
  }
  const keys = Object.keys(methods);
  if (keys.some((key) => !COMMAND_ADAPTER_METHODS.includes(key) || typeof methods[key] !== 'function')) {
    fail('RUNTIME_INVALID', 'implementation command adapter methods are invalid', 1);
  }
  const adapter = {};
  for (const key of COMMAND_ADAPTER_METHODS) {
    if (Object.hasOwn(methods, key)) adapter[key] = methods[key];
  }
  IMPLEMENTATION_COMMAND_ADAPTERS.add(adapter);
  return Object.freeze(adapter);
}

function positiveInteger(value, label, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) fail('ARGUMENT_INVALID', `${label} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) fail('ARGUMENT_INVALID', `${label} is invalid`);
  return parsed;
}

function nonNegativeInteger(value, label, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value)) fail('ARGUMENT_INVALID', `${label} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) fail('ARGUMENT_INVALID', `${label} is invalid`);
  return parsed;
}

function controllerId(value, label) {
  try {
    return validateControllerId(value, label);
  } catch {
    fail('ARGUMENT_INVALID', `${label} is invalid`);
  }
}

function taskId(value) {
  try {
    return validateTaskId(value, 'task ID');
  } catch {
    fail('ARGUMENT_INVALID', 'task ID is invalid');
  }
}

function parseOptions(tokens, specification) {
  const values = {};
  for (let index = 0; index < tokens.length;) {
    const option = tokens[index];
    const descriptor = specification[option];
    if (descriptor === undefined || Object.hasOwn(values, descriptor.key)) {
      fail('ARGUMENT_INVALID', 'implementation command has an unknown or duplicate option');
    }
    if (descriptor.flag) {
      values[descriptor.key] = true;
      index += 1;
    } else {
      const value = tokens[index + 1];
      if (typeof value !== 'string' || value.startsWith('--')) {
        fail('ARGUMENT_INVALID', `${option} requires a value`);
      }
      values[descriptor.key] = descriptor.parse(value);
      index += 2;
    }
  }
  for (const descriptor of Object.values(specification)) {
    if (descriptor.required && !Object.hasOwn(values, descriptor.key)) {
      fail('ARGUMENT_INVALID', `${descriptor.option} is required`);
    }
    if (!Object.hasOwn(values, descriptor.key) && Object.hasOwn(descriptor, 'default')) {
      values[descriptor.key] = descriptor.default;
    }
  }
  return values;
}

const option = (key, parse, { required = false, defaultValue } = {}) => ({
  key, parse, required, ...(defaultValue === undefined ? {} : { default: defaultValue }),
});
const flag = (key) => ({ key, flag: true, required: false, default: false });

export function parseImplementationCommand(tokens) {
  if (!Array.isArray(tokens) || tokens.some((token) => typeof token !== 'string') || tokens.length === 0) {
    fail('ARGUMENT_INVALID', 'implementation command is required');
  }
  if (tokens.length === 1 && tokens[0] === '--version') return Object.freeze({ command: 'version' });
  if (tokens.length === 1 && ['--help', '-h', 'help'].includes(tokens[0])) return Object.freeze({ command: 'help' });
  if (/^T-/u.test(tokens[0])) {
    taskId(tokens[0]);
    const values = parseOptions(tokens.slice(1), {
      '--expected-task-revision': { ...option('expectedTaskRevision', (value) => positiveInteger(value, 'task revision'), { required: true }), option: '--expected-task-revision' },
      '--harness': { ...option('harness', (value) => value === 'codex' ? value : fail('ARGUMENT_INVALID', 'harness is unsupported'), { required: true }), option: '--harness' },
      '--max-concurrency': { ...option('maxConcurrency', (value) => positiveInteger(value, 'max concurrency', { maximum: 3 }), { defaultValue: 3 }), option: '--max-concurrency' },
      '--shadow': { ...flag('shadow'), option: '--shadow' },
    });
    return Object.freeze({ command: 'start', taskId: tokens[0], ...values });
  }
  if (tokens[0] === 'status' && tokens.length >= 2) {
    controllerId(tokens[1], 'run ID');
    // Every non-help command has one JSON envelope. --json remains an accepted
    // compatibility spelling, but it cannot select a second output mode.
    parseOptions(tokens.slice(2), { '--json': { ...flag('json'), option: '--json' } });
    return Object.freeze({ command: 'status', runId: tokens[1] });
  }
  if (tokens[0] === 'events' && tokens.length >= 2) {
    controllerId(tokens[1], 'run ID');
    const values = parseOptions(tokens.slice(2), {
      '--after': { ...option('afterSequence', (value) => nonNegativeInteger(value, 'event cursor'), { defaultValue: 0 }), option: '--after' },
      '--limit': { ...option('limit', (value) => positiveInteger(value, 'event limit', { maximum: 128 }), { defaultValue: 128 }), option: '--limit' },
    });
    return Object.freeze({ command: 'events', runId: tokens[1], ...values });
  }
  if (tokens[0] === 'doctor' && tokens.length === 2) {
    controllerId(tokens[1], 'run ID');
    return Object.freeze({ command: 'doctor', runId: tokens[1] });
  }
  if (tokens[0] === 'stop' && tokens.length >= 2) {
    controllerId(tokens[1], 'run ID');
    const values = parseOptions(tokens.slice(2), {
      '--expected-control-generation': { ...option('expectedControlGeneration', (value) => nonNegativeInteger(value, 'control generation'), { required: true }), option: '--expected-control-generation' },
      '--reason': { ...option('reason', (value) => {
        if (value.length === 0 || Buffer.byteLength(value, 'utf8') > 4_096 || /[\u0000-\u001f\u007f]/u.test(value)) {
          fail('ARGUMENT_INVALID', 'stop reason is invalid');
        }
        return value;
      }, { required: true }), option: '--reason' },
    });
    return Object.freeze({ command: 'stop', runId: tokens[1], ...values });
  }
  if (tokens[0] === 'resume' && tokens.length >= 2) {
    controllerId(tokens[1], 'run ID');
    const values = parseOptions(tokens.slice(2), {
      '--expected-epoch': { ...option('expectedEpoch', (value) => positiveInteger(value, 'epoch'), { required: true }), option: '--expected-epoch' },
      '--expected-control-generation': { ...option('expectedControlGeneration',
        (value) => nonNegativeInteger(value, 'control generation'), { required: true }),
      option: '--expected-control-generation' },
    });
    return Object.freeze({ command: 'resume', runId: tokens[1], ...values });
  }
  if (tokens[0] === 'clean' && tokens.length === 2) {
    controllerId(tokens[1], 'run ID');
    return Object.freeze({ command: 'clean', runId: tokens[1] });
  }
  if (tokens[0] === 'lock' && tokens[1] === 'inspect' && tokens.length === 3) {
    controllerId(tokens[2], 'run ID');
    return Object.freeze({ command: 'lock_inspect', runId: tokens[2] });
  }
  if (tokens[0] === 'lock' && tokens[1] === 'recover' && tokens.length >= 3) {
    controllerId(tokens[2], 'run ID');
    const values = parseOptions(tokens.slice(3), {
      '--expected-token': { ...option('expectedToken', (value) => {
        if (value !== 'incomplete' && !/^[0-9a-f-]{36}$/u.test(value)) fail('ARGUMENT_INVALID', 'lock token is invalid');
        return value;
      }, { required: true }), option: '--expected-token' },
      '--confirm-owner-not-live': { ...flag('confirmOwnerNotLive'), option: '--confirm-owner-not-live', required: true },
    });
    if (!values.confirmOwnerNotLive) fail('ARGUMENT_INVALID', '--confirm-owner-not-live is required');
    return Object.freeze({ command: 'lock_recover', runId: tokens[2], ...values });
  }
  fail('ARGUMENT_INVALID', 'invalid implementation command; run implement --help');
}

export function implementationVersionEnvelope(packageIdentity) {
  return Object.freeze({
    schemaVersion: 1,
    package: Object.freeze(structuredClone(packageIdentity)),
    implementationController: Object.freeze({
      cliVersion: IMPLEMENTATION_CLI_VERSION,
      ...IMPLEMENTATION_CONTROLLER_COMPATIBILITY,
    }),
  });
}

function activationDenied(commandName) {
  fail('ACTIVATION_DISABLED', `${commandName} is disabled without a package operator adapter`, 1);
}

function statusCounts(snapshot, replay) {
  return Object.freeze({
    records: replay.records.length,
    events: replay.events.length,
    controls: replay.controls.length,
    assignments: snapshot?.assignments.length ?? 0,
    attempts: snapshot?.attempts.length ?? 0,
    operations: snapshot?.operations.length ?? 0,
    checks: snapshot?.checks.length ?? 0,
    resources: snapshot?.resources.length ?? 0,
  });
}

function normalizedStatus(cached, replay, derived) {
  const snapshot = derived.snapshot;
  const cacheMatches = cached.snapshot !== null &&
    canonicalDigest(cached.snapshot) === canonicalDigest(snapshot);
  let issue = null;
  if (derived.reconciliationRequired) {
    issue = { code: 'IMMUTABLE_RECONCILIATION_REQUIRED' };
  } else if (cached.snapshot === null) {
    issue = { code: cached.issue === null ? 'SNAPSHOT_CACHE_MISSING' : 'SNAPSHOT_CACHE_INVALID' };
  } else if (!cacheMatches) {
    issue = { code: 'SNAPSHOT_CACHE_MISMATCH' };
  }
  return deepFreeze({
    runId: replay.runId,
    state: derived.reconciliationRequired ? 'reconciliation_required' :
      TERMINAL_PHASES.has(snapshot.phase) ? 'terminal' : 'nonterminal',
    phase: snapshot.phase,
    snapshotRevision: snapshot.revision,
    epoch: snapshot.epoch,
    controlGeneration: snapshot.controlGeneration,
    correctionGeneration: snapshot.correctionGeneration,
    taskRecordVersion: snapshot.taskRecordVersion,
    stop: {
      requested: snapshot.stop.requested,
      mode: snapshot.stop.mode,
      reasonDigest: snapshot.stop.reasonDigest,
    },
    reconciliation: {
      required: snapshot.reconciliation.required,
      reasonCode: snapshot.reconciliation.reasonCode,
    },
    counts: statusCounts(snapshot, replay),
    cacheMatches,
    cachedSnapshotRevision: cached.snapshot?.revision ?? null,
    issue,
  });
}

function failedReplayStatus(cached, replay, error) {
  const code = safeIssueCode(error?.code, 'REPLAY_FAILED');
  return deepFreeze({
    runId: replay.runId,
    state: 'reconciliation_required',
    phase: null,
    snapshotRevision: null,
    epoch: null,
    controlGeneration: null,
    correctionGeneration: null,
    taskRecordVersion: null,
    stop: null,
    reconciliation: { required: true, reasonCode: code },
    counts: statusCounts(null, replay),
    cacheMatches: false,
    cachedSnapshotRevision: cached.snapshot?.revision ?? null,
    issue: { code },
  });
}

function commandEffectArguments(command) {
  if (command.command === 'start') {
    return Object.freeze({
      taskId: command.taskId,
      expectedTaskRevision: command.expectedTaskRevision,
      harness: command.harness,
      maxConcurrency: command.maxConcurrency,
    });
  }
  if (command.command === 'stop') {
    return Object.freeze({
      runId: command.runId,
      expectedControlGeneration: command.expectedControlGeneration,
      reason: command.reason,
    });
  }
  if (command.command === 'resume') {
    return Object.freeze({
      runId: command.runId,
      expectedEpoch: command.expectedEpoch,
      expectedControlGeneration: command.expectedControlGeneration,
    });
  }
  if (command.command === 'clean') return Object.freeze({ runId: command.runId });
  return Object.freeze({
    runId: command.runId,
    expectedToken: command.expectedToken,
    confirmOwnerNotLive: command.confirmOwnerNotLive,
  });
}

function boundedCommandResult(value) {
  if (!plainObject(value)) {
    fail('RUNTIME_INVALID', 'implementation command result is invalid', 1);
  }
  let clone;
  let bytes;
  try {
    clone = structuredClone(value);
    bytes = canonicalBytes(clone);
  } catch {
    fail('RUNTIME_INVALID', 'implementation command result is invalid', 1);
  }
  if (bytes.length > IMPLEMENTATION_COMMAND_RESULT_BYTES) {
    fail('RUNTIME_INVALID', 'implementation command result exceeds its byte limit', 1);
  }
  return deepFreeze(clone);
}

export function createReadOnlyImplementationAdapter(gitCommonDirectory, {
  shadowStart = null,
} = {}) {
  if (typeof gitCommonDirectory !== 'string') fail('RUNTIME_INVALID', 'Git common directory is unavailable', 1);
  if (shadowStart !== null && typeof shadowStart !== 'function') {
    fail('RUNTIME_INVALID', 'shadow implementation inspector is invalid', 1);
  }
  async function ledger() {
    return openImplementationLedger(gitCommonDirectory);
  }
  return createImplementationCommandAdapter({
    async shadow(command) {
      if (shadowStart === null) {
        fail('RUNTIME_INVALID', 'shadow implementation inspector is unavailable', 1);
      }
      return shadowStart(command);
    },
    async status(runId) {
      const opened = await ledger();
      const [cached, replay] = await Promise.all([
        readRunStatus(opened, runId),
        replayRun(opened, runId),
      ]);
      try {
        const derived = deriveImplementationRuntimeState(replay);
        return normalizedStatus(cached, replay, derived);
      } catch (error) {
        return failedReplayStatus(cached, replay, error);
      }
    },
    async events(runId, options) {
      return readEvents(await ledger(), runId, options);
    },
    async doctor(runId) {
      const opened = await ledger();
      const [status, replay] = await Promise.all([readRunStatus(opened, runId), replayRun(opened, runId)]);
      let derived = null;
      let replayIssue = null;
      try {
        derived = deriveImplementationRuntimeState(replay);
      } catch (error) {
        replayIssue = error?.code ?? 'REPLAY_FAILED';
      }
      const cacheMatches = derived !== null && status.snapshot !== null &&
        canonicalDigest(derived.snapshot) === canonicalDigest(status.snapshot);
      const issues = [
        ...(status.issue === null ? [] : [status.issue]),
        ...(replayIssue === null ? [] : [replayIssue]),
        ...(derived?.reconciliationRequired ? ['IMMUTABLE_RECONCILIATION_REQUIRED'] : []),
        ...(derived !== null && !cacheMatches ? ['SNAPSHOT_CACHE_MISMATCH'] : []),
      ];
      return Object.freeze({
        ok: issues.length === 0,
        runId,
        state: derived?.snapshot.phase ?? status.state,
        recordCount: replay.records.length,
        eventCount: replay.events.length,
        controlCount: replay.controls.length,
        issue: issues[0] ?? null,
        issues: Object.freeze(issues),
        cacheMatches,
      });
    },
    async lockInspect(runId) {
      return inspectRunLock(await ledger(), runId);
    },
  });
}

export async function executeImplementationCommand(command, {
  packageIdentity,
  adapter = null,
} = {}) {
  if (command?.command === 'version') return implementationVersionEnvelope(packageIdentity);
  if (command?.command === 'help') return Object.freeze({ help: implementationHelp() });
  if (command?.command === 'start' && command.shadow) {
    assertCommandAdapter(adapter);
    if (typeof adapter.shadow !== 'function') {
      fail('RUNTIME_INVALID', 'shadow implementation inspector is unavailable', 1);
    }
    const result = await adapter.shadow(command);
    if (result === null || typeof result !== 'object' || Array.isArray(result) ||
        result.effectAuthority !== false ||
        !['shadow_planned', 'shadow_quiesced'].includes(result.disposition)) {
      fail('RUNTIME_INVALID', 'shadow implementation result is invalid', 1);
    }
    return result;
  }
  if (command?.command === 'status') {
    assertCommandAdapter(adapter);
    if (typeof adapter.status !== 'function') fail('RUNTIME_INVALID', 'status adapter is unavailable', 1);
    return adapter.status(command.runId);
  }
  if (command?.command === 'events') {
    assertCommandAdapter(adapter);
    if (typeof adapter.events !== 'function') fail('RUNTIME_INVALID', 'events adapter is unavailable', 1);
    return adapter.events(command.runId, { afterSequence: command.afterSequence, limit: command.limit });
  }
  if (command?.command === 'doctor') {
    assertCommandAdapter(adapter);
    if (typeof adapter.doctor !== 'function') fail('RUNTIME_INVALID', 'doctor adapter is unavailable', 1);
    return adapter.doctor(command.runId);
  }
  if (command?.command === 'lock_inspect') {
    assertCommandAdapter(adapter);
    if (typeof adapter.lockInspect !== 'function') {
      fail('RUNTIME_INVALID', 'lock inspection adapter is unavailable', 1);
    }
    return adapter.lockInspect(command.runId);
  }
  const effectMethod = EFFECT_METHODS[command?.command];
  if (effectMethod !== undefined) {
    if (adapter === null) activationDenied(command.command);
    assertCommandAdapter(adapter);
    if (typeof adapter[effectMethod] !== 'function') activationDenied(command.command);
    return boundedCommandResult(await adapter[effectMethod](commandEffectArguments(command)));
  }
  fail('ARGUMENT_INVALID', 'implementation command is invalid');
}

export function implementationHelp() {
  return `meta-framework implement

Usage:
  meta-framework implement --version
  meta-framework implement TASK --expected-task-revision N --harness codex [--max-concurrency 3] [--shadow]
  meta-framework implement status RUN [--json]
  meta-framework implement events RUN [--after SEQUENCE] [--limit COUNT]
  meta-framework implement doctor RUN
  meta-framework implement stop RUN --expected-control-generation N --reason TEXT
  meta-framework implement resume RUN --expected-epoch N --expected-control-generation N
  meta-framework implement clean RUN
  meta-framework implement lock inspect RUN
  meta-framework implement lock recover RUN --expected-token TOKEN --confirm-owner-not-live
`;
}
