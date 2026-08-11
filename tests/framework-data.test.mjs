import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const STORE_MODULE = new URL("../readme/meta/framework-data/store.mjs", import.meta.url);
const FRAMEWORK_CHECKS_MODULE = new URL("../readme/meta/framework-data/framework-checks.mjs", import.meta.url);
const PACKAGE_INVENTORY = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, "package-files.json"), "utf8")).files;

function installedBinary(root) {
  return path.join(root, "node_modules", "meta-framework", "bin", "meta-framework.mjs");
}

function run(cwd, args, expectedStatus = 0) {
  return runWithCli(installedBinary(cwd), cwd, ["tasks", ...args], expectedStatus);
}

function runWithCli(cli, cwd, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.signal, null, `command received signal ${result.signal}`);
  assert.equal(result.status, expectedStatus, `unexpected status for ${args.join(" ")}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function json(cwd, args, expectedStatus = 0) {
  const result = run(cwd, args, expectedStatus);
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr);
  return { ...result, value: JSON.parse(result.stdout) };
}

async function makeRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "framework-data-test-"));
  await fs.mkdir(path.join(root, "readme", "tasks"), { recursive: true });
  await fs.mkdir(path.join(root, "readme", "meta", "templates"), { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), "# Agent Instructions\n");
  await fs.writeFile(path.join(root, "readme", "README.md"), `# Project State

## Maintenance Cadence

- Last maintenance pass: 2026-08-11
- Legacy repository-changing completion baseline: 0
- Next trigger: 2026-09-10 or 10 repository-changing completions
`);
  await fs.writeFile(path.join(root, "readme", "tasks", "README.md"), `# Task Store

Use \`node readme/meta/framework-data/cli.mjs doctor\` and
\`node readme/meta/framework-data/cli.mjs startup\`.
`);
  const templates = [
    "assumptions.md", "decision-record.md", "incident-note.md", "project-brief.md",
    "project-context.md", "project-state.md", "quality-record.md", "standards.md",
    "task-brief.md", "task-catalog.md", "task-notes.md", "threat-model-card.md",
  ];
  await Promise.all(templates.map((name) => fs.writeFile(
    path.join(root, "readme", "meta", "templates", name), `# ${name}\n`,
  )));
  const processes = [
    "agent-definitions.md", "automation-policy.md", "development-standards.md",
    "framework-improvement.md", "knowledge-ingestion.md", "knowledge-management.md",
    "onboarding.md", "quality-system.md", "resumption-protocol.md", "root-loop.md",
    "workflow-routing.md",
  ];
  await Promise.all(processes.map((name) => fs.writeFile(
    path.join(root, "readme", "meta", name), `# ${name}\n`,
  )));
  await fs.writeFile(path.join(root, "readme", "meta", "framework-changelog.md"),
    "# Framework Changelog\n\n<!-- Local framework entries go below this line. -->\n");
  await fs.writeFile(path.join(root, "package.json"), `${JSON.stringify({
    name: "framework-data-client-fixture",
    private: true,
    dependencies: { "meta-framework": "npm:@tvald/meta-framework@1.0.0" },
  }, null, 2)}\n`);
  await fs.writeFile(path.join(root, "package-lock.json"), `${JSON.stringify({
    name: "framework-data-client-fixture",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "framework-data-client-fixture",
        dependencies: { "meta-framework": "npm:@tvald/meta-framework@1.0.0" },
      },
      "node_modules/meta-framework": {
        name: "@tvald/meta-framework",
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/@tvald/meta-framework/-/meta-framework-1.0.0.tgz",
        integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
      },
    },
  }, null, 2)}\n`);
  const packageRoot = path.join(root, "node_modules", "meta-framework");
  for (const relativePath of PACKAGE_INVENTORY) {
    const source = path.join(SOURCE_ROOT, ...relativePath.split("/"));
    const destination = path.join(packageRoot, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    const info = await fs.stat(source);
    await fs.chmod(destination, info.mode & 0o777);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

async function removeRepository(root) {
  await fs.rm(root, { recursive: true, force: true });
}

function taskPath(root, id) {
  const number = Number(id.slice(2));
  const shard = String(Math.floor((number - 1) / 1000)).padStart(4, "0");
  return path.join(root, "readme", "tasks", "store", "records", shard, `${id}.json`);
}

test("version, help, and preflight expose the dependency-free runtime contract", async () => {
  const root = await makeRepository();
  try {
    const version = json(root, ["--version"]).value;
    assert.equal(version.package.version, "1.0.0");
    assert.deepEqual(version.taskCli.readableStoreSchemaVersions, [1]);
    const help = run(root, ["--help"]).stdout;
    assert.match(help, /task add --outcome/u);
    assert.match(run(root, ["task", "add", "--help"]).stdout, /--expected-store-digest/u);
    assert.match(help, /migrate format1/u);
    const preflight = json(root, ["preflight"]).value;
    assert.equal(preflight.compatible, true);
    assert.ok(preflight.nodeMajor >= 22);
    assert.equal(preflight.gitWorktree, true);
    assert.equal(preflight.disposition, "ready_to_initialize");
  } finally {
    await removeRepository(root);
  }
});

test("preflight pins shipped schema bytes", async () => {
  const root = await makeRepository();
  try {
    await fs.appendFile(path.join(root, "node_modules", "meta-framework", "readme", "meta",
      "framework-data", "schemas", "task-v1.schema.json"), "\n");
    const result = run(root, ["preflight"], 1);
    assert.match(result.stderr, /SCHEMA_FILES/u);
  } finally {
    await removeRepository(root);
  }
});

test("preflight rejects symbolic documentation ancestors without touching their targets", async () => {
  for (const ancestor of ["readme", "readme/tasks"]) {
    for (const recognized of [false, true]) {
      const root = await makeRepository();
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "framework-preflight-outside-"));
      try {
        const target = path.join(outside, ancestor === "readme" ? "readme" : "tasks");
        await fs.mkdir(target, { recursive: true });
        await fs.writeFile(path.join(target, "outside-marker.txt"), "must remain unchanged\n");
        if (recognized) {
          if (ancestor === "readme") {
            await fs.mkdir(path.join(target, "tasks"), { recursive: true });
            await fs.writeFile(path.join(target, "README.md"), "# Project State\n");
            await fs.writeFile(path.join(target, "tasks", "README.md"),
              "# Task Store\n\nUse `node readme/meta/framework-data/cli.mjs doctor`.\n");
          } else {
            await fs.writeFile(path.join(target, "README.md"),
              "# Task Store\n\nUse `node readme/meta/framework-data/cli.mjs doctor`.\n");
          }
        }
        if (ancestor === "readme") {
          await fs.rm(path.join(root, "readme"), { recursive: true });
          await fs.symlink(target, path.join(root, "readme"));
        } else {
          await fs.rm(path.join(root, "readme", "tasks"), { recursive: true });
          await fs.symlink(target, path.join(root, "readme", "tasks"));
        }
        const before = await fs.readFile(path.join(target, "outside-marker.txt"), "utf8");
        const result = run(root, ["preflight"], 1);
        assert.match(result.stderr, /PATH_UNSAFE/u);
        assert.equal(await fs.readFile(path.join(target, "outside-marker.txt"), "utf8"), before);
        await assert.rejects(fs.lstat(path.join(target, "store")), { code: "ENOENT" });
      } finally {
        await removeRepository(root);
        await fs.rm(outside, { recursive: true, force: true });
      }
    }
  }
});

