import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { codexHookFailure, validateCodexFailureContract } from '../lib/hook-adapters.mjs';
import {
  CLIENT_HOOK_COMMAND,
  CODEX_INTEGRATION_FILES,
  CODEX_INTEGRATION_PATHS,
  SOURCE_BOOTSTRAP_LOADER_DIGEST,
  SOURCE_CODEX_INTEGRATION_FILES,
  SOURCE_HOOK_COMMAND,
} from '../lib/codex-integration.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = join(sourceRoot, 'bin', 'meta-framework.mjs');
const profiles = ['implementer', 'qa', 'reviewer', 'root', 'security'];

function run(args, input = '') {
  return spawnSync(process.execPath, [binary, ...args], {
    cwd: sourceRoot,
    encoding: 'utf8',
    input,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function eventFor(profile, sessionId = `hook-test-${profile}`) {
  return profile === 'root'
    ? { hook_event_name: 'SessionStart', source: 'startup', session_id: sessionId, cwd: '/untrusted/root' }
    : { hook_event_name: 'SubagentStart', agent_type: `meta_${profile}`, session_id: sessionId, cwd: '/untrusted/child' };
}

function retireHookSession(sessionId) {
  const retired = run(['hook', '--harness', 'codex', '--profile', 'root'],
    JSON.stringify({ hook_event_name: 'SessionEnd', session_id: sessionId, reason: 'other' }));
  assert.equal(retired.status, 0, retired.stderr);
  assert.equal(retired.stdout, '');
}

function assertFailureEnvelope(result, profile) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 1_024);
  assert.equal(result.stdout, `${JSON.stringify(JSON.parse(result.stdout))}\n`);
  const failure = JSON.parse(result.stdout);
  if (profile === 'root') {
    assert.equal(failure.continue, true);
    assert.deepEqual(Object.keys(failure).sort(),
      ['continue', 'hookSpecificOutput', 'systemMessage']);
    assert.equal(failure.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(failure.hookSpecificOutput.additionalContext, /exact local AGENTS\.md fallback/u);
    assert.match(failure.hookSpecificOutput.additionalContext,
      /Do not select or mutate tasks, implement, delegate, activate, roll back, clean prompt state/u);
    assert.doesNotMatch(failure.hookSpecificOutput.additionalContext, /untrusted\/root/u);
  } else {
    assert.equal(failure.continue, false);
    assert.match(failure.stopReason, /without using tools/u);
    assert.equal(failure.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.match(failure.hookSpecificOutput.additionalContext,
      /META-FRAMEWORK-DELEGATED-PROMPT-FAILURE 1/u);
    assert.match(failure.hookSpecificOutput.additionalContext,
      /Stop before tools, make no changes/u);
    assert.doesNotMatch(failure.hookSpecificOutput.additionalContext,
      /META-FRAMEWORK-AGENT-PROMPT 1/u);
  }
  assert.match(failure.systemMessage,
    /^The repository-pinned Meta Framework prompt was not loaded \([A-Z_]+\)\.$/u);
}

test('hook version exposes the closed Codex compatibility contract', () => {
  const result = run(['hook', '--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    package: { name: '@tvald/meta-framework', version: '1.0.0' },
    hookAdapter: {
      version: '1.1.0',
      envelopeVersions: [1],
      hookEventSchemaVersions: [1],
      integrationConfigVersions: [2],
      harnesses: ['codex'],
      profiles,
      testedCodexVersions: ['0.147.0'],
    },
  });
});

test('Root degraded diagnostics expose only closed public reason codes', () => {
  assert.match(JSON.parse(codexHookFailure('root', 'OUTPUT_LIMIT')).systemMessage,
    /\(OUTPUT_LIMIT\)/u);
  for (const profile of profiles) {
    assert.equal(validateCodexFailureContract(profile, codexHookFailure(profile)), true);
  }
  for (const [profile, mutate] of [
    ['root', (failure) => { failure.hookSpecificOutput.additionalContext = 'Use AGENTS.md.'; }],
    ['reviewer', (failure) => { failure.stopReason = 'Continue carefully.'; }],
    ['security', (failure) => { failure.hookSpecificOutput.additionalContext = 'The profile is unavailable.'; }],
  ]) {
    const failure = JSON.parse(codexHookFailure(profile));
    mutate(failure);
    assert.throws(() => validateCodexFailureContract(profile, `${JSON.stringify(failure)}\n`),
      (error) => error.code === 'HOOK_FAILURE_CONTRACT');
  }
  for (const reason of ['INTERNAL_ERROR', 'UPPERCASE_BUT_UNREVIEWED', '/tmp/private']) {
    const failure = JSON.parse(codexHookFailure('root', reason));
    assert.match(failure.systemMessage, /\(PROMPT_UNAVAILABLE\)/u);
    assert.doesNotMatch(JSON.stringify(failure), new RegExp(reason.replaceAll('/', '\\/'), 'u'));
  }
});

test('the package hook serves fixed profiles from one pinned generation', () => {
  for (const profile of profiles) {
    const sessionId = `package-hook-${profile}`;
    if (profile !== 'root') {
      const parent = run(['hook', '--harness', 'codex', '--profile', 'root'],
        JSON.stringify(eventFor('root', sessionId)));
      assert.equal(parent.status, 0, parent.stderr);
      assert.match(parent.stdout, /^META-FRAMEWORK-AGENT-PROMPT 1\n/u);
    }
    const event = JSON.stringify(eventFor(profile, sessionId));
    const hook = run(['hook', '--harness', 'codex', '--profile', profile], event);
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(hook.stderr, '');
    const [marker, manifestLine] = hook.stdout.split('\n', 2);
    assert.equal(marker, 'META-FRAMEWORK-AGENT-PROMPT 1');
    const manifest = JSON.parse(manifestLine);
    assert.equal(manifest.harness, 'codex');
    assert.equal(manifest.profile, profile);
    assert.doesNotMatch(hook.stdout, /\/untrusted\/(?:root|child)/u);
    retireHookSession(sessionId);
  }
  const maximumCore = run(['hook', '--harness', 'codex', '--profile', 'root'],
    JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', session_id: 'maximum-core' }));
  assert.ok(Buffer.byteLength(maximumCore.stdout, 'utf8') > 30_000,
    'large complete root prompt fixture did not exercise the context threshold boundary');
  assert.match(maximumCore.stdout, /META-FRAMEWORK-FACET harness\.delegation/u);
  retireHookSession('maximum-core');
});

test('hook event parsing and lifecycle/profile binding fail closed with bounded output', () => {
  for (const [profile, input] of [
    ['root', ''],
    ['root', '{'],
    ['root', '{"hook_event_name":"SessionStart","hook_event_name":"SubagentStart","source":"startup"}'],
    ['root', JSON.stringify({ hook_event_name: 'SubagentStart', source: 'startup' })],
    ['root', JSON.stringify({ hook_event_name: 'SessionStart', source: 'other' })],
    ['reviewer', JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' })],
    ['reviewer', JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'default' })],
    ['reviewer', JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'meta_security' })],
    ['security', ' '.repeat(32_769)],
  ]) {
    assertFailureEnvelope(run(['hook', '--harness', 'codex', '--profile', profile], input), profile);
  }
  const invalidEnd = run(['hook', '--harness', 'codex', '--profile', 'root'],
    JSON.stringify({ hook_event_name: 'SessionEnd' }));
  assert.equal(invalidEnd.status, 0);
  assert.equal(invalidEnd.stdout, '');
  assert.equal(invalidEnd.stderr, '');
});

test('unknown, missing, duplicate, and unsupported hook selectors fail before stdout', () => {
  for (const args of [
    ['hook'],
    ['hook', '--harness', 'codex'],
    ['hook', '--profile', 'root'],
    ['hook', '--harness', 'claude', '--profile', 'root'],
    ['hook', '--harness', 'codex', '--profile', 'unknown'],
    ['hook', '--harness', 'codex', '--harness', 'codex'],
    ['hook', '--profile', 'root', '--profile', 'root'],
  ]) {
    const result = run(args, JSON.stringify(eventFor('root')));
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^meta-framework: [^\n]+\n$/u);
    assert.ok(Buffer.byteLength(result.stderr, 'utf8') <= 1_024);
  }
});

