import { TextDecoder } from 'node:util';
import path from 'node:path';

import { authorizeImplementationOperation } from './implementation-activation.mjs';
import {
  ASSIGNMENT_ROLES,
  IMPLEMENTATION_PROTOCOL_LIMITS,
  canonicalDigest,
  sha256Digest,
  validateBinding,
  validateBoundedArray,
  validateBoundedString,
  validateControllerId,
  validateDigest,
  validateRepositoryPath,
  validateTimestamp,
} from './implementation-protocol.mjs';

export const IMPLEMENTATION_PROVIDER_VERSION = 1;
export const CODEX_EXEC_ADAPTER = 'codex_exec_v1';
export const CODEX_EXECUTABLE_VERSION = '0.147.0';

export const IMPLEMENTATION_PROVIDER_COMPATIBILITY = Object.freeze({
  version: '1.0.0',
  providerContractVersions: Object.freeze([IMPLEMENTATION_PROVIDER_VERSION]),
  adapters: Object.freeze([CODEX_EXEC_ADAPTER]),
  harnesses: Object.freeze(['codex']),
  executableVersions: Object.freeze([CODEX_EXECUTABLE_VERSION]),
});

export const IMPLEMENTATION_PROVIDER_LIMITS = Object.freeze({
  jsonlBytes: 8 * 1024 * 1024,
  jsonlLineBytes: 256 * 1024,
  jsonlMessages: 4_096,
  stderrBytes: 8 * 1024 * 1024,
  modelResultBytes: IMPLEMENTATION_PROTOCOL_LIMITS.modelResultBytes,
  promptBytes: IMPLEMENTATION_PROTOCOL_LIMITS.orientationBytes,
  environmentValueBytes: 8_192,
});

export const CODEX_ENVIRONMENT_ALLOWLIST = Object.freeze([
  'CODEX_HOME',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NO_COLOR',
  'PATH',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TERM',
  'TMPDIR',
  'TZ',
]);

export const WORKER_RESULT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: Object.freeze([
    'schemaVersion', 'disposition', 'summary', 'changedPathsClaim', 'checks',
    'findings', 'risks', 'knowledgeProposals', 'followUp',
  ]),
  properties: Object.freeze({
    schemaVersion: Object.freeze({ const: 1 }),
    disposition: Object.freeze({ enum: Object.freeze(['completed', 'partial', 'blocked', 'failed']) }),
    summary: Object.freeze({ type: 'string', minLength: 1, maxLength: 4_096 }),
    changedPathsClaim: Object.freeze({
      type: 'array', maxItems: 128, uniqueItems: true,
      items: Object.freeze({ type: 'string', minLength: 1, maxLength: 4_096 }),
    }),
    checks: Object.freeze({
      type: 'array', maxItems: 128,
      items: Object.freeze({
        type: 'object', additionalProperties: false,
        required: Object.freeze(['id', 'outcome', 'evidenceDigest']),
        properties: Object.freeze({
          id: Object.freeze({ type: 'string', minLength: 1, maxLength: 64 }),
          outcome: Object.freeze({ enum: Object.freeze(['pass', 'fail', 'not_run', 'not_applicable']) }),
          evidenceDigest: Object.freeze({
            anyOf: Object.freeze([
              Object.freeze({ type: 'null' }),
              Object.freeze({ type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }),
            ]),
          }),
        }),
      }),
    }),
    findings: Object.freeze({
      type: 'array', maxItems: 128,
      items: Object.freeze({
        type: 'object', additionalProperties: false,
        required: Object.freeze(['severity', 'summary', 'evidenceDigest']),
        properties: Object.freeze({
          severity: Object.freeze({ type: 'string', minLength: 1, maxLength: 64 }),
          summary: Object.freeze({ type: 'string', minLength: 1, maxLength: 4_096 }),
          evidenceDigest: Object.freeze({
            anyOf: Object.freeze([
              Object.freeze({ type: 'null' }),
              Object.freeze({ type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }),
            ]),
          }),
        }),
      }),
    }),
    risks: Object.freeze({ type: 'array', maxItems: 128, items: Object.freeze({ type: 'string' }) }),
    knowledgeProposals: Object.freeze({ type: 'array', maxItems: 128, items: Object.freeze({ type: 'string' }) }),
    followUp: Object.freeze({ type: 'array', maxItems: 128, items: Object.freeze({ type: 'string' }) }),
  }),
});