test("preflight reports prepared and malformed state and rejects unsupported runtime", async () => {
  const prepared = await makeRepository();
  try {
    await fs.writeFile(path.join(prepared, "readme", "tasks", ".framework-data-init-interrupted"),
      "prepared\n");
    assert.equal(json(prepared, ["preflight"]).value.disposition, "prepared");
  } finally {
    await removeRepository(prepared);
  }

  const malformed = await makeRepository();
  try {
    json(malformed, ["init"]);
    await fs.writeFile(path.join(malformed, "readme", "tasks", "store", "control.json"), "{}\n");
    const result = json(malformed, ["preflight"]);
    assert.equal(result.value.disposition, "malformed");
    assert.equal(result.value.integrity, "invalid");
  } finally {
    await removeRepository(malformed);
  }

  const unsupported = await makeRepository();
  try {
    const binary = installedBinary(unsupported);
    const cliUrl = pathToFileURL(binary).href;
    const script = `
      Object.defineProperty(process.versions, "node", { value: "21.0.0" });
      process.argv = [process.execPath, ${JSON.stringify(binary)}, "tasks", "preflight"];
      await import(${JSON.stringify(cliUrl)});
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: unsupported,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /NODE_UNSUPPORTED/u);
    await assert.rejects(fs.lstat(path.join(unsupported, "readme", "tasks", "store")),
      { code: "ENOENT" });
  } finally {
    await removeRepository(unsupported);
  }
});

test("doctor rejects duplicate, unknown, noncanonical, oversized, and unsupported control records", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const control = path.join(root, "readme", "tasks", "store", "control.json");
    const original = await fs.readFile(control, "utf8");

    await fs.writeFile(control, '{"schemaVersion":1,"schemaVersion":1,"recordVersion":1,"pause":null}\n');
    assert.equal(json(root, ["doctor"], 1).value.error.code, "JSON_NONCANONICAL");

    await fs.writeFile(control, `${JSON.stringify({ schemaVersion: 1, recordVersion: 1, pause: null, typo: true }, null, 2)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "SCHEMA_INVALID");

    await fs.writeFile(control, JSON.stringify({ schemaVersion: 1, recordVersion: 1, pause: null }));
    assert.equal(json(root, ["doctor"], 1).value.error.code, "JSON_NONCANONICAL");

    await fs.writeFile(control, `${"x".repeat(70_000)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "RECORD_SIZE");

    await fs.writeFile(control, `${JSON.stringify({ schemaVersion: 2, recordVersion: 1, pause: null }, null, 2)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "SCHEMA_UNSUPPORTED");

    await fs.writeFile(control, original);
    const hardLink = path.join(root, "control-hardlink.json");
    await fs.link(control, hardLink);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "PATH_UNSAFE");
    await fs.unlink(hardLink);
    await fs.writeFile(control, Buffer.from([0xc3, 0x28]));
    assert.equal(json(root, ["doctor"], 1).value.error.code, "UTF8_INVALID");
    await fs.writeFile(control, original);
    assert.equal(json(root, ["doctor"]).value.ok, true);
  } finally {
    await removeRepository(root);
  }
});

test("semantic lifecycle enforces CAS, digest, terminal visibility, filters, pause, and stale cursors", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    await fs.writeFile(path.join(root, "readme", "tasks", "0001-note.md"), "# Task one\n");
    const added = json(root, [
      "task", "add",
      "--outcome", "Deliver task one",
      "--authority-reference", "User instruction, 2026-08-11",
      "--accepted-date", "2026-08-11",
      "--status", "ready",
      "--route", "quick_change",
      "--risk", "high",
      "--next-safe-action", "Run the focused check",
      "--detail", "Notes=readme/tasks/0001-note.md",
    ]).value;
    assert.equal(added.data.id, "T-0001");
    assert.equal(added.data.recordVersion, 1);

    const candidates = json(root, ["task", "candidates"]).value;
    assert.equal(candidates.meta.total, 1);
    const staleDigest = `${"sha256:"}${"0".repeat(64)}`;
    assert.match(run(root, [
      "task", "select", "T-0001",
      "--expected-record-version", "1",
      "--expected-store-digest", staleDigest,
    ], 4).stderr, /STALE_STORE/u);

    const selected = json(root, [
      "task", "select", "T-0001",
      "--expected-record-version", "1",
      "--expected-store-digest", candidates.meta.storeDigest,
    ]).value;
    assert.equal(selected.data.status, "active");
    assert.match(run(root, [
      "task", "checkpoint", "T-0001",
      "--expected-record-version", "1",
      "--status", "needs_verification",
    ], 4).stderr, /STALE_RECORD/u);

    const checkpoint = json(root, [
      "task", "checkpoint", "T-0001",
      "--expected-record-version", "2",
      "--status", "needs_verification",
      "--next-safe-action", "Inspect the final output",
    ]).value;
    const closed = json(root, [
      "task", "close", "T-0001",
      "--expected-record-version", String(checkpoint.data.recordVersion),
      "--status", "done",
      "--completed-at", "2026-08-11",
      "--repository-changed", "true",
      "--evidence", "Commit abc1234",
    ]).value;
    assert.equal(closed.data.completion.repositoryChanged, true);

    const defaultList = json(root, ["task", "list"]).value;
    assert.equal(defaultList.meta.total, 0);
    assert.equal(defaultList.meta.omittedTerminal, 1);
    assert.equal(json(root, ["task", "get", "T-0001"]).value.data.status, "done");
    const maintenance = json(root, [
      "task", "list", "--all",
      "--repository-changed", "true",
      "--completed-after", "2026-08-10",
    ]).value;
    assert.equal(maintenance.meta.total, 1);

    for (let number = 2; number <= 4; number += 1) {
      json(root, [
        "task", "add",
        "--outcome", `Deliver task ${number}`,
        "--authority-reference", "User instruction, 2026-08-11",
        "--status", "ready",
        "--route", "quick_change",
        "--risk", "low",
      ]);
    }
    const bounded = json(root, ["task", "list", "--max-bytes", "10000"]).value;
    assert.equal(bounded.meta.byteLimit, 10000);
    assert.ok(bounded.meta.emittedBytes <= 10000);
    const firstPage = json(root, ["task", "list", "--limit", "1"]).value;
    assert.equal(firstPage.meta.truncated, true);
    assert.ok(firstPage.meta.nextCursor);
    json(root, [
      "task", "add",
      "--outcome", "Deliver task five",
      "--authority-reference", "User instruction, 2026-08-11",
      "--status", "ready",
      "--route", "quick_change",
      "--risk", "low",
    ]);
    assert.match(run(root, [
      "task", "list", "--limit", "1", "--cursor", firstPage.meta.nextCursor,
    ], 4).stderr, /CURSOR_STALE/u);

    const beforePause = json(root, ["doctor"]).value;
    const paused = json(root, [
      "pause",
      "--expected-record-version", "1",
      "--expected-store-digest", beforePause.storeDigest,
      "--reason", "Owner requested a pause",
      "--source", "User instruction",
    ]).value;
    assert.equal(paused.data.pause.reason, "Owner requested a pause");
    assert.equal(json(root, ["task", "candidates"]).value.meta.total, 0);
    assert.equal(json(root, ["resume", "--expected-record-version", "2"]).value.data.pause, null);

    const unframed = json(root, [
      "task", "add",
      "--outcome", "Unframed intake",
      "--authority-reference", "User instruction, 2026-08-11",
    ]).value.data;
    const amended = json(root, [
      "task", "amend", unframed.id,
      "--expected-record-version", "1",
      "--outcome", "Framed intake",
      "--authority-reference", "User amendment, 2026-08-11",
      "--route", "initiative",
      "--risk", "medium",
    ]).value.data;
    assert.equal(amended.taskRevision, 2);
    assert.equal(amended.route, "initiative");
    assert.equal(amended.risk, "medium");
    const reframed = json(root, [
      "task", "amend", unframed.id,
      "--expected-record-version", String(amended.recordVersion),
      "--outcome", "Reassess framed intake",
      "--authority-reference", "Second amendment, 2026-08-11",
    ]).value.data;
    assert.equal(reframed.taskRevision, 3);
    assert.equal(reframed.route, "unrouted");
    assert.equal(reframed.risk, null);
  } finally {
    await removeRepository(root);
  }
});

