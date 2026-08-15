import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { codexHookFailure, validateCodexFailureContract } from '../lib/hook-adapters.mjs';
import { CONTROLLER_DESCRIPTOR_ENV } from '../lib/implementation-binding.mjs';
import {
  activatePromptGeneration,
  buildPromptGeneration,
  cleanupPromptRuntime,
  initializePromptRuntime,
  inspectPromptRuntime,
  installPromptBootstrapLoader,
  promptBootstrapLoaderPath,
  promptCandidateValidationReceipt,
  PROMPT_GENERATION_RETENTION_MS,
  retireSessionPin,
  rollbackPromptGeneration,
  seedPromptRuntime,
  serveRuntimePrompt,
  validatePromptCapacity,
  verifyPromptGeneration,
} from '../lib/prompt-runtime.mjs';

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function promptWithBody(profile, harness, body, { extensions = [], facets = [] } = {}) {
  const unsigned = {
    envelopeVersion: 1,
    promptFormatVersion: 1,
    registrySchemaVersion: 1,
    package: { name: '@test/meta-framework', version: '1.0.0' },
    compilerVersion: '1.0.0',
    profile,
    harness,
    facets,
    extensions,
  };
  const embeddedDigest = digest(`${canonicalJson(unsigned)}\n${body}`);
  return `META-FRAMEWORK-AGENT-PROMPT 1\n${canonicalJson({ ...unsigned, digest: embeddedDigest })}\n${body}`;
}

function prompt(profile, harness, tag) {
  return promptWithBody(profile, harness,
    `META-FRAMEWORK-FACET test.fixture fixture\n${tag}:${profile}:${harness}\n`);
}

function removeRuntime(common) {
  if (!existsSync(common)) return;
  const makeWritable = (target) => {
    const info = lstatSync(target);
    if (info.isDirectory()) {
      chmodSync(target, 0o700);
      for (const name of readdirSync(target)) makeWritable(join(target, name));
    } else chmodSync(target, 0o600);
  };
  makeWritable(common);
  rmSync(common, { recursive: true, force: true });
}

function fixture(hooks = null) {
  const common = mkdtempSync(join(tmpdir(), 'meta-framework-prompt-runtime-'));
  chmodSync(common, 0o700);
  const runtime = initializePromptRuntime(common, { hooks });
  const build = (tag) => buildPromptGeneration(runtime, {
    packageIdentity: { name: '@test/meta-framework', version: '1.0.0' },
    compilerVersion: '1.0.0',
    sourceIdentity: { kind: 'fixture', tag },
    compilePrompt: (profile, harness) => prompt(profile, harness, tag),
    validateCandidate: ({ compiledPromptSetDigest }) =>
      promptCandidateValidationReceipt(compiledPromptSetDigest),
  });
  return { common, runtime, build };
}

function sessionEvent(sessionId, source = 'startup') {
  return Buffer.from(JSON.stringify({
    hook_event_name: 'SessionStart',
    source,
    session_id: sessionId,
  }));
}

function specialistEvent(sessionId, profile) {
  return Buffer.from(JSON.stringify({
    hook_event_name: 'SubagentStart',
    agent_type: `meta_${profile}`,
    session_id: sessionId,
  }));
}

function runLoader(loader, profile, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [loader, profile], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({
      status,
      signal,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
    }));
    child.stdin.end(input);
  });
}

function controllerCwdIdentity(cwd = process.cwd()) {
  const realpath = realpathSync(cwd);
  const info = statSync(realpath, { bigint: true });
  return digest(canonicalJson({
    path: realpath,
    dev: info.dev.toString(10),
    ino: info.ino.toString(10),
    mode: (info.mode & 0o777n).toString(10),
  }));
}

