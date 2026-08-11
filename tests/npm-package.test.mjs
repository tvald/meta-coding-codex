import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { forbiddenLifecycleScripts, validateManifest } from '../scripts/check-npm-package.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmEnvironment = (cache) => ({
  ...process.env,
  npm_config_cache: cache,
  npm_config_update_notifier: 'false',
});

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('base package CLI reports version and bounds unknown commands', () => {
  const version = run(process.execPath, ['bin/meta-framework.mjs', '--version'], { cwd: sourceRoot });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, '1.0.0\n');

  const json = run(process.execPath, ['bin/meta-framework.mjs', 'version', '--json'], { cwd: sourceRoot });
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    schemaVersion: 1,
    name: '@tvald/meta-framework',
    version: '1.0.0',
  });

  const unknown = run(process.execPath, ['bin/meta-framework.mjs', `${'x'.repeat(100_000)}\nunsafe`], { cwd: sourceRoot });
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, '');
  assert.equal(unknown.stderr, 'meta-framework: unknown command; run --help\n');
  assert.ok(Buffer.byteLength(unknown.stderr) <= 4096);
  assert.doesNotMatch(unknown.stderr, /at file:|node:internal/);

  for (const args of [['--help', 'extra'], ['--version', 'extra'], ['version', '--json', 'extra']]) {
    const malformed = run(process.execPath, ['bin/meta-framework.mjs', ...args], { cwd: sourceRoot });
    assert.equal(malformed.status, 2);
    assert.equal(malformed.stdout, '');
    assert.equal(malformed.stderr, 'meta-framework: unknown command; run --help\n');
  }
});

test('package policy rejects every automatic lifecycle hook and implicit node-gyp', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  validateManifest(manifest);
  for (const name of forbiddenLifecycleScripts) {
    const mutated = structuredClone(manifest);
    mutated.scripts = { ...mutated.scripts, [name]: 'exit 99' };
    assert.throws(() => validateManifest(mutated), new RegExp(`forbidden lifecycle script: ${name}`));
  }
  assert.throws(() => validateManifest({ ...manifest, gypfile: true }), /implicit node-gyp installation is forbidden/);
  const driftedCommand = structuredClone(manifest);
  driftedCommand.scripts.meta = 'meta-framework';
  assert.throws(() => validateManifest(driftedCommand), /unexpected source meta command/);
});

test('package policy rejects missing or drifting task compatibility metadata', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  const mutations = [
    (candidate) => { delete candidate.metaFramework.taskCli; },
    (candidate) => { candidate.metaFramework.taskCli.version = '2.0.0'; },
    (candidate) => { candidate.metaFramework.taskCli.envelopeVersions = [2]; },
    (candidate) => { candidate.metaFramework.taskCli.readableStoreSchemaVersions = [2]; },
    (candidate) => { candidate.metaFramework.taskCli.writableStoreSchemaVersions = [2]; },
    (candidate) => { candidate.metaFramework.taskCli.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /task CLI compatibility metadata differs from the runtime contract/);
  }
});

test('package policy rejects missing or drifting provider probe metadata', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  const mutations = [
    (candidate) => { delete candidate.metaFramework.providerProbe; },
    (candidate) => { candidate.metaFramework.providerProbe.version = '2.0.0'; },
    (candidate) => { candidate.metaFramework.providerProbe.envelopeVersions = [2]; },
    (candidate) => { candidate.metaFramework.providerProbe.harnesses.reverse(); },
    (candidate) => { candidate.metaFramework.providerProbe.capabilities = ['unknown']; },
    (candidate) => { candidate.metaFramework.providerProbe.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /provider probe compatibility metadata differs from the runtime contract/);
  }
});

test('package policy rejects missing or drifting prompt compiler metadata', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  const mutations = [
    (candidate) => { delete candidate.metaFramework.promptCompiler; },
    (candidate) => { candidate.metaFramework.promptCompiler.version = '2.0.0'; },
    (candidate) => { candidate.metaFramework.promptCompiler.envelopeVersions = [2]; },
    (candidate) => { candidate.metaFramework.promptCompiler.promptFormatVersions = [2]; },
    (candidate) => { candidate.metaFramework.promptCompiler.registrySchemaVersions = [2]; },
    (candidate) => { candidate.metaFramework.promptCompiler.extensionManifestVersions = [2]; },
    (candidate) => { candidate.metaFramework.promptCompiler.extensionApiVersions = [2]; },
    (candidate) => { candidate.metaFramework.promptCompiler.profiles.reverse(); },
    (candidate) => { candidate.metaFramework.promptCompiler.harnesses = ['portable']; },
    (candidate) => { candidate.metaFramework.promptCompiler.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /prompt compiler compatibility metadata differs from the runtime contract/);
  }
});

test('package policy rejects missing or drifting project initializer metadata', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  const mutations = [
    (candidate) => { delete candidate.metaFramework.projectInit; },
    (candidate) => { candidate.metaFramework.projectInit.version = '2.0.0'; },
    (candidate) => { candidate.metaFramework.projectInit.envelopeVersions = [2]; },
    (candidate) => { candidate.metaFramework.projectInit.bootstrapVersions = [2]; },
    (candidate) => { candidate.metaFramework.projectInit.stateTemplateVersions = [2]; },
    (candidate) => { candidate.metaFramework.projectInit.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /project initializer compatibility metadata differs from the runtime contract/);
  }
});

