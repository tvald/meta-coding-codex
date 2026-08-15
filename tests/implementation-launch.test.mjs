import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { IMPLEMENTATION_ACTIVATION_DISPOSITION } from '../lib/implementation-activation.mjs';
import { buildOrientation } from '../lib/implementation-controller.mjs';
import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const { prepareCodexControllerLaunch } = await import('../lib/implementation-launch.mjs');
const { createLocalImplementationProcessLauncher } = await import('../lib/implementation-process.mjs');
const {
  CODEX_EXEC_ADAPTER,
  CODEX_EXECUTABLE_VERSION,
  CONTROLLER_DESCRIPTOR_ENV,
  executeCodexExecPlan,
} = await import('../lib/implementation-provider.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');
import { canonicalBytes, canonicalDigest, sha256Digest } from '../lib/implementation-protocol.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({
  runId: 'run_0054', epoch: 1, snapshotRevision: 2, taskId: 'T-0054', taskRevision: 2,
  taskRecordVersion: 8, capsuleDigest: digest('a'), controlGeneration: 0,
  correctionGeneration: 0,
});

function compiledPrompt(profile) {
  const body = Buffer.from(`bounded ${profile} work\n`);
  const manifest = { profile, harness: 'codex' };
  const embedded = sha256Digest(Buffer.concat([canonicalBytes(manifest), Buffer.from('\n'), body]));
  return Buffer.concat([
    Buffer.from('META-FRAMEWORK-AGENT-PROMPT 1\n'),
    canonicalBytes({ ...manifest, digest: embedded }), Buffer.from('\n'), body,
  ]);
}

function activation() {
  const { snapshotRevision: _snapshotRevision, ...activationBinding } = binding;
  const receipt = {
    schemaVersion: 1, receiptId: 'activation_launch', effectKind: 'provider_launch',
    binding: activationBinding, policyDigest: digest('b'), evidenceDigest: digest('c'),
    mechanism: { ...IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism },
    issuedAt: '2026-08-14T10:00:00Z', expiresAt: '2026-08-14T10:15:00Z', taskApproval: null,
  };
  return { activationReceipt: receipt, activationContext: {
    receiptId: receipt.receiptId, binding: { ...receipt.binding }, policyDigest: receipt.policyDigest,
    evidenceDigest: receipt.evidenceDigest, mechanism: { ...receipt.mechanism }, taskApproval: null,
  }, now: '2026-08-14T10:05:00Z' };
}

function rootOrientation() {
  const value = buildOrientation({
    binding,
    snapshot: {
      schemaVersion: 1, runId: binding.runId, revision: binding.snapshotRevision,
      phase: 'dormant', stop: { requested: false, mode: null, reasonDigest: null },
      reconciliation: { required: false, reasonCode: null, refs: [] },
      updatedAt: '2026-08-14T10:00:00Z',
    },
    task: { id: binding.taskId, taskRevision: binding.taskRevision,
      recordVersion: binding.taskRecordVersion, status: 'active' },
    repository: { baseCommit: '1'.repeat(40), head: '1'.repeat(40), tree: '2'.repeat(40),
      statusDigest: digest('e') },
    pendingAssignments: [], runningAssignments: [], assignmentStates: {}, verification: {},
    controls: {}, deadlines: {}, quota: { disposition: 'proceed' },
    approvals: { current: true }, observedAt: '2026-08-14T10:00:00Z',
  }).value;
  return { value, digest: canonicalDigest(value) };
}