function controllerDescriptor(common, promptBytes, overrides = {}) {
  const descriptorPath = join(common, 'controller-binding.json');
  const manifest = JSON.parse(promptBytes.toString('utf8').split('\n', 3)[1]);
  let value = {
    schemaVersion: 1,
    descriptorId: 'descriptor_1',
    binding: {
      runId: 'run_0054', epoch: 0, snapshotRevision: 0,
      taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 8,
      capsuleDigest: `sha256:${'a'.repeat(64)}`,
      controlGeneration: 0, correctionGeneration: 0,
    },
    assignmentId: 'assignment_1',
    attemptId: 'attempt_1',
    jobId: 'job_1',
    launcherConnectionId: 'launcher_1',
    role: 'reviewer',
    profile: 'reviewer',
    profileDigest: manifest.digest,
    promptDigest: digest(promptBytes),
    cwdIdentity: controllerCwdIdentity(),
    descriptorPathIdentity: `sha256:${'0'.repeat(64)}`,
    ...overrides,
  };
  const provisional = canonicalJson(value);
  writeFileSync(descriptorPath, provisional, { flag: 'wx', mode: 0o600 });
  chmodSync(descriptorPath, 0o600);
  const info = statSync(descriptorPath, { bigint: true });
  value = {
    ...value,
    descriptorPathIdentity: digest(canonicalJson({
      schemaVersion: 1,
      kind: 'controller_binding_descriptor',
      realpath: realpathSync(descriptorPath),
      device: info.dev.toString(10),
      inode: info.ino.toString(10),
      size: Number(info.size),
    })),
  };
  const final = canonicalJson(value);
  assert.equal(final.length, provisional.length);
  writeFileSync(descriptorPath, final, { flag: 'w', mode: 0o600 });
  chmodSync(descriptorPath, 0o600);
  return { descriptorPath, value, bytes: final };
}

test('capacity reserve accepts exact boundaries and rejects one byte beyond them', () => {
  assert.doesNotThrow(() => validatePromptCapacity({ bodyBytes: 23_552, totalBytes: 31_744 }));
  assert.throws(() => validatePromptCapacity({ bodyBytes: 23_553, totalBytes: 31_744 }),
    (error) => error.code === 'PROMPT_RESERVE');
  assert.throws(() => validatePromptCapacity({ bodyBytes: 23_552, totalBytes: 31_745 }),
    (error) => error.code === 'PROMPT_RESERVE');
  assert.doesNotThrow(() => validatePromptCapacity({
    bodyBytes: 31_744, totalBytes: 64_512, bodyLimit: 32_768, totalLimit: 65_536,
  }));
  assert.throws(() => validatePromptCapacity({
    bodyBytes: 31_745, totalBytes: 64_512, bodyLimit: 32_768, totalLimit: 65_536,
  }), (error) => error.code === 'PROMPT_RESERVE');
  assert.throws(() => validatePromptCapacity({
    bodyBytes: 31_744, totalBytes: 64_513, bodyLimit: 32_768, totalLimit: 65_536,
  }), (error) => error.code === 'PROMPT_RESERVE');
});

test('extension candidates preserve the core reserve independently of combined capacity', () => {
  const { common, runtime } = fixture();
  const buildExtended = (coreBodyBytes) => {
    const coreBody = 'c'.repeat(coreBodyBytes);
    const extendedBody = `${coreBody}extension\n`;
    return buildPromptGeneration(runtime, {
      packageIdentity: { name: '@test/meta-framework', version: '1.0.0' },
      compilerVersion: '1.0.0',
      sourceIdentity: { kind: 'extension-reserve-fixture', coreBodyBytes },
      compilePrompt: (profile, harness) => promptWithBody(profile, harness, extendedBody, {
        extensions: [{ name: '@test/extension', version: '1.0.0' }],
      }),
      compileCorePrompt: (profile, harness) => promptWithBody(profile, harness, coreBody),
      validateCandidate: ({ compiledPromptSetDigest }) =>
        promptCandidateValidationReceipt(compiledPromptSetDigest),
    });
  };
  try {
    assert.throws(() => buildExtended(23_553), (error) => error.code === 'PROMPT_RESERVE');
    const accepted = buildExtended(23_552);
    const verified = verifyPromptGeneration(runtime, accepted.generationDigest);
    assert.ok(verified.manifest.validationMatrix.every(({ coreBodyHeadroom }) => coreBodyHeadroom === 1_024));
  } finally {
    removeRuntime(common);
  }
});

