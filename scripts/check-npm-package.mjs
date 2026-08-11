#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TASK_COMPATIBILITY } from '../lib/task-compatibility.mjs';
import { PROVIDER_PROBE_COMPATIBILITY } from '../lib/provider-contract.mjs';
import { PROMPT_COMPILER_COMPATIBILITY } from '../lib/prompt-contract.mjs';

const sourceRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(join(sourceRoot, 'package-files.json'), 'utf8'));
export const forbiddenLifecycleScripts = Object.freeze([
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
  'prepublishOnly',
  'prepack',
  'postpack',
  'dependencies',
  'preinstall',
  'install',
  'postinstall',
  'publish',
  'postpublish',
  'preversion',
  'version',
  'postversion',
]);
const requiredFileGlobs = [
  '.agents/skills/',
  '.claude/agents/',
  '.claude/skills/',
  '.codex/agents/',
  'bin/',
  'lib/',
  'package-files.json',
  'prompts/',
  'readme/meta/',
];
const expectedTarballName = 'tvald-meta-framework-1.0.0.tgz';
const spawnBounds = {
  encoding: 'utf8',
  maxBuffer: 2 * 1024 * 1024,
  timeout: 60_000,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCanonicalInventory(files) {
  assert(inventory.schemaVersion === 1, 'package inventory schemaVersion must be 1');
  assert(Array.isArray(files) && files.length > 0, 'package inventory must be a non-empty array');
  assert(files.every((path) => typeof path === 'string' && path.length > 0), 'package inventory paths must be non-empty strings');
  assert(files.every((path) => !path.startsWith('/') && !path.split('/').includes('..')), 'package inventory paths must stay relative');
  const sorted = [...files].sort();
  assert(JSON.stringify(files) === JSON.stringify(sorted), 'package inventory must be sorted');
  assert(new Set(files).size === files.length, 'package inventory must not contain duplicates');
}

export function validateManifest(candidate = manifest) {
  assert(candidate.name === '@tvald/meta-framework', 'unexpected package name');
  assert(candidate.version === '1.0.0', 'unexpected package version');
  assert(candidate.private !== true, 'package must not be private');
  assert(candidate.type === 'module', 'package must use ESM');
  const taskCompatibility = candidate.metaFramework?.taskCli;
  const compatibilityKeys = taskCompatibility !== null && typeof taskCompatibility === 'object' &&
    !Array.isArray(taskCompatibility) ? Object.keys(taskCompatibility).sort() : [];
  const expectedCompatibilityKeys = Object.keys(TASK_COMPATIBILITY).sort();
  assert(
    compatibilityKeys.length === expectedCompatibilityKeys.length &&
      compatibilityKeys.every((key, index) => key === expectedCompatibilityKeys[index]) &&
      taskCompatibility.version === TASK_COMPATIBILITY.version &&
      JSON.stringify(taskCompatibility.envelopeVersions) === JSON.stringify(TASK_COMPATIBILITY.envelopeVersions) &&
      JSON.stringify(taskCompatibility.readableStoreSchemaVersions) ===
        JSON.stringify(TASK_COMPATIBILITY.readableStoreSchemaVersions) &&
      JSON.stringify(taskCompatibility.writableStoreSchemaVersions) ===
        JSON.stringify(TASK_COMPATIBILITY.writableStoreSchemaVersions),
    'task CLI compatibility metadata differs from the runtime contract',
  );
  const providerCompatibility = candidate.metaFramework?.providerProbe;
  const providerCompatibilityKeys = providerCompatibility !== null &&
    typeof providerCompatibility === 'object' && !Array.isArray(providerCompatibility) ?
    Object.keys(providerCompatibility).sort() : [];
  const expectedProviderCompatibilityKeys = Object.keys(PROVIDER_PROBE_COMPATIBILITY).sort();
  assert(
    providerCompatibilityKeys.length === expectedProviderCompatibilityKeys.length &&
      providerCompatibilityKeys.every((key, index) => key === expectedProviderCompatibilityKeys[index]) &&
      providerCompatibility.version === PROVIDER_PROBE_COMPATIBILITY.version &&
      JSON.stringify(providerCompatibility.envelopeVersions) ===
        JSON.stringify(PROVIDER_PROBE_COMPATIBILITY.envelopeVersions) &&
      JSON.stringify(providerCompatibility.harnesses) ===
        JSON.stringify(PROVIDER_PROBE_COMPATIBILITY.harnesses) &&
      JSON.stringify(providerCompatibility.capabilities) ===
        JSON.stringify(PROVIDER_PROBE_COMPATIBILITY.capabilities),
    'provider probe compatibility metadata differs from the runtime contract',
  );
  const promptCompatibility = candidate.metaFramework?.promptCompiler;
  const promptCompatibilityKeys = promptCompatibility !== null &&
    typeof promptCompatibility === 'object' && !Array.isArray(promptCompatibility) ?
    Object.keys(promptCompatibility).sort() : [];
  const expectedPromptCompatibilityKeys = Object.keys(PROMPT_COMPILER_COMPATIBILITY).sort();
  assert(
    promptCompatibilityKeys.length === expectedPromptCompatibilityKeys.length &&
      promptCompatibilityKeys.every((key, index) => key === expectedPromptCompatibilityKeys[index]) &&
      promptCompatibility.version === PROMPT_COMPILER_COMPATIBILITY.version &&
      JSON.stringify(promptCompatibility.envelopeVersions) ===
        JSON.stringify(PROMPT_COMPILER_COMPATIBILITY.envelopeVersions) &&
      JSON.stringify(promptCompatibility.promptFormatVersions) ===
        JSON.stringify(PROMPT_COMPILER_COMPATIBILITY.promptFormatVersions) &&
      JSON.stringify(promptCompatibility.registrySchemaVersions) ===
        JSON.stringify(PROMPT_COMPILER_COMPATIBILITY.registrySchemaVersions) &&
      JSON.stringify(promptCompatibility.profiles) ===
        JSON.stringify(PROMPT_COMPILER_COMPATIBILITY.profiles) &&
      JSON.stringify(promptCompatibility.harnesses) ===
        JSON.stringify(PROMPT_COMPILER_COMPATIBILITY.harnesses),
    'prompt compiler compatibility metadata differs from the runtime contract',
  );
  assert(candidate.bin?.['meta-framework'] === 'bin/meta-framework.mjs', 'unexpected package binary');
  assert(candidate.scripts?.meta === 'node ./bin/meta-framework.mjs', 'unexpected source meta command');
  assert(candidate.engines?.node === '>=22', 'Node 22+ must be declared');
  assert(
    !candidate.dependencies
      && !candidate.optionalDependencies
      && !candidate.peerDependencies
      && !candidate.bundledDependencies
      && !candidate.bundleDependencies,
    'framework package must have no runtime, optional, peer, or bundled dependencies',
  );
  assert(candidate.gypfile !== true, 'implicit node-gyp installation is forbidden');
  assert(JSON.stringify(candidate.files) === JSON.stringify(requiredFileGlobs), 'package files allowlist changed without review');
  assert(candidate.publishConfig?.access === 'public', 'scoped package must declare public access');
  for (const name of forbiddenLifecycleScripts) {
    assert(!Object.hasOwn(candidate.scripts ?? {}, name), `forbidden lifecycle script: ${name}`);
  }
}

function runPack(destination, cache) {
  const result = spawnSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', destination],
    {
      cwd: sourceRoot,
      ...spawnBounds,
      env: {
        ...process.env,
        npm_config_cache: cache,
        npm_config_update_notifier: 'false',
      },
    },
  );
  assert(result.status === 0, 'npm pack failed');
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error('npm pack did not emit valid JSON');
  }
  assert(Array.isArray(parsed) && parsed.length === 1, 'npm pack must emit one artifact');
  const artifact = parsed[0];
  assert(artifact.name === manifest.name && artifact.version === manifest.version, 'npm pack identity differs from package manifest');
  assert(artifact.filename === expectedTarballName, 'npm pack filename is invalid');
  assert(Array.isArray(artifact.files), 'npm pack file inventory is missing');
  const tarballPath = resolve(destination, artifact.filename);
  assert(dirname(tarballPath) === resolve(destination), 'npm pack artifact escaped its destination');
  assert(lstatSync(tarballPath).isFile(), 'npm pack artifact must be a regular file');
  return {
    artifact,
    tarballPath,
  };
}

