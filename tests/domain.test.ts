import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  DEFAULT_POLICY,
  effectiveRating,
  type State,
  type Tournament,
} from "../shared/types.js";
import { applyAction } from "../server/domain.js";
import { standings, championship } from "../shared/standings.js";
import {
  rebuildRatings,
  expected,
  initialPerformance,
} from "../shared/ratings.js";
import {
  authenticate,
  hashPassword,
  tokenFor,
  verifyPassword,
} from "../server/auth.js";
import { toTrf } from "../server/engine.js";
import { backupSchema } from "../server/backup-schema.js";

async function fixture(
  count = 32,
  rounds = 7,
  options: { unrated?: boolean; points?: boolean; rated?: boolean } = {},
) {
  const state = emptyState();
  for (let i = 0; i < count; i++)
    await applyAction(
      state,
      "player.create",
      {
        name: `Oyuncu ${String(i + 1).padStart(2, "0")}`,
        official: options.unrated ? null : 2100 - i * 30,
        officialType: "ELO",
      },
      true,
    );
  await applyAction(
    state,
    "tournament.create",
    {
      name: "Haftalık Yıldırım",
      date: "2026-11-07",
      semester: state.activeSemester,
      roundsPlanned: rounds,
      timeControl: "3+2",
      variant: "standard",
      countsPoints: options.points ?? true,
      countsRating: options.rated ?? true,
    },
    true,
  );
  const t = state.tournaments[0];
  await applyAction(
    state,
    "tournament.entries",
    { tournamentId: t.id, playerIds: state.players.map((p) => p.id) },
    true,
  );
  return { state, t };
}
async function finish(state: State, t: Tournament) {
  while (t.rounds.length < t.roundsPlanned) {
    await applyAction(state, "round.generate", { tournamentId: t.id }, true);
    for (const g of t.rounds.at(-1)!.games.filter((g) => g.black))
      await applyAction(
        state,
        "round.result",
        {
          tournamentId: t.id,
          round: t.rounds.length,
          board: g.board,
          result:
            (g.board + t.rounds.length) % 4 === 0
              ? "1/2"
              : g.board % 3
                ? "1-0"
                : "0-1",
        },
        true,
      );
  }
  if (standings(t).some((r) => r.tied))
    await applyAction(
      state,
      "tournament.lots",
      { tournamentId: t.id, confirm: true },
      true,
    );
  await applyAction(state, "tournament.finalize", { tournamentId: t.id }, true);
}
test("effective seeding rating: ITU > official > club reference; null is not zero", () => {
  assert.equal(effectiveRating({ itu: 1678, official: 2100 }, 1500), 1678);
  assert.equal(effectiveRating({ itu: null, official: 1800 }, 1500), 1800);
  assert.equal(effectiveRating({ itu: null, official: null }, 1500), 1500);
});
test("real Dutch engine: 32 players, seven rounds, no repeated played opponent, valid colours", async () => {
  const { state, t } = await fixture();
  await finish(state, t);
  assert.equal(t.rounds.length, 7);
  assert.equal(t.status, "finished");
  for (const e of t.entries) {
    const opponents = new Set<string>();
    let colors = "";
    for (const r of t.rounds) {
      const g = r.games.find(
        (g) => g.white === e.playerId || g.black === e.playerId,
      )!;
      assert.ok(g.black);
      const other = g.white === e.playerId ? g.black : g.white;
      assert.ok(!opponents.has(other!), `repeated opponent for ${e.name}`);
      opponents.add(other!);
      colors += g.white === e.playerId ? "w" : "b";
    }
    // Final-round topscorers may receive exceptions under FIDE rules.
    assert.ok(
      !colors.slice(0, 6).includes("www") &&
        !colors.slice(0, 6).includes("bbb"),
    );
    assert.equal(state.players.find((p) => p.id === e.playerId)!.games, 7);
  }
  assert.equal(
    championship(state, t.semester).reduce((s, r) => s + r.points, 0),
    101,
  );
  const ratings = JSON.stringify(state.players);
  await assert.rejects(() =>
    applyAction(state, "tournament.finalize", { tournamentId: t.id }, true),
  );
  assert.equal(JSON.stringify(state.players), ratings);
});
test("odd field: one PAB each round, never repeated; byes excluded from rating", async () => {
  const { state, t } = await fixture(31);
  await finish(state, t);
  const byes = t.rounds.flatMap((r) =>
    r.games.filter((g) => g.result === "bye"),
  );
  assert.equal(byes.length, 7);
  assert.equal(new Set(byes.map((g) => g.white)).size, 7);
  assert.equal(
    state.players.reduce((s, p) => s + p.games, 0),
    30 * 7,
  );
});
test("later tournament re-seeds from newly calculated ITU ratings, official remains unchanged", async () => {
  const { state, t } = await fixture(16, 3);
  await finish(state, t);
  const p = state.players[0];
  assert.notEqual(p.itu, null);
  p.official = 3000;
  await applyAction(
    state,
    "tournament.create",
    { ...t, name: "İkinci turnuva" },
    true,
  );
  const next = state.tournaments[1];
  await applyAction(
    state,
    "tournament.entries",
    { tournamentId: next.id, playerIds: state.players.map((p) => p.id) },
    true,
  );
  await applyAction(state, "round.generate", { tournamentId: next.id }, true);
  assert.equal(next.entries.find((e) => e.playerId === p.id)!.seed, p.itu);
  const seed = next.entries.find((e) => e.playerId === p.id)!.seed;
  p.itu! += 100;
  assert.equal(next.entries.find((e) => e.playerId === p.id)!.seed, seed);
});
test("1800 newcomer + one equal-rated win at K40 produces initial ITU 1820, not a rating from zero", async () => {
  const { state, t } = await fixture(2, 1);
  state.players.forEach((p) => (p.official = 1800));
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  const g = t.rounds[0].games[0];
  g.result = "1-0";
  await applyAction(state, "tournament.finalize", { tournamentId: t.id }, true);
  assert.equal(state.players.find((p) => p.id === g.white)!.itu, 1820);
  assert.equal(state.players.find((p) => p.id === g.black)!.itu, 1780);
  assert.ok(state.players.every((p) => p.official === 1800));
});
test("unrated initialization handles perfect and zero scores; high initial ratings are possible", () => {
  assert.ok(Number.isFinite(initialPerformance([1500, 1500, 1500], 3)));
  assert.ok(Number.isFinite(initialPerformance([1500, 1500, 1500], 0)));
  assert.ok(initialPerformance(Array(7).fill(1500), 7) > 1900);
  assert.equal(expected(1800, 1800), 0.5);
});
test("all-unrated events initialize ratings only after completion", async () => {
  const { state, t } = await fixture(12, 3, { unrated: true });
  assert.ok(state.players.every((p) => p.itu === null));
  await finish(state, t);
  assert.ok(
    state.players.every((p) => p.itu !== null && Number.isFinite(p.itu)),
  );
  assert.ok(t.entries.every((e) => e.itu === null && e.seed === 1500));
});
test("forfeits never affect rating or played-game count; scores and engine export remain valid", async () => {
  const { state, t } = await fixture(8, 2);
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  const g = t.rounds[0].games[0];
  g.result = "+-";
  for (const other of t.rounds[0].games.slice(1)) other.result = "1/2";
  await finish(state, t);
  assert.equal(state.players.find((p) => p.id === g.white)!.games, 1);
  assert.equal(state.players.find((p) => p.id === g.black)!.games, 1);
  assert.ok(toTrf(t).includes(" +"));
});
test("withdrawal yields zero-point absence, return works, remaining engine pairings valid", async () => {
  const { state, t } = await fixture(10, 3);
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  t.rounds[0].games.forEach((g) => (g.result = "1/2"));
  const id = t.entries[0].playerId;
  await applyAction(
    state,
    "player.withdraw",
    { tournamentId: t.id, playerId: id, withdrawn: true },
    true,
  );
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  assert.ok(
    t.rounds[1].games.some((g) => g.white === id && g.result === "absent"),
  );
  t.rounds[1].games.filter((g) => g.black).forEach((g) => (g.result = "1/2"));
  await applyAction(
    state,
    "player.withdraw",
    { tournamentId: t.id, playerId: id, withdrawn: false },
    true,
  );
  await finish(state, t);
  assert.equal(state.players.find((p) => p.id === id)!.games, 2);
});
test("policy settings persist per event; explicit replay recalculates without changing old pairings", async () => {
  const { state, t } = await fixture(8, 3);
  await finish(state, t);
  const pairings = JSON.stringify(t.rounds);
  const ratings = state.players.map((p) => p.itu);
  await applyAction(
    state,
    "policy.save",
    { ...DEFAULT_POLICY, provisionalK: 80 },
    true,
  );
  assert.equal(t.policy.provisionalK, 40);
  await applyAction(state, "ratings.recalculate", { confirm: true }, true);
  assert.equal(t.policy.provisionalK, 80);
  assert.notDeepEqual(
    state.players.map((p) => p.itu),
    ratings,
  );
  assert.equal(JSON.stringify(t.rounds), pairings);
  const after = state.players.map((p) => p.itu);
  rebuildRatings(state);
  assert.deepEqual(
    state.players.map((p) => p.itu),
    after,
  );
});
test("excluded event changes neither rating nor championship; semester points stay separated", async () => {
  const { state, t } = await fixture(8, 2, { points: false, rated: false });
  await finish(state, t);
  assert.equal(championship(state, t.semester).length, 0);
  assert.ok(state.players.every((p) => p.itu === null && p.games === 0));
  assert.equal(championship(state, "Başka dönem").length, 0);
});
test("rating overrides replay in order and do not overwrite official values", async () => {
  const { state, t } = await fixture(8, 2);
  await finish(state, t);
  const p = state.players[0];
  const official = p.official;
  await new Promise((resolve) => setTimeout(resolve, 2));
  await applyAction(
    state,
    "ratings.override",
    { playerId: p.id, value: 1900, reason: "Kulüp kararı" },
    true,
  );
  assert.equal(p.itu, 1900);
  assert.equal(p.official, official);
  rebuildRatings(state);
  assert.equal(p.itu, 1900);
});
test("reopen removes points and ratings, re-finalize never duplicates", async () => {
  const { state, t } = await fixture(8, 2);
  await finish(state, t);
  const before = JSON.stringify(state.players.map((p) => p.itu));
  await applyAction(
    state,
    "tournament.reopen",
    { tournamentId: t.id, confirm: true },
    true,
  );
  assert.equal(championship(state, t.semester).length, 0);
  assert.ok(state.players.every((p) => p.itu === null));
  await applyAction(state, "tournament.finalize", { tournamentId: t.id }, true);
  assert.equal(JSON.stringify(state.players.map((p) => p.itu)), before);
});
test("cannot generate before completing results or alter historical results silently", async () => {
  const { state, t } = await fixture(8, 3);
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  await assert.rejects(() =>
    applyAction(state, "round.generate", { tournamentId: t.id }, true),
  );
  t.rounds[0].games.forEach((g) => (g.result = "1/2"));
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  await assert.rejects(() =>
    applyAction(
      state,
      "round.result",
      { tournamentId: t.id, round: 1, board: 1, result: "1-0" },
      true,
    ),
  );
  await assert.rejects(() =>
    applyAction(state, "tournament.update", { ...t, tournamentId: t.id }, true),
  );
  await applyAction(
    state,
    "round.undo",
    { tournamentId: t.id, confirm: true },
    true,
  );
  assert.equal(t.rounds.length, 1);
});
test("complete tie requires a recorded lot before finalization; not alphabetical prizes", async () => {
  const { state, t } = await fixture(2, 1);
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
  t.rounds[0].games[0].result = "1/2";
  assert.ok(standings(t).every((r) => r.tied && r.rank === 1));
  await assert.rejects(() =>
    applyAction(state, "tournament.finalize", { tournamentId: t.id }, true),
  );
  await applyAction(
    state,
    "tournament.lots",
    { tournamentId: t.id, confirm: true },
    true,
  );
  assert.ok(standings(t).every((r) => !r.tied));
  await applyAction(state, "tournament.finalize", { tournamentId: t.id }, true);
  assert.equal(
    championship(state, t.semester).reduce((s, r) => s + r.points, 0),
    43,
  );
});
test("Buchholz and SB known four-player fixture", async () => {
  const { t } = await fixture(4, 3);
  t.entries.forEach((e, i) => (e.number = i + 1));
  const [a, b, c, d] = t.entries.map((e) => e.playerId);
  t.rounds = [
    {
      number: 1,
      engine: "",
      trf: "",
      games: [
        { board: 1, white: a, black: b, result: "1-0" },
        { board: 2, white: c, black: d, result: "1/2" },
      ],
    },
    {
      number: 2,
      engine: "",
      trf: "",
      games: [
        { board: 1, white: a, black: c, result: "1-0" },
        { board: 2, white: b, black: d, result: "1-0" },
      ],
    },
    {
      number: 3,
      engine: "",
      trf: "",
      games: [
        { board: 1, white: a, black: d, result: "1-0" },
        { board: 2, white: b, black: c, result: "1/2" },
      ],
    },
  ];
  const r = standings(t).find((r) => r.playerId === a)!;
  assert.equal(r.score, 3);
  assert.equal(r.bh, 3);
  assert.equal(r.bhCut, 2.5);
  assert.equal(r.sb, 3);
});
test("organizers cannot change rating policy or history", async () => {
  const { state } = await fixture();
  await assert.rejects(() =>
    applyAction(state, "policy.save", DEFAULT_POLICY, false),
  );
  await assert.rejects(() =>
    applyAction(state, "ratings.recalculate", { confirm: true }, false),
  );
});
test("backup format round-trips a completed tournament; unknown player references are rejected", async () => {
  const { state, t } = await fixture(8, 3);
  await finish(state, t);
  state.managers.push({
    id: "owner",
    name: "Atıl",
    username: "atil",
    role: "owner",
    passwordHash: hashPassword("strong-password-123"),
  });
  const backup = { schemaVersion: 1, revision: 1, state };
  assert.deepEqual(backupSchema.parse(backup).state, state);
  const broken = structuredClone(backup);
  broken.state.tournaments[0].entries[0].playerId = "does-not-exist";
  assert.throws(() => backupSchema.parse(broken));
});
test("FIDE 2026 unplayed-round cap and voluntary Cut-1 adjustment", async () => {
  const { t } = await fixture(3, 2);
  t.entries.forEach((e, i) => (e.number = i + 1));
  const [a, b, c] = t.entries.map((e) => e.playerId);
  t.rounds = [
    {
      number: 1,
      engine: "",
      trf: "",
      games: [
        { board: 1, white: a, black: b, result: "1-0" },
        { board: 2, white: c, black: null, result: "bye" },
      ],
    },
    {
      number: 2,
      engine: "",
      trf: "",
      games: [
        { board: 1, white: a, black: c, result: "1-0" },
        { board: 0, white: b, black: null, result: "absent" },
      ],
    },
  ];
  // B's trailing absence adjusts B's score to 0.5 only for opponents.
  const ar = standings(t).find((r) => r.playerId === a)!;
  assert.equal(ar.bh, 1.5);
  assert.equal(ar.sb, 1.5);
  assert.equal(ar.bhCut, 1);
  const cr = standings(t).find((r) => r.playerId === c)!;
  assert.equal(cr.bh, 3); // bye dummy min(own score 1, round cap 1) + A's 2
  assert.equal(cr.sb, 1);
});
test("password hashing, signed cookies, tamper resistance and revocation", () => {
  const hash = hashPassword("a strong password");
  assert.ok(verifyPassword("a strong password", hash));
  assert.ok(!verifyPassword("bad", hash));
  const m = {
    id: "1",
    username: "atil",
    name: "Atıl",
    role: "owner" as const,
    passwordHash: hash,
  };
  const secret = "x".repeat(32);
  const token = tokenFor(m, secret);
  assert.equal(authenticate(`itu_session=${token}`, [m], secret)?.id, m.id);
  assert.equal(authenticate(`itu_session=${token}x`, [m], secret), null);
  assert.equal(
    authenticate(
      `itu_session=${token}`,
      [{ ...m, passwordHash: hashPassword("new password") }],
      secret,
    ),
    null,
  );
});
test("archiving a player keeps tournament history intact and is owner-only", async () => {
  const { state, t } = await fixture(8, 3);
  await finish(state, t);
  const player = state.players[0];
  const ratingBefore = player.itu;
  await assert.rejects(
    () => applyAction(state, "player.archive", { id: player.id, archived: true }, false),
    /kulüp yöneticisi/,
  );
  await applyAction(state, "player.archive", { id: player.id, archived: true }, true);
  assert.ok(player.archivedAt);
  assert.equal(player.itu, ratingBefore);
  assert.deepEqual(state.players, state.players.filter((p) => p.id !== player.id || p.archivedAt));
  assert.ok(
    standings(t).some((row) => row.playerId === player.id && row.name === player.name),
  );
  await applyAction(state, "player.archive", { id: player.id, archived: false }, true);
  assert.equal(player.archivedAt, undefined);
  assert.equal(rebuildRatings(state, DEFAULT_POLICY), undefined);
});
test("deleting a player is refused once tournament history or an override refers to them", async () => {
  const { state, t } = await fixture(4, 2);
  await finish(state, t);
  const used = state.players[0];
  await assert.rejects(
    () => applyAction(state, "player.delete", { id: used.id }, true),
    /Haftalık Yıldırım.*arşivleyin/s,
  );
  assert.equal(state.players.length, 4);
  // A player who never entered an event leaves no dangling reference.
  await applyAction(
    state,
    "player.create",
    { name: "Yedek Oyuncu", official: 1700, officialType: "ELO" },
    true,
  );
  const spare = state.players.find((p) => p.name === "Yedek Oyuncu")!;
  await assert.rejects(
    () => applyAction(state, "player.delete", { id: spare.id }, false),
    /kulüp yöneticisi/,
  );
  await applyAction(state, "player.delete", { id: spare.id }, true);
  assert.equal(state.players.length, 4);
  assert.equal(state.players.some((p) => p.name === "Yedek Oyuncu"), false);
  // Manual rating overrides also block a hard delete.
  await applyAction(
    state,
    "player.create",
    { name: "Düzeltmeli", official: 1600, officialType: "ELO" },
    true,
  );
  const corrected = state.players.find((p) => p.name === "Düzeltmeli")!;
  await applyAction(
    state,
    "ratings.override",
    { playerId: corrected.id, value: 1750, reason: "test" },
    true,
  );
  await assert.rejects(
    () => applyAction(state, "player.delete", { id: corrected.id }, true),
    /manuel rating düzeltmesi/,
  );
  assert.ok(state.players.some((p) => p.id === corrected.id));
  assert.equal(rebuildRatings(state, DEFAULT_POLICY), undefined);
});