test('test-failing and source-drifting candidates never publish a generation', () => {
  const { common, runtime } = fixture();
  const inputs = {
    packageIdentity: { name: '@test/meta-framework', version: '1.0.0' },
    compilerVersion: '1.0.0',
    sourceIdentity: { kind: 'validation-fixture' },
  };
  try {
    assert.throws(() => buildPromptGeneration(runtime, {
      ...inputs,
      compilePrompt: (profile, harness) => prompt(profile, harness, 'test-failure'),
      validateCandidate: () => { throw new Error('declared lifecycle failure'); },
    }), (error) => error.code === 'CANDIDATE_TEST_FAILED');
    assert.deepEqual(inspectPromptRuntime(runtime).generations, []);

    for (const [profile, weaken] of [
      ['root', (failure) => { failure.hookSpecificOutput.additionalContext = 'Use AGENTS.md.'; }],
      ['reviewer', (failure) => { failure.stopReason = 'Continue carefully.'; }],
    ]) {
      assert.throws(() => buildPromptGeneration(runtime, {
        ...inputs,
        sourceIdentity: { ...inputs.sourceIdentity, weakenedProfile: profile },
        compilePrompt: (candidateProfile, harness) =>
          prompt(candidateProfile, harness, `weakened-${profile}`),
        validateCandidate: ({ compiledPromptSetDigest }) => {
          const failure = JSON.parse(codexHookFailure(profile));
          weaken(failure);
          validateCodexFailureContract(profile, `${JSON.stringify(failure)}\n`);
          return promptCandidateValidationReceipt(compiledPromptSetDigest);
        },
      }), (error) => error.code === 'CANDIDATE_TEST_FAILED');
      assert.deepEqual(inspectPromptRuntime(runtime).generations, []);
    }

    assert.throws(() => buildPromptGeneration(runtime, {
      ...inputs,
      compilePrompt: (profile, harness) => prompt(profile, harness, 'wrong-receipt-subject'),
      validateCandidate: () => promptCandidateValidationReceipt(`sha256:${'0'.repeat(64)}`),
    }), (error) => error.code === 'CANDIDATE_TEST_FAILED');
    assert.deepEqual(inspectPromptRuntime(runtime).generations, []);

    let compilation = 0;
    assert.throws(() => buildPromptGeneration(runtime, {
      ...inputs,
      compilePrompt: (profile, harness) => {
        compilation += 1;
        return prompt(profile, harness, compilation <= 15 ? 'snapshot-a' : 'snapshot-b');
      },
      validateCandidate: ({ compiledPromptSetDigest }) =>
        promptCandidateValidationReceipt(compiledPromptSetDigest),
    }), (error) => error.code === 'SOURCE_DRIFT');
    assert.deepEqual(inspectPromptRuntime(runtime).generations, []);
  } finally {
    removeRuntime(common);
  }
});

test('candidate publication validates all 15 bindings and activation uses ABA-safe exact CAS', () => {
  const { common, runtime, build } = fixture();
  try {
    const g1 = build('g1');
    const g2 = build('g2');
    assert.notEqual(g1.generationDigest, g2.generationDigest);
    assert.equal(inspectPromptRuntime(runtime).activeGeneration, null);
    const verifiedG1 = verifyPromptGeneration(runtime, g1.generationDigest, { requireCurrentReceipt: true });
    assert.equal(verifiedG1.manifest.validationMatrix.length, 15);
    assert.equal(verifiedG1.manifest.validationReceipt.validator, 'meta-framework-codex-lifecycle-v2');
    assert.equal(verifiedG1.manifest.validationReceipt.compiledPromptSetDigest,
      verifiedG1.manifest.sourceIdentity.compiledPromptSetDigest);

    const empty = inspectPromptRuntime(runtime);
    const selectedG1 = activatePromptGeneration(runtime, g1.generationDigest, {
      expectedActive: empty.activeToken,
    });
    assert.throws(() => activatePromptGeneration(runtime, g2.generationDigest, {
      expectedActive: empty.activeToken,
    }), (error) => error.code === 'ACTIVE_STALE');
    const selectedG2 = activatePromptGeneration(runtime, g2.generationDigest, {
      expectedActive: selectedG1.activeToken,
    });
    const rolledBack = rollbackPromptGeneration(runtime, g1.generationDigest, {
      expectedActive: selectedG2.activeToken,
    });
    assert.equal(rolledBack.activeRevision, 3);
    assert.notEqual(rolledBack.activeToken, selectedG1.activeToken, 'A→B→A must not recreate an old token');
    assert.throws(() => activatePromptGeneration(runtime, g2.generationDigest, {
      expectedActive: selectedG1.activeToken,
    }), (error) => error.code === 'ACTIVE_STALE');
  } finally {
    removeRuntime(common);
  }
});

