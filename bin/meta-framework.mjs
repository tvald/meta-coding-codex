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
  meta-framework agent-prompt --version
  meta-framework agent-prompt --profile PROFILE [--harness HARNESS]
  meta-framework docs --version
  meta-framework docs TOPIC
  meta-framework explain --version
  meta-framework explain FACET
  meta-framework quota --version
  meta-framework quota --harness HARNESS
  meta-framework capability --version
  meta-framework capability --harness HARNESS --name NAME
`);
}

function fail(message) {
  process.stderr.write(`meta-framework: ${message}\n`);
  process.exitCode = 2;
}

function failRuntime(error) {
  process.stderr.write(`meta-framework: ${error.code}: ${error.message}\n`);
  process.exitCode = 1;
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

let frameworkDataErrorPrefix = 'meta-framework';
try {
  const packageRuntime = readPackageRuntimeIdentity(import.meta.url);
  const identity = packageRuntime.identity;
  const taskCompatibility = packageRuntime.taskCompatibility;
  const args = process.argv.slice(2);
  if (args[0] === 'tasks') frameworkDataErrorPrefix = 'meta-framework tasks';
  else if (['agent-prompt', 'docs', 'explain'].includes(args[0])) {
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
  } else {
    fail('unknown command; run --help');
  }
} catch (error) {
  if (error instanceof RuntimeRootError) failRuntime(error);
  else if (error?.name === 'FrameworkDataError') failFrameworkData(error, frameworkDataErrorPrefix);
  else if (error?.name === 'PromptCompilerError') failPromptCompiler(error, frameworkDataErrorPrefix);
  else if (error?.name === 'ExtensionError') failPromptCompiler(error, frameworkDataErrorPrefix);
  else failUnexpected(frameworkDataErrorPrefix);
}
