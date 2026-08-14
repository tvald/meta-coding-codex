import { authorizeImplementationOperation } from './implementation-activation.mjs';
import { IMPLEMENTATION_CONTROLLER_COMPATIBILITY } from './implementation-controller.mjs';
import {
  inspectRunLock,
  openImplementationLedger,
  readEvents,
  readRunStatus,
  replayRun,
} from './implementation-ledger.mjs';
import { validateControllerId, validateTaskId } from './implementation-protocol.mjs';

export const IMPLEMENTATION_CLI_VERSION = '1.0.0';

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
    const values = parseOptions(tokens.slice(2), { '--json': { ...flag('json'), option: '--json' } });
    return Object.freeze({ command: 'status', runId: tokens[1], ...values });
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

function activationDenied(effectKind) {
  const authorization = authorizeImplementationOperation({ operationKind: effectKind });
  fail(authorization.code, `${effectKind} is disabled without a current activation receipt`, 1);
}

export function createReadOnlyImplementationAdapter(gitCommonDirectory) {
  if (typeof gitCommonDirectory !== 'string') fail('RUNTIME_INVALID', 'Git common directory is unavailable', 1);
  async function ledger() {
    return openImplementationLedger(gitCommonDirectory);
  }
  return Object.freeze({
    async status(runId) {
      return readRunStatus(await ledger(), runId);
    },
    async events(runId, options) {
      return readEvents(await ledger(), runId, options);
    },
    async doctor(runId) {
      const opened = await ledger();
      const [status, replay] = await Promise.all([readRunStatus(opened, runId), replayRun(opened, runId)]);
      return Object.freeze({
        ok: status.state !== 'reconciliation_required',
        runId,
        state: status.state,
        recordCount: replay.records.length,
        eventCount: replay.events.length,
        controlCount: replay.controls.length,
        issue: status.issue,
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
    return Object.freeze({
      schemaVersion: 1,
      disposition: 'shadow',
      effectAuthority: false,
      taskId: command.taskId,
      expectedTaskRevision: command.expectedTaskRevision,
      harness: command.harness,
      maxConcurrency: command.maxConcurrency,
      hypotheticalOperation: 'start_run',
    });
  }
  if (command?.command === 'status') return adapter.status(command.runId);
  if (command?.command === 'events') {
    return adapter.events(command.runId, { afterSequence: command.afterSequence, limit: command.limit });
  }
  if (command?.command === 'doctor') return adapter.doctor(command.runId);
  if (command?.command === 'lock_inspect') return adapter.lockInspect(command.runId);
  const effect = {
    start: 'ledger_write', stop: 'ledger_write', resume: 'provider_launch',
    clean: 'cleanup', lock_recover: 'ledger_write',
  }[command?.command];
  if (effect !== undefined) activationDenied(effect);
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
  meta-framework implement resume RUN --expected-epoch N
  meta-framework implement clean RUN
  meta-framework implement lock inspect RUN
  meta-framework implement lock recover RUN --expected-token TOKEN --confirm-owner-not-live
`;
}