const LAUNCH_REQUEST_KEYS = Object.freeze([
  'schemaVersion', 'requestId', 'jobId', 'binding', 'assignmentId', 'attemptId', 'role',
  'providerAdapter', 'executableVersion', 'cwdIdentity', 'baseTree', 'profileDigest',
  'promptDigest', 'outputSchemaDigest', 'sandbox', 'approvalPolicy', 'network',
  'nestedAgents', 'environmentDigest', 'deadlineAt',
]);
const WORKER_RESULT_KEYS = Object.freeze([
  'schemaVersion', 'disposition', 'summary', 'changedPathsClaim', 'checks', 'findings',
  'risks', 'knowledgeProposals', 'followUp',
]);
const TERMINAL_KEYS = Object.freeze([
  'requestId', 'launcherConnectionId', 'processDomainId', 'processIdentityDigest',
  'exitCode', 'signal', 'stdoutDigest', 'stderrDigest', 'modelResultDigest',
]);
const TERMINAL_STATE_KEYS = Object.freeze([
  'schemaVersion', 'requestId', 'outcome', 'terminalDigest', 'terminal', 'conflictDigest',
]);
const PROCESS_EXPECTATION_KEYS = Object.freeze([
  'processDomainId', 'launcherConnectionId', 'processIdentityDigest',
]);
const PROCESS_EVIDENCE_KEYS = Object.freeze([
  'schemaVersion', 'processDomainId', 'launcherConnectionId', 'processIdentityDigest',
  'state', 'descendantsComplete', 'members', 'observedAt',
]);
const MEMBER_KEYS = Object.freeze(['pid', 'startIdentityDigest']);
const CAPTURE_KEYS = Object.freeze([
  'stdoutChunks', 'stderrChunks', 'finalResultBytes', 'terminalObservation', 'processEvidence',
]);
const CHECK_KEYS = Object.freeze(['id', 'outcome', 'evidenceDigest']);
const FINDING_KEYS = Object.freeze(['severity', 'summary', 'evidenceDigest']);
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGKILL']);

export class ImplementationProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationProviderError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationProviderError(code, message);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('SCHEMA_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('SCHEMA_INVALID', `${label} has unknown or missing fields`);
  }
}

function safeProtocolValidation(callback, label) {
  try {
    return callback();
  } catch (error) {
    fail('SCHEMA_INVALID', `${label} is invalid: ${error.message}`);
  }
}

function enumValue(value, choices, label) {
  if (!choices.includes(value)) fail('SCHEMA_INVALID', `${label} is unsupported`);
}

function nullableDigest(value, label) {
  if (value !== null) safeProtocolValidation(() => validateDigest(value, label), label);
}

function validUnicode(value) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function absoluteNormalizedPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') ||
      Buffer.byteLength(value, 'utf8') > 4_096 || !validUnicode(value) ||
      !path.isAbsolute(value) || path.normalize(value) !== value) {
    fail('PATH_INVALID', `${label} must be one normalized absolute path`);
  }
  return value;
}

function bufferFrom(value, label) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string' && validUnicode(value)) return Buffer.from(value, 'utf8');
  fail('BYTES_INVALID', `${label} must be bytes or valid Unicode text`);
}

function decodeUtf8(bytes, label) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail('UTF8_INVALID', `${label} must not contain a byte-order mark`);
  }
  try {
    return UTF8.decode(bytes);
  } catch {
    fail('UTF8_INVALID', `${label} is not fatal UTF-8`);
  }
}

