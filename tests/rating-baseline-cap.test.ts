import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  DEFAULT_POLICY,
  type State,
  type Player,
  type Tournament,
  type Policy,
} from "../shared/types.js";
import {
  rebuildRatings,
  expected,
  type RatingBaseline,
} from "../shared/ratings.js";
import { MemorySandboxStore } from "../server/developer.js";
import { applyAction, policySchema } from "../server/domain.js";
import { standings } from "../shared/standings.js";

function player(
  id: string,
  official: number | null,
  itu: number | null = null,
  games = 0,
): Player {
  return {
    id,
    name: id,
    official,
    officialType: "ELO",
    itu,
    games,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function event(
  state: State,
  ids: string[],
  rounds: Tournament["rounds"],
  policy: Policy,
): Tournament {
  return {
    id: `event-${state.tournaments.length}`,
    name: "Rating fixture",
    date: "2026-11-09",
    semester: state.activeSemester,
    roundsPlanned: rounds.length,
    timeControl: "3+2",
    status: "finished",
    countsPoints: true,
    countsRating: true,
    policy: { ...policy },
    initialColor: "w",
    createdAt: "2026-01-01T00:00:00.000Z",
    finalizedAt: `2026-11-${String(10 + state.tournaments.length).padStart(2, "0")}T00:00:00.000Z`,
    lotOrder: [],
    ratingChanges: [],
    rounds,
    entries: ids.map((id, i) => {
      const p = state.players.find((p) => p.id === id)!;
      return {
        playerId: p.id,
        name: p.name,
        official: p.official,
        officialType: p.officialType,
        itu: p.itu,
        seed: p.itu ?? p.official ?? policy.reference,
        number: i + 1,
        withdrawn: false,
      };
    }),
  };
}
function performanceFixture(
  policy: Policy,
  official: number | null = null,
  result: "1-0" | "1/2" = "1-0",
  opponentRating = 2000,
) {
  const s = emptyState();
  s.players = [
    player("newcomer", official),
    ...Array.from({ length: 7 }, (_, i) =>
      player(`opponent-${i}`, opponentRating),
    ),
  ];
  s.tournaments.push(
    event(
      s,
      s.players.map((p) => p.id),
      Array.from({ length: 7 }, (_, i) => ({
        number: i + 1,
        trf: "",
        engine: "rating-only fixture",
        games: [
          { board: 1, white: "newcomer", black: `opponent-${i}`, result },
        ],
      })),
      policy,
    ),
  );
  return s;
}
test("performance cap is opt-in, configurable and only caps high first estimates", () => {
  const disabled = performanceFixture({
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: false,
    initialPerformanceCap: 1900,
  });
  rebuildRatings(disabled);
  assert.equal(disabled.players[0].itu, 2470);
  const capped = performanceFixture({
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: true,
    initialPerformanceCap: 1900,
  });
  rebuildRatings(capped);
  assert.equal(capped.players[0].itu, 1900);
  assert.equal(capped.players[0].games, 7);
  const otherLimit = performanceFixture({
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: true,
    initialPerformanceCap: 2000,
  });
  rebuildRatings(otherLimit);
  assert.equal(otherLimit.players[0].itu, 2000);
  const below = performanceFixture(
    {
      ...DEFAULT_POLICY,
      initialPerformanceCapEnabled: true,
      initialPerformanceCap: 1900,
    },
    null,
    "1/2",
    1700,
  );
  rebuildRatings(below);
  assert.equal(below.players[0].itu, 1700);
});
test("official-rating starts, seeded starts and established ITU ratings are not performance-capped", () => {
  const cap = {
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: true,
    initialPerformanceCap: 1900,
  };
  const official = performanceFixture(cap, 2200);
  rebuildRatings(official);
  assert.ok(official.players[0].itu! > 2200);
  assert.equal(official.players[0].official, 2200);
  const seeded = performanceFixture({
    ...cap,
    initialMethod: "seed",
    reference: 2200,
  });
  rebuildRatings(seeded);
  assert.ok(seeded.players[0].itu! > 2200);
  const established = performanceFixture(cap);
  const baseline: RatingBaseline = new Map([
    ["newcomer", { rating: 2200, games: 35 }],
  ]);
  rebuildRatings(established, undefined, baseline);
  assert.equal(
    established.players[0].itu,
    Math.round(2200 + 7 * 20 * (1 - expected(2200, 2000))),
  );
  assert.equal(established.players[0].games, 42);
});
test("the initial cap never becomes a lifelong ceiling", () => {
  const cap = {
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: true,
    initialPerformanceCap: 1900,
  };
  const s = performanceFixture(cap);
  rebuildRatings(s);
  assert.equal(s.players[0].itu, 1900);
  const next = event(
    s,
    s.players.map((p) => p.id),
    s.tournaments[0].rounds.map((r) => structuredClone(r)),
    cap,
  );
  s.tournaments.push(next);
  rebuildRatings(s);
  assert.ok(s.players[0].itu! > 1900);
});
test("legacy event policies remain unchanged until explicit policy replacement/replay", async () => {
  const s = performanceFixture({ ...DEFAULT_POLICY });
  delete s.tournaments[0].policy.initialPerformanceCapEnabled;
  delete s.tournaments[0].policy.initialPerformanceCap;
  const historical = structuredClone(s.tournaments[0].policy);
  await applyAction(
    s,
    "policy.save",
    {
      ...DEFAULT_POLICY,
      initialPerformanceCapEnabled: true,
      initialPerformanceCap: 1900,
    },
    true,
  );
  rebuildRatings(s);
  assert.equal(s.players[0].itu, 2470);
  assert.deepEqual(s.tournaments[0].policy, historical);
  rebuildRatings(s, s.policy);
  assert.equal(s.players[0].itu, 1900);
  // Old clients updating a K-factor must not silently drop a saved cap.
  await applyAction(s, "policy.save", { provisionalK: 32 }, true);
  assert.equal(s.policy.initialPerformanceCapEnabled, true);
  assert.equal(s.policy.initialPerformanceCap, 1900);
});
test("policy validation accepts old policies and rejects malformed cap values", () => {
  const legacy = {
    reference: 1500,
    initialMethod: "performance",
    provisionalGames: 30,
    provisionalK: 40,
    establishedK: 20,
  };
  const parsed = policySchema.parse(legacy);
  assert.equal(parsed.initialPerformanceCapEnabled, false);
  assert.equal(parsed.initialPerformanceCap, 1900);
  for (const limit of [0, 99, 3501, 1900.5, "1900"])
    assert.throws(() =>
      policySchema.parse({ ...legacy, initialPerformanceCap: limit }),
    );
  assert.throws(() =>
    policySchema.parse({ ...legacy, initialPerformanceCapEnabled: "true" }),
  );
});
test("real engine: 32-player seven-round perfect score is capped once, then grows normally next event", async () => {
  const s = emptyState();
  s.policy = {
    ...DEFAULT_POLICY,
    initialPerformanceCapEnabled: true,
    initialPerformanceCap: 1900,
  };
  s.players = [
    player("unrated-leader", null),
    ...Array.from({ length: 31 }, (_, i) => player(`club-opponent-${i}`, 2000)),
  ];
  const play = async () => {
    await applyAction(
      s,
      "tournament.create",
      {
        name: `Seven round cap test ${s.tournaments.length}`,
        date: "2026-11-09",
        roundsPlanned: 7,
        timeControl: "3+2",
        countsPoints: true,
        countsRating: true,
      },
      true,
    );
    const t = s.tournaments.at(-1)!;
    await applyAction(
      s,
      "tournament.entries",
      { tournamentId: t.id, playerIds: s.players.map((p) => p.id) },
      true,
    );
    for (let round = 1; round <= 7; round++) {
      await applyAction(s, "round.generate", { tournamentId: t.id }, true);
      for (const g of t.rounds.at(-1)!.games)
        if (g.black) {
          const result =
            g.white === "unrated-leader"
              ? "1-0"
              : g.black === "unrated-leader"
                ? "0-1"
                : g.board % 3 === 0
                  ? "1/2"
                  : "1-0";
          await applyAction(
            s,
            "round.result",
            { tournamentId: t.id, round, board: g.board, result },
            true,
          );
        }
    }
    assert.equal(
      standings(t).find((r) => r.playerId === "unrated-leader")!.score,
      7,
    );
    if (standings(t).some((r) => r.tied))
      await applyAction(
        s,
        "tournament.lots",
        { tournamentId: t.id, confirm: true },
        true,
      );
    await applyAction(s, "tournament.finalize", { tournamentId: t.id }, true);
    return t;
  };
  const first = await play();
  assert.equal(s.players[0].itu, 1900);
  assert.equal(s.players[0].games, 7);
  assert.equal(
    first.entries.find((e) => e.playerId === "unrated-leader")!.itu,
    null,
  );
  const second = await play();
  assert.ok(s.players[0].itu! > 1900);
  assert.equal(s.players[0].games, 14);
  assert.equal(
    second.entries.find((e) => e.playerId === "unrated-leader")!.seed,
    1900,
  );
});
test("sandbox finalization retains inherited ratings, K-factor history and nonparticipants", async () => {
  const club = emptyState();
  club.players = [
    player("A", 1800, 2000, 12),
    player("B", 1800, 2000, 35),
    player("not-entered", 1900, 2100, 18),
  ];
  const original = structuredClone(club);
  const store = new MemorySandboxStore(club);
  const snapshot = await store.load();
  const s = snapshot.state;
  const baseline = store.ratingBaseline();
  s.tournaments.push(
    event(
      s,
      ["A", "B"],
      [
        {
          number: 1,
          trf: "",
          engine: "rating-only fixture",
          games: [{ board: 1, white: "A", black: "B", result: "1-0" }],
        },
      ],
      s.policy,
    ),
  );
  rebuildRatings(s, undefined, baseline);
  assert.equal(s.players[0].itu, 2020);
  assert.equal(s.players[0].games, 13);
  assert.equal(s.players[1].itu, 1990);
  assert.equal(s.players[1].games, 36);
  assert.deepEqual(s.players[2], original.players[2]);
  assert.deepEqual(club, original);
  assert.equal(baseline.get("A")!.rating, 2000);
  assert.equal(baseline.get("B")!.games, 35);
  rebuildRatings(s, undefined, baseline);
  assert.equal(s.players[0].itu, 2020);
  assert.equal(s.players[0].games, 13);
  await applyAction(
    s,
    "ratings.override",
    { playerId: "A", value: 1950, reason: "Sandbox correction" },
    true,
    baseline,
  );
  assert.equal(s.players[0].itu, 1950);
  assert.equal(s.players[1].itu, 1990);
  assert.deepEqual(s.players[2], original.players[2]);
  await store.save(s, snapshot.revision);
  store.reset(club, (await store.load()).revision);
  assert.deepEqual((await store.load()).state.players, original.players);
  assert.equal(store.ratingBaseline().get("A")!.rating, 2000);
  store.dispose();
  assert.equal(store.ratingBaseline().size, 0);
});
test("real engine sandbox tournament, reopen and re-finalize replay over the same baseline", async () => {
  const club = emptyState();
  club.players = [
    player("A", 1800, 2000, 12),
    player("B", 1800, 2000, 12),
    player("C", 1900, 2100, 50),
  ];
  const store = new MemorySandboxStore(club);
  const s = (await store.load()).state;
  const baseline = store.ratingBaseline();
  const run = (action: string, payload: object) =>
    applyAction(s, action, payload, true, baseline);
  await run("tournament.create", {
    name: "Real engine sandbox",
    date: "2026-11-09",
    roundsPlanned: 1,
    timeControl: "3+2",
    countsPoints: true,
    countsRating: true,
  });
  const t = s.tournaments[0];
  await run("tournament.entries", {
    tournamentId: t.id,
    playerIds: ["A", "B"],
  });
  await run("round.generate", { tournamentId: t.id });
  assert.ok(t.entries.every((e) => e.seed === 2000));
  await run("round.result", {
    tournamentId: t.id,
    round: 1,
    board: 1,
    result: "1/2",
  });
  if (standings(t).some((r) => r.tied))
    await run("tournament.lots", { tournamentId: t.id, confirm: true });
  await run("tournament.finalize", { tournamentId: t.id });
  assert.equal(s.players[0].itu, 2000);
  assert.equal(s.players[1].itu, 2000);
  assert.equal(s.players[2].itu, 2100);
  assert.equal(s.players[2].games, 50);
  const after = structuredClone(s.players);
  await run("tournament.reopen", { tournamentId: t.id, confirm: true });
  assert.deepEqual(s.players, club.players);
  await run("tournament.finalize", { tournamentId: t.id });
  assert.deepEqual(s.players, after);
  assert.equal(club.players[0].games, 12);
});
