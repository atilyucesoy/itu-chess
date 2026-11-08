import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  RefreshCw,
} from "lucide-react";
import type { Entry, Game, Tournament } from "../../shared/types";

function score(result: Game["result"]) {
  return (
    (
      {
        "1-0": "1 – 0",
        "0-1": "0 – 1",
        "1/2": "½ – ½",
        "+-": "+ – −",
        "-+": "− – +",
        "--": "− – −",
        bye: "1",
        absent: "0",
      } as Record<string, string>
    )[result ?? ""] ?? "—"
  );
}
function Player({ entry, color }: { entry: Entry; color: "white" | "black" }) {
  return (
    <div className={`projection-player ${color}`}>
      <strong className="projection-name">{entry.name}</strong>
      <div className="projection-ratings">
        <b>
          <small>İTÜ</small> {entry.itu ?? "—"}
        </b>
        <span>
          {entry.officialType} {entry.official ?? "—"}
        </span>
      </div>
    </div>
  );
}

export default function Projection({
  tournament: t,
  sandbox,
  expired,
  onRefresh,
}: {
  tournament?: Tournament;
  sandbox: boolean;
  expired: boolean;
  onRefresh: () => void;
}) {
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [selection, setSelection] = useState("latest");
  const [page, setPage] = useState(0);
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    const change = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", change);
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  const round =
    selection === "latest"
      ? t?.rounds.at(-1)
      : t?.rounds.find((r) => r.number === Number(selection));
  useEffect(() => {
    setPage(0);
  }, [round?.number]);
  const games = [...(round?.games ?? [])]
    .filter((g) => g.board > 0)
    .sort((a, b) => a.board - b.board);
  const columns = size.width >= 1000 && games.length > 10 ? 2 : 1;
  const longestName = Math.max(
    0,
    ...(t?.entries.map((e) => e.name.length) ?? []),
  );
  const rowHeight = longestName > 64 ? 158 : longestName > 34 ? 108 : 88;
  const rows = Math.max(
    2,
    Math.min(
      10,
      Math.floor((size.height - (size.width < 700 ? 255 : 170)) / rowHeight),
    ),
  );
  const capacity = columns * rows;
  const pages = Math.max(1, Math.ceil(games.length / capacity));
  const visiblePage = Math.min(page, pages - 1);
  const visible = games.slice(
    visiblePage * capacity,
    (visiblePage + 1) * capacity,
  );
  const half = Math.ceil(visible.length / columns);
  const groups = Array.from({ length: columns }, (_, i) =>
    visible.slice(i * half, (i + 1) * half),
  );
  const byId = new Map(t?.entries.map((e) => [e.playerId, e]) ?? []);
  async function toggleFullscreen() {
    try {
      setFullscreenError("");
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        "Tarayıcı tam ekrana izin vermedi. F11 tuşunu kullanabilirsiniz.",
      );
    }
  }
  return (
    <section className="projection" aria-label="Projeksiyon eşlendirmeleri">
      <header className="projection-header">
        <div className="projection-title">
          <img src="/club-logo-gold.png" alt="İTÜ Satranç Kulübü" />
          <div>
            <h1>{t?.name ?? "Turnuva bulunamadı"}</h1>
            <p>
              {expired
                ? "Deneme oturumu sona erdi."
                : round
                  ? `${round.number}. tur eşlendirmeleri · ${games.length} masa · ${t?.timeControl}`
                  : "Henüz eşlendirme yok"}
              {sandbox && (
                <span className="projection-sandbox">DENEME ORTAMI</span>
              )}
            </p>
          </div>
        </div>
        <div className="projection-controls">
          <a
            className="button secondary small"
            href={t ? `#tournament/${t.id}` : "#tournaments"}
          >
            <ArrowLeft size={15} />
            Turnuvaya dön
          </a>
          <button
            className="button secondary small"
            onClick={onRefresh}
            aria-label="Eşlendirmeleri yenile"
          >
            <RefreshCw size={15} />
          </button>
          <button className="button secondary small" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            {fullscreen ? "Tam ekrandan çık" : "Tam ekran"}
          </button>
        </div>
      </header>
      {fullscreenError && (
        <p className="form-error" role="alert">
          {fullscreenError}
        </p>
      )}
      <div className="projection-legend">
        <span>İTÜ Elo · Resmî Elo/UKD</span>
        <select
          aria-label="Projeksiyon turu"
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
        >
          <option value="latest">Son tur (otomatik)</option>
          {t?.rounds.map((r) => (
            <option value={r.number} key={r.number}>
              {r.number}. tur
            </option>
          ))}
        </select>
      </div>
      {games.length ? (
        <div
          className="projection-columns"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {groups.map((group, i) => (
            <div
              className="projection-column"
              key={i}
              style={{
                gridTemplateRows: `22px repeat(${Math.max(1, half)}, minmax(0, 1fr))`,
              }}
            >
              <div className="projection-column-head">
                <span>Masa</span>
                <span>
                  <i className="piece-dot white-piece" />
                  Beyaz
                </span>
                <span>Sonuç</span>
                <span>
                  <i className="piece-dot black-piece" />
                  Siyah
                </span>
              </div>
              {group.map((g) => (
                <article
                  className="projection-game"
                  key={g.board}
                  aria-label={`Masa ${g.board}`}
                >
                  <span className="projection-board">
                    <small>MASA</small>
                    {g.board}
                  </span>
                  <Player entry={byId.get(g.white)!} color="white" />
                  <span
                    className={`projection-result ${g.result ? "has-result" : ""}`}
                  >
                    {score(g.result)}
                  </span>
                  {g.black ? (
                    <Player entry={byId.get(g.black)!} color="black" />
                  ) : (
                    <div className="projection-bye">
                      Tur atladı<small>1 puan</small>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>
            {expired
              ? "Kulüp kayıtlarına dönerek deneme oturumunu kapatın."
              : "Eşlendirme yayınlandığında burada görünecek."}
          </h2>
        </div>
      )}
      <footer className="projection-footer">
        <span>
          İTÜ Elo önce, resmî Elo/UKD sonra · 20 saniyede bir yenilenir
        </span>
        {pages > 1 && (
          <div className="projection-pagination">
            <button
              className="button secondary small"
              aria-label="Önceki masalar"
              disabled={!visiblePage}
              onClick={() => setPage(visiblePage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <b>
              {visiblePage + 1} / {pages}
            </b>
            <button
              className="button secondary small"
              aria-label="Sonraki masalar"
              disabled={visiblePage === pages - 1}
              onClick={() => setPage(visiblePage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <span>
          {visible.length
            ? `Masa ${visible[0].board}–${visible.at(-1)!.board}`
            : ""}
          {round?.games.some((g) => g.result === "absent")
            ? ` · ${round.games.filter((g) => g.result === "absent").length} oyuncu bu tur oynamıyor`
            : ""}
        </span>
      </footer>
    </section>
  );
}