function sortedUniqueStrings(values, label, validator) {
  safeProtocolValidation(() => validateBoundedArray(values, label), label);
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    validator(values[index], `${label}[${index}]`);
    if (seen.has(values[index])) fail('SCHEMA_INVALID', `${label} contains a duplicate`);
    seen.add(values[index]);
  }
  const sorted = [...values].sort((left, right) => left.localeCompare(right, 'en'));
  if (values.some((value, index) => value !== sorted[index])) {
    fail('SCHEMA_INVALID', `${label} must be sorted`);
  }
}

export function validateLaunchRequest(value) {
  exactKeys(value, LAUNCH_REQUEST_KEYS, 'launch request');
  if (value.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION) {
    fail('VERSION_UNSUPPORTED', 'launch request schemaVersion is unsupported');
  }
  safeProtocolValidation(() => validateControllerId(value.requestId, 'launch request.requestId'));
  safeProtocolValidation(() => validateControllerId(value.jobId, 'launch request.jobId'));
  safeProtocolValidation(() => validateBinding(value.binding, 'launch request.binding'));
  safeProtocolValidation(() => validateControllerId(value.assignmentId, 'launch request.assignmentId'));
  safeProtocolValidation(() => validateControllerId(value.attemptId, 'launch request.attemptId'));
  enumValue(value.role, ASSIGNMENT_ROLES, 'launch request.role');
  if (value.providerAdapter !== CODEX_EXEC_ADAPTER) {
    fail('ADAPTER_UNSUPPORTED', 'launch request providerAdapter is unsupported');
  }
  if (value.executableVersion !== CODEX_EXECUTABLE_VERSION) {
    fail('EXECUTABLE_VERSION_UNSUPPORTED', 'launch request executableVersion is unsupported');
  }
  safeProtocolValidation(() => validateDigest(value.cwdIdentity, 'launch request.cwdIdentity'));
  if (typeof value.baseTree !== 'string' || !GIT_OID.test(value.baseTree)) {
    fail('SCHEMA_INVALID', 'launch request.baseTree is invalid');
  }
  for (const field of ['profileDigest', 'promptDigest', 'outputSchemaDigest', 'environmentDigest']) {
    safeProtocolValidation(() => validateDigest(value[field], `launch request.${field}`));
  }
  enumValue(value.sandbox, ['read-only', 'workspace-write'], 'launch request.sandbox');
  if (value.approvalPolicy !== 'never' || value.network !== false || value.nestedAgents !== false) {
    fail('PERMISSIONS_UNSAFE', 'launch request permissions are not the closed offline policy');
  }
  safeProtocolValidation(() => validateTimestamp(value.deadlineAt, 'launch request.deadlineAt'));
  return value;
}

export function validateCodexExecutableIdentity(value) {
  exactKeys(value, ['schemaVersion', 'adapter', 'requestedPath', 'executableRealpath', 'version'],
    'Codex executable identity');
  if (value.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION || value.adapter !== CODEX_EXEC_ADAPTER) {
    fail('EXECUTABLE_IDENTITY_INVALID', 'Codex executable identity is incompatible');
  }
  absoluteNormalizedPath(value.requestedPath, 'Codex requested path');
  absoluteNormalizedPath(value.executableRealpath, 'Codex executable realpath');
  if (value.requestedPath !== value.executableRealpath) {
    fail('EXECUTABLE_IDENTITY_INVALID', 'Codex executable must already name its resolved realpath');
  }
  if (value.version !== CODEX_EXECUTABLE_VERSION) {
    fail('EXECUTABLE_VERSION_UNSUPPORTED', 'Codex executable version is unsupported');
  }
  return value;
}

