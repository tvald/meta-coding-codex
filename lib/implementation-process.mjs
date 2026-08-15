import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { authorizeImplementationOperation } from './implementation-activation.mjs';
import { assertImplementationEffectCapability } from './implementation-effect-capability.mjs';
import {
  IMPLEMENTATION_PROVIDER_LIMITS,
} from './implementation-provider.mjs';
import {
  canonicalDigest,
  sha256Digest,
  validateControllerId,
  validateBinding,
  validateTimestamp,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_PROCESS_VERSION = 1;

export class ImplementationProcessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationProcessError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationProcessError(code, message);
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') ||
      !path.isAbsolute(value) || path.normalize(value) !== value) {
    fail('PROCESS_INPUT_INVALID', `${label} must be one normalized absolute path`);
  }
}

function processStat(pid) {
  const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const close = text.lastIndexOf(')');
  if (close < 2) fail('PROCESS_IDENTITY_UNAVAILABLE', 'Linux process identity is malformed');
  const tail = text.slice(close + 2).trim().split(/\s+/u);
  if (tail.length < 20) fail('PROCESS_IDENTITY_UNAVAILABLE', 'Linux process identity is incomplete');
  const pgrp = Number(tail[2]);
  const startTime = tail[19];
  if (!Number.isSafeInteger(pgrp) || pgrp < 1 || !/^[0-9]+$/u.test(startTime)) {
    fail('PROCESS_IDENTITY_UNAVAILABLE', 'Linux process identity is invalid');
  }
  return Object.freeze({ pid, pgrp, startTime,
    startIdentityDigest: canonicalDigest({ schemaVersion: 1, pid, startTime }) });
}

function groupMembers(pgrp) {
  const members = [];
  let entries;
  try { entries = fs.readdirSync('/proc'); } catch {
    return Object.freeze({ complete: false, members: Object.freeze([]) });
  }
  for (const entry of entries) {
    if (!/^[1-9][0-9]*$/u.test(entry)) continue;
    try {
      const observed = processStat(Number(entry));
      if (observed.pgrp === pgrp) members.push(Object.freeze({
        pid: observed.pid,
        startIdentityDigest: observed.startIdentityDigest,
      }));
    } catch {
      // Processes can disappear while /proc is scanned. This is an expected race;
      // the resulting evidence remains explicitly incomplete.
    }
  }
  members.sort((left, right) => left.pid - right.pid);
  return Object.freeze({ complete: false, members: Object.freeze(members) });
}

const FINAL_RESULT_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW |
  fs.constants.O_NONBLOCK |
  (fs.constants.O_CLOEXEC ?? 0);

function finalResultStat(fd) {
  let stats;
  try { stats = fs.fstatSync(fd, { bigint: true }); } catch {
    fail('FINAL_RESULT_UNSAFE', 'provider final result descriptor could not be inspected');
  }
  const effectiveUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  const unsafeMode = (stats.mode & 0o7022n) !== 0n;
  if (effectiveUid === null || !stats.isFile() || stats.uid !== effectiveUid || unsafeMode ||
      stats.nlink !== 1n || stats.size < 0n ||
      stats.size > BigInt(IMPLEMENTATION_PROVIDER_LIMITS.modelResultBytes)) {
    fail('FINAL_RESULT_UNSAFE',
      'provider final result is not one bounded owner-held regular file');
  }
  return stats;
}

function sameFinalResultStat(left, right) {
  return ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((field) => left[field] === right[field]);
}

