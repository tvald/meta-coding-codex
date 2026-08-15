import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  ImplementationProcessError,
  createLocalImplementationProcessHandleLauncher,
  createLocalImplementationProcessLauncher,
  readProtectedFinalResult,
} = await import('../lib/implementation-process.mjs');
const {
  IMPLEMENTATION_PROVIDER_LIMITS,
  classifyProcessDomain,
} = await import('../lib/implementation-provider.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');
import { IMPLEMENTATION_ACTIVATION_DISPOSITION } from '../lib/implementation-activation.mjs';
import { canonicalDigest } from '../lib/implementation-protocol.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({ runId: 'run_1', epoch: 1, snapshotRevision: 2,
  taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 8, capsuleDigest: digest('a'),
  controlGeneration: 0, correctionGeneration: 0 });

function activation(effectKind = 'provider_launch') {
  const { snapshotRevision: _snapshotRevision, ...activationBinding } = binding;
  const receipt = { schemaVersion: 1, receiptId: `activation_${effectKind}`,
    effectKind, binding: activationBinding, policyDigest: digest('b'),
    evidenceDigest: digest('c'), mechanism: { ...IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism },
    issuedAt: '2026-08-14T10:00:00Z', expiresAt: '2026-08-14T10:15:00Z', taskApproval: null };
  return { activationReceipt: receipt, activationContext: { receiptId: receipt.receiptId,
    binding: { ...receipt.binding }, policyDigest: receipt.policyDigest,
    evidenceDigest: receipt.evidenceDigest, mechanism: { ...receipt.mechanism }, taskApproval: null },
  activationNow: '2026-08-14T10:05:00Z',
  effectCapability: issueSourceInstrumentedEffectCapability(effectKind) };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started >= timeoutMs) throw new Error('fixture condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function future(milliseconds) {
  return new Date(Date.now() + milliseconds).toISOString();
}

