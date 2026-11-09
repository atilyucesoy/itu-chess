import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type State } from "../shared/types.js";
import { migrateState } from "../shared/migrate.js";
import { applyAction } from "../server/domain.js";
import { championship } from "../shared/standings.js";
import { MemorySandboxStore } from "../server/developer.js";
import { backupSchema } from "../server/backup-schema.js";
import { hashPassword } from "../server/auth.js";

const event = {
  name: "Dönem testi",
  date: "2026-11-08",
  roundsPlanned: 1,
  timeControl: "3+2",
  countsPoints: true,
  countsRating: true,
};
test("standard events use the centrally active semester without a variant selection", async () => {
  const s = emptyState();
  await applyAction(
    s,
    "semester.create",
    { name: "2026–2027 Bahar", makeActive: true },
    true,
  );
  await applyAction(s, "tournament.create", event, false);
  assert.equal(s.tournaments[0].semester, s.activeSemester);
  assert.equal(s.tournaments[0].variant, "standard");
  await assert.rejects(() =>
    applyAction(
      s,
      "tournament.create",
      { ...event, variant: "chess960" },
      true,
    ),
  );
});
test("semester change preserves archived points, player ratings, and tournament snapshots", async () => {
  const s = emptyState();
  const original = s.activeSemester;
  for (const name of ["abc", "def"])
    await applyAction(
      s,
      "player.create",
      { name, official: 1800, officialType: "ELO" },
      true,
    );
  await applyAction(s, "tournament.create", event, true);
  const t = s.tournaments[0];
  await applyAction(
    s,
    "tournament.entries",
    { tournamentId: t.id, playerIds: s.players.map((p) => p.id) },
    true,
  );
  await applyAction(s, "round.generate", { tournamentId: t.id }, true);
  t.rounds[0].games[0].result = "1-0";
  await applyAction(s, "tournament.finalize", { tournamentId: t.id }, true);
  const players = structuredClone(s.players),
    archived = structuredClone(t),
    points = championship(s, original);
  await applyAction(
    s,
    "semester.create",
    { name: "Yeni dönem", makeActive: true },
    true,
  );
  assert.deepEqual(s.players, players);
  assert.deepEqual(t, archived);
  assert.deepEqual(championship(s, original), points);
  assert.deepEqual(championship(s, "Yeni dönem"), []);
  await applyAction(
    s,
    "tournament.create",
    { ...event, name: "Yeni dönem turnuvası" },
    true,
  );
  assert.equal(s.tournaments[1].semester, "Yeni dönem");
  await applyAction(s, "semester.activate", { name: original }, true);
  assert.equal(s.activeSemester, original);
});
test("unknown, duplicate and unauthorized semester changes are rejected", async () => {
  const s = emptyState();
  const before = structuredClone(s);
  await assert.rejects(() =>
    applyAction(s, "semester.create", { name: "Test" }, false),
  );
  await assert.rejects(() =>
    applyAction(s, "semester.activate", { name: s.activeSemester }, false),
  );
  await assert.rejects(() =>
    applyAction(s, "semester.activate", { name: "Unknown" }, true),
  );
  await assert.rejects(() =>
    applyAction(
      s,
      "tournament.create",
      { ...event, semester: "Unknown" },
      true,
    ),
  );
  await assert.rejects(() =>
    applyAction(
      s,
      "semester.create",
      { name: ` ${s.activeSemester.toLocaleLowerCase("tr")} ` },
      true,
    ),
  );
  assert.deepEqual(s, before);
});
test("legacy migration preserves labels and data, and is idempotent", async () => {
  const s = emptyState();
  await applyAction(s, "tournament.create", event, true);
  const legacy = structuredClone(s) as Omit<
    State,
    "semesters" | "activeSemester"
  > &
    Partial<Pick<State, "semesters" | "activeSemester">>;
  delete legacy.semesters;
  delete legacy.activeSemester;
  legacy.tournaments[0].semester = "2026  Güz (eski yazım)";
  legacy.tournaments[0].variant = "chess960";
  const before = structuredClone(legacy);
  const migrated = migrateState(legacy);
  assert.equal(migrated.activeSemester, before.tournaments[0].semester);
  assert.deepEqual(migrated.semesters, [before.tournaments[0].semester]);
  assert.deepEqual(migrated.tournaments, before.tournaments);
  assert.deepEqual(migrated.players, before.players);
  assert.deepEqual(legacy, before);
  assert.equal(migrateState(migrated), migrated);
});
test("sandbox copies the roster with the semester configuration, and reset restores the live snapshot", async () => {
  const s = emptyState();
  await applyAction(
    s,
    "semester.create",
    { name: "Test Bahar", makeActive: true },
    true,
  );
  await applyAction(
    s,
    "player.create",
    { name: "actual-player", official: 1800, officialType: "ELO" },
    true,
  );
  const store = new MemorySandboxStore(s);
  let snapshot = await store.load();
  assert.deepEqual(snapshot.state.semesters, s.semesters);
  assert.equal(snapshot.state.activeSemester, "Test Bahar");
  assert.equal(snapshot.state.players.length, 1);
  assert.equal(snapshot.state.players[0].name, "actual-player");
  assert.equal(snapshot.state.players[0].official, 1800);
  snapshot.state.semesters.push("sandbox-only");
  snapshot.state.players[0].official = 2200;
  await store.save(snapshot.state, snapshot.revision);
  assert.ok(!s.semesters.includes("sandbox-only"));
  assert.equal(s.players[0].official, 1800);
  snapshot = await store.load();
  store.reset(s, snapshot.revision);
  const after = await store.load();
  assert.deepEqual(after.state.semesters, s.semesters);
  assert.equal(after.state.players[0].official, 1800);
});
test("old backups remain restorable and new backups validate the semester registry", async () => {
  const s = emptyState();
  s.managers.push({
    id: "owner",
    name: "Test",
    username: "test",
    role: "owner",
    passwordHash: hashPassword("test-password-123"),
  });
  await applyAction(s, "tournament.create", event, true);
  const legacy = structuredClone(s) as Omit<
    State,
    "semesters" | "activeSemester"
  > &
    Partial<Pick<State, "semesters" | "activeSemester">>;
  delete legacy.semesters;
  delete legacy.activeSemester;
  legacy.tournaments[0].variant = "chess960";
  const parsed = backupSchema.parse({
    schemaVersion: 1,
    revision: 3,
    state: legacy,
  });
  const restored = migrateState(parsed.state);
  assert.deepEqual(
    restored.tournaments,
    s.tournaments.map((t) => ({ ...t, variant: "chess960" })),
  );
  assert.ok(restored.semesters.includes(restored.activeSemester));
  assert.throws(() =>
    backupSchema.parse({
      schemaVersion: 1,
      revision: 4,
      state: { ...restored, activeSemester: "missing" },
    }),
  );
});