test("unsafe text and detail paths are rejected before writes", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    assert.match(run(root, [
      "task", "add",
      "--outcome", "unsafe\u001b[31m",
      "--authority-reference", "User instruction",
    ], 1).stderr, /UNSAFE_TEXT/u);
    assert.match(run(root, [
      "task", "add",
      "--outcome", "Safe outcome",
      "--authority-reference", "User instruction",
      "--detail", "Bad=readme/tasks/../decisions/no.md",
    ], 1).stderr, /PATH_UNSAFE/u);
    assert.equal(json(root, ["doctor"]).value.taskCount, 0);
  } finally {
    await removeRepository(root);
  }
});

test("doctor rejects canonical graph/state corruption and symbolic task records", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    for (let number = 1; number <= 2; number += 1) {
      json(root, [
        "task", "add",
        "--outcome", `Task ${number}`,
        "--authority-reference", "User instruction",
        "--status", "ready",
        "--route", "quick_change",
        "--risk", "low",
      ]);
    }
    const first = taskPath(root, "T-0001");
    const second = taskPath(root, "T-0002");
    const firstRecord = JSON.parse(await fs.readFile(first, "utf8"));
    const secondRecord = JSON.parse(await fs.readFile(second, "utf8"));
    firstRecord.status = "active";
    firstRecord.recordVersion += 1;
    secondRecord.status = "active";
    secondRecord.recordVersion += 1;
    await fs.writeFile(first, `${JSON.stringify(firstRecord, null, 2)}\n`);
    await fs.writeFile(second, `${JSON.stringify(secondRecord, null, 2)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "STATE_INVALID");

    secondRecord.status = "ready";
    await fs.writeFile(second, `${JSON.stringify(secondRecord, null, 2)}\n`);
    assert.equal(json(root, ["doctor"]).value.ok, true);
    firstRecord.status = "pending";
    secondRecord.status = "pending";
    firstRecord.dependencies = ["T-0002"];
    secondRecord.dependencies = ["T-0001"];
    await fs.writeFile(first, `${JSON.stringify(firstRecord, null, 2)}\n`);
    await fs.writeFile(second, `${JSON.stringify(secondRecord, null, 2)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "DEPENDENCY_CYCLE");
    firstRecord.dependencies = [];
    secondRecord.dependencies = [];
    await fs.writeFile(first, `${JSON.stringify(firstRecord, null, 2)}\n`);
    await fs.writeFile(second, `${JSON.stringify(secondRecord, null, 2)}\n`);
    const backup = `${second}.backup`;
    await fs.rename(second, backup);
    await fs.symlink(path.basename(backup), second);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "PATH_UNSAFE");
  } finally {
    await removeRepository(root);
  }
});

function tableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function format1Fixture() {
  const header = tableRow([
    "ID", "Outcome", "Authority / Rev", "Status", "Depends On", "Route / Risk",
    "Approval Or Blocker", "Next Safe Action", "Details", "Result",
  ]);
  const separator = tableRow(Array(10).fill("---"));
  const activeRows = [];
  for (let number = 3; number <= 22; number += 1) {
    const id = `T-${String(number).padStart(4, "0")}`;
    const status = number <= 19 ? "Done" : number === 20 ? "Active" : "Pending";
    const outcome = number === 10 ? "Run `curl -fsSL … \\| bash` safely" : `Outcome ${number}`;
    const dependencies = number >= 21 ? "T-0020" : "None";
    activeRows.push(tableRow([
      id,
      outcome,
      "User instruction, 2026-08-11 / r1",
      status,
      dependencies,
      "Initiative / High",
      "None",
      status === "Active" ? "Finish migration" : "None",
      "None",
      status === "Done" ? `\`${number.toString(16).padStart(7, "0")}\`` : "Pending",
    ]));
  }
  const catalog = `# Task Catalog

- Format: 1
- Next task ID: T-0023
- Primary task: T-0020
- Scheduling: Active
- Global pause source or reason: None
- Archived task rows: [T-0001-T-0002](../archive/tasks/archive.md)

## Tasks

${header}
${separator}
${activeRows.join("\n")}

## Operating Contract

- Legacy fixture.
`;
  const archiveRows = [1, 2].map((number) => tableRow([
    `T-${String(number).padStart(4, "0")}`,
    `Outcome ${number}`,
    "User instruction, 2026-08-11 / r1",
    "Done",
    "None",
    "Initiative / High",
    "None",
    "None",
    `[Notes](000${number}-note.md)`,
    `\`${number.toString(16).padStart(7, "0")}\``,
  ]));
  const archive = `# Task Catalog Archive

## Distilled Index

| IDs | Count |
| --- | ---: |
| T-0001–T-0002 | 2 |

## Archived Rows

${header}
${separator}
${archiveRows.join("\n")}

`;
  return { catalog, archive };
}

async function makeMigrationRepository() {
  const root = await makeRepository();
  const fixture = format1Fixture();
  await fs.mkdir(path.join(root, "readme", "archive", "tasks"), { recursive: true });
  await fs.writeFile(path.join(root, "readme", "tasks", "README.md"), fixture.catalog);
  await fs.writeFile(path.join(root, "readme", "archive", "tasks", "archive.md"), fixture.archive);
  await fs.writeFile(path.join(root, "readme", "tasks", "0001-note.md"), "# One\n");
  await fs.writeFile(path.join(root, "readme", "tasks", "0002-note.md"), "# Two\n");
  return root;
}

test("Format 1 dry-run and atomic claim migrate T-0001 through T-0022", async () => {
  const root = await makeMigrationRepository();
  try {
    const args = [
      "migrate", "format1",
      "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md",
    ];
    const dry = json(root, [...args, "--dry-run"]).value;
    assert.equal(dry.report.taskCount, 22);
    assert.equal(dry.report.primaryTaskId, "T-0020");
    assert.equal(dry.report.transformations.find((item) => item.kind === "escaped-pipe-to-text").count, 1);
    assert.equal(dry.report.transformations.find((item) => item.kind === "archive-link-original-catalog-base").count, 2);
    assert.equal(dry.report.transformations.find((item) => item.kind === "scheduling-to-pause-control").count, 1);
    assert.equal(dry.report.transformations.find((item) => item.kind === "missing-pause-reason-defaulted").count, 0);
    const applied = json(root, [...args, "--apply", "--expected-source-digest", dry.sourceDigest]).value;
    assert.equal(applied.activation, "claimed-by-atomic-absent-directory-rename");
    assert.match(run(root, [...args, "--apply", "--expected-source-digest", dry.sourceDigest], 4).stderr,
      /DESTINATION_COLLISION/u);
    await fs.writeFile(path.join(root, "readme", "tasks", "README.md"),
      "# Task Store\n\nUse `node readme/meta/framework-data/cli.mjs doctor`.\n");
    assert.equal(json(root, ["doctor"]).value.taskCount, 22);
    const defaultList = json(root, ["task", "list"]).value;
    assert.equal(defaultList.meta.total, 3);
    assert.equal(defaultList.meta.omittedTerminal, 19);
    const exported = json(root, ["export", "--limit", "50"]).value;
    assert.equal(exported.meta.total, 22);
    assert.equal(exported.data.length, 22);
    assert.equal(run(root, ["export", "--limit", "50"]).stdout,
      run(root, ["export", "--limit", "50"]).stdout);
    const escaped = json(root, ["task", "get", "T-0010"]).value.data;
    assert.match(escaped.outcome, /\| bash/u);
    assert.doesNotMatch(escaped.outcome, /\\\|/u);
    const archived = json(root, ["task", "get", "T-0001"]).value.data;
    assert.equal(archived.details[0].path, "readme/tasks/0001-note.md");
    assert.deepEqual(json(root, ["task", "get", "T-0021"]).value.data.dependencies, ["T-0020"]);
  } finally {
    await removeRepository(root);
  }
});

test("preflight recognizes a valid current store only with the static Task Store entrypoint", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    await fs.writeFile(path.join(root, "readme", "README.md"), "# Project State\n\nCurrent state.\n");
    await fs.writeFile(path.join(root, "readme", "tasks", "README.md"),
      "# Task Store\n\nUse `node readme/meta/framework-data/cli.mjs startup`.\n");
    const preflight = json(root, ["preflight"]).value;
    assert.equal(preflight.disposition, "valid_current_store");
    assert.equal(preflight.integrity, "valid");
  } finally {
    await removeRepository(root);
  }
});

