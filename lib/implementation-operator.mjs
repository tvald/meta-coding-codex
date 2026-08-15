import { isAbsolute } from 'node:path';

import {
  IMPLEMENTATION_COMMAND_RESULT_BYTES,
  ImplementationCliError,
  createImplementationCommandAdapter,
  createReadOnlyImplementationAdapter,
  isImplementationCommandAdapter,
} from './implementation-cli.mjs';
import {
  authorizeImplementationControlWrite,
  inspectRunLock,
  openImplementationLedger,
  publishControlRequest,
  replayRun,
} from './implementation-ledger.mjs';
import { notifyImplementationControlWake } from './implementation-control-wake.mjs';
import {
  canonicalBytes,
  canonicalDigest,
  validateControlRequest,
  validateControllerId,
  validateTaskId,
  validateTimestamp,
} from './implementation-protocol.mjs';
import { deriveImplementationRuntimeState } from './implementation-runtime.mjs';

export const IMPLEMENTATION_OPERATOR_VERSION = 1;
export const IMPLEMENTATION_OPERATOR_COMMAND_BYTES = 16 * 1024;

const FORWARD_OPERATIONS = Object.freeze(['start', 'resume', 'clean', 'lockRecover']);
const READ_METHODS = Object.freeze(['shadow', 'status', 'events', 'doctor', 'lockInspect']);
const TERMINAL_PHASES = new Set(['succeeded', 'failed', 'stopped', 'superseded']);
const CONSUMED_FORWARD_CAPABILITIES = new WeakSet();

function fail(code, message, exitCode = 1) {
  throw new ImplementationCliError(code, message, exitCode);
}

