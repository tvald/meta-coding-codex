import fs from 'node:fs';
import path from 'node:path';

import { authorizeImplementationOperation } from './implementation-activation.mjs';
import {
  IMPLEMENTATION_BINDING_VERSION,
  IMPLEMENTATION_ROLE_PROFILES,
  inspectCompiledControllerPrompt,
  publishControllerBindingDescriptor,
} from './implementation-binding.mjs';
import {
  CODEX_EXEC_ADAPTER,
  CODEX_EXECUTABLE_VERSION,
  CONTROLLER_DESCRIPTOR_ENV,
  ROOT_DECISION_RESULT_JSON_SCHEMA,
  WORKER_RESULT_JSON_SCHEMA,
  planCodexExecLaunch,
  sanitizeCodexEnvironment,
  validateLaunchRequest,
} from './implementation-provider.mjs';
import {
  canonicalBytes,
  canonicalDigest,
  sha256Digest,
  validateBinding,
  validateControllerId,
  validateGitOid,
  validateTimestamp,
} from './implementation-protocol.mjs';
import { validateOrientation } from './implementation-controller.mjs';

export const IMPLEMENTATION_LAUNCH_VERSION = 1;

export class ImplementationLaunchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationLaunchError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ImplementationLaunchError(code, message);
}

function safeDirectory(directory, label) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) ||
      path.normalize(directory) !== directory || directory.includes('\0')) {
    fail('LAUNCH_PATH_UNSAFE', `${label} must be one normalized absolute directory`);
  }
  let real;
  let stats;
  try { real = fs.realpathSync(directory); stats = fs.statSync(real); } catch {
    fail('LAUNCH_PATH_UNSAFE', `${label} is unavailable`);
  }
  const uid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  if (real !== directory || !stats.isDirectory() || (stats.mode & 0o022) !== 0 ||
      (uid !== null && stats.uid !== uid)) {
    fail('LAUNCH_PATH_UNSAFE', `${label} must be physical and owner-held`);
  }
  return directory;
}

function requireActivation(receipt, current, now, binding) {
  const result = authorizeImplementationOperation({ operationKind: 'provider_launch',
    receipt, current, now });
  const matches = ['runId', 'epoch', 'taskId', 'taskRevision', 'taskRecordVersion',
    'capsuleDigest', 'controlGeneration', 'correctionGeneration']
    .every((field) => receipt?.binding?.[field] === binding[field]);
  if (result.authorized !== true || !matches) {
    fail('ACTIVATION_REQUIRED', 'launch artifact preparation requires current provider launch activation');
  }
}

