import { test, expect } from "@playwright/test";

test("owner can opt into an editable first-performance cap without rewriting event history", async ({
  page,
}) => {
  await page.request.post("/api/login", {
    data: { username: "testowner", password: "test-password-12345" },
  });
  const before = await (await page.request.get("/api/state")).json();
  await page.goto("/#settings");
  const toggle = page.getByLabel("İlk performans ratingine üst sınır uygula", {
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await expect(
    page.getByLabel("İlk rating üst sınırı", { exact: true }),
  ).toBeDisabled();
  await toggle.check();
  await page.getByLabel("İlk rating üst sınırı", { exact: true }).fill("1900");
  await page
    .getByRole("button", { name: "Politikayı kaydet", exact: true })
    .click();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
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
  await expect(toggle).toBeDisabled();
  await page
    .getByLabel("Derecesiz oyuncunun ilk İTÜ Elo’su", { exact: true })
    .selectOption("performance");
  await expect(toggle).toBeChecked();
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
