import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after, before } from 'node:test';
import {
  CLIENT_HOOK_COMMAND,
  CODEX_INTEGRATION_FILES,
  CODEX_INTEGRATION_PATHS,
} from '../lib/codex-integration.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const alias = 'npm:@tvald/meta-framework@1.0.0';

const bootstrap = (harness) => `# Meta Framework Bootstrap

<!-- meta-framework-bootstrap:v1:start ${harness} -->
${harness === 'codex' ? `If developer context already contains \`META-FRAMEWORK-AGENT-PROMPT 1\` followed by a
manifest whose \`harness\` is \`codex\` and whose \`profile\` matches this session,
do not load it again. Otherwise, for a primary session run` : 'For a primary session, run'}
\`npm run --ignore-scripts --silent meta -- agent-prompt --profile root --harness ${harness}\`
before project work and follow the complete emitted instructions.

For a delegated session, the assignment must name exactly one profile from
\`implementer\`, \`reviewer\`, \`qa\`, or \`security\`. Run the same command with that profile
in place of \`root\`; do not infer or broaden the assigned profile.

If this checked-in local command is unavailable or fails, stop and report the failure.
Do not use a global binary, \`npx\`, a network fetch, or package-internal policy paths.
<!-- meta-framework-bootstrap:v1:end ${harness} -->
`;

const projectCursor = `# Project State

This client-owned cursor indexes current project state. Keep it bounded and do not use
it as task history or as a copy of package-owned framework policy.

## Task State

- Task entrypoint: [Task store](tasks/README.md)
- Startup query: \`npm run --ignore-scripts --silent meta -- tasks startup\`

Task facts live only in the structured store under \`readme/tasks/store/\`.

## Standing Project Policies

| Policy | Authority |
| --- | --- |
| None | |

## Known Global Dead Ends

- None.

## Documentation Map

- Stable project knowledge: \`readme/project/\` (created on demand)
- Decisions: \`readme/decisions/\` (created on demand)
- Task narratives: \`readme/tasks/\`
- Quality evidence: \`readme/quality/\` (created on demand)
- Threat models: \`readme/threat-models/\` (created on demand)
- Framework detail: \`npm run --ignore-scripts --silent meta -- docs TOPIC\`

## Maintenance

- Last maintenance pass: Not yet run
- Next trigger: First onboarding completion
`;

const taskEntrypoint = `# Task Store

Canonical task state is client-owned under \`readme/tasks/store/\`. This static entrypoint
does not duplicate task records or package-owned framework policy.

## Required Commands

\`\`\`sh
npm run --ignore-scripts --silent meta -- tasks doctor
npm run --ignore-scripts --silent meta -- tasks startup
\`\`\`

Use \`npm run --ignore-scripts --silent meta -- tasks --help\` for bounded queries and Root-owned semantic
mutations. Load the assigned package-owned profile before using this entrypoint; use
\`npm run --ignore-scripts --silent meta -- docs onboarding\` when project state is absent or incomplete.
`;

let suiteRoot;
let clientTemplate;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { input = '', ...spawnOptions } = options;
    const child = spawn(command, args, { ...spawnOptions, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({
      status,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
    child.stdin.end(input);
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function npmEnvironment(cache) {
  return {
    ...process.env,
    npm_config_cache: cache,
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
}

function treeDigest(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const rel = relative(root, absolute).split('\\').join('/');
      const info = lstatSync(absolute);
      hash.update(`${rel}\0${info.mode & 0o777}\0`);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) {
        hash.update(`${info.size}\0`);
        hash.update(readFileSync(absolute));
      }
      else hash.update(`type:${info.mode & 0o170000}`);
    }
  };
  visit(root);
  return hash.digest('hex');
}

function mutableInventory(root) {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (directory === root && ['.git', 'node_modules', 'package.json', 'package-lock.json'].includes(name)) continue;
      const absolute = join(directory, name);
      const rel = relative(root, absolute).split('\\').join('/');
      const info = lstatSync(absolute);
      entries.push(`${info.isDirectory() ? 'd' : info.isFile() ? 'f' : 'x'} ${
        (info.mode & 0o777).toString(8).padStart(3, '0')} ${rel}`);
      if (info.isDirectory()) visit(absolute);
    }
  };
  visit(root);
  return entries;
}

function replaceFileWithSameBytes(target) {
  const bytes = readFileSync(target);
  const mode = lstatSync(target).mode & 0o777;
  renameSync(target, `${target}.raced`);
  writeFileSync(target, bytes, { mode });
  chmodSync(target, mode);
}

function makeClient(name) {
  const clientRoot = join(suiteRoot, name);
  cpSync(clientTemplate, clientRoot, { recursive: true });
  const initialized = run('git', ['init', '-q'], { cwd: clientRoot });
  assert.equal(initialized.status, 0, initialized.stderr);
  return {
    clientRoot,
    binary: join(clientRoot, 'node_modules', 'meta-framework', 'bin', 'meta-framework.mjs'),
    packageRoot: join(clientRoot, 'node_modules', 'meta-framework'),
  };
}

