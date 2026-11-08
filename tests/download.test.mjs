import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { downloadVerified } from "../scripts/download.mjs";
const data = Buffer.from("verified fixture");
const digest = createHash("sha256").update(data).digest("hex");
const ok = () => ({ ok: true, arrayBuffer: async () => data });
test("download retries transient 504s with bounded backoff and verifies the result", async () => {
  let calls = 0;
  const delays = [];
  const result = await downloadVerified(
    "https://example.test/engine",
    digest,
    async () => (++calls < 3 ? { ok: false, status: 504 } : ok()),
    async (delay) => {
      delays.push(delay);
    },
  );
  assert.deepEqual(result, data);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});
test("a missing release is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      downloadVerified(
        "https://example.test/engine",
        digest,
        async () => {
          calls++;
          return { ok: false, status: 404 };
        },
        async () => {},
      ),
    /404/,
  );
  assert.equal(calls, 1);
});
test("network errors stop after four attempts", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      downloadVerified(
        "https://example.test/engine",
        digest,
        async () => {
          calls++;
          throw new Error("offline");
        },
        async () => {},
      ),
    /four attempts/,
  );
  assert.equal(calls, 4);
});
test("a bad checksum fails immediately, without retry or extraction", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      downloadVerified(
        "https://example.test/engine",
        "bad-digest",
        async () => {
          calls++;
          return ok();
        },
        async () => {},
      ),
    /checksum mismatch/,
  );
  assert.equal(calls, 1);
});
