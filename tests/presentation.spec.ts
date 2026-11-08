import { test, expect } from "@playwright/test";

test("semester administration, archived selection and brown-only light/dark persistence", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("itu-palette", "green"));
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const before = await (await page.request.get("/api/state")).json();
  await page.goto("/#settings");
  await page.getByText("Yeni dönem oluştur", { exact: true }).click();
  await page.getByLabel("Dönem adı", { exact: true }).fill("2026–2027 Bahar");
  await page
    .getByRole("button", { name: "Dönem oluştur", exact: true })
    .click();
  await expect(page.locator(".season-chip")).toHaveText("2026–2027 Bahar");
  const after = await (await page.request.get("/api/state")).json();
  expect(after.state.tournaments).toEqual(before.state.tournaments);
  expect(after.state.players).toEqual(before.state.players);
  await expect(page.getByLabel("Renk teması")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Yeşil", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-palette", "brown");
  await page.getByRole("button", { name: "Koyu tema" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "brown");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("itu-palette")),
  ).toBeNull();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Açık tema" }).click();
  await page.goto("/#championship");
  await page
    .getByLabel("Dönem seç", { exact: true })
    .selectOption(before.state.activeSemester);
  await expect(page.locator(".season-chip")).toHaveText("2026–2027 Bahar");
  await page.goto("/#tournaments");
  await page.getByRole("button", { name: "Yeni turnuva", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Dönem", { exact: true }),
  ).toHaveValue("2026–2027 Bahar");
  await expect(page.getByRole("dialog").getByLabel("Satranç türü")).toHaveCount(
    0,
  );
});

test("40-player projection fits 1080p, is read-only for spectators and follows the latest round", async ({
  request,
  page,
}) => {
  test.setTimeout(90000);
  await request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const act = async (action: string, payload: object) => {
    const snapshot = await (await request.get("/api/state")).json();
    const response = await request.post("/api/action", {
      data: { revision: snapshot.revision, workspace: "club", action, payload },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  for (let i = 1; i <= 40; i++)
    await act("player.create", {
      name:
        i === 1
          ? "Abdülkadir Muhammed Demirtaş"
          : `Proj ${i} ${i % 2 ? "Çağrı Yılmaz" : "Deniz Kaya"}`,
      official: i % 4 ? 2000 - i * 10 : null,
      officialType: i % 2 ? "ELO" : "UKD",
    });
  let snapshot = await (await request.get("/api/state")).json();
  const players = snapshot.state.players.filter(
    (p: { name: string }) =>
      p.name.startsWith("Proj ") || p.name === "Abdülkadir Muhammed Demirtaş",
  );
  await act("tournament.create", {
    name: "40 Oyuncu Projeksiyon",
    date: "2026-11-08",
    roundsPlanned: 2,
    timeControl: "3+2",
    countsPoints: false,
    countsRating: false,
  });
  snapshot = await (await request.get("/api/state")).json();
  const t = snapshot.state.tournaments.find(
    (t: { name: string }) => t.name === "40 Oyuncu Projeksiyon",
  );
  await act("tournament.entries", {
    tournamentId: t.id,
    playerIds: players.map((p: { id: string }) => p.id),
  });
  await act("round.generate", { tournamentId: t.id });
  await page.clock.install();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/#projection/${t.id}`);
  await expect(page.locator(".projection-game")).toHaveCount(20);
  await expect(page.locator(".projection-title p")).toContainText(
    "1. tur eşlendirmeleri",
  );
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.locator(".topbar")).not.toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /Masa .* sonucu/ }),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".projection-name")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(21);
  expect(
    await page
      .locator(".projection-name")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeLessThan(24);
  await expect(page.locator(".projection-player").first()).toHaveCSS(
    "text-align",
    "center",
  );
  await expect(page.locator(".projection-column-head").first()).toHaveCSS(
    "text-align",
    "center",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    await page
      .locator(".projection-game")
      .evaluateAll((cards) =>
        cards.every((card) =>
          [
            ...card.querySelectorAll(".projection-name,.projection-ratings"),
          ].every(
            (el) =>
              el.getBoundingClientRect().bottom <=
              card.getBoundingClientRect().bottom,
          ),
        ),
      ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/projection-1080p.png",
    fullPage: true,
  });
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await page.getByRole("button", { name: "Tam ekran", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Tam ekrandan çık", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tam ekrandan çık", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(false);
  }
  snapshot = await (await request.get("/api/state")).json();
  const current = snapshot.state.tournaments.find(
    (x: { id: string }) => x.id === t.id,
  );
  for (const g of current.rounds[0].games)
    if (g.black)
      await act("round.result", {
        tournamentId: t.id,
        round: 1,
        board: g.board,
        result: "1-0",
      });
  await act("round.generate", { tournamentId: t.id });
  await page.clock.runFor(20_100);
  await expect(page.locator(".projection-title p")).toContainText(
    "2. tur eşlendirmeleri",
  );
  await page.getByLabel("Projeksiyon turu").selectOption("1");
  await page.getByRole("button", { name: "Eşlendirmeleri yenile" }).click();
  await expect(page.locator(".projection-title p")).toContainText(
    "1. tur eşlendirmeleri",
  );
  await page.getByLabel("Projeksiyon turu").selectOption("latest");
  await expect(page.locator(".projection-title p")).toContainText(
    "2. tur eşlendirmeleri",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole("button", { name: "Sonraki masalar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sonraki masalar" }).click();
  await expect(
    page.getByRole("button", { name: "Önceki masalar" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/projection-mobile.png",
    fullPage: true,
  });
});