export function sanitizeCodexEnvironment(environment = {}) {
  if (!plainObject(environment)) fail('ENVIRONMENT_INVALID', 'provider environment must be an object');
  const sanitized = {};
  for (const name of CODEX_ENVIRONMENT_ALLOWLIST) {
    if (!Object.hasOwn(environment, name)) continue;
    const value = environment[name];
    if (typeof value !== 'string' || !validUnicode(value) || value.includes('\0') ||
        Buffer.byteLength(value, 'utf8') > IMPLEMENTATION_PROVIDER_LIMITS.environmentValueBytes) {
      fail('ENVIRONMENT_INVALID', `provider environment ${name} is invalid`);
    }
    sanitized[name] = value;
  }
  return Object.freeze(sanitized);
}

export function planCodexExecLaunch({
  request,
  executableIdentity,
  cwd,
  outputSchema,
  finalOutputPath,
  prompt,
  environment = {},
} = {}) {
  validateLaunchRequest(request);
  validateCodexExecutableIdentity(executableIdentity);
  exactKeys(cwd, ['realpath', 'identity'], 'provider cwd');
  absoluteNormalizedPath(cwd.realpath, 'provider cwd.realpath');
  safeProtocolValidation(() => validateDigest(cwd.identity, 'provider cwd.identity'));
  if (cwd.identity !== request.cwdIdentity) fail('CWD_IDENTITY_MISMATCH', 'provider cwd identity is stale');

  exactKeys(outputSchema, ['path', 'digest'], 'provider output schema');
  absoluteNormalizedPath(outputSchema.path, 'provider output schema.path');
  safeProtocolValidation(() => validateDigest(outputSchema.digest, 'provider output schema.digest'));
  if (outputSchema.digest !== request.outputSchemaDigest) {
    fail('OUTPUT_SCHEMA_MISMATCH', 'provider output schema digest is stale');
  }
  absoluteNormalizedPath(finalOutputPath, 'provider final output path');
  if (finalOutputPath === outputSchema.path) {
    fail('PATH_INVALID', 'provider schema and final output paths must differ');
  }

  const stdin = bufferFrom(prompt, 'provider prompt');
  if (stdin.length === 0 || stdin.length > IMPLEMENTATION_PROVIDER_LIMITS.promptBytes) {
    fail('PROMPT_INVALID', 'provider prompt exceeds its bound');
  }
  if (sha256Digest(stdin) !== request.promptDigest) {
    fail('PROMPT_MISMATCH', 'provider prompt digest is stale');
  }

  const env = sanitizeCodexEnvironment(environment);
  if (canonicalDigest(env) !== request.environmentDigest) {
    fail('ENVIRONMENT_MISMATCH', 'provider environment digest is stale');
  }

  const args = Object.freeze([
    'exec',
    '--strict-config',
    '--ignore-user-config',
    '--ignore-rules',
    '--cd', cwd.realpath,
    '--sandbox', request.sandbox,
    '--config', 'approval_policy="never"',
    '--config', 'sandbox_workspace_write.network_access=false',
    '--config', 'web_search="disabled"',
    '--disable', 'multi_agent',
    '--json',
    '--color', 'never',
    '--output-schema', outputSchema.path,
    '--output-last-message', finalOutputPath,
    '--ephemeral',
    '-',
  ]);

  return Object.freeze({
    schemaVersion: IMPLEMENTATION_PROVIDER_VERSION,
    request,
    executable: executableIdentity.executableRealpath,
    args,
    argvDigest: canonicalDigest(args),
    cwd: cwd.realpath,
    env,
    environmentDigest: request.environmentDigest,
    stdin,
    outputSchemaPath: outputSchema.path,
    finalOutputPath,
    process: Object.freeze({ detached: true, shell: false, windowsHide: true }),
  });
}

