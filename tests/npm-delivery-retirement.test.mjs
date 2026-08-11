import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = "tests/npm-delivery-retirement.test.mjs";
const TRANSITION_PATH = "readme/meta/copied-client-transition.md";
const LEGACY_MANIFEST_PATH = "readme/meta/legacy-copy-manifest-v1.json";
const LEGACY_COMMIT = "c90211b9a2cd888a1796dbd584384fd1f9eaa132";

const RETIRED_PATHS = Object.freeze([
  ".github/workflows/publish-core-latest.yml",
  "scripts/install-core.sh",
  "scripts/package-core.sh",
  "tests/project-onboarding-install.test.sh",
  "tests/support/mock-core-curl.sh",
  "tests/support/mock-project-skill-ln.sh",
  "tests/support/mock-project-skill-signal-cmp.sh",
  "tests/support/mock-task-recovery-skill-ln.sh",
  "tests/support/mock-task-recovery-signal-cmp.sh",
  "tests/task-recovery-install.test.sh",
  "readme/meta/framework-changelog.md",
]);

const LIVE_TREES = Object.freeze([
  ".agents",
  ".claude",
  ".codex",
  ".github",
  "bin",
  "lib",
  "prompts",
  "scripts",
  "readme/meta",
  "readme/project",
  "tests",
]);

const LIVE_FILES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "package-files.json",
  "readme/README.md",
  "readme/tasks/README.md",
  "readme/tasks/0023-npm-package-delivery-brief.md",
  "readme/decisions/0021-adopt-immutable-npm-framework-delivery.md",
]);