test('launch preparation binds role, prompt, descriptor, schema, environment, and output paths', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'implementation-launch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const descriptors = path.join(root, 'descriptors');
  const spool = path.join(root, 'spool');
  fs.mkdirSync(descriptors, { mode: 0o700 });
  fs.mkdirSync(spool, { mode: 0o700 });
  const result = prepareCodexControllerLaunch({
    binding, assignmentId: 'assignment_1', attemptId: 'attempt_1', jobId: 'job_1',
    requestId: 'request_1', launcherConnectionId: 'launcher_1', role: 'implementer',
    cwd: { realpath: root, identity: digest('d') }, baseTree: '1'.repeat(40),
    compiledPrompt: compiledPrompt('implementer'), descriptorDirectory: descriptors,
    spoolDirectory: spool,
    executableIdentity: { schemaVersion: 1, adapter: CODEX_EXEC_ADAPTER,
      requestedPath: '/opt/codex/bin/codex', executableRealpath: '/opt/codex/bin/codex',
      version: CODEX_EXECUTABLE_VERSION },
    environment: { PATH: '/usr/bin', SECRET: 'not-inherited' },
    deadlineAt: '2026-08-14T10:10:00Z',
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'), ...activation(),
  });
  assert.equal(result.request.role, 'implementer');
  assert.equal(result.descriptor.descriptor.profile, 'implementer');
  assert.equal(result.plan.env[CONTROLLER_DESCRIPTOR_ENV], result.descriptor.descriptorPath);
  assert.equal(fs.statSync(result.outputSchemaPath).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(result.finalOutputPath), false);
  assert.doesNotMatch(JSON.stringify(result.plan.env), /SECRET/u);
});

test('Root launch binds the exact orientation and role-specific proposal schema into provider bytes', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'implementation-root-launch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const descriptors = path.join(root, 'descriptors');
  const spool = path.join(root, 'spool');
  fs.mkdirSync(descriptors, { mode: 0o700 });
  fs.mkdirSync(spool, { mode: 0o700 });
  const orientation = rootOrientation();
  const result = prepareCodexControllerLaunch({
    binding, assignmentId: 'assignment_root', attemptId: 'attempt_root', jobId: 'job_root',
    requestId: 'request_root', launcherConnectionId: 'launcher_root', role: 'root_decision',
    cwd: { realpath: root, identity: digest('d') }, baseTree: '1'.repeat(40),
    compiledPrompt: compiledPrompt('root'), descriptorDirectory: descriptors,
    spoolDirectory: spool,
    executableIdentity: { schemaVersion: 1, adapter: CODEX_EXEC_ADAPTER,
      requestedPath: '/opt/codex/bin/codex', executableRealpath: '/opt/codex/bin/codex',
      version: CODEX_EXECUTABLE_VERSION },
    environment: { PATH: '/usr/bin' }, deadlineAt: '2026-08-14T10:10:00Z',
    orientation, effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'),
    ...activation(),
  });
  const schema = JSON.parse(fs.readFileSync(result.outputSchemaPath, 'utf8'));
  assert.equal(schema.required.includes('proposal'), true);
  assert.match(result.plan.stdin.toString('utf8'), /META-FRAMEWORK-ROOT-ORIENTATION 1/u);
  assert.match(result.plan.stdin.toString('utf8'), new RegExp(orientation.digest, 'u'));
  assert.equal(result.request.promptDigest, sha256Digest(result.plan.stdin));
  assert.equal(result.descriptor.descriptor.promptDigest, sha256Digest(compiledPrompt('root')));
  assert.notEqual(result.descriptor.descriptor.promptDigest, result.request.promptDigest);
  assert.throws(() => prepareCodexControllerLaunch({
    binding, assignmentId: 'assignment_bad', attemptId: 'attempt_bad', jobId: 'job_bad',
    requestId: 'request_bad', launcherConnectionId: 'launcher_bad', role: 'root_decision',
    cwd: { realpath: root, identity: digest('d') }, baseTree: '1'.repeat(40),
    compiledPrompt: compiledPrompt('root'), descriptorDirectory: descriptors,
    spoolDirectory: spool,
    executableIdentity: { schemaVersion: 1, adapter: CODEX_EXEC_ADAPTER,
      requestedPath: '/opt/codex/bin/codex', executableRealpath: '/opt/codex/bin/codex',
      version: CODEX_EXECUTABLE_VERSION },
    environment: {}, deadlineAt: '2026-08-14T10:10:00Z',
    orientation: { ...orientation, digest: digest('9') },
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'), ...activation(),
  }), /orientation digest is stale/u);
});

