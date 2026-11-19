import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize, Minimize, RefreshCw } from "lucide-react";
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
function Player({ entry, fontSize }: { entry: Entry; fontSize: number }) {
  return (
    <div className="projection-player">
      <span className="projection-name" style={{ fontSize }}>
        {entry.name}
      </span>
      <span className="projection-ratings">
        <span>İTÜ {entry.itu ?? "—"}</span>
        <span>
          {entry.officialType} {entry.official ?? "—"}
        </span>
      </span>
    </div>
  );
}

export default function Projection({
  tournament: t,
  sandbox,
  expired,
  disconnected,
  refreshing,
  lastChecked,
  onRefresh,
}: {
  tournament?: Tournament;
  sandbox: boolean;
  expired: boolean;
  disconnected: boolean;
  refreshing: boolean;
  lastChecked: Date | null;
  onRefresh: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({
    width: 0,
    height: 0,
    names: new Map<string, number>(),
  });
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [selection, setSelection] = useState("latest");
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  const round =
    selection === "latest"
      ? t?.rounds.at(-1)
      : t?.rounds.find((r) => r.number === Number(selection));
  const games = [...(round?.games ?? [])]
    .filter((g) => g.board > 0)
    .sort((a, b) => a.board - b.board);
  const hasGames = games.length > 0;
  const entries = t?.entries;
  useEffect(() => {
    const el = gridRef.current;
    if (!hasGames || !el) return;
    let active = true;
    const canvas = document.createElement("canvas").getContext("2d");
    function measure() {
      if (!active || !el) return;
      const names = new Map<string, number>();
      if (canvas) canvas.font = `550 100px ${getComputedStyle(el).fontFamily}`;
      for (const entry of entries ?? []) {
        names.set(
          entry.playerId,
          (canvas?.measureText(entry.name).width ?? entry.name.length * 55) /
            100,
        );
      }
      setGrid({ width: el.clientWidth, height: el.clientHeight, names });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [entries, hasGames]);
  const nameWidths = games
    .flatMap((g) => [g.white, g.black])
    .map((id) => (id && grid.names.get(id)) || 10)
    .sort((a, b) => a - b);
  const typicalNameWidth =
    nameWidths[Math.floor(nameWidths.length * 0.8)] ?? 10;
  const width = grid.width || 320;
  const height = grid.height || 540;
  const maxColumns = Math.min(
    6,
    Math.max(1, Math.floor(width / 280)),
    games.length || 1,
  );
  let layout = {
    columns: 1,
    rows: Math.max(1, games.length),
    nameWidth: 1,
    fontSize: 0,
  };
  for (let columns = 1; columns <= maxColumns; columns++) {
    const rows = Math.max(1, Math.ceil(games.length / columns));
    const columnWidth = (width - (columns - 1) * 18) / columns;
    const nameWidth = (columnWidth * 0.77 - 22) / 2;
    const rowHeight = (height - 18 - rows * 3) / rows;
    const fontSize = Math.max(
      3,
      Math.min(26, rowHeight * 0.5, nameWidth / typicalNameWidth),
    );
    if (fontSize > layout.fontSize)
      layout = { columns, rows, nameWidth, fontSize };
  }
  const groups = Array.from({ length: layout.columns }, (_, i) =>
    games.slice(i * layout.rows, (i + 1) * layout.rows),
  );
  const fitName = (id: string) =>
    Math.min(
      layout.fontSize,
      layout.nameWidth / (grid.names.get(id) || typicalNameWidth),
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
            disabled={refreshing}
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
        <span
          className={disconnected ? "projection-disconnected" : undefined}
          role="status"
        >
          {disconnected
            ? "Bağlantı kesildi. Son görülen eşlendirmeler."
            : "İTÜ Elo ve resmî rating"}
        </span>
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
          ref={gridRef}
          className="projection-columns"
          style={{
            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            fontSize: layout.fontSize,
          }}
        >
          {groups.map((group, i) => (
            <div
              className="projection-column"
              key={i}
              style={{
                gridTemplateRows: `18px repeat(${layout.rows}, minmax(0, 1fr))`,
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
                  <span className="projection-board">{g.board}</span>
                  <Player
                    entry={byId.get(g.white)!}
                    fontSize={fitName(g.white)}
                  />
                  <span
                    className={`projection-result ${g.result ? "has-result" : ""}`}
                  >
                    {score(g.result)}
                  </span>
                  {g.black ? (
                    <Player
                      entry={byId.get(g.black)!}
                      fontSize={fitName(g.black)}
                    />
                  ) : (
                    <div className="projection-bye">Tur atladı</div>
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
          {selection === "latest"
            ? "Son tur otomatik"
            : "Seçilen tur gösteriliyor"}
          {lastChecked &&
            ` · ${disconnected ? "Son bağlantı" : "Son kontrol"} ${lastChecked.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
        </span>
        <span>
          {games.length ? `Masa ${games[0].board}–${games.at(-1)!.board}` : ""}
          {round?.games.some((g) => g.result === "absent")
            ? ` · ${round.games.filter((g) => g.result === "absent").length} oyuncu bu tur oynamıyor`
            : ""}
        </span>
      </footer>
    </section>
  );
}
