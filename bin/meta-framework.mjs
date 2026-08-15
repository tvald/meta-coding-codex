#!/usr/bin/env node

import {
  readPackageIdentity as readPackageRuntimeIdentity,
  RuntimeRootError,
  validateClientRuntimeRoots,
  validateTaskRuntimeRoots,
} from '../lib/runtime-roots.mjs';
import {
  TASK_ENVELOPE_SCHEMA_VERSION,
} from '../lib/task-compatibility.mjs';
import { PROVIDER_PROBE_SCHEMA_VERSION } from '../lib/provider-contract.mjs';

function printHelp() {
  process.stdout.write(`meta-framework

Usage:
  meta-framework --help
  meta-framework --version
  meta-framework version [--json]
  meta-framework tasks --version
  meta-framework tasks COMMAND [OPTIONS]
  meta-framework project --version
  meta-framework project preflight
  meta-framework project init
  meta-framework project preflight --harness codex
  meta-framework project init --harness codex
  meta-framework agent-prompt --version
  meta-framework agent-prompt --profile PROFILE [--harness HARNESS]
  meta-framework hook --version
  meta-framework hook --harness HARNESS --profile PROFILE
  meta-framework prompt-runtime --version
  meta-framework prompt-runtime status
  meta-framework prompt-runtime build
  meta-framework prompt-runtime install-bootstrap
  meta-framework prompt-runtime activate GENERATION --expected-active TOKEN
  meta-framework prompt-runtime rollback GENERATION --expected-active TOKEN
  meta-framework prompt-runtime retire SESSION_ID --expected-generation GENERATION
  meta-framework prompt-runtime cleanup [--apply]
  meta-framework docs --version
  meta-framework docs TOPIC
  meta-framework explain --version
  meta-framework explain FACET
  meta-framework quota --version
  meta-framework quota --harness HARNESS
  meta-framework capability --version
  meta-framework capability --harness HARNESS --name NAME
  meta-framework implement --version
  meta-framework implement TASK --expected-task-revision N --harness codex [--max-concurrency 3] [--shadow]
  meta-framework implement status RUN [--json]
  meta-framework implement events RUN [--after SEQUENCE] [--limit COUNT]
  meta-framework implement doctor RUN
  meta-framework implement stop RUN --expected-control-generation N --reason TEXT
  meta-framework implement resume RUN --expected-epoch N --expected-control-generation N
  meta-framework implement clean RUN
  meta-framework implement lock inspect RUN
  meta-framework implement lock recover RUN --expected-token TOKEN --confirm-owner-not-live
`);
}

function fail(message) {
  process.stderr.write(`meta-framework: ${message}\n`);
  process.exitCode = 2;
}

function failRuntime(error, prefix = 'meta-framework', exitCode = 1) {
  process.stderr.write(`${prefix}: ${error.code}: ${error.message}\n`);
  process.exitCode = exitCode;
}

function failUnexpected(prefix = 'meta-framework') {
  process.stderr.write(`${prefix}: INTERNAL_ERROR: package runtime failed\n`);
  process.exitCode = 1;
}

function failFrameworkData(error, prefix) {
  const safeCode = typeof error?.code === 'string' && /^[A-Z][A-Z_]{0,63}$/u.test(error.code) ?
    error.code : 'INTERNAL_ERROR';
  const safeMessage = typeof error?.message === 'string' && error.message.length <= 512 &&
    !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(error.message) ?
    error.message : 'task runtime failed';
  process.stderr.write(`${prefix}: ${safeCode}: ${safeMessage}\n`);
  process.exitCode = Number.isInteger(error?.exitCode) && error.exitCode >= 1 && error.exitCode <= 9 ?
    error.exitCode : 1;
}

function failPromptCompiler(error, prefix) {
  const safeCode = typeof error?.code === 'string' && /^[A-Z][A-Z_]{0,63}$/u.test(error.code) ?
    error.code : 'INTERNAL_ERROR';
  const safeMessage = typeof error?.message === 'string' && error.message.length <= 512 &&
    !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(error.message) ?
    error.message : 'prompt compiler failed';
  process.stderr.write(`${prefix}: ${safeCode}: ${safeMessage}\n`);
  process.exitCode = error?.exitCode === 2 ? 2 : 1;
}

