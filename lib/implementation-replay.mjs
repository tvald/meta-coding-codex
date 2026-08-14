import {
  bindingAuthorizesEffect,
  planOrientation,
  postconditionAuthorizesAcknowledgement,
  reduceEventLog,
  registerOperation,
  stopAllowsEffect,
  taskRevisionAuthorizesEffect,
  transitionAttempt,
  transitionOperation,
  transitionRun,
} from './implementation-reducer.mjs';
import {
  canonicalJson,
  IMPLEMENTATION_PROTOCOL_LIMITS,
  validateControllerId,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_REPLAY_VERSION = 1;

export const IMPLEMENTATION_REPLAY_LIMITS = Object.freeze({
  traces: 32,
  stepsPerTrace: IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems,
  traceBytes: IMPLEMENTATION_PROTOCOL_LIMITS.recordBytes,
});

export class ImplementationReplayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationReplayError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationReplayError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, required, optional, label) {
  if (!plainObject(value)) fail('TRACE_INVALID', `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    fail('TRACE_INVALID', `${label} has unknown or missing fields`);
  }
}

function nullableObject(value, label) {
  if (value !== null && !plainObject(value)) fail('TRACE_INVALID', `${label} must be an object or null`);
}

function boundedArray(value, label, maximumItems) {
  if (!Array.isArray(value)) fail('TRACE_INVALID', `${label} must be an array`);
  if (value.length > maximumItems) fail('REPLAY_LIMIT', `${label} exceeds the replay bound`);
}

function controllerId(value, label) {
  try {
    validateControllerId(value, label);
  } catch {
    fail('TRACE_INVALID', `${label} is invalid`);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

function normalizedRun(run) {
  if (run === null) return null;
  return {
    phase: run.phase,
    revision: run.revision,
    stopRequested: run.stop?.requested === true,
  };
}

function normalizedAttempt(attempt) {
  if (attempt === null) return null;
  return { state: attempt.state, recordVersion: attempt.recordVersion };
}

function normalizedOperation(operation) {
  if (operation === null) return null;
  return {
    state: operation.state,
    recordVersion: operation.recordVersion,
    acknowledged: postconditionAuthorizesAcknowledgement(operation),
  };
}

function normalizeResult(action, value) {
  switch (action) {
    case 'transition_run':
      return normalizedRun(value);
    case 'transition_attempt':
      return normalizedAttempt(value);
    case 'transition_operation':
      return normalizedOperation(value);
    case 'register_operation':
      return {
        created: value.created,
        operationId: value.operation.operationId,
        operationCount: value.operations.length,
      };
    case 'reduce_events':
      return {
        cursor: value.cursor,
        dedupeKeys: value.events.map(({ dedupeKey }) => dedupeKey),
      };
    case 'binding_authorizes_effect':
    case 'task_revision_authorizes_effect':
    case 'stop_allows_effect':
    case 'acknowledgement_authorizes':
      return value;
    case 'plan_orientation':
      return { action: value.action, reason: value.reason };
    default:
      fail('TRACE_INVALID', `unsupported replay action ${String(action)}`);
  }
}

function validateStepShape(step, index) {
  const label = `trace step ${index}`;
  if (!plainObject(step) || typeof step.action !== 'string') {
    fail('TRACE_INVALID', `${label} is invalid`);
  }
  const optionalError = ['expectedError'];
  switch (step.action) {
    case 'transition_run':
      exactKeys(step, ['action', 'expectedRevision', 'nextPhase', 'observation', 'updatedAt'], optionalError, label);
      break;
    case 'transition_attempt':
      exactKeys(step, ['action', 'expectedRecordVersion', 'nextState', 'observation', 'observedAt'], optionalError, label);
      break;
    case 'transition_operation':
      exactKeys(step, [
        'action', 'expectedRecordVersion', 'nextState', 'observation', 'observedAt', 'receipt', 'failureCode',
      ], optionalError, label);
      break;
    case 'register_operation':
      exactKeys(step, ['action', 'operation'], optionalError, label);
      break;
    case 'reduce_events':
      exactKeys(step, ['action', 'events', 'afterSequence'], optionalError, label);
      boundedArray(step.events, `${label}.events`, IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun);
      break;
    case 'binding_authorizes_effect':
      exactKeys(step, ['action', 'expectedBinding', 'candidateBinding'], optionalError, label);
      break;
    case 'task_revision_authorizes_effect':
      exactKeys(step, ['action', 'binding', 'task'], optionalError, label);
      break;
    case 'stop_allows_effect':
      exactKeys(step, ['action'], optionalError, label);
      break;
    case 'acknowledgement_authorizes':
      exactKeys(step, ['action', 'operation'], optionalError, label);
      nullableObject(step.operation, `${label}.operation`);
      break;
    case 'plan_orientation':
      exactKeys(step, ['action', 'stateChanged', 'deadlineDue'], optionalError, label);
      break;
    default:
      fail('TRACE_INVALID', `${label} has an unsupported action`);
  }
  if (Object.hasOwn(step, 'expectedError') &&
      (typeof step.expectedError !== 'string' || step.expectedError.length === 0)) {
    fail('TRACE_INVALID', `${label}.expectedError is invalid`);
  }
}

function performStep(state, step) {
  switch (step.action) {
    case 'transition_run': {
      if (state.run === null) fail('TRACE_STATE_INVALID', 'run state is unavailable');
      const result = transitionRun(state.run, {
        expectedRevision: step.expectedRevision,
        nextPhase: step.nextPhase,
        observation: step.observation,
        updatedAt: step.updatedAt,
      });
      state.run = result;
      return result;
    }
    case 'transition_attempt': {
      if (state.attempt === null) fail('TRACE_STATE_INVALID', 'attempt state is unavailable');
      const result = transitionAttempt(state.attempt, {
        expectedRecordVersion: step.expectedRecordVersion,
        nextState: step.nextState,
        observation: step.observation,
        observedAt: step.observedAt,
      });
      state.attempt = result;
      return result;
    }
    case 'transition_operation': {
      if (state.operation === null) fail('TRACE_STATE_INVALID', 'operation state is unavailable');
      const result = transitionOperation(state.operation, {
        expectedRecordVersion: step.expectedRecordVersion,
        nextState: step.nextState,
        observation: step.observation,
        observedAt: step.observedAt,
        receipt: step.receipt,
        failureCode: step.failureCode,
      });
      state.operation = result;
      return result;
    }
    case 'register_operation': {
      const result = registerOperation(state.operations, step.operation);
      state.operations = result.operations;
      return result;
    }
    case 'reduce_events': {
      const result = reduceEventLog(step.events, { afterSequence: step.afterSequence });
      state.eventReplay = result;
      return result;
    }
    case 'binding_authorizes_effect':
      return bindingAuthorizesEffect(step.expectedBinding, step.candidateBinding);
    case 'task_revision_authorizes_effect':
      return taskRevisionAuthorizesEffect(step.binding, step.task);
    case 'stop_allows_effect':
      if (state.run === null) fail('TRACE_STATE_INVALID', 'run state is unavailable');
      return stopAllowsEffect(state.run);
    case 'acknowledgement_authorizes':
      return postconditionAuthorizesAcknowledgement(step.operation ?? state.operation);
    case 'plan_orientation':
      if (state.run === null) fail('TRACE_STATE_INVALID', 'run state is unavailable');
      return planOrientation(state.run, {
        stateChanged: step.stateChanged,
        deadlineDue: step.deadlineDue,
      });
    default:
      fail('TRACE_INVALID', `unsupported replay action ${String(step.action)}`);
  }
}

export function replayImplementationTrace(trace) {
  try {
    canonicalJson(trace, {
      maxBytes: IMPLEMENTATION_REPLAY_LIMITS.traceBytes,
      maximumArrayItems: IMPLEMENTATION_PROTOCOL_LIMITS.eventsPerRun,
    });
  } catch (error) {
    if (error?.code === 'RECORD_SIZE') fail('REPLAY_LIMIT', 'implementation trace exceeds the byte bound');
    fail('TRACE_INVALID', 'implementation trace is not bounded protocol data');
  }
  exactKeys(trace, ['schemaVersion', 'id', 'initial', 'steps'], [], 'implementation trace');
  if (trace.schemaVersion !== IMPLEMENTATION_REPLAY_VERSION) {
    fail('TRACE_UNSUPPORTED', 'implementation trace version is unsupported');
  }
  controllerId(trace.id, 'implementation trace.id');
  exactKeys(trace.initial, ['run', 'attempt', 'operation', 'operations'], [], 'implementation trace.initial');
  nullableObject(trace.initial.run, 'implementation trace.initial.run');
  nullableObject(trace.initial.attempt, 'implementation trace.initial.attempt');
  nullableObject(trace.initial.operation, 'implementation trace.initial.operation');
  boundedArray(trace.initial.operations, 'implementation trace.initial.operations',
    IMPLEMENTATION_PROTOCOL_LIMITS.arrayItems);
  boundedArray(trace.steps, 'implementation trace.steps', IMPLEMENTATION_REPLAY_LIMITS.stepsPerTrace);

  const state = {
    run: structuredClone(trace.initial.run),
    attempt: structuredClone(trace.initial.attempt),
    operation: structuredClone(trace.initial.operation),
    operations: structuredClone(trace.initial.operations),
    eventReplay: null,
  };
  const observations = [];
  for (const [index, sourceStep] of trace.steps.entries()) {
    validateStepShape(sourceStep, index);
    const step = structuredClone(sourceStep);
    try {
      const value = performStep(state, step);
      if (Object.hasOwn(step, 'expectedError')) {
        fail('REPLAY_EXPECTATION_FAILED',
          `trace ${trace.id} step ${index} did not produce ${step.expectedError}`);
      }
      observations.push({
        index,
        action: step.action,
        outcome: 'accepted',
        result: normalizeResult(step.action, value),
      });
    } catch (error) {
      if (!Object.hasOwn(step, 'expectedError')) throw error;
      if (error?.code !== step.expectedError) {
        fail('REPLAY_EXPECTATION_FAILED',
          `trace ${trace.id} step ${index} produced ${String(error?.code)} instead of ${step.expectedError}`);
      }
      observations.push({ index, action: step.action, outcome: 'rejected', code: error.code });
    }
  }

  return deepFreeze({
    schemaVersion: IMPLEMENTATION_REPLAY_VERSION,
    traceId: trace.id,
    run: normalizedRun(state.run),
    attempt: normalizedAttempt(state.attempt),
    operation: normalizedOperation(state.operation),
    operationIds: state.operations.map(({ operationId }) => operationId),
    eventReplay: state.eventReplay === null ? null : normalizeResult('reduce_events', state.eventReplay),
    observations,
  });
}

export function replayImplementationTraces(traces) {
  boundedArray(traces, 'implementation traces', IMPLEMENTATION_REPLAY_LIMITS.traces);
  const ids = new Set();
  const results = traces.map((trace) => {
    if (plainObject(trace) && ids.has(trace.id)) fail('TRACE_INVALID', 'implementation trace IDs must be unique');
    if (plainObject(trace)) ids.add(trace.id);
    return replayImplementationTrace(trace);
  });
  return deepFreeze(results);
}
