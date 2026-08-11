import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function npmEnvironment(cache) {
  return {
    ...process.env,
    npm_config_cache: cache,
    npm_config_update_notifier: 'false',
  };
}

function executableOnPath(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory === '') continue;
    const candidate = join(directory, name);
    const info = lstatSync(candidate, { throwIfNoEntry: false });
    if (info?.isFile() && (info.mode & 0o111) !== 0) return candidate;
  }
  throw new Error(`${name} is unavailable on PATH`);
}

function treeDigest(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = relative(root, absolute).split('\\').join('/');
      const info = lstatSync(absolute);
      assert.equal(info.isSymbolicLink(), false, `unexpected package symlink: ${path}`);
      hash.update(`${path}\0${info.mode & 0o777}\0${info.size}\0`);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) hash.update(readFileSync(absolute));
      else assert.fail(`unexpected package entry type: ${path}`);
    }
  };
  visit(root);
  return hash.digest('hex');
}

function clientCursor() {
  return `# Project State

## Maintenance Cadence

- Last maintenance pass: 2026-08-11
- Next trigger: 2026-09-10 or 10 repository-changing completions
`;
}

function makeInstalledClient(workRoot, name = 'client') {
  const packDirectory = join(workRoot, `${name}-pack`);
  const clientRoot = join(workRoot, name);
  const cache = join(workRoot, `${name}-cache`);
  mkdirSync(packDirectory);
  mkdirSync(clientRoot);
  const packed = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
    cwd: sourceRoot,
    env: npmEnvironment(cache),
  });
  assert.equal(packed.status, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = join(packDirectory, filename);
  writeJson(join(clientRoot, 'package.json'), {
    name: `meta-framework-${name}`,
    private: true,
    scripts: { meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs' },
    dependencies: { 'meta-framework': `file:${tarball}` },
  });
  const locked = run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: clientRoot,
    env: npmEnvironment(cache),
  });
  assert.equal(locked.status, 0, locked.stderr);
  const installed = run('npm', ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
    cwd: clientRoot,
    env: npmEnvironment(cache),
  });
  assert.equal(installed.status, 0, installed.stderr);
  const exactAlias = 'npm:@tvald/meta-framework@1.0.0';
  const clientManifest = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8'));
  clientManifest.dependencies['meta-framework'] = exactAlias;
  writeJson(join(clientRoot, 'package.json'), clientManifest);
  const clientLock = JSON.parse(readFileSync(join(clientRoot, 'package-lock.json'), 'utf8'));
  clientLock.packages[''].dependencies['meta-framework'] = exactAlias;
  clientLock.packages['node_modules/meta-framework'].name = '@tvald/meta-framework';
  clientLock.packages['node_modules/meta-framework'].resolved =
    'https://registry.npmjs.org/@tvald/meta-framework/-/meta-framework-1.0.0.tgz';
  assert.match(clientLock.packages['node_modules/meta-framework'].integrity, /^sha512-/u);
  writeJson(join(clientRoot, 'package-lock.json'), clientLock);
  execFileSync('git', ['init', '-q'], { cwd: clientRoot });
  writeFileSync(join(clientRoot, 'AGENTS.md'), '# Agent Instructions\n');
  mkdirSync(join(clientRoot, 'readme', 'tasks'), { recursive: true });
  writeFileSync(join(clientRoot, 'readme', 'README.md'), clientCursor());
  writeFileSync(join(clientRoot, 'readme', 'tasks', 'README.md'),
    '# Task Store\n\nUse `npm run --silent meta -- tasks doctor` and `npm run --silent meta -- tasks startup`.\n');
  return {
    clientRoot,
    cache,
    packageRoot: join(clientRoot, 'node_modules', 'meta-framework'),
    binary: join(clientRoot, 'node_modules', 'meta-framework', 'bin', 'meta-framework.mjs'),
  };
}

