import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { codexControllerHookFailure, codexHookFailure } from './hook-adapters.mjs';

const loaderBytes = readFileSync(new URL('./prompt-bootstrap-loader.mjs', import.meta.url));
const CONTROLLER_DESCRIPTOR_ENV = 'META_FRAMEWORK_CONTROLLER_DESCRIPTOR';
export const SOURCE_BOOTSTRAP_LOADER_DIGEST =
  `sha256:${createHash('sha256').update(loaderBytes).digest('hex')}`;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function bufferedHookCommand(mode, profile, { sessionEnd = false } = {}) {
  const fallback = sessionEnd ? '' : codexHookFailure(profile);
  const controllerFallback = sessionEnd ? '' : codexControllerHookFailure();
  const sourceDigest = SOURCE_BOOTSTRAP_LOADER_DIGEST.slice(7);
  const script = `const c=require("node:child_process"),f=require("node:fs"),p=require("node:path"),h=require("node:crypto"),i=f.readFileSync(0),k=Object.hasOwn(process.env,"${CONTROLLER_DESCRIPTOR_ENV}"),x=k?${JSON.stringify(controllerFallback)}:${JSON.stringify(fallback)},e=${sessionEnd};let o=x;try{const g=c.spawnSync("git",["rev-parse",${mode === 'source' ? '"--path-format=absolute","--git-common-dir"' : '"--show-toplevel"'}],{cwd:process.cwd(),encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2000});if(g.status!==0||g.signal)throw 0;const r=f.realpathSync(g.stdout.trim());let t,a;if(${mode === 'source'}){t=p.join(r,"meta-framework","prompt-runtime","v1","loaders","${sourceDigest}.mjs");const n=f.constants.O_NOFOLLOW,s=f.lstatSync(t),u=typeof process.getuid==="function"?process.getuid():null;if(!Number.isInteger(n)||n===0||!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&511)!==256||(u!==null&&s.uid!==u))throw 0;let d,b;try{d=f.openSync(t,f.constants.O_RDONLY|n);const j=f.fstatSync(d);if(!j.isFile()||j.nlink!==1||j.dev!==s.dev||j.ino!==s.ino||j.size!==s.size||(j.mode&511)!==256||(u!==null&&j.uid!==u))throw 0;b=f.readFileSync(d);const z=f.lstatSync(t);if(z.isSymbolicLink()||z.nlink!==1||z.dev!==j.dev||z.ino!==j.ino||z.size!==j.size||(z.mode&511)!==256||(u!==null&&z.uid!==u))throw 0}finally{if(d!==undefined)f.closeSync(d)}if(h.createHash("sha256").update(b).digest("hex")!=="${sourceDigest}")throw 0;a=[t,"${profile}"]}else{t=p.join(r,"node_modules","meta-framework","bin","meta-framework.mjs");a=[t,"hook","--harness","codex","--profile","${profile}"]}const q=c.spawnSync(process.execPath,a,{input:i,stdio:["pipe","pipe","pipe"],timeout:${sessionEnd ? 2000 : 25000},maxBuffer:131072});if(q.status===0&&!q.signal&&q.stdout.length<=65536&&(e?q.stdout.length===0:q.stdout.length>0))o=q.stdout;else o=x}catch{o=x}if(o.length)process.stdout.write(o)`;
  const outer = `node -e ${shellQuote(script)} 2>/dev/null`;
  return sessionEnd ? `${outer} || :` :
    `${outer} || { if [ "\${${CONTROLLER_DESCRIPTOR_ENV}+x}" = x ]; then printf '%s' ${shellQuote(controllerFallback)}; else printf '%s' ${shellQuote(fallback)}; fi; }`;
}

export const SOURCE_HOOK_COMMAND = bufferedHookCommand('source', 'root');
export const CLIENT_HOOK_COMMAND = bufferedHookCommand('client', 'root');

function agentManifest(profile, name, description, sandboxMode, boundary) {
  return `# meta-framework-codex-agent:v1 profile=${profile}
name = "${name}"
description = "${description}"
sandbox_mode = "${sandboxMode}"
developer_instructions = """
Before task work or tool use, verify that developer context contains \`META-FRAMEWORK-AGENT-PROMPT 1\` followed by a JSON manifest with \`"harness":"codex"\` and \`"profile":"${profile}"\`. If it is missing or mismatched, stop without using tools and report the prompt-loading failure. Do not call \`agent-prompt\` when the matching envelope is present. ${boundary}
"""

[features]
multi_agent = false
`;
}

