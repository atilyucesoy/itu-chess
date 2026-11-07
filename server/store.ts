import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { emptyState, type Snapshot, type State } from "../shared/types.js";
export interface Store {
  load(): Promise<Snapshot>;
  save(state: State, expected: number): Promise<boolean>;
}
export function createStore(): Store {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    return {
      async load() {
        const { data, error } = await db
          .from("club_state")
          .select("revision, state")
          .eq("id", 1)
          .single();
        if (error) throw new Error(`Veritabanı okunamadı: ${error.message}`);
        return data as Snapshot;
      },
      async save(state, expected) {
        const { data, error } = await db.rpc("save_club_state", {
          expected_revision: expected,
          new_state: state,
        });
        if (error) throw new Error(`Veritabanı yazılamadı: ${error.message}`);
        return data === true;
      },
    };
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_DB)
    throw new Error(
      "Production requires Supabase. Ephemeral hosting must not use SQLite.",
    );
  const path = resolve(process.env.DB_PATH ?? "data/club.sqlite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS club_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, state TEXT NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO club_state VALUES (1, 0, ?)").run(
    JSON.stringify(emptyState()),
  );
  return {
    async load() {
      const row = db
        .prepare("SELECT revision, state FROM club_state WHERE id=1")
        .get() as { revision: number; state: string };
      return { revision: row.revision, state: JSON.parse(row.state) };
    },
    async save(state, expected) {
      return (
        db
          .prepare(
            "UPDATE club_state SET state=?, revision=revision+1 WHERE id=1 AND revision=?",
          )
          .run(JSON.stringify(state), expected).changes === 1
      );
    },
  };
}
