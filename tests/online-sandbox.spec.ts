import { test, expect, type APIRequestContext } from "@playwright/test";
import { expected } from "../shared/ratings";
type RequestFactory = { request: typeof import("@playwright/test").request };

const base = "https://127.0.0.1:3100";
const board = {
  username: "reviewboard",
  password: "board-test-password-12345",
};
async function api(playwright: RequestFactory) {
  return playwright.request.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
  });
}
async function ownerAndBoard(playwright: RequestFactory) {
  const owner = await api(playwright);
  expect(
    (
      await owner.post("/api/login", {
        data: { username: "testowner", password: "test-password-12345" },
      })
    ).ok(),
  ).toBeTruthy();
  const managers = await (await owner.get("/api/managers")).json();
  if (
    !managers.some((m: { username: string }) => m.username === board.username)
  ) {
    const snap = await (await owner.get("/api/state")).json();
    expect(
      (
        await owner.post("/api/action", {
          data: {
            revision: snap.revision,
            action: "manager.create",
            payload: { ...board, name: "Yönetim Kurulu" },
          },
        })
      ).ok(),
    ).toBeTruthy();
  }
  return owner;
}
async function mutate(
  client: APIRequestContext,
  action: string,
  payload: object,
) {
  const snap = await (await client.get("/api/state")).json();
  const response = await client.post("/api/action", {
    data: { revision: snap.revision, workspace: "sandbox", action, payload },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("production HTTPS: shared organizer can complete and reset a test event without changing real records", async ({
  browser,
  playwright,
}) => {
  const owner = await ownerAndBoard(playwright);
  const before = await (await owner.get("/api/backup")).json();
  const context = await browser.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/#sandbox");
  await page
    .getByRole("button", { name: "Denemek için yönetici girişi" })
    .click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill(board.username);
  await page.getByLabel("Şifre", { exact: true }).fill(board.password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page
    .getByRole("button", { name: "Yeni deneme başlat", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Deneme ortamı" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Deneme ortamı" }),
  ).toContainText("GERÇEK KAYITLARDAN AYRI");
  let state = await (await page.request.get(base + "/api/state")).json();
  expect(state.workspace).toBe("sandbox");
  expect(state.user.role).toBe("organizer");
  expect(state.developerAvailable).toBe(false);
  expect(state.sandboxAvailable).toBe(true);
  expect(state.state.players).toEqual([]);
  expect(state.state.tournaments).toEqual([]);
  const sandboxCookie = (await context.cookies()).find(
    (c) => c.name === "itu_sandbox",
  )!;
  expect(sandboxCookie.secure).toBe(true);
  expect(sandboxCookie.httpOnly).toBe(true);
  expect(sandboxCookie.sameSite).toBe("Strict");
  for (const name of ["Deneme Ali", "Deneme Ece"])
    await mutate(page.request, "player.create", {
      name,
      official: 1800,
      officialType: "ELO",
    });
  await page.reload();
  await page.getByRole("button", { name: "Yeni turnuva", exact: true }).click();
  await page.getByLabel("Turnuva adı").fill("Arkadaş geri bildirim denemesi");
  await page.getByLabel("Tur sayısı").fill("1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Turnuva oluştur", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Arkadaş geri bildirim denemesi/ })
    .click();
  await page.getByRole("button", { name: "Tümünü seç", exact: true }).click();
  await page.getByRole("button", { name: "2 oyuncuyu kaydet" }).click();
  await page
    .getByRole("button", { name: "1. turu eşlendir", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Paylaş", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Masa 1 sonucu", { exact: true }).selectOption("1-0");
  await page
    .getByRole("button", { name: "Turnuvayı tamamla", exact: true })
    .click();
  await expect(page.getByText("TURNUVANIN PODYUMU")).toBeVisible();
  state = await (await page.request.get(base + "/api/state")).json();
  expect(state.state.tournaments[0].status).toBe("finished");
  expect(
    state.state.players.every((p: { itu: number | null }) => p.itu !== null),
  ).toBeTruthy();
  expect(state.state.audit.length).toBeGreaterThan(0);
  expect((await page.request.get(base + "/api/backup")).status()).toBe(403);
  expect(
    (
      await page.request.post(base + "/api/action", {
        data: {
          revision: state.revision,
          workspace: "sandbox",
          action: "manager.create",
          payload: {
            name: "blocked",
            username: "blocked",
            password: "not-a-real-password-123",
          },
        },
      })
    ).status(),
  ).toBe(403);
  await page.screenshot({
    path: "test-results/online-sandbox.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Denemeyi sıfırla", exact: true })
    .click();
  await expect(
    page.getByText("Deneme verileri tamamen temizlendi."),
  ).toBeVisible();
  state = await (await page.request.get(base + "/api/state")).json();
  for (const key of ["players", "tournaments", "audit", "overrides"])
    expect(state.state[key]).toEqual([]);
  await mutate(page.request, "player.create", {
    name: "Çıkışta silinecek",
    official: null,
    officialType: "ELO",
  });
  const oldCookies = (await context.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  await page
    .getByRole("button", { name: "Kulüp kayıtlarına dön", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Deneme ortamı" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Deneme alanını aç", exact: true }),
  ).toBeVisible();
  expect(await (await owner.get("/api/backup")).json()).toEqual(before);
  const expired = await (
    await page.request.get(base + "/api/state", {
      headers: { Cookie: oldCookies },
    })
  ).json();
  expect(expired.workspace).toBe("expired");
  expect(expired.state.players).toEqual([]);
  expect(
    (
      await page.request.post(base + "/api/action", {
        headers: { Cookie: oldCookies },
        data: {
          revision: 0,
          workspace: "sandbox",
          action: "player.create",
          payload: {},
        },
      })
    ).status(),
  ).toBe(410);
  expect(await (await owner.get("/api/backup")).json()).toEqual(before);
  await context.close();
  await owner.dispose();
});

test("production: different browsers on the same board account have independent reset/exit boundaries", async ({
  playwright,
}) => {
  const owner = await ownerAndBoard(playwright);
  const before = await (await owner.get("/api/backup")).json();
  const a = await api(playwright),
    b = await api(playwright);
  for (const client of [a, b]) {
    expect(
      (await client.post("/api/login", { data: board })).ok(),
    ).toBeTruthy();
    const response = await client.post("/api/sandbox/enter", {
      data: { confirm: true },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["set-cookie"]).toContain("Secure");
  }
  await mutate(a, "player.create", {
    name: "A tarayıcısı",
    official: null,
    officialType: "ELO",
  });
  expect((await (await b.get("/api/state")).json()).state.players).toEqual([]);
  await mutate(b, "player.create", {
    name: "B tarayıcısı",
    official: null,
    officialType: "ELO",
  });
  const sa = await (await a.get("/api/state")).json();
  expect(
    (
      await a.post("/api/sandbox/reset", {
        data: { confirm: true, revision: sa.revision },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await (await a.get("/api/state")).json()).state.players).toEqual([]);
  expect(
    (await (await b.get("/api/state")).json()).state.players.map(
      (p: { name: string }) => p.name,
    ),
  ).toEqual(["B tarayıcısı"]);
  await a.post("/api/sandbox/exit", { data: {} });
  expect((await (await b.get("/api/state")).json()).workspace).toBe("sandbox");
  await b.post("/api/sandbox/exit", { data: {} });
  expect(await (await owner.get("/api/backup")).json()).toEqual(before);
  await a.dispose();
  await b.dispose();
  await owner.dispose();
});

test("production: online sandbox still requires authentication and does not expose developer mode", async ({
  playwright,
}) => {
  const anonymous = await api(playwright);
  const health = await (await anonymous.get("/api/health")).json();
  expect(health.onlineSandboxEnabled).toBe(true);
  const state = await (await anonymous.get("/api/state")).json();
  expect(state.user).toBeNull();
  expect(state.sandboxAvailable).toBe(false);
  expect(
    (
      await anonymous.post("/api/sandbox/enter", { data: { confirm: true } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await anonymous.post("/api/sandbox/reset", {
        data: { confirm: true, revision: 0 },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await anonymous.post("/api/developer/enter", { data: { confirm: true } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await anonymous.post("/api/sandbox/enter", {
        headers: { Origin: "https://untrusted.example" },
        data: { confirm: true },
      })
    ).status(),
  ).toBe(403);
  expect((await anonymous.get("/api/backup")).status()).toBe(403);
  expect((await anonymous.get("/api/managers")).status()).toBe(403);
  await anonymous.dispose();
});

test("production: the sandbox starts from a copy of the club roster and leaves it untouched", async ({
  playwright,
}) => {
  const owner = await ownerAndBoard(playwright);
  const roster = [
    ["Gerçek Bir", 1810],
    ["Gerçek İki", 1620],
  ] as const;
  for (const [name, official] of roster) {
    const snap = await (await owner.get("/api/state")).json();
    const response = await owner.post("/api/action", {
      data: {
        revision: snap.revision,
        action: "player.create",
        payload: { name, official, officialType: "ELO" },
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  let state = await (await owner.get("/api/state")).json();
  const liveIds = state.state.players.map((p: { id: string }) => p.id);
  expect(liveIds.length).toBe(2);
  const live = await (await owner.get("/api/backup")).json();

  for (const client of [owner]) {
    const entered = await client.post("/api/sandbox/enter", {
      data: { confirm: true },
    });
    expect(entered.ok(), await entered.text()).toBeTruthy();
  }
  state = await (await owner.get("/api/state")).json();
  expect(state.workspace).toBe("sandbox");
  expect(state.state.players.map((p: { name: string }) => p.name)).toEqual([
    "Gerçek Bir",
    "Gerçek İki",
  ]);
  expect(state.state.players[0].official).toBe(1810);
  expect(state.state.players[0].itu).toBeNull();
  expect(state.state.tournaments).toEqual([]);

  const [first, second] = state.state.players;
  await mutate(owner, "player.update", {
    id: first.id,
    name: "Deneme Bir",
    official: 2400,
    officialType: "ELO",
  });
  await mutate(owner, "player.archive", { id: second.id, archived: true });
  // Replaying history that was never copied would wipe every rating.
  const snapshot = await (await owner.get("/api/state")).json();
  const recalculate = await owner.post("/api/action", {
    data: {
      revision: snapshot.revision,
      workspace: "sandbox",
      action: "ratings.recalculate",
      payload: { confirm: true },
    },
  });
  expect(recalculate.status()).toBe(400);
  // The archived player never played a real event, so a hard delete is allowed.
  await mutate(owner, "player.delete", { id: second.id });
  state = await (await owner.get("/api/state")).json();
  expect(state.state.players.map((p: { name: string }) => p.name)).toEqual([
    "Deneme Bir",
  ]);
  expect(state.state.players[0].official).toBe(2400);

  await owner.post("/api/sandbox/exit", { data: {} });
  expect(await (await owner.get("/api/backup")).json()).toEqual(live);
  state = await (await owner.get("/api/state")).json();
  expect(state.state.players.map((p: { name: string }) => p.name)).toEqual([
    "Gerçek Bir",
    "Gerçek İki",
  ]);
  expect(state.state.players[0].official).toBe(1810);

  for (const id of liveIds) {
    const snap = await (await owner.get("/api/state")).json();
    const removed = await owner.post("/api/action", {
      data: {
        revision: snap.revision,
        action: "player.delete",
        payload: { id },
      },
    });
    expect(removed.ok(), await removed.text()).toBeTruthy();
  }
  expect((await (await owner.get("/api/state")).json()).state.players).toEqual(
    [],
  );
  await owner.dispose();
});

test("production HTTPS: seeded ITU ratings survive sandbox finalization and nonparticipants keep their values", async ({
  playwright,
}) => {
  const owner = await ownerAndBoard(playwright);
  const write = async (action: string, payload: object) => {
    const s = await (await owner.get("/api/state")).json();
    const r = await owner.post("/api/action", {
      data: { revision: s.revision, workspace: "club", action, payload },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  };
  for (const name of ["Baseline One", "Baseline Two", "Baseline Untouched"])
    await write("player.create", { name, official: 1800, officialType: "ELO" });
  let state = await (await owner.get("/api/state")).json();
  const ids = state.state.players
    .filter((p: { name: string }) => p.name.startsWith("Baseline "))
    .map((p: { id: string }) => p.id);
  await write("ratings.override", {
    playerId: ids[2],
    value: 2150,
    reason: "Fixture baseline",
  });
  await write("tournament.create", {
    name: "Isolated primary fixture",
    date: "2026-11-09",
    roundsPlanned: 1,
    timeControl: "3+2",
    countsPoints: true,
    countsRating: true,
  });
  state = await (await owner.get("/api/state")).json();
  let t = state.state.tournaments.find(
    (t: { name: string }) => t.name === "Isolated primary fixture",
  );
  await write("tournament.entries", {
    tournamentId: t.id,
    playerIds: ids.slice(0, 2),
  });
  await write("round.generate", { tournamentId: t.id });
  await write("round.result", {
    tournamentId: t.id,
    round: 1,
    board: 1,
    result: "1-0",
  });
  await write("tournament.finalize", { tournamentId: t.id });
  const before = await (await owner.get("/api/backup")).json();
  const inherited = before.state.players.filter((p: { id: string }) =>
    ids.includes(p.id),
  );
  expect(
    inherited
      .slice(0, 2)
      .map((p: { itu: number }) => p.itu)
      .sort((a: number, b: number) => a - b),
  ).toEqual([1780, 1820]);
  await owner.post("/api/sandbox/enter", { data: { confirm: true } });
  await mutate(owner, "tournament.create", {
    name: "Seeded rating exercise",
    date: "2026-11-09",
    roundsPlanned: 1,
    timeControl: "3+2",
    countsPoints: true,
    countsRating: true,
  });
  state = await (await owner.get("/api/state")).json();
  t = state.state.tournaments[0];
  await mutate(owner, "tournament.entries", {
    tournamentId: t.id,
    playerIds: ids.slice(0, 2),
  });
  await mutate(owner, "round.generate", { tournamentId: t.id });
  await mutate(owner, "round.result", {
    tournamentId: t.id,
    round: 1,
    board: 1,
    result: "1/2",
  });
  await mutate(owner, "tournament.lots", { tournamentId: t.id, confirm: true });
  await mutate(owner, "tournament.finalize", { tournamentId: t.id });
  state = await (await owner.get("/api/state")).json();
  expect(state.state.ratingBaseline).toBeUndefined();
  for (let i = 0; i < 2; i++) {
    const p = inherited[i],
      other = inherited[1 - i],
      after = state.state.players.find((p2: { id: string }) => p2.id === p.id);
    expect(after.itu).toBe(
      Math.round(p.itu + 40 * (0.5 - expected(p.itu, other.itu))),
    );
    expect(after.games).toBe(p.games + 1);
  }
  expect(
    state.state.players.find((p: { id: string }) => p.id === ids[2]),
  ).toEqual(inherited[2]);
  await owner.post("/api/sandbox/reset", {
    data: { confirm: true, revision: state.revision },
  });
  state = await (await owner.get("/api/state")).json();
  expect(state.state.players).toEqual(before.state.players);
  expect(state.state.tournaments).toEqual([]);
  await owner.post("/api/sandbox/exit", { data: {} });
  expect(await (await owner.get("/api/backup")).json()).toEqual(before);
  await owner.dispose();
});
