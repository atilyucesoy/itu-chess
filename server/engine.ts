import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  scoreOf,
  type Tournament,
  type Game,
  type Entry,
} from "../shared/types.js";
const exec = promisify(execFile);
export const ENGINE_VERSION = "bbpPairings 6.0.0 · FIDE Dutch 2026";
export const enginePath = () =>
  process.env.BBP_PATH ?? resolve("bin/bbpPairings-v6.0.0/bbpPairings.exe");

export function toTrf(t: Tournament, pairing = false) {
  const lines = [
    `012 ITU Chess Club`,
    `142 ${t.roundsPlanned}`,
    `152 ${t.initialColor.toUpperCase()}`,
    "192 FIDE_DUTCH_2025",
  ];
  for (const e of [...t.entries].sort((a, b) => a.number - b.number)) {
    const line = Array(89).fill(" ");
    const put = (index: number, text: string) =>
      [...text].forEach((char, i) => {
        line[index + i] = char;
      });
    put(0, "001 ");
    put(4, String(e.number).padStart(4));
    // ASCII IDs keep fixed-width TRF fields safe; actual names stay in the application.
    put(14, `Player ${e.number}`);
    put(48, String(e.seed).padStart(4));
    let score = 0;
    const history = t.rounds
      .map((r) => {
        const g = r.games.find(
          (g) => g.white === e.playerId || g.black === e.playerId,
        );
        if (!g?.result) throw new Error("TRF için tüm sonuçlar girilmeli.");
        const white = g.white === e.playerId;
        score += scoreOf(g.result, white);
        if (!g.black) return `  0000 - ${g.result === "bye" ? "U" : "Z"}`;
        const opponent = t.entries.find(
          (x) => x.playerId === (white ? g.black : g.white),
        )!;
        const result =
          g.result === "1/2"
            ? "="
            : g.result === "1-0" || g.result === "0-1"
              ? String(scoreOf(g.result, white))
              : scoreOf(g.result, white)
                ? "+"
                : "-";
        return `  ${String(opponent.number).padStart(4)} ${white ? "w" : "b"} ${result}`;
      })
      .join("");
    put(80, score.toFixed(1).padStart(4));
    put(84, String(e.number).padStart(5));
    lines.push(
      line.join("") + history + (pairing && e.withdrawn ? "  0000 - Z" : ""),
    );
  }
  return lines.join("\n") + "\n";
}

export async function pair(
  t: Tournament,
): Promise<{ games: Game[]; trf: string; engine: string }> {
  const trf = toTrf(t, true);
  const dir = await mkdtemp(join(tmpdir(), "itu-chess-"));
  try {
    const file = join(dir, "tournament.trf");
    await writeFile(file, trf);
    const { stdout } = await exec(enginePath(), ["--dutch", file, "-p"], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const lines = stdout.trim().split(/\r?\n/);
    const count = Number(lines.shift());
    if (!Number.isInteger(count) || count !== lines.length)
      throw new Error("Motor yanıtı doğrulanamadı.");
    const byNumber = new Map(t.entries.map((e) => [e.number, e]));
    const seen = new Set<string>();
    const games: Game[] = lines.map((line, i) => {
      const [a, b] = line.trim().split(/\s+/).map(Number);
      const white = byNumber.get(a),
        black = b === 0 ? null : byNumber.get(b);
      if (!white || (b !== 0 && !black))
        throw new Error("Motor bilinmeyen oyuncu döndürdü.");
      for (const e of [white, black].filter(Boolean) as Entry[]) {
        if (seen.has(e.playerId) || e.withdrawn)
          throw new Error("Geçersiz eşlendirme: çift/çekilen oyuncu.");
        seen.add(e.playerId);
      }
      return {
        board: i + 1,
        white: white.playerId,
        black: black?.playerId ?? null,
        result: black ? null : "bye",
      };
    });
    if (seen.size !== t.entries.filter((e) => !e.withdrawn).length)
      throw new Error("Motor bazı oyuncuları eşlendirmedi.");
    for (const e of t.entries.filter((e) => e.withdrawn))
      games.push({
        board: 0,
        white: e.playerId,
        black: null,
        result: "absent",
      });
    return { games, trf, engine: ENGINE_VERSION };
  } catch (error) {
    const err = error as Error & { stderr?: string; code?: string | number };
    if (err.code === "ENOENT")
      throw new Error(
        "Eşlendirme motoru bulunamadı. npm run engine:install çalıştırın.",
      );
    throw new Error(
      `Eşlendirme oluşturulamadı: ${err.stderr?.trim() || err.message}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
