import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Snapshot } from "../shared/types.js";
import { cachedStore } from "../server/cached-store.js";
import type { Store } from "../server/store.js";

test("shared reads use one source request, return copies and expire", async () => {
  let now = 0,
    reads = 0;
  const source: Store = {
    async load() {
      reads++;
      return { revision: 0, state: emptyState() };
    },
    async save() {
      return false;
    },
  };
  const cache = cachedStore(source, 5000, () => now);
  const [a, b] = await Promise.all([cache.load(), cache.load()]);
  assert.equal(reads, 1);
  a.state.audit.push({ action: "private mutation", by: "test", at: "now" });
  assert.deepEqual(b.state.audit, []);
  assert.deepEqual((await cache.load()).state.audit, []);
  now = 5001;
  await cache.load();
  assert.equal(reads, 2);
});
test("source CAS remains authoritative and a successful mutation immediately invalidates cache", async () => {
  let current: Snapshot = { revision: 0, state: emptyState() };
  let reads = 0;
  const source: Store = {
    async load() {
      reads++;
      return structuredClone(current);
    },
    async save(state, expected) {
      if (expected !== current.revision) return false;
      current = { revision: expected + 1, state: structuredClone(state) };
      return true;
    },
  };
  const cache = cachedStore(source);
  const before = await cache.load();
  before.state.activeSemester = "updated";
  assert.equal(await cache.save(before.state, before.revision), true);
  assert.equal((await cache.load()).state.activeSemester, "updated");
  assert.equal(reads, 2);
  assert.equal(await cache.save(emptyState(), 0), false);
  assert.equal((await cache.load()).revision, 1);
});
test("a source read begun before a save cannot overwrite the new cache generation", async () => {
  const old: Snapshot = { revision: 0, state: emptyState() };
  let resolve!: (snapshot: Snapshot) => void;
  const pending = new Promise<Snapshot>((r) => {
    resolve = r;
  });
  let reads = 0;
  let current = old;
  const source: Store = {
    async load() {
      reads++;
      return reads === 1 ? pending : structuredClone(current);
    },
    async save(state, expected) {
      current = { revision: expected + 1, state };
      return true;
    },
  };
  const cache = cachedStore(source);
  const earlier = cache.load();
  await cache.save({ ...emptyState(), activeSemester: "new" }, 0);
  assert.equal((await cache.load()).revision, 1);
  resolve(old);
  await earlier;
  assert.equal((await cache.load()).state.activeSemester, "new");
  assert.equal(reads, 2);
});
test("failed reads are not cached or served as successful stale data", async () => {
  let calls = 0;
  const cache = cachedStore({
    async load() {
      if (++calls === 1) throw new Error("database paused");
      return { revision: 0, state: emptyState() };
    },
    async save() {
      return false;
    },
  });
  await assert.rejects(() => cache.load(), /paused/);
  assert.equal((await cache.load()).revision, 0);
  assert.equal(calls, 2);
});