test('publication fault cuts expose no private generation and pointer cuts remain old-or-complete', () => {
  let armed = false;
  let cut = 'beforeGenerationClaim';
  const { common, runtime, build } = fixture((phase) => {
    if (armed && phase === cut) throw new Error(`fault:${phase}`);
  });
  try {
    armed = true;
    assert.throws(() => build('cut-generation'), (error) => error.code === 'PROMPT_RUNTIME_UNAVAILABLE');
    assert.deepEqual(inspectPromptRuntime(runtime).generations, []);
    armed = false;
    const generation = build('cut-active');
    const before = inspectPromptRuntime(runtime);
    cut = 'beforeActiveRename';
    armed = true;
    assert.throws(() => activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: before.activeToken,
    }), (error) => error.code === 'PROMPT_RUNTIME_UNAVAILABLE');
    assert.equal(inspectPromptRuntime(runtime).activeToken, before.activeToken);

    cut = 'afterActiveRenameBeforeSync';
    assert.throws(() => activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: before.activeToken,
    }), (error) => error.code === 'PROMPT_RUNTIME_UNAVAILABLE');
    const after = inspectPromptRuntime(runtime);
    assert.equal(after.activeGeneration, generation.generationDigest);
    verifyPromptGeneration(runtime, after.activeGeneration);
  } finally {
    removeRuntime(common);
  }
});

test('installed seed sync cuts never publish a partial runtime tree', async () => {
  for (const cut of ['beforeSeedParentSync', 'afterSeedParentSyncBeforePublish']) {
    const common = mkdtempSync(join(tmpdir(), `meta-framework-prompt-seed-${cut}-`));
    chmodSync(common, 0o700);
    try {
      await assert.rejects(seedPromptRuntime(common, {
        hooks: (phase) => {
          if (phase === cut) throw new Error(`fault:${phase}`);
        },
        prepare: async (runtime) => {
          const built = buildPromptGeneration(runtime, {
            packageIdentity: { name: '@test/meta-framework', version: '1.0.0' },
            compilerVersion: '1.0.0',
            sourceIdentity: { kind: 'seed-sync-cut', cut },
            compilePrompt: (profile, harness) => prompt(profile, harness, cut),
            validateCandidate: ({ compiledPromptSetDigest }) =>
              promptCandidateValidationReceipt(compiledPromptSetDigest),
          });
          return {
            ...built,
            loaderBytes: readFileSync(new URL('../lib/prompt-bootstrap-loader.mjs', import.meta.url)),
          };
        },
      }), (error) => error.code === 'PROMPT_RUNTIME_UNAVAILABLE');
      const framework = join(common, 'meta-framework');
      assert.equal(existsSync(join(framework, 'prompt-runtime')), false, cut);
      assert.equal(readdirSync(framework).some((name) => name.startsWith('.prompt-runtime-seed-')), false, cut);
    } finally {
      removeRuntime(common);
    }
  }
});

test('crash-left private candidates are visible and never confused with activated generations', () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('private-candidate');
    activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    const privateCandidate = join(runtime.root, 'generations', `.build-999-${'a'.repeat(32)}`);
    mkdirSync(privateCandidate, { mode: 0o700 });
    chmodSync(privateCandidate, 0o700);
    const inspected = inspectPromptRuntime(runtime);
    assert.equal(inspected.privateCandidates, 1);
    assert.equal(inspected.activeGeneration, generation.generationDigest);
    const cleanup = cleanupPromptRuntime(runtime);
    assert.equal(cleanup.privateCandidates, 1);
    assert.equal(existsSync(privateCandidate), true, 'ordinary cleanup must not guess a private writer is dead');
  } finally {
    removeRuntime(common);
  }
});

test('initialization refuses partial runtime state without repairing it', () => {
  const common = mkdtempSync(join(tmpdir(), 'meta-framework-prompt-runtime-partial-'));
  chmodSync(common, 0o700);
  const partial = join(common, 'meta-framework', 'prompt-runtime');
  mkdirSync(partial, { recursive: true, mode: 0o700 });
  chmodSync(join(common, 'meta-framework'), 0o700);
  chmodSync(partial, 0o700);
  try {
    assert.throws(() => initializePromptRuntime(common),
      (error) => error.code === 'PROMPT_RUNTIME_UNAVAILABLE');
    assert.equal(existsSync(join(partial, 'v1')), false);
  } finally {
    removeRuntime(common);
  }
});

