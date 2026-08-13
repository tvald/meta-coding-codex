import assert from 'node:assert/strict';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
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

function treeDigest(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const relativePath = relative(root, absolute).split('\\').join('/');
      const info = lstatSync(absolute);
      assert.equal(info.isSymbolicLink(), false, `unexpected symbolic link: ${relativePath}`);
      hash.update(`${relativePath}\0${info.mode & 0o777}\0${info.size}\0`);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) hash.update(readFileSync(absolute));
      else assert.fail(`unexpected file type: ${relativePath}`);
    }
  };
  visit(root);
  return hash.digest('hex');
}

function clientStateDigest(root) {
  const hash = createHash('sha256');
  for (const relativePath of ['AGENTS.md', 'CLAUDE.md', 'readme']) {
    const absolute = join(root, relativePath);
    const info = lstatSync(absolute);
    hash.update(`${relativePath}\0${info.mode & 0o777}\0${info.size}\0`);
    if (info.isFile()) hash.update(readFileSync(absolute));
    else hash.update(treeDigest(absolute));
  }
  return hash.digest('hex');
}

function copyPackageCandidate(target, version) {
  const inventory = JSON.parse(readFileSync(join(sourceRoot, 'package-files.json'), 'utf8'));
  for (const relativePath of ['package.json', ...inventory.files]) {
    const source = join(sourceRoot, ...relativePath.split('/'));
    const destination = join(target, ...relativePath.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  manifest.version = version;
  writeJson(join(target, 'package.json'), manifest);
}

function normalizeFrameworkLock(clientRoot, version) {
  const alias = `npm:@tvald/meta-framework@${version}`;
  const manifestPath = join(clientRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies['meta-framework'] = alias;
  writeJson(manifestPath, manifest);
  const lockPath = join(clientRoot, 'package-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.packages[''].dependencies['meta-framework'] = alias;
  const installed = lock.packages['node_modules/meta-framework'];
  installed.name = '@tvald/meta-framework';
  installed.resolved = `https://registry.npmjs.org/@tvald/meta-framework/-/meta-framework-${version}.tgz`;
  assert.equal(installed.version, version);
  assert.match(installed.integrity, /^sha512-/u);
  writeJson(lockPath, lock);
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
    (candidate) => { candidate.metaFramework.taskCli.version = '3.0.0'; },
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
    (candidate) => { candidate.metaFramework.projectInit.optionalHarnesses = ['claude']; },
    (candidate) => { candidate.metaFramework.projectInit.codexIntegrationConfigVersions = [2]; },
    (candidate) => { candidate.metaFramework.projectInit.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /project initializer compatibility metadata differs from the runtime contract/);
  }
});

test('package policy rejects missing or drifting hook adapter metadata', () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  const mutations = [
    (candidate) => { delete candidate.metaFramework.hookAdapter; },
    (candidate) => { candidate.metaFramework.hookAdapter.version = '2.0.0'; },
    (candidate) => { candidate.metaFramework.hookAdapter.envelopeVersions = [2]; },
    (candidate) => { candidate.metaFramework.hookAdapter.hookEventSchemaVersions = [2]; },
    (candidate) => { candidate.metaFramework.hookAdapter.integrationConfigVersions = [2]; },
    (candidate) => { candidate.metaFramework.hookAdapter.harnesses = ['claude']; },
    (candidate) => { candidate.metaFramework.hookAdapter.profiles.reverse(); },
    (candidate) => { candidate.metaFramework.hookAdapter.testedCodexVersions = ['9.9.9']; },
    (candidate) => { candidate.metaFramework.hookAdapter.unreviewed = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate),
      /hook adapter compatibility metadata differs from the runtime contract/);
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

    const invoked = run('npm', ['run', '--ignore-scripts', '--silent', 'meta', '--', '--version'], {
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
    const counterfactual = run('npm', ['run', '--ignore-scripts', '--silent', 'meta'], {
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
    const guarded = run('npm', ['run', '--ignore-scripts', '--silent', 'meta'], {
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

test('clean client replacement and exact rollback preserve state with scripts disabled', {
  skip: process.platform === 'win32',
  timeout: 120_000,
}, () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-release-'));
  try {
    const cache = join(workRoot, 'npm-cache');
    const packDirectory = join(workRoot, 'pack');
    const candidateSource = join(workRoot, 'candidate-source');
    const hookSource = join(workRoot, 'hook-source');
    const clientRoot = join(workRoot, 'client');
    const sentinel = join(workRoot, 'lifecycle-ran');
    mkdirSync(packDirectory);
    mkdirSync(candidateSource);
    mkdirSync(hookSource);
    mkdirSync(clientRoot);
    const environment = {
      ...npmEnvironment(cache),
      npm_config_offline: 'true',
      META_FRAMEWORK_HOOK_SENTINEL: sentinel,
    };

    const packedPrior = run('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory,
    ], { cwd: sourceRoot, env: npmEnvironment(cache) });
    assert.equal(packedPrior.status, 0, packedPrior.stderr);
    const [{ filename: priorFilename }] = JSON.parse(packedPrior.stdout);
    const priorTarball = join(packDirectory, priorFilename);

    copyPackageCandidate(candidateSource, '1.0.1');
    const packedCandidate = run('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory,
    ], { cwd: candidateSource, env: npmEnvironment(cache) });
    assert.equal(packedCandidate.status, 0, packedCandidate.stderr);
    const [{ filename: candidateFilename }] = JSON.parse(packedCandidate.stdout);
    const candidateTarball = join(packDirectory, candidateFilename);

    writeJson(join(hookSource, 'package.json'), {
      name: 'meta-framework-lifecycle-sentinel',
      version: '1.0.0',
      scripts: {
        preinstall: 'node hook.mjs',
        postinstall: 'node hook.mjs',
      },
    });
    writeFileSync(join(hookSource, 'hook.mjs'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.META_FRAMEWORK_HOOK_SENTINEL, 'ran\\n');\n");
    const packedHook = run('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory,
    ], { cwd: hookSource, env: npmEnvironment(cache) });
    assert.equal(packedHook.status, 0, packedHook.stderr);
    const [{ filename: hookFilename }] = JSON.parse(packedHook.stdout);
    const hookTarball = join(packDirectory, hookFilename);

    writeFileSync(join(clientRoot, 'hook.mjs'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.META_FRAMEWORK_HOOK_SENTINEL, 'ran\\n');\n");
    writeJson(join(clientRoot, 'package.json'), {
      name: 'meta-framework-release-client',
      private: true,
      scripts: {
        premeta: 'node hook.mjs',
        meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs',
        postmeta: 'node hook.mjs',
      },
      dependencies: {
        'meta-framework': `file:${priorTarball}`,
        'meta-framework-lifecycle-sentinel': `file:${hookTarball}`,
      },
    });
    const lockPriorFile = run('npm', [
      'install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(lockPriorFile.status, 0, lockPriorFile.stderr);
    const installPriorFile = run('npm', [
      'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(installPriorFile.status, 0, installPriorFile.stderr);
    assert.equal(existsSync(sentinel), false);

    normalizeFrameworkLock(clientRoot, '1.0.0');
    rmSync(join(clientRoot, 'node_modules'), { recursive: true, force: true });
    const installPriorLocked = run('npm', [
      'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(installPriorLocked.status, 0, installPriorLocked.stderr);
    assert.equal(existsSync(sentinel), false);

    const gitInit = run('git', ['init', '-q'], { cwd: clientRoot });
    assert.equal(gitInit.status, 0, gitInit.stderr);
    const invoke = (args) => run('npm', [
      'run', '--ignore-scripts', '--silent', 'meta', '--', ...args,
    ], { cwd: clientRoot, env: environment });
    assert.equal(invoke(['--version']).stdout, '1.0.0\n');
    assert.equal(existsSync(sentinel), false, 'npm run executed a pre/post script');
    const safeClientManifest = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8'));
    delete safeClientManifest.scripts.premeta;
    delete safeClientManifest.scripts.postmeta;
    writeJson(join(clientRoot, 'package.json'), safeClientManifest);
    const initialized = invoke(['project', 'init']);
    assert.equal(initialized.status, 0, initialized.stderr);
    for (const args of [['tasks', 'doctor'], ['tasks', 'startup']]) {
      const result = invoke(args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(existsSync(join(clientRoot, 'readme', 'meta')), false);
    for (const discoveryRoot of ['.agents', '.claude', '.codex']) {
      assert.equal(existsSync(join(clientRoot, discoveryRoot)), false);
    }

    const registry = JSON.parse(readFileSync(join(sourceRoot, 'prompts', 'registry-v1.json'), 'utf8'));
    for (const profile of registry.profiles.map(({ id }) => id)) {
      for (const harness of registry.harnesses.map(({ id }) => id)) {
        const prompt = invoke(['agent-prompt', '--profile', profile, '--harness', harness]);
        assert.equal(prompt.status, 0, prompt.stderr);
        assert.match(prompt.stdout, /^META-FRAMEWORK-AGENT-PROMPT 1\n/u);
      }
    }
    for (const { id } of registry.documents) {
      const documented = invoke(['docs', id]);
      assert.equal(documented.status, 0, documented.stderr);
    }
    for (const { id } of registry.facets) {
      const explained = invoke(['explain', id]);
      assert.equal(explained.status, 0, explained.stderr);
    }
    assert.equal(existsSync(sentinel), false, 'npm run executed a pre/post script');

    const priorManifest = readFileSync(join(clientRoot, 'package.json'));
    const priorLock = readFileSync(join(clientRoot, 'package-lock.json'));
    const priorState = clientStateDigest(clientRoot);
    const priorPackage = treeDigest(join(clientRoot, 'node_modules', 'meta-framework'));

    const candidateManifest = JSON.parse(priorManifest.toString('utf8'));
    candidateManifest.dependencies['meta-framework'] = `file:${candidateTarball}`;
    writeJson(join(clientRoot, 'package.json'), candidateManifest);
    const lockCandidateFile = run('npm', [
      'install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(lockCandidateFile.status, 0, lockCandidateFile.stderr);
    const installCandidateFile = run('npm', [
      'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(installCandidateFile.status, 0, installCandidateFile.stderr);
    normalizeFrameworkLock(clientRoot, '1.0.1');
    rmSync(join(clientRoot, 'node_modules'), { recursive: true, force: true });
    const installCandidateLocked = run('npm', [
      'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(installCandidateLocked.status, 0, installCandidateLocked.stderr);
    assert.equal(invoke(['--version']).stdout, '1.0.1\n');
    for (const args of [['project', 'preflight'], ['tasks', 'doctor'], ['tasks', 'startup']]) {
      const result = invoke(args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(clientStateDigest(clientRoot), priorState, 'replacement changed client-owned state');
    assert.equal(existsSync(sentinel), false);

    writeFileSync(join(clientRoot, 'package.json'), priorManifest);
    writeFileSync(join(clientRoot, 'package-lock.json'), priorLock);
    rmSync(join(clientRoot, 'node_modules'), { recursive: true, force: true });
    const rolledBack = run('npm', [
      'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
    ], { cwd: clientRoot, env: environment });
    assert.equal(rolledBack.status, 0, rolledBack.stderr);
    assert.deepEqual(readFileSync(join(clientRoot, 'package.json')), priorManifest);
    assert.deepEqual(readFileSync(join(clientRoot, 'package-lock.json')), priorLock);
    assert.equal(invoke(['--version']).stdout, '1.0.0\n');
    assert.equal(treeDigest(join(clientRoot, 'node_modules', 'meta-framework')), priorPackage,
      'rollback did not restore the exact prior package tree');
    assert.equal(clientStateDigest(clientRoot), priorState, 'rollback changed client-owned state');
    for (const args of [['project', 'preflight'], ['tasks', 'doctor'], ['tasks', 'startup']]) {
      const result = invoke(args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(existsSync(sentinel), false);

    const missingRoot = join(workRoot, 'missing-client');
    const hostileRoot = join(workRoot, 'hostile-bin');
    const hostileSentinel = join(workRoot, 'hostile-ran');
    mkdirSync(missingRoot);
    mkdirSync(hostileRoot);
    writeJson(join(missingRoot, 'package.json'), {
      name: 'meta-framework-missing-release-client',
      private: true,
      scripts: { meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs' },
    });
    const hostileBinary = join(hostileRoot, 'meta-framework');
    writeFileSync(hostileBinary, '#!/bin/sh\n: > "$META_FRAMEWORK_HOSTILE_SENTINEL"\n');
    chmodSync(hostileBinary, 0o755);
    const missing = run('npm', ['run', '--ignore-scripts', '--silent', 'meta', '--', '--version'], {
      cwd: missingRoot,
      env: {
        ...environment,
        PATH: `${hostileRoot}${delimiter}${process.env.PATH ?? ''}`,
        META_FRAMEWORK_HOSTILE_SENTINEL: hostileSentinel,
        npm_config_registry: 'http://127.0.0.1:9/',
      },
    });
    assert.notEqual(missing.status, 0);
    assert.equal(existsSync(hostileSentinel), false);
    assert.equal(existsSync(join(missingRoot, 'node_modules')), false);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});