test("doctor enforces framework sentinels, links, budgets, templates, maintenance, and staged evidence", async () => {
  const root = await makeRepository();
  try {
    const { runFrameworkChecks } = await import(FRAMEWORK_CHECKS_MODULE);
    json(root, ["init"]);
    const baseline = json(root, ["doctor"]).value;
    assert.equal(baseline.ok, true);
    assert.ok(baseline.checks.some((check) => check.id === "template_inventory"));
    assert.ok(baseline.checks.some((check) => check.id === "process_inventory"));

    const processFile = path.join(root, "readme", "meta", "root-loop.md");
    await fs.unlink(processFile);
    assert.equal(json(root, ["doctor"]).value.ok, true, "client framework shadow must be ignored");
    const missingProcess = await runFrameworkChecks({ root, frameworkRoot: root, tasks: new Map() });
    assert.ok(missingProcess.errors.some((error) => error.code === "DOCTOR_PROCESS_INVENTORY"));
    await fs.writeFile(processFile, "# root-loop.md\n");

    const agents = path.join(root, "AGENTS.md");
    await fs.unlink(agents);
    assert.ok(json(root, ["doctor"], 1).value.errors.some((error) => error.code === "DOCTOR_FILE_MISSING"));
    await fs.writeFile(agents, `${"line\n".repeat(121)}`);
    assert.ok(json(root, ["doctor"], 1).value.errors.some((error) => error.code === "DOCTOR_HARD_BUDGET"));
    await fs.writeFile(agents, "# Agent Instructions\n");

    const cursor = path.join(root, "readme", "README.md");
    const originalCursor = await fs.readFile(cursor, "utf8");
    await fs.writeFile(cursor, `${originalCursor}\n[Missing](missing.md)\n`);
    assert.ok(json(root, ["doctor"], 1).value.errors.some((error) => error.code === "DOCTOR_LINK_MISSING"));
    await fs.writeFile(cursor, `${originalCursor}${"extra\n".repeat(80)}`);
    assert.ok(json(root, ["doctor"], 1).value.errors.some((error) => error.code === "DOCTOR_HARD_BUDGET"));
    await fs.writeFile(cursor, originalCursor.replace("2026-09-10", "2026-08-11"));
    assert.ok(json(root, ["doctor"]).value.warnings.some((warning) => warning.code === "DOCTOR_MAINTENANCE_DUE"));
    await fs.writeFile(cursor, originalCursor.replace(
      "- Last maintenance pass: 2026-08-11\n- Legacy repository-changing completion baseline: 0\n- Next trigger: 2026-09-10 or 10 repository-changing completions",
      "- Last maintenance pass: Not yet run\n- Next trigger: First onboarding completion",
    ));
    const initializerBaseline = json(root, ["doctor"]).value;
    assert.equal(initializerBaseline.ok, true);
    assert.ok(initializerBaseline.warnings.some((warning) => warning.code === "DOCTOR_MAINTENANCE_DUE"));
    assert.deepEqual(initializerBaseline.checks.find(({ id }) => id === "maintenance_cadence").details.reasons,
      ["onboarding_baseline_uninitialized"]);
    await fs.writeFile(cursor, originalCursor);

    const template = path.join(root, "readme", "meta", "templates", "standards.md");
    await fs.unlink(template);
    assert.equal(json(root, ["doctor"]).value.ok, true, "client template shadow must be ignored");
    const missingTemplate = await runFrameworkChecks({ root, frameworkRoot: root, tasks: new Map() });
    assert.ok(missingTemplate.errors.some((error) => error.code === "DOCTOR_TEMPLATE_INVENTORY"));
    await fs.writeFile(template, "# standards.md\n");

    execFileSync("git", ["add", "readme/meta/framework-changelog.md"], { cwd: root });
    const staged = json(root, ["doctor", "--staged"]).value;
    assert.equal(staged.ok, true);
    assert.ok(staged.warnings.some((warning) => warning.code === "DOCTOR_STAGED_EVIDENCE"));
    assert.ok(staged.warnings.some((warning) => warning.code === "DOCTOR_STAGED_TASK_RECORD"));

    const migrated = generatedTask(1);
    migrated.status = "done";
    migrated.completion = { completedAt: null, repositoryChanged: null, evidence: "Legacy result" };
    await fs.mkdir(path.dirname(taskPath(root, migrated.id)));
    await fs.writeFile(taskPath(root, migrated.id), `${JSON.stringify(migrated, null, 2)}\n`);
    execFileSync("git", ["add", path.relative(root, taskPath(root, migrated.id))], { cwd: root });
    assert.ok(json(root, ["doctor", "--staged"]).value.warnings
      .some((warning) => warning.code === "DOCTOR_STAGED_TASK_RECORD"));
    await fs.unlink(taskPath(root, migrated.id));
    await fs.rmdir(path.dirname(taskPath(root, migrated.id)));

    const closing = json(root, [
      "task", "add", "--outcome", "Staged close evidence", "--authority-reference", "Test",
      "--status", "ready", "--route", "quick_change", "--risk", "low",
    ]).value.data;
    execFileSync("git", ["add", path.relative(root, taskPath(root, closing.id))], { cwd: root });
    assert.ok(json(root, ["doctor", "--staged"]).value.warnings
      .some((warning) => warning.code === "DOCTOR_STAGED_TASK_RECORD"));
    const selected = json(root, [
      "task", "select", closing.id, "--expected-record-version", "1",
      "--expected-store-digest", json(root, ["doctor"]).value.storeDigest,
    ]).value.data;
    const checkpointed = json(root, [
      "task", "checkpoint", closing.id, "--expected-record-version", String(selected.recordVersion),
      "--status", "needs_verification", "--next-safe-action", "Close fixture",
    ]).value.data;
    json(root, [
      "task", "close", closing.id, "--expected-record-version", String(checkpointed.recordVersion),
      "--status", "done", "--completed-at", "2026-08-11", "--repository-changed", "true",
      "--evidence", "Fixture passed",
    ]);
    execFileSync("git", ["add", path.relative(root, taskPath(root, closing.id))], { cwd: root });
    assert.equal(json(root, ["doctor", "--staged"]).value.warnings
      .some((warning) => warning.code === "DOCTOR_STAGED_TASK_RECORD"), false);
  } finally {
    await removeRepository(root);
  }
});