function runDryRun(cache) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: sourceRoot,
    ...spawnBounds,
    env: {
      ...process.env,
      npm_config_cache: cache,
      npm_config_update_notifier: 'false',
    },
  });
  assert(result.status === 0, 'npm pack --dry-run failed');
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error('npm pack --dry-run did not emit valid JSON');
  }
  assert(Array.isArray(parsed) && parsed.length === 1, 'npm pack --dry-run must describe one artifact');
  assert(Array.isArray(parsed[0].files), 'npm pack --dry-run file inventory is missing');
  return parsed[0];
}

function digest(path, algorithm, encoding) {
  return createHash(algorithm).update(readFileSync(path)).digest(encoding);
}

function main() {
  validateManifest();
  assertCanonicalInventory(inventory.files);
  const workRoot = mkdtempSync(join(tmpdir(), 'meta-framework-pack-'));
  try {
    const firstDirectory = join(workRoot, 'first');
    const secondDirectory = join(workRoot, 'second');
    const cache = join(workRoot, 'npm-cache');
    mkdirSync(firstDirectory);
    mkdirSync(secondDirectory);

    const dryRun = runDryRun(cache);
    const first = runPack(firstDirectory, cache);
    const second = runPack(secondDirectory, cache);
    const actualFiles = first.artifact.files.map(({ path }) => path).sort();
    assert(JSON.stringify(dryRun.files.map(({ path }) => path).sort()) === JSON.stringify(inventory.files), 'dry-run inventory differs from package-files.json');
    assert(JSON.stringify(actualFiles) === JSON.stringify(inventory.files), 'packed files differ from package-files.json');
    assert(JSON.stringify(second.artifact.files.map(({ path }) => path).sort()) === JSON.stringify(inventory.files), 'second packed inventory differs');
    assert(!actualFiles.includes('binding.gyp'), 'implicit node-gyp installation input is forbidden');
    assert(first.artifact.files.every(({ mode }) => (mode & 0o022) === 0), 'package files must not be group/world writable');

    const binEntry = first.artifact.files.find(({ path }) => path === manifest.bin['meta-framework']);
    assert(binEntry?.mode === 0o755, 'package binary must be executable');
    const firstDigest = digest(first.tarballPath, 'sha256', 'hex');
    const secondDigest = digest(second.tarballPath, 'sha256', 'hex');
    assert(firstDigest === secondDigest, 'unchanged source produced different tarball bytes');
    assert(first.artifact.integrity === `sha512-${digest(first.tarballPath, 'sha512', 'base64')}`, 'npm integrity differs from tarball bytes');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      name: manifest.name,
      version: manifest.version,
      fileCount: actualFiles.length,
      size: first.artifact.size,
      integrity: first.artifact.integrity,
      sha256: firstDigest,
    })}\n`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`package check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
