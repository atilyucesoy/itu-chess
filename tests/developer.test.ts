import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../shared/types.js";
import {
  MemorySandboxStore,
  SandboxRegistry,
  developerModeEnabled,
  sandboxToken,
} from "../server/developer.js";

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
test("memory sandbox loads independent copies and rejects stale writes after reset", async () => {
  const store = new MemorySandboxStore(DEFAULT_POLICY);
  const before = await store.load();
  before.state.audit.push({
    action: "abc",
    by: "test",
    at: new Date().toISOString(),
  });
  assert.equal((await store.load()).state.audit.length, 0);
  assert.equal(await store.save(before.state, before.revision), true);
  const stale = await store.load();
  assert.equal(store.reset(DEFAULT_POLICY, stale.revision), true);
  assert.equal(await store.save(stale.state, stale.revision), false);
  const after = await store.load();
  assert.deepEqual(after.state.audit, []);
  assert.ok(after.revision > stale.revision);
  assert.equal(store.reset(DEFAULT_POLICY, stale.revision), false);
});
test("discarding a sandbox invalidates in-flight saves and drops all state", async () => {
  const store = new MemorySandboxStore(DEFAULT_POLICY);
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
test("sandbox sessions are owner-bound, independently isolated, expiring and disposable", async () => {
  let now = 100;
  const registry = new SandboxRegistry(() => now, 1000);
  const a = registry.create("owner-a", DEFAULT_POLICY);
  const b = registry.create("owner-b", DEFAULT_POLICY);
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
