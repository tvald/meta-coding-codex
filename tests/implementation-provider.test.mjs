import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_ENVIRONMENT_ALLOWLIST,
  CODEX_EXEC_ADAPTER,
  CODEX_EXECUTABLE_VERSION,
  ImplementationProviderError,
  classifyProcessDomain,
  createCodexJsonlCollector,
  executeCodexExecPlan,
  initialProviderTerminalState,
  observeProviderTerminal,
  parseWorkerResult,
  planCodexExecLaunch,
  planProcessInterrupt,
  sanitizeCodexEnvironment,
  validateCodexExecutableIdentity,
  validateLaunchRequest,
} from '../lib/implementation-provider.mjs';
import {
  IMPLEMENTATION_ACTIVATION_DISPOSITION,
} from '../lib/implementation-activation.mjs';
import { canonicalDigest, sha256Digest } from '../lib/implementation-protocol.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const prompt = Buffer.from('Perform one bounded implementation assignment.', 'utf8');
const environment = {
  PATH: '/usr/bin:/bin',
  HOME: '/controller-home',
  CODEX_HOME: '/controller-codex',
  LANG: 'C.UTF-8',
  OPENAI_API_KEY: 'DO_NOT_INHERIT',
  CODEX_CONTROLLER_DESCRIPTOR: 'DO_NOT_EXPOSE',
  npm_config_token: 'DO_NOT_INHERIT',
};
const sanitizedEnvironment = sanitizeCodexEnvironment(environment);

function binding(overrides = {}) {
  return {
    runId: 'run_0054',
    epoch: 1,
    snapshotRevision: 3,
    taskId: 'T-0054',
    taskRevision: 2,
    taskRecordVersion: 5,
    capsuleDigest: digest('a'),
    controlGeneration: 0,
    correctionGeneration: 0,
    ...overrides,
  };
}

function launchRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: 'request_1',
    jobId: 'job_1',
    binding: binding(),
    assignmentId: 'assignment_1',
    attemptId: 'attempt_1',
    role: 'implementer',
    providerAdapter: CODEX_EXEC_ADAPTER,
    executableVersion: CODEX_EXECUTABLE_VERSION,
    cwdIdentity: digest('b'),
    baseTree: '1'.repeat(40),
    profileDigest: digest('c'),
    promptDigest: sha256Digest(prompt),
    outputSchemaDigest: digest('d'),
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    network: false,
    nestedAgents: false,
    environmentDigest: canonicalDigest(sanitizedEnvironment),
    deadlineAt: '2026-08-14T12:00:00Z',
    ...overrides,
  };
}

function executableIdentity(overrides = {}) {
  return {
    schemaVersion: 1,
    adapter: CODEX_EXEC_ADAPTER,
    requestedPath: '/opt/codex/bin/codex',
    executableRealpath: '/opt/codex/bin/codex',
    version: CODEX_EXECUTABLE_VERSION,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return planCodexExecLaunch({
    request: launchRequest(),
    executableIdentity: executableIdentity(),
    cwd: { realpath: '/worktrees/attempt_1', identity: digest('b') },
    outputSchema: { path: '/ledger/schema/worker-result.json', digest: digest('d') },
    finalOutputPath: '/ledger/spool/job_1/final.json',
    prompt,
    environment,
    ...overrides,
  });
}

function workerResult(overrides = {}) {
  return {
    schemaVersion: 1,
    disposition: 'completed',
    summary: 'Implemented the assigned slice.',
    changedPathsClaim: ['lib/example.mjs'],
    checks: [{ id: 'unit', outcome: 'pass', evidenceDigest: digest('e') }],
    findings: [],
    risks: [],
    knowledgeProposals: [],
    followUp: [],
    ...overrides,
  };
}

function terminal(finalBytes, overrides = {}) {
  return {
    requestId: 'request_1',
    launcherConnectionId: 'launcher_1',
    processDomainId: 'domain_1',
    processIdentityDigest: digest('f'),
    exitCode: 0,
    signal: null,
    stdoutDigest: sha256Digest(Buffer.from('{"type":"turn.completed"}\n')),
    stderrDigest: sha256Digest(Buffer.alloc(0)),
    modelResultDigest: sha256Digest(finalBytes),
    ...overrides,
  };
}

function processExpectation() {
  return {
    processDomainId: 'domain_1',
    launcherConnectionId: 'launcher_1',
    processIdentityDigest: digest('f'),
  };
}

function processEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    ...processExpectation(),
    state: 'running',
    descendantsComplete: true,
    members: [
      { pid: 101, startIdentityDigest: digest('1') },
      { pid: 102, startIdentityDigest: digest('2') },
    ],
    observedAt: '2026-08-14T11:00:00Z',
    ...overrides,
  };
}