function project(client, args, expectedStatus = 0, cwd = client.clientRoot) {
  const result = run(process.execPath, [client.binary, 'project', ...args], { cwd });
  assert.equal(result.signal, null, `project ${args.join(' ')} received ${result.signal}`);
  assert.equal(result.status, expectedStatus,
    `unexpected project ${args.join(' ')} status\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function npmProject(client, args, expectedStatus = 0) {
  const result = run('npm', ['run', '--ignore-scripts', '--silent', 'meta', '--', 'project', ...args], {
    cwd: client.clientRoot,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  assert.equal(result.status, expectedStatus,
    `unexpected npm project ${args.join(' ')} status\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function projectJson(client, args, expectedStatus = 0, cwd = client.clientRoot) {
  const result = project(client, args, expectedStatus, cwd);
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(result.stdout, `${JSON.stringify(value)}\n`, 'output is not canonical one-line JSON');
  assert.ok(Buffer.byteLength(result.stdout) <= 8_192, 'project envelope exceeded its byte bound');
  return { ...result, value };
}

function projectWithUmask(client, args, mask, expectedStatus = 0) {
  const script = `
    process.umask(${mask});
    process.argv = [process.execPath, ${JSON.stringify(client.binary)}, 'project',
      ...${JSON.stringify(args)}];
    await import(${JSON.stringify(pathToFileURL(client.binary).href)});
  `;
  const result = run(process.execPath, ['--input-type=module', '-e', script], {
    cwd: client.clientRoot,
  });
  assert.equal(result.signal, null);
  assert.equal(result.status, expectedStatus,
    `unexpected umask project ${args.join(' ')} status\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function taskJson(client, args, expectedStatus = 0) {
  const result = run(process.execPath, [client.binary, 'tasks', ...args], { cwd: client.clientRoot });
  assert.equal(result.status, expectedStatus,
    `unexpected tasks ${args.join(' ')} status\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function initializerFixture(client) {
  const runtimeModule = await import(pathToFileURL(join(client.packageRoot, 'lib', 'runtime-roots.mjs')).href);
  const storeModule = await import(pathToFileURL(join(
    client.packageRoot, 'readme', 'meta', 'framework-data', 'store.mjs',
  )).href);
  const initializer = await import(pathToFileURL(join(client.packageRoot, 'lib', 'project-initializer.mjs')).href);
  const packageRuntime = runtimeModule.readPackageIdentity(pathToFileURL(client.binary).href);
  const context = await storeModule.repositoryContext(client.clientRoot);
  return {
    initializer,
    clientRuntime: runtimeModule.validateClientRuntimeRoots({
      packageRuntime,
      context,
      entryPath: client.binary,
    }),
  };
}

function killInitializerAt(client, phase, mask = null, harness = null) {
  const script = `
    ${mask === null ? '' : `process.umask(${mask});`}
    const runtimeModule = await import(${JSON.stringify(pathToFileURL(join(client.packageRoot, 'lib', 'runtime-roots.mjs')).href)});
    const storeModule = await import(${JSON.stringify(pathToFileURL(join(client.packageRoot, 'readme', 'meta', 'framework-data', 'store.mjs')).href)});
    const initializer = await import(${JSON.stringify(pathToFileURL(join(client.packageRoot, 'lib', 'project-initializer.mjs')).href)});
    const packageRuntime = runtimeModule.readPackageIdentity(${JSON.stringify(pathToFileURL(client.binary).href)});
    const context = await storeModule.repositoryContext(${JSON.stringify(client.clientRoot)});
    const clientRuntime = runtimeModule.validateClientRuntimeRoots({
      packageRuntime,
      context,
      entryPath: ${JSON.stringify(client.binary)},
    });
    await initializer.initializeProject(clientRuntime, {
      ${harness === null ? '' : `harness: ${JSON.stringify(harness)},`}
      hooks: { [${JSON.stringify(phase)}]: () => process.kill(process.pid, 'SIGKILL') },
    });
  `;
  const killed = run(process.execPath, ['--input-type=module', '-e', script], { cwd: client.clientRoot });
  assert.equal(killed.status, null);
  assert.equal(killed.signal, 'SIGKILL');
  assert.equal(killed.stdout, '');
}

function recoverKilledInitializerLock(client) {
  const inspected = taskJson(client, ['lock', 'inspect']);
  assert.equal(inspected.lock.state, 'owned');
  taskJson(client, [
    'lock', 'recover', '--expected-token', inspected.lock.owner.token, '--confirm-owner-not-live',
  ]);
  assert.equal(taskJson(client, ['lock', 'inspect']).lock.held, false);
}

function assertBoundedFailure(result, client) {
  assert.equal(result.stdout, '');
  assert.ok(Buffer.byteLength(result.stderr) <= 1_024, 'failure exceeded its byte bound');
  assert.match(result.stderr, /^meta-framework project: [A-Z][A-Z_]{0,63}: [^\n]+\n$/u);
  assert.doesNotMatch(result.stderr, /(?:https?:\/\/|\bnpx\b|node:internal|\bat file:)/u);
  assert.equal(result.stderr.includes(client.clientRoot), false, 'failure disclosed the client path');
  assert.equal(result.stderr.includes(client.packageRoot), false, 'failure disclosed the package path');
}

before(() => {
  suiteRoot = mkdtempSync(join(tmpdir(), 'meta-framework-project-init-'));
  const packDirectory = join(suiteRoot, 'pack');
  const cache = join(suiteRoot, 'npm-cache');
  clientTemplate = join(suiteRoot, 'template');
  mkdirSync(packDirectory);
  mkdirSync(clientTemplate);
  const packed = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
    cwd: sourceRoot,
    env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false' },
  });
  assert.equal(packed.status, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = join(packDirectory, filename);
  writeJson(join(clientTemplate, 'package.json'), {
    name: 'meta-framework-project-fixture',
    private: true,
    scripts: { meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs' },
    dependencies: { 'meta-framework': `file:${tarball}` },
  });
  const locked = run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: clientTemplate,
    env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false' },
  });
  assert.equal(locked.status, 0, locked.stderr);
  const installed = run('npm', ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
    cwd: clientTemplate,
    env: npmEnvironment(cache),
  });
  assert.equal(installed.status, 0, installed.stderr);

  const manifest = JSON.parse(readFileSync(join(clientTemplate, 'package.json'), 'utf8'));
  manifest.dependencies['meta-framework'] = alias;
  writeJson(join(clientTemplate, 'package.json'), manifest);
  const lock = JSON.parse(readFileSync(join(clientTemplate, 'package-lock.json'), 'utf8'));
  lock.packages[''].dependencies['meta-framework'] = alias;
  lock.packages['node_modules/meta-framework'].name = '@tvald/meta-framework';
  lock.packages['node_modules/meta-framework'].resolved =
    'https://registry.npmjs.org/@tvald/meta-framework/-/meta-framework-1.0.0.tgz';
  writeJson(join(clientTemplate, 'package-lock.json'), lock);
});

function makeTreeRemovable(target) {
  if (!existsSync(target)) return;
  const info = lstatSync(target);
  if (info.isDirectory()) {
    chmodSync(target, 0o700);
    for (const name of readdirSync(target)) makeTreeRemovable(join(target, name));
  } else if (info.isFile()) chmodSync(target, 0o600);
}

after(() => {
  makeTreeRemovable(suiteRoot);
  rmSync(suiteRoot, { recursive: true, force: true });
});

test('project version is rootless and exposes the exact initializer compatibility', () => {
  const client = makeClient('version');
  const outside = mkdtempSync(join(tmpdir(), 'meta-framework-project-version-'));
  try {
    assert.deepEqual(projectJson(client, ['--version'], 0, outside).value, {
      schemaVersion: 1,
      package: { name: '@tvald/meta-framework', version: '1.0.0' },
      projectInit: {
        version: '1.2.0',
        envelopeVersions: [1],
        bootstrapVersions: [1],
        stateTemplateVersions: [1],
        optionalHarnesses: ['codex'],
        codexIntegrationConfigVersions: [2],
      },
    });
    for (const args of [[], ['--help'], ['init', '--force'], ['preflight', 'extra'],
      ['preflight', '--harness', 'claude'], ['init', '--harness'], ['unknown']]) {
      const result = project(client, args, 2, outside);
      assertBoundedFailure(result, client);
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('packed fresh init creates exact minimal client bytes and is invariant and idempotent', () => {
  const client = makeClient('fresh');
  const nested = join(client.clientRoot, 'nested');
  mkdirSync(nested);
  const packageDigest = treeDigest(client.packageRoot);
  const manifestBytes = readFileSync(join(client.clientRoot, 'package.json'));
  const lockBytes = readFileSync(join(client.clientRoot, 'package-lock.json'));

  assert.deepEqual(projectJson(client, ['preflight'], 0, nested).value, {
    schemaVersion: 1,
    package: { name: '@tvald/meta-framework', version: '1.0.0' },
    projectInit: {
      version: '1.2.0',
      disposition: 'fresh',
      bootstrapVersion: 1,
      stateTemplateVersion: 1,
      bootstraps: { 'AGENTS.md': 'absent', 'CLAUDE.md': 'absent' },
      taskState: 'uninitialized',
      issue: null,
    },
  });
  const initialized = projectJson(client, ['init'], 0, nested).value;
  assert.deepEqual(initialized, {
    schemaVersion: 1,
    package: { name: '@tvald/meta-framework', version: '1.0.0' },
    projectInit: {
      version: '1.2.0',
      result: 'initialized',
      created: ['AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/'],
      preserved: [],
      storeDigest: initialized.projectInit.storeDigest,
    },
  });
  assert.match(initialized.projectInit.storeDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(readFileSync(join(client.clientRoot, 'AGENTS.md'), 'utf8'), bootstrap('codex'));
  assert.equal(readFileSync(join(client.clientRoot, 'CLAUDE.md'), 'utf8'), bootstrap('claude'));
  assert.equal(readFileSync(join(client.clientRoot, 'readme', 'README.md'), 'utf8'), projectCursor);
  assert.equal(readFileSync(join(client.clientRoot, 'readme', 'tasks', 'README.md'), 'utf8'), taskEntrypoint);
  assert.equal(readFileSync(join(client.clientRoot, 'readme', 'tasks', 'store', 'control.json'), 'utf8'),
    '{\n  "schemaVersion": 1,\n  "recordVersion": 1,\n  "pause": null\n}\n');
  assert.deepEqual(readdirSync(join(client.clientRoot, 'readme', 'tasks', 'store', 'records')), []);
  assert.deepEqual(mutableInventory(client.clientRoot), [
    'f 644 AGENTS.md',
    'f 644 CLAUDE.md',
    'd 755 nested',
    'd 755 readme',
    'f 644 readme/README.md',
    'd 755 readme/tasks',
    'f 644 readme/tasks/README.md',
    'd 755 readme/tasks/store',
    'f 644 readme/tasks/store/control.json',
    'd 755 readme/tasks/store/records',
  ]);
  assert.equal(existsSync(join(client.clientRoot, 'readme', 'meta')), false);
  assert.equal(existsSync(join(client.clientRoot, '.codex')), false);
  assert.equal(existsSync(join(client.clientRoot, '.claude')), false);
  assert.equal(treeDigest(client.packageRoot), packageDigest, 'init changed installed package bytes');
  assert.deepEqual(readFileSync(join(client.clientRoot, 'package.json')), manifestBytes);
  assert.deepEqual(readFileSync(join(client.clientRoot, 'package-lock.json')), lockBytes);

  const afterFirst = treeDigest(client.clientRoot);
  const repeated = projectJson(client, ['init']).value;
  assert.deepEqual(repeated, {
    schemaVersion: 1,
    package: { name: '@tvald/meta-framework', version: '1.0.0' },
    projectInit: {
      version: '1.2.0',
      result: 'already_initialized',
      created: [],
      preserved: ['AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/'],
      storeDigest: initialized.projectInit.storeDigest,
    },
  });
  assert.equal(treeDigest(client.clientRoot), afterFirst, 'repeat init changed the client tree');

  const doctor = run(process.execPath, [client.binary, 'tasks', 'doctor'], { cwd: client.clientRoot });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
});

test('packed fresh init overrides umask 077 with exact durable modes and remains idempotent', {
  skip: process.platform === 'win32',
}, () => {
  const client = makeClient('fresh-umask-077');
  const initialized = projectWithUmask(client, ['init'], 0o077);
  assert.equal(initialized.stderr, '');
  assert.equal(JSON.parse(initialized.stdout).projectInit.result, 'initialized');
  for (const relative of [
    'readme', 'readme/tasks', 'readme/tasks/store', 'readme/tasks/store/records',
  ]) {
    assert.equal(lstatSync(join(client.clientRoot, ...relative.split('/'))).mode & 0o777, 0o755,
      `${relative} did not receive mode 0755`);
  }
  for (const relative of [
    'AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md',
    'readme/tasks/store/control.json',
  ]) {
    assert.equal(lstatSync(join(client.clientRoot, ...relative.split('/'))).mode & 0o777, 0o644,
      `${relative} did not receive mode 0644`);
  }
  const initializedDigest = treeDigest(client.clientRoot);
  const repeated = projectWithUmask(client, ['init'], 0o077);
  assert.equal(repeated.stderr, '');
  assert.equal(JSON.parse(repeated.stdout).projectInit.result, 'already_initialized');
  assert.equal(treeDigest(client.clientRoot), initializedDigest);

  const interrupted = makeClient('fresh-umask-077-interrupted');
  killInitializerAt(interrupted, 'stage', 0o077);
  const commonReported = run('git', ['rev-parse', '--git-common-dir'], { cwd: interrupted.clientRoot });
  assert.equal(commonReported.status, 0, commonReported.stderr);
  const commonRoot = resolve(interrupted.clientRoot, commonReported.stdout.trim());
  const lock = join(commonRoot, 'framework-data.lock');
  assert.equal(lstatSync(lock).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(lock, 'owner.json')).mode & 0o777, 0o600);
  const [stageName] = readdirSync(interrupted.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-'));
  const stage = join(interrupted.clientRoot, stageName);
  assert.equal(lstatSync(stage).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(stage, 'journal.json')).mode & 0o777, 0o600);
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'readme__README.md', 'readme__tasks__README.md']) {
    assert.equal(lstatSync(join(stage, name)).mode & 0o777, 0o644,
      `${name} staging mode drifted under umask 077`);
  }
  recoverKilledInitializerLock(interrupted);
  assert.equal(projectJson(interrupted, ['init']).value.projectInit.result, 'initialized');
});

test('opt-in Codex integration installs exact files, preserves unrelated config, and is idempotent', () => {
  const client = makeClient('codex integration $(touch T0033_HOOK_INJECTED); [safe]');
  projectJson(client, ['init']);
  mkdirSync(join(client.clientRoot, '.codex'));
  writeFileSync(join(client.clientRoot, '.codex', 'config.toml'), 'model = "client-owned"\n');
  const packageDigest = treeDigest(client.packageRoot);
  const beforeStore = taskJson(client, ['doctor']).storeDigest;

  const preflight = projectJson(client, ['preflight', '--harness', 'codex']).value.projectInit;
  assert.equal(preflight.disposition, 'ready_to_add_codex_integration');
  assert.equal(preflight.harness, 'codex');
  assert.equal(preflight.integrationConfigVersion, 2);
  assert.deepEqual(preflight.integration,
    Object.fromEntries(CODEX_INTEGRATION_PATHS.map((relative) => [relative, 'absent'])));

  const initialized = projectJson(client, ['init', '--harness', 'codex']).value.projectInit;
  assert.equal(initialized.result, 'codex_integration_initialized');
  assert.deepEqual(initialized.created, CODEX_INTEGRATION_PATHS);
  assert.deepEqual(initialized.preserved, [
    'AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/',
  ]);
  for (const relative of CODEX_INTEGRATION_PATHS) {
    const target = join(client.clientRoot, ...relative.split('/'));
    assert.equal(readFileSync(target, 'utf8'), CODEX_INTEGRATION_FILES[relative], relative);
    assert.equal(lstatSync(target).mode & 0o777, 0o644, relative);
  }
  assert.equal(lstatSync(join(client.clientRoot, '.codex')).mode & 0o777, 0o755);
  assert.equal(lstatSync(join(client.clientRoot, '.codex', 'agents')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(client.clientRoot, '.codex', 'config.toml'), 'utf8'),
    'model = "client-owned"\n');
  assert.equal(taskJson(client, ['doctor']).storeDigest, beforeStore);
  assert.equal(treeDigest(client.packageRoot), packageDigest);

  const currentDigest = treeDigest(client.clientRoot);
  const repeated = projectJson(client, ['init', '--harness', 'codex']).value.projectInit;
  assert.equal(repeated.result, 'codex_integration_already_initialized');
  assert.deepEqual(repeated.created, []);
  assert.deepEqual(repeated.preserved, [
    'AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/',
    ...CODEX_INTEGRATION_PATHS,
  ]);
  assert.equal(treeDigest(client.clientRoot), currentDigest);
  assert.equal(projectJson(client, ['preflight', '--harness', 'codex']).value.projectInit.disposition,
    'valid_current_codex_integration');

  const installedHooks = JSON.parse(
    readFileSync(join(client.clientRoot, '.codex', 'hooks.json'), 'utf8'),
  ).hooks;
  const installedHook = installedHooks.SessionStart[0].hooks[0].command;
  assert.equal(installedHook, CLIENT_HOOK_COMMAND);
  const manifest = JSON.parse(readFileSync(join(client.clientRoot, 'package.json'), 'utf8'));
  manifest.scripts.meta = 'node -e "process.stdout.write(\'MUTABLE_CLIENT_SCRIPT_EXECUTED\\n\')"';
  writeJson(join(client.clientRoot, 'package.json'), manifest);
  const nested = join(client.clientRoot, 'readme', 'tasks');
  const sessionId = 'installed-project-hook-session';
  const invocations = [
    ['root', installedHook, { hook_event_name: 'SessionStart', source: 'startup', session_id: sessionId }],
    ...installedHooks.SubagentStart.map((entry) => {
      const agentType = entry.matcher.slice(1, -1);
      return [agentType.slice('meta_'.length), entry.hooks[0].command,
        { hook_event_name: 'SubagentStart', agent_type: agentType, session_id: sessionId }];
    }),
  ];
  for (const [profile, command, event] of invocations) {
    const hookResult = run('/bin/sh', ['-c', command], {
      cwd: nested,
      input: JSON.stringify(event),
    });
    assert.equal(hookResult.status, 0, `${profile}: ${hookResult.stderr}`);
    assert.match(hookResult.stdout, /^META-FRAMEWORK-AGENT-PROMPT 1\n/u);
    assert.equal(JSON.parse(hookResult.stdout.split('\n', 2)[1]).profile, profile);
    assert.doesNotMatch(hookResult.stdout, /MUTABLE_CLIENT_SCRIPT_EXECUTED/u);
  }
  assert.equal(existsSync(join(nested, 'T0033_HOOK_INJECTED')), false);
  assert.equal(existsSync(join(client.clientRoot, 'T0033_HOOK_INJECTED')), false);
});

test('installed first hooks seed once while partial and read-only operations never initialize state', async () => {
  for (const [label, profile, input] of [
    ['malformed', 'root', '{'],
    ['duplicate-key', 'root', '{"hook_event_name":"SessionStart","hook_event_name":"SubagentStart","source":"startup","session_id":"duplicate"}'],
    ['missing-session', 'root', JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' })],
    ['specialist-session-end', 'reviewer', JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'wrong-profile' })],
  ]) {
    const invalid = makeClient(`prompt-runtime-invalid-${label}`);
    projectJson(invalid, ['init']);
    const runtimePath = join(invalid.clientRoot, '.git', 'meta-framework', 'prompt-runtime');
    const result = run(process.execPath,
      [invalid.binary, 'hook', '--harness', 'codex', '--profile', profile], {
        cwd: invalid.clientRoot,
        input,
      });
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.match(result.stdout, profile === 'root'
      ? /META-FRAMEWORK-DEGRADED 1/u
      : /META-FRAMEWORK-DELEGATED-PROMPT-FAILURE 1/u, label);
    assert.equal(existsSync(runtimePath), false, `${label} seeded prompt state`);
  }

  const concurrent = makeClient('prompt-runtime-concurrent-seed');
  projectJson(concurrent, ['init']);
  const hookArgs = [concurrent.binary, 'hook', '--harness', 'codex', '--profile', 'root'];
  const event = JSON.stringify({
    hook_event_name: 'SessionStart', source: 'startup', session_id: 'concurrent-installed-seed',
  });
  const [left, right] = await Promise.all([
    runAsync(process.execPath, hookArgs, { cwd: concurrent.clientRoot, input: event }),
    runAsync(process.execPath, hookArgs, { cwd: concurrent.clientRoot, input: event }),
  ]);
  for (const [label, result] of [['left', left], ['right', right]]) {
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.signal, null, label);
    assert.match(result.stdout, /^META-FRAMEWORK-AGENT-PROMPT 1\n/u, `${label}: ${result.stderr}`);
  }
  assert.equal(left.stdout, right.stdout);
  const seededStatus = run(process.execPath, [concurrent.binary, 'prompt-runtime', 'status'], {
    cwd: concurrent.clientRoot,
  });
  assert.equal(seededStatus.status, 0, seededStatus.stderr);
  const seeded = JSON.parse(seededStatus.stdout);
  assert.equal(seeded.activeRevision, 1);
  assert.equal(seeded.generations.length, 1);
  assert.equal(seeded.privateSeeds, 0);
  assert.equal(Object.hasOwn(seeded, 'runtimeRoot'), false);
  assert.doesNotMatch(seededStatus.stdout, /prompt-runtime\/v1/u);
  const installedLoader = run(process.execPath,
    [concurrent.binary, 'prompt-runtime', 'install-bootstrap'], { cwd: concurrent.clientRoot });
  assert.equal(installedLoader.status, 0, installedLoader.stderr);
  const installedLoaderResult = JSON.parse(installedLoader.stdout);
  assert.match(installedLoaderResult.relativePath, /^loaders\/[0-9a-f]{64}\.mjs$/u);
  assert.equal(Object.hasOwn(installedLoaderResult, 'path'), false);

  for (const [label, populate] of [
    ['parent-only', (root) => mkdirSync(root, { recursive: true, mode: 0o700 })],
    ['missing-child', (root) => {
      for (const target of [root, join(root, 'v1'), join(root, 'v1', 'generations'),
        join(root, 'v1', 'loaders')]) mkdirSync(target, { recursive: true, mode: 0o700 });
    }],
  ]) {
    const partial = makeClient(`prompt-runtime-partial-${label}`);
    projectJson(partial, ['init']);
    const framework = join(partial.clientRoot, '.git', 'meta-framework');
    const runtimeRoot = join(framework, 'prompt-runtime');
    populate(runtimeRoot);
    const makeExact = (target) => {
      chmodSync(target, 0o700);
      for (const name of readdirSync(target)) {
        const child = join(target, name);
        if (lstatSync(child).isDirectory()) makeExact(child);
      }
    };
    makeExact(framework);
    const before = treeDigest(framework);
    const failed = run(process.execPath,
      [partial.binary, 'hook', '--harness', 'codex', '--profile', 'root'], {
        cwd: partial.clientRoot,
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `partial-${label}` }),
      });
    assert.equal(failed.status, 0, `${label}: ${failed.stderr}`);
    assert.match(failed.stdout, /META-FRAMEWORK-DEGRADED 1/u, label);
    assert.equal(treeDigest(framework), before, `${label} was repaired or seeded`);
  }

  const absent = makeClient('prompt-runtime-read-only-absent');
  projectJson(absent, ['init']);
  const runtimePath = join(absent.clientRoot, '.git', 'meta-framework', 'prompt-runtime');
  for (const args of [['cleanup'], ['activate', 'invalid']]) {
    const result = run(process.execPath, [absent.binary, 'prompt-runtime', ...args], { cwd: absent.clientRoot });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(existsSync(runtimePath), false, args.join(' '));
  }
  const status = run(process.execPath, [absent.binary, 'prompt-runtime', 'status'], { cwd: absent.clientRoot });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).initialized, false);
  assert.equal(existsSync(runtimePath), false);
});