test('package audit proves exact inventory and byte reproducibility', () => {
  const result = run(process.execPath, ['scripts/check-npm-package.mjs'], { cwd: sourceRoot });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.name, '@tvald/meta-framework');
  assert.equal(summary.version, '1.0.0');
  assert.match(summary.sha256, /^[0-9a-f]{64}$/);
  assert.match(summary.integrity, /^sha512-/);
});

test('package audit never reflects untrusted npm output', { skip: process.platform === 'win32' }, () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-fake-npm-'));
  try {
    const fakeNpm = join(workRoot, 'npm');
    writeFileSync(fakeNpm, '#!/bin/sh\nprintf \'UNTRUSTED\\n\\033[31mCONTROL\\033[0m\\n\' >&2\nexit 9\n');
    chmodSync(fakeNpm, 0o755);
    const checked = run(process.execPath, ['scripts/check-npm-package.mjs'], {
      cwd: sourceRoot,
      env: {
        ...process.env,
        PATH: `${workRoot}${delimiter}${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(checked.status, 1);
    assert.equal(checked.stdout, '');
    assert.equal(checked.stderr, 'package check failed: npm pack --dry-run failed\n');
    assert.doesNotMatch(checked.stderr, /UNTRUSTED|CONTROL|\u001b/);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('packed dependency installs without scripts and runs through the explicit local alias path', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-client-'));
  try {
    const packDirectory = join(workRoot, 'pack');
    const clientDirectory = join(workRoot, 'client');
    const cache = join(workRoot, 'npm-cache');
    mkdirSync(packDirectory);
    mkdirSync(clientDirectory);
    const packed = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
      cwd: sourceRoot,
      env: npmEnvironment(cache),
    });
    assert.equal(packed.status, 0, packed.stderr);
    const [{ filename }] = JSON.parse(packed.stdout);
    const tarballPath = join(packDirectory, filename);

    writeJson(join(clientDirectory, 'package.json'), {
      name: 'meta-framework-client-fixture',
      private: true,
      scripts: {
        meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs',
      },
      dependencies: {
        'meta-framework': `file:${tarballPath}`,
      },
    });
    const locked = run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: clientDirectory,
      env: npmEnvironment(cache),
    });
    assert.equal(locked.status, 0, locked.stderr);
    const lockPath = join(clientDirectory, 'package-lock.json');
    const lockDigest = sha256(lockPath);
    const installed = run('npm', ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
      cwd: clientDirectory,
      env: npmEnvironment(cache),
    });
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(sha256(lockPath), lockDigest, 'npm ci changed the client lockfile');

    const invoked = run('npm', ['run', '--silent', 'meta', '--', '--version'], {
      cwd: clientDirectory,
      env: npmEnvironment(cache),
    });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.equal(invoked.stdout, '1.0.0\n');

    const installedManifest = JSON.parse(readFileSync(join(clientDirectory, 'node_modules/meta-framework/package.json'), 'utf8'));
    assert.equal(installedManifest.name, '@tvald/meta-framework');
    assert.equal(installedManifest.version, '1.0.0');
    for (const name of forbiddenLifecycleScripts) {
      assert.equal(Object.hasOwn(installedManifest.scripts ?? {}, name), false);
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('explicit local path cannot fall through to a hostile inherited PATH binary', { skip: process.platform === 'win32' }, () => {
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'meta-framework-path-'));
  const workRoot = join(cleanupRoot, "quote' path;$");
  try {
    mkdirSync(workRoot);
    const clientDirectory = join(workRoot, 'client');
    const hostileDirectory = join(workRoot, 'hostile-bin');
    const cache = join(workRoot, 'npm-cache');
    const sentinel = join(workRoot, 'hostile-ran');
    mkdirSync(clientDirectory);
    mkdirSync(hostileDirectory);
    const hostilePath = join(hostileDirectory, 'meta-framework');
    writeFileSync(hostilePath, '#!/bin/sh\n: > "$META_FRAMEWORK_SENTINEL"\nprintf \'%s\\n\' HOSTILE\n');
    chmodSync(hostilePath, 0o755);
    const environment = {
      ...npmEnvironment(cache),
      PATH: `${hostileDirectory}${delimiter}${process.env.PATH ?? ''}`,
      META_FRAMEWORK_SENTINEL: sentinel,
    };

    writeJson(join(clientDirectory, 'package.json'), {
      name: 'bare-path-counterfactual',
      private: true,
      scripts: { meta: 'meta-framework' },
    });
    const counterfactual = run('npm', ['run', '--silent', 'meta'], {
      cwd: clientDirectory,
      env: environment,
    });
    assert.equal(counterfactual.status, 0, counterfactual.stderr);
    assert.equal(readFileSync(sentinel, 'utf8'), '');
    rmSync(sentinel);

    writeJson(join(clientDirectory, 'package.json'), {
      name: 'explicit-local-path-fixture',
      private: true,
      scripts: { meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs' },
    });
    const guarded = run('npm', ['run', '--silent', 'meta'], {
      cwd: clientDirectory,
      env: environment,
    });
    assert.notEqual(guarded.status, 0);
    assert.throws(() => readFileSync(sentinel));
    assert.doesNotMatch(`${guarded.stdout}${guarded.stderr}`, /HOSTILE/);
    assert.equal(existsSync(join(clientDirectory, 'node_modules')), false);
  } finally {
    rmSync(cleanupRoot, { recursive: true, force: true });
  }
});