function emptyProcessEvidence(overrides = {}) {
  return processEvidence({ state: 'empty', members: [], ...overrides });
}

function activationReceipt(overrides = {}) {
  const { snapshotRevision: _snapshotRevision, ...activationBinding } = binding();
  return {
    schemaVersion: 1,
    receiptId: 'activation_provider_launch',
    effectKind: 'provider_launch',
    binding: activationBinding,
    policyDigest: digest('7'),
    evidenceDigest: digest('8'),
    mechanism: { ...IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism },
    issuedAt: '2026-08-14T10:00:00Z',
    expiresAt: '2026-08-14T10:15:00Z',
    taskApproval: null,
    ...overrides,
  };
}

function activationContext(value, overrides = {}) {
  return {
    receiptId: value.receiptId,
    binding: { ...value.binding },
    policyDigest: value.policyDigest,
    evidenceDigest: value.evidenceDigest,
    mechanism: { ...value.mechanism },
    taskApproval: null,
    ...overrides,
  };
}

test('Codex launch plan closes version, cwd, sandbox, schema, argv, and environment', () => {
  const value = plan();
  assert.equal(value.executable, '/opt/codex/bin/codex');
  assert.equal(value.cwd, '/worktrees/attempt_1');
  assert.equal(value.process.shell, false);
  assert.equal(value.process.detached, true);
  assert.deepEqual(Object.keys(value.env).sort(), ['CODEX_HOME', 'HOME', 'LANG', 'PATH']);
  assert.deepEqual(Object.keys(value.env).every((name) => CODEX_ENVIRONMENT_ALLOWLIST.includes(name)), true);
  assert.doesNotMatch(JSON.stringify(value.env), /DO_NOT_INHERIT|DO_NOT_EXPOSE/u);
  assert.deepEqual(value.args, [
    'exec', '--strict-config', '--ignore-user-config', '--ignore-rules',
    '--cd', '/worktrees/attempt_1', '--sandbox', 'workspace-write',
    '--config', 'approval_policy="never"',
    '--config', 'sandbox_workspace_write.network_access=false',
    '--config', 'web_search="disabled"', '--disable', 'multi_agent', '--json',
    '--color', 'never', '--output-schema', '/ledger/schema/worker-result.json',
    '--output-last-message', '/ledger/spool/job_1/final.json', '--ephemeral', '-',
  ]);

  assert.throws(() => validateLaunchRequest(launchRequest({ executableVersion: '0.148.0' })),
    (error) => error instanceof ImplementationProviderError &&
      error.code === 'EXECUTABLE_VERSION_UNSUPPORTED');
  assert.throws(() => validateLaunchRequest(launchRequest({ role: 'root' })), /role is unsupported/u);
  assert.throws(() => validateLaunchRequest(launchRequest({ network: true })), /closed offline policy/u);
  assert.throws(() => plan({ cwd: { realpath: '/worktrees/other', identity: digest('9') } }),
    /cwd identity is stale/u);
  assert.throws(() => plan({ outputSchema: { path: '/ledger/schema/worker-result.json', digest: digest('9') } }),
    /schema digest is stale/u);
});

