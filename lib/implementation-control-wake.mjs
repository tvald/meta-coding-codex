import { createHash } from 'node:crypto';
import net from 'node:net';

import { validateControllerId } from './implementation-protocol.mjs';

export const IMPLEMENTATION_CONTROL_WAKE_VERSION = 1;
export const IMPLEMENTATION_CONTROL_WAKE_MAX_BYTES = 128;

const RECEIVERS = new WeakSet();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_IDENTITY = /^(?:0|[1-9]\d*)$/u;

export class ImplementationControlWakeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationControlWakeError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationControlWakeError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateIdentity(value) {
  if (!plainObject(value) || Object.keys(value).sort().join(',') !== 'dev,ino' ||
      typeof value.dev !== 'string' || !DECIMAL_IDENTITY.test(value.dev) ||
      typeof value.ino !== 'string' || !DECIMAL_IDENTITY.test(value.ino)) {
    fail('WAKE_IDENTITY_INVALID', 'implementation control wake ledger identity is invalid');
  }
  return value;
}

function validateScope({ ledgerRootIdentity, runId, lockToken, epoch } = {}) {
  if (process.platform !== 'linux') {
    fail('WAKE_PLATFORM_UNSUPPORTED',
      'implementation control wake requires Linux abstract Unix sockets');
  }
  validateIdentity(ledgerRootIdentity);
  try {
    validateControllerId(runId, 'control wake run ID');
  } catch {
    fail('WAKE_SCOPE_INVALID', 'implementation control wake run ID is invalid');
  }
  if (typeof lockToken !== 'string' || !UUID.test(lockToken) ||
      !Number.isSafeInteger(epoch) || epoch < 1) {
    fail('WAKE_SCOPE_INVALID', 'implementation control wake lock scope is invalid');
  }
  return { ledgerRootIdentity, runId, lockToken, epoch };
}

export function deriveImplementationControlWakeAddress(scope) {
  const { ledgerRootIdentity, runId, lockToken, epoch } = validateScope(scope);
  const digest = createHash('sha256')
    .update('meta-framework-control-wake-v1\0')
    .update(ledgerRootIdentity.dev).update('\0')
    .update(ledgerRootIdentity.ino).update('\0')
    .update(runId).update('\0')
    .update(lockToken).update('\0')
    .update(String(epoch))
    .digest('hex');
  return `\0meta-framework-control-${digest}`;
}

function validateHint(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') >
      IMPLEMENTATION_CONTROL_WAKE_MAX_BYTES) return null;
  try {
    validateControllerId(value, 'control wake request ID');
  } catch {
    return null;
  }
  return value;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}

export async function createImplementationControlWakeReceiver(scope) {
  const address = deriveImplementationControlWakeAddress(scope);
  const subscribers = new Set();
  let closed = false;
  const server = net.createServer((socket) => {
    const chunks = [];
    let bytes = 0;
    let invalid = false;
    socket.setTimeout(1_000, () => socket.destroy());
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > IMPLEMENTATION_CONTROL_WAKE_MAX_BYTES) {
        invalid = true;
        chunks.length = 0;
        socket.destroy();
        return;
      }
      chunks.push(chunk);
    });
    socket.on('end', () => {
      if (invalid || closed) return;
      const requestId = validateHint(Buffer.concat(chunks, bytes).toString('utf8'));
      if (requestId === null) return;
      for (const subscriber of [...subscribers]) subscriber(requestId);
    });
    socket.on('error', () => {});
  });
  server.on('connection', (socket) => socket.unref());
  server.unref();
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(new ImplementationControlWakeError('WAKE_BIND_FAILED',
        `implementation control wake receiver could not bind: ${error?.code ?? 'UNKNOWN'}`));
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ path: address, exclusive: true });
  });
  server.on('error', () => {});

  const receiver = {
    address,
    subscribe(subscriber) {
      if (!RECEIVERS.has(receiver) || closed || typeof subscriber !== 'function') {
        fail('WAKE_RECEIVER_INVALID', 'implementation control wake subscription is invalid');
      }
      subscribers.add(subscriber);
      let subscribed = true;
      return () => {
        if (!subscribed) return false;
        subscribed = false;
        return subscribers.delete(subscriber);
      };
    },
    async close() {
      if (!RECEIVERS.has(receiver)) {
        fail('WAKE_RECEIVER_INVALID', 'implementation control wake receiver is invalid');
      }
      if (closed) return Object.freeze({ closed: false });
      closed = true;
      subscribers.clear();
      await closeServer(server);
      return Object.freeze({ closed: true });
    },
  };
  RECEIVERS.add(receiver);
  return Object.freeze(receiver);
}

export async function notifyImplementationControlWake({ requestId, ...scope } = {}) {
  const address = deriveImplementationControlWakeAddress(scope);
  const hint = validateHint(requestId);
  if (hint === null) fail('WAKE_HINT_INVALID', 'implementation control wake hint is invalid');
  return new Promise((resolve) => {
    let settled = false;
    const client = net.createConnection({ path: address });
    client.unref();
    const finish = (notified) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      resolve(Object.freeze({ notified }));
    };
    const timer = setTimeout(() => finish(false), 1_000);
    timer.unref();
    client.once('connect', () => client.end(hint));
    client.once('error', () => finish(false));
    client.once('close', (hadError) => finish(!hadError));
  });
}
