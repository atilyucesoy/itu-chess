import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

// Retry only transient transport/server failures. A successful HTTP response
// with the wrong digest is never accepted or silently substituted.
export async function downloadVerified(
  url,
  sha256,
  fetchImpl = fetch,
  wait = sleep,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response, buffer;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/octet-stream" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3)
        throw new Error("Engine download failed after four attempts", {
          cause: error,
        });
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (!response.ok) {
      if (
        (response.status >= 500 ||
          response.status === 408 ||
          response.status === 429) &&
        attempt < 3
      ) {
        await wait(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Engine download failed: ${response.status}`);
    }
    if (createHash("sha256").update(buffer).digest("hex") !== sha256)
      throw new Error("Engine checksum mismatch");
    return buffer;
  }
  throw new Error("Engine download failed");
}