test('Codex executable identity must be one absolute resolved realpath at 0.147.0', () => {
  assert.equal(validateCodexExecutableIdentity(executableIdentity()).version, '0.147.0');
  assert.throws(() => validateCodexExecutableIdentity(executableIdentity({
    requestedPath: '/usr/local/bin/codex',
  })), /resolved realpath/u);
  assert.throws(() => validateCodexExecutableIdentity(executableIdentity({
    requestedPath: 'codex', executableRealpath: 'codex',
  })), /normalized absolute path/u);
});

test('JSONL collection is bounded, fatal UTF-8, object-only, and single-use', () => {
  const collector = createCodexJsonlCollector({ maxBytes: 128, maxLineBytes: 64, maxMessages: 2 });
  collector.push(Buffer.from('{"type":"turn.started"}\n'));
  collector.push(Buffer.from('{"type":"turn.completed"}\n'));
  assert.deepEqual(collector.finish(), [
    { type: 'turn.started' }, { type: 'turn.completed' },
  ]);
  assert.throws(() => collector.finish(), /already closed/u);

  const invalid = createCodexJsonlCollector();
  invalid.push(Buffer.from([0xc3, 0x28]));
  assert.throws(() => invalid.finish(), (error) => error.code === 'UTF8_INVALID');

  const oversized = createCodexJsonlCollector({ maxBytes: 3 });
  assert.throws(() => oversized.push('four'), (error) => error.code === 'STREAM_LIMIT');

  const scalar = createCodexJsonlCollector();
  scalar.push('[]\n');
  assert.throws(() => scalar.finish(), /not an object/u);
});

test('typed worker results use a closed bounded diagnostic-only shape', () => {
  assert.deepEqual(parseWorkerResult(JSON.stringify(workerResult())), workerResult());
  assert.throws(() => parseWorkerResult(JSON.stringify({ ...workerResult(), binding: binding() })),
    /unknown or missing fields/u);
  assert.throws(() => parseWorkerResult(JSON.stringify(workerResult({
    changedPathsClaim: ['z.mjs', 'a.mjs'],
  }))), /must be sorted/u);
  assert.throws(() => parseWorkerResult(Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(workerResult())),
  ])), /byte-order mark/u);
  assert.throws(() => parseWorkerResult(Buffer.alloc(128 * 1024 + 1, 0x20)),
    (error) => error.code === 'MODEL_RESULT_LIMIT');
});

test('duplicate terminals no-op while conflicts or live descendants become ambiguous', () => {
  const bytes = Buffer.from(JSON.stringify(workerResult()));
  const first = observeProviderTerminal(initialProviderTerminalState('request_1'), terminal(bytes),
    emptyProcessEvidence());
  assert.equal(first.outcome, 'exited');
  assert.equal(observeProviderTerminal(first, terminal(bytes), emptyProcessEvidence()), first);
  assert.equal(observeProviderTerminal(first, terminal(bytes, { exitCode: 1 }),
    emptyProcessEvidence()).outcome, 'ambiguous');
  assert.equal(observeProviderTerminal(initialProviderTerminalState('request_1'),
    terminal(bytes), processEvidence()).outcome, 'ambiguous');
  assert.throws(() => observeProviderTerminal(first, terminal(bytes, { requestId: 'request_2' }),
    emptyProcessEvidence()),
    /request ID is stale/u);
});

test('process-domain classification and interrupt planning require exact identity and descendants', () => {
  const expected = processExpectation();
  assert.deepEqual(classifyProcessDomain(expected, processEvidence()), {
    state: 'running', empty: false, code: 'PROCESS_DOMAIN_RUNNING',
  });
  assert.deepEqual(planProcessInterrupt({ expected, evidence: processEvidence(), signal: 'SIGKILL' }), {
    disposition: 'signal_required', signal: 'SIGKILL', target: expected,
    code: 'PROCESS_DOMAIN_RUNNING',
  });
  assert.equal(planProcessInterrupt({ expected, evidence: processEvidence({
    state: 'empty', members: [],
  }) }).disposition, 'already_empty');
  assert.equal(planProcessInterrupt({ expected, evidence: processEvidence({
    descendantsComplete: false,
  }) }).disposition, 'reconcile');
  assert.equal(planProcessInterrupt({ expected, evidence: processEvidence({
    processIdentityDigest: digest('9'),
  }) }).code, 'PROCESS_IDENTITY_MISMATCH');
  assert.throws(() => planProcessInterrupt({ expected, evidence: processEvidence(), signal: 'SIGHUP' }),
    /signal is unsupported/u);
});

