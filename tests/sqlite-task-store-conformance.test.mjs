import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SQLiteTaskStore } from "../readme/meta/framework-data/sqlite-task-store.mjs";
import { registerTaskStoreConformance } from "./task-store-conformance.mjs";

async function createSQLiteTaskStoreFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-task-store-conformance-"));
  const databasePath = path.join(root, "tasks.sqlite");
  const handles = [];
  const open = async () => {
    const store = new SQLiteTaskStore(databasePath);
    handles.push(store);
    return store;
  };
  let cleaned = false;
  return {
    store: await open(),
    reopen: open,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      for (const store of handles.reverse()) {
        try {
          store.close();
        } catch {
          // A fixture may already have closed a handle while exercising cleanup.
        }
      }
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

registerTaskStoreConformance({
  adapterName: "SQLiteTaskStore",
  createFixture: createSQLiteTaskStoreFixture,
});
