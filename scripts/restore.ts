import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { backupSchema } from "../server/backup-schema.js";
import { createStore } from "../server/store.js";
import { migrateState } from "../shared/migrate.js";
const file = process.argv[2];
if (!file || !process.argv.includes("--confirm-replace"))
  throw new Error(
    "Stop the server first. Usage: npm run backup:restore -- <backup.json> --confirm-replace",
  );
const backup = backupSchema.parse(
  JSON.parse(await readFile(resolve(file), "utf8")),
);
const store = createStore();
const current = await store.load();
await mkdir("data/recovery", { recursive: true, mode: 0o700 });
const safetyCopy = `data/recovery/before-restore-${Date.now()}.json`;
await writeFile(
  safetyCopy,
  JSON.stringify({ schemaVersion: 1, ...current }, null, 2),
  { mode: 0o600, flag: "wx" },
);
if (!(await store.save(migrateState(backup.state), current.revision)))
  throw new Error(
    "Concurrent change detected; nothing restored. Stop the server and retry.",
  );
console.log(
  `Restored ${backup.state.players.length} players and ${backup.state.tournaments.length} tournaments. Previous state saved privately to ${safetyCopy}. Restart with a NEW SESSION_SECRET to revoke existing sessions.`,
);
