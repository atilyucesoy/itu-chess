import { randomBytes } from "node:crypto";
import { emptyState, type Snapshot, type State } from "../shared/types.js";
import type { Store } from "./store.js";
import type { RatingBaseline } from "../shared/ratings.js";
// The sandbox starts from a copy of the club roster so that pairing and rating
// behaviour can be exercised with realistic values. Managers, events,
// overrides and the audit trail are deliberately NOT copied: they are the
// club's permanent record and cannot be replayed in a throwaway workspace.
export type SandboxSeed = Pick<
  State,
  "policy" | "semesters" | "activeSemester" | "players"
>;
function seededState(seed: SandboxSeed): State {
  return {
    ...emptyState(),
    semesters: [...seed.semesters],
    activeSemester: seed.activeSemester,
    policy: structuredClone(seed.policy),
    // Deep copy: editing a sandbox player must never touch live club records.
    players: structuredClone(seed.players),
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
  private baseline: RatingBaseline;
  constructor(
    seed: SandboxSeed,
    private maxBytes = 2 * 1024 * 1024,
  ) {
    this.state = seededState(seed);
    this.baseline = this.captureBaseline(seed);
  }
  private captureBaseline(seed: SandboxSeed): RatingBaseline {
    return new Map(
      seed.players.map((p) => [p.id, { rating: p.itu, games: p.games }]),
    );
  }
  // Internal replay context, never part of State or an HTTP/backup payload.
  ratingBaseline(): RatingBaseline {
    return structuredClone(this.baseline);
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
  reset(seed: SandboxSeed, expected?: number) {
    if (this.closed || (expected !== undefined && expected !== this.revision))
      return false;
    this.state = seededState(seed);
    this.baseline = this.captureBaseline(seed);
    this.revision++;
    return true;
  }
  dispose() {
    this.state = emptyState();
    this.baseline = new Map();
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
  create(managerId: string, seed: SandboxSeed) {
    this.cleanup();
    if (this.sessions.size >= 20)
      throw new Error(
        "Çok fazla deneme oturumu açık. Kullanmadığınız oturumlardan çıkın.",
      );
    const token = randomBytes(32).toString("hex");
    const store = new MemorySandboxStore(seed);
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