test("Format 1 migration rejects malformed dividers and changed sources without claiming a store", async () => {
  const malformedRoot = await makeMigrationRepository();
  try {
    const catalogPath = path.join(malformedRoot, "readme", "tasks", "README.md");
    const content = await fs.readFile(catalogPath, "utf8");
    await fs.writeFile(catalogPath, content.replace("| T-0003 | Outcome 3 |", "| T-0003 Outcome 3 |"));
    assert.match(run(malformedRoot, [
      "migrate", "format1",
      "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md",
      "--dry-run",
    ], 1).stderr, /FORMAT1_ROW/u);
    await assert.rejects(fs.lstat(path.join(malformedRoot, "readme", "tasks", "store")), { code: "ENOENT" });
  } finally {
    await removeRepository(malformedRoot);
  }

  const changedRoot = await makeMigrationRepository();
  try {
    const args = [
      "migrate", "format1",
      "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md",
    ];
    const dry = json(changedRoot, [...args, "--dry-run"]).value;
    await fs.appendFile(path.join(changedRoot, "readme", "tasks", "README.md"), "\n<!-- changed -->\n");
    assert.match(run(changedRoot, [...args, "--apply", "--expected-source-digest", dry.sourceDigest], 4).stderr,
      /STALE_SOURCE/u);
    await assert.rejects(fs.lstat(path.join(changedRoot, "readme", "tasks", "store")), { code: "ENOENT" });
  } finally {
    await removeRepository(changedRoot);
  }

  const nextIdRoot = await makeMigrationRepository();
  try {
    const catalogPath = path.join(nextIdRoot, "readme", "tasks", "README.md");
    const content = await fs.readFile(catalogPath, "utf8");
    await fs.writeFile(catalogPath, content.replace("- Next task ID: T-0023", "- Next task ID: T-0999"));
    assert.match(run(nextIdRoot, [
      "migrate", "format1",
      "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md",
      "--dry-run",
    ], 1).stderr, /FORMAT1_METADATA/u);
  } finally {
    await removeRepository(nextIdRoot);
  }

  const sourceLimitRoot = await makeMigrationRepository();
  try {
    const tooMany = ["migrate", "format1", "--catalog", "readme/tasks/README.md", "--dry-run"];
    for (let index = 0; index < 64; index += 1) {
      tooMany.push("--archive", `readme/archive/tasks/${index}.md`);
    }
    assert.match(run(sourceLimitRoot, tooMany, 1).stderr, /STORE_SIZE/u);
  } finally {
    await removeRepository(sourceLimitRoot);
  }

  const schedulingRoot = await makeMigrationRepository();
  try {
    const catalogPath = path.join(schedulingRoot, "readme", "tasks", "README.md");
    const content = await fs.readFile(catalogPath, "utf8");
    await fs.writeFile(catalogPath, content.replace("- Scheduling: Active", "- Scheduling: Idle"));
    assert.match(run(schedulingRoot, [
      "migrate", "format1", "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md", "--dry-run",
    ], 1).stderr, /FORMAT1_METADATA/u);
  } finally {
    await removeRepository(schedulingRoot);
  }

  const pausedRoot = await makeMigrationRepository();
  try {
    const catalogPath = path.join(pausedRoot, "readme", "tasks", "README.md");
    let content = await fs.readFile(catalogPath, "utf8");
    content = content.replace("- Primary task: T-0020", "- Primary task: None")
      .replace("- Scheduling: Active", "- Scheduling: Paused")
      .split("\n").map((line) => line.startsWith("| T-0020 |") ?
        line.replace(" | Active | ", " | Parked | ") : line).join("\n");
    await fs.writeFile(catalogPath, content);
    const paused = json(pausedRoot, [
      "migrate", "format1", "--catalog", "readme/tasks/README.md",
      "--archive", "readme/archive/tasks/archive.md", "--dry-run",
    ]).value;
    assert.equal(paused.report.paused, true);
    assert.equal(paused.report.transformations
      .find((item) => item.kind === "missing-pause-reason-defaulted").count, 1);
  } finally {
    await removeRepository(pausedRoot);
  }
});

test("Git-common-directory lock blocks concurrent commands without age-based recovery", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
    const lock = path.resolve(root, common, "framework-data.lock");
    await fs.mkdir(lock);
    const token = "11111111-1111-4111-8111-111111111111";
    await fs.writeFile(path.join(lock, "owner.json"), `${JSON.stringify({
      token,
      pid: 999_999,
      host: "test-host",
    }, null, 2)}\n`);
    const result = json(root, ["doctor"], 5).value;
    assert.equal(result.error.code, "LOCK_BUSY");
    const inspected = json(root, ["lock", "inspect"]).value.lock;
    assert.equal(inspected.owner.token, token);
    assert.match(run(root, ["lock", "recover", "--expected-token", token], 5).stderr,
      /LOCK_RECOVERY_CONFIRMATION/u);
    assert.match(run(root, [
      "lock", "recover", "--expected-token", "22222222-2222-4222-8222-222222222222",
      "--confirm-owner-not-live",
    ], 5).stderr, /LOCK_RECOVERY_STALE/u);
    assert.equal(json(root, [
      "lock", "recover", "--expected-token", token, "--confirm-owner-not-live",
    ]).value.recovered.owner.token, token);
    assert.equal(json(root, ["lock", "inspect"]).value.lock.held, false);
    assert.equal(json(root, ["doctor"]).value.ok, true);
    await fs.mkdir(lock);
    assert.equal(json(root, ["lock", "inspect"]).value.lock.state, "incomplete");
    assert.equal(json(root, [
      "lock", "recover", "--expected-token", "incomplete", "--confirm-owner-not-live",
    ]).value.recovered.state, "incomplete");
    await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, "owner.json"), "{\n");
    const malformed = json(root, ["lock", "inspect"]).value.lock;
    assert.equal(malformed.state, "incomplete");
    assert.equal(malformed.incomplete.kind, "malformed");
    assert.equal(json(root, [
      "lock", "recover", "--expected-token", "incomplete", "--confirm-owner-not-live",
    ]).value.recovered.incomplete.kind, "malformed");
    assert.equal(json(root, ["doctor"]).value.ok, true);
  } finally {
    await removeRepository(root);
  }
});