function commandHook(command, profile) {
  return Object.freeze({
    type: 'command',
    command,
    timeout: 30,
    additionalContextLimit: 0,
    statusMessage: `Loading the repository-pinned Meta Framework ${profile === 'qa' ? 'QA' : profile} profile`,
  });
}

function sessionEndHook(command) {
  return Object.freeze({
    type: 'command',
    command,
    timeout: 3,
    statusMessage: 'Retiring the Meta Framework prompt session pin',
  });
}

function rootHooks(mode) {
  return `${JSON.stringify({
    description: 'meta-framework-codex-integration:v3',
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear|compact',
          hooks: [commandHook(bufferedHookCommand(mode, 'root'), 'root')],
        },
      ],
      SubagentStart: [
        ['^meta_implementer$', 'implementer'],
        ['^meta_qa$', 'qa'],
        ['^meta_reviewer$', 'reviewer'],
        ['^meta_security$', 'security'],
      ].map(([matcher, profile]) => ({
        matcher,
        hooks: [commandHook(bufferedHookCommand(mode, profile), profile)],
      })),
      SessionEnd: [
        {
          matcher: 'other',
          hooks: [sessionEndHook(bufferedHookCommand(mode, 'root', { sessionEnd: true }))],
        },
      ],
    },
  }, null, 2)}\n`;
}

function integrationFiles(mode) {
  return Object.freeze({
    '.codex/hooks.json': rootHooks(mode),
    '.codex/agents/meta_implementer.toml': agentManifest(
      'implementer',
      'meta_implementer',
      'Use for one bounded implementation slice explicitly assigned by the Root Orchestrator. Do not use for independent review, security review, or task integration.',
      'workspace-write',
      'Never delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_qa.toml': agentManifest(
      'qa',
      'meta_qa',
      'Use to run predeclared non-destructive verification independently. Normal check artifacts are allowed; do not use for implementation or redefine acceptance.',
      'workspace-write',
      'Do not edit source, tests, configuration, or documentation; normal declared check artifacts are allowed. Never delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_reviewer.toml': agentManifest(
      'reviewer',
      'meta_reviewer',
      'Use for an independent review of a non-trivial completed change when the parent requests or framework policy requires the Reviewer gate. Do not use for implementation.',
      'read-only',
      'Never edit files, implement fixes, delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
    '.codex/agents/meta_security.toml': agentManifest(
      'security',
      'meta_security',
      'Use for an independent security and risk review when trust, permissions, external input, dependencies, or another framework security trigger applies.',
      'read-only',
      'Never edit files, implement mitigations, delegate, spawn another agent, broaden the assignment, or perform Root-owned task selection, integration, or closure.',
    ),
  });
}

export const CODEX_INTEGRATION_PATHS = Object.freeze([
  '.codex/hooks.json',
  '.codex/agents/meta_implementer.toml',
  '.codex/agents/meta_qa.toml',
  '.codex/agents/meta_reviewer.toml',
  '.codex/agents/meta_security.toml',
]);

export const CODEX_INTEGRATION_FILES = integrationFiles('client');
export const SOURCE_CODEX_INTEGRATION_FILES = integrationFiles('source');

export const CODEX_INTEGRATION_MARKERS = Object.freeze({
  '.codex/hooks.json': 'meta-framework-codex-integration:v3',
  '.codex/agents/meta_implementer.toml': 'meta-framework-codex-agent:v1 profile=implementer',
  '.codex/agents/meta_qa.toml': 'meta-framework-codex-agent:v1 profile=qa',
  '.codex/agents/meta_reviewer.toml': 'meta-framework-codex-agent:v1 profile=reviewer',
  '.codex/agents/meta_security.toml': 'meta-framework-codex-agent:v1 profile=security',
});

export const CODEX_INTEGRATION_LEGACY_MARKERS = Object.freeze({
  '.codex/hooks.json': Object.freeze(['meta-framework-codex-integration:v2']),
});
