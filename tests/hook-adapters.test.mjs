import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  CLIENT_HOOK_COMMAND,
  CODEX_INTEGRATION_FILES,
  CODEX_INTEGRATION_PATHS,
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

function eventFor(profile) {
  return profile === 'root'
    ? { hook_event_name: 'SessionStart', source: 'startup', cwd: '/untrusted/root' }
    : { hook_event_name: 'SubagentStart', agent_type: `meta_${profile}`, cwd: '/untrusted/child' };
}

function assertFailureEnvelope(result, profile) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 1_024);
  assert.equal(result.stdout, `${JSON.stringify(JSON.parse(result.stdout))}\n`);
  const failure = JSON.parse(result.stdout);
  assert.equal(failure.continue, false);
  assert.match(failure.stopReason, profile === 'root' ? /AGENTS\.md fallback/u : /without using tools/u);
  assert.equal(failure.systemMessage, 'The repository-pinned Meta Framework prompt was not loaded.');
}

test('hook version exposes the closed Codex compatibility contract', () => {
  const result = run(['hook', '--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    package: { name: '@tvald/meta-framework', version: '1.0.0' },
    hookAdapter: {
      version: '1.0.0',
      envelopeVersions: [1],
      hookEventSchemaVersions: [1],
      integrationConfigVersions: [1],
      harnesses: ['codex'],
      profiles,
      testedCodexVersions: ['0.147.0'],
    },
  });
});

test('each fixed hook profile emits exactly the current complete compiled Codex prompt', () => {
  for (const profile of profiles) {
    const event = JSON.stringify(eventFor(profile));
    const hook = run(['hook', '--harness', 'codex', '--profile', profile], event);
    const prompt = run(['agent-prompt', '--profile', profile, '--harness', 'codex']);
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(hook.stderr, '');
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.equal(hook.stdout, prompt.stdout, profile);
    const [marker, manifestLine] = hook.stdout.split('\n', 2);
    assert.equal(marker, 'META-FRAMEWORK-AGENT-PROMPT 1');
    const manifest = JSON.parse(manifestLine);
    assert.equal(manifest.harness, 'codex');
    assert.equal(manifest.profile, profile);
    assert.doesNotMatch(hook.stdout, /\/untrusted\/(?:root|child)/u);
  }
  const maximumCore = run(['hook', '--harness', 'codex', '--profile', 'root'],
    JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }));
  assert.ok(Buffer.byteLength(maximumCore.stdout, 'utf8') > 30_000,
    'large complete root prompt fixture did not exercise the context threshold boundary');
  assert.match(maximumCore.stdout, /META-FRAMEWORK-FACET harness\.delegation/u);
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

test('source and client Codex adapters bind fixed profiles through immutable entrypoints', () => {
  assert.deepEqual(Object.keys(CODEX_INTEGRATION_FILES), CODEX_INTEGRATION_PATHS);
  assert.deepEqual(Object.keys(SOURCE_CODEX_INTEGRATION_FILES), CODEX_INTEGRATION_PATHS);
  const hooks = JSON.parse(readFileSync(join(sourceRoot, '.codex', 'hooks.json'), 'utf8'));
  const handler = hooks.hooks.SessionStart[0].hooks[0];
  assert.equal(hooks.description, 'meta-framework-codex-integration:v1');
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.equal(handler.command, `${SOURCE_HOOK_COMMAND} root`);
  assert.equal(handler.additionalContextLimit, 0);
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
    assert.equal(entry.hooks[0].command, `${SOURCE_HOOK_COMMAND} ${profile}`);
    assert.equal(entry.hooks[0].additionalContextLimit, 0);
  }

  for (const [profile, command] of [
    ['root', handler.command],
    ...hooks.hooks.SubagentStart.map((entry) =>
      [matcherProfiles.get(entry.matcher), entry.hooks[0].command]),
  ]) {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: join(sourceRoot, 'readme'),
      encoding: 'utf8',
      input: JSON.stringify(eventFor(profile)),
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `${profile}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout.split('\n', 2)[1]).profile, profile);
  }

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
      assert.ok(clientCommands.every((command) => command.startsWith(`${CLIENT_HOOK_COMMAND} `)));
      continue;
    }
    assert.equal(actual, client, relative);
    const profile = /profile=([a-z]+)\n/u.exec(actual)?.[1];
    assert.ok(profiles.includes(profile) && profile !== 'root', relative);
    assert.match(actual, new RegExp(`name = "meta_${profile === 'qa' ? 'qa' : profile}"`, 'u'));
    assert.ok(actual.includes(`\`"profile":"${profile}"\``), relative);
    assert.match(actual, /delegate, spawn another agent/u);
    assert.match(actual, /\[agents\]\nenabled = false\n$/u);
    assert.doesNotMatch(actual, /\[\[hooks\.|command =|additionalContextLimit/u);
    assert.doesNotMatch(actual, /META-FRAMEWORK-FACET/u);
    assert.ok(Buffer.byteLength(actual, 'utf8') < 2_048);
  }
});
