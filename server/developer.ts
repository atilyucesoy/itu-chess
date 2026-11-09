import { randomBytes } from "node:crypto";
import {
  emptyState,
  type Policy,
  type Snapshot,
  type State,
} from "../shared/types.js";
import type { Store } from "./store.js";
type Periods = Pick<State, "semesters" | "activeSemester">;
function periodConfig(config: Periods) {
  return {
    semesters: [...config.semesters],
    activeSemester: config.activeSemester,
  };
}

export function developerModeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.ENABLE_DEVELOPER_MODE === "1";
}

// This is a narrow, authenticated, disposable workspace feature, NOT a switch
// that enables development behavior or anonymous access in production.
export function onlineSandboxEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ENABLE_ONLINE_SANDBOX !== "0";
}
export function canUseSandbox(
  role: "owner" | "organizer" | undefined,
  online: boolean,
  developer: boolean,
) {
  return (
    (online && (role === "owner" || role === "organizer")) ||
    (developer && role === "owner")
  );
}

// Never writes to SQLite, Supabase, backups or the production audit trail.
// Revisions stay monotonic across resets, so in-flight requests cannot revive data.
export class MemorySandboxStore implements Store {
  private state: State;
  private revision = 0;
  private closed = false;
  constructor(
    policy: Policy,
    periods?: Periods,
    private maxBytes = 2 * 1024 * 1024,
  ) {
    this.state = {
      ...emptyState(),
      ...(periods ? periodConfig(periods) : {}),
      policy: structuredClone(policy),
    };
  }
  async load(): Promise<Snapshot> {
    return { revision: this.revision, state: structuredClone(this.state) };
  }
  async save(state: State, expected: number) {
    if (this.closed || expected !== this.revision) return false;
    if (Buffer.byteLength(JSON.stringify(state), "utf8") > this.maxBytes)
      throw new Error(
        "Deneme alanı boyut sınırına ulaştı. Denemeyi sıfırlayıp tekrar deneyin.",
      );
    this.state = structuredClone(state);
    this.revision++;
    return true;
  }
  reset(policy: Policy, expected?: number, periods?: Periods) {
    if (this.closed || (expected !== undefined && expected !== this.revision))
      return false;
    this.state = {
      ...emptyState(),
      ...(periods ? periodConfig(periods) : {}),
      policy: structuredClone(policy),
    };
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
    { managerId: string; expires: number; store: MemorySandboxStore }
  >();
  constructor(
    private now: () => number = Date.now,
    private ttl = 4 * 60 * 60_000,
  ) {}
  create(managerId: string, policy: Policy, periods?: Periods) {
    this.cleanup();
    if (this.sessions.size >= 20)
      throw new Error(
        "Çok fazla deneme oturumu açık. Kullanmadığınız oturumlardan çıkın.",
      );
    const token = randomBytes(32).toString("hex");
    const store = new MemorySandboxStore(policy, periods);
    this.sessions.set(token, {
      managerId,
      expires: this.now() + this.ttl,
      store,
    });
    return token;
  }
  resolve(token: string, managerId: string) {
    this.cleanup();
    const session = this.sessions.get(token);
    return session?.managerId === managerId ? session.store : null;
  }
  drop(token: string, managerId: string) {
    const session = this.sessions.get(token);
    if (session?.managerId !== managerId) return;
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