function sameFinalResultObject(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function openFinalResult(finalOutputPath, missingIsNull) {
  try {
    return fs.openSync(finalOutputPath, FINAL_RESULT_OPEN_FLAGS);
  } catch (error) {
    if (missingIsNull && error?.code === 'ENOENT') return null;
    fail('FINAL_RESULT_UNSAFE', 'provider final result could not be opened safely');
  }
}

/**
 * Reads the provider's final result only from one protected descriptor. The optional
 * observer exists for deterministic race tests and receives no descriptor or mutable
 * process state.
 */
export function readProtectedFinalResult(finalOutputPath, { afterRead = null } = {}) {
  absolutePath(finalOutputPath, 'provider final output path');
  if (afterRead !== null && typeof afterRead !== 'function') {
    fail('PROCESS_INPUT_INVALID', 'provider final result observer must be a function');
  }
  const fd = openFinalResult(finalOutputPath, true);
  if (fd === null) return null;
  try {
    const before = finalResultStat(fd);
    const size = Number(before.size);
    const readExact = () => {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const count = fs.readSync(fd, bytes, offset, size - offset, offset);
        if (count < 1) fail('FINAL_RESULT_UNSAFE', 'provider final result changed during read');
        offset += count;
      }
      const overflowProbe = Buffer.alloc(1);
      if (fs.readSync(fd, overflowProbe, 0, 1, size) !== 0) {
        fail('FINAL_RESULT_UNSAFE', 'provider final result grew during read');
      }
      return bytes;
    };
    const bytes = readExact();
    if (afterRead !== null) {
      const observed = afterRead(Object.freeze({ finalOutputPath }));
      if (observed !== undefined) {
        fail('PROCESS_INPUT_INVALID', 'provider final result observer must be synchronous');
      }
    }
    if (!bytes.equals(readExact())) {
      fail('FINAL_RESULT_UNSAFE', 'provider final result bytes changed during read');
    }
    const after = finalResultStat(fd);
    if (!sameFinalResultStat(before, after)) {
      fail('FINAL_RESULT_UNSAFE', 'provider final result identity changed during read');
    }

    // Re-open the name after the descriptor read so an atomic path substitution cannot
    // make bytes from an unlinked object look like the current provider result.
    const currentFd = openFinalResult(finalOutputPath, false);
    try {
      const current = finalResultStat(currentFd);
      if (!sameFinalResultObject(after, current) || !sameFinalResultStat(after, current)) {
        fail('FINAL_RESULT_UNSAFE', 'provider final result path changed during read');
      }
    } finally {
      fs.closeSync(currentFd);
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function boundedPush(chunks, chunk, state, maximum, stream) {
  const bytes = Buffer.from(chunk);
  if (state.overflow) return;
  if (bytes.length > maximum - state.bytes) {
    state.overflow = true;
    return;
  }
  state.bytes += bytes.length;
  chunks.push(bytes);
}

function signalGroup(pgrp, signal) {
  try { process.kill(-pgrp, signal); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function activationMatchesBinding(receipt, binding) {
  return ['runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion',
    'capsuleDigest', 'controlGeneration', 'correctionGeneration']
    .every((field) => receipt?.binding?.[field] === binding[field]);
}

function requireActivation(operationKind, receipt, current, activationNow, binding, message) {
  const authorization = authorizeImplementationOperation({
    operationKind,
    receipt,
    current,
    now: activationNow,
  });
  if (authorization.authorized !== true || !activationMatchesBinding(receipt, binding)) {
    fail('ACTIVATION_REQUIRED', message);
  }
}

function exactSignalAuthorization(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = ['activationContext', 'activationNow', 'activationReceipt', 'effectCapability'];
  return actual.length === expected.length &&
    actual.every((field, index) => field === expected[index]);
}

async function authorizeSignalBoundary({
  authorizer,
  fallback,
  boundary,
  binding,
}) {
  let authorization = fallback;
  if (authorizer !== null) {
    try {
      authorization = await authorizer(boundary);
    } catch {
      fail('ACTIVATION_REQUIRED', 'signal authorizer did not grant current signal activation');
    }
  }
  if (!exactSignalAuthorization(authorization)) {
    fail('ACTIVATION_REQUIRED', 'signal authorizer did not return exact activation evidence');
  }
  requireActivation('signal', authorization.activationReceipt,
    authorization.activationContext, authorization.activationNow, binding,
    'signal boundary requires current signal activation');
  try {
    assertImplementationEffectCapability(authorization.effectCapability, 'signal');
  } catch {
    fail('ACTIVATION_REQUIRED', 'signal boundary requires a protected signal capability');
  }
}

function sameExpectedIdentity(received, expected) {
  if (received === null || typeof received !== 'object' || Array.isArray(received)) return false;
  const keys = Object.keys(received).sort();
  const expectedKeys = ['launcherConnectionId', 'processDomainId', 'processIdentityDigest'];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    expectedKeys.every((field) => received[field] === expected[field]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Creates an activation-gated local spawn seam. The returned spawn function resolves
 * only after the detached process' Linux start identity has been captured. Its handle
 * keeps wait, observation, and interrupt operations bound to that immutable identity.
 *
 * Linux process-group scans remain intentionally incomplete: without the future
 * pidfd/cgroup compatibility gate they cannot prove that a descendant did not escape,
 * even when a scan observes zero members.
 */
export function createLocalImplementationProcessHandleLauncher({
  binding,
  requestId,
  launcherConnectionId,
  processDomainId,
  deadlineAt,
  finalOutputPath,
  termGraceMs = 250,
  now = () => Date.now(),
  activationReceipt = null,
  activationContext = null,
  activationNow = null,
  effectCapability = null,
  autoSignalAuthorizer = null,
  finalResultReadObserver = null,
} = {}) {
  try {
    validateBinding(binding, 'process launch binding');
    validateControllerId(requestId, 'process request ID');
    validateControllerId(launcherConnectionId, 'launcher connection ID');
    validateControllerId(processDomainId, 'process domain ID');
    validateTimestamp(deadlineAt, 'process deadline');
  } catch (error) {
    fail('PROCESS_INPUT_INVALID', error.message);
  }
  absolutePath(finalOutputPath, 'provider final output path');
  if (!Number.isSafeInteger(termGraceMs) || termGraceMs < 1 || termGraceMs > 30_000 ||
      typeof now !== 'function' ||
      (autoSignalAuthorizer !== null && typeof autoSignalAuthorizer !== 'function') ||
      (finalResultReadObserver !== null && typeof finalResultReadObserver !== 'function')) {
    fail('PROCESS_INPUT_INVALID', 'process deadline configuration is invalid');
  }

  return async function spawnHandle({ executable, args, options, stdin } = {}) {
    requireActivation('provider_launch', activationReceipt, activationContext, activationNow,
      binding, 'local process launch requires current provider launch activation');
    try {
      assertImplementationEffectCapability(effectCapability, 'provider_launch');
    } catch {
      fail('ACTIVATION_REQUIRED', 'local process launch requires a protected capability');
    }
    absolutePath(executable, 'provider executable');
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string') ||
        options?.detached !== true || options?.shell !== false ||
        typeof options.cwd !== 'string' || !Buffer.isBuffer(stdin)) {
      fail('PROCESS_INPUT_INVALID', 'provider process plan is invalid');
    }
    const deadlineMs = Date.parse(deadlineAt);
    const remaining = deadlineMs - now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      fail('PROCESS_DEADLINE_EXPIRED', 'provider process deadline has expired');
    }

    return await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(executable, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        reject(new ImplementationProcessError('PROCESS_SPAWN_FAILED', error.message));
        return;
      }
      const stdoutChunks = [];
      const stderrChunks = [];
      const stdoutState = { bytes: 0, overflow: false };
      const stderrState = { bytes: 0, overflow: false };
      let identity = null;
      let expectation = null;
      let spawnSettled = false;
      let closed = false;
      let closeObservation = null;
      let processError = null;
      let captureSettled = false;
      let interruptPromise = null;
      let deadlineTimer = null;
      let waitBoundTimer = null;
      let automaticSignalPromise = null;
      let captureResolve;
      let captureReject;
      let closeResolve;
      const capturePromise = new Promise((captureResolved, captureRejected) => {
        captureResolve = captureResolved;
        captureReject = captureRejected;
      });
      // A caller may use only observe/interrupt. Keep a later terminal capture failure
      // available to wait() without creating an ambient unhandled rejection.
      capturePromise.catch(() => {});
      const closePromise = new Promise((closeResolved) => { closeResolve = closeResolved; });

      const settleCaptureFailure = (error) => {
        if (captureSettled) return;
        captureSettled = true;
        captureReject(error);
      };

      const assertExpected = (received) => {
        if (!sameExpectedIdentity(received, expectation)) {
          fail('PROCESS_HANDLE_MISMATCH', 'process handle expectation does not match the held identity');
        }
      };

      const observeEvidence = () => {
        const scan = groupMembers(identity.pid);
        let leaderChanged = false;
        try {
          const leader = processStat(identity.pid);
          leaderChanged = leader.pgrp !== identity.pid ||
            leader.startIdentityDigest !== identity.startIdentityDigest;
        } catch {
          // A missing leader can coexist with remaining group members. The incomplete
          // group scan below deliberately preserves that ambiguity.
        }
        return Object.freeze({
          schemaVersion: IMPLEMENTATION_PROCESS_VERSION,
          processDomainId,
          launcherConnectionId,
          processIdentityDigest: identity.processIdentityDigest,
          state: leaderChanged ? 'unknown' : scan.members.length === 0 ? 'empty' : 'running',
          descendantsComplete: false,
          members: scan.members,
          observedAt: new Date(now()).toISOString(),
        });
      };

      const signalExact = (signal) => {
        let current;
        try {
          current = processStat(identity.pid);
        } catch (error) {
          throw new ImplementationProcessError('PROCESS_IDENTITY_UNAVAILABLE',
            `held process identity cannot be re-observed before ${signal}: ${error.message}`);
        }
        if (current.pgrp !== identity.pid ||
            current.startIdentityDigest !== identity.startIdentityDigest) {
          fail('PROCESS_HANDLE_MISMATCH', `held process identity changed before ${signal}`);
        }
        signalGroup(identity.pid, signal);
      };

      const signalBoundary = (signal, reason) => Object.freeze({
        schemaVersion: IMPLEMENTATION_PROCESS_VERSION,
        binding: Object.freeze({ ...binding }),
        requestId,
        expectation,
        signal,
        reason,
        observedAt: new Date(now()).toISOString(),
      });

      const signalWithAuthorization = async ({ signal, reason, authorizer, fallback }) => {
        await authorizeSignalBoundary({ authorizer, fallback,
          boundary: signalBoundary(signal, reason), binding });
        if (closed) return false;
        signalExact(signal);
        return true;
      };

      const waitForClose = async (milliseconds) => {
        if (closed) return true;
        await Promise.race([closePromise, delay(milliseconds)]);
        return closed;
      };

      const interruptResult = (disposition, signal, code) => Object.freeze({
        disposition,
        signal,
        code,
        terminal: closeObservation,
        processEvidence: observeEvidence(),
      });

      const interrupt = ({
        expected = expectation,
        activationReceipt: signalReceipt = null,
        activationContext: signalContext = null,
        activationNow: signalNow = null,
        effectCapability: signalEffectCapability = null,
        signalAuthorizer = null,
      } = {}) => {
        assertExpected(expected);
        if (signalAuthorizer !== null && typeof signalAuthorizer !== 'function') {
          fail('PROCESS_INPUT_INVALID', 'signal authorizer must be a function');
        }
        if (interruptPromise !== null) return interruptPromise;
        if (closed) {
          interruptPromise = Promise.resolve(
            interruptResult('already_exited', null, 'PROCESS_ALREADY_EXITED'));
          return interruptPromise;
        }
        clearTimeout(deadlineTimer);
        const fallback = Object.freeze({
          activationReceipt: signalReceipt,
          activationContext: signalContext,
          activationNow: signalNow,
          effectCapability: signalEffectCapability,
        });
        let termSignalIssued = false;
        const operation = (async () => {
          try {
            termSignalIssued = await signalWithAuthorization({
              signal: 'SIGTERM', reason: 'operator_interrupt',
              authorizer: signalAuthorizer, fallback });
          } catch (error) {
            if (error?.code === 'ACTIVATION_REQUIRED') throw error;
            if (await waitForClose(termGraceMs)) {
              return interruptResult('already_exited', null, 'PROCESS_ALREADY_EXITED');
            }
            return interruptResult('ambiguous', null, 'PROCESS_IDENTITY_UNPROVED');
          }
          if (closed) {
            return interruptResult('already_exited', null, 'PROCESS_ALREADY_EXITED');
          }
          if (await waitForClose(termGraceMs)) {
            return interruptResult('interrupted', 'SIGTERM', 'PROCESS_INTERRUPTED');
          }
          try {
            await signalWithAuthorization({ signal: 'SIGKILL', reason: 'operator_escalation',
              authorizer: signalAuthorizer, fallback });
          } catch (error) {
            if (error?.code === 'ACTIVATION_REQUIRED') {
              return interruptResult('ambiguous', 'SIGTERM',
                'PROCESS_SIGNAL_AUTHORIZATION_REQUIRED');
            }
            if (await waitForClose(termGraceMs)) {
              return interruptResult('interrupted', 'SIGTERM', 'PROCESS_INTERRUPTED');
            }
            return interruptResult('ambiguous', null, 'PROCESS_IDENTITY_UNPROVED');
          }
          if (closed) {
            return interruptResult('interrupted', 'SIGTERM', 'PROCESS_INTERRUPTED');
          }
          if (!await waitForClose(termGraceMs)) {
            return interruptResult('ambiguous', 'SIGKILL', 'PROCESS_TERMINATION_UNPROVED');
          }
          return interruptResult('interrupted', 'SIGKILL', 'PROCESS_INTERRUPTED');
        })();
        interruptPromise = operation;
        operation.catch(() => {
          if (!termSignalIssued && interruptPromise === operation) interruptPromise = null;
        });
        return interruptPromise;
      };

      const beginAutomaticSignals = (reason, signals) => {
        if (automaticSignalPromise !== null || closed) return automaticSignalPromise;
        automaticSignalPromise = (async () => {
          for (let index = 0; index < signals.length; index += 1) {
            const signal = signals[index];
            try {
              const sent = await signalWithAuthorization({ signal, reason,
                authorizer: autoSignalAuthorizer, fallback: null });
              if (!sent) return;
            } catch (error) {
              const code = error?.code === 'ACTIVATION_REQUIRED'
                ? 'PROCESS_SIGNAL_AUTHORIZATION_REQUIRED'
                : 'PROCESS_IDENTITY_UNPROVED';
              settleCaptureFailure(new ImplementationProcessError(code,
                `automatic ${reason} signal was not authorized for the exact current process`));
              return;
            }
            if (index < signals.length - 1 && await waitForClose(termGraceMs)) return;
          }
        })();
        automaticSignalPromise.catch((error) => settleCaptureFailure(error));
        return automaticSignalPromise;
      };

      const abortForOverflow = (stream) => {
        if (!stdoutState.overflow && !stderrState.overflow) return;
        void beginAutomaticSignals(`${stream}_overflow`, ['SIGKILL']);
      };
      child.stdout.on('data', (chunk) => {
        boundedPush(stdoutChunks, chunk, stdoutState,
          IMPLEMENTATION_PROVIDER_LIMITS.jsonlBytes, 'stdout');
        abortForOverflow('stdout');
      });
      child.stderr.on('data', (chunk) => {
        boundedPush(stderrChunks, chunk, stderrState,
          IMPLEMENTATION_PROVIDER_LIMITS.stderrBytes, 'stderr');
        abortForOverflow('stderr');
      });
      child.on('error', (error) => {
        processError = new ImplementationProcessError('PROCESS_SPAWN_FAILED', error.message);
        if (!spawnSettled) {
          spawnSettled = true;
          reject(processError);
        }
      });
      child.on('close', (exitCode, signal) => {
        if (closed) return;
        closed = true;
        clearTimeout(deadlineTimer);
        clearTimeout(waitBoundTimer);
        closeObservation = Object.freeze({ exitCode, signal: exitCode === null ? signal : null });
        closeResolve(closeObservation);
        if (!spawnSettled) {
          spawnSettled = true;
          reject(processError ?? new ImplementationProcessError('PROCESS_IDENTITY_UNAVAILABLE',
            'provider process exited before its start identity was captured'));
        }
        if (identity === null) return;
        if (stdoutState.overflow || stderrState.overflow) {
          settleCaptureFailure(new ImplementationProcessError('PROCESS_OUTPUT_LIMIT',
            'provider process exceeded its aggregate stream bound'));
          return;
        }
        if (exitCode === null && !['SIGINT', 'SIGTERM', 'SIGKILL'].includes(signal)) {
          settleCaptureFailure(new ImplementationProcessError('PROCESS_SIGNAL_UNSUPPORTED',
            'provider process exited under an unsupported signal'));
          return;
        }
        try {
          const finalResultBytes = readProtectedFinalResult(finalOutputPath, {
            afterRead: finalResultReadObserver,
          });
          const stdout = Buffer.concat(stdoutChunks, stdoutState.bytes);
          const stderr = Buffer.concat(stderrChunks, stderrState.bytes);
          const scan = groupMembers(child.pid);
          const observedAt = new Date(now()).toISOString();
          const capture = {
            stdoutChunks: Object.freeze(stdoutChunks),
            stderrChunks: Object.freeze(stderrChunks),
            finalResultBytes,
            terminalObservation: Object.freeze({
              requestId,
              launcherConnectionId,
              processDomainId,
              processIdentityDigest: identity.processIdentityDigest,
              exitCode,
              signal: exitCode === null ? signal : null,
              stdoutDigest: sha256Digest(stdout),
              stderrDigest: sha256Digest(stderr),
              modelResultDigest: finalResultBytes === null ? null : sha256Digest(finalResultBytes),
            }),
            processEvidence: Object.freeze({
              schemaVersion: IMPLEMENTATION_PROCESS_VERSION,
              processDomainId,
              launcherConnectionId,
              processIdentityDigest: identity.processIdentityDigest,
              state: scan.members.length === 0 ? 'empty' : 'running',
              descendantsComplete: false,
              members: scan.members,
              observedAt,
            }),
          };
          if (!captureSettled) {
            captureSettled = true;
            captureResolve(Object.freeze(capture));
          }
        } catch (error) {
          settleCaptureFailure(error);
        }
      });
      child.once('spawn', () => {
        if (spawnSettled) return;
        let observed;
        try {
          observed = processStat(child.pid);
          if (observed.pgrp !== child.pid) {
            throw new Error('detached process group was not established');
          }
        } catch (error) {
          spawnSettled = true;
          // No process-domain identity exists here, so no exact signal capability can
          // be constructed. Preserve the process as ambiguous for external recovery.
          reject(new ImplementationProcessError('PROCESS_IDENTITY_UNAVAILABLE', error.message));
          return;
        }
        const processIdentityDigest = canonicalDigest({
          schemaVersion: IMPLEMENTATION_PROCESS_VERSION,
          processDomainId,
          launcherConnectionId,
          pid: child.pid,
          startIdentityDigest: observed.startIdentityDigest,
        });
        identity = Object.freeze({
          schemaVersion: IMPLEMENTATION_PROCESS_VERSION,
          requestId,
          launcherConnectionId,
          processDomainId,
          pid: child.pid,
          startIdentityDigest: observed.startIdentityDigest,
          processIdentityDigest,
          startedAt: new Date(now()).toISOString(),
        });
        expectation = Object.freeze({
          launcherConnectionId,
          processDomainId,
          processIdentityDigest,
        });
        deadlineTimer = setTimeout(() => {
          if (closed) return;
          void beginAutomaticSignals('deadline', ['SIGTERM', 'SIGKILL']);
        }, Math.min(remaining, 2_147_483_647));
        waitBoundTimer = setTimeout(() => {
          if (!closed) {
            settleCaptureFailure(new ImplementationProcessError('PROCESS_WAIT_TIMEOUT',
              'provider process did not close within its bounded deadline termination window'));
          }
        }, Math.min(remaining + (2 * termGraceMs), 2_147_483_647));
        child.stdin.on('error', () => { /* close/error is authoritative */ });
        child.stdin.end(stdin);
        spawnSettled = true;
        resolve(Object.freeze({
          identity,
          expectation,
          async wait(expected = expectation) {
            assertExpected(expected);
            return await capturePromise;
          },
          async observe(expected = expectation) {
            assertExpected(expected);
            return observeEvidence();
          },
          interrupt,
        }));
      });
    });
  };
}

/**
 * Compatibility adapter for the original await-to-completion launcher contract.
 */
export function createLocalImplementationProcessLauncher(options = {}) {
  const spawnHandle = createLocalImplementationProcessHandleLauncher(options);
  return async function launch(invocation) {
    const handle = await spawnHandle(invocation);
    return await handle.wait(handle.expectation);
  };
}
