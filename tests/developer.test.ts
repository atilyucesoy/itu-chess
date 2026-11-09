import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, type Player } from "../shared/types.js";
import {
  MemorySandboxStore,
  SandboxRegistry,
  developerModeEnabled,
  onlineSandboxEnabled,
  canUseSandbox,
  sandboxToken,
} from "../server/developer.js";

function seed(players: Player[] = []) {
  return {
    policy: DEFAULT_POLICY,
    semesters: ["2026–2027 Güz"],
    activeSemester: "2026–2027 Güz",
    players,
  };
}

test("developer mode is explicit and always disabled in production", () => {
  assert.equal(developerModeEnabled({}), false);
  assert.equal(
    developerModeEnabled({
      NODE_ENV: "development",
      ENABLE_DEVELOPER_MODE: "1",
    }),
    true,
  );
  assert.equal(
    developerModeEnabled({
      NODE_ENV: "production",
      ENABLE_DEVELOPER_MODE: "1",
    }),
    false,
  );
});
test("the narrow online sandbox admits both manager roles without enabling production developer mode", () => {
  const env = { NODE_ENV: "production", ENABLE_DEVELOPER_MODE: "1" };
  assert.equal(developerModeEnabled(env), false);
  assert.equal(onlineSandboxEnabled(env), true);
  assert.equal(canUseSandbox("owner", true, false), true);
  assert.equal(canUseSandbox("organizer", true, false), true);
  assert.equal(canUseSandbox(undefined, true, false), false);
  assert.equal(onlineSandboxEnabled({ ENABLE_ONLINE_SANDBOX: "0" }), false);
  assert.equal(canUseSandbox("organizer", false, false), false);
  assert.equal(canUseSandbox("owner", false, false), false);
  assert.equal(canUseSandbox("owner", false, true), true);
});
test("oversized sandbox states are rejected without persisting the attempted mutation", async () => {
  const store = new MemorySandboxStore(seed(), 1000);
  const before = await store.load();
  before.state.audit.push({ action: "x".repeat(1500), by: "test", at: "now" });
  await assert.rejects(
    () => store.save(before.state, before.revision),
    /boyut sınırına/,
  );
  assert.deepEqual((await store.load()).state.audit, []);
  assert.equal((await store.load()).revision, before.revision);
});
test("memory sandbox loads independent copies and rejects stale writes after reset", async () => {
  const store = new MemorySandboxStore(seed());
  const before = await store.load();
  before.state.audit.push({
    action: "abc",
    by: "test",
    at: new Date().toISOString(),
  });
  assert.equal((await store.load()).state.audit.length, 0);
  assert.equal(await store.save(before.state, before.revision), true);
  const stale = await store.load();
  assert.equal(store.reset(seed(), stale.revision), true);
  assert.equal(await store.save(stale.state, stale.revision), false);
  const after = await store.load();
  assert.deepEqual(after.state.audit, []);
  assert.ok(after.revision > stale.revision);
  assert.equal(store.reset(seed(), stale.revision), false);
});
test("a sandbox starts from a copy of the roster and never shares player objects", async () => {
  const players: Player[] = [
    {
      id: "p1",
      name: "Deniz",
      official: 1858,
      officialType: "ELO",
      itu: 1830,
      games: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const store = new MemorySandboxStore(seed(players));
  const snapshot = await store.load();
  assert.deepEqual(snapshot.state.players, players);
  assert.notEqual(snapshot.state.players[0], players[0]);
  snapshot.state.players[0].itu = 2100;
  snapshot.state.players.push({ ...players[0], id: "p2", name: "Yeni" });
  assert.equal(await store.save(snapshot.state, snapshot.revision), true);
  // Editing the sandbox must never reach the live club roster.
  assert.equal(players[0].itu, 1830);
  assert.equal(players.length, 1);
  const edited = await store.load();
  assert.equal(edited.state.players.length, 2);
  store.reset(seed(players), edited.revision);
  assert.deepEqual((await store.load()).state.players, players);
});
test("discarding a sandbox invalidates in-flight saves and drops all state", async () => {
  const store = new MemorySandboxStore(seed());
  const before = await store.load();
  before.state.audit.push({
    action: "abc",
    by: "test",
    at: new Date().toISOString(),
  });
  store.dispose();
  assert.equal(await store.save(before.state, before.revision), false);
  assert.deepEqual((await store.load()).state.audit, []);
});
test("sandbox sessions are manager-bound, independently isolated, expiring and disposable", async () => {
  let now = 100;
  const registry = new SandboxRegistry(() => now, 1000);
  const a = registry.create("owner-a", seed());
  const b = registry.create("owner-b", seed());
  assert.equal(registry.resolve(a, "owner-b"), null);
  assert.notEqual(
    registry.resolve(a, "owner-a"),
    registry.resolve(b, "owner-b"),
  );
  const memory = registry.resolve(a, "owner-a")!;
  registry.drop(a, "owner-b");
  assert.equal(registry.resolve(a, "owner-a"), memory);
  registry.drop(a, "owner-a");
  assert.equal(registry.resolve(a, "owner-a"), null);
  now += 1001;
  assert.equal(registry.resolve(b, "owner-b"), null);
  assert.equal(sandboxToken(`itu_session=unrelated; itu_sandbox=${b}`), b);
  assert.equal(sandboxToken("itu_sandbox=invalid"), null);
});
