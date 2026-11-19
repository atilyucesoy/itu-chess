import { test, expect } from "@playwright/test";

test("owner can save conditional rating settings without rewriting event history", async ({
  page,
}) => {
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const before = await (await page.request.get("/api/state")).json();
  await page.goto("/#settings");
  const method = page.getByLabel("Derecesiz oyuncunun ilk İTÜ Elo’su", {
    exact: true,
  });
  const reference = page.getByLabel(
    "Derecesiz oyuncular için başlangıç referansı",
    { exact: true },
  );
  const cap = page.getByLabel("İlk rating üst sınırı", { exact: true });
  await expect(
    page.getByRole("heading", { name: "Görünüm", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Deneme alanı", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Deneme alanını aç", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("İlk performans ratingine üst sınır uygula", {
      exact: true,
    }),
  ).toHaveCount(0);
  await method.selectOption("performance");
  await expect(reference).toHaveCount(0);
  await cap.fill("3000");
  await method.selectOption("seed");
  await expect(cap).toHaveCount(0);
  await reference.fill("1600");
  await method.selectOption("performance");
  await expect(cap).toHaveValue("3000");
  await page.getByLabel("İlk rating üst sınırı", { exact: true }).fill("1900");
  await page
    .getByRole("button", { name: "Politikayı kaydet", exact: true })
    .click();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("İlk rating üst sınırı", { exact: true }),
  ).toHaveValue("1900");
  const after = await (await page.request.get("/api/state")).json();
  expect(after.state.players).toEqual(before.state.players);
  expect(after.state.tournaments).toEqual(before.state.tournaments);
  expect(after.state.policy.initialPerformanceCapEnabled).toBe(true);
  expect(after.state.policy.initialPerformanceCap).toBe(1900);
  await page
    .getByLabel("Derecesiz oyuncunun ilk İTÜ Elo’su", { exact: true })
    .selectOption("seed");
  await expect(cap).toHaveCount(0);
  await expect(reference).toHaveValue("1600");
  await reference.fill("1700");
  await page
    .getByRole("button", { name: "Politikayı kaydet", exact: true })
    .click();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(reference).toHaveValue("1700");
  await expect(cap).toHaveCount(0);
  await page
    .getByLabel("Derecesiz oyuncunun ilk İTÜ Elo’su", { exact: true })
    .selectOption("performance");
  await expect(cap).toHaveValue("1900");
  await page.screenshot({
    path: "test-results/rating-cap-settings.png",
    fullPage: true,
  });
});

test("draft inline player creation preserves unsaved selections and copying a roster excludes archived players", async ({
  page,
}) => {
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const act = async (action: string, payload: object) => {
    const snap = await (await page.request.get("/api/state")).json();
    const r = await page.request.post("/api/action", {
      data: { revision: snap.revision, action, payload },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  };
  for (const name of ["Inline A", "Inline B", "Inline Archived"])
    await act("player.create", { name, official: 1800, officialType: "ELO" });
  let snap = await (await page.request.get("/api/state")).json();
  const id = (name: string) =>
    snap.state.players.find((p: { name: string }) => p.name === name).id;
  await act("tournament.create", {
    name: "Old inline roster",
    date: "2090-01-01",
    roundsPlanned: 2,
    timeControl: "3+2",
    countsPoints: false,
    countsRating: false,
  });
  snap = await (await page.request.get("/api/state")).json();
  const old = snap.state.tournaments.find(
    (t: { name: string }) => t.name === "Old inline roster",
  );
  await act("tournament.entries", {
    tournamentId: old.id,
    playerIds: [id("Inline A"), id("Inline Archived")],
  });
  await act("player.archive", { id: id("Inline Archived"), archived: true });
  await act("tournament.create", {
    name: "New inline roster",
    date: "2090-01-02",
    roundsPlanned: 2,
    timeControl: "3+2",
    countsPoints: false,
    countsRating: false,
  });
  snap = await (await page.request.get("/api/state")).json();
  const t = snap.state.tournaments.find(
    (t: { name: string }) => t.name === "New inline roster",
  );
  await page.goto(`/#tournament/${t.id}`);
  await page
    .getByRole("button", { name: "Son turnuvadan al", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "1 oyuncuyu kaydet", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Inline B/ }).check();
  await page
    .getByRole("button", { name: "Yeni oyuncu oluştur ve ekle", exact: true })
    .click();
  await page.getByLabel("Ad soyad", { exact: true }).fill("Inline C new");
  await page.getByLabel("Resmî rating", { exact: true }).fill("2100");
  await page
    .getByRole("button", { name: "Oyuncuyu kaydet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "3 oyuncuyu kaydet", exact: true }),
  ).toBeVisible();
  for (const name of ["Inline A", "Inline B", "Inline C new"])
    await expect(
      page.getByRole("checkbox", { name: new RegExp(name) }),
    ).toBeChecked();
  let after = await (await page.request.get("/api/state")).json();
  const stored = after.state.tournaments.find(
    (x: { id: string }) => x.id === t.id,
  );
  expect(stored.entries).toHaveLength(3);
  expect(
    stored.entries.some((e: { name: string }) => e.name === "Inline Archived"),
  ).toBe(false);
  expect(
    after.state.players.filter(
      (p: { name: string }) => p.name === "Inline C new",
    ),
  ).toHaveLength(1);
  const pair = page.getByRole("button", {
    name: "1. turu eşlendir",
    exact: true,
  });
  await expect(pair).toBeEnabled();
  await page.getByRole("checkbox", { name: /Inline B/ }).uncheck();
  await expect(pair).toBeDisabled();
  await page
    .getByRole("button", { name: "Eşlendirmeler", exact: true })
    .click();
  await expect(pair).toBeDisabled();
  await page.getByRole("button", { name: "Oyuncular", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /Inline B/ }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Kayıtlı seçime dön", exact: true })
    .click();
  await expect(pair).toBeEnabled();
  const count = after.state.players.length,
    entries = stored.entries;
  await page
    .getByRole("button", { name: "Yeni oyuncu oluştur ve ekle", exact: true })
    .click();
  await page.getByLabel("Ad soyad", { exact: true }).fill("Inline A");
  await page
    .getByRole("button", { name: "Oyuncuyu kaydet", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".form-error")).toContainText(
    "zaten kayıtlı",
  );
  after = await (await page.request.get("/api/state")).json();
  expect(after.state.players).toHaveLength(count);
  expect(
    after.state.tournaments.find((x: { id: string }) => x.id === t.id).entries,
  ).toEqual(entries);
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await page.screenshot({
    path: "test-results/draft-inline-player.png",
    fullPage: true,
  });
});
