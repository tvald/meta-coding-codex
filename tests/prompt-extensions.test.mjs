import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceBinary = join(sourceRoot, 'bin', 'meta-framework.mjs');
const profiles = ['implementer', 'qa', 'reviewer', 'root', 'security'];
const harnesses = ['claude', 'codex', 'portable'];
const reviewName = '@example/review-skill';
const reviewVersion = '1.2.3';
const reviewNamespace = 'example.review';
const reviewContent = `# Reviewed extension\n\n${
  'Apply the client-reviewed checklist before declaring completion.\n'.repeat(8)}`;
const opsName = '@example/ops-skill';
const opsVersion = '2.3.4';
const opsNamespace = 'example.ops';
const opsContent = '# Operations extension\n\nRecord rollback evidence for operational changes.\n';
const lifecycleName = '@example/lifecycle-skill';
const lifecycleVersion = '3.4.5';

let suiteRoot;
let cacheRoot;
let baselineClient;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

function npmEnvironment() {
  return {
    ...process.env,
    npm_config_cache: cacheRoot,
    npm_config_update_notifier: 'false',
  };
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' ||
      (typeof value === 'number' && Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  assert.ok(plainObject(value));
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeCanonicalJson(path, value) {
  writeFileSync(path, `${canonicalJson(value)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function mutateJson(path, mutation, { canonical = false } = {}) {
  const value = readJson(path);
  mutation(value);
  if (canonical) writeCanonicalJson(path, value);
  else writeJson(path, value);
}

function extensionManifest({
  name,
  version,
  namespace,
  id,
  path,
  profiles: selectedProfiles,
  slot,
  order = 10,
}) {
  return {
    apiVersion: 1,
    facets: [{ id, kind: 'skill', order, path, profiles: selectedProfiles, slot }],
    frameworkRange: '>=1.0.0 <2.0.0',
    manifestVersion: 1,
    name,
    namespace,
    promptFormatVersions: [1],
    version,
  };
}

function createExtensionPackage(parent, definition) {
  const root = join(parent, definition.directory);
  mkdirSync(join(root, 'facets'), { recursive: true });
  writeJson(join(root, 'package.json'), {
    name: definition.name,
    version: definition.version,
    ...(definition.scripts === undefined ? {} : { scripts: definition.scripts }),
  });
  writeCanonicalJson(join(root, 'meta-framework.extension.json'), extensionManifest(definition));
  writeFileSync(join(root, definition.path), definition.content);
  const packRoot = join(parent, `${definition.directory}-pack`);
  mkdirSync(packRoot);
  const packed = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packRoot], {
    cwd: root,
    env: npmEnvironment(),
  });
  assert.equal(packed.status, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  return join(packRoot, filename);
}

function packFramework(parent) {
  const packRoot = join(parent, 'framework-pack');
  mkdirSync(packRoot);
  const packed = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packRoot], {
    cwd: sourceRoot,
    env: npmEnvironment(),
  });
  assert.equal(packed.status, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  return join(packRoot, filename);
}

function normalizeInstalledClient(clientRoot) {
  const manifestPath = join(clientRoot, 'package.json');
  const manifest = readJson(manifestPath);
  manifest.dependencies['meta-framework'] = 'npm:@tvald/meta-framework@1.0.0';
  manifest.dependencies[reviewName] = reviewVersion;
  manifest.dependencies[opsName] = opsVersion;
  manifest.dependencies[lifecycleName] = lifecycleVersion;
  writeJson(manifestPath, manifest);

  const lockPath = join(clientRoot, 'package-lock.json');
  const lock = readJson(lockPath);
  lock.packages[''].dependencies['meta-framework'] = 'npm:@tvald/meta-framework@1.0.0';
  lock.packages[''].dependencies[reviewName] = reviewVersion;
  lock.packages[''].dependencies[opsName] = opsVersion;
  lock.packages[''].dependencies[lifecycleName] = lifecycleVersion;
  const framework = lock.packages['node_modules/meta-framework'];
  framework.name = '@tvald/meta-framework';
  framework.version = '1.0.0';
  framework.resolved = 'https://registry.npmjs.org/@tvald/meta-framework/-/meta-framework-1.0.0.tgz';
  const review = lock.packages[`node_modules/${reviewName}`];
  review.name = reviewName;
  review.version = reviewVersion;
  review.resolved =
    'https://registry.npmjs.org/@example/review-skill/-/review-skill-1.2.3.tgz';
  const ops = lock.packages[`node_modules/${opsName}`];
  ops.name = opsName;
  ops.version = opsVersion;
  ops.resolved = 'https://registry.npmjs.org/@example/ops-skill/-/ops-skill-2.3.4.tgz';
  const lifecycle = lock.packages[`node_modules/${lifecycleName}`];
  lifecycle.name = lifecycleName;
  lifecycle.version = lifecycleVersion;
  lifecycle.resolved =
    'https://registry.npmjs.org/@example/lifecycle-skill/-/lifecycle-skill-3.4.5.tgz';
  for (const entry of [framework, review, ops, lifecycle]) {
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
  }
  writeJson(lockPath, lock);
}

function makeBaselineClient(parent, frameworkTarball, reviewTarball, opsTarball, lifecycleTarball, sentinel) {
  const clientRoot = join(parent, 'baseline-client');
  mkdirSync(clientRoot);
  writeJson(join(clientRoot, 'package.json'), {
    name: 'prompt-extension-client',
    private: true,
    scripts: { meta: 'node ./node_modules/meta-framework/bin/meta-framework.mjs' },
    dependencies: {
      'meta-framework': `file:${frameworkTarball}`,
      [reviewName]: `file:${reviewTarball}`,
      [opsName]: `file:${opsTarball}`,
      [lifecycleName]: `file:${lifecycleTarball}`,
    },
    metaFramework: { extensions: [reviewName, opsName] },
  });
  const locked = run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: clientRoot,
    env: { ...npmEnvironment(), META_EXTENSION_SENTINEL: sentinel },
  });
  assert.equal(locked.status, 0, locked.stderr);
  const installed = run('npm', ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
    cwd: clientRoot,
    env: { ...npmEnvironment(), META_EXTENSION_SENTINEL: sentinel },
  });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(existsSync(sentinel), false, 'npm ci --ignore-scripts executed an extension lifecycle');
  normalizeInstalledClient(clientRoot);
  const initialized = run('git', ['init', '--quiet'], { cwd: clientRoot });
  assert.equal(initialized.status, 0, initialized.stderr);
  writeFileSync(join(clientRoot, 'AGENTS.md'), '# Client instructions\nDO_NOT_LEAK_CLIENT\n');
  return clientRoot;
}

function cloneClient(label) {
  const root = join(suiteRoot, `client-${label.replaceAll(/[^a-z0-9-]/gu, '-')}`);
  cpSync(baselineClient, root, { recursive: true, preserveTimestamps: true });
  return {
    root,
    binary: join(root, 'node_modules', 'meta-framework', 'bin', 'meta-framework.mjs'),
    manifestPath: join(root, 'package.json'),
    lockPath: join(root, 'package-lock.json'),
    reviewRoot: join(root, 'node_modules', ...reviewName.split('/')),
    opsRoot: join(root, 'node_modules', ...opsName.split('/')),
    lifecycleRoot: join(root, 'node_modules', ...lifecycleName.split('/')),
  };
}

function setAllowlist(client, names) {
  mutateJson(client.manifestPath, (manifest) => {
    manifest.metaFramework = { extensions: names };
  });
}

function omitAllowlist(client) {
  mutateJson(client.manifestPath, (manifest) => {
    delete manifest.metaFramework;
  });
}

function extensionManifestPath(root) {
  return join(root, 'meta-framework.extension.json');
}

function facetPath(root, name) {
  return join(root, 'facets', name);
}

function setFacetCount(root, count, selectedProfiles = ['root']) {
  const manifestPath = extensionManifestPath(root);
  const manifest = readJson(manifestPath);
  const first = manifest.facets[0];
  first.profiles = selectedProfiles;
  for (let index = 1; index < count; index += 1) {
    const id = `${first.id}${index}`;
    const relativePath = `facets/${id}.md`;
    manifest.facets.push({
      id,
      kind: 'skill',
      order: first.order + index,
      path: relativePath,
      profiles: selectedProfiles,
      slot: `extension.${id}`,
    });
    writeFileSync(join(root, ...relativePath.split('/')), `# ${id}\n\nBounded extension facet ${index}.\n`);
  }
  writeCanonicalJson(manifestPath, manifest);
}

function invoke(client, args, extraEnvironment = {}) {
  return run(process.execPath, [client.binary, ...args], {
    cwd: client.root,
    env: {
      ...process.env,
      DO_NOT_LEAK_ENVIRONMENT: 'extension-secret',
      ...extraEnvironment,
    },
  });
}

function invokeHook(client, profile, source = 'startup', sessionId = 'extension-hook-session') {
  const event = profile === 'root'
    ? { hook_event_name: 'SessionStart', source, session_id: sessionId }
    : { hook_event_name: 'SubagentStart', agent_type: `meta_${profile}`, session_id: sessionId };
  return run(process.execPath,
    [client.binary, 'hook', '--harness', 'codex', '--profile', profile], {
      cwd: client.root,
      input: JSON.stringify(event),
      env: { ...process.env, DO_NOT_LEAK_ENVIRONMENT: 'extension-secret' },
    });
}

function invokeSource(args) {
  return run(process.execPath, [sourceBinary, ...args], { cwd: sourceRoot });
}

function parsePrompt(output) {
  const lines = output.split('\n');
  assert.equal(lines[0], 'META-FRAMEWORK-AGENT-PROMPT 1');
  return { manifest: JSON.parse(lines[1]), body: lines.slice(2).join('\n') };
}

function parseContent(output) {
  const lines = output.split('\n');
  assert.equal(lines[0], 'META-FRAMEWORK-CONTENT 1');
  return { metadata: JSON.parse(lines[1]), content: lines.slice(2).join('\n') };
}

function assertFailure(result, label, status = 1) {
  assert.equal(result.status, status,
    `${label}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.equal(result.stdout, '', label);
  assert.ok(Buffer.byteLength(result.stderr) <= 4_096, label);
  assert.doesNotMatch(result.stderr,
    /node:internal| at file:|DO_NOT_LEAK_CLIENT|extension-secret|baseline-client|client-/u, label);
}

test.before(() => {
  suiteRoot = mkdtempSync(join(tmpdir(), 'meta-framework-extensions-'));
  cacheRoot = join(suiteRoot, 'npm-cache');
  mkdirSync(cacheRoot);
  const extensionSources = join(suiteRoot, 'extension-sources');
  mkdirSync(extensionSources);
  const reviewTarball = createExtensionPackage(extensionSources, {
    directory: 'review-skill',
    name: reviewName,
    version: reviewVersion,
    namespace: reviewNamespace,
    id: 'review',
    path: 'facets/review.md',
    profiles,
    slot: 'extension.review',
    content: reviewContent,
  });
  const opsTarball = createExtensionPackage(extensionSources, {
    directory: 'ops-skill',
    name: opsName,
    version: opsVersion,
    namespace: opsNamespace,
    id: 'ops',
    path: 'facets/ops.md',
    profiles: ['qa', 'root'],
    slot: 'extension.ops',
    content: opsContent,
  });
  const lifecycleSentinel = join(suiteRoot, 'packed-lifecycle-sentinel');
  const lifecycleTarball = createExtensionPackage(extensionSources, {
    directory: 'lifecycle-skill',
    name: lifecycleName,
    version: lifecycleVersion,
    namespace: 'example.lifecycle',
    id: 'lifecycle',
    path: 'facets/lifecycle.md',
    profiles: ['root'],
    slot: 'extension.lifecycle',
    content: '# Lifecycle sentinel\n\nThis package must install without running scripts.\n',
    scripts: {
      postinstall: 'node -e "require(\'node:fs\').writeFileSync(process.env.META_EXTENSION_SENTINEL,\'ran\')"',
    },
  });
  baselineClient = makeBaselineClient(suiteRoot, packFramework(suiteRoot), reviewTarball, opsTarball,
    lifecycleTarball, lifecycleSentinel);
});

function makeTreeRemovable(target) {
  if (!existsSync(target)) return;
  const info = lstatSync(target);
  if (info.isDirectory()) {
    chmodSync(target, 0o700);
    for (const name of readdirSync(target)) makeTreeRemovable(join(target, name));
  } else if (info.isFile()) chmodSync(target, 0o600);
}

test.after(() => {
  if (suiteRoot !== undefined) {
    makeTreeRemovable(suiteRoot);
    rmSync(suiteRoot, { recursive: true, force: true });
  }
});

test('absent and empty allowlists preserve all fifteen source prompts byte for byte without scanning', () => {
  const sourceOutputs = new Map();
  for (const profile of profiles) for (const harness of harnesses) {
    const args = ['agent-prompt', '--profile', profile, '--harness', harness];
    const source = invokeSource(args);
    assert.equal(source.status, 0, source.stderr);
    sourceOutputs.set(`${profile}:${harness}`, source.stdout);
  }

  for (const mode of ['absent', 'empty']) {
    const client = cloneClient(`disabled-${mode}`);
    if (mode === 'absent') omitAllowlist(client);
    else setAllowlist(client, []);
    writeFileSync(join(client.reviewRoot, 'hostile-unlisted-code.js'),
      'throw new Error("an unallowlisted extension was scanned");\n');
    writeFileSync(extensionManifestPath(client.opsRoot), '{invalid and deliberately unreadable as JSON\n');
    for (const profile of profiles) for (const harness of harnesses) {
      const args = ['agent-prompt', '--profile', profile, '--harness', harness];
      const installed = invoke(client, args);
      assert.equal(installed.status, 0, installed.stderr);
      assert.equal(installed.stdout, sourceOutputs.get(`${profile}:${harness}`), `${mode}:${profile}:${harness}`);
      assert.deepEqual(parsePrompt(installed.stdout).manifest.extensions, []);
      assert.doesNotMatch(installed.stdout,
        /DO_NOT_LEAK|extension-secret|unallowlisted extension was scanned/u);
    }
  }
});

test('ordered extensions compose deterministically across profiles and harnesses with exact provenance', () => {
  const client = cloneClient('happy');
  const extensionRecords = new Map();
  const reviewPackageText = readFileSync(join(client.reviewRoot, 'package.json'), 'utf8');
  const reviewManifestText = readFileSync(extensionManifestPath(client.reviewRoot), 'utf8');
  const reviewDigest = sha256(reviewContent);
  const lock = readJson(client.lockPath);
  for (const [name, root, namespace] of [
    [reviewName, client.reviewRoot, reviewNamespace],
    [opsName, client.opsRoot, opsNamespace],
  ]) {
    extensionRecords.set(name, {
      apiVersion: 1,
      frameworkRange: '>=1.0.0 <2.0.0',
      integrity: lock.packages[`node_modules/${name}`].integrity,
      manifestDigest: sha256(readFileSync(extensionManifestPath(root))),
      manifestVersion: 1,
      name,
      namespace,
      packageManifestDigest: sha256(readFileSync(join(root, 'package.json'))),
      version: name === reviewName ? reviewVersion : opsVersion,
    });
  }

  const outputs = new Map();
  const hookSession = 'ordered-extension-hook-session';
  const seededHook = invokeHook(client, 'root', 'startup', hookSession);
  assert.equal(seededHook.status, 0, seededHook.stderr);
  assert.match(seededHook.stdout, /^META-FRAMEWORK-AGENT-PROMPT 1\n/u);
  for (const profile of profiles) for (const harness of harnesses) {
    const args = ['agent-prompt', '--profile', profile, '--harness', harness];
    const first = invoke(client, args);
    const second = invoke(client, args);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout, `${profile}:${harness}`);
    if (harness === 'codex') {
      const hook = invokeHook(client, profile, 'startup', hookSession);
      assert.equal(hook.status, 0, hook.stderr);
      assert.equal(hook.stderr, '');
      assert.equal(hook.stdout, first.stdout, `hook:${profile}`);
    }
    assert.ok(Buffer.byteLength(first.stdout) <= 65_536);
    assert.doesNotMatch(first.stdout, /node_modules|https:\/\/|DO_NOT_LEAK|extension-secret/u);
    const parsed = parsePrompt(first.stdout);
    outputs.set(`${profile}:${harness}`, parsed);
    assert.deepEqual(parsed.manifest.extensions,
      [extensionRecords.get(reviewName), extensionRecords.get(opsName)]);
    const reviewFacet = parsed.manifest.facets.find(({ id }) =>
      id === 'extension.example.review.review');
    assert.deepEqual(reviewFacet, {
      id: 'extension.example.review.review',
      topic: 'extension.example.review',
      path: 'facets/review.md',
      rawSourceDigest: reviewDigest,
      renderedContentDigest: reviewDigest,
    });
    assert.match(parsed.body,
      /META-FRAMEWORK-FACET extension\.example\.review\.review extension\.example\.review\n# Reviewed extension/u);
    const opsFacet = parsed.manifest.facets.find(({ id }) => id === 'extension.example.ops.ops');
    assert.equal(opsFacet !== undefined, ['qa', 'root'].includes(profile));
    assert.equal(parsed.body.includes(opsContent), ['qa', 'root'].includes(profile));
    if (profile === 'root' && harness === 'claude') {
      const extensionBody = parsed.body.slice(parsed.body.indexOf('META-FRAMEWORK-FACET extension.'));
      assert.ok(Buffer.byteLength(extensionBody) > 371);
      assert.ok(Buffer.byteLength(extensionBody) <= 8_192);
    }
    const withoutDigest = { ...parsed.manifest };
    delete withoutDigest.digest;
    assert.equal(parsed.manifest.digest,
      sha256(`${canonicalJson(withoutDigest)}\n${parsed.body}`));
  }
  for (const profile of profiles) {
    const extensionTail = (parsed) => parsed.body.slice(
      parsed.body.indexOf('META-FRAMEWORK-FACET extension.'));
    assert.equal(extensionTail(outputs.get(`${profile}:claude`)),
      extensionTail(outputs.get(`${profile}:codex`)));
    assert.equal(extensionTail(outputs.get(`${profile}:codex`)),
      extensionTail(outputs.get(`${profile}:portable`)));
  }

  assert.equal(sha256(reviewPackageText), extensionRecords.get(reviewName).packageManifestDigest);
  assert.equal(sha256(reviewManifestText), extensionRecords.get(reviewName).manifestDigest);
  const explained = invoke(client, ['explain', 'extension.example.review.review']);
  assert.equal(explained.status, 0, explained.stderr);
  const parsedExplanation = parseContent(explained.stdout);
  assert.equal(parsedExplanation.metadata.kind, 'facet');
  assert.equal(parsedExplanation.metadata.id, 'extension.example.review.review');
  assert.equal(parsedExplanation.metadata.topic, 'extension.example.review');
  assert.equal(parsedExplanation.metadata.path, 'facets/review.md');
  assert.deepEqual(parsedExplanation.metadata.templateVariables, []);
  assert.equal(parsedExplanation.metadata.contentDigest, reviewDigest);
  assert.equal(parsedExplanation.content, reviewContent);
  assert.doesNotMatch(explained.stdout, /node_modules|https:\/\/|DO_NOT_LEAK|extension-secret/u);
});

test('allowlist order, one-byte inputs, profile filters, and disjoint slot reuse are deterministic', () => {
  const ordered = cloneClient('ordered-review-first');
  const reversed = cloneClient('ordered-ops-first');
  setAllowlist(reversed, [opsName, reviewName]);
  const args = ['agent-prompt', '--profile', 'root', '--harness', 'portable'];
  const first = invoke(ordered, args);
  const second = invoke(reversed, args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const firstParsed = parsePrompt(first.stdout);
  const secondParsed = parsePrompt(second.stdout);
  assert.deepEqual(firstParsed.manifest.extensions.map(({ name }) => name), [reviewName, opsName]);
  assert.deepEqual(secondParsed.manifest.extensions.map(({ name }) => name), [opsName, reviewName]);
  assert.ok(firstParsed.body.indexOf('extension.example.review.review') <
    firstParsed.body.indexOf('extension.example.ops.ops'));
  assert.ok(secondParsed.body.indexOf('extension.example.ops.ops') <
    secondParsed.body.indexOf('extension.example.review.review'));
  assert.notEqual(first.stdout, second.stdout);

  const oneByte = cloneClient('one-byte');
  const before = invoke(oneByte, args);
  writeFileSync(facetPath(oneByte.reviewRoot, 'review.md'), reviewContent.replace('client-reviewed', 'client reviewed'));
  const after = invoke(oneByte, args);
  assert.equal(before.status, 0, before.stderr);
  assert.equal(after.status, 0, after.stderr);
  const beforeParsed = parsePrompt(before.stdout);
  const afterParsed = parsePrompt(after.stdout);
  assert.notEqual(beforeParsed.manifest.digest, afterParsed.manifest.digest);
  assert.notEqual(
    beforeParsed.manifest.facets.find(({ id }) => id === 'extension.example.review.review').rawSourceDigest,
    afterParsed.manifest.facets.find(({ id }) => id === 'extension.example.review.review').rawSourceDigest);
  assert.equal(
    beforeParsed.manifest.extensions.find(({ name }) => name === reviewName).manifestDigest,
    afterParsed.manifest.extensions.find(({ name }) => name === reviewName).manifestDigest);

  const manifestByte = cloneClient('one-byte-manifest');
  const manifestBefore = parsePrompt(invoke(manifestByte, args).stdout);
  mutateJson(extensionManifestPath(manifestByte.reviewRoot), (manifest) => {
    manifest.facets[0].order = 11;
  }, { canonical: true });
  const manifestAfterResult = invoke(manifestByte, args);
  assert.equal(manifestAfterResult.status, 0, manifestAfterResult.stderr);
  const manifestAfter = parsePrompt(manifestAfterResult.stdout);
  const manifestBeforeRecord = manifestBefore.manifest.extensions.find(({ name }) => name === reviewName);
  const manifestAfterRecord = manifestAfter.manifest.extensions.find(({ name }) => name === reviewName);
  assert.notEqual(manifestBeforeRecord.manifestDigest, manifestAfterRecord.manifestDigest);
  assert.equal(manifestBeforeRecord.packageManifestDigest, manifestAfterRecord.packageManifestDigest);
  assert.notEqual(manifestBefore.manifest.digest, manifestAfter.manifest.digest);

  const packageByte = cloneClient('one-byte-package');
  const packageBefore = parsePrompt(invoke(packageByte, args).stdout);
  const packagePath = join(packageByte.reviewRoot, 'package.json');
  const packageText = readFileSync(packagePath, 'utf8');
  writeFileSync(packagePath, packageText.replace(/\}\n$/u, ' }\n'));
  const packageAfterResult = invoke(packageByte, args);
  assert.equal(packageAfterResult.status, 0, packageAfterResult.stderr);
  const packageAfter = parsePrompt(packageAfterResult.stdout);
  const packageBeforeRecord = packageBefore.manifest.extensions.find(({ name }) => name === reviewName);
  const packageAfterRecord = packageAfter.manifest.extensions.find(({ name }) => name === reviewName);
  assert.notEqual(packageBeforeRecord.packageManifestDigest, packageAfterRecord.packageManifestDigest);
  assert.equal(packageBeforeRecord.manifestDigest, packageAfterRecord.manifestDigest);
  assert.notEqual(packageBefore.manifest.digest, packageAfter.manifest.digest);

  const disjoint = cloneClient('disjoint-slot');
  mutateJson(extensionManifestPath(disjoint.reviewRoot), (manifest) => {
    manifest.facets[0].profiles = ['implementer'];
    manifest.facets[0].slot = 'extension.shared';
  }, { canonical: true });
  mutateJson(extensionManifestPath(disjoint.opsRoot), (manifest) => {
    manifest.facets[0].profiles = ['qa'];
    manifest.facets[0].slot = 'extension.shared';
  }, { canonical: true });
  for (const profile of ['implementer', 'qa', 'reviewer']) {
    const result = invoke(disjoint, ['agent-prompt', '--profile', profile]);
    assert.equal(result.status, 0, result.stderr);
    const ids = parsePrompt(result.stdout).manifest.facets.map(({ id }) => id);
    assert.equal(ids.includes('extension.example.review.review'), profile === 'implementer');
    assert.equal(ids.includes('extension.example.ops.ops'), profile === 'qa');
  }

  const falseLifecycleFlag = cloneClient('false-lifecycle-flag');
  mutateJson(falseLifecycleFlag.lockPath, (lock) => {
    lock.packages[`node_modules/${reviewName}`].hasInstallScript = false;
  });
  const falseLifecycleResult = invoke(falseLifecycleFlag, args);
  assert.equal(falseLifecycleResult.status, 0, falseLifecycleResult.stderr);

  const absentLockName = cloneClient('absent-lock-name');
  mutateJson(absentLockName.lockPath, (lock) => {
    delete lock.packages[`node_modules/${reviewName}`].name;
  });
  const absentLockNameResult = invoke(absentLockName, args);
  assert.equal(absentLockNameResult.status, 0, absentLockNameResult.stderr);
});

test('maximum facet and inventory boundaries succeed exactly at their declared limits',
  { skip: process.platform === 'win32' }, () => {
    const facetMaximum = cloneClient('facet-maximum');
    setFacetCount(facetMaximum.reviewRoot, 8);
    setFacetCount(facetMaximum.opsRoot, 8);
    const facetResult = invoke(facetMaximum, ['agent-prompt', '--profile', 'root', '--harness', 'claude']);
    assert.equal(facetResult.status, 0, facetResult.stderr);
    const parsed = parsePrompt(facetResult.stdout);
    const selected = parsed.manifest.facets.filter(({ id }) => id.startsWith('extension.'));
    assert.equal(selected.length, 16);
    const extensionBody = parsed.body.slice(parsed.body.indexOf('META-FRAMEWORK-FACET extension.'));
    assert.ok(Buffer.byteLength(extensionBody) > 371);
    assert.ok(Buffer.byteLength(extensionBody) <= 8_192);
    assert.ok(Buffer.byteLength(facetResult.stdout) <= 65_536);

    const maximumCodexPrompt = invoke(facetMaximum,
      ['agent-prompt', '--profile', 'root', '--harness', 'codex']);
    const maximumCodexHook = invokeHook(facetMaximum, 'root', 'compact', 'maximum-extension-hook-session');
    assert.equal(maximumCodexPrompt.status, 0, maximumCodexPrompt.stderr);
    assert.equal(maximumCodexHook.status, 0, maximumCodexHook.stderr);
    assert.equal(maximumCodexHook.stdout, maximumCodexPrompt.stdout);
    assert.ok(Buffer.byteLength(maximumCodexHook.stdout) > 30_000);
    assert.ok(Buffer.byteLength(maximumCodexHook.stdout) <= 65_536);

    const inventoryMaximum = cloneClient('inventory-maximum');
    setAllowlist(inventoryMaximum, [reviewName]);
    const oldPath = facetPath(inventoryMaximum.reviewRoot, 'review.md');
    const parts = Array.from({ length: 60 }, () => 'a');
    const relativePath = `facets/${parts.join('/')}/review.md`;
    const target = join(inventoryMaximum.reviewRoot, ...relativePath.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(oldPath));
    unlinkSync(oldPath);
    mutateJson(extensionManifestPath(inventoryMaximum.reviewRoot), (manifest) => {
      manifest.facets[0].path = relativePath;
    }, { canonical: true });
    const inventoryResult = invoke(inventoryMaximum, ['agent-prompt', '--profile', 'root']);
    assert.equal(inventoryResult.status, 0, inventoryResult.stderr);
  });

test('allowlist, dependency, lock, package, manifest, content, path, conflict, and budget drift fail closed',
  { skip: process.platform === 'win32' }, () => {
    const cases = [
      ['duplicate allowlist name', (client) => setAllowlist(client, [reviewName, reviewName])],
      ['uppercase allowlist name', (client) => setAllowlist(client, ['@Example/review-skill'])],
      ['framework allowlist name', (client) => setAllowlist(client, ['meta-framework'])],
      ['more than eight allowlist names', (client) => setAllowlist(client,
        Array.from({ length: 9 }, (_, index) => `extension-${index}`))],
      ['dependency range', (client) => mutateJson(client.manifestPath, (manifest) => {
        manifest.dependencies[reviewName] = '^1.2.3';
      })],
      ['missing direct dependency', (client) => mutateJson(client.manifestPath, (manifest) => {
        delete manifest.dependencies[reviewName];
      })],
      ['transitive-only installed package', (client) => {
        mutateJson(client.manifestPath, (manifest) => { delete manifest.dependencies[reviewName]; });
        mutateJson(client.lockPath, (lock) => { delete lock.packages[''].dependencies[reviewName]; });
      }],
      ['optional-only dependency', (client) => mutateJson(client.manifestPath, (manifest) => {
        delete manifest.dependencies[reviewName];
        manifest.optionalDependencies = { [reviewName]: reviewVersion };
      })],
      ['dependency alias', (client) => mutateJson(client.manifestPath, (manifest) => {
        manifest.dependencies[reviewName] = `npm:${reviewName}@${reviewVersion}`;
      })],
      ['duplicate client manifest key', (client) => {
        const text = readFileSync(client.manifestPath, 'utf8');
        writeFileSync(client.manifestPath,
          text.replace('  "dependencies": {', '  "dependencies": {},\n  "dependencies": {'));
      }],
      ['lock version', (client) => mutateJson(client.lockPath, (lock) => { lock.lockfileVersion = 2; })],
      ['duplicate client lock key', (client) => {
        const text = readFileSync(client.lockPath, 'utf8');
        writeFileSync(client.lockPath,
          text.replace('  "lockfileVersion": 3,', '  "lockfileVersion": 3,\n  "lockfileVersion": 3,'));
      }],
      ['lock root mismatch', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[''].dependencies[reviewName] = '1.2.4';
      })],
      ['lock installed version mismatch', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].version = '1.2.4';
      })],
      ['lock installed name mismatch', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].name = '@example/other';
      })],
      ['lock HTTP resolution', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].resolved =
          'http://registry.npmjs.org/@example/review-skill/-/review-skill-1.2.3.tgz';
      })],
      ['lock credentialed resolution', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].resolved =
          'https://user:pass@registry.npmjs.org/review-skill-1.2.3.tgz';
      })],
      ['lock query resolution', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].resolved += '?token=secret';
      })],
      ['lock noncanonical integrity', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].integrity = 'sha512-AAAA';
      })],
      ['lock link entry', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].link = true;
      })],
      ['lock dependency-bearing entry', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].dependencies = { hidden: '1.0.0' };
      })],
      ['lock devOptional entry', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].devOptional = true;
      })],
      ['lock peer entry', (client) => mutateJson(client.lockPath, (lock) => {
        lock.packages[`node_modules/${reviewName}`].peer = true;
      })],
      ['competing shrinkwrap', (client) => writeJson(join(client.root, 'npm-shrinkwrap.json'),
        readJson(client.lockPath))],
      ['package scripts and lifecycle sentinel', (client) => mutateJson(join(client.reviewRoot, 'package.json'),
        (manifest) => {
          manifest.scripts = {
            postinstall: 'node -e "require(\'node:fs\').writeFileSync(process.env.META_EXTENSION_SENTINEL,\'ran\')"',
          };
        })],
      ['package dependency field', (client) => mutateJson(join(client.reviewRoot, 'package.json'),
        (manifest) => { manifest.dependencies = {}; })],
      ['package duplicate JSON key', (client) => {
        const path = join(client.reviewRoot, 'package.json');
        const text = readFileSync(path, 'utf8');
        writeFileSync(path, text.replace('  "name":', '  "name": "duplicate",\n  "name":'));
      }],
      ['package identity name drift', (client) => mutateJson(join(client.reviewRoot, 'package.json'),
        (manifest) => { manifest.name = '@example/drifted'; })],
      ['package identity version drift', (client) => mutateJson(join(client.reviewRoot, 'package.json'),
        (manifest) => { manifest.version = '1.2.4'; })],
      ['package manifest size', (client) => writeFileSync(join(client.reviewRoot, 'package.json'),
        `${JSON.stringify({ name: reviewName, version: reviewVersion, description: 'x'.repeat(32_768) })}\n`)],
      ['package entrypoint field', (client) => mutateJson(join(client.reviewRoot, 'package.json'),
        (manifest) => { manifest.main = 'index.js'; })],
      ['unlisted JavaScript file', (client) => writeFileSync(join(client.reviewRoot, 'index.js'),
        'throw new Error("extension code executed");\n')],
      ['declared JavaScript facet', (client) => {
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[0].path = 'facets/review.js';
        }, { canonical: true });
        unlinkSync(facetPath(client.reviewRoot, 'review.md'));
        writeFileSync(facetPath(client.reviewRoot, 'review.js'), 'throw new Error("never execute");\n');
      }],
      ['provider discovery tree', (client) => {
        mkdirSync(join(client.reviewRoot, '.claude', 'skills', 'evil'), { recursive: true });
        writeFileSync(join(client.reviewRoot, '.claude', 'skills', 'evil', 'SKILL.md'), '# Never discover\n');
      }],
      ['symbolic extension root', (client) => {
        const physical = `${client.reviewRoot}-physical`;
        renameSync(client.reviewRoot, physical);
        symlinkSync(physical, client.reviewRoot);
      }],
      ['executable facet', (client) => chmodSync(facetPath(client.reviewRoot, 'review.md'), 0o755)],
      ['group-writable facet', (client) => chmodSync(facetPath(client.reviewRoot, 'review.md'), 0o664)],
      ['group-writable facet directory', (client) => chmodSync(join(client.reviewRoot, 'facets'), 0o775)],
      ['group-writable extension root', (client) => chmodSync(client.reviewRoot, 0o775)],
      ['hardlinked facet', (client) => linkSync(facetPath(client.reviewRoot, 'review.md'),
        facetPath(client.reviewRoot, 'hardlink.md'))],
      ['nonregular facet', (client) => {
        unlinkSync(facetPath(client.reviewRoot, 'review.md'));
        mkdirSync(facetPath(client.reviewRoot, 'review.md'));
      }],
      ['unknown manifest key', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.unknown = true; }, { canonical: true })],
      ['unsupported API version', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.apiVersion = 2; }, { canonical: true })],
      ['manifest wrong API type', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.apiVersion = '1'; }, { canonical: true })],
      ['incompatible framework range', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.frameworkRange = '>=2.0.0 <3.0.0'; }, { canonical: true })],
      ['manifest size', (client) => writeFileSync(extensionManifestPath(client.reviewRoot),
        `${' '.repeat(32_768)}\n`)],
      ['noncanonical manifest JSON', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        () => {})],
      ['duplicate manifest JSON key', (client) => {
        const path = extensionManifestPath(client.reviewRoot);
        const text = readFileSync(path, 'utf8');
        writeFileSync(path, text.replace('{"apiVersion":1,', '{"apiVersion":1,"apiVersion":1,'));
      }],
      ['manifest profile order', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].profiles = ['root', 'qa']; }, { canonical: true })],
      ['empty manifest profiles', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].profiles = []; }, { canonical: true })],
      ['unknown manifest profile', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].profiles = ['operator']; }, { canonical: true })],
      ['reserved namespace', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.namespace = 'core'; }, { canonical: true })],
      ['invalid namespace', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.namespace = 'Example.Review'; }, { canonical: true })],
      ['invalid local facet id', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].id = 'Review'; }, { canonical: true })],
      ['invalid facet slot', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].slot = 'role'; }, { canonical: true })],
      ['facet order zero', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].order = 0; }, { canonical: true })],
      ['facet order above maximum', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].order = 65_536; }, { canonical: true })],
      ['duplicate facet order', (client) => {
        setFacetCount(client.reviewRoot, 2);
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[1].order = manifest.facets[0].order;
        }, { canonical: true });
      }],
      ['non-increasing facet order', (client) => {
        setFacetCount(client.reviewRoot, 2);
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[1].order = manifest.facets[0].order - 1;
        }, { canonical: true });
      }],
      ['duplicate local facet id', (client) => {
        setFacetCount(client.reviewRoot, 2);
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[1].id = manifest.facets[0].id;
        }, { canonical: true });
      }],
      ['duplicate facet path', (client) => {
        setFacetCount(client.reviewRoot, 2);
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[1].path = manifest.facets[0].path;
        }, { canonical: true });
      }],
      ['duplicate facet profile', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].profiles = ['root', 'root']; }, { canonical: true })],
      ['more than eight facets per package', (client) => setFacetCount(client.reviewRoot, 9)],
      ['facet traversal path', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].path = 'facets/../package.json'; }, { canonical: true })],
      ['facet outside facets directory', (client) => mutateJson(extensionManifestPath(client.reviewRoot),
        (manifest) => { manifest.facets[0].path = 'README.md'; }, { canonical: true })],
      ['facet nested node_modules path', (client) => {
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[0].path = 'facets/node_modules/review.md';
        }, { canonical: true });
        mkdirSync(join(client.reviewRoot, 'facets', 'node_modules'), { recursive: true });
        renameSync(facetPath(client.reviewRoot, 'review.md'),
          join(client.reviewRoot, 'facets', 'node_modules', 'review.md'));
      }],
      ['facet provider discovery path', (client) => {
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[0].path = 'facets/.claude/skills/SKILL.md';
        }, { canonical: true });
        const target = join(client.reviewRoot, 'facets', '.claude', 'skills', 'SKILL.md');
        mkdirSync(dirname(target), { recursive: true });
        renameSync(facetPath(client.reviewRoot, 'review.md'), target);
      }],
      ['facet mixed-case provider discovery path', (client) => {
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[0].path = 'facets/.CLAUDE/SKILLS/SKILL.md';
        }, { canonical: true });
        const target = join(client.reviewRoot, 'facets', '.CLAUDE', 'SKILLS', 'SKILL.md');
        mkdirSync(dirname(target), { recursive: true });
        renameSync(facetPath(client.reviewRoot, 'review.md'), target);
      }],
      ['facet symlink', (client) => {
        const path = facetPath(client.reviewRoot, 'review.md');
        unlinkSync(path);
        symlinkSync(extensionManifestPath(client.reviewRoot), path);
      }],
      ['facet CR encoding', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        reviewContent.replaceAll('\n', '\r\n'))],
      ['facet invalid UTF-8', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        Buffer.from([0xff, 0x0a]))],
      ['facet terminal control', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        '# Unsafe\n\n\u001b[31mterminal control\u001b[0m\n')],
      ['facet bidi control', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        '# Unsafe\n\nBidi \u200fmarker.\n')],
      ['facet template syntax', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        '# Unsafe\n\nUse {{CLIENT_SECRET}}.\n')],
      ['facet reserved prompt marker', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        'META-FRAMEWORK-AGENT-PROMPT 1\n')],
      ['facet over 4096 bytes', (client) => writeFileSync(facetPath(client.reviewRoot, 'review.md'),
        `${'x'.repeat(4_096)}\n`)],
      ['duplicate namespace', (client) => mutateJson(extensionManifestPath(client.opsRoot),
        (manifest) => { manifest.namespace = reviewNamespace; }, { canonical: true })],
      ['overlapping slot conflict', (client) => mutateJson(extensionManifestPath(client.opsRoot),
        (manifest) => { manifest.facets[0].slot = 'extension.review'; }, { canonical: true })],
      ['extension body budget', (client) => {
        const path = extensionManifestPath(client.reviewRoot);
        const manifest = readJson(path);
        manifest.facets.push({
          id: 'second', kind: 'skill', order: 20, path: 'facets/second.md', profiles: ['root'],
          slot: 'extension.second',
        });
        manifest.facets[0].profiles = ['root'];
        writeCanonicalJson(path, manifest);
        writeFileSync(facetPath(client.reviewRoot, 'review.md'), `${'a'.repeat(4_095)}\n`);
        writeFileSync(facetPath(client.reviewRoot, 'second.md'), `${'b'.repeat(4_095)}\n`);
      }],
      ['more than sixteen aggregate facets', (client) => {
        setFacetCount(client.reviewRoot, 8);
        setFacetCount(client.opsRoot, 8);
        setAllowlist(client, [reviewName, opsName, lifecycleName]);
        mutateJson(join(client.lifecycleRoot, 'package.json'), (manifest) => { delete manifest.scripts; });
        mutateJson(client.lockPath, (lock) => {
          delete lock.packages[`node_modules/${lifecycleName}`].hasInstallScript;
        });
      }],
      ['inventory byte budget', (client) => writeFileSync(join(client.reviewRoot, 'README.md'),
        `${'r'.repeat(131_072)}\n`)],
      ['more than sixty-four inventory entries', (client) => {
        setAllowlist(client, [reviewName]);
        const oldPath = facetPath(client.reviewRoot, 'review.md');
        const parts = Array.from({ length: 61 }, () => 'a');
        const relativePath = `facets/${parts.join('/')}/review.md`;
        const target = join(client.reviewRoot, ...relativePath.split('/'));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(oldPath));
        unlinkSync(oldPath);
        mutateJson(extensionManifestPath(client.reviewRoot), (manifest) => {
          manifest.facets[0].path = relativePath;
        }, { canonical: true });
      }],
    ];

    for (let index = 0; index < cases.length; index += 1) {
      const [label, mutation] = cases[index];
      const client = cloneClient(`hostile-${index}`);
      const sentinel = join(client.root, 'extension-script-sentinel');
      mutation(client);
      const result = invoke(client, ['agent-prompt', '--profile', 'root'], {
        META_EXTENSION_SENTINEL: sentinel,
      });
      assertFailure(result, label);
      assert.equal(existsSync(sentinel), false, `${label}: extension code executed`);
      rmSync(client.root, { recursive: true, force: true });
    }
  });