export function createCodexJsonlCollector({
  maxBytes = IMPLEMENTATION_PROVIDER_LIMITS.jsonlBytes,
  maxLineBytes = IMPLEMENTATION_PROVIDER_LIMITS.jsonlLineBytes,
  maxMessages = IMPLEMENTATION_PROVIDER_LIMITS.jsonlMessages,
} = {}) {
  for (const [label, value] of [['byte limit', maxBytes], ['line limit', maxLineBytes], ['message limit', maxMessages]]) {
    if (!Number.isSafeInteger(value) || value < 1) fail('LIMIT_INVALID', `JSONL ${label} is invalid`);
  }
  let chunks = [];
  let bytes = 0;
  let finished = false;
  return Object.freeze({
    push(chunk) {
      if (finished) fail('STREAM_CLOSED', 'provider JSONL stream is already closed');
      const next = bufferFrom(chunk, 'provider JSONL chunk');
      bytes += next.length;
      if (bytes > maxBytes) fail('STREAM_LIMIT', 'provider JSONL exceeds its byte bound');
      chunks.push(next);
    },
    finish() {
      if (finished) fail('STREAM_CLOSED', 'provider JSONL stream is already closed');
      finished = true;
      const input = Buffer.concat(chunks, bytes);
      chunks = [];
      const text = decodeUtf8(input, 'provider JSONL');
      const lines = text.split('\n');
      if (lines.at(-1) === '') lines.pop();
      if (lines.length > maxMessages) fail('STREAM_LIMIT', 'provider JSONL exceeds its message bound');
      const events = lines.map((line, index) => {
        if (line.length === 0 || Buffer.byteLength(line, 'utf8') > maxLineBytes) {
          fail('STREAM_LIMIT', `provider JSONL line ${index + 1} is empty or oversized`);
        }
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          fail('JSONL_INVALID', `provider JSONL line ${index + 1} is invalid JSON`);
        }
        if (!plainObject(event)) fail('JSONL_INVALID', `provider JSONL line ${index + 1} is not an object`);
        return Object.freeze(event);
      });
      return Object.freeze(events);
    },
  });
}

export function validateWorkerResult(value) {
  exactKeys(value, WORKER_RESULT_KEYS, 'worker result');
  if (value.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION) {
    fail('VERSION_UNSUPPORTED', 'worker result schemaVersion is unsupported');
  }
  enumValue(value.disposition, ['completed', 'partial', 'blocked', 'failed'], 'worker result.disposition');
  safeProtocolValidation(() => validateBoundedString(value.summary, 'worker result.summary'));
  sortedUniqueStrings(value.changedPathsClaim, 'worker result.changedPathsClaim', (item, label) =>
    safeProtocolValidation(() => validateRepositoryPath(item, label), label));

  safeProtocolValidation(() => validateBoundedArray(value.checks, 'worker result.checks'), 'worker result.checks');
  const checkIds = new Set();
  for (let index = 0; index < value.checks.length; index += 1) {
    const check = value.checks[index];
    exactKeys(check, CHECK_KEYS, `worker result.checks[${index}]`);
    safeProtocolValidation(() => validateControllerId(check.id, `worker result.checks[${index}].id`));
    if (checkIds.has(check.id)) fail('SCHEMA_INVALID', 'worker result contains a duplicate check ID');
    checkIds.add(check.id);
    enumValue(check.outcome, ['pass', 'fail', 'not_run', 'not_applicable'],
      `worker result.checks[${index}].outcome`);
    nullableDigest(check.evidenceDigest, `worker result.checks[${index}].evidenceDigest`);
  }

  safeProtocolValidation(() => validateBoundedArray(value.findings, 'worker result.findings'), 'worker result.findings');
  for (let index = 0; index < value.findings.length; index += 1) {
    const finding = value.findings[index];
    exactKeys(finding, FINDING_KEYS, `worker result.findings[${index}]`);
    safeProtocolValidation(() => validateBoundedString(finding.severity,
      `worker result.findings[${index}].severity`, { maxBytes: 64 }));
    safeProtocolValidation(() => validateBoundedString(finding.summary,
      `worker result.findings[${index}].summary`));
    nullableDigest(finding.evidenceDigest, `worker result.findings[${index}].evidenceDigest`);
  }

  for (const field of ['risks', 'knowledgeProposals', 'followUp']) {
    safeProtocolValidation(() => validateBoundedArray(value[field], `worker result.${field}`), `worker result.${field}`);
    for (let index = 0; index < value[field].length; index += 1) {
      safeProtocolValidation(() => validateBoundedString(value[field][index],
        `worker result.${field}[${index}]`));
    }
  }
  return value;
}