test("one Git-common lock serializes linked worktrees across real processes", async () => {
  const root = await makeRepository();
  const linked = await fs.mkdtemp(path.join(os.tmpdir(), "framework-data-linked-"));
  await fs.rmdir(linked);
  let holder;
  try {
    json(root, ["init"]);
    json(root, ["task", "add", "--outcome", "Linked fixture", "--authority-reference", "Test"]);
    execFileSync("git", ["config", "user.name", "Framework Test"], { cwd: root });
    execFileSync("git", ["config", "user.email", "framework-test@example.invalid"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    execFileSync("git", ["worktree", "add", "-q", "-b", "linked-test", linked], { cwd: root });
    const storeModule = fileURLToPath(new URL("../readme/meta/framework-data/store.mjs", import.meta.url));
    const script = `
      import { acquireLock, repositoryContext } from ${JSON.stringify(new URL(`file://${storeModule}`).href)};
      const lock = await acquireLock(await repositoryContext());
      process.stdout.write("held\\n");
      setTimeout(async () => { await lock.release(); }, 60_000);
    `;
    holder = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      holder.stdout.once("data", resolve);
      holder.once("error", reject);
      holder.once("exit", (code) => {
        if (code !== null && code !== 0) reject(new Error(`lock holder exited ${code}`));
      });
    });
    assert.equal(json(linked, ["doctor"], 5).value.error.code, "LOCK_BUSY");
    holder.kill("SIGKILL");
    await new Promise((resolve, reject) => {
      holder.once("exit", (code, signal) => signal === "SIGKILL" ? resolve() :
        reject(new Error(`lock holder exited ${code}/${signal}`)));
    });
    holder = null;
    const orphan = json(root, ["lock", "inspect"]).value.lock;
    assert.equal(orphan.state, "owned");
    json(root, [
      "lock", "recover", "--expected-token", orphan.owner.token, "--confirm-owner-not-live",
    ]);
    assert.equal(json(linked, ["doctor"]).value.ok, true);
  } finally {
    holder?.kill("SIGKILL");
    await fs.rm(linked, { recursive: true, force: true });
    execFileSync("git", ["worktree", "prune"], { cwd: root });
    await removeRepository(root);
  }
});

test("init refuses legacy and partial repositories instead of claiming migration state", async () => {
  const legacy = await makeMigrationRepository();
  try {
    assert.equal(json(legacy, ["preflight"]).value.disposition, "legacy_format1");
    assert.match(run(legacy, ["init"], 4).stderr, /INITIALIZATION_UNSAFE/u);
    await assert.rejects(fs.lstat(path.join(legacy, "readme", "tasks", "store")), { code: "ENOENT" });
  } finally {
    await removeRepository(legacy);
  }
  const partial = await makeRepository();
  try {
    await fs.unlink(path.join(partial, "readme", "README.md"));
    assert.equal(json(partial, ["preflight"]).value.disposition, "partial");
    assert.match(run(partial, ["init"], 4).stderr, /INITIALIZATION_UNSAFE/u);
  } finally {
    await removeRepository(partial);
  }

  const unrelated = await makeRepository();
  try {
    await fs.writeFile(path.join(unrelated, "readme", "tasks", "README.md"),
      "# Task Store\n\nThis is an unrelated document.\n");
    assert.notEqual(json(unrelated, ["preflight"]).value.disposition, "ready_to_initialize");
    assert.match(run(unrelated, ["init"], 4).stderr, /INITIALIZATION_UNSAFE/u);
    await assert.rejects(fs.lstat(path.join(unrelated, "readme", "tasks", "store")), { code: "ENOENT" });
  } finally {
    await removeRepository(unrelated);
  }

  const bom = await makeRepository();
  try {
    const cursor = path.join(bom, "readme", "README.md");
    await fs.writeFile(cursor, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await fs.readFile(cursor)]));
    assert.equal(json(bom, ["preflight"]).value.disposition, "collision");
    assert.match(run(bom, ["init"], 4).stderr, /INITIALIZATION_UNSAFE/u);
    await assert.rejects(fs.lstat(path.join(bom, "readme", "tasks", "store")), { code: "ENOENT" });
  } finally {
    await removeRepository(bom);
  }
});

test("store operations reject ancestor symlinks and never write outside the repository", async () => {
  const root = await makeRepository();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "framework-data-outside-"));
  try {
    json(root, ["init"]);
    const tasks = path.join(root, "readme", "tasks");
    const externalTasks = path.join(outside, "tasks");
    await fs.rename(tasks, externalTasks);
    await fs.symlink(externalTasks, tasks);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "PATH_UNSAFE");
    assert.match(run(root, [
      "task", "add", "--outcome", "Must stay inside", "--authority-reference", "Test",
    ], 1).stderr, /PATH_UNSAFE/u);
    await assert.rejects(fs.lstat(path.join(externalTasks, "store", "records", "0000", "T-0001.json")),
      { code: "ENOENT" });
  } finally {
    await removeRepository(root);
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("BOM-prefixed store records and raw terminal controls fail closed", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const control = path.join(root, "readme", "tasks", "store", "control.json");
    const controlBytes = await fs.readFile(control);
    await fs.writeFile(control, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), controlBytes]));
    assert.equal(json(root, ["doctor"], 1).value.error.code, "UTF8_INVALID");
    await fs.writeFile(control, controlBytes);
    const added = json(root, [
      "task", "add", "--outcome", "BOM target", "--authority-reference", "Test",
    ]).value.data;
    const taskRecord = taskPath(root, added.id);
    const taskBytes = await fs.readFile(taskRecord);
    await fs.writeFile(taskRecord, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), taskBytes]));
    assert.equal(json(root, ["doctor"], 1).value.error.code, "UTF8_INVALID");
    await fs.writeFile(taskRecord, taskBytes);
    const unsafeOption = "--bad\u202eoption";
    const result = run(root, [unsafeOption], 2);
    assert.doesNotMatch(result.stderr, /\u202e/u);
    assert.match(result.stderr, /ARGUMENT_INVALID/u);
  } finally {
    await removeRepository(root);
  }
});

test("approval, routing, and dependency transitions cannot bypass eligibility", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    await fs.writeFile(path.join(root, "readme", "tasks", "approval.md"), "# Approval\n");
    const denied = json(root, [
      "task", "add", "--outcome", "Approval-gated task", "--authority-reference", "Test",
      "--status", "ready", "--route", "initiative", "--risk", "high",
    ]).value.data;
    const deniedRecord = json(root, [
      "task", "record-approval", denied.id, "--expected-record-version", "1",
      "--id", "A-1", "--status", "denied", "--source", "Owner",
      "--action", "Publish", "--boundary", "Repository only",
      "--detail-path", "readme/tasks/approval.md",
    ]).value.data;
    assert.equal(deniedRecord.status, "pending");
    assert.match(run(root, [
      "task", "record-approval", denied.id,
      "--expected-record-version", String(deniedRecord.recordVersion),
      "--id", "A-1", "--status", "granted", "--source", "Owner",
      "--action", "Publish", "--boundary", "Expanded boundary",
      "--detail-path", "readme/tasks/approval.md",
    ], 4).stderr, /TRANSITION_INVALID/u);
    assert.match(run(root, [
      "task", "checkpoint", denied.id, "--expected-record-version", String(deniedRecord.recordVersion),
      "--status", "needs_verification",
    ], 4).stderr, /TRANSITION_INVALID/u);
    assert.match(run(root, [
      "task", "checkpoint", denied.id, "--expected-record-version", String(deniedRecord.recordVersion),
      "--status", "blocked", "--blocker", "Waiting",
    ], 4).stderr, /TRANSITION_INVALID/u);
    assert.equal(json(root, ["task", "candidates"]).value.meta.total, 0);

    const beforeUnsafe = json(root, ["doctor"]).value.storeDigest;
    assert.match(run(root, [
      "task", "add", "--outcome", "Unframed ready", "--authority-reference", "Test", "--status", "ready",
    ], 1).stderr, /STATE_INVALID/u);
    assert.equal(json(root, ["doctor"]).value.storeDigest, beforeUnsafe);

    const dependency = json(root, [
      "task", "add", "--outcome", "Pending dependency", "--authority-reference", "Test",
    ]).value.data;
    const digest = json(root, ["doctor"]).value.storeDigest;
    const dependencyTarget = json(root, [
      "task", "add", "--outcome", "Dependency target", "--authority-reference", "Test",
      "--status", "ready", "--route", "initiative", "--risk", "medium",
    ]).value.data;
    const dependencyUpdate = json(root, [
      "task", "set-dependencies", dependencyTarget.id, "--expected-record-version", "1",
      "--expected-store-digest", json(root, ["doctor"]).value.storeDigest,
      "--depends-on", dependency.id,
    ]).value.data;
    assert.equal(dependencyUpdate.taskRevision, 2);
    assert.equal(dependencyUpdate.status, "pending");
    const selectable = json(root, [
      "task", "add", "--outcome", "Selectable", "--authority-reference", "Test",
      "--status", "ready", "--route", "quick_change", "--risk", "low",
    ]).value.data;
    const selectDigest = json(root, ["doctor"]).value.storeDigest;
    const active = json(root, [
      "task", "select", selectable.id, "--expected-record-version", "1",
      "--expected-store-digest", selectDigest,
    ]).value.data;
    assert.match(run(root, [
      "task", "set-dependencies", active.id, "--expected-record-version", String(active.recordVersion),
      "--expected-store-digest", json(root, ["doctor"]).value.storeDigest,
      "--depends-on", dependency.id,
    ], 4).stderr, /TRANSITION_INVALID/u);
    assert.notEqual(digest, json(root, ["doctor"]).value.storeDigest);

    const deniedPath = taskPath(root, denied.id);
    const incomplete = JSON.parse(await fs.readFile(deniedPath, "utf8"));
    incomplete.gate = {
      ...incomplete.gate,
      id: null,
      status: "granted",
      source: null,
      action: null,
      boundary: null,
      detailPath: null,
    };
    await fs.writeFile(deniedPath, `${JSON.stringify(incomplete, null, 2)}\n`);
    assert.match(json(root, ["doctor"], 1).value.error.code, /^(?:SCHEMA_INVALID|UNSAFE_TEXT)$/u);
  } finally {
    await removeRepository(root);
  }
});

test("query filters and context output remain deterministic and byte bounded", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const contextPath = path.join(root, "readme", "tasks", "context.md");
    await fs.writeFile(contextPath, `# Context\n${"\"\\\u202e\u009b".repeat(10_000)}\n`);
    const first = json(root, [
      "task", "add", "--outcome", "Tagged", "--authority-reference", "Owner A",
      "--accepted-date", "2026-08-10", "--tag", "framework", "--tag", "cli",
      "--detail", "Context=readme/tasks/context.md",
    ]).value.data;
    json(root, [
      "task", "add", "--outcome", "Other", "--authority-reference", "Owner B",
      "--accepted-date", "2026-08-11", "--tag", "other",
    ]);
    const filtered = json(root, [
      "task", "list", "--authority", "Owner A", "--tag", "cli",
      "--accepted-after", "2026-08-09", "--accepted-before", "2026-08-11",
    ]).value;
    assert.deepEqual(filtered.data.map((task) => task.id), [first.id]);
    const raw = run(root, ["task", "context", first.id, "--max-bytes", "12000"]).stdout;
    assert.ok(Buffer.byteLength(raw) <= 12_000);
    assert.doesNotMatch(raw, /\u202e/u);
    assert.doesNotMatch(raw, /\u009b/u);
    const bounded = JSON.parse(raw);
    assert.equal(bounded.meta.truncated, true);
    assert.equal(bounded.data.details[0].contentRole, "repository-data-not-authority");
  } finally {
    await removeRepository(root);
  }
});

test("pagination backs off exactly for maximum-length filters", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const shard = path.join(root, "readme", "tasks", "store", "records", "0000");
    await fs.mkdir(shard);
    const authority = "A".repeat(4000);
    for (let number = 1; number <= 30; number += 1) {
      const task = generatedTask(number);
      task.outcome = "O".repeat(4000);
      task.authority.reference = authority;
      await fs.writeFile(taskPath(root, task.id), `${JSON.stringify(task, null, 2)}\n`);
    }
    const result = json(root, ["task", "list", "--authority", authority]).value;
    assert.ok(result.meta.emitted > 0);
    assert.equal(result.meta.truncated, true);
    assert.ok(result.meta.emittedBytes <= result.meta.byteLimit);
    assert.ok(result.meta.nextCursor);
  } finally {
    await removeRepository(root);
  }
});