test('Codex integration preflight distinguishes partial and unsafe ownership states', () => {
  const partial = makeClient('codex-integration-partial');
  projectJson(partial, ['init']);
  mkdirSync(join(partial.clientRoot, '.codex', 'agents'), { recursive: true });
  writeFileSync(join(partial.clientRoot, '.codex', 'hooks.json'),
    CODEX_INTEGRATION_FILES['.codex/hooks.json']);
  const partialPreflight = projectJson(partial, ['preflight', '--harness', 'codex']).value.projectInit;
  assert.equal(partialPreflight.disposition, 'ready_to_complete_codex_integration');
  assert.equal(partialPreflight.integration['.codex/hooks.json'], 'exact_current');
  assert.deepEqual(projectJson(partial, ['init', '--harness', 'codex']).value.projectInit.created,
    CODEX_INTEGRATION_PATHS.slice(1));

  const cases = [
    ['stale', 'stale_framework_owned', (target) => writeFileSync(target,
      CODEX_INTEGRATION_FILES['.codex/hooks.json'].replace('"timeout": 30', '"timeout": 29'))],
    ['client', 'client_owned', (target) => writeFileSync(target, '{"hooks":{}}\n')],
    ['malformed', 'malformed', (target) => writeFileSync(target,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"hooks":{}}\n')]))],
    ['linked', 'linked', (target, client) => {
      const outside = join(client.clientRoot, 'outside-hooks.json');
      writeFileSync(outside, '{"hooks":{}}\n');
      symlinkSync(outside, target);
    }],
    ['colliding', 'colliding', (target) => mkdirSync(target)],
  ];
  for (const [name, state, prepare] of cases) {
    const client = makeClient(`codex-integration-${name}`);
    projectJson(client, ['init']);
    mkdirSync(join(client.clientRoot, '.codex'), { recursive: true });
    const target = join(client.clientRoot, '.codex', 'hooks.json');
    prepare(target, client);
    const before = treeDigest(client.clientRoot);
    const preflight = projectJson(client, ['preflight', '--harness', 'codex']).value.projectInit;
    assert.equal(preflight.integration['.codex/hooks.json'], state, name);
    assert.equal(preflight.disposition, `codex_integration_${state}`, name);
    const refused = project(client, ['init', '--harness', 'codex'], 4);
    assertBoundedFailure(refused, client);
    assert.equal(treeDigest(client.clientRoot), before, `${name} refusal mutated client state`);
  }
});

test('Codex integration transaction rolls back exact invocation-owned paths', async () => {
  const client = makeClient('codex-integration-rollback');
  projectJson(client, ['init']);
  const fixture = await initializerFixture(client);
  await assert.rejects(fixture.initializer.initializeProject(fixture.clientRuntime, {
    harness: 'codex',
    hooks: { 'claim:.codex/agents/meta_qa.toml': () => { throw new Error('injected-codex'); } },
  }), /injected-codex/u);
  assert.equal(existsSync(join(client.clientRoot, '.codex')), false);
  assert.equal(readdirSync(client.clientRoot).some((name) => name.startsWith('.meta-framework-project-init-')),
    false);
  assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), false);
  assert.equal(projectJson(client, ['preflight', '--harness', 'codex']).value.projectInit.disposition,
    'ready_to_add_codex_integration');
});