export function parseWorkerResult(input) {
  const bytes = bufferFrom(input, 'worker result');
  if (bytes.length === 0 || bytes.length > IMPLEMENTATION_PROVIDER_LIMITS.modelResultBytes) {
    fail('MODEL_RESULT_LIMIT', 'worker result exceeds its byte bound');
  }
  const text = decodeUtf8(bytes, 'worker result');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('MODEL_RESULT_INVALID', 'worker result is not valid JSON');
  }
  return validateWorkerResult(parsed);
}

export function initialProviderTerminalState(requestId) {
  safeProtocolValidation(() => validateControllerId(requestId, 'terminal request ID'));
  return Object.freeze({
    schemaVersion: IMPLEMENTATION_PROVIDER_VERSION,
    requestId,
    outcome: 'running',
    terminalDigest: null,
    terminal: null,
    conflictDigest: null,
  });
}

function validateTerminalObservation(value) {
  exactKeys(value, TERMINAL_KEYS, 'provider terminal observation');
  for (const field of ['requestId', 'launcherConnectionId', 'processDomainId']) {
    safeProtocolValidation(() => validateControllerId(value[field], `provider terminal observation.${field}`));
  }
  for (const field of ['processIdentityDigest', 'stdoutDigest', 'stderrDigest']) {
    safeProtocolValidation(() => validateDigest(value[field], `provider terminal observation.${field}`));
  }
  nullableDigest(value.modelResultDigest, 'provider terminal observation.modelResultDigest');
  if (!(value.exitCode === null || (Number.isSafeInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255))) {
    fail('SCHEMA_INVALID', 'provider terminal observation.exitCode is invalid');
  }
  if (!(value.signal === null || SIGNALS.includes(value.signal))) {
    fail('SCHEMA_INVALID', 'provider terminal observation.signal is invalid');
  }
  if ((value.exitCode === null) === (value.signal === null)) {
    fail('SCHEMA_INVALID', 'provider terminal observation must name exactly one exit cause');
  }
  return value;
}

export function observeProviderTerminal(state, observation, processEvidence) {
  exactKeys(state, TERMINAL_STATE_KEYS, 'provider terminal state');
  if (state.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION ||
      !['running', 'exited', 'ambiguous'].includes(state.outcome)) {
    fail('STATE_INVALID', 'provider terminal state is invalid');
  }
  validateTerminalObservation(observation);
  if (observation.requestId !== state.requestId) fail('TERMINAL_STALE', 'terminal request ID is stale');
  const digest = canonicalDigest(observation);
  if (state.outcome === 'ambiguous') return state;
  const process = classifyProcessDomain({
    processDomainId: observation.processDomainId,
    launcherConnectionId: observation.launcherConnectionId,
    processIdentityDigest: observation.processIdentityDigest,
  }, processEvidence);
  if (!process.empty) {
    return Object.freeze({ ...state, outcome: 'ambiguous', conflictDigest: digest });
  }
  if (state.outcome === 'running') {
    return Object.freeze({ ...state, outcome: 'exited', terminalDigest: digest,
      terminal: Object.freeze({ ...observation }) });
  }
  if (state.terminalDigest === digest) return state;
  return Object.freeze({ ...state, outcome: 'ambiguous', conflictDigest: digest });
}

