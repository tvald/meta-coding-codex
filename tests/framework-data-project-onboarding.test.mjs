import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CANONICAL = path.join(ROOT, ".agents", "skills", "project-onboarding", "SKILL.md");
const CLAUDE = path.join(ROOT, ".claude", "skills", "project-onboarding", "SKILL.md");
const METADATA = path.join(ROOT, ".agents", "skills", "project-onboarding", "agents", "openai.yaml");

test("project-onboarding has one maintained workflow and thin discovery metadata", async () => {
  const [canonical, claude, metadata] = await Promise.all([
    fs.readFile(CANONICAL, "utf8"),
    fs.readFile(CLAUDE, "utf8"),
    fs.readFile(METADATA, "utf8"),
  ]);
  assert.match(canonical, /^---\nname: project-onboarding\ndescription: .+\n---\n/u);
  assert.match(canonical, /\.\.\/\.\.\/\.\.\/readme\/meta\/onboarding\.md/u);
  assert.match(canonical, /node readme\/meta\/framework-data\/cli\.mjs preflight/u);
  for (const disposition of [
    "ready_to_initialize", "valid_current_store", "uninitialized", "legacy_format1",
    "partial", "prepared", "collision", "malformed", "busy",
  ]) assert.match(canonical, new RegExp(`\\b${disposition}\\b`, "u"));
  assert.match(canonical, /Unsupported Node, native Windows, missing Git, schema mismatch, invalid/u);
  assert.match(canonical, /only after observing exit zero/u);
  assert.match(canonical, /task candidates/u);
  assert.match(canonical, /task context T-NNNN/u);
  assert.doesNotMatch(canonical, /curl\s*\|\s*(?:ba)?sh/u);

  assert.match(claude, /^---\nname: project-onboarding\ndescription: .+\n---\n/u);
  assert.match(claude, /\.\.\/\.\.\/\.\.\/\.agents\/skills\/project-onboarding\/SKILL\.md/u);
  assert.doesNotMatch(claude, /ready_to_initialize|legacy_format1|task candidates/u);
  assert.match(metadata, /display_name: "Project Onboarding"/u);
  assert.match(metadata, /default_prompt: "Use \$project-onboarding/u);

  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "scripts")), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "references")), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "assets")), { code: "ENOENT" });
});

test("installer inventory and collision logic cover the complete skill bundle", () => {
  const result = spawnSync("bash", [path.join(ROOT, "scripts", "install-core.sh"),
    "--print-expected-inventory"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const entries = result.stdout.trim().split("\n");
  assert.equal(new Set(entries).size, entries.length);
  for (const entry of [
    ".agents/skills/project-onboarding/SKILL.md",
    ".agents/skills/project-onboarding/agents/openai.yaml",
    ".claude/skills/project-onboarding/SKILL.md",
  ]) assert.equal(entries.filter((candidate) => candidate === entry).length, 1);
});
