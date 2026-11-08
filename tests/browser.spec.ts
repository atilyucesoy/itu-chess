import { test, expect } from "@playwright/test";

test("Turkish website: login, registry, event, pairing, results, finish, next-event ITU seed and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Genel bakış", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yönetici girişi" }).click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill("testowner");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password-12345");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("Hoş geldin, Test Yöneticisi")).toBeVisible();
  await page.getByRole("link", { name: "Oyuncular", exact: true }).click();
  await page.getByRole("button", { name: "Oyuncu ekle" }).click();
  await page.getByLabel("Ad soyad").fill("Deniz Yılmaz");
  await expect(page.getByLabel("Ad soyad")).not.toHaveAttribute(
    "placeholder",
    /Deniz/,
  );
  await page.getByRole("spinbutton", { name: /Resmî rating/ }).fill("1800");
  await page.getByRole("button", { name: "Oyuncuyu kaydet" }).click();
  await expect(
    page.getByRole("button", { name: "D Deniz Yılmaz" }),
  ).toBeVisible();
  const names = [
    "Ece Kaya",
    "Can Demir",
    "Ada Çelik",
    "Arda Koç",
    "Duru Şahin",
    "Bora Akın",
    "Selin Işık",
  ];
  for (let i = 0; i < names.length; i++) {
    const snapshot = await (await page.request.get("/api/state")).json();
    const res = await page.request.post("/api/action", {
      data: {
        revision: snapshot.revision,
        action: "player.create",
        payload: {
          name: names[i],
          official: i < 3 ? 1700 - i * 50 : null,
          officialType: "UKD",
        },
      },
    });
    expect(res.ok()).toBeTruthy();
  }
  await page.reload();
  await page.getByRole("link", { name: "Turnuvalar", exact: true }).click();
  await page.getByRole("button", { name: "Yeni turnuva", exact: true }).click();
  await page.getByLabel("Turnuva adı").fill("Cuma Yıldırım · Test");
  await page.getByLabel("Tur sayısı").fill("1");
  await expect(page.getByLabel("Satranç türü")).toHaveCount(0);
  await expect(page.getByRole("dialog")).not.toContainText("Chess960");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Turnuva oluştur", exact: true })
    .click();
  await page.getByRole("button", { name: /Cuma Yıldırım · Test/ }).click();
  await page.getByRole("button", { name: "Tümünü seç" }).click();
  await page.getByRole("button", { name: "8 oyuncuyu kaydet" }).click();
  await page.getByRole("button", { name: "1. turu eşlendir" }).click();
  await expect(
    page.getByRole("heading", { name: "1. tur eşlendirmeleri" }),
  ).toBeVisible();
  for (let board = 1; board <= 4; board++)
    await page
      .getByLabel(`Masa ${board} sonucu`, { exact: true })
      .selectOption(board % 2 ? "1-0" : "0-1");
  page.on("dialog", (d) => d.accept());
  const lots = page.getByRole("button", { name: "Eşitlik kurasını çek" });
  if (await lots.isVisible()) await lots.click();
  await page
    .getByRole("button", { name: "Turnuvayı tamamla", exact: true })
    .click();
  await expect(page.getByText("TURNUVANIN PODYUMU")).toBeVisible();
  await page.getByRole("button", { name: "Sıralama", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "İTÜ Elo değişimi" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/tournament-desktop.png",
    fullPage: true,
  });
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(
    snapshot.state.players.every((p: { itu: number | null }) => p.itu !== null),
  ).toBeTruthy();
  const res = await page.request.post("/api/action", {
    data: {
      revision: snapshot.revision,
      action: "tournament.create",
      payload: {
        name: "Gelecek hafta",
        date: "2026-11-14",
        semester: snapshot.state.activeSemester,
        roundsPlanned: 7,
        timeControl: "3+2",
        variant: "standard",
        countsPoints: true,
        countsRating: true,
      },
    },
  });
  expect(res.ok()).toBeTruthy();
  const afterCreate = await (await page.request.get("/api/state")).json();
  const next = afterCreate.state.tournaments.at(-1);
  await page.request.post("/api/action", {
    data: {
      revision: afterCreate.revision,
      action: "tournament.entries",
      payload: {
        tournamentId: next.id,
        playerIds: snapshot.state.players.map((p: { id: string }) => p.id),
      },
    },
  });
  const afterEntry = await (await page.request.get("/api/state")).json();
  const gen = await page.request.post("/api/action", {
    data: {
      revision: afterEntry.revision,
      action: "round.generate",
      payload: { tournamentId: next.id },
    },
  });
  expect(gen.ok()).toBeTruthy();
  const final = await (await page.request.get("/api/state")).json();
  for (const e of final.state.tournaments.at(-1).entries)
    expect(e.seed).toBe(
      final.state.players.find((p: { id: string }) => p.id === e.playerId).itu,
    );
  await page.goto("/#home");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Genel bakış", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("link", { name: "Turnuvalar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Turnuvalar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Gelecek hafta/ }).click();
  await expect(
    page.getByRole("heading", { name: "1. tur eşlendirmeleri" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "test-results/pairings-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Koyu tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/#settings");
  await expect(
    page.getByRole("heading", { name: "Kulüp ayarları", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Geçici K katsayısı", { exact: true }).fill("48");
  await page.getByRole("button", { name: "Politikayı kaydet" }).click();
  await expect(
    page.getByLabel("Geçici K katsayısı", { exact: true }),
  ).toHaveValue("48");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("API: private data, organizer permissions, edit conflicts, origin checks, backups", async ({
  request,
  playwright,
}) => {
  const anonymous = await (await request.get("/api/state")).json();
  expect(anonymous.state.managers).toBeUndefined();
  expect(anonymous.state.overrides).toEqual([]);
  expect(anonymous.state.audit).toEqual([]);
  expect((await request.get("/api/backup")).status()).toBe(403);
  expect(
    (
      await request.post("/api/action", {
        data: {
          revision: anonymous.revision,
          action: "player.create",
          payload: {},
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/login", {
        headers: { Origin: "https://evil.example" },
        data: { username: "testowner", password: "test-password-12345" },
      })
    ).status(),
  ).toBe(403);
  await request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const first = await (await request.get("/api/state")).json();
  const create = await request.post("/api/action", {
    data: {
      revision: first.revision,
      action: "manager.create",
      payload: {
        username: "friend",
        name: "Organizatör",
        password: "organizer-password-123",
      },
    },
  });
  expect(create.ok()).toBeTruthy();
  const conflict = await request.post("/api/action", {
    data: {
      revision: first.revision,
      action: "policy.save",
      payload: first.state.policy,
    },
  });
  expect(conflict.status()).toBe(409);
  const organizer = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3099",
  });
  expect(
    (
      await organizer.post("/api/login", {
        data: { username: "friend", password: "organizer-password-123" },
      })
    ).ok(),
  ).toBeTruthy();
  const current = await (await organizer.get("/api/state")).json();
  expect((await organizer.get("/api/backup")).status()).toBe(403);
  expect((await organizer.get("/api/managers")).status()).toBe(403);
  expect(
    (
      await organizer.post("/api/developer/enter", { data: { confirm: true } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await organizer.post("/api/action", {
        data: {
          revision: current.revision,
          action: "policy.save",
          payload: current.state.policy,
        },
      })
    ).status(),
  ).toBe(400);
  const backup = await request.get("/api/backup");
  expect(backup.ok()).toBeTruthy();
  expect(backup.headers()["cache-control"]).toContain("no-store");
  expect((await backup.json()).state.managers.length).toBe(2);
  await organizer.dispose();
});

test("developer sandbox: full tournament, reset and exit leave actual club data untouched", async ({
  page,
  playwright,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const real = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3099",
  });
  await real.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const before = await (await real.get("/api/backup")).json();
  await page.goto("/#settings");
  await page.getByRole("button", { name: "Deneme ortamını aç" }).click();
  await expect(
    page.getByRole("region", { name: "Deneme ortamı" }),
  ).toBeVisible();
  let current = await (await page.request.get("/api/state")).json();
  expect(current.workspace).toBe("sandbox");
  expect(current.state.players).toEqual([]);
  const mutate = async (action: string, payload: object) => {
    const snapshot = await (await page.request.get("/api/state")).json();
    const response = await page.request.post("/api/action", {
      data: {
        revision: snapshot.revision,
        workspace: "sandbox",
        action,
        payload,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  for (const name of ["abc-sandbox", "def-sandbox"])
    await mutate("player.create", {
      name,
      official: 1800,
      officialType: "ELO",
    });
  await page.reload();
  await page.getByRole("button", { name: "Yeni turnuva", exact: true }).click();
  await page.getByLabel("Turnuva adı").fill("abc deneme turnuvası");
  await page.getByLabel("Tur sayısı").fill("1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Turnuva oluştur", exact: true })
    .click();
  await page.getByRole("button", { name: /abc deneme turnuvası/ }).click();
  await page.getByRole("button", { name: "Tümünü seç" }).click();
  await page.getByRole("button", { name: "2 oyuncuyu kaydet" }).click();
  await page.getByRole("button", { name: "1. turu eşlendir" }).click();
  await page.getByLabel("Masa 1 sonucu", { exact: true }).selectOption("1-0");
  await page
    .getByRole("button", { name: "Turnuvayı tamamla", exact: true })
    .click();
  await expect(page.getByText("TURNUVANIN PODYUMU")).toBeVisible();
  current = await (await page.request.get("/api/state")).json();
  expect(
    current.state.players.every((p: { itu: number | null }) => p.itu !== null),
  ).toBeTruthy();
  await mutate("ratings.override", {
    playerId: current.state.players[0].id,
    value: 1900,
    reason: "abc correction",
  });
  expect((await page.request.get("/api/backup")).status()).toBe(403);
  expect(await (await page.request.get("/api/managers")).json()).toEqual([]);
  current = await (await page.request.get("/api/state")).json();
  expect(
    (
      await page.request.post("/api/action", {
        data: {
          revision: current.revision,
          workspace: "sandbox",
          action: "manager.create",
          payload: {
            name: "abc",
            username: "abc",
            password: "test-password-long-enough",
          },
        },
      })
    ).status(),
  ).toBe(403);
  const cookies = await page.context().cookies();
  const oldCookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await page.reload();
  await page.getByRole("button", { name: "Denemeyi sıfırla" }).click();
  await expect(
    page.getByText("Deneme verileri tamamen temizlendi."),
  ).toBeVisible();
  const reset = await (await page.request.get("/api/state")).json();
  for (const key of ["players", "tournaments", "overrides", "audit"])
    expect(reset.state[key]).toEqual([]);
  expect(reset.revision).toBeGreaterThan(current.revision);
  expect(
    (
      await page.request.post("/api/action", {
        data: {
          revision: current.revision,
          workspace: "sandbox",
          action: "player.create",
          payload: { name: "stale-abc", official: null, officialType: "ELO" },
        },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Kulüp kayıtlarına dön" }).click();
  await expect(page.getByRole("region", { name: "Deneme ortamı" })).toHaveCount(
    0,
  );
  const after = await (await real.get("/api/backup")).json();
  expect(after).toEqual(before);
  const ghost = await page.request.get("/api/state", {
    headers: { Cookie: oldCookie },
  });
  const ghostState = await ghost.json();
  expect(ghostState.workspace).toBe("expired");
  expect(ghostState.state.players).toEqual([]);
  expect(
    (
      await page.request.post("/api/action", {
        headers: { Cookie: oldCookie },
        data: {
          revision: 0,
          workspace: "sandbox",
          action: "player.create",
          payload: { name: "expired-abc", official: null, officialType: "ELO" },
        },
      })
    ).status(),
  ).toBe(410);
  // A sandbox request with no sandbox cookie cannot write to real club data.
  const primary = await (await real.get("/api/state")).json();
  expect(
    (
      await real.post("/api/action", {
        data: {
          revision: primary.revision,
          workspace: "sandbox",
          action: "player.create",
          payload: {
            name: "wrong-workspace",
            official: null,
            officialType: "ELO",
          },
        },
      })
    ).status(),
  ).toBe(409);
  expect(await (await real.get("/api/backup")).json()).toEqual(before);
  await real.dispose();
});
