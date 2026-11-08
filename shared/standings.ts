import {
  F1,
  scoreOf,
  type Tournament,
  type Standing,
  type PublicState,
} from "./types.js";

// FIDE C.07, effective March 2026, art. 16. All unplayed rounds are
// represented explicitly, including post-withdrawal zero-point absences.
export function standings(t: Tournament): Standing[] {
  const records = new Map(
    t.entries.map((e) => [
      e.playerId,
      t.rounds.map((r) => {
        const g = r.games.find(
          (g) => g.white === e.playerId || g.black === e.playerId,
        );
        if (!g && r.number < (e.joinedRound ?? 1))
          return {
            opponent: null as string | null,
            score: 0,
            kind: "absent",
            vur: true,
          };
        if (!g || !g.result)
          return {
            opponent: null as string | null,
            score: 0,
            kind: "pending",
            vur: false,
          };
        const white = g.white === e.playerId;
        const result = g.result;
        return {
          opponent: white ? g.black : g.white,
          score: scoreOf(result, white),
          kind: result,
          vur:
            result === "absent" ||
            result === "--" ||
            (result === "+-" && !white) ||
            (result === "-+" && white),
        };
      }),
    ]),
  );
  const scores = new Map(
    [...records].map(([id, rows]) => [
      id,
      rows.reduce((s, r) => s + r.score, 0),
    ]),
  );
  const adjusted = new Map(
    [...records].map(([id, rows]) => [
      id,
      rows.reduce((s, r, i) => {
        // Requested zero-point byes followed only by voluntary unplayed rounds count as draws for opponents.
        if (
          r.kind === "absent" &&
          rows.slice(i + 1).every((x) => x.vur || x.kind === "pending")
        )
          return s + 0.5;
        return s + r.score;
      }, 0),
    ]),
  );
  const cap = t.rounds.length * 0.5; // current completed/scheduled rounds for provisional standings
  const rows: Standing[] = t.entries.map((e) => {
    const score = scores.get(e.playerId)!;
    const contributions = records
      .get(e.playerId)!
      .filter((r) => r.kind !== "pending")
      .map((r) => {
        const regular = ["1-0", "0-1", "1/2"].includes(r.kind);
        const opponentScore = regular
          ? adjusted.get(r.opponent!)!
          : Math.min(score, r.opponent ? adjusted.get(r.opponent)! : cap);
        return { bh: opponentScore, sb: opponentScore * r.score, vur: r.vur };
      });
    const bh = contributions.reduce((s, c) => s + c.bh, 0);
    const voluntary = contributions.filter((c) => c.vur);
    const cut = voluntary.length
      ? Math.min(...voluntary.map((c) => c.bh))
      : contributions.length
        ? Math.min(...contributions.map((c) => c.bh))
        : 0;
    return {
      playerId: e.playerId,
      name: e.name,
      number: e.number,
      score,
      bh,
      bhCut: bh - cut,
      sb: contributions.reduce((s, c) => s + c.sb, 0),
      rank: 0,
      tied: false,
      itu: e.itu,
      official: e.official,
      officialType: e.officialType,
    };
  });
  const equal = (a: Standing, b: Standing) =>
    a.score === b.score &&
    a.bhCut === b.bhCut &&
    a.bh === b.bh &&
    a.sb === b.sb;
  const lot = (id: string) => {
    const i = t.lotOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.bhCut - a.bhCut ||
      b.bh - a.bh ||
      b.sb - a.sb ||
      lot(a.playerId) - lot(b.playerId) ||
      a.number - b.number,
  );
  rows.forEach((r, i) => {
    const tiedGroup = rows.filter((x) => equal(r, x));
    const resolved = tiedGroup.every((x) => t.lotOrder.includes(x.playerId));
    r.tied = tiedGroup.length > 1 && !resolved;
    r.rank = r.tied ? rows.findIndex((x) => equal(r, x)) + 1 : i + 1;
  });
  return rows;
}
export function championship(state: PublicState, semester: string) {
  const totals = new Map<
    string,
    {
      playerId: string;
      name: string;
      points: number;
      events: number;
      wins: number;
      places: number[];
    }
  >();
  for (const t of state.tournaments.filter(
    (t) => t.status === "finished" && t.countsPoints && t.semester === semester,
  )) {
    standings(t).forEach((r, i) => {
      const row = totals.get(r.playerId) ?? {
        playerId: r.playerId,
        name: state.players.find((p) => p.id === r.playerId)?.name ?? r.name,
        points: 0,
        events: 0,
        wins: 0,
        places: [],
      };
      row.points += F1[i] ?? 0;
      row.events++;
      row.wins += i === 0 ? 1 : 0;
      row.places.push(i + 1);
      totals.set(r.playerId, row);
    });
  }
  const compare = (
    a: typeof totals extends Map<string, infer T> ? T : never,
    b: typeof totals extends Map<string, infer T> ? T : never,
  ) => {
    if (a.points !== b.points) return b.points - a.points;
    for (let place = 1; place <= 200; place++) {
      const diff =
        b.places.filter((x) => x === place).length -
        a.places.filter((x) => x === place).length;
      if (diff) return diff;
    }
    return 0;
  };
  const rows = [...totals.values()].sort(
    (a, b) => compare(a, b) || a.name.localeCompare(b.name, "tr"),
  );
  return rows.map((row, i) => ({
    ...row,
    rank: rows.findIndex((x) => compare(x, row) === 0) + 1,
    tied: rows.some((x, j) => i !== j && compare(x, row) === 0),
  }));
}
