import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../shared/types.js";
import { applyAction } from "../server/domain.js";
import { backupSchema } from "../server/backup-schema.js";
import { hashPassword } from "../server/auth.js";
async function fixture() {
  const s = emptyState();
  for (const name of ["A", "B", "Archived"])
    await applyAction(
      s,
      "player.create",
      { name, official: 1800, officialType: "ELO" },
      true,
    );
  await applyAction(
    s,
    "player.archive",
    { id: s.players[2].id, archived: true },
    true,
  );
  await applyAction(
    s,
    "tournament.create",
    {
      name: "Draft",
      date: "2026-11-09",
      roundsPlanned: 2,
      timeControl: "3+2",
      countsPoints: true,
      countsRating: true,
    },
    true,
  );
  return { s, t: s.tournaments[0] };
}
test("inline draft creation registers and selects the new player while preserving unsaved picks", async () => {
  const { s, t } = await fixture();
  await applyAction(
    s,
    "tournament.entries",
    { tournamentId: t.id, playerIds: [s.players[0].id] },
    false,
  );
  const picks = s.players.slice(0, 2).map((p) => p.id);
  await applyAction(
    s,
    "tournament.playerCreate",
    {
      tournamentId: t.id,
      playerIds: picks,
      newPlayer: {
        name: "New draft player",
        official: 2200,
        officialType: "UKD",
      },
    },
    false,
  );
  const created = s.players.at(-1)!;
  assert.equal(created.name, "New draft player");
  assert.equal(created.itu, null);
  assert.deepEqual(
    t.entries.map((e) => e.playerId),
    [...picks, created.id],
  );
  assert.equal(t.entries.at(-1)!.joinedRound, 1);
  await applyAction(s, "round.generate", { tournamentId: t.id }, false);
  assert.equal(t.entries[0].playerId, created.id);
  assert.equal(t.entries[0].seed, 2200);
});
test("duplicate, missing and oversized selections fail before either registry is changed", async () => {
  const { s, t } = await fixture();
  const before = structuredClone(s);
  const fresh = { name: "Fresh", official: null, officialType: "ELO" };
  for (const payload of [
    { playerIds: [], newPlayer: { ...fresh, name: " a " } },
    { playerIds: ["missing"], newPlayer: fresh },
    { playerIds: [s.players[0].id, s.players[0].id], newPlayer: fresh },
    { playerIds: Array(200).fill(s.players[0].id), newPlayer: fresh },
    { playerIds: [s.players[2].id], newPlayer: fresh },
  ]) {
    await assert.rejects(() =>
      applyAction(
        s,
        "tournament.playerCreate",
        { tournamentId: t.id, ...payload },
        true,
      ),
    );
    assert.deepEqual(s, before);
  }
});
test("archived players cannot be silently selected for a new draft or admitted late", async () => {
  const { s, t } = await fixture();
  const id = s.players[2].id;
  await assert.rejects(
    () =>
      applyAction(
        s,
        "tournament.entries",
        { tournamentId: t.id, playerIds: [id] },
        true,
      ),
    /Arşivli/,
  );
  await applyAction(
    s,
    "tournament.entries",
    { tournamentId: t.id, playerIds: s.players.slice(0, 2).map((p) => p.id) },
    true,
  );
  await applyAction(s, "round.generate", { tournamentId: t.id }, true);
  const before = structuredClone(s);
  await assert.rejects(
    () =>
      applyAction(
        s,
        "tournament.lateEntry",
        { tournamentId: t.id, playerIds: [id] },
        true,
      ),
    /Arşivli/,
  );
  assert.deepEqual(s, before);
  await assert.rejects(
    () =>
      applyAction(
        s,
        "tournament.playerCreate",
        {
          tournamentId: t.id,
          playerIds: [],
          newPlayer: { name: "Too late", official: null, officialType: "ELO" },
        },
        true,
      ),
    /geç katılım/,
  );
  assert.deepEqual(s, before);
});
test("archiving an already registered participant does not silently remove their existing participation", async () => {
  const { s, t } = await fixture();
  const id = s.players[0].id;
  await applyAction(
    s,
    "tournament.entries",
    { tournamentId: t.id, playerIds: [id, s.players[1].id] },
    true,
  );
  await applyAction(s, "player.archive", { id, archived: true }, true);
  await applyAction(
    s,
    "tournament.entries",
    { tournamentId: t.id, playerIds: [id, s.players[1].id] },
    true,
  );
  assert.ok(t.entries.some((e) => e.playerId === id));
});
test("backups preserve archive metadata", async () => {
  const { s } = await fixture();
  s.managers.push({
    id: "owner",
    name: "Owner",
    username: "owner",
    role: "owner",
    passwordHash: hashPassword("fixture-password-123"),
  });
  const restored = backupSchema.parse({
    schemaVersion: 1,
    revision: 0,
    state: s,
  }).state;
  assert.equal(restored.players[2].archivedAt, s.players[2].archivedAt);
});