function validateProcessExpectation(value) {
  exactKeys(value, PROCESS_EXPECTATION_KEYS, 'process-domain expectation');
  safeProtocolValidation(() => validateControllerId(value.processDomainId, 'process-domain expectation.processDomainId'));
  safeProtocolValidation(() => validateControllerId(value.launcherConnectionId,
    'process-domain expectation.launcherConnectionId'));
  safeProtocolValidation(() => validateDigest(value.processIdentityDigest,
    'process-domain expectation.processIdentityDigest'));
  return value;
}

export function classifyProcessDomain(expected, evidence) {
  validateProcessExpectation(expected);
  exactKeys(evidence, PROCESS_EVIDENCE_KEYS, 'process-domain evidence');
  if (evidence.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION) {
    return Object.freeze({ state: 'ambiguous', empty: false, code: 'EVIDENCE_VERSION_UNSUPPORTED' });
  }
  for (const field of PROCESS_EXPECTATION_KEYS) {
    if (evidence[field] !== expected[field]) {
      return Object.freeze({ state: 'ambiguous', empty: false, code: 'PROCESS_IDENTITY_MISMATCH' });
    }
  }
  if (!['running', 'empty', 'unknown'].includes(evidence.state) ||
      typeof evidence.descendantsComplete !== 'boolean' || !Array.isArray(evidence.members) ||
      evidence.members.length > 1_024) {
    return Object.freeze({ state: 'ambiguous', empty: false, code: 'PROCESS_EVIDENCE_INVALID' });
  }
  try {
    validateTimestamp(evidence.observedAt, 'process-domain evidence.observedAt');
    const pids = new Set();
    for (const member of evidence.members) {
      exactKeys(member, MEMBER_KEYS, 'process-domain member');
      if (!Number.isSafeInteger(member.pid) || member.pid < 1 || pids.has(member.pid)) throw new Error('invalid PID');
      pids.add(member.pid);
      validateDigest(member.startIdentityDigest, 'process-domain member.startIdentityDigest');
    }
  } catch {
    return Object.freeze({ state: 'ambiguous', empty: false, code: 'PROCESS_EVIDENCE_INVALID' });
  }
  if (evidence.descendantsComplete !== true || evidence.state === 'unknown' ||
      (evidence.state === 'empty' && evidence.members.length !== 0) ||
      (evidence.state === 'running' && evidence.members.length === 0)) {
    return Object.freeze({ state: 'ambiguous', empty: false, code: 'PROCESS_DOMAIN_UNPROVED' });
  }
  return Object.freeze({
    state: evidence.state,
    empty: evidence.state === 'empty',
    code: evidence.state === 'empty' ? 'PROCESS_DOMAIN_EMPTY' : 'PROCESS_DOMAIN_RUNNING',
  });
}

export function planProcessInterrupt({ expected, evidence, signal = 'SIGTERM' } = {}) {
  if (!SIGNALS.includes(signal)) fail('SIGNAL_INVALID', 'interrupt signal is unsupported');
  const state = classifyProcessDomain(expected, evidence);
  if (state.state === 'ambiguous') {
    return Object.freeze({ disposition: 'reconcile', signal: null, target: null, code: state.code });
  }
  if (state.empty) {
    return Object.freeze({ disposition: 'already_empty', signal: null, target: null,
      code: 'PROCESS_DOMAIN_EMPTY' });
  }
  return Object.freeze({
    disposition: 'signal_required',
    signal,
    target: Object.freeze({
      processDomainId: expected.processDomainId,
      launcherConnectionId: expected.launcherConnectionId,
      processIdentityDigest: expected.processIdentityDigest,
    }),
    code: 'PROCESS_DOMAIN_RUNNING',
  });
}

function validateLaunchCapture(value) {
  exactKeys(value, CAPTURE_KEYS, 'provider launch capture');
  if (!Array.isArray(value.stdoutChunks) || !Array.isArray(value.stderrChunks)) {
    fail('CAPTURE_INVALID', 'provider launch capture streams must be arrays');
  }
  validateTerminalObservation(value.terminalObservation);
  return value;
}