test('source and client Codex adapters bind fixed profiles through immutable buffered entrypoints', () => {
  assert.deepEqual(Object.keys(CODEX_INTEGRATION_FILES), CODEX_INTEGRATION_PATHS);
  assert.deepEqual(Object.keys(SOURCE_CODEX_INTEGRATION_FILES), CODEX_INTEGRATION_PATHS);
  const hooks = JSON.parse(readFileSync(join(sourceRoot, '.codex', 'hooks.json'), 'utf8'));
  const handler = hooks.hooks.SessionStart[0].hooks[0];
  assert.equal(hooks.description, 'meta-framework-codex-integration:v2');
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.equal(handler.command, SOURCE_HOOK_COMMAND);
  assert.equal(handler.additionalContextLimit, 0);
  assert.equal(hooks.hooks.SessionEnd[0].matcher, 'other');
  assert.equal(hooks.hooks.SessionEnd[0].hooks[0].timeout, 3);
  assert.equal(Object.hasOwn(hooks.hooks.SessionEnd[0].hooks[0], 'additionalContextLimit'), false);
  const matcherProfiles = new Map([
    ['^meta_implementer$', 'implementer'],
    ['^meta_qa$', 'qa'],
    ['^meta_reviewer$', 'reviewer'],
    ['^meta_security$', 'security'],
  ]);
  assert.deepEqual(hooks.hooks.SubagentStart.map(({ matcher }) => matcher),
    [...matcherProfiles.keys()]);
  for (const entry of hooks.hooks.SubagentStart) {
    const profile = matcherProfiles.get(entry.matcher);
    assert.ok(profile);
    assert.equal(entry.hooks.length, 1);
    assert.equal(entry.hooks[0].additionalContextLimit, 0);
  }

  const sharedSession = 'source-command-profile-test';
  for (const [profile, command] of [
    ['root', handler.command],
    ...hooks.hooks.SubagentStart.map((entry) =>
      [matcherProfiles.get(entry.matcher), entry.hooks[0].command]),
  ]) {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: join(sourceRoot, 'readme'),
      encoding: 'utf8',
      input: JSON.stringify(eventFor(profile, sharedSession)),
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `${profile}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout.split('\n', 2)[1]).profile, profile);
  }

  const retired = spawnSync('/bin/sh', ['-c', hooks.hooks.SessionEnd[0].hooks[0].command], {
    cwd: sourceRoot,
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: sharedSession, reason: 'other' }),
  });
  assert.equal(retired.status, 0);
  assert.equal(retired.stdout, '');
  assert.equal(retired.stderr, '');

  for (const relative of CODEX_INTEGRATION_PATHS) {
    const actual = readFileSync(join(sourceRoot, ...relative.split('/')), 'utf8');
    const client = CODEX_INTEGRATION_FILES[relative];
    assert.equal(actual, SOURCE_CODEX_INTEGRATION_FILES[relative], relative);
    assert.doesNotMatch(actual, /npm run|npx/u, relative);
    assert.doesNotMatch(client, /npm run|npx/u, relative);
    if (relative === '.codex/hooks.json') {
      assert.notEqual(actual, client, relative);
      const parsedClientHooks = JSON.parse(client).hooks;
      const clientCommands = [
        parsedClientHooks.SessionStart[0].hooks[0].command,
        ...parsedClientHooks.SubagentStart.map((entry) => entry.hooks[0].command),
      ];
      assert.equal(clientCommands.length, 5);
      assert.equal(clientCommands[0], CLIENT_HOOK_COMMAND);
      assert.ok(clientCommands.every((command) => command.includes('spawnSync')));
      assert.ok(clientCommands.every((command) => command.includes('node_modules')));
      assert.ok(JSON.parse(client).hooks.SessionEnd);
      continue;
    }
    assert.equal(actual, client, relative);
    const profile = /profile=([a-z]+)\n/u.exec(actual)?.[1];
    assert.ok(profiles.includes(profile) && profile !== 'root', relative);
    assert.match(actual, new RegExp(`name = "meta_${profile === 'qa' ? 'qa' : profile}"`, 'u'));
    assert.ok(actual.includes(`\`"profile":"${profile}"\``), relative);
    assert.match(actual, /delegate, spawn another agent/u);
    assert.match(actual, /\[features\]\nmulti_agent = false\n$/u);
    assert.doesNotMatch(actual, /\[agents\]/u);
    assert.doesNotMatch(actual, /\[\[hooks\.|command =|additionalContextLimit/u);
    assert.doesNotMatch(actual, /META-FRAMEWORK-FACET/u);
    assert.ok(Buffer.byteLength(actual, 'utf8') < 2_048);
  }
});