test('killed Codex integration resumes only its unchanged exact prefix', () => {
  const client = makeClient('codex-integration-resume');
  projectJson(client, ['init']);
  killInitializerAt(client, 'claim:.codex/agents/meta_qa.toml', null, 'codex');
  recoverKilledInitializerLock(client);
  const [stage] = readdirSync(client.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-'));
  assert.ok(stage);
  const resumed = projectJson(client, ['init', '--harness', 'codex']).value.projectInit;
  assert.equal(resumed.result, 'codex_integration_initialized');
  assert.deepEqual(resumed.created, CODEX_INTEGRATION_PATHS);
  assert.equal(existsSync(join(client.clientRoot, stage)), false);
  for (const relative of CODEX_INTEGRATION_PATHS) {
    assert.equal(readFileSync(join(client.clientRoot, ...relative.split('/')), 'utf8'),
      CODEX_INTEGRATION_FILES[relative]);
  }
});

test('recognized bootstraps are preserved and collisions or partial state never trigger writes', () => {
  const add = makeClient('add-bootstrap');
  projectJson(add, ['init']);
  rmSync(join(add.clientRoot, 'CLAUDE.md'));
  const agentPath = join(add.clientRoot, 'AGENTS.md');
  const surrounded = `# Client preface\n\n${bootstrap('codex')}\nClient suffix.\n`;
  writeFileSync(agentPath, surrounded);
  const beforeAdd = treeDigest(add.packageRoot);
  const ready = projectJson(add, ['preflight']).value.projectInit;
  assert.equal(ready.disposition, 'ready_to_add_bootstraps');
  assert.deepEqual(ready.bootstraps, { 'AGENTS.md': 'recognized', 'CLAUDE.md': 'absent' });
  const added = projectJson(add, ['init']).value.projectInit;
  assert.equal(added.result, 'initialized');
  assert.deepEqual(added.created, ['CLAUDE.md']);
  assert.ok(added.preserved.includes('AGENTS.md'));
  assert.equal(readFileSync(agentPath, 'utf8'), surrounded);
  assert.equal(readFileSync(join(add.clientRoot, 'CLAUDE.md'), 'utf8'), bootstrap('claude'));
  assert.equal(treeDigest(add.packageRoot), beforeAdd);

  const collisionCases = [
    ['unrelated', () => writeFileSync(agentPathFor('unrelated'), '# Existing client instructions\n')],
    ['wrong-harness', () => writeFileSync(agentPathFor('wrong-harness'), bootstrap('claude'))],
    ['duplicate-marker', () => writeFileSync(agentPathFor('duplicate-marker'), `${bootstrap('codex')}\n${bootstrap('codex')}`)],
    ['bom', () => writeFileSync(agentPathFor('bom'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(bootstrap('codex'))]))],
    ['unsafe-mode', () => {
      writeFileSync(agentPathFor('unsafe-mode'), bootstrap('codex'));
      chmodSync(agentPathFor('unsafe-mode'), 0o666);
    }],
    ['directory', () => mkdirSync(agentPathFor('directory'))],
    ['invalid-utf8', () => writeFileSync(agentPathFor('invalid-utf8'), Buffer.from([0xff, 0xfe]))],
    ['hardlink', () => {
      const client = clients.get('hardlink');
      const outside = join(client.clientRoot, 'outside-agent');
      writeFileSync(outside, bootstrap('codex'));
      linkSync(outside, agentPathFor('hardlink'));
    }],
    ['symlink', () => {
      const client = clients.get('symlink');
      const outside = join(client.clientRoot, 'outside-agent');
      writeFileSync(outside, bootstrap('codex'));
      symlinkSync('outside-agent', agentPathFor('symlink'));
    }],
  ];
  const clients = new Map(collisionCases.map(([name]) => [name, makeClient(`collision-${name}`)]));
  function agentPathFor(name) {
    return join(clients.get(name).clientRoot, 'AGENTS.md');
  }
  for (const [name, arrange] of collisionCases) {
    const client = clients.get(name);
    arrange();
    const before = mutableInventory(client.clientRoot);
    const preflight = projectJson(client, ['preflight']).value.projectInit;
    assert.equal(preflight.disposition, 'bootstrap_collision', name);
    assert.equal(preflight.bootstraps['AGENTS.md'], 'collision', name);
    const rejected = project(client, ['init'], 4);
    assertBoundedFailure(rejected, client);
    assert.deepEqual(mutableInventory(client.clientRoot), before, `${name} collision changed the tree`);
    assert.equal(existsSync(join(client.clientRoot, 'CLAUDE.md')), false, `${name} created a companion bootstrap`);
    assert.equal(existsSync(join(client.clientRoot, 'readme')), false, `${name} created project state`);
  }

  const claudeCollision = makeClient('collision-claude-unrelated');
  writeFileSync(join(claudeCollision.clientRoot, 'CLAUDE.md'), '# Existing Claude instructions\n');
  const claudeBefore = mutableInventory(claudeCollision.clientRoot);
  const claudePreflight = projectJson(claudeCollision, ['preflight']).value.projectInit;
  assert.equal(claudePreflight.disposition, 'bootstrap_collision');
  assert.equal(claudePreflight.bootstraps['CLAUDE.md'], 'collision');
  assertBoundedFailure(project(claudeCollision, ['init'], 4), claudeCollision);
  assert.deepEqual(mutableInventory(claudeCollision.clientRoot), claudeBefore);
  assert.equal(existsSync(join(claudeCollision.clientRoot, 'AGENTS.md')), false);

  const seeded = makeClient('seeded-state');
  mkdirSync(join(seeded.clientRoot, 'readme', 'tasks'), { recursive: true });
  writeFileSync(join(seeded.clientRoot, 'readme', 'README.md'), projectCursor);
  writeFileSync(join(seeded.clientRoot, 'readme', 'tasks', 'README.md'), taskEntrypoint);
  assert.equal(projectJson(seeded, ['preflight']).value.projectInit.disposition, 'ready_to_initialize');
  const seededResult = projectJson(seeded, ['init']).value.projectInit;
  assert.deepEqual(seededResult.created, ['AGENTS.md', 'CLAUDE.md', 'readme/tasks/store/']);
  assert.deepEqual(seededResult.preserved, ['readme/README.md', 'readme/tasks/README.md']);
  assert.equal(readFileSync(join(seeded.clientRoot, 'readme', 'README.md'), 'utf8'), projectCursor);
  assert.equal(readFileSync(join(seeded.clientRoot, 'readme', 'tasks', 'README.md'), 'utf8'), taskEntrypoint);

  const malformed = makeClient('malformed-store');
  mkdirSync(join(malformed.clientRoot, 'readme', 'tasks', 'store'), { recursive: true });
  writeFileSync(join(malformed.clientRoot, 'readme', 'README.md'), projectCursor);
  writeFileSync(join(malformed.clientRoot, 'readme', 'tasks', 'README.md'), taskEntrypoint);
  assert.equal(projectJson(malformed, ['preflight']).value.projectInit.disposition, 'malformed');
  const malformedBefore = mutableInventory(malformed.clientRoot);
  assertBoundedFailure(project(malformed, ['init'], 4), malformed);
  assert.deepEqual(mutableInventory(malformed.clientRoot), malformedBefore);
  assert.equal(existsSync(join(malformed.clientRoot, 'AGENTS.md')), false);

  const foreignPrepared = makeClient('foreign-prepared');
  mkdirSync(join(foreignPrepared.clientRoot, 'readme', 'tasks', '.framework-data-init-unowned'), {
    recursive: true,
  });
  writeFileSync(join(foreignPrepared.clientRoot, 'readme', 'README.md'), projectCursor);
  writeFileSync(join(foreignPrepared.clientRoot, 'readme', 'tasks', 'README.md'), taskEntrypoint);
  assert.equal(projectJson(foreignPrepared, ['preflight']).value.projectInit.disposition, 'prepared');
  const preparedBefore = mutableInventory(foreignPrepared.clientRoot);
  assertBoundedFailure(project(foreignPrepared, ['init'], 4), foreignPrepared);
  assert.deepEqual(mutableInventory(foreignPrepared.clientRoot), preparedBefore);
  assert.equal(existsSync(join(foreignPrepared.clientRoot, 'AGENTS.md')), false);

  const partial = makeClient('partial');
  mkdirSync(join(partial.clientRoot, 'readme'));
  writeFileSync(join(partial.clientRoot, 'readme', 'README.md'), projectCursor);
  assert.equal(projectJson(partial, ['preflight']).value.projectInit.disposition, 'partial');
  const beforePartial = mutableInventory(partial.clientRoot);
  assertBoundedFailure(project(partial, ['init'], 4), partial);
  assert.deepEqual(mutableInventory(partial.clientRoot), beforePartial);
  assert.equal(existsSync(join(partial.clientRoot, 'AGENTS.md')), false);
});

