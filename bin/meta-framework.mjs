#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../package.json', import.meta.url);

function readPackageIdentity() {
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  if (manifest.name !== '@tvald/meta-framework' || typeof manifest.version !== 'string') {
    throw new Error('invalid package identity');
  }
  return { name: manifest.name, version: manifest.version };
}

function printHelp() {
  process.stdout.write(`meta-framework

Usage:
  meta-framework --help
  meta-framework --version
  meta-framework version [--json]
`);
}

function fail(message) {
  process.stderr.write(`meta-framework: ${message}\n`);
  process.exitCode = 2;
}

try {
  const identity = readPackageIdentity();
  const args = process.argv.slice(2);

  if (args.length === 0 || (args.length === 1 && ['--help', '-h', 'help'].includes(args[0]))) {
    printHelp();
  } else if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    process.stdout.write(`${identity.version}\n`);
  } else if (args[0] === 'version' && args.length === 1) {
    process.stdout.write(`${identity.version}\n`);
  } else if (args[0] === 'version' && args.length === 2 && args[1] === '--json') {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ...identity })}\n`);
  } else {
    fail('unknown command; run --help');
  }
} catch {
  fail('package metadata is unavailable or invalid');
}
