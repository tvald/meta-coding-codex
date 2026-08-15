import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';

import {
  createImplementationControlWakeReceiver,
  deriveImplementationControlWakeAddress,
  notifyImplementationControlWake,
} from '../lib/implementation-control-wake.mjs';

const scope = Object.freeze({
  ledgerRootIdentity: Object.freeze({ dev: '7', ino: '54' }),
  runId: 'run_54',
  lockToken: '12345678-1234-4234-8234-123456789abc',
  epoch: 1,
});

test('control wake address is an abstract socket bound to exact ledger and lock identity', {
  skip: process.platform !== 'linux',
}, () => {
  const address = deriveImplementationControlWakeAddress(scope);
  assert.equal(address.startsWith('\0meta-framework-control-'), true);
  assert.notEqual(address, deriveImplementationControlWakeAddress({ ...scope, epoch: 2 }));
  assert.notEqual(address, deriveImplementationControlWakeAddress({
    ...scope, ledgerRootIdentity: { dev: '7', ino: '55' },
  }));
  assert.throws(() => deriveImplementationControlWakeAddress({ ...scope, lockToken: 'forged' }),
    (error) => error.code === 'WAKE_SCOPE_INVALID');
});

test('receiver distributes only bounded controller-ID hints and closes idempotently', {
  skip: process.platform !== 'linux',
}, async (t) => {
  const receiver = await createImplementationControlWakeReceiver(scope);
  t.after(() => receiver.close());
  const hints = [];
  const unsubscribe = receiver.subscribe((requestId) => hints.push(requestId));
  assert.deepEqual(await notifyImplementationControlWake({ ...scope, requestId: 'stop_54' }),
    { notified: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(hints, ['stop_54']);

  await new Promise((resolve) => {
    const client = net.createConnection({ path: receiver.address }, () => {
      client.end('not valid whitespace');
    });
    client.once('close', resolve);
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(hints, ['stop_54']);
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  assert.deepEqual(await receiver.close(), { closed: true });
  assert.deepEqual(await receiver.close(), { closed: false });
});

test('receiver collision fails closed and absent receiver notification is best effort', {
  skip: process.platform !== 'linux',
}, async (t) => {
  const receiver = await createImplementationControlWakeReceiver(scope);
  t.after(() => receiver.close());
  await assert.rejects(createImplementationControlWakeReceiver(scope),
    (error) => error.code === 'WAKE_BIND_FAILED');
  await receiver.close();
  assert.deepEqual(await notifyImplementationControlWake({ ...scope, requestId: 'stop_54' }),
    { notified: false });
});