test('populated task stores remain byte-exact across current and add-bootstrap initialization', () => {
  for (const scenario of ['already-current', 'add-bootstrap']) {
    const client = makeClient(`populated-${scenario}`);
    projectJson(client, ['init']);
    const added = taskJson(client, [
      'task', 'add', '--outcome', `Preserve populated ${scenario} store`,
      '--authority-reference', 'T-0029 populated-store regression',
    ]).data;
    assert.equal(added.id, 'T-0001');
    const storeRoot = join(client.clientRoot, 'readme', 'tasks', 'store');
    const beforeDoctor = taskJson(client, ['doctor']);
    assert.equal(beforeDoctor.ok, true);
    const beforeDigest = beforeDoctor.storeDigest;
    const beforeTree = treeDigest(storeRoot);
    const beforeInventory = mutableInventory(storeRoot);

    if (scenario === 'add-bootstrap') {
      rmSync(join(client.clientRoot, 'CLAUDE.md'));
      const preflight = projectJson(client, ['preflight']).value.projectInit;
      assert.equal(preflight.disposition, 'ready_to_add_bootstraps');
      assert.equal(preflight.taskState, 'valid_current_store');
      const initialized = projectJson(client, ['init']).value.projectInit;
      assert.equal(initialized.result, 'initialized');
      assert.deepEqual(initialized.created, ['CLAUDE.md']);
      assert.deepEqual(initialized.preserved,
        ['AGENTS.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/']);
      assert.equal(readFileSync(join(client.clientRoot, 'CLAUDE.md'), 'utf8'), bootstrap('claude'));
      assert.equal(initialized.storeDigest, beforeDigest);
    } else {
      const current = projectJson(client, ['init']).value.projectInit;
      assert.equal(current.result, 'already_initialized');
      assert.deepEqual(current.created, []);
      assert.deepEqual(current.preserved,
        ['AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/']);
      assert.equal(current.storeDigest, beforeDigest);
    }

    assert.deepEqual(mutableInventory(storeRoot), beforeInventory, `${scenario} changed store inventory`);
    assert.equal(treeDigest(storeRoot), beforeTree, `${scenario} changed store bytes or modes`);
    const afterDoctor = taskJson(client, ['doctor']);
    assert.equal(afterDoctor.ok, true);
    assert.equal(afterDoctor.storeDigest, beforeDigest);
  }
});

