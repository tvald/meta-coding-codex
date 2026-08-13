import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileTaskStore } from "../readme/meta/framework-data/file-task-store.mjs";
import { repositoryContext } from "../readme/meta/framework-data/store.mjs";
import { registerTaskStoreConformance } from "./task-store-conformance.mjs";

async function createFileTaskStoreFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "file-task-store-conformance-"));
  await fs.mkdir(path.join(root, "readme", "tasks"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  const open = async () => new FileTaskStore(await repositoryContext(root));
  let cleaned = false;
  return {
    store: await open(),
    reopen: open,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

registerTaskStoreConformance({
  adapterName: "FileTaskStore",
  createFixture: createFileTaskStoreFixture,
});