test('session pins keep exact bytes through active changes and specialists require the parent pin', () => {
  const { common, runtime, build } = fixture();
  try {
    const g1 = build('g1');
    let observed = inspectPromptRuntime(runtime);
    let selected = activatePromptGeneration(runtime, g1.generationDigest, { expectedActive: observed.activeToken });
    const startup = serveRuntimePrompt(runtime, sessionEvent('stable-session'), 'root');
    const specialist = serveRuntimePrompt(runtime, specialistEvent('stable-session', 'reviewer'), 'reviewer');
    assert.match(specialist.toString(), /g1:reviewer:codex/u);

    const g2 = build('g2');
    selected = activatePromptGeneration(runtime, g2.generationDigest, { expectedActive: selected.activeToken });
    for (const source of ['resume', 'clear', 'compact']) {
      assert.ok(serveRuntimePrompt(runtime, sessionEvent('stable-session', source), 'root').equals(startup), source);
    }
    assert.match(serveRuntimePrompt(runtime, sessionEvent('new-session'), 'root').toString(), /g2:root:codex/u);
    assert.throws(() => serveRuntimePrompt(runtime, specialistEvent('missing-parent-pin', 'security'), 'security'),
      (error) => error.code === 'SESSION_PIN_INVALID');
    assert.equal(inspectPromptRuntime(runtime).activeGeneration, g2.generationDigest);
  } finally {
    removeRuntime(common);
  }
});

test('the installed standalone loader handles concurrent first pins and returns byte-identical output', async () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('loader');
    activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    const installed = installPromptBootstrapLoader(
      runtime,
      readFileSync(new URL('../lib/prompt-bootstrap-loader.mjs', import.meta.url)),
    );
    const installedPath = promptBootstrapLoaderPath(runtime, installed.digest);
    assert.equal(installed.relativePath, `loaders/${installed.digest.slice(7)}.mjs`);
    assert.equal(Object.hasOwn(installed, 'path'), false);
    assert.equal(Object.hasOwn(inspectPromptRuntime(runtime), 'runtimeRoot'), false);
    for (let index = 0; index < 8; index += 1) {
      const event = sessionEvent(`concurrent-session-${index}`);
      const [left, right] = await Promise.all([
        runLoader(installedPath, 'root', event),
        runLoader(installedPath, 'root', event),
      ]);
      assert.equal(left.status, 0, `left ${index}: ${left.stderr}`);
      assert.equal(right.status, 0, `right ${index}: ${right.stderr}`);
      assert.ok(left.stdout.equals(right.stdout), `pair ${index}`);
    }
    assert.equal(inspectPromptRuntime(runtime).pins, 8);
    const linkedLoader = join(common, 'linked-loader.mjs');
    linkSync(installedPath, linkedLoader);
    const linkedResult = await runLoader(installedPath, 'root', sessionEvent('linked-loader-rejected'));
    assert.equal(linkedResult.status, 1);
    assert.equal(linkedResult.stdout.length, 0);
    assert.equal(linkedResult.stderr.length, 0);
    assert.equal(inspectPromptRuntime(runtime).pins, 8, 'unsafe loader created a session pin');
    rmSync(linkedLoader);
  } finally {
    removeRuntime(common);
  }
});