test('current initialization preserves tolerated empty shards and hard-linked task records', () => {
  const client = makeClient('preserved-store-simplifications');
  projectJson(client, ['init']);
  const added = taskJson(client, [
    'task', 'add', '--outcome', 'Preserve simplified store state',
    '--authority-reference', 'T-0039 initializer regression',
  ]).data;
  const tasksRoot = join(client.clientRoot, 'readme', 'tasks');
  const storeRoot = join(tasksRoot, 'store');
  const control = join(storeRoot, 'control.json');
  const record = join(storeRoot, 'records', '0000', `${added.id}.json`);
  mkdirSync(join(storeRoot, 'records', '0001'));
  linkSync(control, join(tasksRoot, 'control-record-alias.json'));
  linkSync(record, join(tasksRoot, 'task-record-alias.json'));
  rmSync(join(client.clientRoot, 'CLAUDE.md'));
  const before = mutableInventory(client.clientRoot);

  const preflight = projectJson(client, ['preflight']).value.projectInit;
  assert.equal(preflight.disposition, 'ready_to_add_bootstraps');
  assert.equal(preflight.taskState, 'valid_current_store');
  const initialized = projectJson(client, ['init']).value.projectInit;
  assert.deepEqual(initialized.created, ['CLAUDE.md']);
  assert.deepEqual(initialized.preserved,
    ['AGENTS.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/']);
  assert.equal(taskJson(client, ['doctor']).ok, true);
  assert.deepEqual(mutableInventory(client.clientRoot).filter((entry) => !entry.endsWith(' CLAUDE.md')), before);
});

