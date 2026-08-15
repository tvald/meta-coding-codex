import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  IMPLEMENTATION_ROLE_PROFILES,
  ImplementationBindingError,
  deriveControllerCwdIdentity,
  publishControllerBindingDescriptor,
  readTrustedControllerBindingDescriptor,
  validateControllerBindingDescriptor,
  validateControllerSessionBinding,
  validateTrustedDescriptorObservation,
} = await import('../lib/implementation-binding.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');
import {
  canonicalBytes,
  canonicalDigest,
  sha256Digest,
} from '../lib/implementation-protocol.mjs';
import { IMPLEMENTATION_ACTIVATION_DISPOSITION } from '../lib/implementation-activation.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
function makeCompiledPrompt(profile, body = `bounded ${profile} prompt\n`) {
  const promptBody = Buffer.from(body, 'utf8');
  const manifest = { profile, harness: 'codex' };
  const embeddedDigest = sha256Digest(Buffer.concat([
    canonicalBytes(manifest), Buffer.from('\n'), promptBody,
  ]));
  return {
    profileDigest: embeddedDigest,
    bytes: Buffer.concat([
      Buffer.from('META-FRAMEWORK-AGENT-PROMPT 1\n'),
      canonicalBytes({ ...manifest, digest: embeddedDigest }),
      Buffer.from('\n'),
      promptBody,
    ]),
  };
}
const implementerPrompt = makeCompiledPrompt('implementer');
const profileDigest = implementerPrompt.profileDigest;
const compiledPrompt = implementerPrompt.bytes;
let descriptorSequence = 0;

function binding(overrides = {}) {
  return {
    runId: 'run_0054',
    epoch: 2,
    snapshotRevision: 7,
    taskId: 'T-0054',
    taskRevision: 2,
    taskRecordVersion: 5,
    capsuleDigest: digest('a'),
    controlGeneration: 1,
    correctionGeneration: 0,
    ...overrides,
  };
}

function descriptor(overrides = {}) {
  return {
    schemaVersion: 1,
    descriptorId: 'descriptor_1',
    binding: binding(),
    assignmentId: 'assignment_1',
    attemptId: 'attempt_1',
    jobId: 'job_1',
    launcherConnectionId: 'launcher_1',
    role: 'implementer',
    profile: 'implementer',
    profileDigest,
    promptDigest: sha256Digest(compiledPrompt),
    cwdIdentity: deriveControllerCwdIdentity(resolve('.')),
    descriptorPathIdentity: digest('0'),
    ...overrides,
  };
}

function providerActivation(value) {
  const { snapshotRevision: _snapshotRevision, ...activationBinding } = value.binding;
  const receipt = {
    schemaVersion: 1,
    receiptId: 'activation_descriptor_write',
    effectKind: 'provider_launch',
    binding: activationBinding,
    policyDigest: digest('7'),
    evidenceDigest: digest('8'),
    mechanism: { ...IMPLEMENTATION_ACTIVATION_DISPOSITION.supportedMechanism },
    issuedAt: '2026-08-14T10:00:00Z',
    expiresAt: '2026-08-14T10:15:00Z',
    taskApproval: null,
  };
  return {
    activationReceipt: receipt,
    activationContext: {
      receiptId: receipt.receiptId,
      binding: { ...receipt.binding },
      policyDigest: receipt.policyDigest,
      evidenceDigest: receipt.evidenceDigest,
      mechanism: { ...receipt.mechanism },
      taskApproval: null,
    },
    now: '2026-08-14T10:05:00Z',
  };
}

function pathIdentity(descriptorPath, stats) {
  return canonicalDigest({
    schemaVersion: 1,
    kind: 'controller_binding_descriptor',
    realpath: descriptorPath,
    device: stats.dev.toString(10),
    inode: stats.ino.toString(10),
    size: Number(stats.size),
  });
}

function writeDescriptorAt(descriptorPath, overrides = {}) {
  let value = descriptor(overrides);
  const provisional = canonicalBytes(value);
  writeFileSync(descriptorPath, provisional, { flag: 'wx', mode: 0o600 });
  chmodSync(descriptorPath, 0o600);
  const stats = statSync(descriptorPath, { bigint: true });
  value = { ...value, descriptorPathIdentity: pathIdentity(descriptorPath, stats) };
  const final = canonicalBytes(value);
  assert.equal(final.length, provisional.length, 'path identity replacement must preserve descriptor size');
  writeFileSync(descriptorPath, final, { flag: 'w', mode: 0o600 });
  chmodSync(descriptorPath, 0o600);
  return { descriptorPath, value };
}

