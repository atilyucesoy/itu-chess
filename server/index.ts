import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { createStore } from "./store.js";
import {
  authenticate,
  hashPassword,
  tokenFor,
  verifyPassword,
} from "./auth.js";
import { applyAction } from "./domain.js";
import { toTrf, ENGINE_VERSION, enginePath } from "./engine.js";
import type { Manager, State } from "../shared/types.js";
const production = process.env.NODE_ENV === "production";
const store = createStore();
let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (production)
    throw new Error("SESSION_SECRET (at least 32 characters) required.");
  const path = resolve("data/session-secret");
  secret = existsSync(path)
    ? readFileSync(path, "utf8")
    : randomBytes(32).toString("hex");
  if (!existsSync(path)) writeFileSync(path, secret, { mode: 0o600 });
}
if (secret.length < 32)
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
const sessionSecret = secret;
const snapshot = await store.load();
if (!snapshot.state.managers.length) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "First startup: set ADMIN_PASSWORD to at least 12 characters. No default password is provided.",
    );
  snapshot.state.managers.push({
    id: randomUUID(),
    username: process.env.ADMIN_USERNAME ?? "atil",
    name: process.env.ADMIN_NAME ?? "Atıl",
    role: "owner",
    passwordHash: hashPassword(password),
  });
  if (!(await store.save(snapshot.state, snapshot.revision)))
    throw new Error("Concurrent setup detected; restart.");
}
const app = express();
if (production) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
// Campus Wi-Fi may put every spectator behind one IP. Keep public polling
// usable for the whole club while applying a separate tighter login limit.
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 1200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const expected =
      process.env.APP_ORIGIN ?? `${req.protocol}://${req.get("host")}`;
    const origin = req.get("origin");
    const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        origin !== expected &&
        (production || !devOrigins.includes(origin)))
    ) {
      res.status(403).json({ error: "İstek kaynağına izin verilmedi." });
      return;
    }
  }
  next();
});
const safeUser = (m: Manager | null) =>
  m ? { id: m.id, username: m.username, name: m.name, role: m.role } : null;
