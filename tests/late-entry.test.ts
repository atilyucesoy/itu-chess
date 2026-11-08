import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  played,
  type State,
  type Tournament,
} from "../shared/types.js";
import { applyAction } from "../server/domain.js";
import { toTrf } from "../server/engine.js";
import { standings } from "../shared/standings.js";
import { backupSchema } from "../server/backup-schema.js";
import { hashPassword } from "../server/auth.js";

async function fixture(count = 8, rounds = 3) {
  const state = emptyState();
  for (let i = 0; i < count; i++)
    await applyAction(
      state,
      "player.create",
      {
        name: `Original ${i + 1}`,
        official: 1800 - i * 10,
        officialType: "ELO",
      },
      true,
    );
  await applyAction(
    state,
    "tournament.create",
    {
      name: "Late entry test",
      date: "2026-11-08",
      roundsPlanned: rounds,
      timeControl: "3+2",
      countsPoints: true,
      countsRating: true,
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
async function generate(state: State, t: Tournament) {
  await applyAction(state, "round.generate", { tournamentId: t.id }, true);
}
async function complete(state: State, t: Tournament) {
  for (const g of t.rounds.at(-1)!.games.filter((g) => g.black))
    await applyAction(
      state,
      "round.result",
      {
        tournamentId: t.id,
        round: t.rounds.length,
        board: g.board,
        result: g.board % 2 ? "1-0" : "0-1",
      },
      true,
    );
}
async function finish(state: State, t: Tournament) {
  while (t.rounds.length < t.roundsPlanned) {
    if (t.rounds.length) await complete(state, t);
    await generate(state, t);
  }
  await complete(state, t);
  if (standings(t).some((r) => r.tied))
    await applyAction(
      state,
      "tournament.lots",
      { tournamentId: t.id, confirm: true },
      true,
    );
  await applyAction(state, "tournament.finalize", { tournamentId: t.id }, true);
}
test("late entry never rewrites the published round and starts at the next unpaired round", async () => {
  const { state, t } = await fixture();
  await generate(state, t);
  const published = structuredClone(t.rounds);
  await applyAction(
    state,
    "tournament.lateEntry",
    {
      tournamentId: t.id,
      newPlayer: { name: "Late 2200", official: 2200, officialType: "ELO" },
    },
    false,
  );
  const e = t.entries.find((e) => e.name === "Late 2200")!;
  assert.equal(e.joinedRound, 2);
  assert.equal(e.number, 1);
  assert.equal(e.seed, 2200);
  assert.deepEqual(t.rounds, published);
  assert.equal(standings(t).find((r) => r.playerId === e.playerId)!.score, 0);
  await complete(state, t);
  const completedRound = structuredClone(t.rounds[0]);
  assert.match(
    toTrf(t)
      .split("\n")
      .find(
        (line) =>
          line.startsWith("001 ") && Number(line.slice(4, 8)) === e.number,
      )!,
    /0000 - Z/,
  );
  await generate(state, t);
  assert.ok(
    t.rounds[1].games.some(
      (g) => g.white === e.playerId || g.black === e.playerId,
    ),
  );
  assert.deepEqual(t.rounds[0], completedRound);
});
test("late batch preserves ITU-first seeding, event policy and only rates actually played games", async () => {
  const { state, t } = await fixture();
  await applyAction(
    state,
    "player.create",
    { name: "Registered late", official: 2500, officialType: "UKD" },
    true,
  );
  const registered = state.players.at(-1)!;
  await applyAction(
    state,
    "ratings.override",
    { playerId: registered.id, value: 2010, reason: "Initial club correction" },
    true,
  );
  await generate(state, t);
  await applyAction(
    state,
    "policy.save",
    { ...state.policy, reference: 900 },
    true,
  );
  await applyAction(
    state,
    "tournament.lateEntry",
    {
      tournamentId: t.id,
      playerIds: [registered.id],
      newPlayer: { name: "Unrated late", official: null, officialType: "ELO" },
    },
    true,
  );
  const newcomer = t.entries.find((e) => e.name === "Unrated late")!;
  assert.equal(t.entries.find((e) => e.playerId === registered.id)!.seed, 2010);
  assert.equal(newcomer.seed, 1500);
  await finish(state, t);
  assert.equal(state.players.find((p) => p.id === registered.id)!.games, 2);
  assert.equal(state.players.find((p) => p.id === newcomer.playerId)!.games, 2);
  assert.notEqual(
    state.players.find((p) => p.id === newcomer.playerId)!.itu,
    null,
  );
  assert.equal(
    state.players.find((p) => p.id === registered.id)!.official,
    2500,
  );
});
test("multiple late rounds in a full seven-round field preserve colours, coverage and opponent uniqueness", async () => {
  const { state, t } = await fixture(32, 7);
  await generate(state, t);
  await complete(state, t);
  await generate(state, t);
  const published = structuredClone(t.rounds);
  await applyAction(
    state,
    "tournament.lateEntry",
    {
      tournamentId: t.id,
      newPlayer: {
        name: "Round three arrival",
        official: 2300,
        officialType: "ELO",
      },
    },
    true,
  );
  const id = state.players.at(-1)!.id;
  assert.equal(t.entries.find((e) => e.playerId === id)!.joinedRound, 3);
  assert.deepEqual(t.rounds, published);
  await finish(state, t);
  assert.ok(
    t.rounds
      .slice(0, 2)
      .every((r) => r.games.every((g) => g.white !== id && g.black !== id)),
  );
  for (const entry of t.entries) {
    const opponents = new Set<string>();
    for (const round of t.rounds)
      for (const g of round.games)
        if (
          played(g.result) &&
          (g.white === entry.playerId || g.black === entry.playerId)
        ) {
          const other = g.white === entry.playerId ? g.black! : g.white;
          assert.ok(!opponents.has(other));
          opponents.add(other);
        }
  }
  const actualGames = t.rounds
    .flatMap((r) => r.games)
    .filter(
      (g) => played(g.result) && (g.white === id || g.black === id),
    ).length;
  assert.equal(state.players.find((p) => p.id === id)!.games, actualGames);
  assert.ok(actualGames <= 5);
  state.managers.push({
    id: "test",
    name: "Owner",
    username: "owner",
    role: "owner",
    passwordHash: hashPassword("test-password-long"),
  });
  assert.deepEqual(
    backupSchema.parse({ schemaVersion: 1, revision: 5, state }).state,
    state,
  );
});
test("invalid/duplicate late admissions and last-round admissions are rejected atomically", async () => {
  const { state, t } = await fixture();
  const payload = {
    tournamentId: t.id,
    newPlayer: {
      name: "Should not be created",
      official: null,
      officialType: "ELO",
    },
  };
  await assert.rejects(() =>
    applyAction(state, "tournament.lateEntry", payload, true),
  );
  await generate(state, t);
  let before = structuredClone(state);
  await assert.rejects(() =>
    applyAction(
      state,
      "tournament.lateEntry",
      { ...payload, playerIds: [t.entries[0].playerId] },
      true,
    ),
  );
  assert.deepEqual(state, before);
  await assert.rejects(() =>
    applyAction(
      state,
      "tournament.lateEntry",
      { ...payload, playerIds: ["missing"] },
      true,
    ),
  );
  assert.deepEqual(state, before);
  await assert.rejects(() =>
    applyAction(state, "tournament.lateEntry", { tournamentId: t.id }, true),
  );
  await complete(state, t);
  await generate(state, t);
  await complete(state, t);
  await generate(state, t);
  before = structuredClone(state);
  await assert.rejects(() =>
    applyAction(state, "tournament.lateEntry", payload, true),
  );
  assert.deepEqual(state, before);
  await finish(state, t);
  await assert.rejects(() =>
    applyAction(state, "tournament.lateEntry", payload, true),
  );
});
test("explicit round undo makes a pending late participant eligible for the next re-pairing", async () => {
  const { state, t } = await fixture();
  await generate(state, t);
  await complete(state, t);
  await generate(state, t);
  await applyAction(
    state,
    "tournament.lateEntry",
    {
      tournamentId: t.id,
      newPlayer: {
        name: "Pending arrival",
        official: null,
        officialType: "UKD",
      },
    },
    true,
  );
  const e = t.entries.find((e) => e.name === "Pending arrival")!;
  assert.equal(e.joinedRound, 3);
  await applyAction(
    state,
    "round.undo",
    { tournamentId: t.id, confirm: true },
    true,
  );
  assert.equal(e.joinedRound, 2);
  await generate(state, t);
  assert.ok(
    t.rounds[1].games.some(
      (g) => g.white === e.playerId || g.black === e.playerId,
    ),
  );
});