function publishSchema(directory, jobId, bytes) {
  const target = path.join(directory, `${jobId}.schema.json`);
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (written < 1) throw new Error('incomplete output-schema write');
      offset += written;
    }
    fs.fchmodSync(fd, 0o600);
    fs.fsyncSync(fd);
  } catch (error) {
    fail('LAUNCH_ARTIFACT_COLLISION', `output schema could not be exclusively published: ${error.message}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const directoryFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  return target;
}

export function prepareCodexControllerLaunch({
  binding,
  assignmentId,
  attemptId,
  jobId,
  requestId,
  launcherConnectionId,
  role,
  cwd,
  baseTree,
  compiledPrompt,
  descriptorDirectory,
  spoolDirectory,
  executableIdentity,
  environment = {},
  deadlineAt,
  orientation = null,
  effectCapability = null,
  sandbox = 'workspace-write',
  activationReceipt = null,
  activationContext = null,
  now = null,
} = {}) {
  try {
    validateBinding(binding);
    for (const [label, value] of [['assignment ID', assignmentId], ['attempt ID', attemptId],
      ['job ID', jobId], ['request ID', requestId], ['launcher connection ID', launcherConnectionId]]) {
      validateControllerId(value, label);
    }
    validateGitOid(baseTree, 'launch base tree');
    validateTimestamp(deadlineAt, 'launch deadline');
  } catch (error) {
    fail('LAUNCH_INPUT_INVALID', error.message);
  }
  if (!Object.hasOwn(IMPLEMENTATION_ROLE_PROFILES, role)) {
    fail('LAUNCH_INPUT_INVALID', 'launch role is unsupported');
  }
  if (cwd === null || typeof cwd !== 'object' || Array.isArray(cwd) ||
      typeof cwd.realpath !== 'string' || typeof cwd.identity !== 'string') {
    fail('LAUNCH_INPUT_INVALID', 'launch cwd is invalid');
  }
  requireActivation(activationReceipt, activationContext, now, binding);
  safeDirectory(descriptorDirectory, 'descriptor directory');
  safeDirectory(spoolDirectory, 'provider spool directory');
  const prompt = inspectCompiledControllerPrompt(compiledPrompt);
  const profile = IMPLEMENTATION_ROLE_PROFILES[role];
  if (prompt.profile !== profile) fail('ROLE_PROFILE_MISMATCH', 'compiled prompt does not match launch role');
  let providerPrompt = prompt.prompt;
  if (role === 'root_decision') {
    if (orientation === null || typeof orientation !== 'object' || Array.isArray(orientation) ||
        typeof orientation.digest !== 'string' || orientation.value === null) {
      fail('LAUNCH_INPUT_INVALID', 'Root decision launch requires one exact orientation');
    }
    try {
      validateOrientation(orientation.value);
    } catch (error) {
      fail('LAUNCH_INPUT_INVALID', `Root decision orientation is invalid: ${error.message}`);
    }
    if (orientation.digest !== canonicalDigest(orientation.value)) {
      fail('LAUNCH_INPUT_INVALID', 'Root decision orientation digest is stale');
    }
    const envelope = canonicalBytes(Object.freeze({
      schemaVersion: IMPLEMENTATION_LAUNCH_VERSION,
      kind: 'root_orientation',
      orientationDigest: orientation.digest,
      orientation: orientation.value,
    }));
    providerPrompt = Buffer.concat([
      prompt.prompt,
      Buffer.from('\nMETA-FRAMEWORK-ROOT-ORIENTATION 1\n', 'utf8'),
      envelope,
      Buffer.from('\n', 'utf8'),
    ]);
  } else if (orientation !== null) {
    fail('LAUNCH_INPUT_INVALID', 'non-Root launch cannot receive a Root orientation');
  }
  const descriptorId = `descriptor_${canonicalDigest({ jobId, requestId }).slice(7, 31)}`;
  const descriptorDraft = Object.freeze({
    schemaVersion: IMPLEMENTATION_BINDING_VERSION,
    descriptorId,
    binding: Object.freeze({ ...binding }),
    assignmentId,
    attemptId,
    jobId,
    launcherConnectionId,
    role,
    profile,
    profileDigest: prompt.profileDigest,
    promptDigest: sha256Digest(prompt.prompt),
    cwdIdentity: cwd.identity,
  });
  const descriptor = publishControllerBindingDescriptor({ directory: descriptorDirectory,
    descriptor: descriptorDraft, effectCapability, activationReceipt, activationContext, now });
  const schemaBytes = canonicalBytes(role === 'root_decision'
    ? ROOT_DECISION_RESULT_JSON_SCHEMA
    : WORKER_RESULT_JSON_SCHEMA);
  const outputSchemaPath = publishSchema(spoolDirectory, jobId, schemaBytes);
  const finalOutputPath = path.join(spoolDirectory, `${jobId}.final.json`);
  if (fs.existsSync(finalOutputPath)) fail('LAUNCH_ARTIFACT_COLLISION', 'provider final output already exists');
  const sanitized = sanitizeCodexEnvironment(environment);
  const launchEnvironment = Object.freeze({ ...sanitized,
    [CONTROLLER_DESCRIPTOR_ENV]: descriptor.descriptorPath });
  const request = Object.freeze({
    schemaVersion: IMPLEMENTATION_LAUNCH_VERSION,
    requestId,
    jobId,
    binding: Object.freeze({ ...binding }),
    assignmentId,
    attemptId,
    role,
    providerAdapter: CODEX_EXEC_ADAPTER,
    executableVersion: CODEX_EXECUTABLE_VERSION,
    cwdIdentity: cwd.identity,
    baseTree,
    profileDigest: prompt.profileDigest,
    promptDigest: sha256Digest(providerPrompt),
    outputSchemaDigest: sha256Digest(schemaBytes),
    sandbox,
    approvalPolicy: 'never',
    network: false,
    nestedAgents: false,
    environmentDigest: canonicalDigest(launchEnvironment),
    deadlineAt,
  });
  validateLaunchRequest(request);
  const plan = planCodexExecLaunch({ request, executableIdentity, cwd,
    outputSchema: { path: outputSchemaPath, digest: request.outputSchemaDigest },
    finalOutputPath, controllerDescriptorPath: descriptor.descriptorPath,
    prompt: providerPrompt, rootOrientationDigest: orientation?.digest ?? null, environment });
  return Object.freeze({ request, descriptor, outputSchemaPath, finalOutputPath, plan });
}
