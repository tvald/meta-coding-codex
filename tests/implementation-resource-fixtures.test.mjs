import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalDigest } from '../lib/implementation-protocol.mjs';
import { planDispatch } from '../lib/implementation-scheduler.mjs';
import {
  deriveResourceNamespace,
  evaluateCollisionEvidence,
  resourceCleanupAuthorizesEffect,
} from '../lib/implementation-verification.mjs';

const NOW = '2026-08-15T12:00:00Z';
const digest = (label) => canonicalDigest({ label });
const binding = Object.freeze({
  runId: 'run_resource_fixtures', epoch: 1, snapshotRevision: 4,
  taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 8,
  capsuleDigest: digest('capsule'), controlGeneration: 0, correctionGeneration: 0,
});

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) =>
    error === undefined ? resolve() : reject(error)));
}

function assignment(assignmentId, resources) {
  return {
    assignmentId,
    role: 'implementer',
    generation: 1,
    dependencies: [],
    ownership: { writePaths: [`fixtures/${assignmentId}`], readPaths: [] },
    resources,
  };
}

function allocationReceipt({ attemptId, resourceKey, ownershipTokenDigest,
  observedIdentityDigest = ownershipTokenDigest }) {
  return {
    schemaVersion: 1,
    receiptId: `receipt_${attemptId}`,
    binding,
    attemptId,
    resourceKey,
    action: 'allocate',
    ownershipTokenDigest,
    observedIdentityDigest,
    outcome: 'succeeded',
    evidence: [],
    observedAt: NOW,
  };
}

test('ephemeral ports overlap while a corroborated fixed-port collision serializes only that key',
  async (t) => {
    const first = net.createServer();
    const second = net.createServer();
    t.after(async () => {
      for (const server of [first, second]) {
        if (server.listening) await close(server);
      }
    });
    const [firstPort, secondPort] = await Promise.all([listen(first), listen(second)]);
    assert.notEqual(firstPort, secondPort);

    const collision = net.createServer();
    await assert.rejects(listen(collision, firstPort), (error) => error.code === 'EADDRINUSE');
    await close(first);
    const sequential = net.createServer();
    t.after(async () => { if (sequential.listening) await close(sequential); });
    assert.equal(await listen(sequential, firstPort), firstPort);

    const fixedKey = `tcp:127.0.0.1:${firstPort}`;
    const policy = evaluateCollisionEvidence([{
      resourceKey: fixedKey,
      resourceClass: 'tcp_port',
      kind: 'collision',
      concurrentFailed: true,
      sequentialPassed: true,
      corroborated: true,
    }]);
    assert.deepEqual(policy.serializedKeys, [fixedKey]);
    const planned = planDispatch({
      pending: [
        assignment('fixed_a', [{ key: fixedKey, mode: 'namespaced_write', namespace: 'a' }]),
        assignment('fixed_b', [{ key: fixedKey, mode: 'namespaced_write', namespace: 'b' }]),
        assignment('ephemeral', [{ key: 'tcp:ephemeral', mode: 'namespaced_write',
          namespace: 'attempt_ephemeral' }]),
      ],
      serializedResourceKeys: policy.serializedKeys,
    });
    assert.deepEqual(planned.dispatch, ['ephemeral', 'fixed_a']);
    assert.deepEqual(planned.waiting,
      [{ assignmentId: 'fixed_b', reason: 'ownership_or_resource_conflict' }]);
  });

test('database, cache, and container namespaces coexist and cleanup cannot cross identities',
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-resources-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const classes = ['database:test', 'cache:test', 'container:test'];
    const allocated = [];
    for (const [index, resourceKey] of classes.entries()) {
      for (const suffix of ['a', 'b']) {
        const attemptId = `attempt_${index}_${suffix}`;
        const namespace = deriveResourceNamespace({
          runId: binding.runId,
          assignmentId: `assignment_${index}_${suffix}`,
          attemptId,
          resourceKey,
        });
        const location = path.join(root, namespace);
        await fs.mkdir(location, { mode: 0o700 });
        const identity = digest(`${resourceKey}:${namespace}`);
        await fs.writeFile(path.join(location, 'identity'), `${identity}\n`, { mode: 0o600 });
        allocated.push({ attemptId, resourceKey, namespace, location, identity,
          receipt: allocationReceipt({ attemptId, resourceKey,
            ownershipTokenDigest: identity }) });
      }
    }
    assert.equal(new Set(allocated.map(({ namespace }) => namespace)).size, allocated.length);
    assert.equal((await fs.readdir(root)).length, allocated.length);

    const planned = planDispatch({
      pending: allocated.map((item, index) => assignment(`resource_${index}`, [{
        key: item.resourceKey, mode: 'namespaced_write', namespace: item.namespace,
      }])),
      caps: { background: allocated.length, root: 0 },
    });
    assert.equal(planned.dispatch.length, allocated.length);

    const target = allocated[0];
    const peer = allocated[1];
    const wrongIdentity = {
      attemptId: target.attemptId,
      resourceKey: target.resourceKey,
      ownershipTokenDigest: target.identity,
      observedIdentityDigest: peer.identity,
      processDomainEmpty: true,
    };
    assert.equal(resourceCleanupAuthorizesEffect({ receipt: target.receipt,
      currentBinding: binding, expected: wrongIdentity }), false);
    assert.equal((await fs.stat(target.location)).isDirectory(), true);
    assert.equal((await fs.stat(peer.location)).isDirectory(), true);

    const exact = { ...wrongIdentity, observedIdentityDigest: target.identity };
    assert.equal(resourceCleanupAuthorizesEffect({ receipt: target.receipt,
      currentBinding: binding, expected: exact }), true);
    await fs.rm(target.location, { recursive: true });
    await assert.rejects(fs.stat(target.location), (error) => error.code === 'ENOENT');
    assert.equal((await fs.stat(peer.location)).isDirectory(), true);

    for (const item of allocated.slice(1)) {
      assert.equal(resourceCleanupAuthorizesEffect({ receipt: item.receipt,
        currentBinding: binding,
        expected: { attemptId: item.attemptId, resourceKey: item.resourceKey,
          ownershipTokenDigest: item.identity, observedIdentityDigest: item.identity,
          processDomainEmpty: true } }), true);
      await fs.rm(item.location, { recursive: true });
    }
    assert.deepEqual(await fs.readdir(root), []);
  });