function failProjectInitializer(error, prefix) {
  const safeCode = typeof error?.code === 'string' && /^[A-Z][A-Z_]{0,63}$/u.test(error.code) ?
    error.code : 'INTERNAL_ERROR';
  const safeMessage = typeof error?.message === 'string' && error.message.length <= 512 &&
    !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(error.message) ?
    error.message : 'project initializer failed';
  process.stderr.write(`${prefix}: ${safeCode}: ${safeMessage}\n`);
  process.exitCode = Number.isInteger(error?.exitCode) && error.exitCode >= 1 && error.exitCode <= 5 ?
    error.exitCode : 1;
}

function failImplementationCli(error, prefix) {
  const safeCode = typeof error?.code === 'string' && /^[A-Z][A-Z_]{0,63}$/u.test(error.code) ?
    error.code : 'INTERNAL_ERROR';
  const safeMessage = typeof error?.message === 'string' && error.message.length <= 512 &&
    !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(error.message) ?
    error.message : 'implementation controller failed';
  process.stderr.write(`${prefix}: ${safeCode}: ${safeMessage}\n`);
  process.exitCode = Number.isInteger(error?.exitCode) && error.exitCode >= 1 && error.exitCode <= 9 ?
    error.exitCode : 1;
}

function failPromptRuntime(error, prefix) {
  const safeCode = typeof error?.code === 'string' && /^[A-Z][A-Z_]{0,63}$/u.test(error.code) ?
    error.code : 'INTERNAL_ERROR';
  process.stderr.write(`${prefix}: ${safeCode}: prompt runtime operation failed\n`);
  process.exitCode = Number.isInteger(error?.exitCode) && error.exitCode >= 1 && error.exitCode <= 2 ?
    error.exitCode : 1;
}

function parseProbeOptions(tokens, names) {
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!names.includes(option) || typeof value !== 'string' || value.startsWith('--') ||
        Object.hasOwn(values, option) || !/^[a-z][a-z0-9-]{0,63}$/u.test(value)) {
      return null;
    }
    values[option] = value;
  }
  return tokens.length === names.length * 2 && names.every((name) => Object.hasOwn(values, name)) ? values : null;
}

function parsePromptOptions(tokens) {
  if (tokens.length !== 2 && tokens.length !== 4) return null;
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!['--profile', '--harness'].includes(option) || typeof value !== 'string' || value.startsWith('--') ||
        Object.hasOwn(values, option) || !/^[a-z][a-z0-9-]{0,63}$/u.test(value)) return null;
    values[option] = value;
  }
  return Object.hasOwn(values, '--profile') ? values : null;
}

function extensionFacetRequest(value) {
  return typeof value === 'string' && value.startsWith('extension.') &&
    Buffer.byteLength(value, 'utf8') <= 139 && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value);
}

function probeVersion(packageRuntime) {
  const compatibility = packageRuntime.providerProbeCompatibility;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: PROVIDER_PROBE_SCHEMA_VERSION,
    package: packageRuntime.identity,
    providerProbe: {
      version: compatibility.version,
      envelopeVersions: [...compatibility.envelopeVersions],
      harnesses: [...compatibility.harnesses],
      capabilities: [...compatibility.capabilities],
    },
  })}\n`);
}

function projectVersion(packageRuntime) {
  const compatibility = packageRuntime.projectInitCompatibility;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: compatibility.envelopeVersions[0],
    package: packageRuntime.identity,
    projectInit: {
      version: compatibility.version,
      envelopeVersions: [...compatibility.envelopeVersions],
      bootstrapVersions: [...compatibility.bootstrapVersions],
      stateTemplateVersions: [...compatibility.stateTemplateVersions],
      optionalHarnesses: [...compatibility.optionalHarnesses],
      codexIntegrationConfigVersions: [...compatibility.codexIntegrationConfigVersions],
    },
  })}\n`);
}

function probeOutput(packageRuntime, kind, harness, capability, inspected) {
  let envelope = {
    schemaVersion: PROVIDER_PROBE_SCHEMA_VERSION,
    probeVersion: packageRuntime.providerProbeCompatibility.version,
    package: packageRuntime.identity,
    kind,
    harness,
    checkedAt: inspected.observedAt,
    disposition: inspected.disposition,
    reason: inspected.reason,
    result: kind === 'quota' ? { windows: inspected.windows } :
      ['enabled', 'disabled'].includes(inspected.disposition) ? { name: capability } : null,
  };
  let encoded = JSON.stringify(envelope);
  if (Buffer.byteLength(encoded) > 16_384) {
    envelope = {
      ...envelope,
      disposition: 'failed',
      reason: 'inspection_failed',
      result: kind === 'quota' ? { windows: [] } : null,
    };
    encoded = JSON.stringify(envelope);
  }
  process.stdout.write(`${encoded}\n`);
  if ((kind === 'quota' && envelope.disposition !== 'proceed') ||
      (kind === 'capability' && envelope.disposition !== 'enabled')) process.exitCode = 1;
}