function writeDescriptor(root, overrides = {}) {
  descriptorSequence += 1;
  return writeDescriptorAt(join(root, `descriptor-${descriptorSequence}.json`), overrides);
}

function withTempRoot(callback) {
  const root = resolve(mkdtempSync(join(tmpdir(), 'meta-binding-')));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function event(observation, overrides = {}) {
  return {
    schemaVersion: 1,
    hookEventName: 'SessionStart',
    source: 'startup',
    sessionId: 'session_1',
    descriptorId: observation.descriptorId,
    descriptorDigest: observation.descriptorDigest,
    descriptorPathIdentity: observation.descriptorPathIdentity,
    launcherConnectionId: observation.launcherConnectionId,
    jobId: observation.jobId,
    cwdIdentity: observation.cwdIdentity,
    ...overrides,
  };
}

function prior(validated, overrides = {}) {
  return {
    schemaVersion: 1,
    sessionId: validated.sessionId,
    descriptorId: validated.descriptorId,
    descriptorDigest: validated.descriptorDigest,
    bindingDigest: validated.bindingDigest,
    role: validated.role,
    profileDigest: validated.profileDigest,
    promptDigest: validated.promptDigest,
    ...overrides,
  };
}

function validateBundle(bundle, overrides = {}) {
  return validateControllerSessionBinding({
    descriptor: bundle.descriptor,
    trustedDescriptor: bundle.trustedDescriptor,
    event: event(bundle.trustedDescriptor),
    requestedProfile: bundle.descriptor.profile,
    compiledPrompt,
    observedCwdIdentity: deriveControllerCwdIdentity(resolve('.')),
    ...overrides,
  });
}

test('protected reader derives the only accepted trusted descriptor observation', () =>
  withTempRoot((root) => {
    const written = writeDescriptor(root);
    const bundle = readTrustedControllerBindingDescriptor(written.descriptorPath);
    assert.deepEqual(bundle.descriptor, written.value);
    assert.equal(Object.isFrozen(bundle.descriptor), true);
    assert.equal(Object.isFrozen(bundle.descriptor.binding), true);
    assert.equal(validateTrustedDescriptorObservation(bundle.trustedDescriptor), bundle.trustedDescriptor);
    assert.throws(() => validateTrustedDescriptorObservation({ ...bundle.trustedDescriptor }),
      (error) => error.code === 'TRUSTED_DESCRIPTOR_UNPROVEN');
  }));

test('publisher creates one canonical protected descriptor with no-replace semantics', () =>
  withTempRoot((root) => {
    const draft = descriptor();
    delete draft.descriptorPathIdentity;
    const activation = providerActivation(draft);
    const published = publishControllerBindingDescriptor({ directory: root, descriptor: draft,
      effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'), ...activation });
    assert.equal(published.descriptorPath, join(root, `${draft.descriptorId}.json`));
    assert.equal(statSync(published.descriptorPath).mode & 0o777, 0o600);
    assert.equal(statSync(published.descriptorPath).nlink, 1);
    assert.equal(published.descriptor.descriptorPathIdentity,
      pathIdentity(published.descriptorPath, statSync(published.descriptorPath, { bigint: true })));
    assert.deepEqual(readTrustedControllerBindingDescriptor(published.descriptorPath).descriptor,
      published.descriptor);
    assert.throws(() => publishControllerBindingDescriptor({ directory: root, descriptor: draft,
      effectCapability: issueSourceInstrumentedEffectCapability('provider_launch'), ...activation }),
      (error) => error.code === 'DESCRIPTOR_PUBLICATION_FAILED');
    assert.throws(() => publishControllerBindingDescriptor({ directory: root,
      descriptor: { ...draft, descriptorId: 'descriptor_2' } }),
    (error) => error.code === 'ACTIVATION_REQUIRED');
    assert.equal(readFileSync(published.descriptorPath, 'utf8'),
      JSON.stringify(published.descriptor));
  }));

test('controller SessionStart binds exact task/run/revision/capsule/role/profile/prompt identity', () =>
  withTempRoot((root) => {
    const bundle = readTrustedControllerBindingDescriptor(writeDescriptor(root).descriptorPath);
    const result = validateBundle(bundle);
    assert.equal(result.role, 'implementer');
    assert.equal(result.profile, 'implementer');
    assert.equal(result.binding.taskId, 'T-0054');
    assert.equal(result.binding.taskRevision, 2);
    assert.equal(result.binding.runId, 'run_0054');
    assert.equal(result.binding.capsuleDigest, digest('a'));
    assert.equal(result.promptDigest, sha256Digest(compiledPrompt));
    assert.equal(result.descriptorDigest, canonicalDigest(bundle.descriptor));
    assert.throws(() => validateBundle(bundle, { observedCwdIdentity: undefined }),
      (error) => error.code === 'BINDING_SCHEMA_INVALID');
    assert.throws(() => validateBundle(bundle, { observedCwdIdentity: digest('9') }),
      (error) => error.code === 'CWD_IDENTITY_MISMATCH');
  }));

test('exact role mapping rejects root-specialist confusion and prose profile invention', () =>
  withTempRoot((root) => {
    assert.deepEqual(IMPLEMENTATION_ROLE_PROFILES, {
      root_analysis: 'root',
      root_decision: 'root',
      implementer: 'implementer',
      reviewer: 'reviewer',
      qa: 'qa',
      security: 'security',
    });
    assert.throws(() => validateControllerBindingDescriptor(descriptor({ profile: 'root' })),
      (error) => error instanceof ImplementationBindingError && error.code === 'ROLE_PROFILE_MISMATCH');
    assert.throws(() => validateControllerBindingDescriptor(descriptor({ role: 'root' })),
      /role is unsupported/u);

    const specialist = readTrustedControllerBindingDescriptor(writeDescriptor(root).descriptorPath);
    assert.throws(() => validateBundle(specialist, { requestedProfile: 'root' }),
      /profile does not match/u);

    const rootPrompt = makeCompiledPrompt('root');
    const rootBundle = readTrustedControllerBindingDescriptor(writeDescriptor(root, {
      role: 'root_decision', profile: 'root', profileDigest: rootPrompt.profileDigest,
      promptDigest: sha256Digest(rootPrompt.bytes),
    }).descriptorPath);
    assert.equal(validateControllerSessionBinding({
      descriptor: rootBundle.descriptor,
      trustedDescriptor: rootBundle.trustedDescriptor,
      event: event(rootBundle.trustedDescriptor),
      requestedProfile: 'root',
      compiledPrompt: rootPrompt.bytes,
      observedCwdIdentity: deriveControllerCwdIdentity(resolve('.')),
    }).role, 'root_decision');
  }));

test('top-level jobs reject SubagentStart, event drift, prompt drift, and ambient-looking claims', () =>
  withTempRoot((root) => {
    const bundle = readTrustedControllerBindingDescriptor(writeDescriptor(root).descriptorPath);
    assert.throws(() => validateBundle(bundle, {
      event: event(bundle.trustedDescriptor, { hookEventName: 'SubagentStart' }),
    }), (error) => error.code === 'HOOK_EVENT_MISMATCH');
    assert.throws(() => validateBundle(bundle, {
      event: event(bundle.trustedDescriptor, { descriptorDigest: digest('9') }),
    }), (error) => error.code === 'SESSION_DESCRIPTOR_MISMATCH');
    assert.throws(() => validateBundle(bundle, {
      compiledPrompt: makeCompiledPrompt('implementer', 'different prompt\n').bytes,
    }),
      (error) => error.code === 'TRUSTED_DESCRIPTOR_MISMATCH');
    const lines = compiledPrompt.toString('utf8').split('\n');
    const noncanonicalPrompt = Buffer.from([
      lines[0], JSON.stringify(JSON.parse(lines[1]), null, 2), ...lines.slice(2),
    ].join('\n'));
    assert.throws(() => validateBundle(bundle, { compiledPrompt: noncanonicalPrompt }),
      (error) => error.code === 'PROMPT_INVALID');
    assert.throws(() => validateControllerSessionBinding({
      descriptor: bundle.descriptor,
      trustedDescriptor: { ...bundle.trustedDescriptor },
      event: event(bundle.trustedDescriptor),
      requestedProfile: 'implementer',
      compiledPrompt,
      observedCwdIdentity: deriveControllerCwdIdentity(resolve('.')),
    }), (error) => error.code === 'TRUSTED_DESCRIPTOR_UNPROVEN');
  }));

test('resume and compact require the exact prior session and reject revision/profile drift', () =>
  withTempRoot((root) => {
    const bundle = readTrustedControllerBindingDescriptor(writeDescriptor(root).descriptorPath);
    const startup = validateBundle(bundle);
    const previous = prior(startup);
    for (const source of ['resume', 'clear', 'compact']) {
      const resumed = validateBundle(bundle, {
        event: event(bundle.trustedDescriptor, { source }),
        priorSession: previous,
      });
      assert.equal(resumed.source, source);
    }
    assert.throws(() => validateBundle(bundle, {
      event: event(bundle.trustedDescriptor, { source: 'resume' }),
    }), (error) => error.code === 'SESSION_DRIFT');
    assert.throws(() => validateBundle(bundle, {
      event: event(bundle.trustedDescriptor, { source: 'compact', sessionId: 'session_2' }),
      priorSession: previous,
    }), (error) => error.code === 'SESSION_DRIFT');

    const revised = readTrustedControllerBindingDescriptor(writeDescriptor(root, {
      binding: binding({ taskRevision: 3 }),
    }).descriptorPath);
    assert.throws(() => validateBundle(revised, {
      event: event(revised.trustedDescriptor, { source: 'resume' }),
      priorSession: previous,
    }), (error) => error.code === 'SESSION_DRIFT');
    assert.throws(() => validateBundle(bundle, { priorSession: previous }),
      (error) => error.code === 'SESSION_DRIFT');
  }));

test('descriptor reader rejects symlinks, hardlinks, unsafe modes, and stale path swaps', () =>
  withTempRoot((root) => {
    const symlinkTarget = writeDescriptor(root);
    const symlinkPath = join(root, 'descriptor-link.json');
    symlinkSync(symlinkTarget.descriptorPath, symlinkPath);
    assert.throws(() => readTrustedControllerBindingDescriptor(symlinkPath),
      (error) => error.code === 'DESCRIPTOR_PATH_UNSAFE');

    const hardlinkTarget = writeDescriptor(root);
    linkSync(hardlinkTarget.descriptorPath, join(root, 'descriptor-hardlink.json'));
    assert.throws(() => readTrustedControllerBindingDescriptor(hardlinkTarget.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_FILE_UNSAFE');

    const modeTarget = writeDescriptor(root);
    chmodSync(modeTarget.descriptorPath, 0o640);
    assert.throws(() => readTrustedControllerBindingDescriptor(modeTarget.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_FILE_UNSAFE');

    const swapTarget = writeDescriptor(root);
    const displaced = `${swapTarget.descriptorPath}.old`;
    renameSync(swapTarget.descriptorPath, displaced);
    copyFileSync(displaced, swapTarget.descriptorPath);
    chmodSync(swapTarget.descriptorPath, 0o600);
    assert.throws(() => readTrustedControllerBindingDescriptor(swapTarget.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_PATH_IDENTITY_MISMATCH');
  }));

test('descriptor reader rejects BOM, noncanonical JSON, unknown versions, and non-real paths', () =>
  withTempRoot((root) => {
    const bom = writeDescriptor(root);
    writeFileSync(bom.descriptorPath, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(bom.descriptorPath),
    ]), { mode: 0o600 });
    chmodSync(bom.descriptorPath, 0o600);
    assert.throws(() => readTrustedControllerBindingDescriptor(bom.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_CONTENT_INVALID');

    const noncanonical = writeDescriptor(root);
    writeFileSync(noncanonical.descriptorPath, `${JSON.stringify(noncanonical.value, null, 2)}\n`,
      { mode: 0o600 });
    chmodSync(noncanonical.descriptorPath, 0o600);
    assert.throws(() => readTrustedControllerBindingDescriptor(noncanonical.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_CONTENT_INVALID');

    const invalidUtf8 = writeDescriptor(root);
    writeFileSync(invalidUtf8.descriptorPath, Buffer.from([0xc3, 0x28]), { mode: 0o600 });
    chmodSync(invalidUtf8.descriptorPath, 0o600);
    assert.throws(() => readTrustedControllerBindingDescriptor(invalidUtf8.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_CONTENT_INVALID');

    const oversized = writeDescriptor(root);
    writeFileSync(oversized.descriptorPath, Buffer.alloc(32 * 1024 + 1, 0x20), { mode: 0o600 });
    chmodSync(oversized.descriptorPath, 0o600);
    assert.throws(() => readTrustedControllerBindingDescriptor(oversized.descriptorPath),
      (error) => error.code === 'DESCRIPTOR_SIZE_INVALID');

    const unsupported = writeDescriptor(root, { schemaVersion: 2 });
    assert.throws(() => readTrustedControllerBindingDescriptor(unsupported.descriptorPath),
      (error) => error.code === 'BINDING_VERSION_UNSUPPORTED');
    assert.throws(() => readTrustedControllerBindingDescriptor(`${root}/../${root.split('/').at(-1)}/missing`),
      (error) => error.code === 'DESCRIPTOR_PATH_UNSAFE');
  }));