test('injected phase failures roll back only the initializer-owned exact state', async () => {
  for (const phase of ['stage', 'claim:AGENTS.md', 'store']) {
    const client = makeClient(`rollback-${phase.replaceAll(':', '-')}`);
    const runtimeModule = await import(pathToFileURL(join(client.packageRoot, 'lib', 'runtime-roots.mjs')).href);
    const storeModule = await import(pathToFileURL(join(
      client.packageRoot, 'readme', 'meta', 'framework-data', 'store.mjs',
    )).href);
    const initializer = await import(pathToFileURL(join(client.packageRoot, 'lib', 'project-initializer.mjs')).href);
    const packageRuntime = runtimeModule.readPackageIdentity(pathToFileURL(client.binary).href);
    const context = await storeModule.repositoryContext(client.clientRoot);
    const clientRuntime = runtimeModule.validateClientRuntimeRoots({
      packageRuntime,
      context,
      entryPath: client.binary,
    });
    await assert.rejects(initializer.initializeProject(clientRuntime, {
      hooks: { [phase]: () => { throw new Error(`injected-${phase}`); } },
    }), new RegExp(`injected-${phase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
    assert.equal(existsSync(join(client.clientRoot, 'AGENTS.md')), false, `${phase} left AGENTS.md`);
    assert.equal(existsSync(join(client.clientRoot, 'CLAUDE.md')), false, `${phase} left CLAUDE.md`);
    assert.equal(existsSync(join(client.clientRoot, 'readme')), false, `${phase} left readme state`);
    assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), false, `${phase} left a lock`);
    assert.equal(readdirSync(client.clientRoot).some((name) => name.startsWith('.meta-framework-project-init-')),
      false, `${phase} left a transaction stage`);
  }
});

test('ownership loss and descriptor-parent swaps retain recovery evidence without escaping', async () => {
  const changed = makeClient('rollback-ownership-loss');
  const changedFixture = await initializerFixture(changed);
  const replacement = '# Client replacement during rollback\n';
  await assert.rejects(changedFixture.initializer.initializeProject(changedFixture.clientRuntime, {
    hooks: {
      'claim:AGENTS.md': () => {
        rmSync(join(changed.clientRoot, 'AGENTS.md'));
        writeFileSync(join(changed.clientRoot, 'AGENTS.md'), replacement);
        throw new Error('ownership-lost');
      },
    },
  }), (error) => error?.code === 'INITIALIZATION_RECOVERY_REQUIRED' && error?.exitCode === 5);
  assert.equal(readFileSync(join(changed.clientRoot, 'AGENTS.md'), 'utf8'), replacement);
  assert.equal(existsSync(join(changed.clientRoot, '.git', 'framework-data.lock')), true);
  const [changedStage] = readdirSync(changed.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-'));
  assert.equal(existsSync(join(changed.clientRoot, changedStage, 'journal.json')), true);

  for (const [name, hookName, swap] of [
    ['stage', 'beforeStageCleanup', (client, outside) => {
      const [stageName] = readdirSync(client.clientRoot)
        .filter((entry) => entry.startsWith('.meta-framework-project-init-v1-'));
      renameSync(join(client.clientRoot, stageName), join(client.clientRoot, `${stageName}.moved`));
      symlinkSync(outside, join(client.clientRoot, stageName), 'dir');
    }],
    ['parent', 'beforeClaim:readme/README.md', (client, outside) => {
      renameSync(join(client.clientRoot, 'readme'), join(client.clientRoot, 'readme.moved'));
      symlinkSync(outside, join(client.clientRoot, 'readme'), 'dir');
    }],
  ]) {
    const client = makeClient(`descriptor-swap-${name}`);
    const outside = join(suiteRoot, `descriptor-swap-${name}-outside`);
    const sentinel = join(outside, 'sentinel');
    mkdirSync(outside);
    writeFileSync(sentinel, 'outside-safe\n');
    const fixture = await initializerFixture(client);
    await assert.rejects(fixture.initializer.initializeProject(fixture.clientRuntime, {
      hooks: { [hookName]: () => swap(client, outside) },
    }), (error) => error?.code === 'INITIALIZATION_RECOVERY_REQUIRED' && error?.exitCode === 5);
    assert.equal(readFileSync(sentinel, 'utf8'), 'outside-safe\n', `${name} swap changed outside bytes`);
    assert.deepEqual(readdirSync(outside), ['sentinel'], `${name} swap created an outside path`);
    assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), true);
  }
});

test('init rejects client and package metadata changed after runtime validation', async () => {
  const cases = [
    ['client-script-chain', (client) => {
      const target = join(client.clientRoot, 'package.json');
      const manifest = JSON.parse(readFileSync(target, 'utf8'));
      manifest.scripts.premeta = 'exit 99';
      writeJson(target, manifest);
    }],
    ['client-alias', (client) => {
      const target = join(client.clientRoot, 'package.json');
      const manifest = JSON.parse(readFileSync(target, 'utf8'));
      manifest.dependencies['meta-framework'] = 'npm:@tvald/meta-framework@9.9.9';
      writeJson(target, manifest);
    }],
    ['client-lock', (client) => {
      const target = join(client.clientRoot, 'package-lock.json');
      const lock = JSON.parse(readFileSync(target, 'utf8'));
      lock.packages['node_modules/meta-framework'].version = '9.9.9';
      writeJson(target, lock);
    }],
    ['package-compatibility', (client) => {
      const target = join(client.packageRoot, 'package.json');
      const manifest = JSON.parse(readFileSync(target, 'utf8'));
      manifest.metaFramework.projectInit.version = '9.9.9';
      writeJson(target, manifest);
    }],
  ];
  for (const [name, mutate] of cases) {
    const client = makeClient(`post-validation-${name}`);
    const fixture = await initializerFixture(client);
    mutate(client);
    await assert.rejects(fixture.initializer.initializeProject(fixture.clientRuntime),
      (error) => typeof error?.code === 'string', `${name} mutation was accepted`);
    assert.equal(existsSync(join(client.clientRoot, 'AGENTS.md')), false, `${name} created AGENTS.md`);
    assert.equal(existsSync(join(client.clientRoot, 'CLAUDE.md')), false, `${name} created CLAUDE.md`);
    assert.equal(existsSync(join(client.clientRoot, 'readme')), false, `${name} created client state`);
    assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), false,
      `${name} left a lock`);
    assert.equal(readdirSync(client.clientRoot)
      .some((entry) => entry.startsWith('.meta-framework-project-init-v1-')), false,
      `${name} left a transaction stage`);
  }
});

test('readiness cannot authorize same-byte replacement of any preserved target class', async () => {
  const cases = [
    ['AGENTS.md', (client) => replaceFileWithSameBytes(join(client.clientRoot, 'AGENTS.md'))],
    ['CLAUDE.md', (client) => replaceFileWithSameBytes(join(client.clientRoot, 'CLAUDE.md'))],
    ['project cursor', (client) => replaceFileWithSameBytes(join(client.clientRoot, 'readme', 'README.md'))],
    ['task entrypoint', (client) => replaceFileWithSameBytes(
      join(client.clientRoot, 'readme', 'tasks', 'README.md'),
    )],
    ['task store', (client) => {
      const store = join(client.clientRoot, 'readme', 'tasks', 'store');
      const moved = join(client.clientRoot, 'readme', 'tasks', 'store.raced');
      renameSync(store, moved);
      cpSync(moved, store, { recursive: true });
    }],
  ];
  for (const [name, replace] of cases) {
    const client = makeClient(`readiness-race-${name.replaceAll(' ', '-')}`);
    projectJson(client, ['init']);
    const fixture = await initializerFixture(client);
    await assert.rejects(fixture.initializer.initializeProject(fixture.clientRuntime, {
      hooks: { afterReadinessBeforePreservedCapture: () => replace(client) },
    }), (error) => typeof error?.code === 'string', `${name} replacement was accepted`);
    assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), false,
      `${name} replacement left a lock`);
    assert.equal(readdirSync(client.clientRoot)
      .some((entry) => entry.startsWith('.meta-framework-project-init-v1-')), false,
      `${name} replacement left a transaction stage`);
  }
});

test('mode changes to preserved files and anchored parents fail before adding a bootstrap', async () => {
  for (const [name, target, mode] of [
    ['bootstrap', (client) => join(client.clientRoot, 'AGENTS.md'), 0o666],
    ['cursor', (client) => join(client.clientRoot, 'readme', 'README.md'), 0o666],
    ['readme-parent', (client) => join(client.clientRoot, 'readme'), 0o777],
    ['tasks-parent', (client) => join(client.clientRoot, 'readme', 'tasks'), 0o777],
  ]) {
    const client = makeClient(`preserved-mode-${name}`);
    projectJson(client, ['init']);
    rmSync(join(client.clientRoot, 'CLAUDE.md'));
    const fixture = await initializerFixture(client);
    const changed = target(client);
    await assert.rejects(fixture.initializer.initializeProject(fixture.clientRuntime, {
      hooks: { afterPreservedCapture: () => chmodSync(changed, mode) },
    }), (error) => typeof error?.code === 'string', `${name} mode change was accepted`);
    assert.equal(lstatSync(changed).mode & 0o777, mode);
    assert.equal(existsSync(join(client.clientRoot, 'CLAUDE.md')), false, `${name} created CLAUDE.md`);
    assert.equal(existsSync(join(client.clientRoot, '.git', 'framework-data.lock')), false,
      `${name} left a lock`);
    assert.equal(readdirSync(client.clientRoot)
      .some((entry) => entry.startsWith('.meta-framework-project-init-v1-')), false,
      `${name} left a transaction stage`);
  }
});

test('valid-current preflight leaves Git-common inventory, bytes, and modes unchanged', () => {
  const client = makeClient('preflight-read-only');
  projectJson(client, ['init']);
  const commonReported = run('git', ['rev-parse', '--git-common-dir'], {
    cwd: client.clientRoot,
  });
  assert.equal(commonReported.status, 0, commonReported.stderr);
  const commonRoot = resolve(client.clientRoot, commonReported.stdout.trim());
  const lock = join(commonRoot, 'framework-data.lock');
  assert.equal(existsSync(lock), false);
  const commonMode = lstatSync(commonRoot).mode & 0o777;
  chmodSync(commonRoot, 0o500);
  const beforeInventory = mutableInventory(commonRoot);
  const beforeDigest = treeDigest(commonRoot);
  try {
    const preflight = projectJson(client, ['preflight']).value.projectInit;
    assert.equal(preflight.disposition, 'valid_current_project');
    assert.equal(existsSync(lock), false, 'preflight created a task lock');
    assert.deepEqual(mutableInventory(commonRoot), beforeInventory);
    assert.equal(treeDigest(commonRoot), beforeDigest);
    assert.equal(lstatSync(commonRoot).mode & 0o777, 0o500);
  } finally {
    chmodSync(commonRoot, commonMode);
  }
});

test('a killed transaction resumes only from an unchanged exact phase prefix', {
  skip: process.platform === 'win32',
}, () => {
  const resumable = makeClient('killed-resumable');
  killInitializerAt(resumable, 'claim:CLAUDE.md');
  const [stageName] = readdirSync(resumable.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-'));
  assert.equal(typeof stageName, 'string');
  const stage = join(resumable.clientRoot, stageName);
  assert.equal(lstatSync(stage).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(stage, 'journal.json')).mode & 0o777, 0o600);
  assert.equal(lstatSync(join(stage, 'AGENTS.md')).mode & 0o777, 0o644);
  assert.equal(readFileSync(join(resumable.clientRoot, 'AGENTS.md'), 'utf8'), bootstrap('codex'));
  assert.equal(readFileSync(join(resumable.clientRoot, 'CLAUDE.md'), 'utf8'), bootstrap('claude'));
  recoverKilledInitializerLock(resumable);
  assert.equal(projectJson(resumable, ['preflight']).value.projectInit.disposition, 'prepared');
  const resumed = projectJson(resumable, ['init']).value.projectInit;
  assert.equal(resumed.result, 'initialized');
  assert.deepEqual(resumed.created,
    ['AGENTS.md', 'CLAUDE.md', 'readme/README.md', 'readme/tasks/README.md', 'readme/tasks/store/']);
  assert.match(resumed.storeDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(readdirSync(resumable.clientRoot)
    .some((name) => name.startsWith('.meta-framework-project-init-v1-')), false);
  assert.equal(taskJson(resumable, ['doctor']).ok, true);

  const changed = makeClient('killed-changed');
  killInitializerAt(changed, 'claim:AGENTS.md');
  recoverKilledInitializerLock(changed);
  const agents = join(changed.clientRoot, 'AGENTS.md');
  rmSync(agents);
  writeFileSync(agents, '# Client replacement after interruption\n');
  const before = readFileSync(agents);
  const rejected = project(changed, ['init'], 4);
  assertBoundedFailure(rejected, changed);
  assert.deepEqual(readFileSync(agents), before, 'resume overwrote a changed claimed destination');
  assert.equal(existsSync(join(changed.clientRoot, 'CLAUDE.md')), false);
  assert.equal(existsSync(join(changed.clientRoot, 'readme')), false);
  assert.equal(readdirSync(changed.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-')).length, 1);

  const unjournaled = makeClient('killed-before-journal');
  killInitializerAt(unjournaled, 'afterClaimBeforeJournal:AGENTS.md');
  recoverKilledInitializerLock(unjournaled);
  const unjournaledBefore = readFileSync(join(unjournaled.clientRoot, 'AGENTS.md'));
  const unjournaledRejected = project(unjournaled, ['init'], 4);
  assertBoundedFailure(unjournaledRejected, unjournaled);
  assert.deepEqual(readFileSync(join(unjournaled.clientRoot, 'AGENTS.md')), unjournaledBefore);
  assert.equal(readdirSync(unjournaled.clientRoot)
    .filter((name) => name.startsWith('.meta-framework-project-init-v1-')).length, 1);
});

test('source, script-chain, unsafe ancestor, and shared lock states fail closed with bounded errors', () => {
  const sourcePreflight = run(process.execPath, [join(sourceRoot, 'bin', 'meta-framework.mjs'), 'project', 'preflight'], {
    cwd: sourceRoot,
  });
  assert.equal(sourcePreflight.status, 0, sourcePreflight.stderr);
  const sourceValue = JSON.parse(sourcePreflight.stdout);
  assert.equal(sourceValue.projectInit.disposition, 'source_repository');
  const sourceInit = run(process.execPath, [join(sourceRoot, 'bin', 'meta-framework.mjs'), 'project', 'init'], {
    cwd: sourceRoot,
  });
  assert.equal(sourceInit.status, 4);
  assert.equal(sourceInit.stdout, '');
  assert.ok(Buffer.byteLength(sourceInit.stderr) <= 1_024);

  for (const [name, mutate] of [
    ['premeta', (scripts) => { scripts.premeta = 'exit 99'; }],
    ['postmeta', (scripts) => { scripts.postmeta = 'exit 99'; }],
    ['wrong-meta', (scripts) => { scripts.meta = 'meta-framework'; }],
    ['missing-meta', (scripts) => { delete scripts.meta; }],
  ]) {
    const client = makeClient(`script-${name}`);
    const manifestPath = join(client.clientRoot, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    mutate(manifest.scripts);
    writeJson(manifestPath, manifest);
    const result = project(client, ['init'], 4);
    assertBoundedFailure(result, client);
    assert.equal(existsSync(join(client.clientRoot, 'AGENTS.md')), false);
    assert.equal(existsSync(join(client.clientRoot, 'readme')), false);
  }

  for (const hook of ['premeta', 'postmeta']) {
    const client = makeClient(`npm-script-${hook}`);
    const manifestPath = join(client.clientRoot, 'package.json');
    const sentinel = join(client.clientRoot, `${hook}-ran`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.scripts[hook] = `node -e "require('node:fs').writeFileSync('${hook}-ran','unsafe')"`;
    writeJson(manifestPath, manifest);
    const rejected = npmProject(client, ['init'], 4);
    assertBoundedFailure(rejected, client);
    assert.equal(existsSync(sentinel), false, `${hook} ran despite the lifecycle-suppressed invocation`);
    assert.equal(existsSync(join(client.clientRoot, 'AGENTS.md')), false);
    assert.equal(existsSync(join(client.clientRoot, 'readme')), false);
  }

  if (process.platform !== 'win32') {
    const missing = makeClient('missing-local');
    const hostile = join(missing.clientRoot, 'hostile-bin');
    const sentinel = join(missing.clientRoot, 'hostile-ran');
    mkdirSync(hostile);
    const hostileBinary = join(hostile, 'meta-framework');
    writeFileSync(hostileBinary, '#!/bin/sh\n: > "$META_FRAMEWORK_SENTINEL"\nexit 99\n');
    chmodSync(hostileBinary, 0o755);
    rmSync(missing.binary);
    const rejected = run('npm', ['run', '--ignore-scripts', '--silent', 'meta', '--', 'project', 'init'], {
      cwd: missing.clientRoot,
      env: {
        ...process.env,
        PATH: `${hostile}${delimiter}${process.env.PATH ?? ''}`,
        META_FRAMEWORK_SENTINEL: sentinel,
        npm_config_update_notifier: 'false',
      },
    });
    assert.notEqual(rejected.status, 0);
    assert.equal(existsSync(sentinel), false, 'missing local package fell through to inherited PATH');
    assert.equal(existsSync(join(missing.clientRoot, 'AGENTS.md')), false);
    assert.equal(existsSync(join(missing.clientRoot, 'readme')), false);
  }

  const unsafe = makeClient('unsafe-readme');
  const outside = join(suiteRoot, 'outside-readme');
  mkdirSync(outside);
  symlinkSync(outside, join(unsafe.clientRoot, 'readme'), 'dir');
  const unsafeResult = project(unsafe, ['init'], 4);
  assertBoundedFailure(unsafeResult, unsafe);
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(existsSync(join(unsafe.clientRoot, 'AGENTS.md')), false);

  const busy = makeClient('busy');
  const lock = join(busy.clientRoot, '.git', 'framework-data.lock');
  mkdirSync(lock, { mode: 0o700 });
  writeJson(join(lock, 'owner.json'), {
    token: '11111111-1111-4111-8111-111111111111',
    pid: 999_999,
    host: 'fixture-host',
  });
  const busyResult = project(busy, ['init'], 5);
  assertBoundedFailure(busyResult, busy);
  assert.equal(existsSync(join(busy.clientRoot, 'AGENTS.md')), false);
  assert.equal(existsSync(join(busy.clientRoot, 'readme')), false);
});