function activationBindsLaunch(receipt, request) {
  if (!plainObject(receipt) || receipt.effectKind !== 'provider_launch' ||
      !plainObject(receipt.binding)) return false;
  return [
    'runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion', 'capsuleDigest',
    'controlGeneration', 'correctionGeneration',
  ].every((field) => receipt.binding[field] === request.binding[field]);
}

// There is intentionally no real process launcher in this module. A caller may inject
// a supervised launcher only after the package-owned activation predicate authorizes
// the exact provider_launch effect. Tests use this seam with a fake launcher.
export async function executeCodexExecPlan({
  plan,
  launcher,
  activationReceipt = null,
  activationContext = null,
  now = null,
} = {}) {
  if (!plainObject(plan) || plan.schemaVersion !== IMPLEMENTATION_PROVIDER_VERSION ||
      typeof launcher !== 'function') {
    fail('LAUNCHER_INVALID', 'provider launch requires one validated plan and injected launcher');
  }
  const authorization = authorizeImplementationOperation({
    operationKind: 'provider_launch',
    receipt: activationReceipt,
    current: activationContext,
    now,
  });
  if (!plainObject(authorization) || authorization.authorized !== true ||
      authorization.effectKind !== 'provider_launch' ||
      !activationBindsLaunch(activationReceipt, plan.request)) {
    fail('ACTIVATION_REQUIRED', 'provider launch is not authorized by the current activation predicate');
  }

  const capture = validateLaunchCapture(await launcher(Object.freeze({
    executable: plan.executable,
    args: plan.args,
    options: Object.freeze({
      cwd: plan.cwd,
      env: plan.env,
      detached: true,
      shell: false,
      windowsHide: true,
    }),
    stdin: plan.stdin,
  })));

  const collector = createCodexJsonlCollector();
  const stdoutChunks = capture.stdoutChunks.map((chunk) => bufferFrom(chunk, 'provider JSONL chunk'));
  for (const chunk of stdoutChunks) collector.push(chunk);
  const events = collector.finish();
  let stderrBytes = 0;
  const stderrChunks = capture.stderrChunks.map((chunk) => {
    const bytes = bufferFrom(chunk, 'provider stderr chunk');
    stderrBytes += bytes.length;
    if (stderrBytes > IMPLEMENTATION_PROVIDER_LIMITS.stderrBytes) {
      fail('STREAM_LIMIT', 'provider stderr exceeds its byte bound');
    }
    return bytes;
  });
  const stdoutBytes = Buffer.concat(stdoutChunks);
  const stderr = Buffer.concat(stderrChunks, stderrBytes);
  decodeUtf8(stderr, 'provider stderr');
  let result = null;
  let finalBytes = null;
  if (capture.finalResultBytes !== null) {
    result = parseWorkerResult(capture.finalResultBytes);
    finalBytes = bufferFrom(capture.finalResultBytes, 'worker result');
  } else if (capture.terminalObservation.exitCode === 0) {
    fail('MODEL_RESULT_MISSING', 'successful provider exit did not produce a typed result');
  }
  if (capture.terminalObservation.stdoutDigest !== sha256Digest(stdoutBytes) ||
      capture.terminalObservation.stderrDigest !== sha256Digest(stderr)) {
    fail('STREAM_DIGEST_MISMATCH', 'provider terminal observation does not bind captured streams');
  }
  const modelResultDigest = finalBytes === null ? null : sha256Digest(finalBytes);
  if (capture.terminalObservation.modelResultDigest !== modelResultDigest) {
    fail('MODEL_RESULT_MISMATCH', 'provider terminal observation does not bind the final result');
  }
  const terminal = observeProviderTerminal(initialProviderTerminalState(plan.request.requestId),
    capture.terminalObservation, capture.processEvidence);
  return Object.freeze({
    events,
    result,
    modelResultDigest,
    stderrDigest: sha256Digest(stderr),
    terminal,
  });
}
