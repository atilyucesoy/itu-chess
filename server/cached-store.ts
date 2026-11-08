import type { Snapshot } from "../shared/types.js";
import type { Store } from "./store.js";

// Share short-lived source reads across spectators. Mutations still use the
// source's atomic CAS; successful saves invalidate cache and in-flight reads.
// Always return copies so a request cannot mutate the shared authenticated state.
export function cachedStore(source: Store, ttl = 5000, now = Date.now): Store {
  let generation = 0;
  let cached: { snapshot: Snapshot; expires: number } | null = null;
  let pending: { generation: number; promise: Promise<Snapshot> } | null = null;
  return {
    async load() {
      if (cached && cached.expires > now())
        return structuredClone(cached.snapshot);
      const epoch = generation;
      const promise =
        pending?.generation === epoch ? pending.promise : source.load();
      pending = { generation: epoch, promise };
      try {
        const snapshot = await promise;
        if (generation === epoch)
          cached = {
            snapshot: structuredClone(snapshot),
            expires: now() + ttl,
          };
        return structuredClone(snapshot);
      } finally {
        if (pending?.promise === promise) pending = null;
      }
    },
    async save(state, expected) {
      const saved = await source.save(state, expected);
      if (saved) {
        generation++;
        cached = null;
        pending = null;
      }
      return saved;
    },
  };
}