function fixture(t, source) {
  const root = mkdtempSync(path.join(tmpdir(), 'implementation-process-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, 'fake.mjs');
  writeFileSync(script, source);
  return { root, script };
}

function launcher(root, overrides = {}) {
  return createLocalImplementationProcessLauncher({
    binding,
    requestId: 'request_1',
    launcherConnectionId: 'launcher_1',
    processDomainId: 'domain_1',
    deadlineAt: future(3_000),
    finalOutputPath: path.join(root, 'final.json'),
    termGraceMs: 50,
    autoSignalAuthorizer: () => activation('signal'),
    ...activation(),
    ...overrides,
  });
}

function invocation(root, script, extra = []) {
  return {
    executable: process.execPath,
    args: [script, path.join(root, 'final.json'), ...extra],
    options: { cwd: root, env: { PATH: process.env.PATH ?? '' }, detached: true, shell: false,
      windowsHide: true },
    stdin: Buffer.from('bounded input', 'utf8'),
  };
}

test('local launcher captures fragmented streams and final bytes but preserves containment ambiguity', async (t) => {
  const { root, script } = fixture(t, `
    import fs from 'node:fs';
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      process.stdout.write('{"type":"turn.');
      setTimeout(() => {
        process.stdout.write('completed"}\\n');
        process.stderr.write('diagnostic');
        fs.writeFileSync(process.argv[2], JSON.stringify({ input }));
      }, 20);
    });
  `);
  const capture = await launcher(root)(invocation(root, script));
  assert.equal(Buffer.concat(capture.stdoutChunks).toString('utf8'),
    '{"type":"turn.completed"}\n');
  assert.equal(Buffer.concat(capture.stderrChunks).toString('utf8'), 'diagnostic');
  assert.deepEqual(JSON.parse(capture.finalResultBytes.toString('utf8')), { input: 'bounded input' });
  assert.equal(capture.terminalObservation.exitCode, 0);
  assert.equal(capture.processEvidence.state, 'empty');
  assert.equal(capture.processEvidence.descendantsComplete, false);
  assert.equal(classifyProcessDomain({
    processDomainId: capture.terminalObservation.processDomainId,
    launcherConnectionId: capture.terminalObservation.launcherConnectionId,
    processIdentityDigest: capture.terminalObservation.processIdentityDigest,
  }, capture.processEvidence).code, 'PROCESS_DOMAIN_UNPROVED');
});

test('protected final-result reads reject links, unsafe mode, and oversized bytes', (t) => {
  const { root } = fixture(t, '');
  const target = path.join(root, 'target.json');
  const final = path.join(root, 'final.json');
  writeFileSync(target, '{"safe":true}', { mode: 0o600 });
  symlinkSync(target, final);
  assert.throws(() => readProtectedFinalResult(final),
    (error) => error instanceof ImplementationProcessError && error.code === 'FINAL_RESULT_UNSAFE');

  rmSync(final);
  linkSync(target, final);
  assert.throws(() => readProtectedFinalResult(final),
    (error) => error.code === 'FINAL_RESULT_UNSAFE');

  rmSync(final);
  writeFileSync(final, '{"writable":true}', { mode: 0o600 });
  chmodSync(final, 0o622);
  assert.throws(() => readProtectedFinalResult(final),
    (error) => error.code === 'FINAL_RESULT_UNSAFE');

  rmSync(final);
  writeFileSync(final, Buffer.alloc(IMPLEMENTATION_PROVIDER_LIMITS.modelResultBytes + 1));
  assert.throws(() => readProtectedFinalResult(final),
    (error) => error.code === 'FINAL_RESULT_UNSAFE');
});

test('protected final-result descriptor detects deterministic path substitution', (t) => {
  const { root } = fixture(t, '');
  const final = path.join(root, 'final.json');
  const displaced = path.join(root, 'displaced.json');
  writeFileSync(final, '{"identity":"original"}', { mode: 0o600 });
  assert.throws(() => readProtectedFinalResult(final, {
    afterRead({ finalOutputPath }) {
      assert.equal(finalOutputPath, final);
      renameSync(final, displaced);
      writeFileSync(final, '{"identity":"replacement"}', { mode: 0o600 });
    },
  }), (error) => error.code === 'FINAL_RESULT_UNSAFE');
});

test('protected final-result descriptor rejects in-place mutation during its bounded read', (t) => {
  const { root } = fixture(t, '');
  const final = path.join(root, 'final.json');
  writeFileSync(final, '{"identity":"original"}', { mode: 0o600 });
  assert.throws(() => readProtectedFinalResult(final, {
    afterRead({ finalOutputPath }) {
      writeFileSync(finalOutputPath, '{"identity":"mutated!"}');
    },
  }), (error) => error.code === 'FINAL_RESULT_UNSAFE');
});

test('two fake executables cross a barrier concurrently', async (t) => {
  const { root, script } = fixture(t, `
    import fs from 'node:fs';
    const [finalPath, own, peer, release] = process.argv.slice(2);
    fs.writeFileSync(own, 'ready');
    const started = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(peer) && fs.existsSync(release)) {
        clearInterval(timer);
        fs.writeFileSync(finalPath, '{"ok":true}');
        process.stdout.write('{"type":"turn.completed"}\\n');
      } else if (Date.now() - started > 1000) {
        clearInterval(timer);
        process.exitCode = 9;
      }
    }, 10);
  `);
  const firstRoot = path.join(root, 'one');
  const secondRoot = path.join(root, 'two');
  mkdirSync(firstRoot);
  mkdirSync(secondRoot);
  const firstReady = path.join(root, 'first.ready');
  const secondReady = path.join(root, 'second.ready');
  const release = path.join(root, 'release');
  const first = createLocalImplementationProcessHandleLauncher({
    binding,
    requestId: 'request_1', launcherConnectionId: 'launcher_1', processDomainId: 'domain_1',
    deadlineAt: future(3_000), finalOutputPath: path.join(firstRoot, 'final.json'), termGraceMs: 50,
    ...activation(),
  });
  const second = createLocalImplementationProcessHandleLauncher({
    binding,
    requestId: 'request_2', launcherConnectionId: 'launcher_2', processDomainId: 'domain_2',
    deadlineAt: future(3_000), finalOutputPath: path.join(secondRoot, 'final.json'), termGraceMs: 50,
    ...activation(),
  });
  const [firstHandle, secondHandle] = await Promise.all([
    first(invocation(firstRoot, script, [firstReady, secondReady, release])),
    second(invocation(secondRoot, script, [secondReady, firstReady, release])),
  ]);
  await waitFor(() => existsSync(firstReady) && existsSync(secondReady));
  const [firstRunning, secondRunning] = await Promise.all([
    firstHandle.observe(firstHandle.expectation),
    secondHandle.observe(secondHandle.expectation),
  ]);
  assert.equal(firstRunning.state, 'running');
  assert.equal(secondRunning.state, 'running');
  assert.equal(firstRunning.descendantsComplete, false);
  assert.equal(secondRunning.descendantsComplete, false);
  writeFileSync(release, 'release');
  const [a, b] = await Promise.all([
    firstHandle.wait(firstHandle.expectation),
    secondHandle.wait(secondHandle.expectation),
  ]);
  assert.equal(a.terminalObservation.exitCode, 0);
  assert.equal(b.terminalObservation.exitCode, 0);
});

test('in-flight handle rejects wrong identity and activation before idempotent TERM-to-KILL stop',
  async (t) => {
    const { root, script } = fixture(t, `
      import fs from 'node:fs';
      const [, ready, termObserved] = process.argv.slice(2);
      process.on('SIGTERM', () => fs.writeFileSync(termObserved, 'term'));
      fs.writeFileSync(ready, 'ready');
      setInterval(() => {}, 1000);
    `);
    const ready = path.join(root, 'ready');
    const termObserved = path.join(root, 'term-observed');
    const spawnHandle = createLocalImplementationProcessHandleLauncher({
      binding,
      requestId: 'request_stop',
      launcherConnectionId: 'launcher_stop',
      processDomainId: 'domain_stop',
      deadlineAt: future(3_000),
      finalOutputPath: path.join(root, 'final.json'),
      termGraceMs: 75,
      ...activation(),
    });
    const handle = await spawnHandle(invocation(root, script, [ready, termObserved]));
    await waitFor(() => existsSync(ready));
    assert.equal(Object.isFrozen(handle.identity), true);
    assert.equal(Object.isFrozen(handle.expectation), true);
    assert.equal(handle.identity.pid > 0, true);
    assert.equal(handle.identity.startIdentityDigest.startsWith('sha256:'), true);
    assert.equal(handle.identity.processIdentityDigest, handle.expectation.processIdentityDigest);
    assert.equal(handle.identity.processIdentityDigest, canonicalDigest({
      schemaVersion: 1,
      processDomainId: handle.identity.processDomainId,
      launcherConnectionId: handle.identity.launcherConnectionId,
      pid: handle.identity.pid,
      startIdentityDigest: handle.identity.startIdentityDigest,
    }));
    const wrong = { ...handle.expectation, processIdentityDigest: digest('9') };
    await assert.rejects(() => handle.observe(wrong),
      (error) => error.code === 'PROCESS_HANDLE_MISMATCH');
    await assert.rejects(async () => handle.interrupt({ expected: wrong, ...activation('signal') }),
      (error) => error.code === 'PROCESS_HANDLE_MISMATCH');
    await assert.rejects(async () => handle.interrupt({
      expected: handle.expectation,
      ...activation(),
    }), (error) => error.code === 'ACTIVATION_REQUIRED');

    const signalActivation = activation('signal');
    const operation = handle.interrupt({ expected: handle.expectation, ...signalActivation });
    const duplicate = handle.interrupt({ expected: handle.expectation });
    assert.equal(duplicate, operation);
    const interrupted = await operation;
    assert.equal(interrupted.disposition, 'interrupted');
    assert.equal(interrupted.signal, 'SIGKILL');
    assert.equal(interrupted.terminal.signal, 'SIGKILL');
    assert.equal(interrupted.processEvidence.state, 'empty');
    assert.equal(interrupted.processEvidence.descendantsComplete, false);
    assert.equal(existsSync(termObserved), true);
    assert.equal(await handle.interrupt({ expected: handle.expectation }), interrupted);
    const capture = await handle.wait(handle.expectation);
    assert.equal(capture.terminalObservation.signal, 'SIGKILL');
    assert.equal(capture.processEvidence.descendantsComplete, false);
    assert.equal(classifyProcessDomain(handle.expectation, capture.processEvidence).code,
      'PROCESS_DOMAIN_UNPROVED');
  });

test('deadline freshly authorizes TERM and KILL before escalating', async (t) => {
  const { root, script } = fixture(t, `
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `);
  const boundaries = [];
  const capture = await launcher(root, {
    deadlineAt: future(100),
    termGraceMs: 50,
    autoSignalAuthorizer(boundary) {
      boundaries.push(boundary);
      return activation('signal');
    },
  })(
    invocation(root, script));
  assert.equal(capture.terminalObservation.exitCode, null);
  assert.equal(capture.terminalObservation.signal, 'SIGKILL');
  assert.equal(capture.finalResultBytes, null);
  assert.deepEqual(boundaries.map(({ signal, reason }) => [signal, reason]), [
    ['SIGTERM', 'deadline'],
    ['SIGKILL', 'deadline'],
  ]);
});

test('stale control at the deadline boundary sends no automatic signal', async (t) => {
  const { root, script } = fixture(t, `
    import fs from 'node:fs';
    const [, done, term] = process.argv.slice(2);
    process.on('SIGTERM', () => fs.writeFileSync(term, 'term'));
    setTimeout(() => { fs.writeFileSync(done, 'done'); process.exit(0); }, 250);
  `);
  const done = path.join(root, 'done');
  const term = path.join(root, 'term');
  const staleAuthorizations = [];
  const spawnHandle = createLocalImplementationProcessHandleLauncher({
    binding,
    requestId: 'request_deadline_stale',
    launcherConnectionId: 'launcher_deadline_stale',
    processDomainId: 'domain_deadline_stale',
    deadlineAt: future(60),
    finalOutputPath: path.join(root, 'final.json'),
    termGraceMs: 40,
    ...activation(),
    autoSignalAuthorizer(boundary) {
      staleAuthorizations.push(boundary);
      const stale = activation('signal');
      return { ...stale, activationContext: { ...stale.activationContext,
        binding: { ...stale.activationContext.binding,
          controlGeneration: stale.activationContext.binding.controlGeneration + 1 } } };
    },
  });
  const handle = await spawnHandle(invocation(root, script, [done, term]));
  await assert.rejects(() => handle.wait(handle.expectation),
    (error) => error.code === 'PROCESS_SIGNAL_AUTHORIZATION_REQUIRED');
  await waitFor(() => existsSync(done));
  assert.equal(existsSync(term), false);
  assert.deepEqual(staleAuthorizations.map(({ signal, reason }) => [signal, reason]), [
    ['SIGTERM', 'deadline'],
  ]);
});

test('stale control at an output-overflow boundary sends no automatic signal', async (t) => {
  const { root, script } = fixture(t, `
    import fs from 'node:fs';
    const [, done] = process.argv.slice(2);
    process.stdout.write(Buffer.alloc(9 * 1024 * 1024, 0x78), () => {
      setTimeout(() => { fs.writeFileSync(done, 'done'); process.exit(0); }, 200);
    });
  `);
  const done = path.join(root, 'done');
  const boundaries = [];
  const spawnHandle = createLocalImplementationProcessHandleLauncher({
    binding,
    requestId: 'request_overflow_stale',
    launcherConnectionId: 'launcher_overflow_stale',
    processDomainId: 'domain_overflow_stale',
    deadlineAt: future(2_000),
    finalOutputPath: path.join(root, 'final.json'),
    termGraceMs: 40,
    ...activation(),
    autoSignalAuthorizer(boundary) {
      boundaries.push(boundary);
      const stale = activation('signal');
      return { ...stale, activationContext: { ...stale.activationContext,
        binding: { ...stale.activationContext.binding,
          controlGeneration: stale.activationContext.binding.controlGeneration + 1 } } };
    },
  });
  const handle = await spawnHandle(invocation(root, script, [done]));
  await assert.rejects(() => handle.wait(handle.expectation),
    (error) => error.code === 'PROCESS_SIGNAL_AUTHORIZATION_REQUIRED');
  await waitFor(() => existsSync(done));
  assert.deepEqual(boundaries.map(({ signal, reason }) => [signal, reason]), [
    ['SIGKILL', 'stdout_overflow'],
  ]);
});

test('explicit TERM-to-KILL escalation reauthorizes and preserves a revoked process', async (t) => {
  const { root, script } = fixture(t, `
    import fs from 'node:fs';
    const [, ready, term] = process.argv.slice(2);
    process.on('SIGTERM', () => {
      fs.writeFileSync(term, 'term');
      setTimeout(() => process.exit(0), 180);
    });
    fs.writeFileSync(ready, 'ready');
    setInterval(() => {}, 1000);
  `);
  const ready = path.join(root, 'ready');
  const term = path.join(root, 'term');
  const spawnHandle = createLocalImplementationProcessHandleLauncher({
    binding,
    requestId: 'request_revoke',
    launcherConnectionId: 'launcher_revoke',
    processDomainId: 'domain_revoke',
    deadlineAt: future(2_000),
    finalOutputPath: path.join(root, 'final.json'),
    termGraceMs: 40,
    ...activation(),
  });
  const handle = await spawnHandle(invocation(root, script, [ready, term]));
  await waitFor(() => existsSync(ready));
  const boundaries = [];
  const interrupted = await handle.interrupt({
    expected: handle.expectation,
    signalAuthorizer(boundary) {
      boundaries.push(boundary);
      const current = activation('signal');
      if (boundary.signal === 'SIGTERM') return current;
      return { ...current, activationContext: { ...current.activationContext,
        binding: { ...current.activationContext.binding,
          controlGeneration: current.activationContext.binding.controlGeneration + 1 } } };
    },
  });
  assert.equal(interrupted.disposition, 'ambiguous');
  assert.equal(interrupted.signal, 'SIGTERM');
  assert.equal(interrupted.code, 'PROCESS_SIGNAL_AUTHORIZATION_REQUIRED');
  assert.equal(existsSync(term), true);
  assert.deepEqual(boundaries.map(({ signal, reason }) => [signal, reason]), [
    ['SIGTERM', 'operator_interrupt'],
    ['SIGKILL', 'operator_escalation'],
  ]);
  const capture = await handle.wait(handle.expectation);
  assert.equal(capture.terminalObservation.exitCode, 0);
});

test('expired deadlines and invalid process plans fail before execution', async (t) => {
  const { root, script } = fixture(t, 'setTimeout(() => {}, 1000);');
  const expired = launcher(root, { deadlineAt: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(expired(invocation(root, script)),
    (error) => error instanceof ImplementationProcessError && error.code === 'PROCESS_DEADLINE_EXPIRED');
  await assert.rejects(launcher(root)({ ...invocation(root, script), executable: 'node' }),
    (error) => error.code === 'PROCESS_INPUT_INVALID');
  const denied = createLocalImplementationProcessLauncher({ binding, requestId: 'request_denied',
    launcherConnectionId: 'launcher_denied', processDomainId: 'domain_denied',
    deadlineAt: future(1_000), finalOutputPath: path.join(root, 'denied.json') });
  await assert.rejects(denied(invocation(root, script)),
    (error) => error.code === 'ACTIVATION_REQUIRED');
});