test('fake launcher cannot run without activation and conforms when explicitly authorized', async () => {
  const value = plan();
  const finalBytes = Buffer.from(JSON.stringify(workerResult()));
  const stdout = Buffer.from('{"type":"turn.completed"}\n');
  let invocation = null;
  const launcher = async (received) => {
    invocation = received;
    return {
      stdoutChunks: [stdout.subarray(0, 8), stdout.subarray(8)],
      stderrChunks: [],
      finalResultBytes: finalBytes,
      terminalObservation: terminal(finalBytes),
      processEvidence: emptyProcessEvidence(),
    };
  };

  await assert.rejects(() => executeCodexExecPlan({ plan: value, launcher }),
    (error) => error.code === 'ACTIVATION_REQUIRED');
  assert.equal(invocation, null);
  const activeReceipt = activationReceipt();
  await assert.rejects(() => executeCodexExecPlan({
    plan: value,
    launcher,
    activationReceipt: activeReceipt,
    activationContext: activationContext(activeReceipt, {
      binding: { ...activeReceipt.binding, epoch: activeReceipt.binding.epoch + 1 },
    }),
    now: '2026-08-14T10:05:00Z',
  }), (error) => error.code === 'ACTIVATION_REQUIRED');
  assert.equal(invocation, null);
  await assert.rejects(() => executeCodexExecPlan({
    plan: value,
    launcher,
    activationReceipt: activeReceipt,
    activationContext: activationContext(activeReceipt),
    now: activeReceipt.expiresAt,
  }), (error) => error.code === 'ACTIVATION_REQUIRED');
  assert.equal(invocation, null);

  const observed = await executeCodexExecPlan({
    plan: value,
    launcher,
    activationReceipt: activeReceipt,
    activationContext: activationContext(activeReceipt),
    now: '2026-08-14T10:05:00Z',
  });
  assert.equal(invocation.executable, '/opt/codex/bin/codex');
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.stdin.toString('utf8'), prompt.toString('utf8'));
  assert.equal(observed.terminal.outcome, 'exited');
  assert.equal(observed.result.disposition, 'completed');
  assert.deepEqual(observed.events, [{ type: 'turn.completed' }]);

  await assert.rejects(() => executeCodexExecPlan({
    plan: value,
    launcher: async () => ({
      stdoutChunks: [stdout],
      stderrChunks: [],
      finalResultBytes: finalBytes,
      terminalObservation: terminal(finalBytes, { stdoutDigest: digest('9') }),
      processEvidence: emptyProcessEvidence(),
    }),
    activationReceipt: activeReceipt,
    activationContext: activationContext(activeReceipt),
    now: '2026-08-14T10:05:00Z',
  }), (error) => error.code === 'STREAM_DIGEST_MISMATCH');

  const failed = await executeCodexExecPlan({
    plan: value,
    launcher: async () => ({
      stdoutChunks: [stdout],
      stderrChunks: [],
      finalResultBytes: null,
      terminalObservation: terminal(finalBytes, { exitCode: 1, modelResultDigest: null }),
      processEvidence: emptyProcessEvidence(),
    }),
    activationReceipt: activeReceipt,
    activationContext: activationContext(activeReceipt),
    now: '2026-08-14T10:05:00Z',
  });
  assert.equal(failed.result, null);
  assert.equal(failed.modelResultDigest, null);
  assert.equal(failed.terminal.outcome, 'exited');
});
