import assert from "node:assert/strict";
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
  assert.match(canonical, /npm run --ignore-scripts --silent meta -- docs onboarding/u);
  for (const command of [
    "project --version",
    "project preflight",
    "project init",
    "tasks doctor",
    "tasks startup --limit 20 --max-bytes 32768",
    "tasks task candidates --max-bytes 32768",
    "tasks task context T-NNNN --max-bytes 32768",
  ]) {
    const exactInvocation = `npm run --ignore-scripts --silent meta -- ${command}`;
    assert.match(canonical, new RegExp(exactInvocation.replaceAll(" ", "\\s+"), "u"));
  }
  assert.doesNotMatch(canonical, /tasks doctor[^\n`]*--max-bytes/u);
  for (const disposition of [
    "fresh", "ready_to_initialize", "ready_to_add_bootstraps", "valid_current_project",
    "source_repository", "legacy_format1", "partial", "prepared", "bootstrap_collision",
    "collision", "malformed", "busy",
  ]) assert.match(canonical, new RegExp(`\\b${disposition}\\b`, "u"));
  for (const guard of [
    "Unsupported Node", "native Windows", "missing Git", "schema mismatch", "invalid output",
  ]) assert.match(canonical, new RegExp(guard.replaceAll(" ", "\\s+"), "u"));
  assert.match(canonical, /only after observing exit zero/u);
  assert.match(canonical, /task candidates/u);
  assert.match(canonical, /task context T-NNNN/u);
  assert.doesNotMatch(canonical, /curl\s*\|\s*(?:ba)?sh/u);
  assert.doesNotMatch(canonical, /node readme\/meta\/framework-data\/cli\.mjs/u);
  assert.doesNotMatch(canonical, /(?:\.\.\/)+readme\/meta\//u);
  assert.match(canonical, /Do not substitute[\s\S]{0,160}global binary[\s\S]{0,80}`npx`[\s\S]{0,80}network fetch/iu);
  assert.doesNotMatch(canonical, /^\s*(?:\$\s*)?(?:npx\s+|npm (?:install|i)\s+[^\n]*-g\b|npm exec --global\b)/mu);

  assert.match(claude, /^---\nname: project-onboarding\ndescription: .+\n---\n/u);
  assert.match(claude, /\.\.\/\.\.\/\.\.\/\.agents\/skills\/project-onboarding\/SKILL\.md/u);
  assert.doesNotMatch(claude, /ready_to_initialize|legacy_format1|task candidates/u);
  assert.match(metadata, /display_name: "Project Onboarding"/u);
  assert.match(metadata, /default_prompt: "Use \$project-onboarding/u);

  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "scripts")), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "references")), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), "assets")), { code: "ENOENT" });
});
