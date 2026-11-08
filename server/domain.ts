import { randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import {
  effectiveRating,
  type State,
  type Tournament,
  type Result,
} from "../shared/types.js";
import { standings } from "../shared/standings.js";
import { rebuildRatings } from "../shared/ratings.js";
import { pair } from "./engine.js";
const text = z.string().trim().min(1).max(120);
const rating = z.number().int().min(100).max(3500);
export const policySchema = z.object({
  reference: rating,
  initialMethod: z.enum(["performance", "seed"]),
  provisionalGames: z.number().int().min(0).max(200),
  provisionalK: z.number().int().min(1).max(100),
  establishedK: z.number().int().min(1).max(100),
});
const playerSchema = z.object({
  name: text,
  official: rating.nullable(),
  officialType: z.enum(["ELO", "UKD"]),
});
const tournamentSchema = z.object({
  name: text,
  date: z.iso.date(),
  semester: text.optional(),
  roundsPlanned: z.number().int().min(1).max(15),
  timeControl: text,
  variant: z.literal("standard").default("standard"),
  countsPoints: z.boolean(),
  countsRating: z.boolean(),
});
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function active(t: Tournament) {
  requireThat(
    t.status !== "finished",
    "Tamamlanan turnuva önce yeniden açılmalı.",
  );
}
function completed(t: Tournament) {
  return (
    t.rounds.length > 0 &&
    t.rounds.every((r) => r.games.every((g) => g.result !== null))
  );
}
function nextEventTime(state: State) {
  const previous = Math.max(
    0,
    ...state.tournaments.map((t) =>
      t.finalizedAt ? Date.parse(t.finalizedAt) : 0,
    ),
    ...state.overrides.map((o) => Date.parse(o.at)),
  );
  return new Date(Math.max(Date.now(), previous + 1)).toISOString();
}
export async function applyAction(
  state: State,
  action: string,
  payload: unknown,
  owner: boolean,
) {
  const p = payload as Record<string, unknown>;
  if (action === "semester.create") {
    requireThat(owner, "Dönemleri yalnız kulüp yöneticisi oluşturabilir.");
    const input = z
      .object({ name: text, makeActive: z.boolean().default(false) })
      .parse(p);
    requireThat(
      !state.semesters.some(
        (s) => s.toLocaleLowerCase("tr") === input.name.toLocaleLowerCase("tr"),
      ),
      "Bu dönem zaten kayıtlı.",
    );
    state.semesters.push(input.name);
    if (input.makeActive) state.activeSemester = input.name;
    return;
  }
  if (action === "semester.activate") {
    requireThat(owner, "Aktif dönemi yalnız kulüp yöneticisi değiştirebilir.");
    const name = text.parse(p.name);
    requireThat(state.semesters.includes(name), "Dönem bulunamadı.");
    state.activeSemester = name;
    return;
  }
  if (action === "player.create" || action === "player.update") {
    const input = playerSchema.parse(p);
    if (action === "player.create") {
      requireThat(
        !state.players.some(
          (x) =>
            x.name.toLocaleLowerCase("tr") ===
            input.name.toLocaleLowerCase("tr"),
        ),
        "Bu isim zaten kayıtlı. Aynı isimli başka biri varsa ayırt edici bir ek kullanın.",
      );
      state.players.push({
        ...input,
        id: randomUUID(),
        itu: null,
        games: 0,
        createdAt: new Date().toISOString(),
      });
    } else {
      const player = state.players.find((x) => x.id === p.id);
      requireThat(player, "Oyuncu bulunamadı.");
      requireThat(
        !state.players.some(
          (x) =>
            x.id !== player.id &&
            x.name.toLocaleLowerCase("tr") ===
              input.name.toLocaleLowerCase("tr"),
        ),
        "Bu isim zaten kayıtlı.",
      );
      Object.assign(player, input);
    }
    return;
  }
  if (action === "policy.save") {
    requireThat(owner, "Bu işlem kulüp yöneticisine açık.");
    state.policy = policySchema.parse(p);
    return;
  }
  if (action === "ratings.recalculate") {
    requireThat(
      owner && p.confirm === true,
      "Geçmişi yeniden hesaplamak için onay gerekli.",
    );
    requireThat(
      !state.tournaments.some((t) => t.status === "live" && t.countsRating),
      "Önce Elo’ya dahil devam eden turnuvayı bitirin.",
    );
    rebuildRatings(state, state.policy);
    return;
  }
  if (action === "ratings.override") {
    requireThat(owner, "Bu işlem kulüp yöneticisine açık.");
    const input = z
      .object({ playerId: z.string(), value: rating, reason: text })
      .parse(p);
    requireThat(
      state.players.some((x) => x.id === input.playerId),
      "Oyuncu bulunamadı.",
    );
    requireThat(
      !state.tournaments.some((t) => t.status === "live" && t.countsRating),
      "Devam eden Elo turnuvası varken düzeltme yapılamaz.",
    );
    state.overrides.push({
      ...input,
      id: randomUUID(),
      at: nextEventTime(state),
    });
    rebuildRatings(state);
    return;
  }
  if (action === "tournament.create") {
    const input = tournamentSchema.parse(p);
    const semester = input.semester ?? state.activeSemester;
    requireThat(
      state.semesters.includes(semester),
      "Önce bu dönemi Kulüp ayarları'ndan oluşturun.",
    );
    state.tournaments.push({
      ...input,
      semester,
      id: randomUUID(),
      status: "draft",
      entries: [],
      rounds: [],
      policy: { ...state.policy },
      initialColor: randomInt(2) ? "w" : "b",
      finalizedAt: null,
      ratingChanges: [],
      lotOrder: [],
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const t = state.tournaments.find((t) => t.id === p.tournamentId);
  requireThat(t, "Turnuva bulunamadı.");
  if (action === "tournament.update") {
    requireThat(
      t.status === "draft",
      "Ayarlar yalnız turnuva başlamadan değişir.",
    );
    const input = tournamentSchema.parse(p);
    const semester = input.semester ?? t.semester;
    requireThat(state.semesters.includes(semester), "Dönem bulunamadı.");
    Object.assign(t, input, { semester });
    return;
  }
  if (action === "tournament.entries") {
    requireThat(
      t.status === "draft",
      "Oyuncular yalnız turnuva başlamadan eklenebilir.",
    );
    const ids = z.array(z.string()).max(200).parse(p.playerIds);
    requireThat(
      new Set(ids).size === ids.length,
      "Aynı oyuncu iki kez eklenemez.",
    );
    t.entries = ids.map((id) => {
      const player = state.players.find((x) => x.id === id);
      requireThat(player, "Oyuncu bulunamadı.");
      return {
        playerId: id,
        name: player.name,
        official: player.official,
        officialType: player.officialType,
        itu: player.itu,
        seed: effectiveRating(player, state.policy.reference),
        number: 0,
        withdrawn: false,
      };
    });
    return;
  }
  if (action === "round.generate") {
    active(t);
    requireThat(
      t.rounds.length < t.roundsPlanned,
      "Planlanan tüm turlar oynandı.",
    );
    requireThat(
      !t.rounds.length || completed(t),
      "Önce tüm tur sonuçlarını girin.",
    );
    if (t.status === "draft") {
      requireThat(t.entries.length >= 2, "En az iki oyuncu gerekli.");
      requireThat(
        !t.countsRating ||
          !state.tournaments.some(
            (x) => x.id !== t.id && x.status === "live" && x.countsRating,
          ),
        "Aynı anda yalnız bir Elo turnuvası devam edebilir.",
      );
      t.policy = { ...state.policy };
      // Refresh once at start, never mid-tournament. ITU rating always takes priority.
      for (const e of t.entries) {
        const player = state.players.find((x) => x.id === e.playerId)!;
        Object.assign(e, {
          name: player.name,
          itu: player.itu,
          official: player.official,
          officialType: player.officialType,
          seed: effectiveRating(player, t.policy.reference),
        });
      }
      t.entries.sort(
        (a, b) =>
          b.seed - a.seed ||
          a.name.localeCompare(b.name, "tr") ||
          a.playerId.localeCompare(b.playerId),
      );
      t.entries.forEach((e, i) => {
        e.number = i + 1;
      });
      t.status = "live";
    }
    requireThat(
      t.entries.filter((x) => !x.withdrawn).length >= 2,
      "En az iki aktif oyuncu gerekli.",
    );
    const pairing = await pair(t);
    t.rounds.push({ number: t.rounds.length + 1, ...pairing });
    t.lotOrder = [];
    return;
  }
  if (action === "round.result") {
    active(t);
    const input = z
      .object({
        round: z.number().int(),
        board: z.number().int(),
        result: z.enum(["1-0", "0-1", "1/2", "+-", "-+", "--"]).nullable(),
      })
      .parse(p);
    requireThat(
      input.round === t.rounds.length,
      "Eski sonuçları düzeltmek için sonraki turları geri alın.",
    );
    const game = t.rounds
      .at(-1)
      ?.games.find((g) => g.board === input.board && g.black);
    requireThat(game, "Maç bulunamadı.");
    game.result = input.result as Result | null;
    t.lotOrder = [];
    return;
  }
  if (action === "round.undo") {
    active(t);
    requireThat(
      p.confirm === true && t.rounds.length,
      "Son turu silmek için onay gerekli.",
    );
    t.rounds.pop();
    t.lotOrder = [];
    if (!t.rounds.length) {
      t.status = "draft";
      t.entries.forEach((e) => {
        e.withdrawn = false;
      });
    }
    return;
  }
  if (action === "player.withdraw") {
    requireThat(
      t.status === "live" && completed(t),
      "Çekilme/dönüş yalnız turlar arasında yapılabilir.",
    );
    const e = t.entries.find((e) => e.playerId === p.playerId);
    requireThat(e, "Oyuncu bulunamadı.");
    e.withdrawn = z.boolean().parse(p.withdrawn);
    return;
  }
  if (action === "tournament.lots") {
    active(t);
    requireThat(
      completed(t) && t.rounds.length === t.roundsPlanned,
      "Kura yalnız son tur bittikten sonra çekilir.",
    );
    requireThat(p.confirm === true, "Kura onayı gerekli.");
    requireThat(
      standings(t).some((r) => r.tied),
      "Çözülecek tam eşitlik yok; kayıtlı kura tekrarlanamaz.",
    );
    const ids = t.entries.map((e) => e.playerId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    t.lotOrder = ids;
    return;
  }
  if (action === "tournament.finalize") {
    requireThat(
      t.status === "live",
      "Turnuva zaten tamamlandı veya başlamadı.",
    );
    requireThat(
      completed(t) && t.rounds.length === t.roundsPlanned,
      "Planlanan tüm turlar ve sonuçlar tamamlanmalı.",
    );
    requireThat(
      !standings(t).some((r) => r.tied),
      "Tam eşitlik var. Önce son sıralama kurasını çekin.",
    );
    t.status = "finished";
    t.finalizedAt = nextEventTime(state);
    rebuildRatings(state);
    return;
  }
  if (action === "tournament.reopen") {
    requireThat(
      owner && p.confirm === true && t.status === "finished",
      "Yeniden açmak için yönetici onayı gerekli.",
    );
    requireThat(
      !state.tournaments.some((x) => x.status === "live" && x.countsRating),
      "Önce devam eden Elo turnuvasını bitirin.",
    );
    requireThat(
      !t.countsRating ||
        !state.tournaments.some(
          (x) =>
            x.countsRating && x.finalizedAt && x.finalizedAt > t.finalizedAt!,
        ),
      "Sonraki Elo turnuvaları varken eski turnuva açılamaz. En yeniden geriye doğru açın.",
    );
    t.status = "live";
    t.finalizedAt = null;
    t.ratingChanges = [];
    rebuildRatings(state);
    return;
  }
  throw new Error("Bilinmeyen işlem.");
}