function publicData(state: State) {
  return {
    players: state.players,
    tournaments: state.tournaments.map((t) => ({
      ...t,
      rounds: t.rounds.map((r) => ({ ...r, trf: "" })),
    })),
    policy: state.policy,
    overrides: [],
    audit: [],
  };
}
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    engine: ENGINE_VERSION,
    engineInstalled: existsSync(enginePath()),
    storage: process.env.SUPABASE_URL ? "supabase" : "sqlite",
  }),
);
app.get("/api/state", async (req, res) => {
  const { revision, state } = await store.load();
  const user = authenticate(req.headers.cookie, state.managers, sessionSecret);
  res.json({
    revision,
    state: user
      ? { ...publicData(state), audit: state.audit, overrides: state.overrides }
      : publicData(state),
    user: safeUser(user),
  });
});
app.post(
  "/api/login",
  rateLimit({ windowMs: 15 * 60_000, limit: 15, legacyHeaders: false }),
  async (req, res) => {
    const input = z
      .object({ username: z.string().max(80), password: z.string().max(200) })
      .parse(req.body);
    const { state } = await store.load();
    const manager = state.managers.find(
      (m) => m.username.toLowerCase() === input.username.toLowerCase(),
    );
    // Always do a password derivation, even for nonexistent users.
    const valid = verifyPassword(
      input.password,
      manager?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!manager || !valid) {
      res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });
      return;
    }
    res.cookie("itu_session", tokenFor(manager, sessionSecret), {
      httpOnly: true,
      sameSite: "strict",
      secure: production,
      maxAge: 12 * 60 * 60_000,
      path: "/",
    });
    res.json({ user: safeUser(manager) });
  },
);
app.post("/api/logout", (_req, res) => {
  res.clearCookie("itu_session", {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: production,
  });
  res.json({ ok: true });
});
app.post("/api/action", async (req, res) => {
  const input = z
    .object({
      revision: z.number().int().nonnegative(),
      action: z.string().max(80),
      payload: z.record(z.string(), z.unknown()),
    })
    .parse(req.body);
  const { revision, state } = await store.load();
  const user = authenticate(req.headers.cookie, state.managers, sessionSecret);
  if (!user) {
    res.status(401).json({ error: "Yönetici girişi gerekli." });
    return;
  }
  if (revision !== input.revision) {
    res
      .status(409)
      .json({
        error:
          "Başka bir yönetici değişiklik yaptı. Sayfa yenilendi; işlemi tekrar deneyin.",
      });
    return;
  }
  if (input.action.startsWith("manager.")) {
    if (user.role !== "owner") {
      res.status(403).json({ error: "Kulüp yöneticisi yetkisi gerekli." });
      return;
    }
    if (input.action === "manager.create") {
      const p = z
        .object({
          username: z.string().regex(/^[a-zA-Z0-9_.-]{3,40}$/),
          name: z.string().trim().min(1).max(80),
          password: z.string().min(12).max(200),
        })
        .parse(input.payload);
      if (
        state.managers.some(
          (m) => m.username.toLowerCase() === p.username.toLowerCase(),
        )
      )
        throw new Error("Kullanıcı adı zaten kullanılıyor.");
      state.managers.push({
        id: randomUUID(),
        username: p.username,
        name: p.name,
        role: "organizer",
        passwordHash: hashPassword(p.password),
      });
    } else if (input.action === "manager.remove") {
      if (input.payload.id === user.id)
        throw new Error("Kendi hesabınızı silemezsiniz.");
      state.managers = state.managers.filter(
        (m) => m.id !== input.payload.id || m.role === "owner",
      );
    } else if (input.action === "manager.password") {
      const p = z
        .object({ id: z.string(), password: z.string().min(12).max(200) })
        .parse(input.payload);
      const m = state.managers.find((m) => m.id === p.id);
      if (!m) throw new Error("Yönetici bulunamadı.");
      m.passwordHash = hashPassword(p.password);
    } else throw new Error("Bilinmeyen yönetici işlemi.");
  } else
    await applyAction(
      state,
      input.action,
      input.payload,
      user.role === "owner",
    );
  state.audit.unshift({
    at: new Date().toISOString(),
    by: user.name,
    action: input.action,
  });
  state.audit = state.audit.slice(0, 2000);
  if (!(await store.save(state, revision))) {
    res
      .status(409)
      .json({
        error: "Eşzamanlı değişiklik algılandı. Yenileyip tekrar deneyin.",
      });
    return;
  }
  res.json({ ok: true });
});
app.get("/api/managers", async (req, res) => {
  const { state } = await store.load();
  const user = authenticate(req.headers.cookie, state.managers, sessionSecret);
  if (user?.role !== "owner") {
    res.status(403).json({ error: "Yetkisiz." });
    return;
  }
  res.json(state.managers.map(safeUser));
});
app.get("/api/backup", async (req, res) => {
  const { revision, state } = await store.load();
  if (
    authenticate(req.headers.cookie, state.managers, sessionSecret)?.role !==
    "owner"
  ) {
    res.status(403).json({ error: "Yetkisiz." });
    return;
  }
  // Includes password hashes: owner-only attachment; never cached.
  res
    .attachment(
      `itu-satranc-yedek-${new Date().toISOString().slice(0, 10)}.json`,
    )
    .json({ schemaVersion: 1, revision, state });
});
app.get("/api/tournaments/:id/trf", async (req, res) => {
  const { state } = await store.load();
  const user = authenticate(req.headers.cookie, state.managers, sessionSecret);
  if (!user) {
    res.status(403).json({ error: "Yetkisiz." });
    return;
  }
  const t = state.tournaments.find((t) => t.id === req.params.id);
  if (!t) {
    res.status(404).json({ error: "Turnuva bulunamadı." });
    return;
  }
  res.attachment(`itu-${t.date}.trf`).type("text/plain").send(toTrf(t));
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "İşlem bulunamadı." });
});
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof ZodError) {
      res
        .status(400)
        .json({
          error: "Bilgileri kontrol edin.",
          details: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · "),
        });
      return;
    }
    console.error(err.message);
    res.status(400).json({ error: err.message || "İşlem tamamlanamadı." });
  },
);
const port = Number(process.env.PORT ?? 3001);
app.listen(port, production ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(`İTÜ Satranç: http://127.0.0.1:${port}`),
);
