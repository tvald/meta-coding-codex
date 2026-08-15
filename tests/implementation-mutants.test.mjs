import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reducerPath = path.join(repositoryRoot, 'lib', 'implementation-reducer.mjs');
const protocolPath = path.join(repositoryRoot, 'lib', 'implementation-protocol.mjs');
const workspacePath = path.join(repositoryRoot, 'lib', 'implementation-workspace.mjs');
const activationPath = path.join(repositoryRoot, 'lib', 'implementation-activation.mjs');
const bindingPath = path.join(repositoryRoot, 'lib', 'implementation-binding.mjs');
const providerPath = path.join(repositoryRoot, 'lib', 'implementation-provider.mjs');
const effectCapabilityPath = path.join(repositoryRoot, 'lib', 'implementation-effect-capability.mjs');

const bindingLiteral = `{
  runId: 'run_1', epoch: 1, snapshotRevision: 2,
  taskId: 'T-0054', taskRevision: 2, taskRecordVersion: 5,
  capsuleDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  controlGeneration: 0, correctionGeneration: 0,
}`;

const mutants = [
  {
    name: 'binding fence invariant',
    search: `export function bindingAuthorizesEffect(expected, candidate) {
  return bindingEquals(expected, candidate);
}`,
    replacement: `export function bindingAuthorizesEffect(expected, candidate) {
  return true;
}`,
    invariant: `
import assert from 'node:assert/strict';
import test from 'node:test';
import { bindingAuthorizesEffect } from './implementation-reducer.mjs';
const binding = ${bindingLiteral};
test('binding fence invariant', () => {
  assert.equal(bindingAuthorizesEffect(binding, { ...binding, epoch: 2 }), false);
});
`,
  },
  {
    name: 'task revision invariant',
    search: `export function taskRevisionAuthorizesEffect(binding, task) {
  validateBinding(binding);
  return task !== null && typeof task === 'object' && !Array.isArray(task) &&
    task.id === binding.taskId && task.taskRevision === binding.taskRevision &&
    task.recordVersion === binding.taskRecordVersion && task.status === 'active';
}`,
    replacement: `export function taskRevisionAuthorizesEffect(binding, task) {
  validateBinding(binding);
  return true;
}`,
    invariant: `
import assert from 'node:assert/strict';
import test from 'node:test';
import { taskRevisionAuthorizesEffect } from './implementation-reducer.mjs';
const binding = ${bindingLiteral};
test('task revision invariant', () => {
  assert.equal(taskRevisionAuthorizesEffect(binding, {
    id: 'T-0054', taskRevision: 3, recordVersion: 6, status: 'active',
  }), false);
});
`,
  },
  {
    name: 'postcondition acknowledgement invariant',
    search: `export function postconditionAuthorizesAcknowledgement(operation) {
  return operation !== null && typeof operation === 'object' && !Array.isArray(operation) &&
    TERMINAL_OPERATION_STATES.has(operation.state) && operation.receipt !== null;
}`,
    replacement: `export function postconditionAuthorizesAcknowledgement(operation) {
  return true;
}`,
    invariant: `
import assert from 'node:assert/strict';
import test from 'node:test';
import { postconditionAuthorizesAcknowledgement } from './implementation-reducer.mjs';
test('postcondition acknowledgement invariant', () => {
  assert.equal(postconditionAuthorizesAcknowledgement({ state: 'observed_succeeded', receipt: null }), false);
});
`,
  },
  {
    name: 'sticky stop invariant',
    search: `  if (snapshot.stop?.requested === true &&
      !['stopping', 'reconciliation_required', 'stopped', 'superseded'].includes(nextPhase)) {
    fail('STOP_DOMINATES', 'a durable stop prevents the requested run transition');
  }`,
    replacement: `  if (false) {
    fail('STOP_DOMINATES', 'a durable stop prevents the requested run transition');
  }`,
    invariant: `
import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionRun } from './implementation-reducer.mjs';
test('sticky stop invariant', () => {
  const snapshot = {
    revision: 2,
    phase: 'dormant',
    stop: { requested: true, mode: 'checkpoint', reasonDigest: null },
    reconciliation: { required: false, reasonCode: null, refs: [] },
  };
  assert.throws(() => transitionRun(snapshot, {
    expectedRevision: 2,
    nextPhase: 'orienting',
    observation: 'wake_changed',
    updatedAt: '2026-08-14T10:00:00.000Z',
  }), (error) => error.code === 'STOP_DOMINATES');
});
`,
  },
  {
    name: 'workspace ownership invariant',
    sourcePath: workspacePath,
    search: `export function changedPathsWithinOwnership(changedPaths, ownership, {
  protectedPaths = DEFAULT_PROTECTED_PATHS,
} = {}) {
  if (!Array.isArray(changedPaths) || !Array.isArray(ownership?.writePaths) ||
      !Array.isArray(protectedPaths) || changedPaths.length > 10_000 || ownership.writePaths.length > 128) {
    fail('OWNERSHIP_INVALID', 'workspace ownership input is invalid');
  }
  const effectiveProtected = effectiveProtectedPaths(protectedPaths);
  const writes = [...new Set(ownership.writePaths)].sort();
  const changed = [...new Set(changedPaths)].sort();
  for (const owned of writes) pathParts(owned, 'ownership path');
  for (const candidate of changed) {
    pathParts(candidate, 'changed path');
    if (effectiveProtected.some((protectedPath) => pathContains(protectedPath, candidate) ||
        pathContains(candidate, protectedPath))) return false;
    if (!writes.some((owned) => pathContains(owned, candidate))) return false;
  }
  return true;
}`,
    replacement: `export function changedPathsWithinOwnership(changedPaths, ownership, {
  protectedPaths = DEFAULT_PROTECTED_PATHS,
} = {}) {
  return true;
}`,
    invariant: `
import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPathsWithinOwnership } from './implementation-workspace.mjs';
test('workspace ownership invariant', () => {
  assert.equal(changedPathsWithinOwnership(
    ['readme/tasks/store/records/0000/T-0054.json'],
    { writePaths: ['readme/tasks/store/records/0000/T-0054.json'] },
  ), false);
});
`,
  },
];

