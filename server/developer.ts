import { randomBytes } from "node:crypto";
import {
  emptyState,
  type Policy,
  type Snapshot,
  type State,
} from "../shared/types.js";
import type { Store } from "./store.js";

export function developerModeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.ENABLE_DEVELOPER_MODE === "1";
}

// Never writes to SQLite, Supabase, backups or the production audit trail.
// Revisions stay monotonic across resets, so in-flight requests cannot revive data.
export class MemorySandboxStore implements Store {
  private state: State;
  private revision = 0;
  private closed = false;
  constructor(policy: Policy) {
    this.state = { ...emptyState(), policy: structuredClone(policy) };
  }
  async load(): Promise<Snapshot> {
    return { revision: this.revision, state: structuredClone(this.state) };
  }
  async save(state: State, expected: number) {
    if (this.closed || expected !== this.revision) return false;
    this.state = structuredClone(state);
    this.revision++;
    return true;
  }
  reset(policy: Policy, expected?: number) {
    if (this.closed || (expected !== undefined && expected !== this.revision))
      return false;
    this.state = { ...emptyState(), policy: structuredClone(policy) };
    this.revision++;
    return true;
  }
  dispose() {
    this.reset(this.state.policy);
    this.closed = true;
  }
}

export class SandboxRegistry {
  private sessions = new Map<
    string,
    { ownerId: string; expires: number; store: MemorySandboxStore }
  >();
  constructor(
    private now: () => number = Date.now,
    private ttl = 4 * 60 * 60_000,
  ) {}
  create(ownerId: string, policy: Policy) {
    this.cleanup();
    if (this.sessions.size >= 20)
      throw new Error(
        "Çok fazla deneme oturumu açık. Kullanmadığınız oturumlardan çıkın.",
      );
    const token = randomBytes(32).toString("hex");
    const store = new MemorySandboxStore(policy);
    this.sessions.set(token, {
      ownerId,
      expires: this.now() + this.ttl,
      store,
    });
    return token;
  }
  resolve(token: string, ownerId: string) {
    this.cleanup();
    const session = this.sessions.get(token);
    return session?.ownerId === ownerId ? session.store : null;
  }
  drop(token: string, ownerId: string) {
    const session = this.sessions.get(token);
    if (session?.ownerId !== ownerId) return;
    session.store.dispose();
    this.sessions.delete(token);
  }
  cleanup() {
    for (const [token, session] of this.sessions) {
      if (session.expires <= this.now()) {
        session.store.dispose();
        this.sessions.delete(token);
      }
    }
  }
}

export function sandboxToken(cookie: string | undefined) {
  const value = cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("itu_sandbox="))
    ?.slice(12);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