async function providerClientRoot(packageRuntime) {
  const { repositoryContext } = await import('../readme/meta/framework-data/store.mjs');
  const context = await repositoryContext();
  return validateTaskRuntimeRoots({ packageRuntime, context }).clientRoot;
}

async function promptExtensions(packageRuntime) {
  const { repositoryContext } = await import('../readme/meta/framework-data/store.mjs');
  const context = await repositoryContext();
  const clientRuntime = validateClientRuntimeRoots({ packageRuntime, context });
  const { resolveLockedPromptExtensions } = await import('../lib/extension-loader.mjs');
  return resolveLockedPromptExtensions(clientRuntime);
}

async function boundedStdin(maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error('hook input exceeds its bound');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

async function validatedClientRuntime(packageRuntime) {
  const { repositoryContext } = await import('../readme/meta/framework-data/store.mjs');
  const context = await repositoryContext();
  return validateClientRuntimeRoots({ packageRuntime, context });
}

async function promptRuntimeBuild(packageRuntime, clientRuntime, runtime) {
  const { resolveLockedPromptExtensions } = await import('../lib/extension-loader.mjs');
  const extensions = resolveLockedPromptExtensions(clientRuntime);
  const { compileAgentPrompt } = await import('../lib/prompt-compiler.mjs');
  const promptRuntime = await import('../lib/prompt-runtime.mjs');
  const {
    codexHookFailure,
    compileCodexHookPrompt,
    validateCodexFailureContract,
  } = await import('../lib/hook-adapters.mjs');
  return promptRuntime.buildPromptGeneration(runtime, {
    packageIdentity: packageRuntime.identity,
    compilerVersion: packageRuntime.promptCompilerCompatibility.version,
    sourceIdentity: {
      mode: clientRuntime.mode,
      package: packageRuntime.identity,
    },
    compilePrompt: (profile, harness) =>
      compileAgentPrompt(packageRuntime, profile, harness, extensions),
    compileCorePrompt: (profile, harness) =>
      compileAgentPrompt(packageRuntime, profile, harness, null),
    validateCandidate: ({ validationMatrix, codexPrompts, compiledPromptSetDigest }) => {
      if (validationMatrix.length !== 15 || Object.keys(codexPrompts).length !== 5) {
        throw new Error('candidate matrix is incomplete');
      }
      for (const profile of packageRuntime.promptCompilerCompatibility.profiles) {
        const lines = codexPrompts[profile].toString('utf8').split('\n', 3);
        const manifest = JSON.parse(lines[1]);
        if (lines[0] !== 'META-FRAMEWORK-AGENT-PROMPT 1' ||
            manifest.profile !== profile || manifest.harness !== 'codex') {
          throw new Error('candidate profile binding is invalid');
        }
        validateCodexFailureContract(profile, codexHookFailure(profile));
        const lifecycleEvents = profile === 'root'
          ? ['startup', 'resume', 'clear', 'compact'].map((source) => ({
            hook_event_name: 'SessionStart', source, session_id: 'candidate-lifecycle-validation',
          }))
          : [{
            hook_event_name: 'SubagentStart', agent_type: `meta_${profile}`,
            session_id: 'candidate-lifecycle-validation',
          }];
        for (const event of lifecycleEvents) {
          const served = Buffer.from(compileCodexHookPrompt(
            packageRuntime, profile, Buffer.from(JSON.stringify(event)), extensions,
          ));
          if (!served.equals(codexPrompts[profile])) {
            throw new Error('candidate lifecycle prompt bytes changed');
          }
        }
        const mismatchedEvents = profile === 'root' ? [
          { hook_event_name: 'SessionStart', source: 'other', session_id: 'candidate-lifecycle-negative' },
          { hook_event_name: 'SubagentStart', agent_type: 'meta_reviewer', session_id: 'candidate-lifecycle-negative' },
        ] : [
          { hook_event_name: 'SessionStart', source: 'startup', session_id: 'candidate-lifecycle-negative' },
          {
            hook_event_name: 'SubagentStart',
            agent_type: `meta_${profile === 'reviewer' ? 'security' : 'reviewer'}`,
            session_id: 'candidate-lifecycle-negative',
          },
        ];
        for (const event of mismatchedEvents) {
          let rejected = false;
          try {
            compileCodexHookPrompt(
              packageRuntime, profile, Buffer.from(JSON.stringify(event)), extensions,
            );
          } catch { rejected = true; }
          if (!rejected) throw new Error('candidate lifecycle mismatch was accepted');
        }
      }
      return promptRuntime.promptCandidateValidationReceipt(compiledPromptSetDigest);
    },
  });
}

let frameworkDataErrorPrefix = 'meta-framework';
try {
  const packageRuntime = readPackageRuntimeIdentity(import.meta.url);
  const identity = packageRuntime.identity;
  const taskCompatibility = packageRuntime.taskCompatibility;
  const args = process.argv.slice(2);
  if (args[0] === 'tasks') frameworkDataErrorPrefix = 'meta-framework tasks';
  else if (args[0] === 'project') frameworkDataErrorPrefix = 'meta-framework project';
  else if (args[0] === 'implement') frameworkDataErrorPrefix = 'meta-framework implement';
  else if (args[0] === 'prompt-runtime') frameworkDataErrorPrefix = 'meta-framework prompt-runtime';
  else if (['agent-prompt', 'hook', 'docs', 'explain'].includes(args[0])) {
    frameworkDataErrorPrefix = `meta-framework ${args[0]}`;
  }

  if (args.length === 0 || (args.length === 1 && ['--help', '-h', 'help'].includes(args[0]))) {
    printHelp();
  } else if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    process.stdout.write(`${identity.version}\n`);
  } else if (args[0] === 'version' && args.length === 1) {
    process.stdout.write(`${identity.version}\n`);
  } else if (args[0] === 'version' && args.length === 2 && args[1] === '--json') {
    process.stdout.write(`${JSON.stringify({ schemaVersion: TASK_ENVELOPE_SCHEMA_VERSION, ...identity })}\n`);
  } else if (args[0] === 'tasks' && args.length === 2 && args[1] === '--version') {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: TASK_ENVELOPE_SCHEMA_VERSION,
      package: identity,
      taskCli: {
        version: taskCompatibility.version,
        envelopeVersions: [...taskCompatibility.envelopeVersions],
        readableStoreSchemaVersions: [...taskCompatibility.readableStoreSchemaVersions],
        writableStoreSchemaVersions: [...taskCompatibility.writableStoreSchemaVersions],
      },
    })}\n`);
  } else if (args[0] === 'project' && args.length === 2 && args[1] === '--version') {
    projectVersion(packageRuntime);
  } else if (args[0] === 'project' && [2, 4].includes(args.length) &&
      ['preflight', 'init'].includes(args[1]) &&
      (args.length === 2 || (args[2] === '--harness' && args[3] === 'codex'))) {
    const { repositoryContext } = await import('../readme/meta/framework-data/store.mjs');
    const context = await repositoryContext();
    const runtime = validateClientRuntimeRoots({ packageRuntime, context });
    const initializer = await import('../lib/project-initializer.mjs');
    const projectOptions = args.length === 4 ? { harness: args[3] } : undefined;
    const result = args[1] === 'preflight' ?
      await initializer.preflightProject(runtime, projectOptions) :
      await initializer.initializeProject(runtime, projectOptions);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (args[0] === 'project') {
    process.stderr.write('meta-framework project: ARGUMENT_INVALID: invalid project command; run --help\n');
    process.exitCode = 2;
  } else if (args[0] === 'tasks' && (args.length === 1 || args.slice(1).includes('--help'))) {
    const { runRootlessFrameworkDataCli } = await import('../readme/meta/framework-data/cli.mjs');
    await runRootlessFrameworkDataCli(args.length === 1 ? ['--help'] : args.slice(1), {
      programName: 'meta-framework tasks',
      errorPrefix: 'meta-framework tasks',
    });
  } else if (args[0] === 'tasks') {
    const { repositoryContext } = await import('../readme/meta/framework-data/store.mjs');
    const context = await repositoryContext();
    const runtime = validateTaskRuntimeRoots({ packageRuntime, context });
    const { runValidatedFrameworkDataCli } = await import('../readme/meta/framework-data/cli.mjs');
    await runValidatedFrameworkDataCli(args.length === 1 ? ['--help'] : args.slice(1), runtime, {
      programName: 'meta-framework tasks',
      errorPrefix: 'meta-framework tasks',
    });
  } else if (['agent-prompt', 'docs', 'explain'].includes(args[0]) &&
      args.length === 2 && args[1] === '--version') {
    const { promptCompilerVersionEnvelope } = await import('../lib/prompt-compiler.mjs');
    process.stdout.write(promptCompilerVersionEnvelope(packageRuntime));
  } else if (args[0] === 'agent-prompt') {
    const options = parsePromptOptions(args.slice(1));
    if (options === null) {
      fail('invalid agent-prompt command; run --help');
    } else {
      const { compileAgentPrompt } = await import('../lib/prompt-compiler.mjs');
      const knownPrompt = packageRuntime.promptCompilerCompatibility.profiles.includes(options['--profile']) &&
        packageRuntime.promptCompilerCompatibility.harnesses.includes(options['--harness'] ?? 'portable');
      process.stdout.write(compileAgentPrompt(
        packageRuntime,
        options['--profile'],
        options['--harness'] ?? 'portable',
        knownPrompt ? await promptExtensions(packageRuntime) : null,
      ));
    }
  } else if (args[0] === 'hook' && args.length === 2 && args[1] === '--version') {
    const { hookVersionEnvelope } = await import('../lib/hook-adapters.mjs');
    process.stdout.write(hookVersionEnvelope(packageRuntime));
  } else if (args[0] === 'hook') {
    const options = parseProbeOptions(args.slice(1), ['--harness', '--profile']);
    const knownHook = options !== null &&
      packageRuntime.hookAdapterCompatibility.harnesses.includes(options['--harness']) &&
      packageRuntime.hookAdapterCompatibility.profiles.includes(options['--profile']);
    if (!knownHook) {
      fail('invalid or unsupported hook command; run --help');
    } else {
      const hooks = await import('../lib/hook-adapters.mjs');
      const controllerDescriptorPath = Object.hasOwn(process.env, 'META_FRAMEWORK_CONTROLLER_DESCRIPTOR')
        ? process.env.META_FRAMEWORK_CONTROLLER_DESCRIPTOR
        : null;
      let input = null;
      let validatedEvent = null;
      let sessionEndIntent = false;
      try {
        input = await boundedStdin(hooks.HOOK_ADAPTER_LIMITS.inputBytes);
        const loader = await import('../lib/prompt-bootstrap-loader.mjs');
        sessionEndIntent = options['--profile'] === 'root' && loader.promptEventIsSessionEnd(input);
        validatedEvent = loader.validatePromptEvent(input, {
          profile: options['--profile'], allowSessionEnd: true,
        });
        const clientRuntime = await validatedClientRuntime(packageRuntime);
        const promptRuntime = await import('../lib/prompt-runtime.mjs');
        const { readFileSync } = await import('node:fs');
        const location = promptRuntime.inspectPromptRuntimeLocation(clientRuntime.context.commonDir);
        if (validatedEvent.sessionEnd) {
          if (location.state === 'ready') {
            const runtime = promptRuntime.openPromptRuntime(clientRuntime.context.commonDir);
            const { retirePromptSession } = await import('../lib/prompt-bootstrap-loader.mjs');
            retirePromptSession(input, {
              runtimeRoot: runtime.root, controllerDescriptorPath,
            });
          }
        } else {
          let runtime;
          if (location.state === 'ready') {
            runtime = promptRuntime.openPromptRuntime(clientRuntime.context.commonDir);
          } else {
            if (clientRuntime.mode !== 'installed' || !['absent', 'interrupted'].includes(location.state)) {
              throw new promptRuntime.PromptRuntimeError(
                'PROMPT_RUNTIME_UNAVAILABLE', 'prompt runtime requires explicit reconciliation',
              );
            }
            const seeded = await promptRuntime.seedPromptRuntime(clientRuntime.context.commonDir, {
              prepare: async (privateRuntime) => {
                const revalidated = await validatedClientRuntime(packageRuntime);
                if (revalidated.mode !== 'installed' ||
                    revalidated.context.commonDir !== clientRuntime.context.commonDir) {
                  throw new promptRuntime.PromptRuntimeError(
                    'PROMPT_RUNTIME_UNAVAILABLE', 'installed client identity changed during seed',
                  );
                }
                const built = await promptRuntimeBuild(packageRuntime, revalidated, privateRuntime);
                return {
                  ...built,
                  loaderBytes: readFileSync(new URL('../lib/prompt-bootstrap-loader.mjs', import.meta.url)),
                };
              },
            });
            runtime = seeded.runtime;
          }
          process.stdout.write(promptRuntime.serveRuntimePrompt(runtime, input, options['--profile'], {
            controllerDescriptorPath,
          }));
        }
      } catch (error) {
        if (!sessionEndIntent) {
          process.stdout.write(controllerDescriptorPath === null
            ? hooks.codexHookFailure(options['--profile'], error?.code)
            : hooks.codexControllerHookFailure());
        }
      }
    }
  } else if (args[0] === 'prompt-runtime' && args.length === 2 && args[1] === '--version') {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      package: identity,
      promptRuntime: { version: '1.0.0', storeSchemaVersions: [1] },
    })}\n`);
  } else if (args[0] === 'prompt-runtime') {
    const promptRuntime = await import('../lib/prompt-runtime.mjs');
    const command = args[1];
    const validStatus = command === 'status' && args.length === 2;
    const validBuild = command === 'build' && args.length === 2;
    const validInstall = command === 'install-bootstrap' && args.length === 2;
    const validSelection = ['activate', 'rollback'].includes(command) && args.length === 5 &&
      args[3] === '--expected-active';
    const validRetire = command === 'retire' && args.length === 5 && args[3] === '--expected-generation';
    const validCleanup = command === 'cleanup' && (args.length === 2 ||
      (args.length === 3 && args[2] === '--apply'));
    if (![validStatus, validBuild, validInstall, validSelection, validRetire, validCleanup].some(Boolean)) {
      fail('invalid prompt-runtime command; run --help');
    }
    const clientRuntime = await validatedClientRuntime(packageRuntime);
    const { readFileSync } = await import('node:fs');
    if (validStatus) {
      const location = promptRuntime.inspectPromptRuntimeLocation(clientRuntime.context.commonDir);
      if (location.state !== 'ready') {
        process.stdout.write(`${JSON.stringify({ schemaVersion: 1, initialized: false, ...location })}\n`);
      } else {
        const runtime = promptRuntime.openPromptRuntime(clientRuntime.context.commonDir);
        process.stdout.write(`${JSON.stringify({ initialized: true, ...location,
          ...promptRuntime.inspectPromptRuntime(runtime) })}\n`);
      }
    } else {
      const runtime = validBuild || validInstall
        ? promptRuntime.initializePromptRuntime(clientRuntime.context.commonDir)
        : promptRuntime.openPromptRuntime(clientRuntime.context.commonDir);
      if (validBuild) {
        process.stdout.write(`${JSON.stringify(await promptRuntimeBuild(packageRuntime, clientRuntime, runtime))}\n`);
      } else if (validInstall) {
        const loaderBytes = readFileSync(new URL('../lib/prompt-bootstrap-loader.mjs', import.meta.url));
        process.stdout.write(`${JSON.stringify(promptRuntime.installPromptBootstrapLoader(runtime, loaderBytes))}\n`);
      } else if (validSelection) {
        const operation = command === 'activate' ? promptRuntime.activatePromptGeneration :
          promptRuntime.rollbackPromptGeneration;
        process.stdout.write(`${JSON.stringify(operation(runtime, args[2], { expectedActive: args[4] }))}\n`);
      } else if (validRetire) {
        process.stdout.write(`${JSON.stringify({ retired: promptRuntime.retireSessionPin(
          runtime, args[2], { expectedGeneration: args[4] },
        ) })}\n`);
      } else if (validCleanup) {
        process.stdout.write(`${JSON.stringify(promptRuntime.cleanupPromptRuntime(runtime, {
          apply: args[2] === '--apply',
        }))}\n`);
      }
    }
  } else if (['docs', 'explain'].includes(args[0])) {
    if (args.length !== 2 || args[1].startsWith('--')) {
      fail(`invalid ${args[0]} command; run --help`);
    } else {
      const compiler = await import('../lib/prompt-compiler.mjs');
      if (args[0] === 'docs') {
        process.stdout.write(compiler.retrieveDocument(packageRuntime, args[1]));
      } else {
        const extensions = extensionFacetRequest(args[1]) ? await promptExtensions(packageRuntime) : null;
        process.stdout.write(compiler.explainFacet(packageRuntime, args[1], extensions));
      }
    }
  } else if (['quota', 'capability'].includes(args[0]) && args.length === 2 && args[1] === '--version') {
    probeVersion(packageRuntime);
  } else if (args[0] === 'quota') {
    const options = parseProbeOptions(args.slice(1), ['--harness']);
    if (options === null) {
      fail('invalid quota command; run --help');
    } else {
      const { inspectQuota } = await import('../lib/provider-adapters.mjs');
      const clientRoot = packageRuntime.providerProbeCompatibility.harnesses.includes(options['--harness']) ?
        await providerClientRoot(packageRuntime) : null;
      probeOutput(packageRuntime, 'quota', options['--harness'], null,
        await inspectQuota(options['--harness'], { clientRoot }));
    }
  } else if (args[0] === 'capability') {
    const options = parseProbeOptions(args.slice(1), ['--harness', '--name']);
    if (options === null) {
      fail('invalid capability command; run --help');
    } else {
      const { inspectCapability } = await import('../lib/provider-adapters.mjs');
      const knownProbe = packageRuntime.providerProbeCompatibility.harnesses.includes(options['--harness']) &&
        packageRuntime.providerProbeCompatibility.capabilities.includes(options['--name']);
      const clientRoot = knownProbe ? await providerClientRoot(packageRuntime) : null;
      probeOutput(packageRuntime, 'capability', options['--harness'], options['--name'],
        await inspectCapability(options['--harness'], options['--name'], { clientRoot }));
    }
  } else if (args[0] === 'implement') {
    const implementation = await import('../lib/implementation-cli.mjs');
    const command = implementation.parseImplementationCommand(args.slice(1));
    let adapter = null;
    if (!['version', 'help'].includes(command.command)) {
      const {
        activeTask,
        loadStore,
        repositoryContext,
      } = await import('../readme/meta/framework-data/store.mjs');
      const context = await repositoryContext();
      validateClientRuntimeRoots({ packageRuntime, context });
      const readOnlyAdapter = implementation.createReadOnlyImplementationAdapter(context.commonDir, {
        async shadowStart(shadowCommand) {
          const [loaded, supervisor] = await Promise.all([
            loadStore(context),
            import('../lib/implementation-supervisor.mjs'),
          ]);
          return supervisor.planProjectImplementationShadowStart({
            command: shadowCommand,
            task: loaded.tasks.get(shadowCommand.taskId) ?? null,
            activeTaskId: activeTask(loaded.tasks)?.id ?? null,
            taskStorePaused: loaded.control.pause !== null,
            storeGeneration: loaded.digest,
            repositoryRoot: context.root,
            observedAt: new Date().toISOString(),
          });
        },
      });
      const { createImplementationOperatorAdapter } =
        await import('../lib/implementation-operator.mjs');
      adapter = createImplementationOperatorAdapter({
        gitCommonDirectory: context.commonDir,
        readOnlyAdapter,
      });
    }
    const result = await implementation.executeImplementationCommand(command, {
      packageIdentity: identity,
      adapter,
    });
    process.stdout.write(command.command === 'help' ? result.help : `${JSON.stringify(result)}\n`);
  } else {
    fail('unknown command; run --help');
  }
} catch (error) {
  if (error instanceof RuntimeRootError) {
    const projectRuntime = frameworkDataErrorPrefix === 'meta-framework project';
    failRuntime(error, projectRuntime ? frameworkDataErrorPrefix : 'meta-framework', projectRuntime ? 4 : 1);
  }
  else if (error?.name === 'FrameworkDataError') failFrameworkData(error, frameworkDataErrorPrefix);
  else if (error?.name === 'PromptCompilerError') failPromptCompiler(error, frameworkDataErrorPrefix);
  else if (error?.name === 'ExtensionError') failPromptCompiler(error, frameworkDataErrorPrefix);
  else if (error?.name === 'ProjectInitializerError') failProjectInitializer(error, frameworkDataErrorPrefix);
  else if (error?.name === 'ImplementationCliError') failImplementationCli(error, frameworkDataErrorPrefix);
  else if (error?.name === 'ImplementationLedgerError') failImplementationCli(error, frameworkDataErrorPrefix);
  else if (error?.name === 'PromptRuntimeError' || error?.name === 'PromptBootstrapError') {
    failPromptRuntime(error, frameworkDataErrorPrefix);
  }
  else failUnexpected(frameworkDataErrorPrefix);
}