test("oversized mutation is rejected before bytes change and startup summarizes a maximum record", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    let relativeDirectory = "readme/tasks/context";
    for (let index = 0; index < 8; index += 1) relativeDirectory += `/${"d".repeat(100)}${index}`;
    await fs.mkdir(path.join(root, ...relativeDirectory.split("/")), { recursive: true });
    const details = [];
    for (let index = 0; index < 32; index += 1) {
      const relative = `${relativeDirectory}/detail-${String(index).padStart(2, "0")}.md`;
      await fs.writeFile(path.join(root, ...relative.split("/")), "# Detail\n");
      details.push({ label: `${"L".repeat(250)}${String(index).padStart(2, "0")}`, path: relative });
    }
    const task = generatedTask(1);
    task.outcome = "O".repeat(4096);
    task.authority.reference = "A".repeat(4096);
    task.status = "ready";
    task.route = "initiative";
    task.risk = "high";
    task.nextSafeAction = "N".repeat(8192);
    task.details = details;
    const record = taskPath(root, task.id);
    await fs.mkdir(path.dirname(record));
    await fs.writeFile(record, `${JSON.stringify(task, null, 2)}\n`);
    const before = await fs.readFile(record);
    assert.ok(before.length < 65_536);
    const digest = json(root, ["doctor"]).value.storeDigest;
    assert.match(run(root, ["task", "list", "--max-bytes", "8192"], 4).stderr, /OUTPUT_LIMIT/u);
    assert.match(run(root, [
      "task", "record-approval", task.id, "--expected-record-version", "1",
      "--id", "A-oversize", "--status", "granted", "--source", "S".repeat(4096),
      "--action", "X".repeat(4096), "--boundary", "B".repeat(4096),
      "--summary", "M".repeat(4096), "--detail-path", details[0].path,
    ], 1).stderr, /RECORD_SIZE/u);
    assert.deepEqual(await fs.readFile(record), before);
    assert.equal(json(root, ["doctor"]).value.storeDigest, digest);

    task.status = "active";
    await fs.writeFile(record, `${JSON.stringify(task, null, 2)}\n`);
    assert.equal(json(root, ["doctor"]).value.ok, true);
    const startup = json(root, ["startup"]).value;
    assert.equal(startup.data.primaryTask.id, task.id);
    assert.equal(Object.hasOwn(startup.data.primaryTask, "details"), false);
    assert.equal(startup.data.tasks.some((item) => item.id === task.id), false);
  } finally {
    await removeRepository(root);
  }
});

test("filesystem write failure leaves the canonical record and digest unchanged", async () => {
  const root = await makeRepository();
  let shard;
  try {
    json(root, ["init"]);
    const task = json(root, [
      "task", "add", "--outcome", "Write failure target", "--authority-reference", "Test",
    ]).value.data;
    const record = taskPath(root, task.id);
    shard = path.dirname(record);
    const before = await fs.readFile(record);
    const digest = json(root, ["doctor"]).value.storeDigest;
    await fs.chmod(shard, 0o555);
    assert.match(run(root, [
      "task", "amend", task.id, "--expected-record-version", "1",
      "--outcome", "Changed outcome", "--authority-reference", "Test amendment",
    ], 1).stderr, /ATOMIC_WRITE_FAILED/u);
    await fs.chmod(shard, 0o755);
    assert.deepEqual(await fs.readFile(record), before);
    assert.equal(json(root, ["doctor"]).value.storeDigest, digest);
  } finally {
    if (shard) await fs.chmod(shard, 0o755).catch(() => {});
    await removeRepository(root);
  }
});

test("pre-claim staging orphans stay outside the canonical store", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const tasksDirectory = path.join(root, "readme", "tasks");
    await fs.writeFile(path.join(tasksDirectory, ".framework-data-record-interrupted.tmp"), "prepared\n");
    const shardStage = path.join(tasksDirectory, ".framework-data-shard-interrupted");
    await fs.mkdir(shardStage);
    await fs.writeFile(path.join(shardStage, "T-9999.json"), "prepared\n");
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
    await fs.writeFile(path.resolve(root, common, ".framework-data-owner-interrupted.tmp"), "prepared\n");
    assert.equal(json(root, ["doctor"]).value.ok, true);
    json(root, ["task", "add", "--outcome", "Post-interruption task", "--authority-reference", "Test"]);
    assert.equal(json(root, ["doctor"]).value.ok, true);
    const storeEntries = await fs.readdir(path.join(tasksDirectory, "store"), { recursive: true });
    assert.equal(storeEntries.some((entry) => path.basename(entry).startsWith(".framework-data-")), false);
  } finally {
    await removeRepository(root);
  }
});

