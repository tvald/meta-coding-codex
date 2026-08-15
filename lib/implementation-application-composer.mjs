import { createImplementationApplicationService } from './implementation-application.mjs';
import { isImplementationLedger } from './implementation-ledger.mjs';
import { createImplementationRuntime } from './implementation-runtime.mjs';

export const IMPLEMENTATION_APPLICATION_COMPOSER_VERSION = 1;

const COMPOSITIONS = new WeakSet();

export class ImplementationApplicationComposerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationApplicationComposerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationApplicationComposerError(code, message);
}

/**
 * Composes the shipped durable runtime and application state machine around explicit
 * offline leaf ports. It deliberately neither opens a writable ledger nor converts
 * receipt-shaped data into effect authority. The caller must already possess a ledger
 * opened through a protected, package-external issuer, and every leaf effect remains
 * independently guarded by its injected port.
 */
export function createOfflineImplementationApplicationComposition({
  ledger,
  runtimeTaskPort = null,
  taskPort,
  quotaPort,
  approvalPort,
  providerPort,
  processPort,
  workspacePort,
  resourcePort,
  checkPort,
  finalizationPort,
  clock,
  scheduler = {},
} = {}) {
  if (!isImplementationLedger(ledger)) {
    fail('COMPOSITION_INPUT_INVALID', 'offline composition requires an already-open ledger');
  }
  if (finalizationPort === null || typeof finalizationPort !== 'object' ||
      Array.isArray(finalizationPort)) {
    fail('COMPOSITION_INPUT_INVALID', 'offline composition requires an explicit finalization port');
  }
  const runtime = createImplementationRuntime({
    ledger,
    taskPort: runtimeTaskPort,
    ...(clock === undefined ? {} : { clock }),
  });
  const application = createImplementationApplicationService({
    runtime,
    taskPort,
    quotaPort,
    approvalPort,
    providerPort,
    processPort,
    workspacePort,
    resourcePort,
    checkPort,
    finalizationPort,
    ...(clock === undefined ? {} : { clock }),
    scheduler,
  });
  const composition = Object.freeze({
    schemaVersion: IMPLEMENTATION_APPLICATION_COMPOSER_VERSION,
    mode: 'offline_injected',
    liveActivation: false,
    activationIssuer: false,
    runtime,
    application,
  });
  COMPOSITIONS.add(composition);
  return composition;
}

export function isOfflineImplementationApplicationComposition(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') &&
    COMPOSITIONS.has(value);
}