function replaceExactlyOnce(source, search, replacement) {
  const matches = source.split(search).length - 1;
  assert.equal(matches, 1, 'counterfactual mutation must replace exactly one source site');
  return source.replace(search, replacement);
}

function runInvariant(testPath) {
  const environment = { ...process.env, NODE_OPTIONS: '', NODE_DISABLE_COMPILE_CACHE: '1' };
  delete environment.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', testPath], {
    cwd: path.dirname(testPath),
    encoding: 'utf8',
    env: environment,
  });
}

for (const mutant of mutants) {
  test(`counterfactual: ${mutant.name} is necessary`, async (context) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'implementation-mutant-'));
    context.after(async () => rm(directory, { recursive: true, force: true }));
    const sourcePath = mutant.sourcePath ?? reducerPath;
    const moduleName = path.basename(sourcePath);
    const copiedModule = path.join(directory, moduleName);
    const copiedProtocol = path.join(directory, 'implementation-protocol.mjs');
    const copiedActivation = path.join(directory, 'implementation-activation.mjs');
    const copiedBinding = path.join(directory, 'implementation-binding.mjs');
    const copiedProvider = path.join(directory, 'implementation-provider.mjs');
    const copiedEffectCapability = path.join(directory, 'implementation-effect-capability.mjs');
    const mutantModuleName = moduleName.replace(/\.mjs$/u, '-mutant.mjs');
    const mutantModule = path.join(directory, mutantModuleName);
    const invariantPath = path.join(directory, 'invariant.test.mjs');
    const mutantInvariantPath = path.join(directory, 'mutant-invariant.test.mjs');
    await copyFile(sourcePath, copiedModule);
    await copyFile(protocolPath, copiedProtocol);
    await copyFile(activationPath, copiedActivation);
    await copyFile(bindingPath, copiedBinding);
    await copyFile(providerPath, copiedProvider);
    await copyFile(effectCapabilityPath, copiedEffectCapability);
    await writeFile(invariantPath, mutant.invariant, 'utf8');

    const baseline = runInvariant(invariantPath);
    assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);

    const source = await readFile(copiedModule, 'utf8');
    await writeFile(mutantModule, replaceExactlyOnce(source, mutant.search, mutant.replacement), 'utf8');
    await writeFile(mutantInvariantPath,
      replaceExactlyOnce(mutant.invariant,
        `from './${moduleName}'`, `from './${mutantModuleName}'`),
      'utf8');
    const counterfactual = runInvariant(mutantInvariantPath);
    const output = `${counterfactual.stdout}\n${counterfactual.stderr}`;
    assert.notEqual(counterfactual.status, 0, 'the matching invariant must fail against its mutant');
    assert.match(output, new RegExp(mutant.name));
    assert.match(output, /AssertionError/u,
      'the counterfactual must be rejected by the matching invariant assertion');
    assert.doesNotMatch(output, /SyntaxError|ERR_MODULE_NOT_FOUND/u,
      'the counterfactual must fail its assertion, not module loading');
  });
}
