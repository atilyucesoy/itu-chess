import {
  played,
  scoreOf,
  type State,
  type Tournament,
  type Policy,
} from "./types.js";

export function expected(a: number, b: number) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}
export function initialPerformance(opponents: number[], score: number) {
  // Half a virtual win and loss keep perfect/zero scores finite. This is a
  // custom club estimator, NOT FIDE's initial-rating formula.
  const n = opponents.length;
  return Math.round(
    opponents.reduce((a, b) => a + b, 0) / n +
      400 * Math.log10((score + 0.5) / (n - score + 0.5)),
  );
}
export function rebuildRatings(state: State, replacePolicy?: Policy) {
  const ratings = new Map(
    state.players.map((p) => [
      p.id,
      { rating: null as number | null, games: 0 },
    ]),
  );
  const events: (
    | { kind: "tournament"; at: string; t: Tournament }
    | { kind: "override"; at: string; playerId: string; value: number }
  )[] = [
    ...state.tournaments
      .filter((t) => t.status === "finished" && t.countsRating)
      .map((t) => ({ kind: "tournament" as const, at: t.finalizedAt!, t })),
    ...state.overrides.map((o) => ({ ...o, kind: "override" as const })),
  ];
  events.sort((a, b) => a.at.localeCompare(b.at));
  for (const event of events) {
    if (event.kind === "override") {
      ratings.get(event.playerId)!.rating = event.value;
      continue;
    }
    const t = event.t;
    if (replacePolicy) t.policy = { ...replacePolicy };
    const policy = t.policy;
    const starts = new Map(
      t.entries.map((e) => [
        e.playerId,
        ratings.get(e.playerId)!.rating ?? e.official ?? policy.reference,
      ]),
    );
    t.ratingChanges = t.entries.map((e) => {
      const current = ratings.get(e.playerId)!;
      const games = t.rounds
        .flatMap((r) => r.games)
        .filter(
          (g) =>
            played(g.result) &&
            (g.white === e.playerId || g.black === e.playerId),
        );
      const before = current.rating;
      const opponents = games.map((g) =>
        starts.get(g.white === e.playerId ? g.black! : g.white)!,
      );
      const score = games.reduce(
        (s, g) => s + scoreOf(g.result, g.white === e.playerId),
        0,
      );
      if (games.length) {
        if (
          before === null &&
          e.official === null &&
          policy.initialMethod === "performance"
        ) {
          current.rating = initialPerformance(opponents, score);
        } else {
          const start = starts.get(e.playerId)!;
          const delta = games.reduce(
            (sum, g, i) =>
              sum +
              (current.games + i < policy.provisionalGames
                ? policy.provisionalK
                : policy.establishedK) *
                (scoreOf(g.result, g.white === e.playerId) -
                  expected(start, opponents[i])),
            0,
          );
          current.rating = Math.round(start + delta);
        }
        current.rating = Math.max(100, Math.min(3500, current.rating));
      }
      current.games += games.length;
      return {
        playerId: e.playerId,
        before,
        after: current.rating,
        delta:
          current.rating === null
            ? null
            : current.rating - (before ?? e.official ?? current.rating),
        games: games.length,
      };
    });
  }
  for (const p of state.players) {
    const r = ratings.get(p.id)!;
    p.itu = r.rating;
    p.games = r.games;
  }
}