const RETIRED_RULES = Object.freeze([
  {
    id: "retired-artifact-path",
    pattern: /(?:\.github\/workflows\/publish-core-latest\.yml|scripts\/(?:install|package)-core\.sh|tests\/(?:project-onboarding-install|task-recovery-install)\.test\.sh|tests\/support\/mock-(?:core-curl|project-skill-(?:ln|signal-cmp)|task-recovery-skill-(?:ln|signal-cmp))\.sh)/u,
  },
  {
    id: "retired-archive-name",
    pattern: /ai-coding-meta-framework-core\.zip/u,
  },
  {
    id: "retired-moving-download",
    pattern: /releases\/download\/latest\//u,
  },
  {
    id: "retired-archive-environment",
    pattern: /FRAMEWORK_CORE_ARCHIVE/u,
  },
  {
    id: "retired-installer-inventory",
    pattern: /--print-expected-inventory/u,
  },
  {
    id: "retired-companion-bootstrap",
    pattern: /AGENTS\.framework\.md/u,
  },
  {
    id: "installed-changelog-seed",
    pattern: /readme\/meta\/framework-changelog\.md/u,
  },
  {
    id: "executable-curl-pipeline",
    pattern: /\bcurl[^\n|]{0,240}\|\s*(?:ba)?sh\b/iu,
  },
  {
    id: "external-release-mutation",
    pattern: /\bgh\s+(?:api|release)\b|\bnpm\s+publish\b|api\.github\.com\/repos\/[^\s"']+\/releases\b|\bgit\s+push\b[^\n]*(?:--delete|:refs\/tags)/iu,
  },
]);

const PACKAGE_INSTRUCTION_RULES = Object.freeze([
  {
    id: "source-tree-task-cli",
    pattern: /node\s+readme\/meta\/framework-data\/cli\.mjs/u,
  },
  {
    id: "unsafe-npm-script-invocation",
    pattern: /\bnpm run\s+(?!--ignore-scripts(?:\s|$))(?:(?:--silent)\s+)?meta(?:\s|$)/mu,
  },
  {
    id: "fetch-or-global-command",
    pattern: /^\s*(?:\$\s*)?(?:npx\s+|npm\s+(?:install|i)\s+(?:[^\n]*\s)?-g\b|npm\s+exec\s+--global\b)/mu,
  },
]);

function fromRoot(relativePath) {
  return path.join(ROOT, ...relativePath.split("/"));
}

async function read(relativePath) {
  return fs.readFile(fromRoot(relativePath), "utf8");
}

function exactKeys(candidate, keys, label) {
  assert.deepEqual(Object.keys(candidate).sort(), [...keys].sort(), label);
}

function isPackageInstruction(relativePath) {
  const instructionPath = [
    ".agents/",
    ".claude/",
    ".codex/",
    "prompts/",
    "readme/meta/",
  ].some((prefix) => relativePath.startsWith(prefix));
  return instructionPath && /\.(?:md|toml|ya?ml)$/u.test(relativePath);
}

function gitBlob(relativePath) {
  const result = spawnSync("git", ["show", LEGACY_COMMIT + ":" + relativePath], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    "cannot read reviewed legacy blob " + relativePath + ": " + result.stderr.toString("utf8"),
  );
  return result.stdout;
}

function scanLiveEntries(entries) {
  const findings = [];
  for (const entry of entries) {
    if (entry.path === SELF || entry.path === LEGACY_MANIFEST_PATH) continue;
    if (entry.kind !== "ordinary_file") {
      findings.push({ path: entry.path, rule: "non-ordinary-live-entry" });
      continue;
    }
    for (const rule of RETIRED_RULES) {
      const transitionException = entry.path === TRANSITION_PATH &&
        rule.id === "installed-changelog-seed";
      if (!transitionException && rule.pattern.test(entry.text)) {
        findings.push({ path: entry.path, rule: rule.id });
      }
    }
    if (isPackageInstruction(entry.path)) {
      for (const rule of PACKAGE_INSTRUCTION_RULES) {
        if (rule.pattern.test(entry.text)) {
          findings.push({ path: entry.path, rule: rule.id });
        }
      }
    }
  }
  return findings;
}

async function addLivePath(relativePath, entries, required) {
  let stats;
  try {
    stats = await fs.lstat(fromRoot(relativePath));
  } catch (error) {
    if (!required && error?.code === "ENOENT") return;
    throw error;
  }
  if (stats.isDirectory()) {
    const names = (await fs.readdir(fromRoot(relativePath))).sort();
    for (const name of names) {
      await addLivePath(relativePath + "/" + name, entries, true);
    }
    return;
  }
  if (!stats.isFile()) {
    entries.push({ path: relativePath, kind: "non-ordinary", text: "" });
    return;
  }
  const text = await read(relativePath);
  assert.doesNotMatch(text, /\0/u, relativePath + " is not a text live surface");
  entries.push({ path: relativePath, kind: "ordinary_file", text });
}

async function collectLiveEntries() {
  const entries = [];
  for (const relativePath of LIVE_TREES) {
    await addLivePath(relativePath, entries, false);
  }
  for (const relativePath of LIVE_FILES) {
    await addLivePath(relativePath, entries, true);
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

test("the exact ZIP and copied-core delivery surface is retired", async () => {
  assert.equal(RETIRED_PATHS.length, 11);
  assert.equal(new Set(RETIRED_PATHS).size, RETIRED_PATHS.length);
  for (const relativePath of RETIRED_PATHS) {
    await assert.rejects(
      fs.lstat(fromRoot(relativePath)),
      (error) => error?.code === "ENOENT",
      relativePath + " must be deleted",
    );
  }
  await assert.rejects(
    fs.lstat(fromRoot("dist")),
    (error) => error?.code === "ENOENT",
    "retired /dist output directory must be absent",
  );

  const gitignore = await read(".gitignore");
  assert.doesNotMatch(gitignore, /^\/dist\/$/mu);

  const packageManifest = JSON.parse(await read("package.json"));
  assert.deepEqual(packageManifest.files, [
    "bin/",
    "lib/",
    "package-files.json",
    "prompts/",
    "readme/meta/",
  ]);
  assert.equal(
    Object.keys(packageManifest.scripts ?? {}).some((name) => /copied|legacy|cleanup|transition/iu.test(name)),
    false,
    "transition guidance must not gain an npm cleanup command",
  );

  const inventory = JSON.parse(await read("package-files.json"));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(new Set(inventory.files).size, inventory.files.length);
  assert.deepEqual(inventory.files, [...inventory.files].sort());
  assert.ok(inventory.files.includes(TRANSITION_PATH));
  assert.ok(inventory.files.includes(LEGACY_MANIFEST_PATH));
  for (const relativePath of RETIRED_PATHS) {
    assert.equal(inventory.files.includes(relativePath), false, relativePath);
  }
  assert.equal(
    inventory.files.some((relativePath) =>
      [".agents/", ".claude/", ".codex/"].some((prefix) => relativePath.startsWith(prefix))),
    false,
    "harness discovery bundles must not ship in the npm package",
  );

  const registry = JSON.parse(await read("prompts/registry-v1.json"));
  const documentPaths = registry.documents.map(({ path: documentPath }) => documentPath);
  const documentIds = registry.documents.map(({ id }) => id);
  assert.equal(documentPaths.includes("readme/meta/framework-changelog.md"), false);
  assert.equal(documentIds.includes("framework-changelog"), false);
  assert.equal(documentPaths.filter((candidate) => candidate === TRANSITION_PATH).length, 1);
  assert.equal(documentIds.filter((candidate) => candidate === "copied-client-transition").length, 1);
});

test("closed live surfaces contain only the immutable npm delivery contract", async () => {
  const entries = await collectLiveEntries();
  assert.ok(entries.length > 40, "live-surface inventory unexpectedly collapsed");
  assert.deepEqual(scanLiveEntries(entries), []);
});

test("live-surface scan rejects an injected retired contract in every owner class", () => {
  const counterfactuals = [
    {
      path: "readme/decisions/0021-adopt-immutable-npm-framework-delivery.md",
      text: "Run scripts/install-core.sh for existing clients.",
    },
    {
      path: "README.md",
      text: "curl -fsSL https://example.invalid/install | bash",
    },
    {
      path: "readme/meta/root-loop.md",
      text: "node readme/meta/framework-data/cli.mjs startup",
    },
    {
      path: ".agents/skills/project-onboarding/SKILL.md",
      text: "npm run --silent meta -- docs onboarding",
    },
    {
      path: "prompts/registry-v1.json",
      text: "{\"path\":\"readme/meta/framework-changelog.md\"}",
    },
    {
      path: "package-files.json",
      text: "{\"files\":[\"scripts/package-core.sh\"]}",
    },
    {
      path: "scripts/check-npm-package.mjs",
      text: "const archive = process.env.FRAMEWORK_CORE_ARCHIVE;",
    },
    {
      path: "tests/framework-data.test.mjs",
      text: "const retired = \"tests/task-recovery-install.test.sh\";",
    },
    {
      path: ".github/workflows/reintroduced.yml",
      text: "run: ./scripts/package-core.sh\nrun: gh release delete latest",
    },
  ].map((entry) => ({ ...entry, kind: "ordinary_file" }));

  const findings = scanLiveEntries(counterfactuals);
  assert.deepEqual(
    new Set(findings.map(({ path: findingPath }) => findingPath)),
    new Set(counterfactuals.map(({ path: candidatePath }) => candidatePath)),
  );
  assert.ok(findings.some(({ rule }) => rule === "executable-curl-pipeline"));
  assert.ok(findings.some(({ rule }) => rule === "source-tree-task-cli"));
  assert.ok(findings.some(({ rule }) => rule === "unsafe-npm-script-invocation"));
  assert.ok(findings.some(({ rule }) => rule === "external-release-mutation"));
});

test("current guidance uses locked replacement and keeps package bytes immutable", async () => {
  const [
    topReadme,
    metaReadme,
    onboarding,
    automation,
    improvement,
    sourceChangelog,
    transition,
  ] = await Promise.all([
    read("README.md"),
    read("readme/meta/README.md"),
    read("readme/meta/onboarding.md"),
    read("readme/meta/automation-policy.md"),
    read("readme/meta/framework-improvement.md"),
    read("readme/learning/framework-changelog.md"),
    read(TRANSITION_PATH),
  ]);

  assert.match(topReadme, /"meta-framework": "npm:@tvald\/meta-framework@<exact-version>"/u);
  assert.match(topReadme, /"meta": "node \.\/node_modules\/meta-framework\/bin\/meta-framework\.mjs"/u);
  assert.match(topReadme, /npm ci --ignore-scripts/u);
  assert.match(topReadme, /npm run --ignore-scripts --silent meta -- project preflight/u);
  assert.match(topReadme, /(?:issue|pull request)[\s\S]{0,240}(?:upstream|source repository)/iu);
  assert.match(topReadme, /Replace the package by changing the exact alias and lockfile together/u);
  const normalizedReadme = topReadme.replace(/\\\r?\n\s*/gu, " ").replace(/\s+/gu, " ").trim();
  assert.ok(normalizedReadme.includes(
    "npm install --package-lock-only --ignore-scripts --save-exact " +
    "'meta-framework@npm:@tvald/meta-framework@<replacement-version>'",
  ));
  assert.match(topReadme, /restoring both the prior manifest and prior lockfile/iu);

  const packageGuidance = [metaReadme, onboarding, automation, improvement].join("\n");
  assert.match(packageGuidance, /installed (?:client|package)[\s\S]{0,220}(?:immutable|must not edit|does not edit)/iu);
  assert.match(packageGuidance, /report[\s\S]{0,160}(?:issue|defect)[\s\S]{0,160}upstream/iu);
  assert.match(packageGuidance, /readme\/learning\/framework-changelog\.md/u);
  assert.doesNotMatch(packageGuidance, /readme\/meta\/framework-changelog\.md/u);

  const changelogPreamble = sourceChangelog.split(/^## 20\d\d-/mu)[0];
  assert.match(changelogPreamble, /framework-source repository/iu);
  assert.match(changelogPreamble, /immutable npm\s+clients[\s\S]{0,200}(?:upstream fixes|exact dependency)[\s\S]{0,100}replacement/iu);
  assert.doesNotMatch(changelogPreamble, /readme\/meta\/framework-changelog\.md/u);

  const normalizedTransition = transition.replace(/\\\r?\n\s*/gu, " ").replace(/\s+/gu, " ").trim();
  for (const command of [
    "npm install --package-lock-only --ignore-scripts --save-exact 'meta-framework@npm:@tvald/meta-framework@<exact-version>'",
    "npm ci --ignore-scripts",
    "npm run --ignore-scripts --silent meta -- project --version",
    "npm run --ignore-scripts --silent meta -- project preflight",
    "npm run --ignore-scripts --silent meta -- project init",
    "npm run --ignore-scripts --silent meta -- tasks doctor",
    "npm run --ignore-scripts --silent meta -- tasks startup",
  ]) {
    assert.ok(normalizedTransition.includes(command), "missing transition command: " + command);
  }
  assert.match(transition, /legacy-copy-manifest-v1\.json/u);
  assert.match(transition, new RegExp(LEGACY_COMMIT, "u"));
  assert.match(transition, /guidance[\s\S]{0,80}not a cleanup[\s\S]{0,80}executable/iu);
  assert.match(transition, /explicit transition intent/iu);
  assert.match(transition, /whole-file[\s\S]{0,100}(?:match|digest)|expected bytes/iu);
  assert.match(transition, /per-path dry run/iu);
  assert.match(transition, /backup|recoverable/iu);
  assert.match(transition, /(?:abort|stop)[\s\S]{0,120}ambigu/iu);
  for (const [unsafeCase, pattern] of new Map([
    ["same-name", /same-name/iu],
    ["same-byte", /same-byte/iu],
    ["modified", /modified/iu],
    ["symlink", /symlink/iu],
    ["hardlink", /hardlink|hard link/iu],
    ["directory", /directory/iu],
    ["mixed-version", /mixed[- ](?:version|snapshot)/iu],
  ])) {
    assert.match(transition, pattern, unsafeCase);
  }
  for (const preserved of [
    "AGENTS.md",
    "CLAUDE.md",
    "package.json",
    "package-lock.json",
    "readme/README.md",
    "readme/tasks/",
    "readme/decisions/",
    "readme/quality/",
    "readme/threat-models/",
  ]) {
    assert.match(transition, new RegExp(preserved.replaceAll(".", "\\."), "u"), preserved);
  }
  assert.match(
    transition,
    /(?:do not|never)[\s\S]{0,160}(?:delete|mutate)[\s\S]{0,160}remote[\s\S]{0,100}(?:release|tag)|remote[\s\S]{0,100}(?:release|tag)[\s\S]{0,160}(?:do not|never)[\s\S]{0,100}(?:delete|mutate)/iu,
  );
  assert.doesNotMatch(transition, /\brm\s+-rf\b|find[^\n]{0,160}-delete\b/iu);
});

test("legacy ownership manifest is closed, inert, and bound to reviewed bytes", async () => {
  const manifest = JSON.parse(await read(LEGACY_MANIFEST_PATH));
  exactKeys(manifest, [
    "schemaVersion", "snapshot", "digestAlgorithm", "aggregate", "files",
  ], "legacy manifest top-level keys");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.digestAlgorithm, "sha256");

  exactKeys(manifest.snapshot, [
    "kind", "commit", "committedAt", "description", "derivation",
  ], "legacy manifest snapshot keys");
  assert.equal(manifest.snapshot.kind, "git_commit");
  assert.equal(manifest.snapshot.commit, LEGACY_COMMIT);
  assert.equal(manifest.snapshot.committedAt, "2026-08-11T08:26:26Z");
  assert.ok(typeof manifest.snapshot.description === "string" && manifest.snapshot.description.length > 20);
  assert.ok(typeof manifest.snapshot.derivation === "string" && manifest.snapshot.derivation.length > 20);

  exactKeys(manifest.aggregate, ["fileCount", "totalBytes"], "legacy manifest aggregate keys");
  assert.equal(manifest.aggregate.fileCount, 49);
  assert.equal(manifest.aggregate.totalBytes, 346611);
  assert.equal(manifest.files.length, 49);
  assert.equal(new Set(manifest.files.map(({ path: filePath }) => filePath)).size, 49);
  assert.deepEqual(
    manifest.files.map(({ path: filePath }) => filePath),
    manifest.files.map(({ path: filePath }) => filePath).sort(),
  );
  assert.equal(
    manifest.files.reduce((total, { bytes }) => total + bytes, 0),
    manifest.aggregate.totalBytes,
  );

  for (const entry of manifest.files) {
    exactKeys(entry, ["path", "type", "mode", "bytes", "sha256"], "legacy file keys");
    assert.match(entry.path, /^(?!\/)(?!\.\.?(?:\/|$))(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\)[\x20-\x7e]+$/u);
    assert.equal(path.posix.normalize(entry.path), entry.path);
    assert.equal(entry.type, "ordinary_file");
    assert.equal(entry.mode, "0644");
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u);

    let reviewedBytes = gitBlob(entry.path);
    if (entry.path === "AGENTS.md") {
      const markerOffset = reviewedBytes.indexOf(Buffer.from("## Operating Contract", "utf8"));
      assert.ok(markerOffset > 0, "legacy AGENTS.md packaging boundary is missing");
      reviewedBytes = reviewedBytes.subarray(0, markerOffset);
    }
    assert.equal(reviewedBytes.length, entry.bytes, entry.path + " byte count");
    assert.equal(
      createHash("sha256").update(reviewedBytes).digest("hex"),
      entry.sha256,
      entry.path + " SHA-256",
    );
  }

  assert.deepEqual(
    manifest.files.find(({ path: filePath }) => filePath === "AGENTS.md"),
    {
      path: "AGENTS.md",
      type: "ordinary_file",
      mode: "0644",
      bytes: 1778,
      sha256: "82ecf499a271bedec254ea3441c097afa486e453b33ec83515e4c72bffde0a52",
    },
  );
});

test("historical retirement evidence remains intact and non-executable", async () => {
  const [decision, quality, taskBrief, archive, terminalTask] = await Promise.all([
    read("readme/decisions/0012-add-fail-closed-piped-installer.md"),
    read("readme/quality/2026-07-14-piped-core-installer.md"),
    read("readme/tasks/0007-core-package-script-brief.md"),
    read("readme/archive/framework-changelog-2026.md"),
    read("readme/tasks/store/records/0000/T-0010.json"),
  ]);
  assert.match(decision, /^Status: Accepted$/mu);
  assert.match(decision, /scripts\/install-core\.sh/u);
  assert.match(quality, /scripts\/install-core\.sh/u);
  assert.match(taskBrief, /scripts\/package-core\.sh/u);
  assert.match(archive, /curl -fsSL URL \| bash/u);
  const task = JSON.parse(terminalTask);
  assert.equal(task.id, "T-0010");
  assert.equal(task.status, "done");
  assert.match(task.outcome, /curl -fsSL/u);
});

test("superseded delivery decisions point to Decision 0021 without losing their bodies", async () => {
  const sentinels = new Map([
    ["0004-package-framework-as-addon.md", /readme\/meta\//u],
    ["0005-pilot-optional-agent-adapters.md", /\.claude\/agents/u],
    ["0008-adopt-durable-task-orchestration.md", /readme\/tasks\/README\.md/u],
    ["0009-authorize-bounded-project-delegation.md", /standing permission/iu],
    ["0010-automate-portable-core-archive.md", /scripts\/package-core\.sh/u],
    ["0011-publish-moving-latest-core-release.md", /scripts\/package-core\.sh/u],
    ["0012-add-fail-closed-piped-installer.md", /scripts\/install-core\.sh/u],
    ["0013-streamline-installer-invocation.md", /curl -fsSL/iu],
    ["0016-adopt-adapters-and-skip-pilot-disposition.md", /skip-Pilot/iu],
    ["0017-ship-blank-framework-changelog-seed.md", /readme\/meta\/framework-changelog\.md/u],
    ["0018-adopt-node-structured-task-store.md", /readme\/tasks\/store\/control\.json/u],
    ["0019-adopt-guarded-project-onboarding-skill.md", /\.agents\/skills\/project-onboarding\/SKILL\.md/u],
    ["0020-adopt-guarded-task-recovery-skill.md", /\.agents\/skills\/task-recovery\/SKILL\.md/u],
  ]);

  for (const [fileName, sentinel] of sentinels) {
    const decision = await read("readme/decisions/" + fileName);
    assert.match(decision, /^Status: Accepted$/mu, fileName);
    const supersededBy = decision.match(/\nSuperseded by:\n\n([\s\S]*?)(?=\n## )/u)?.[1];
    assert.ok(supersededBy, fileName + " has no Superseded by section");
    assert.match(
      supersededBy,
      /\[Decision 0021\]\(0021-adopt-immutable-npm-framework-delivery\.md\)/u,
      fileName,
    );
    const body = decision.slice(decision.indexOf("\n## Context\n"));
    assert.match(body, sentinel, fileName + " historical body sentinel");
  }
});
