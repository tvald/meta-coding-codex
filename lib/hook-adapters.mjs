import {
  HOOK_ADAPTER_COMPATIBILITY,
  HOOK_ADAPTER_LIMITS,
} from './hook-contract.mjs';
import { compileAgentPrompt } from './prompt-compiler.mjs';
import { parseBoundedJsonBytes, unwrapPackageRuntime } from './runtime-roots.mjs';

export { HOOK_ADAPTER_COMPATIBILITY, HOOK_ADAPTER_LIMITS };

const ROOT_SOURCES = Object.freeze(['startup', 'resume', 'clear', 'compact']);
const PROFILE_AGENT_TYPES = Object.freeze({
  implementer: 'meta_implementer',
  qa: 'meta_qa',
  reviewer: 'meta_reviewer',
  security: 'meta_security',
});

export class HookAdapterError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'HookAdapterError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, message, exitCode = 1) {
  throw new HookAdapterError(code, message, exitCode);
}

function boundedHookEvent(inputBytes) {
  if (!Buffer.isBuffer(inputBytes) || inputBytes.length < 2 ||
      inputBytes.length > HOOK_ADAPTER_LIMITS.inputBytes) {
    fail('HOOK_INPUT_INVALID', 'hook input is not one bounded event');
  }
  try {
    const event = parseBoundedJsonBytes(inputBytes, {
      label: 'hook input',
      code: 'HOOK_INPUT_INVALID',
      maxBytes: HOOK_ADAPTER_LIMITS.inputBytes,
    });
    if (event === null || typeof event !== 'object' || Array.isArray(event)) {
      fail('HOOK_INPUT_INVALID', 'hook input must be one event object');
    }
    return event;
  } catch (error) {
    if (error instanceof HookAdapterError) throw error;
    fail('HOOK_INPUT_INVALID', 'hook input is not valid bounded JSON');
  }
}

function validateEvent(profile, event) {
  if (profile === 'root') {
    if (event.hook_event_name !== 'SessionStart' ||
        typeof event.source !== 'string' || !ROOT_SOURCES.includes(event.source)) {
      fail('HOOK_EVENT_MISMATCH', 'root prompt requires an allowed SessionStart event');
    }
    return;
  }
  if (event.hook_event_name !== 'SubagentStart' ||
      event.agent_type !== PROFILE_AGENT_TYPES[profile]) {
    fail('HOOK_EVENT_MISMATCH', 'delegated prompt requires its exact named SubagentStart event');
  }
}

export function hookVersionEnvelope(packageRuntime) {
  const runtime = unwrapPackageRuntime(packageRuntime);
  const compatibility = runtime.hookAdapterCompatibility;
  return `${JSON.stringify({
    schemaVersion: compatibility.envelopeVersions[0],
    package: runtime.identity,
    hookAdapter: {
      version: compatibility.version,
      envelopeVersions: [...compatibility.envelopeVersions],
      hookEventSchemaVersions: [...compatibility.hookEventSchemaVersions],
      integrationConfigVersions: [...compatibility.integrationConfigVersions],
      harnesses: [...compatibility.harnesses],
      profiles: [...compatibility.profiles],
      testedCodexVersions: [...compatibility.testedCodexVersions],
    },
  })}\n`;
}

export function compileCodexHookPrompt(packageRuntime, profile, inputBytes, resolvedExtensions = null) {
  const runtime = unwrapPackageRuntime(packageRuntime);
  if (!runtime.hookAdapterCompatibility.profiles.includes(profile)) {
    fail('HOOK_PROFILE_UNSUPPORTED', 'hook profile is unsupported', 2);
  }
  validateEvent(profile, boundedHookEvent(inputBytes));
  return compileAgentPrompt(runtime, profile, 'codex', resolvedExtensions);
}

export function codexHookFailure(profile) {
  const root = profile === 'root';
  const output = `${JSON.stringify({
    continue: false,
    stopReason: root
      ? 'Meta Framework root prompt injection failed. Stop and use the exact local AGENTS.md fallback.'
      : `Meta Framework ${profile} prompt injection failed. Stop without using tools and report the missing delegated profile.`,
    systemMessage: 'The repository-pinned Meta Framework prompt was not loaded.',
  })}\n`;
  if (Buffer.byteLength(output, 'utf8') > HOOK_ADAPTER_LIMITS.failureBytes) {
    throw new Error('hook failure envelope exceeds its fixed bound');
  }
  return output;
}
