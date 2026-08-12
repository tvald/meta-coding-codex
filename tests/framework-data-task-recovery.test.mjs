import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CANONICAL = path.join(ROOT, ".agents", "skills", "task-recovery", "SKILL.md");
const CLAUDE = path.join(ROOT, ".claude", "skills", "task-recovery", "SKILL.md");
const METADATA = path.join(ROOT, ".agents", "skills", "task-recovery", "agents", "openai.yaml");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "task-recovery-scenarios.json");

function classifyRecovery(fixture) {
  const state = {
    message: "none", integrity: "valid", digestConsistent: true, truncated: false,
    paused: false, status: "active", approval: "not_applicable", effect: "known",
    ownership: "clear", worker: "not_applicable", quota: "not_applicable",
    checkpoint: "owned_local", canonicalState: "unchanged", messageScope: "target", ...fixture,
  };
  if (state.paused) return "paused";
  if (["done", "cancelled", "superseded"].includes(state.status)) return "terminal_noop";
  if (["redirect", "pause", "cancel", "supersede"].includes(state.message)) return "redirect";
  if (state.integrity !== "valid" || !state.digestConsistent || state.truncated ||
      ["unknown", "overlap"].includes(state.ownership) || state.effect === "unknown" ||
      state.worker === "missing" || state.status === "blocked") return "reconcile";
  if (["pending", "ready"].includes(state.status)) return "reconcile";
  if (state.status === "needs_verification") return "verify";
  if (!["not_applicable", "granted_current"].includes(state.approval)) return "wait_approval";
  if (["unknown", "cutoff", "cached"].includes(state.quota)) return "wait_capacity";
  if (state.status === "parked") return "reconcile";
  if (state.worker === "suspended") return "resume_worker";
  if (state.worker === "failed") return "propose_replacement";
  if (state.retrySafe) return "retry_proven_safe";
  if (state.canonicalState === "advanced" || state.checkpoint === "commit_present" ||
      state.messageScope === "unrelated") return "continue";
  return "continue";
}

test("task-recovery has one maintained workflow and a complete bounded contract", async () => {
  const [canonical, claude, metadata] = await Promise.all([
    fs.readFile(CANONICAL, "utf8"), fs.readFile(CLAUDE, "utf8"), fs.readFile(METADATA, "utf8"),
  ]);
  assert.match(canonical, /^---\nname: task-recovery\ndescription: .+\n---\n/u);
  assert.match(canonical, /npm run --ignore-scripts --silent meta -- docs resumption-protocol/u);
  for (const command of [
    "tasks doctor",
    "tasks startup --limit 20 --max-bytes 32768",
    "tasks task get T-NNNN --max-bytes 131072",
    "tasks task context T-NNNN --max-bytes 32768",
    "tasks task deps T-NNNN --direction ancestors --limit 50 --max-bytes 32768",
  ]) {
    const exactInvocation = `npm run --ignore-scripts --silent meta -- ${command}`;
    assert.match(canonical, new RegExp(exactInvocation.replaceAll(" ", "\\s+"), "u"));
  }
  assert.doesNotMatch(canonical, /tasks doctor[^\n`]*--max-bytes/u);
  for (const disposition of [
    "continue", "retry_proven_safe", "verify", "wait_approval", "wait_capacity",
    "resume_worker", "propose_replacement", "redirect", "reconcile", "paused",
    "terminal_noop",
  ]) assert.match(canonical, new RegExp(`\\b${disposition}\\b`, "u"));
  for (const guard of [
    "taskRevision", "recordVersion", "store digest", "uncertain effect",
    "Never automatically stash", "fresh authoritative reading", "Immediately before returning the proposal",
    "never shell-interpolate", "this skill performed no mutation", "proposal-only", "Do not broadly enumerate processes",
    "conservative precedence", "provider locator", "no original handle interface", "harness output cap",
    "checkpoint directly to\\s+`active`",
  ]) assert.match(canonical, new RegExp(guard, "iu"));
  assert.match(canonical, /missing or silent\s+worker/iu);
  assert.doesNotMatch(canonical, /node readme\/meta\/framework-data\/cli\.mjs/u);
  assert.doesNotMatch(canonical, /(?:\.\.\/)+readme\/meta\//u);
  assert.doesNotMatch(canonical, /^\s*(?:\$\s*)?(?:npx\s+|npm (?:install|i)\s+[^\n]*-g\b|npm exec --global\b)/mu);
  const finalRevalidation = canonical.slice(canonical.indexOf("## Revalidate Before Returning A Proposal"));
  for (const evidence of ["task context", "task deps", "linked task note", "dependency status"]) {
    assert.match(finalRevalidation, new RegExp(evidence.replaceAll(" ", "\\s+"), "u"));
  }
  assert.match(claude, /\.\.\/\.\.\/\.\.\/\.agents\/skills\/task-recovery\/SKILL\.md/u);
  assert.doesNotMatch(claude, /propose_replacement|wait_capacity|task deps/u);
  assert.match(metadata, /display_name: "Task Recovery"/u);
  assert.match(metadata, /default_prompt: "Use \$task-recovery/u);
  for (const resource of ["scripts", "references", "assets"]) {
    await assert.rejects(fs.lstat(path.join(path.dirname(CANONICAL), resource)), { code: "ENOENT" });
  }
});

test("recovery scenario fixtures select one conservative disposition", async () => {
  const fixtures = JSON.parse(await fs.readFile(FIXTURES, "utf8"));
  assert.equal(fixtures.length, 26);
  assert.equal(new Set(fixtures.map(({ id }) => id)).size, fixtures.length);
  for (const fixture of fixtures) {
    assert.equal(classifyRecovery(fixture), fixture.expected, fixture.id);
    assert.ok(typeof fixture.next === "string" && fixture.next.length > 10, fixture.id);
  }
  assert.deepEqual(new Set(fixtures.map(({ expected }) => expected)), new Set([
    "continue", "retry_proven_safe", "verify", "wait_approval", "wait_capacity",
    "resume_worker", "propose_replacement", "redirect", "reconcile", "paused",
    "terminal_noop",
  ]));
  const byId = Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture]));
  assert.equal(byId["commit-before-task-close"].checkpoint, "commit_present");
  assert.equal(byId["lost-mutation-receipt"].canonicalState, "advanced");
  assert.equal(byId["unrelated-new-task"].messageScope, "unrelated");
});