function meta(client, args, expectedStatus = 0, cwd = client.clientRoot, extraEnvironment = {}) {
  const result = run('npm', ['run', '--silent', 'meta', '--', ...args], {
    cwd,
    env: { ...npmEnvironment(client.cache), ...extraEnvironment },
  });
  assert.equal(result.status, expectedStatus,
    `unexpected status for ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function metaJson(client, args, expectedStatus = 0, cwd = client.clientRoot) {
  const result = meta(client, args, expectedStatus, cwd);
  return { ...result, value: JSON.parse(result.stdout) };
}

test('packed task CLI uses package resources and mutates only the client Git root', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-tasks-'));
  try {
    const client = makeInstalledClient(workRoot);
    assert.equal(lstatSync(join(client.clientRoot, 'readme', 'meta'), { throwIfNoEntry: false }), undefined);
    const packageDigest = treeDigest(client.packageRoot);

    const compatibility = metaJson(client, ['tasks', '--version']).value;
    assert.deepEqual(compatibility, {
      schemaVersion: 1,
      package: { name: '@tvald/meta-framework', version: '1.0.0' },
      taskCli: {
        version: '1.0.0',
        envelopeVersions: [1],
        readableStoreSchemaVersions: [1],
        writableStoreSchemaVersions: [1],
      },
    });
    assert.equal(metaJson(client, ['tasks', 'preflight']).value.disposition, 'ready_to_initialize');
    metaJson(client, ['tasks', 'init']);

    const doctor = metaJson(client, ['tasks', 'doctor']).value;
    assert.equal(doctor.ok, true);
    assert.equal(doctor.checks.find(({ id }) => id === 'process_inventory').details.count, 11);
    assert.equal(doctor.checks.find(({ id }) => id === 'template_inventory').details.count, 12);
    assert.deepEqual(doctor.checks.find(({ id }) => id === 'framework_changelog').details, {
      sourceRepository: false,
      activePath: 'readme/meta/framework-changelog.md',
      lines: 30,
      entries: 0,
    });
    const hostileGit = join(client.clientRoot, 'node_modules', '.bin', 'git');
    const gitSentinel = join(workRoot, 'client-git-ran');
    writeFileSync(hostileGit, '#!/bin/sh\n: > "$META_FRAMEWORK_GIT_SENTINEL"\nexit 99\n');
    chmodSync(hostileGit, 0o755);
    const sanitizedGit = meta(client, ['tasks', 'doctor'], 0, client.clientRoot, {
      META_FRAMEWORK_GIT_SENTINEL: gitSentinel,
      GIT_DIR: join(workRoot, 'hostile-git-dir'),
      GIT_WORK_TREE: join(workRoot, 'hostile-work-tree'),
    });
    assert.equal(JSON.parse(sanitizedGit.stdout).ok, true);
    assert.equal(lstatSync(gitSentinel, { throwIfNoEntry: false }), undefined);
    rmSync(hostileGit);
    assert.equal(metaJson(client, ['tasks', 'startup']).value.data.counts.pending, 0);

    mkdirSync(join(client.clientRoot, 'readme', 'meta', 'framework-data', 'schemas'), { recursive: true });
    writeFileSync(join(client.clientRoot, 'readme', 'meta', 'framework-data', 'schemas', 'task-v1.schema.json'),
      '{"schemaVersion":"hostile-client-shadow"}\n');
    writeFileSync(join(client.clientRoot, 'readme', 'meta', 'root-loop.md'),
      '# Hostile client shadow\n\n[Missing](not-there.md)\n');
    assert.equal(metaJson(client, ['tasks', 'preflight']).value.integrity, 'valid');
    assert.equal(metaJson(client, ['tasks', 'doctor']).value.ok, true);

    const added = metaJson(client, [
      'tasks', 'task', 'add',
      '--outcome', 'Exercise installed mutation',
      '--authority-reference', 'T-0026 fixture',
      '--accepted-date', '2026-08-11',
      '--status', 'ready',
      '--route', 'quick_change',
      '--risk', 'low',
      '--next-safe-action', 'Select the fixture',
    ]).value.data;
    assert.equal(added.id, 'T-0001');
    const digest = metaJson(client, ['tasks', 'doctor']).value.storeDigest;
    const selected = metaJson(client, [
      'tasks', 'task', 'select', added.id,
      '--expected-record-version', String(added.recordVersion),
      '--expected-store-digest', digest,
    ]).value.data;
    assert.equal(selected.status, 'active');
    assert.equal(metaJson(client, ['tasks', 'startup']).value.data.primaryTask.id, added.id);
    const checkpointed = metaJson(client, [
      'tasks', 'task', 'checkpoint', added.id,
      '--expected-record-version', String(selected.recordVersion),
      '--status', 'needs_verification',
      '--next-safe-action', 'Close the fixture',
    ]).value.data;
    const closed = metaJson(client, [
      'tasks', 'task', 'close', added.id,
      '--expected-record-version', String(checkpointed.recordVersion),
      '--status', 'done',
      '--completed-at', '2026-08-11',
      '--repository-changed', 'false',
      '--evidence', 'Installed task CLI fixture passed',
    ]).value.data;
    assert.equal(closed.status, 'done');

    mkdirSync(join(client.clientRoot, 'readme', 'quality'), { recursive: true });
    writeFileSync(join(client.clientRoot, 'readme', 'quality', 'fixture-approval.md'), '# Fixture approval\n');
    const target = metaJson(client, [
      'tasks', 'task', 'add',
      '--outcome', 'Exercise remaining mutations',
      '--authority-reference', 'T-0026 fixture',
    ]).value.data;
    const amended = metaJson(client, [
      'tasks', 'task', 'amend', target.id,
      '--expected-record-version', String(target.recordVersion),
      '--outcome', 'Exercise every installed semantic mutation',
      '--authority-reference', 'T-0026 revised fixture',
      '--accepted-date', '2026-08-11',
      '--route', 'quick_change',
      '--risk', 'low',
      '--next-safe-action', 'Bind dependency and approval',
    ]).value.data;
    const dependencyDigest = metaJson(client, ['tasks', 'doctor']).value.storeDigest;
    const dependent = metaJson(client, [
      'tasks', 'task', 'set-dependencies', target.id,
      '--expected-record-version', String(amended.recordVersion),
      '--expected-store-digest', dependencyDigest,
      '--depends-on', added.id,
    ]).value.data;
    const approved = metaJson(client, [
      'tasks', 'task', 'record-approval', target.id,
      '--expected-record-version', String(dependent.recordVersion),
      '--id', 'fixture-approval',
      '--status', 'granted',
      '--source', 'T-0026 fixture',
      '--action', 'Select the installed-surface task',
      '--boundary', 'Fixture repository only',
      '--detail-path', 'readme/quality/fixture-approval.md',
    ]).value.data;
    const readied = metaJson(client, [
      'tasks', 'task', 'checkpoint', target.id,
      '--expected-record-version', String(approved.recordVersion),
      '--status', 'ready',
      '--next-safe-action', 'Select the target',
    ]).value.data;
    const targetDigest = metaJson(client, ['tasks', 'doctor']).value.storeDigest;
    const targetSelected = metaJson(client, [
      'tasks', 'task', 'select', target.id,
      '--expected-record-version', String(readied.recordVersion),
      '--expected-store-digest', targetDigest,
    ]).value.data;
    const targetRecordPath = join(client.clientRoot, 'readme', 'tasks', 'store',
      'records', '0000', `${target.id}.json`);
    const beforeStaleMutation = readFileSync(targetRecordPath);
    const stale = meta(client, [
      'tasks', 'task', 'checkpoint', target.id,
      '--expected-record-version', String(targetSelected.recordVersion - 1),
      '--status', 'needs_verification',
      '--next-safe-action', 'Must not be written',
    ], 4);
    assert.match(stale.stderr, /STALE_RECORD/u);
    assert.deepEqual(readFileSync(targetRecordPath), beforeStaleMutation);
    const bounded = meta(client, ['tasks', 'task', 'list', '--limit', '1', '--max-bytes', '4096']);
    assert.ok(Buffer.byteLength(bounded.stdout) <= 4096);
    assert.equal(JSON.parse(bounded.stdout).meta.emitted, 1);
    const targetCheckpointed = metaJson(client, [
      'tasks', 'task', 'checkpoint', target.id,
      '--expected-record-version', String(targetSelected.recordVersion),
      '--status', 'needs_verification',
      '--next-safe-action', 'Close the target',
    ]).value.data;
    assert.equal(metaJson(client, [
      'tasks', 'task', 'close', target.id,
      '--expected-record-version', String(targetCheckpointed.recordVersion),
      '--status', 'done',
      '--completed-at', '2026-08-11',
      '--repository-changed', 'false',
      '--evidence', 'Every installed semantic mutation passed',
    ]).value.data.status, 'done');

    const pauseDigest = metaJson(client, ['tasks', 'doctor']).value.storeDigest;
    const paused = metaJson(client, [
      'tasks', 'pause',
      '--expected-record-version', '1',
      '--expected-store-digest', pauseDigest,
      '--reason', 'Exercise installed pause',
      '--source', 'T-0026 fixture',
    ]).value.data;
    assert.notEqual(paused.pause, null);
    assert.equal(metaJson(client, [
      'tasks', 'resume', '--expected-record-version', String(paused.recordVersion),
    ]).value.data.pause, null);

    const malformedShard = join(client.clientRoot, 'readme', 'tasks', 'store', 'records', '0009');
    mkdirSync(malformedShard);
    writeFileSync(join(malformedShard, 'T-9999.json'), '{}\n');
    const beforeMalformedMutation = readFileSync(targetRecordPath);
    assert.notEqual(meta(client, [
      'tasks', 'task', 'add', '--outcome', 'Must not be added', '--authority-reference', 'Fixture',
    ], 1).status, 0);
    assert.deepEqual(readFileSync(targetRecordPath), beforeMalformedMutation);
    rmSync(malformedShard, { recursive: true, force: true });

    if (process.platform !== 'win32') {
      const fakeGitDirectory = join(workRoot, 'stateful-git');
      const fakeGitCounter = join(workRoot, 'stateful-git-count');
      const unrelatedRoot = join(workRoot, 'stateful-unrelated');
      mkdirSync(fakeGitDirectory);
      mkdirSync(unrelatedRoot);
      execFileSync('git', ['init', '-q'], { cwd: unrelatedRoot });
      const fakeGit = join(fakeGitDirectory, 'git');
      writeFileSync(fakeGit, `#!/bin/sh
if [ "$1" = rev-parse ] && [ "$2" = --show-toplevel ]; then
  if [ -f "$META_GIT_COUNTER" ]; then
    printf '%s\\n' "$META_GIT_SECOND_ROOT"
  else
    printf '%s' 1 > "$META_GIT_COUNTER"
    printf '%s\\n' "$META_GIT_FIRST_ROOT"
  fi
  exit 0
fi
exec "$META_REAL_GIT" "$@"
`);
      chmodSync(fakeGit, 0o755);
      const oneRoot = run(process.execPath, [client.binary,
        'tasks', 'task', 'add', '--outcome', 'One-root proof', '--authority-reference', 'Fixture'], {
        cwd: client.clientRoot,
        env: {
          ...process.env,
          PATH: `${fakeGitDirectory}${delimiter}${process.env.PATH ?? ''}`,
          META_GIT_COUNTER: fakeGitCounter,
          META_GIT_FIRST_ROOT: client.clientRoot,
          META_GIT_SECOND_ROOT: unrelatedRoot,
          META_REAL_GIT: executableOnPath('git'),
        },
      });
      assert.equal(oneRoot.status, 0, oneRoot.stderr);
      assert.equal(readFileSync(fakeGitCounter, 'utf8'), '1');
      assert.equal(JSON.parse(oneRoot.stdout).data.outcome, 'One-root proof');
      assert.equal(lstatSync(join(unrelatedRoot, 'readme'), { throwIfNoEntry: false }), undefined);
    }

    assert.equal(treeDigest(client.packageRoot), packageDigest, 'task commands changed the installed package');
    assert.equal(JSON.parse(readFileSync(join(client.clientRoot, 'readme', 'tasks', 'store',
      'records', '0000', 'T-0001.json'), 'utf8')).status, 'done');
    assert.equal(JSON.parse(readFileSync(targetRecordPath, 'utf8')).status, 'done');
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('installed task CLI rejects an unrelated Git root before task-state creation', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-wrong-root-'));
  try {
    const client = makeInstalledClient(workRoot);
    const unrelated = join(workRoot, 'unrelated');
    mkdirSync(unrelated);
    execFileSync('git', ['init', '-q'], { cwd: unrelated });
    writeJson(join(unrelated, 'package.json'), { name: 'unrelated-client', private: true });
    const result = run(process.execPath, [client.binary, 'tasks', 'preflight'], { cwd: unrelated });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^meta-framework: ROOT_MISMATCH: /u);
    assert.equal(lstatSync(join(unrelated, 'readme'), { throwIfNoEntry: false }), undefined);
    const internal = run(process.execPath, [
      join(client.packageRoot, 'readme', 'meta', 'framework-data', 'cli.mjs'), 'init',
    ], { cwd: unrelated });
    assert.equal(internal.status, 4);
    assert.match(internal.stderr, /PACKAGE_ENTRYPOINT_REQUIRED/u);
    assert.equal(lstatSync(join(unrelated, 'readme'), { throwIfNoEntry: false }), undefined);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('task help and version are rootless while data commands report bounded Git errors', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-rootless-'));
  try {
    const client = makeInstalledClient(workRoot);
    const outside = join(workRoot, 'outside');
    mkdirSync(outside);
    const help = run(process.execPath, [client.binary, 'tasks', '--help'], { cwd: outside });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: meta-framework tasks /u);
    assert.equal(help.stderr, '');
    const version = run(process.execPath, [client.binary, 'tasks', '--version'], { cwd: outside });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(JSON.parse(version.stdout).taskCli.version, '1.0.0');
    const internalHelp = run(process.execPath, [
      join(client.packageRoot, 'readme', 'meta', 'framework-data', 'cli.mjs'), '--help',
    ], { cwd: outside });
    assert.equal(internalHelp.status, 0, internalHelp.stderr);
    assert.match(internalHelp.stdout, /^Usage: node readme\/meta\/framework-data\/cli\.mjs /u);
    const data = run(process.execPath, [client.binary, 'tasks', 'preflight'], { cwd: outside });
    assert.equal(data.status, 1);
    assert.equal(data.stdout, '');
    assert.match(data.stderr, /^meta-framework tasks: GIT_REQUIRED: [^\n]+\n$/u);
    const internalData = run(process.execPath, [
      join(client.packageRoot, 'readme', 'meta', 'framework-data', 'cli.mjs'), 'preflight',
    ], { cwd: outside });
    assert.equal(internalData.status, 1);
    assert.equal(internalData.stdout, '');
    assert.match(internalData.stderr, /^framework-data: GIT_REQUIRED: [^\n]+\n$/u);
    assert.equal(lstatSync(join(outside, 'readme'), { throwIfNoEntry: false }), undefined);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('task mutations reject incompatible package metadata before store changes', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-compatibility-'));
  try {
    const client = makeInstalledClient(workRoot);
    metaJson(client, ['tasks', 'init']);
    const storePath = join(client.clientRoot, 'readme', 'tasks', 'store');
    const before = treeDigest(storePath);
    const packageManifestPath = join(client.packageRoot, 'package.json');
    const original = JSON.parse(readFileSync(packageManifestPath, 'utf8'));
    for (const field of ['readableStoreSchemaVersions', 'writableStoreSchemaVersions']) {
      const incompatible = structuredClone(original);
      incompatible.metaFramework.taskCli[field] = [2];
      writeJson(packageManifestPath, incompatible);
      const rejected = run(process.execPath, [
        client.binary, 'tasks', 'task', 'add',
        '--outcome', 'Must not be added',
        '--authority-reference', 'Compatibility mutation test',
      ], { cwd: client.clientRoot });
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, '');
      assert.match(rejected.stderr, /^meta-framework: PACKAGE_METADATA: /u);
      assert.equal(treeDigest(storePath), before);
    }
    writeJson(packageManifestPath, original);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('installed task CLI requires the exact dependency alias and matching lock metadata', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-alias-lock-'));
  try {
    const client = makeInstalledClient(workRoot);
    const manifestPath = join(client.clientRoot, 'package.json');
    const lockPath = join(client.clientRoot, 'package-lock.json');
    const originalManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const originalLock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const storePath = join(client.clientRoot, 'readme', 'tasks', 'store');

    for (const declared of [
      '^1.0.0',
      'npm:@other/meta-framework@1.0.0',
      'file:../framework.tgz',
      'git+https://example.invalid/framework.git',
    ]) {
      const manifest = structuredClone(originalManifest);
      const lock = structuredClone(originalLock);
      manifest.dependencies['meta-framework'] = declared;
      lock.packages[''].dependencies['meta-framework'] = declared;
      writeJson(manifestPath, manifest);
      writeJson(lockPath, lock);
      const rejected = run(process.execPath, [client.binary, 'tasks', 'preflight'], { cwd: client.clientRoot });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /ROOT_MISMATCH/u);
      assert.equal(lstatSync(storePath, { throwIfNoEntry: false }), undefined);
    }

    writeJson(manifestPath, originalManifest);
    for (const mutate of [
      (lock) => { lock.packages[''].dependencies['meta-framework'] = '^1.0.0'; },
      (lock) => { lock.packages['node_modules/meta-framework'].name = '@other/meta-framework'; },
      (lock) => { lock.packages['node_modules/meta-framework'].version = '9.9.9'; },
      (lock) => { lock.packages['node_modules/meta-framework'].resolved = 'file:../framework.tgz'; },
      (lock) => { lock.packages['node_modules/meta-framework'].resolved = 'git+https://example.invalid/framework.git'; },
      (lock) => { lock.packages['node_modules/meta-framework'].resolved = 'http://registry.example/framework.tgz'; },
      (lock) => { delete lock.packages['node_modules/meta-framework'].resolved; },
      (lock) => { delete lock.packages['node_modules/meta-framework'].integrity; },
      (lock) => { lock.packages['node_modules/meta-framework'].integrity = 'sha512-invalid'; },
    ]) {
      const lock = structuredClone(originalLock);
      mutate(lock);
      writeJson(lockPath, lock);
      const rejected = run(process.execPath, [client.binary, 'tasks', 'preflight'], { cwd: client.clientRoot });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /CLIENT_METADATA/u);
      assert.equal(lstatSync(storePath, { throwIfNoEntry: false }), undefined);
    }
    writeJson(lockPath, originalLock);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});

test('installed task CLI rejects a symbolic dependency alias before task-state creation',
  { skip: process.platform === 'win32' }, () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-symlink-root-'));
    try {
      const client = makeInstalledClient(workRoot);
      const aliasRoot = client.packageRoot;
      const actualRoot = join(client.clientRoot, 'node_modules', 'meta-framework-actual');
      renameSync(aliasRoot, actualRoot);
      symlinkSync('meta-framework-actual', aliasRoot, 'dir');
      const result = run(process.execPath, [join(aliasRoot, 'bin', 'meta-framework.mjs'), 'tasks', 'preflight'], {
        cwd: client.clientRoot,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^meta-framework: PACKAGE_ROOT_UNSAFE: /u);
      assert.equal(lstatSync(join(client.clientRoot, 'readme', 'tasks', 'store'), { throwIfNoEntry: false }), undefined);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

test('installed package cannot enter source mode through a nested Git repository', () => {
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-nested-git-'));
  try {
    const client = makeInstalledClient(workRoot);
    execFileSync('git', ['init', '-q'], { cwd: client.packageRoot });
    mkdirSync(join(client.packageRoot, 'readme', 'tasks'), { recursive: true });
    writeFileSync(join(client.packageRoot, 'readme', 'README.md'), clientCursor());
    writeFileSync(join(client.packageRoot, 'readme', 'tasks', 'README.md'),
      '# Task Store\n\nUse `npm run --silent meta -- tasks doctor`.\n');
    const before = treeDigest(client.packageRoot);
    const binary = run(process.execPath, [client.binary, 'tasks', 'init'], { cwd: client.packageRoot });
    assert.equal(binary.status, 1);
    assert.match(binary.stderr, /ROOT_MISMATCH/u);
    const internal = run(process.execPath, [
      join(client.packageRoot, 'readme', 'meta', 'framework-data', 'cli.mjs'), 'init',
    ], { cwd: client.packageRoot });
    assert.equal(internal.status, 4);
    assert.match(internal.stderr, /PACKAGE_ENTRYPOINT_REQUIRED/u);
    assert.equal(lstatSync(join(client.packageRoot, 'readme', 'tasks', 'store'),
      { throwIfNoEntry: false }), undefined);
    assert.equal(treeDigest(client.packageRoot), before);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});