test('launch preparation rejects role drift and absent activation before publishing artifacts', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'implementation-launch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const descriptors = path.join(root, 'descriptors');
  const spool = path.join(root, 'spool');
  fs.mkdirSync(descriptors, { mode: 0o700 });
  fs.mkdirSync(spool, { mode: 0o700 });
  const common = {
    binding, assignmentId: 'assignment_1', attemptId: 'attempt_1', jobId: 'job_1',
    requestId: 'request_1', launcherConnectionId: 'launcher_1', role: 'implementer',
    cwd: { realpath: root, identity: digest('d') }, baseTree: '1'.repeat(40),
    descriptorDirectory: descriptors, spoolDirectory: spool,
    executableIdentity: { schemaVersion: 1, adapter: CODEX_EXEC_ADAPTER,
      requestedPath: '/opt/codex/bin/codex', executableRealpath: '/opt/codex/bin/codex',
      version: CODEX_EXECUTABLE_VERSION }, environment: {}, deadlineAt: '2026-08-14T10:10:00Z',
  };
  assert.throws(() => prepareCodexControllerLaunch({ ...common,
    compiledPrompt: compiledPrompt('reviewer'),
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'),
    ...activation() }), /does not match launch role/u);
  assert.throws(() => prepareCodexControllerLaunch({ ...common,
    compiledPrompt: compiledPrompt('implementer') }), /requires current provider launch activation/u);
  assert.deepEqual(fs.readdirSync(descriptors), []);
  assert.deepEqual(fs.readdirSync(spool), []);
});

test('prepared plan executes through the bounded local process port with a fake executable', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'implementation-launch-e2e-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const descriptors = path.join(root, 'descriptors');
  const spool = path.join(root, 'spool');
  fs.mkdirSync(descriptors, { mode: 0o700 });
  fs.mkdirSync(spool, { mode: 0o700 });
  const executable = path.join(root, 'fake-codex');
  fs.writeFileSync(executable, `#!${process.execPath}\n
    import fs from 'node:fs';
    const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
    process.stdin.resume();
    process.stdin.on('end', () => {
      fs.writeFileSync(output, JSON.stringify({ schemaVersion: 1, disposition: 'completed',
        summary: 'fake executable completed', changedPathsClaim: [], checks: [], findings: [],
        risks: [], knowledgeProposals: [], followUp: [] }));
      process.stdout.write('{"type":"turn.completed"}\\n');
    });
  `, { mode: 0o755 });
  fs.chmodSync(executable, 0o755);
  const auth = activation();
  const deadlineAt = new Date(Date.now() + 3_000).toISOString();
  const prepared = prepareCodexControllerLaunch({
    binding, assignmentId: 'assignment_1', attemptId: 'attempt_1', jobId: 'job_e2e',
    requestId: 'request_e2e', launcherConnectionId: 'launcher_e2e', role: 'implementer',
    cwd: { realpath: root, identity: digest('d') }, baseTree: '1'.repeat(40),
    compiledPrompt: compiledPrompt('implementer'), descriptorDirectory: descriptors,
    spoolDirectory: spool,
    executableIdentity: { schemaVersion: 1, adapter: CODEX_EXEC_ADAPTER,
      requestedPath: executable, executableRealpath: executable, version: CODEX_EXECUTABLE_VERSION },
    environment: { PATH: path.dirname(process.execPath) }, deadlineAt, ...auth,
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'),
  });
  const launcher = createLocalImplementationProcessLauncher({ binding,
    requestId: prepared.request.requestId, launcherConnectionId: 'launcher_e2e',
    processDomainId: 'domain_e2e', deadlineAt,
    finalOutputPath: prepared.finalOutputPath, termGraceMs: 50,
    activationReceipt: auth.activationReceipt, activationContext: auth.activationContext,
    activationNow: auth.now,
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'),
  });
  const executed = await executeCodexExecPlan({ plan: prepared.plan, launcher,
    effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'),
    activationReceipt: auth.activationReceipt, activationContext: auth.activationContext, now: auth.now });
  assert.equal(executed.result.disposition, 'completed');
  assert.equal(executed.events[0].type, 'turn.completed');
  assert.equal(executed.terminal.outcome, 'ambiguous');
  assert.notEqual(executed.terminal.conflictDigest, null);
});