test('controller capability binds a SessionStart to the descriptor role and v2 continuity pin', async () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('controller');
    activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    const installed = installPromptBootstrapLoader(
      runtime,
      readFileSync(new URL('../lib/prompt-bootstrap-loader.mjs', import.meta.url)),
    );
    const installedPath = promptBootstrapLoaderPath(runtime, installed.digest);
    const reviewerPrompt = Buffer.from(prompt('reviewer', 'codex', 'controller'));
    const descriptor = controllerDescriptor(common, reviewerPrompt);
    const controllerEnvironment = {
      ...process.env,
      [CONTROLLER_DESCRIPTOR_ENV]: descriptor.descriptorPath,
    };

    const invalidTask = {
      ...descriptor.value,
      binding: { ...descriptor.value.binding, taskId: 'T-12a4' },
    };
    writeFileSync(descriptor.descriptorPath, canonicalJson(invalidTask), { flag: 'w', mode: 0o600 });
    chmodSync(descriptor.descriptorPath, 0o600);
    const invalidTaskStart = await runLoader(installedPath, 'root', sessionEvent('invalid-task'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(invalidTaskStart.status, 1);
    assert.equal(invalidTaskStart.stdout.length, 0);
    writeFileSync(descriptor.descriptorPath, descriptor.bytes, { flag: 'w', mode: 0o600 });
    chmodSync(descriptor.descriptorPath, 0o600);

    const startup = await runLoader(installedPath, 'root', sessionEvent('controller-session'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(startup.status, 0, startup.stderr.toString());
    assert.ok(startup.stdout.equals(reviewerPrompt), 'role-derived reviewer profile was not served');
    const pinName = readdirSync(join(runtime.root, 'sessions'))[0];
    const pin = JSON.parse(readFileSync(join(runtime.root, 'sessions', pinName), 'utf8'));
    assert.equal(pin.schemaVersion, 2);
    assert.equal(pin.role, 'reviewer');
    assert.equal(pin.profile, 'reviewer');

    const clear = await runLoader(installedPath, 'root', sessionEvent('controller-session', 'clear'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(clear.status, 0);
    assert.ok(clear.stdout.equals(reviewerPrompt));
    const missingPrior = await runLoader(installedPath, 'root', sessionEvent('missing-controller', 'resume'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(missingPrior.status, 1);
    assert.equal(missingPrior.stdout.length, 0);

    const drifted = { ...descriptor.value, promptDigest: `sha256:${'9'.repeat(64)}` };
    writeFileSync(descriptor.descriptorPath, canonicalJson(drifted), { flag: 'w', mode: 0o600 });
    chmodSync(descriptor.descriptorPath, 0o600);
    const drift = await runLoader(installedPath, 'root', sessionEvent('controller-session', 'compact'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(drift.status, 1);
    assert.equal(drift.stdout.length, 0);

    const cwdDrifted = { ...descriptor.value, cwdIdentity: `sha256:${'8'.repeat(64)}` };
    writeFileSync(descriptor.descriptorPath, canonicalJson(cwdDrifted), { flag: 'w', mode: 0o600 });
    chmodSync(descriptor.descriptorPath, 0o600);
    const cwdDrift = await runLoader(installedPath, 'root', sessionEvent('controller-session', 'resume'), {
      cwd: process.cwd(), env: controllerEnvironment,
    });
    assert.equal(cwdDrift.status, 1);
    assert.equal(cwdDrift.stdout.length, 0);

    writeFileSync(descriptor.descriptorPath, descriptor.bytes, { flag: 'w', mode: 0o600 });
    chmodSync(descriptor.descriptorPath, 0o600);
    const ended = await runLoader(installedPath, 'root', Buffer.from(JSON.stringify({
      hook_event_name: 'SessionEnd', source: 'other', session_id: 'controller-session',
    })), { cwd: process.cwd(), env: controllerEnvironment });
    assert.equal(ended.status, 0);
    assert.equal(inspectPromptRuntime(runtime).pins, 0);

    assert.ok(serveRuntimePrompt(runtime, sessionEvent('controller-operator-retire'), 'root', {
      controllerDescriptorPath: descriptor.descriptorPath,
    }).equals(reviewerPrompt));
    assert.equal(retireSessionPin(runtime, 'controller-operator-retire', {
      expectedGeneration: generation.generationDigest,
    }), true);
    assert.equal(inspectPromptRuntime(runtime).pins, 0);

    const interactive = serveRuntimePrompt(runtime, sessionEvent('interactive-session'), 'root');
    assert.match(interactive.toString(), /controller:root:codex/u);
    const interactivePin = JSON.parse(readFileSync(join(runtime.root, 'sessions',
      readdirSync(join(runtime.root, 'sessions'))[0]), 'utf8'));
    assert.equal(interactivePin.schemaVersion, 1);
  } finally {
    removeRuntime(common);
  }
});

test('session identifiers are hash-only paths and malformed identities fail without diagnostics', () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('ids');
    activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    serveRuntimePrompt(runtime, sessionEvent('../traversal-shaped-✓'), 'root');
    const names = readdirSync(join(runtime.root, 'sessions'));
    assert.equal(names.length, 1);
    assert.match(names[0], /^[0-9a-f]{64}\.json$/u);
    assert.doesNotMatch(names[0], /traversal/u);
    for (const id of ['', 'control\nvalue', 'x'.repeat(257)]) {
      assert.throws(() => serveRuntimePrompt(runtime, sessionEvent(id), 'root'),
        (error) => error.code === 'SESSION_PIN_INVALID');
    }
    const duplicate = Buffer.from('{"hook_event_name":"SessionStart","source":"startup","session_id":"a","session_id":"b"}');
    assert.throws(() => serveRuntimePrompt(runtime, duplicate, 'root'),
      (error) => error.code === 'HOOK_INPUT_INVALID');
  } finally {
    removeRuntime(common);
  }
});

test('corrupt prompt permissions fail closed without changing the active pointer', () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('corrupt');
    const selected = activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    const promptPath = join(runtime.root, 'generations', generation.generationDigest.slice(7), 'root.prompt');
    chmodSync(promptPath, 0o600);
    assert.throws(() => verifyPromptGeneration(runtime, generation.generationDigest),
      (error) => error.code === 'GENERATION_CORRUPT');
    assert.throws(() => serveRuntimePrompt(runtime, sessionEvent('corrupt-session'), 'root'),
      (error) => error.code === 'GENERATION_CORRUPT');
    assert.equal(inspectPromptRuntime(runtime).activeToken, selected.activeToken);
    chmodSync(promptPath, 0o400);
  } finally {
    removeRuntime(common);
  }
});

test('hard-linked generation bytes and the old two-link pin publication state fail closed', () => {
  const { common, runtime, build } = fixture();
  try {
    const generation = build('linked');
    activatePromptGeneration(runtime, generation.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    const promptPath = join(runtime.root, 'generations', generation.generationDigest.slice(7), 'root.prompt');
    const linked = join(common, 'linked-prompt');
    linkSync(promptPath, linked);
    assert.throws(() => verifyPromptGeneration(runtime, generation.generationDigest),
      (error) => error.code === 'GENERATION_CORRUPT');
    rmSync(linked);
    serveRuntimePrompt(runtime, sessionEvent('corrupt-pin'), 'root');
    const pinPath = join(runtime.root, 'sessions', readdirSync(join(runtime.root, 'sessions'))[0]);
    const linkedPin = join(common, 'linked-pin');
    linkSync(pinPath, linkedPin);
    assert.throws(() => serveRuntimePrompt(runtime, sessionEvent('corrupt-pin'), 'root'),
      (error) => error.code === 'SESSION_PIN_INVALID');
    rmSync(linkedPin);
    writeFileSync(pinPath, '{}\n');
    assert.throws(() => cleanupPromptRuntime(runtime), (error) => error.code === 'SESSION_PIN_INVALID');
  } finally {
    removeRuntime(common);
  }
});

test('cleanup is dry-run by default, retains pins, and removes only old inactive unreferenced generations', () => {
  const { common, runtime, build } = fixture();
  try {
    const now = Date.now();
    const g1 = build('retained-pin');
    let selected = activatePromptGeneration(runtime, g1.generationDigest, {
      expectedActive: inspectPromptRuntime(runtime).activeToken,
    });
    serveRuntimePrompt(runtime, sessionEvent('retained-session'), 'root');
    const g2 = build('active');
    selected = activatePromptGeneration(runtime, g2.generationDigest, { expectedActive: selected.activeToken });
    const g3 = build('unreferenced');
    for (const digestValue of [g1.generationDigest, g3.generationDigest]) {
      const directory = join(runtime.root, 'generations', digestValue.slice(7));
      utimesSync(directory, new Date(now - PROMPT_GENERATION_RETENTION_MS),
        new Date(now - PROMPT_GENERATION_RETENTION_MS));
    }
    const dryRun = cleanupPromptRuntime(runtime, { now });
    assert.deepEqual(dryRun.removable, [g3.generationDigest]);
    assert.equal(existsSync(join(runtime.root, 'generations', g3.generationDigest.slice(7))), true);
    const applied = cleanupPromptRuntime(runtime, { now, apply: true });
    assert.equal(applied.removed, 1);
    assert.equal(existsSync(join(runtime.root, 'generations', g3.generationDigest.slice(7))), false);
    assert.equal(existsSync(join(runtime.root, 'generations', g1.generationDigest.slice(7))), true);
    assert.equal(retireSessionPin(runtime, 'retained-session', { expectedGeneration: g1.generationDigest }), true);
    assert.equal(retireSessionPin(runtime, 'retained-session', { expectedGeneration: g1.generationDigest }), false);
    assert.equal(inspectPromptRuntime(runtime).activeToken, selected.activeToken);
  } finally {
    removeRuntime(common);
  }
});
