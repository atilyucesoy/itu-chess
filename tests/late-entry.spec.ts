import { test, expect } from "@playwright/test";

test("organizer adds a registered player and a new player without changing the current round", async ({
  page,
  request,
}) => {
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const act = async (action: string, payload: object) => {
    const snap = await (await page.request.get("/api/state")).json();
    const response = await page.request.post("/api/action", {
      data: { revision: snap.revision, action, payload },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  for (const name of [
    "Late UI Original A",
    "Late UI Original B",
    "Late UI Registered",
  ])
    await act("player.create", { name, official: 1800, officialType: "ELO" });
  await act("tournament.create", {
    name: "Late UI Event",
    date: "2026-11-08",
    roundsPlanned: 3,
    timeControl: "3+2",
    countsPoints: false,
    countsRating: false,
  });
  let snap = await (await page.request.get("/api/state")).json();
  const t = snap.state.tournaments.find(
    (t: { name: string }) => t.name === "Late UI Event",
  );
  await act("tournament.entries", {
    tournamentId: t.id,
    playerIds: snap.state.players
      .filter((p: { name: string }) => p.name.startsWith("Late UI Original"))
      .map((p: { id: string }) => p.id),
  });
  await act("round.generate", { tournamentId: t.id });
  snap = await (await page.request.get("/api/state")).json();
  const published = snap.state.tournaments.find(
    (x: { id: string }) => x.id === t.id,
  ).rounds[0];
  await page.goto(`/#tournament/${t.id}`);
  await page
    .getByRole("button", { name: "Geç katılım ekle", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Late UI Registered", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Geç katılımı ekle", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Geç katılım ekle", exact: true })
    .click();
  await page.getByRole("button", { name: "Yeni oyuncu", exact: true }).click();
  await page.getByLabel("Ad soyad", { exact: true }).fill("Late UI New");
  await page.getByLabel("Resmî rating", { exact: true }).fill("2200");
  await page.getByRole("button", { name: "Oyuncuyu kaydet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  snap = await (await page.request.get("/api/state")).json();
  const updated = snap.state.tournaments.find(
    (x: { id: string }) => x.id === t.id,
  );
  expect(updated.rounds[0]).toEqual(published);
  expect(
    updated.entries.filter((e: { joinedRound: number }) => e.joinedRound === 2),
  ).toHaveLength(2);
  await expect(page.locator(".pairings-table .player-name").first()).toHaveCSS(
    "text-align",
    "center",
  );
  await expect(
    page.getByRole("columnheader", { name: "Beyaz", exact: true }),
  ).toHaveCSS("text-align", "center");
  expect(
    await page
      .locator(".pairings-table .player-name")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBe(17);
  await page.getByLabel("Masa 1 sonucu", { exact: true }).selectOption("1-0");
  await page
    .getByRole("button", { name: "2. turu eşlendir", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2. tur eşlendirmeleri" }),
  ).toBeVisible();
  await expect(page.locator(".pairings-table")).toContainText(
    "Late UI Registered",
  );
  await expect(page.locator(".pairings-table")).toContainText("Late UI New");
  await page.screenshot({
    path: "test-results/late-entry.png",
    fullPage: true,
  });
  const anonymous = await request.get("/api/state");
  expect((await anonymous.json()).user).toBeNull();
});

test("state polling validates ETags without crossing authentication or sandbox boundaries", async ({
  request,
  playwright,
}) => {
  const publicResponse = await request.get("/api/state");
  const publicTag = publicResponse.headers().etag;
  expect(
    (
      await request.get("/api/state", {
        headers: { "If-None-Match": publicTag },
      })
    ).status(),
  ).toBe(304);
  await request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const ownerResponse = await request.get("/api/state", {
    headers: { "If-None-Match": publicTag },
  });
  expect(ownerResponse.status()).toBe(200);
  const ownerTag = ownerResponse.headers().etag;
  expect(
    (
      await request.get("/api/state", {
        headers: { "If-None-Match": ownerTag },
      })
    ).status(),
  ).toBe(304);
  const anon = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3099",
  });
  expect(
    (
      await anon.get("/api/state", { headers: { "If-None-Match": ownerTag } })
    ).status(),
  ).toBe(200);
  await request.post("/api/developer/enter", { data: { confirm: true } });
  const sandbox = await request.get("/api/state", {
    headers: { "If-None-Match": ownerTag },
  });
  expect(sandbox.status()).toBe(200);
  const sandboxData = await sandbox.json();
  expect(sandboxData.workspace).toBe("sandbox");
  expect(sandboxData.state.players).toEqual([]);
  const sandboxTag = sandbox.headers().etag;
  await request.post("/api/action", {
    data: {
      revision: sandboxData.revision,
      workspace: "sandbox",
      action: "player.create",
      payload: { name: "ETag sandbox", official: null, officialType: "ELO" },
    },
  });
  const changed = await request.get("/api/state", {
    headers: { "If-None-Match": sandboxTag },
  });
  expect(changed.status()).toBe(200);
  expect(changed.headers().etag).not.toBe(sandboxTag);
  await request.post("/api/developer/exit", { data: { confirm: true } });
  const back = await request.get("/api/state", {
    headers: { "If-None-Match": changed.headers().etag },
  });
  expect(back.status()).toBe(200);
  expect((await back.json()).workspace).toBe("club");
  await anon.dispose();
});