test('trusted wrappers discard child partial output and provide literal stage-zero fallback', () => {
  const sourceHooks = JSON.parse(SOURCE_CODEX_INTEGRATION_FILES['.codex/hooks.json']);
  const missingRoot = mkdtempSync(join(tmpdir(), 'meta-framework-missing-loader-'));
  const linkedLoaderRoot = mkdtempSync(join(tmpdir(), 'meta-framework-linked-loader-'));
  const partialRoot = mkdtempSync(join(tmpdir(), 'meta-framework-partial-client-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: missingRoot }).status, 0);
    const missing = spawnSync('/bin/sh', ['-c', sourceHooks.hooks.SessionStart[0].hooks[0].command], {
      cwd: missingRoot,
      encoding: 'utf8',
      input: JSON.stringify(eventFor('root', 'missing-loader')),
    });
    assert.equal(missing.status, 0);
    assert.equal(missing.stderr, '');
    assert.equal(missing.stdout, codexHookFailure('root'));

    assert.equal(spawnSync('git', ['init', '-q'], { cwd: linkedLoaderRoot }).status, 0);
    const loaderDirectory = join(linkedLoaderRoot, '.git', 'meta-framework', 'prompt-runtime', 'v1', 'loaders');
    mkdirSync(loaderDirectory, { recursive: true, mode: 0o700 });
    const loader = join(loaderDirectory, `${SOURCE_BOOTSTRAP_LOADER_DIGEST.slice(7)}.mjs`);
    writeFileSync(loader, readFileSync(join(sourceRoot, 'lib', 'prompt-bootstrap-loader.mjs')));
    chmodSync(loader, 0o400);
    linkSync(loader, join(linkedLoaderRoot, 'linked-loader.mjs'));
    const linked = spawnSync('/bin/sh', ['-c', sourceHooks.hooks.SessionStart[0].hooks[0].command], {
      cwd: linkedLoaderRoot,
      encoding: 'utf8',
      input: JSON.stringify(eventFor('root', 'linked-loader')),
    });
    assert.equal(linked.status, 0);
    assert.equal(linked.stderr, '');
    assert.equal(linked.stdout, codexHookFailure('root'));

    assert.equal(spawnSync('git', ['init', '-q'], { cwd: partialRoot }).status, 0);
    const fakeBinary = join(partialRoot, 'node_modules', 'meta-framework', 'bin', 'meta-framework.mjs');
    mkdirSync(dirname(fakeBinary), { recursive: true });
    writeFileSync(fakeBinary, 'process.stdout.write("PARTIAL PROMPT"); process.exitCode = 1;\n');
    chmodSync(fakeBinary, 0o700);
    const clientHooks = JSON.parse(CODEX_INTEGRATION_FILES['.codex/hooks.json']);
    const partial = spawnSync('/bin/sh', ['-c', clientHooks.hooks.SessionStart[0].hooks[0].command], {
      cwd: partialRoot,
      encoding: 'utf8',
      input: JSON.stringify(eventFor('root', 'partial-client')),
    });
    assert.equal(partial.status, 0);
    assert.equal(partial.stderr, '');
    assert.equal(partial.stdout, codexHookFailure('root'));
    assert.doesNotMatch(partial.stdout, /PARTIAL PROMPT/u);
    const invalidEnd = spawnSync('/bin/sh', ['-c', clientHooks.hooks.SessionEnd[0].hooks[0].command], {
      cwd: partialRoot,
      encoding: 'utf8',
      input: JSON.stringify({ hook_event_name: 'SessionEnd' }),
    });
    assert.equal(invalidEnd.status, 0);
    assert.equal(invalidEnd.stdout, '');
    assert.equal(invalidEnd.stderr, '');
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
    rmSync(linkedLoaderRoot, { recursive: true, force: true });
    rmSync(partialRoot, { recursive: true, force: true });
  }
});