function normalizedErrorCode(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value) ? value : fallback;
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('RUNTIME_INVALID', `${label} is invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('RUNTIME_INVALID', `${label} has unknown or missing fields`);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function boundedJsonClone(value, label, maximumBytes) {
  if (!plainObject(value)) fail('RUNTIME_INVALID', `${label} is invalid`);
  let clone;
  let bytes;
  try {
    clone = structuredClone(value);
    bytes = canonicalBytes(clone);
  } catch {
    fail('RUNTIME_INVALID', `${label} is invalid`);
  }
  if (bytes.length > maximumBytes) fail('RUNTIME_INVALID', `${label} exceeds its byte limit`);
  return deepFreeze(clone);
}

function validatePort(port, methods, label) {
  exactKeys(port, methods, label);
  if (methods.some((method) => typeof port[method] !== 'function')) {
    fail('RUNTIME_INVALID', `${label} is invalid`);
  }
  return port;
}

function validateForwardInput(operation, input) {
  const keys = {
    start: ['taskId', 'expectedTaskRevision', 'harness', 'maxConcurrency'],
    resume: ['runId', 'expectedEpoch', 'expectedControlGeneration'],
    clean: ['runId'],
    lockRecover: ['runId', 'expectedToken', 'confirmOwnerNotLive'],
  }[operation];
  exactKeys(input, keys, `${operation} command`);
  try {
    if (operation === 'start') {
      validateTaskId(input.taskId, 'start command.taskId');
      if (!Number.isSafeInteger(input.expectedTaskRevision) || input.expectedTaskRevision < 1 ||
          input.harness !== 'codex' || !Number.isSafeInteger(input.maxConcurrency) ||
          input.maxConcurrency < 1 || input.maxConcurrency > 3) {
        fail('ARGUMENT_INVALID', 'start command is invalid', 2);
      }
    } else {
      validateControllerId(input.runId, `${operation} command.runId`);
      if (operation === 'resume' &&
          (!Number.isSafeInteger(input.expectedEpoch) || input.expectedEpoch < 1 ||
           !Number.isSafeInteger(input.expectedControlGeneration) ||
           input.expectedControlGeneration < 0)) {
        fail('ARGUMENT_INVALID', 'resume command is invalid', 2);
      }
      if (operation === 'lockRecover' &&
          ((input.expectedToken !== 'incomplete' &&
            !/^[0-9a-f-]{36}$/u.test(input.expectedToken)) || input.confirmOwnerNotLive !== true)) {
        fail('ARGUMENT_INVALID', 'lock recovery command is invalid', 2);
      }
    }
  } catch (error) {
    if (error instanceof ImplementationCliError) throw error;
    fail('ARGUMENT_INVALID', `${operation} command is invalid`, 2);
  }
  return boundedJsonClone(input, `${operation} command`, IMPLEMENTATION_OPERATOR_COMMAND_BYTES);
}

function authorizationCommand(operation, input) {
  const command = {
    schemaVersion: IMPLEMENTATION_OPERATOR_VERSION,
    operation,
    commandDigest: canonicalDigest(input),
    input,
  };
  return boundedJsonClone(command, 'forward authorization command',
    IMPLEMENTATION_OPERATOR_COMMAND_BYTES);
}

function validateCapabilityBundle(value, command) {
  exactKeys(value, ['schemaVersion', 'operation', 'commandDigest', 'capability'],
    'forward capability bundle');
  if (value.schemaVersion !== IMPLEMENTATION_OPERATOR_VERSION ||
      value.operation !== command.operation ||
      value.commandDigest !== command.commandDigest) {
    fail('ACTIVATION_DENIED', 'forward capability does not authorize the exact command');
  }
  const capability = value.capability;
  if ((typeof capability !== 'object' && typeof capability !== 'function') || capability === null) {
    fail('ACTIVATION_DENIED', 'forward capability is not opaque');
  }
  if (Object.keys(capability).length !== 0) {
    fail('ACTIVATION_DENIED', 'forward capability exposes unsupported public data');
  }
  if (CONSUMED_FORWARD_CAPABILITIES.has(capability)) {
    fail('ACTIVATION_DENIED', 'forward capability was already consumed');
  }
  CONSUMED_FORWARD_CAPABILITIES.add(capability);
  return capability;
}

function validateForwardResult(value, command) {
  exactKeys(value, ['schemaVersion', 'operation', 'commandDigest', 'output'],
    'forward operation result');
  if (value.schemaVersion !== IMPLEMENTATION_OPERATOR_VERSION ||
      value.operation !== command.operation ||
      value.commandDigest !== command.commandDigest) {
    fail('RUNTIME_INVALID', 'forward operation result does not match the exact command');
  }
  const envelope = boundedJsonClone(value, 'forward operation result',
    IMPLEMENTATION_COMMAND_RESULT_BYTES);
  if (!plainObject(envelope.output)) {
    fail('RUNTIME_INVALID', 'forward operation output is invalid');
  }
  return deepFreeze(structuredClone(envelope.output));
}

function stopRequestId({ runId, expectedControlGeneration, reason }) {
  const digest = canonicalDigest({
    runId,
    generation: expectedControlGeneration,
    reason,
  });
  return `stop_${digest.slice(7, 39)}`;
}

function validateStopInput(input) {
  exactKeys(input, ['runId', 'expectedControlGeneration', 'reason'], 'stop command');
  try {
    validateControllerId(input.runId, 'stop command.runId');
  } catch {
    fail('ARGUMENT_INVALID', 'stop command run ID is invalid', 2);
  }
  if (!Number.isSafeInteger(input.expectedControlGeneration) || input.expectedControlGeneration < 0) {
    fail('ARGUMENT_INVALID', 'stop command control generation is invalid', 2);
  }
  if (typeof input.reason !== 'string' || input.reason.length === 0 ||
      Buffer.byteLength(input.reason, 'utf8') > 4_096 ||
      /[\u0000-\u001f\u007f]/u.test(input.reason)) {
    fail('ARGUMENT_INVALID', 'stop command reason is invalid', 2);
  }
  return Object.freeze({
    runId: input.runId,
    expectedControlGeneration: input.expectedControlGeneration,
    reason: input.reason,
  });
}

function existingStopRequest(replay, requestId, input) {
  const found = replay.controls.filter(({ value }) => value.requestId === requestId);
  if (found.length === 0) return null;
  if (found.length !== 1) fail('CONTROL_CONFLICT', 'stop request identity is ambiguous');
  const request = found[0].value;
  if (request.schemaVersion !== IMPLEMENTATION_OPERATOR_VERSION ||
      request.kind !== 'stop' || request.runId !== input.runId ||
      request.expectedControlGeneration !== input.expectedControlGeneration ||
      request.reason !== input.reason) {
    fail('CONTROL_CONFLICT', 'stop request identity has conflicting evidence');
  }
  return Object.freeze(structuredClone(request));
}

export function createImplementationOperatorAdapter({
  gitCommonDirectory,
  readOnlyAdapter = null,
  forwardPort = null,
  activationPort = null,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof gitCommonDirectory !== 'string' || !isAbsolute(gitCommonDirectory)) {
    fail('RUNTIME_INVALID', 'Git common directory is unavailable');
  }
  if (typeof clock !== 'function') fail('RUNTIME_INVALID', 'operator clock is invalid');
  const reads = readOnlyAdapter ?? createReadOnlyImplementationAdapter(gitCommonDirectory);
  if (!isImplementationCommandAdapter(reads) ||
      READ_METHODS.some((method) => typeof reads[method] !== 'function')) {
    fail('RUNTIME_INVALID', 'read-only implementation adapter is unrecognized');
  }
  const forwardConfigured = forwardPort !== null || activationPort !== null;
  let authorizeForward = null;
  let forwardMethods = null;
  if (forwardConfigured) {
    validatePort(activationPort, ['authorize'], 'forward activation port');
    validatePort(forwardPort, FORWARD_OPERATIONS, 'forward operation port');
    authorizeForward = activationPort.authorize.bind(activationPort);
    forwardMethods = Object.freeze(Object.fromEntries(FORWARD_OPERATIONS.map((operation) =>
      [operation, forwardPort[operation].bind(forwardPort)])));
  }

  async function forward(operation, rawInput) {
    if (!forwardConfigured) {
      fail('ACTIVATION_DISABLED', `${operation} is disabled without a forward activation source`);
    }
    const input = validateForwardInput(operation, rawInput);
    const command = authorizationCommand(operation, input);
    const bundle = await authorizeForward(command);
    const capability = validateCapabilityBundle(bundle, command);
    const result = await forwardMethods[operation](command, capability);
    return validateForwardResult(result, command);
  }

  async function stop(rawInput) {
    const input = validateStopInput(rawInput);
    const readLedger = await openImplementationLedger(gitCommonDirectory);
    let replay;
    let state;
    try {
      replay = await replayRun(readLedger, input.runId);
      state = deriveImplementationRuntimeState(replay);
    } catch (error) {
      fail(normalizedErrorCode(error?.code, 'RECONCILIATION_REQUIRED'),
        'implementation stop state could not be derived safely');
    }
    const requestId = stopRequestId(input);
    let request = existingStopRequest(replay, requestId, input);
    if (request === null) {
      if (TERMINAL_PHASES.has(state.snapshot.phase)) {
        fail('RUN_TERMINAL', 'a terminal implementation run cannot be stopped');
      }
      if (state.snapshot.controlGeneration !== input.expectedControlGeneration) {
        fail('CONTROL_STALE', 'stop command control generation is stale');
      }
      const requestedAt = clock();
      try {
        validateTimestamp(requestedAt, 'operator clock');
      } catch {
        fail('RUNTIME_INVALID', 'operator clock returned an invalid timestamp');
      }
      request = Object.freeze({
        schemaVersion: IMPLEMENTATION_OPERATOR_VERSION,
        requestId,
        runId: input.runId,
        expectedControlGeneration: input.expectedControlGeneration,
        kind: 'stop',
        requestedAt,
        reason: input.reason,
      });
      try {
        validateControlRequest(request, { expectedRunId: input.runId });
      } catch {
        fail('RUNTIME_INVALID', 'derived stop request is invalid');
      }
    }
    const capability = await authorizeImplementationControlWrite({ gitCommonDirectory });
    const controlLedger = await openImplementationLedger(gitCommonDirectory, {
      controlCapability: capability,
    });
    const published = await publishControlRequest(controlLedger, input.runId, request);
    try {
      const currentLock = await inspectRunLock(readLedger, input.runId);
      if (currentLock.held && currentLock.state === 'owned' &&
          currentLock.owner.epoch === state.snapshot.epoch) {
        await notifyImplementationControlWake({
          ledgerRootIdentity: readLedger.rootIdentity,
          runId: input.runId,
          lockToken: currentLock.owner.token,
          epoch: currentLock.owner.epoch,
          requestId,
        });
      }
    } catch {
      // The durable control is authoritative; the doorbell is best-effort wake-up only.
    }
    return deepFreeze({
      schemaVersion: IMPLEMENTATION_OPERATOR_VERSION,
      disposition: published.created ? 'stop_requested' : 'stop_already_requested',
      runId: input.runId,
      requestId,
      expectedControlGeneration: input.expectedControlGeneration,
      created: published.created,
    });
  }

  return createImplementationCommandAdapter({
    shadow: (...args) => reads.shadow(...args),
    status: (...args) => reads.status(...args),
    events: (...args) => reads.events(...args),
    doctor: (...args) => reads.doctor(...args),
    lockInspect: (...args) => reads.lockInspect(...args),
    start: (input) => forward('start', input),
    stop,
    resume: (input) => forward('resume', input),
    clean: (input) => forward('clean', input),
    lockRecover: (input) => forward('lockRecover', input),
  });
}
