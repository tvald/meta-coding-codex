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
const PUBLIC_FAILURE_CODES = new Set([
  'GENERATION_CORRUPT',
  'GENERATION_UNAVAILABLE',
  'HOOK_EVENT_MISMATCH',
  'HOOK_INPUT_INVALID',
  'OUTPUT_LIMIT',
  'PROMPT_RESERVE',
  'PROMPT_RUNTIME_UNAVAILABLE',
  'PROMPT_UNAVAILABLE',
  'SESSION_PIN_INVALID',
]);

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

function safeFailureCode(value) {
  return typeof value === 'string' && PUBLIC_FAILURE_CODES.has(value) ? value : 'PROMPT_UNAVAILABLE';
}

export function validateCodexFailureContract(profile, output, reason = 'PROMPT_UNAVAILABLE') {
  const root = profile === 'root';
  if (!root && !Object.hasOwn(PROFILE_AGENT_TYPES, profile)) {
    fail('HOOK_FAILURE_CONTRACT', 'hook failure profile is invalid');
  }
  const code = safeFailureCode(reason);
  if (!Buffer.isBuffer(output) && typeof output !== 'string') {
    fail('HOOK_FAILURE_CONTRACT', 'hook failure output is invalid');
  }
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : output;
  let envelope;
  try { envelope = JSON.parse(text); } catch { fail('HOOK_FAILURE_CONTRACT', 'hook failure output is invalid'); }
  const expected = root ? {
    continue: true,
    systemMessage: `The repository-pinned Meta Framework prompt was not loaded (${code}).`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        'META-FRAMEWORK-DEGRADED 1',
        `reason=${code}`,
        'Use the exact local AGENTS.md fallback.',
        'Do not select or mutate tasks, implement, delegate, activate, roll back, clean prompt state, or perform external effects until Root reconciles prompt health.',
      ].join('\n'),
    },
  } : {
    continue: false,
    stopReason: `Meta Framework ${profile} prompt injection failed. Stop without using tools and report the missing delegated profile.`,
    systemMessage: `The repository-pinned Meta Framework prompt was not loaded (${code}).`,
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: [
        'META-FRAMEWORK-DELEGATED-PROMPT-FAILURE 1',
        `reason=${code}`,
        `The exact ${profile} profile was not loaded.`,
        'Stop before tools, make no changes, and report the prompt-loading failure to the Root Orchestrator.',
      ].join('\n'),
    },
  };
  if (text !== `${JSON.stringify(expected)}\n` || JSON.stringify(envelope) !== JSON.stringify(expected) ||
      text.includes('META-FRAMEWORK-AGENT-PROMPT 1')) {
    fail('HOOK_FAILURE_CONTRACT', 'hook failure authority contract is invalid');
  }
  return true;
}

export function codexHookFailure(profile, reason = 'PROMPT_UNAVAILABLE') {
  const root = profile === 'root';
  const code = safeFailureCode(reason);
  const envelope = root ? {
    continue: true,
    systemMessage: `The repository-pinned Meta Framework prompt was not loaded (${code}).`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        'META-FRAMEWORK-DEGRADED 1',
        `reason=${code}`,
        'Use the exact local AGENTS.md fallback.',
        'Do not select or mutate tasks, implement, delegate, activate, roll back, clean prompt state, or perform external effects until Root reconciles prompt health.',
      ].join('\n'),
    },
  } : {
    continue: false,
    stopReason: `Meta Framework ${profile} prompt injection failed. Stop without using tools and report the missing delegated profile.`,
    systemMessage: `The repository-pinned Meta Framework prompt was not loaded (${code}).`,
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: [
        'META-FRAMEWORK-DELEGATED-PROMPT-FAILURE 1',
        `reason=${code}`,
        `The exact ${profile} profile was not loaded.`,
        'Stop before tools, make no changes, and report the prompt-loading failure to the Root Orchestrator.',
      ].join('\n'),
    },
  };
  const output = `${JSON.stringify(envelope)}\n`;
  if (Buffer.byteLength(output, 'utf8') > HOOK_ADAPTER_LIMITS.failureBytes) {
    throw new Error('hook failure envelope exceeds its fixed bound');
  }
  return output;
}