test("SIGKILL before record claim preserves canonical bytes and recoverability", { timeout: 15_000 }, async () => {
  const root = await makeRepository();
  let writer;
  try {
    json(root, ["init"]);
    const task = json(root, [
      "task", "add", "--outcome", "Interrupted mutation target", "--authority-reference", "Test",
    ]).value.data;
    const record = taskPath(root, task.id);
    const before = await fs.readFile(record);
    const digest = json(root, ["doctor"]).value.storeDigest;
    const storeModule = fileURLToPath(STORE_MODULE);
    const script = `
      import fs from "node:fs/promises";
      const originalRename = fs.rename.bind(fs);
      fs.rename = async (source, target) => {
        if (target === ${JSON.stringify(record)}) {
          process.stdout.write("before-record-claim\\n");
          await new Promise(() => {});
        }
        return originalRename(source, target);
      };
      const { loadStore, mutateTask, repositoryContext, withLock } =
        await import(${JSON.stringify(new URL(`file://${storeModule}`).href)});
      const context = await repositoryContext();
      await withLock(context, async () => {
        const loaded = await loadStore(context);
        await mutateTask(context, loaded, ${JSON.stringify(task.id)}, 1, (current) => ({
          ...current,
          recordVersion: 2,
          taskRevision: 2,
          outcome: "Interrupted replacement",
        }));
      });
    `;
    writer = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      let output = "";
      let errorOutput = "";
      writer.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("before-record-claim\n")) resolve();
      });
      writer.stderr.on("data", (chunk) => { errorOutput += chunk; });
      writer.once("error", reject);
      writer.once("exit", (code, signal) => {
        if (!output.includes("before-record-claim\n")) {
          reject(new Error(`interrupted writer exited early ${code}/${signal}: ${errorOutput}`));
        }
      });
    });
    writer.kill("SIGKILL");
    await new Promise((resolve, reject) => {
      writer.once("exit", (code, signal) => signal === "SIGKILL" ? resolve() :
        reject(new Error(`interrupted writer exited ${code}/${signal}`)));
    });
    writer = null;
    assert.deepEqual(await fs.readFile(record), before);
    const lock = json(root, ["lock", "inspect"]).value.lock;
    assert.equal(lock.state, "owned");
    json(root, [
      "lock", "recover", "--expected-token", lock.owner.token, "--confirm-owner-not-live",
    ]);
    assert.equal(json(root, ["doctor"]).value.storeDigest, digest);
    assert.ok((await fs.readdir(path.join(root, "readme", "tasks")))
      .some((entry) => /^\.framework-data-record-[0-9a-f-]+\.tmp$/u.test(entry)));
    const amended = json(root, [
      "task", "amend", task.id, "--expected-record-version", "1",
      "--outcome", "Recovered replacement", "--authority-reference", "Test recovery",
    ]).value.data;
    assert.equal(amended.recordVersion, 2);
    assert.equal(json(root, ["doctor"]).value.ok, true);
  } finally {
    writer?.kill("SIGKILL");
    await removeRepository(root);
  }
});

test("failed first-record shard claim leaves no empty canonical shard", async () => {
  const root = await makeRepository();
  const records = path.join(root, "readme", "tasks", "store", "records");
  try {
    json(root, ["init"]);
    const firstShard = path.join(records, "0000");
    await fs.mkdir(firstShard);
    for (let number = 1; number <= 1000; number += 1) {
      const task = generatedTask(number);
      await fs.writeFile(taskPath(root, task.id), `${JSON.stringify(task, null, 2)}\n`);
    }
    assert.equal(json(root, ["doctor"]).value.ok, true);
    await fs.chmod(records, 0o555);
    assert.match(run(root, [
      "task", "add", "--outcome", "First task in next shard", "--authority-reference", "Test",
    ], 1).stderr, /ATOMIC_WRITE_FAILED/u);
    await assert.rejects(fs.lstat(path.join(records, "0001")), { code: "ENOENT" });
    assert.equal((await fs.readdir(path.join(root, "readme", "tasks")))
      .some((entry) => entry.startsWith(".framework-data-shard-")), false);
    await fs.chmod(records, 0o755);
    assert.equal(json(root, ["doctor"]).value.ok, true);
  } finally {
    await fs.chmod(records, 0o755).catch(() => {});
    await removeRepository(root);
  }
});

test("prospective aggregate caps reject control, add, and task writes before mutation", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const { addTask, loadStore, mutateControl, mutateTask, repositoryContext } = await import(STORE_MODULE);
    const context = await repositoryContext(root);
    const empty = await loadStore(context);
    const controlBefore = await fs.readFile(path.join(context.storeRoot, "control.json"));
    const tightEmpty = await loadStore(context, { maxStoreBytes: empty.storeBytes + 1 });
    await assert.rejects(mutateControl(context, tightEmpty, 1, (control) => ({
      ...control,
      recordVersion: 2,
      pause: { reason: "Aggregate guard", source: "Test" },
    })), (error) => error.code === "STORE_SIZE");
    assert.deepEqual(await fs.readFile(path.join(context.storeRoot, "control.json")), controlBefore);

    await assert.rejects(addTask(context, tightEmpty, generatedTask(1)),
      (error) => error.code === "STORE_SIZE");
    await assert.rejects(fs.lstat(taskPath(root, "T-0001")), { code: "ENOENT" });

    const added = json(root, [
      "task", "add", "--outcome", "Aggregate mutation target", "--authority-reference", "Test",
    ]).value.data;
    const loaded = await loadStore(context);
    const record = taskPath(root, added.id);
    const before = await fs.readFile(record);
    const tight = await loadStore(context, { maxStoreBytes: loaded.storeBytes + 1 });
    await assert.rejects(mutateTask(context, tight, added.id, 1, (task) => ({
      ...task,
      recordVersion: 2,
      nextSafeAction: "X".repeat(1024),
    })), (error) => error.code === "STORE_SIZE");
    assert.deepEqual(await fs.readFile(record), before);
    assert.equal((await loadStore(context)).digest, loaded.digest);
  } finally {
    await removeRepository(root);
  }
});

test("store directory inventories are bounded and empty shards are invalid", async () => {
  const root = await makeRepository();
  try {
    json(root, ["init"]);
    const shard = path.join(root, "readme", "tasks", "store", "records", "0000");
    await fs.mkdir(shard);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "STORE_LAYOUT");
    for (let index = 0; index <= 1000; index += 1) {
      await fs.writeFile(path.join(shard, `entry-${String(index).padStart(4, "0")}`), "x");
    }
    assert.equal(json(root, ["doctor"], 1).value.error.code, "STORE_SIZE");
  } finally {
    await removeRepository(root);
  }
});

function generatedTask(number) {
  const id = `T-${String(number).padStart(4, "0")}`;
  return {
    schemaVersion: 1,
    id,
    recordVersion: 1,
    taskRevision: 1,
    outcome: `Generated task ${number}`,
    authority: { reference: "Performance fixture", acceptedDate: null },
    status: "pending",
    dependencies: [],
    route: "unrouted",
    risk: null,
    tags: [],
    gate: { kind: "none" },
    nextSafeAction: null,
    details: [],
    completion: null,
  };
}

test("10,000-task query remains numerically ordered and bounded", { timeout: 60_000 }, async () => {
  const root = await makeRepository();
  try {
    const store = path.join(root, "readme", "tasks", "store");
    await fs.mkdir(path.join(store, "records"), { recursive: true });
    await fs.writeFile(path.join(store, "control.json"), `${JSON.stringify({
      schemaVersion: 1,
      recordVersion: 1,
      pause: null,
    }, null, 2)}\n`);
    for (let shard = 0; shard < 10; shard += 1) {
      const directory = path.join(store, "records", String(shard).padStart(4, "0"));
      await fs.mkdir(directory);
      for (let offset = 0; offset < 1000; offset += 100) {
        const writes = [];
        for (let inner = 1; inner <= 100; inner += 1) {
          const number = shard * 1000 + offset + inner;
          const task = generatedTask(number);
          if (number > 1) task.dependencies = [`T-${String(number - 1).padStart(4, "0")}`];
          writes.push(fs.writeFile(path.join(directory, `${task.id}.json`), `${JSON.stringify(task, null, 2)}\n`));
        }
        await Promise.all(writes);
      }
    }
    const doctor = json(root, ["doctor"]).value;
    assert.equal(doctor.taskCount, 10_000);
    const result = run(root, ["task", "list", "--limit", "7"]);
    assert.ok(Buffer.byteLength(result.stdout) < 20_000);
    const listed = JSON.parse(result.stdout);
    assert.equal(listed.meta.total, 10_000);
    assert.equal(listed.meta.emitted, 7);
    assert.equal(listed.meta.truncated, true);
    assert.deepEqual(listed.data.map((task) => task.id), [
      "T-0001", "T-0002", "T-0003", "T-0004", "T-0005", "T-0006", "T-0007",
    ]);
    const dependencies = json(root, [
      "task", "deps", "T-10000", "--direction", "ancestors", "--limit", "200",
      "--max-bytes", "1048576",
    ]).value;
    assert.equal(dependencies.meta.total, 9_999);
    assert.equal(dependencies.meta.emitted, 200);
    const bothDirections = json(root, [
      "task", "deps", "T-5000", "--direction", "both", "--limit", "200",
      "--max-bytes", "1048576",
    ]).value;
    assert.equal(bothDirections.meta.total, 9_999);
    assert.equal(bothDirections.meta.emitted, 200);
    const first = taskPath(root, "T-0001");
    const firstTask = JSON.parse(await fs.readFile(first, "utf8"));
    firstTask.dependencies = ["T-10000"];
    await fs.writeFile(first, `${JSON.stringify(firstTask, null, 2)}\n`);
    assert.equal(json(root, ["doctor"], 1).value.error.code, "DEPENDENCY_CYCLE");
  } finally {
    await removeRepository(root);
  }
});
