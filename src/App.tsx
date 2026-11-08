import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Trophy,
  Users,
  LayoutDashboard,
  Settings,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Search,
  LogOut,
  LogIn,
  X,
  Check,
  Flag,
  Download,
  RotateCcw,
  Moon,
  Sun,
  Menu,
  ShieldCheck,
  CalendarDays,
  Clock3,
  Shuffle,
  Medal,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Crown,
  Copy,
} from "lucide-react";
import {
  DEFAULT_POLICY,
  F1,
  effectiveRating,
  type PublicState,
  type SessionUser,
  type Tournament,
  type Player,
  type Result,
} from "../shared/types";
import { standings, championship } from "../shared/standings";

type Page =
  | "home"
  | "tournaments"
  | "players"
  | "championship"
  | "settings"
  | "tournament";
type Modal = { title: string; content: ReactNode } | null;
const empty: PublicState = {
  players: [],
  tournaments: [],
  policy: DEFAULT_POLICY,
  overrides: [],
  audit: [],
};
const fmt = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const date = (d: string) =>
  new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const labels = {
  draft: "Hazırlanıyor",
  live: "Devam ediyor",
  finished: "Tamamlandı",
};
function currentSemester() {
  const d = new Date();
  return d.getMonth() >= 7
    ? `${d.getFullYear()}–${d.getFullYear() + 1} Güz`
    : `${d.getFullYear() - 1}–${d.getFullYear()} Bahar`;
}
function ClubMark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="club-mark"
      src="/club-logo-gold.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
function Badge({ status }: { status: Tournament["status"] }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
function Rating({
  itu,
  official,
  kind = "ELO",
}: {
  itu: number | null;
  official: number | null;
  kind?: string;
}) {
  return (
    <span className="ratings">
      <strong>
        {itu === null ? <span className="unrated">—</span> : fmt(itu)}
      </strong>
      <span>
        {official === null ? "—" : fmt(official)} <small>{kind}</small>
      </span>
    </span>
  );
}
function Empty({
  icon = <ClubMark size={46} />,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function csv(name: string, rows: (string | number | null)[][]) {
  const text =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return `"${s.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function App() {
  const [state, setState] = useState<PublicState>(empty);
  const [revision, setRevision] = useState(0);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<"club" | "sandbox" | "expired">(
    "club",
  );
  const [developerAvailable, setDeveloperAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [route, setRoute] = useState(location.hash.slice(1) || "home");
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(
    localStorage.getItem("itu-theme") === "dark",
  );
  const [semester, setSemester] = useState(currentSemester());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, id] = route.split("/") as [Page, string | undefined];
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const load = useCallback(async () => {
    const response = await fetch("/api/state");
    if (!response.ok)
      throw new Error("Sunucuya ulaşılamıyor. Birazdan tekrar deneyin.");
    const data = await response.json();
    setState(data.state);
    setRevision(data.revision);
    setUser(data.user);
    setWorkspace(data.workspace ?? "club");
    setDeveloperAvailable(data.developerAvailable === true);
    setLoading(false);
  }, []);
  useEffect(() => {
    load().catch((e) => {
      notify(e.message, true);
      setLoading(false);
    });
    const timer = setInterval(() => load().catch(() => {}), 20_000);
    return () => clearInterval(timer);
  }, [load, notify]);
  useEffect(() => {
    const listener = () => {
      setRoute(location.hash.slice(1) || "home");
      setSearch("");
      setFilter("all");
      setMobile(false);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("itu-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, [modal]);
  const go = (page: string) => {
    location.hash = page;
  };
  async function action(name: string, payload: object, success = "Kaydedildi") {
    setBusy(true);
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, workspace, action: name, payload }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 || response.status === 401) {
          await load();
          setModal(null);
        }
        throw new Error(
          data.details ? `${data.error} ${data.details}` : data.error,
        );
      }
      await load();
      notify(success);
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function developerAction(kind: "enter" | "reset" | "exit") {
    if (busy) return;
    if (
      kind !== "enter" &&
      !confirm(
        kind === "reset"
          ? "Deneme alanındaki TÜM oyuncular, turnuvalar, ratingler ve işlem kayıtları silinsin mi?"
          : "Deneme verileri silinip gerçek kulüp kayıtlarına dönülsün mü?",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/developer/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, revision }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) await load();
        throw new Error(data.error);
      }
      setModal(null);
      await load();
      go("home");
      notify(
        kind === "enter"
          ? "Deneme ortamı açıldı. Gerçek kayıtlar etkilenmez."
          : kind === "reset"
            ? "Deneme verileri tamamen temizlendi."
            : "Kulüp kayıtlarına dönüldü. Deneme verileri silindi.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function newTournament() {
    setModal({
      title: "Yeni turnuva",
      content: (
        <TournamentForm
          onSave={async (data) => {
            if (
              await action("tournament.create", data, "Turnuva oluşturuldu")
            ) {
              setModal(null);
              go("tournaments");
            }
          }}
        />
      ),
    });
  }
  function playerForm(player?: Player) {
    setModal({
      title: player ? "Oyuncuyu düzenle" : "Yeni oyuncu",
      content: (
        <PlayerForm
          player={player}
          onSave={async (data) => {
            if (
              await action(player ? "player.update" : "player.create", {
                ...data,
                id: player?.id,
              })
            )
              setModal(null);
          }}
        />
      ),
    });
  }
  function profile(player: Player) {
    setModal({
      title: player.name,
      content: (
        <PlayerProfile
          player={player}
          state={state}
          owner={user?.role === "owner"}
          onEdit={() => playerForm(player)}
          canEdit={!!user}
          onOverride={async (value, reason) => {
            if (
              await action("ratings.override", {
                playerId: player.id,
                value,
                reason,
              })
            )
              setModal(null);
          }}
        />
      ),
    });
  }
  function login() {
    setModal({
      title: "Yönetici girişi",
      content: (
        <Login
          onLogin={async (username, password) => {
            const res = await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            await load();
            setModal(null);
            notify("Hoş geldin, " + data.user.name);
          }}
        />
      ),
    });
  }
  const tournaments = [...state.tournaments].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const live = tournaments.filter((t) => t.status === "live");
  const finished = tournaments.filter((t) => t.status === "finished");
  const semesters = [
    ...new Set([currentSemester(), ...tournaments.map((t) => t.semester)]),
  ];
  const title =
    {
      home: "Kulüp özeti",
      tournaments: "Turnuvalar",
      tournament: "Turnuva masası",
      players: "Oyuncular",
      championship: "Dönem sıralaması",
      settings: "Kulüp ayarları",
    }[page] ?? "Kulüp özeti";
  const openPlayer = (playerId: string) => {
    const p = state.players.find((p) => p.id === playerId);
    if (p) profile(p);
  };
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#home" className="brand">
          <div className="brand-icon">
            <ClubMark size={35} />
          </div>
          <div>
            İTÜ <b>SATRANÇ</b>
            <small>İstanbul Teknik Üniversitesi</small>
          </div>
        </a>
        <div className="nav-label">TURNUVA YÖNETİMİ</div>
        <nav>
          {(
            [
              ["home", LayoutDashboard, "Genel bakış"],
              ["tournaments", Trophy, "Turnuvalar"],
              ["players", Users, "Oyuncular"],
              ["championship", Medal, "Dönem sıralaması"],
            ] as const
          ).map(([key, Icon, label]) => (
            <a
              href={`#${key}`}
              key={key}
              className={
                page === key || (key === "tournaments" && page === "tournament")
                  ? "active"
                  : ""
              }
            >
              <Icon size={19} />
              {label}
              {key === "tournaments" && live.length > 0 && (
                <span className="nav-count" aria-hidden="true">
                  {live.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {user && (
            <a
              href="#settings"
              className={`settings-link ${page === "settings" ? "active" : ""}`}
            >
              <Settings size={18} />
              Kulüp ayarları
            </a>
          )}
          <div className="sidebar-footer">
            <span>İTÜ Satranç Kulübü</span>
            <span className="version">v0.1</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Menüyü kapat"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setMobile(!mobile)}
              aria-label="Menü"
            >
              <Menu size={22} />
            </button>
            <span>İTÜ Satranç</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span className="season-chip">
              <i />
              {semester}
            </span>
            <button
              className="icon-button"
              aria-label={dark ? "Açık tema" : "Koyu tema"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {user ? (
              <>
                <span className="user-name">
                  <span className="avatar">{user.name[0]}</span>
                  {user.name}
                </span>
                <button
                  className="icon-button"
                  aria-label="Çıkış yap"
                  onClick={async () => {
                    await fetch("/api/logout", { method: "POST" });
                    await load();
                    go("home");
                  }}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button className="button small secondary" onClick={login}>
                <LogIn size={15} />
                Yönetici girişi
              </button>
            )}
          </div>
        </header>
        {workspace !== "club" && (
          <div
            className="developer-banner"
            role="region"
            aria-label="Deneme ortamı"
          >
            <div>
              <strong>
                {workspace === "expired"
                  ? "Deneme oturumu sona erdi"
                  : "DEVELOPER MODE · DENEME ORTAMI"}
              </strong>
              <span>
                {workspace === "expired"
                  ? "Deneme verileri korunmadı. Devam etmek için kulüp kayıtlarına dönün."
                  : "Bu alandaki oyuncular, sonuçlar ve ratingler gerçek kulüp kayıtlarına yazılmaz."}
              </span>
            </div>
            <div className="button-group">
              {workspace === "sandbox" && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => developerAction("reset")}
                >
                  <RotateCcw size={14} />
                  Denemeyi sıfırla
                </button>
              )}
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => developerAction("exit")}
              >
                Kulüp kayıtlarına dön
              </button>
            </div>
          </div>
        )}
        <div className="content" aria-busy={busy || loading}>
          {loading ? (
            <div className="loading">
              <ClubMark size={55} />
              <p>Yükleniyor…</p>
            </div>
          ) : (
            <>
              {page === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Genel bakış</h1>
                      <p>Turnuvalar, oyuncular ve dönem sıralaması.</p>
                    </div>
                    {user && (
                      <button className="button" onClick={newTournament}>
                        <Plus size={18} />
                        Yeni turnuva
                      </button>
                    )}
                  </div>
                  <section className="hero">
                    <div className="hero-copy">
                      <h2>İTÜ Satranç Kulübü</h2>
                      <p>
                        {live[0]
                          ? `Devam eden turnuva: ${live[0].name}`
                          : "Haftalık turnuva sonuçları ve eşlendirmeler."}
                      </p>
                      <button
                        className="button cream"
                        onClick={() =>
                          go(
                            live[0]
                              ? `tournament/${live[0].id}`
                              : "tournaments",
                          )
                        }
                      >
                        {live.length
                          ? "Devam eden turnuvaya git"
                          : "Turnuvaları görüntüle"}
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <img
                        className="hero-club-logo"
                        src="/club-logo-gold.png"
                        alt=""
                      />
                    </div>
                  </section>
                  <div className="stats-grid">
                    {[
                      [
                        Users,
                        state.players.length,
                        "Kayıtlı oyuncu",
                        "Oyuncu havuzu",
                      ],
                      [
                        Trophy,
                        finished.length,
                        "Tamamlanan turnuva",
                        "Turnuva arşivi",
                      ],
                      [
                        Flag,
                        live.length,
                        "Devam eden turnuva",
                        live.length ? "Sonuç girişi açık" : "Aktif turnuva yok",
                      ],
                      [
                        Medal,
                        championship(state, semester).length,
                        "Dönem sıralamasındaki oyuncu",
                        semester,
                      ],
                    ].map(([Icon, value, label, sub], i) => {
                      const I = Icon as typeof Users;
                      return (
                        <div className="stat" key={i}>
                          <div className={`stat-icon tone-${i}`}>
                            <I size={20} />
                          </div>
                          <strong>{String(value)}</strong>
                          <span>{String(label)}</span>
                          <small>{String(sub)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="home-columns">
                    <section>
                      <div className="section-heading">
                        <h2>Turnuva takvimi</h2>
                        <a href="#tournaments">
                          Tüm turnuvalar
                          <ArrowRight size={15} />
                        </a>
                      </div>
                      <div className="card tournament-list">
                        {!tournaments.length ? (
                          <Empty
                            title="Henüz turnuva yok"
                            action={
                              user ? (
                                <button
                                  className="button secondary"
                                  onClick={newTournament}
                                >
                                  <Plus size={16} />
                                  Turnuva oluştur
                                </button>
                              ) : undefined
                            }
                          >
                            Turnuvalar yayınlandığında burada görebilirsin.
                          </Empty>
                        ) : (
                          tournaments
                            .slice(0, 4)
                            .map((t) => (
                              <TournamentRow
                                key={t.id}
                                t={t}
                                onClick={() => go(`tournament/${t.id}`)}
                              />
                            ))
                        )}
                      </div>
                    </section>
                    <section>
                      <div className="section-heading">
                        <h2>Dönem podyumu</h2>
                        <a href="#championship">
                          Sıralama
                          <ArrowRight size={15} />
                        </a>
                      </div>
                      <div className="card season-preview">
                        <div className="season-label">
                          <Trophy size={17} />
                          {semester}
                        </div>
                        {championship(state, semester).length ? (
                          championship(state, semester)
                            .slice(0, 3)
                            .map((p, i) => (
                              <button
                                className="podium-row"
                                onClick={() => openPlayer(p.playerId)}
                                key={p.playerId}
                              >
                                <span className={`medal medal-${i + 1}`}>
                                  {i + 1}
                                </span>
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>{p.events} turnuva</small>
                                </span>
                                <b>
                                  {p.points}
                                  <small> puan</small>
                                </b>
                              </button>
                            ))
                        ) : (
                          <Empty
                            icon={<Medal size={34} />}
                            title="Henüz dönem puanı yok"
                          >
                            Puanlı bir turnuva tamamlandığında sıralama oluşur.
                          </Empty>
                        )}
                        <div className="points-note">
                          İlk 10 oyuncuya Grand Prix puanı verilir.
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="bottom-note">
                    <ShieldCheck size={16} />
                    <span>FIDE Dutch eşlendirme sistemi</span>
                    <span className="dot">·</span>
                    <span>Kulübe özel İTÜ Elo</span>
                  </div>
                </>
              )}
              {page === "tournaments" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Turnuvalar</h1>
                      <p>Devam eden ve tamamlanan turnuvalar.</p>
                    </div>
                    {user && (
                      <button className="button" onClick={newTournament}>
                        <Plus size={18} />
                        Yeni turnuva
                      </button>
                    )}
                  </div>
                  <div className="toolbar">
                    <div className="tabs">
                      {[
                        ["all", "Tümü"],
                        ["live", "Devam eden"],
                        ["draft", "Yaklaşan"],
                        ["finished", "Tamamlanan"],
                      ].map(([key, label]) => (
                        <button
                          className={filter === key ? "selected" : ""}
                          onClick={() => setFilter(key)}
                          key={key}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Turnuva ara…"
                    />
                  </div>
                  <div className="tournament-grid">
                    {tournaments
                      .filter(
                        (t) =>
                          (filter === "all" || t.status === filter) &&
                          t.name
                            .toLocaleLowerCase("tr")
                            .includes(search.toLocaleLowerCase("tr")),
                      )
                      .map((t) => (
                        <button
                          className="card tournament-card"
                          key={t.id}
                          onClick={() => go(`tournament/${t.id}`)}
                        >
                          <div className="tournament-card-top">
                            <div
                              className={`event-icon ${t.variant === "chess960" ? "purple" : ""}`}
                            >
                              {t.variant === "chess960" ? (
                                <Shuffle size={23} />
                              ) : (
                                <ClubMark size={32} />
                              )}
                            </div>
                            <Badge status={t.status} />
                          </div>
                          <h2>{t.name}</h2>
                          <span className="muted">{date(t.date)}</span>
                          <div className="event-meta">
                            <span>
                              <Users size={15} />
                              {t.entries.length} oyuncu
                            </span>
                            <span>
                              <Flag size={15} />
                              {t.roundsPlanned} tur
                            </span>
                            <span>
                              <Clock3 size={15} />
                              {t.timeControl}
                            </span>
                          </div>
                          <div className="event-tags">
                            <span>
                              {t.variant === "chess960"
                                ? "Chess960"
                                : "İsviçre sistemi"}
                            </span>
                            {t.countsPoints && <span>Dönem puanlı</span>}
                            {t.countsRating && <span>İTÜ Elo</span>}
                          </div>
                          {t.status === "finished" && (
                            <div className="winner">
                              <Crown size={16} />
                              {standings(t)[0]?.name}
                              <ArrowUpRight size={16} />
                            </div>
                          )}
                          {t.status !== "finished" && (
                            <div className="card-foot">
                              {t.status === "draft"
                                ? "Turnuva hazırlığı"
                                : `${t.rounds.length}. tur · ${t.rounds.at(-1)?.games.filter((g) => g.result).length}/${t.rounds.at(-1)?.games.length} sonuç`}
                              <ArrowUpRight size={17} />
                            </div>
                          )}
                        </button>
                      ))}
                  </div>
                  {!tournaments.length && (
                    <div className="card">
                      <Empty title="Takvim henüz boş">
                        İlk haftalık turnuvayı oluşturup oyuncularını ekleyerek
                        başlayabilirsin.
                      </Empty>
                    </div>
                  )}
                </>
              )}
              {page === "players" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Oyuncular{" "}
                        <span className="count">{state.players.length}</span>
                      </h1>
                      <p>Kayıtlı oyuncular ve ratingleri.</p>
                    </div>
                    {user && (
                      <button className="button" onClick={() => playerForm()}>
                        <Plus size={18} />
                        Oyuncu ekle
                      </button>
                    )}
                  </div>
                  <div className="toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Oyuncu adı ara…"
                    />
                    <button
                      className="button secondary small"
                      onClick={() =>
                        csv("itu-oyuncular.csv", [
                          ["Ad", "İTÜ Elo", "Resmî rating", "Tür"],
                          ...state.players.map((p) => [
                            p.name,
                            p.itu,
                            p.official,
                            p.officialType,
                          ]),
                        ])
                      }
                    >
                      <Download size={15} />
                      CSV indir
                    </button>
                  </div>
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Oyuncu</th>
                          <th>İTÜ Elo / Resmî</th>
                          <th>Oynanan maç</th>
                          <th>Durum</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {[...state.players]
                          .sort(
                            (a, b) =>
                              effectiveRating(b, state.policy.reference) -
                                effectiveRating(a, state.policy.reference) ||
                              a.name.localeCompare(b.name, "tr"),
                          )
                          .filter((p) =>
                            p.name
                              .toLocaleLowerCase("tr")
                              .includes(search.toLocaleLowerCase("tr")),
                          )
                          .map((p, i) => (
                            <tr
                              key={p.id}
                              className="clickable"
                              onClick={() => profile(p)}
                            >
                              <td className="muted">{i + 1}</td>
                              <td>
                                <button className="player-link">
                                  <span className={`avatar color-${i % 4}`}>
                                    {p.name[0]}
                                  </span>
                                  {p.name}
                                </button>
                              </td>
                              <td>
                                <Rating
                                  itu={p.itu}
                                  official={p.official}
                                  kind={p.officialType}
                                />
                              </td>
                              <td>{p.games}</td>
                              <td>
                                <span className="pill">
                                  {p.itu === null
                                    ? "Henüz derecesiz"
                                    : p.games < state.policy.provisionalGames
                                      ? "Geçici rating"
                                      : "Kulüp oyuncusu"}
                                </span>
                              </td>
                              <td>
                                <ChevronRight size={16} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!state.players.length && (
                      <Empty
                        icon={<Users size={40} />}
                        title="Henüz oyuncu yok"
                      >
                        Oyuncular sekmesinden isim ve varsa Elo/UKD
                        ekleyebilirsin. İTÜ Elo ilk turnuvadan sonra hesaplanır.
                      </Empty>
                    )}
                  </div>
                  <p className="footnote">
                    İTÜ Elo öncelikli gösterilir. Resmî Elo/UKD ayrı tutulur;
                    kulüp sonuçları resmî ratingi değiştirmez.
                  </p>
                </>
              )}
              {page === "championship" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Dönem sıralaması</h1>
                      <p>Seçilen dönemdeki Grand Prix puanları.</p>
                    </div>
                    <select
                      aria-label="Dönem seç"
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                    >
                      {semesters.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="points-banner">
                    <Trophy size={25} />
                    <div>
                      <strong>İTÜ Grand Prix</strong>
                      <p>İlk 10 oyuncuya puan · Dönemlik sıralama</p>
                    </div>
                    <div className="f1-points">
                      {F1.map((p, i) => (
                        <span key={i}>
                          <small>{i + 1}.</small>
                          <b>{p}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Sıra</th>
                          <th>Oyuncu</th>
                          <th>Dönem puanı</th>
                          <th>Turnuva</th>
                          <th>Birincilik</th>
                          <th>İTÜ Elo / Resmî</th>
                        </tr>
                      </thead>
                      <tbody>
                        {championship(state, semester).map((row) => {
                          const p = state.players.find(
                            (p) => p.id === row.playerId,
                          )!;
                          return (
                            <tr
                              key={p.id}
                              className="clickable"
                              onClick={() => profile(p)}
                            >
                              <td>
                                {row.rank <= 3 && !row.tied ? (
                                  <span className={`medal medal-${row.rank}`}>
                                    {row.rank}
                                  </span>
                                ) : (
                                  `${row.rank}${row.tied ? "=" : ""}`
                                )}
                              </td>
                              <td>
                                <strong>{p.name}</strong>
                              </td>
                              <td>
                                <b className="points-value">{row.points}</b>
                              </td>
                              <td>{row.events}</td>
                              <td>{row.wins || "—"}</td>
                              <td>
                                <Rating
                                  itu={p.itu}
                                  official={p.official}
                                  kind={p.officialType}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!championship(state, semester).length && (
                      <Empty
                        icon={<Trophy size={42} />}
                        title="Bu dönemde henüz puan yok"
                      >
                        Dönem puanlarına dahil bir turnuva tamamlandığında
                        sıralama burada oluşur.
                      </Empty>
                    )}
                  </div>
                  <p className="footnote">
                    Puan eşitliğinde birincilik, ardından ikincilik ve sonraki
                    derecelerin sayısı karşılaştırılır. Chess960 ve puansız
                    etkinlikler yalnız etkinlik ayarı açıksa dahil edilir.
                  </p>
                  <div className="section-heading">
                    <h2>Puan getiren turnuvalar</h2>
                  </div>
                  <div className="card">
                    {finished
                      .filter((t) => t.semester === semester && t.countsPoints)
                      .map((t) => (
                        <TournamentRow
                          key={t.id}
                          t={t}
                          onClick={() => go(`tournament/${t.id}`)}
                        />
                      ))}
                  </div>
                </>
              )}
              {page === "tournament" &&
                (() => {
                  const t = state.tournaments.find((t) => t.id === id);
                  return t ? (
                    <TournamentDesk
                      key={t.id}
                      t={t}
                      state={state}
                      user={user}
                      busy={busy}
                      action={action}
                      openPlayer={openPlayer}
                      notify={notify}
                      onEdit={() =>
                        setModal({
                          title: "Turnuva ayarları",
                          content: (
                            <TournamentForm
                              tournament={t}
                              onSave={async (data) => {
                                if (
                                  await action("tournament.update", {
                                    ...data,
                                    tournamentId: t.id,
                                  })
                                )
                                  setModal(null);
                              }}
                            />
                          ),
                        })
                      }
                    />
                  ) : (
                    <Empty title="Turnuva bulunamadı">
                      Bağlantıyı kontrol edin veya turnuvalar sayfasına dönün.
                    </Empty>
                  );
                })()}
              {page === "settings" &&
                (user ? (
                  <SettingsPage
                    state={state}
                    user={user}
                    action={action}
                    revision={revision}
                    developerAvailable={developerAvailable}
                    sandbox={workspace !== "club"}
                    onEnterSandbox={() => developerAction("enter")}
                  />
                ) : (
                  <Empty
                    icon={<ShieldCheck size={40} />}
                    title="Yönetici alanı"
                    action={
                      <button className="button" onClick={login}>
                        Giriş yap
                      </button>
                    }
                  >
                    Kulüp ayarları için giriş yapmalısın.
                  </Empty>
                ))}
            </>
          )}
          <footer className="main-footer">
            <span>
              <ClubMark size={17} /> İTÜ Satranç Kulübü
            </span>
            <a
              href="https://github.com/atilyucesoy/itu-chess"
              target="_blank"
              rel="noreferrer"
            >
              GitHub · atilyucesoy/itu-chess
            </a>
          </footer>
        </div>
      </main>
      {modal && (
        <dialog
          className="modal"
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal-header">
            <h2>{modal.title}</h2>
            <button
              className="icon-button"
              aria-label="Kapat"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
          </div>
          <div className="modal-body">
            {modal.content}
            {toast?.error && (
              <p role="alert" className="form-error">
                {toast.message}
              </p>
            )}
          </div>
        </dialog>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Bildirimi kapat"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="saving-indicator" role="status">
          Kaydediliyor…
        </div>
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function TournamentRow({ t, onClick }: { t: Tournament; onClick: () => void }) {
  return (
    <button className="tournament-row" onClick={onClick}>
      <div className="date-box">
        <strong>{new Date(t.date + "T12:00:00").getDate()}</strong>
        <small>
          {new Date(t.date + "T12:00:00").toLocaleDateString("tr-TR", {
            month: "short",
          })}
        </small>
      </div>
      <div className="tournament-row-main">
        <strong>{t.name}</strong>
        <span>
          {t.entries.length} oyuncu <i>·</i> {t.roundsPlanned} tur <i>·</i>{" "}
          {t.timeControl}
        </span>
      </div>
      <Badge status={t.status} />
      <ChevronRight size={17} />
    </button>
  );
}
function PlayerForm({
  player,
  onSave,
}: {
  player?: Player;
  onSave: (data: object) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        const d = new FormData(e.currentTarget);
        await onSave({
          name: d.get("name"),
          official: d.get("official") ? Number(d.get("official")) : null,
          officialType: d.get("officialType"),
        });
        setSaving(false);
      }}
    >
      <Field label="Ad soyad">
        <input
          name="name"
          autoFocus
          required
          maxLength={120}
          defaultValue={player?.name}
          placeholder="Örn. Deniz Yılmaz"
        />
      </Field>
      <div className="form-row">
        <Field label="Resmî rating" hint="Ratingi yoksa boş bırak.">
          <input
            name="official"
            type="number"
            min={100}
            max={3500}
            defaultValue={player?.official ?? ""}
            placeholder="—"
          />
        </Field>
        <Field label="Rating türü">
          <select
            name="officialType"
            defaultValue={player?.officialType ?? "ELO"}
          >
            <option value="ELO">FIDE Standart Elo</option>
            <option value="UKD">UKD</option>
          </select>
        </Field>
      </div>
      <div className="info-box">
        <ShieldCheck size={19} />
        <p>
          İTÜ Elo otomatik hesaplanır. İlk turnuvada resmî rating, sonraki
          turnuvalarda İTÜ Elo kullanılır.
        </p>
      </div>
      <button disabled={saving} className="button full" type="submit">
        <Check size={17} />
        {saving ? "Kaydediliyor…" : "Oyuncuyu kaydet"}
      </button>
    </form>
  );
}
function TournamentForm({
  tournament: t,
  onSave,
}: {
  tournament?: Tournament;
  onSave: (data: object) => Promise<void>;
}) {
  const [variant, setVariant] = useState(t?.variant ?? "standard");
  const [points, setPoints] = useState(t?.countsPoints ?? true);
  const [rated, setRated] = useState(t?.countsRating ?? true);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        const d = new FormData(e.currentTarget);
        await onSave({
          name: d.get("name"),
          date: d.get("date"),
          semester: d.get("semester"),
          roundsPlanned: Number(d.get("rounds")),
          timeControl: d.get("time"),
          variant,
          countsPoints: points,
          countsRating: rated,
        });
        setSaving(false);
      }}
    >
      <Field label="Turnuva adı">
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          placeholder="Örn. Cuma Yıldırım Turnuvası"
          defaultValue={t?.name}
        />
      </Field>
      <div className="form-row">
        <Field label="Tarih">
          <input
            name="date"
            type="date"
            required
            defaultValue={t?.date ?? new Date().toLocaleDateString("en-CA")}
          />
        </Field>
        <Field label="Dönem">
          <input
            name="semester"
            required
            maxLength={120}
            defaultValue={t?.semester ?? currentSemester()}
            list="semester-options"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Tur sayısı">
          <input
            name="rounds"
            type="number"
            required
            min={1}
            max={15}
            defaultValue={t?.roundsPlanned ?? 7}
          />
        </Field>
        <Field label="Zaman kontrolü">
          <input
            name="time"
            required
            maxLength={30}
            defaultValue={t?.timeControl ?? "3+2"}
          />
        </Field>
      </div>
      <Field label="Satranç türü">
        <select
          value={variant}
          onChange={(e) => {
            const v = e.target.value as typeof variant;
            setVariant(v);
            setPoints(v === "standard");
            setRated(v === "standard");
          }}
        >
          <option value="standard">Standart satranç</option>
          <option value="chess960">Chess960</option>
        </select>
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={points}
          onChange={(e) => setPoints(e.target.checked)}
        />
        <span>
          <strong>Dönem puanlarına dahil</strong>
          <small>İlk 10 oyuncuya Grand Prix puanı ver.</small>
        </span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={rated}
          onChange={(e) => setRated(e.target.checked)}
        />
        <span>
          <strong>İTÜ Elo’ya dahil</strong>
          <small>Oynanan maçlarla kulüp ratinglerini güncelle.</small>
        </span>
      </label>
      <p className="footnote">
        FIDE Dutch · Score → Buchholz Cut-1 → Buchholz → Sonneborn-Berger →
        kura. Eşlendirme için resmî FIDE turnuva kaydı gerekmez.
      </p>
      <button className="button full" type="submit" disabled={saving}>
        <Plus size={17} />
        {saving ? "Kaydediliyor…" : t ? "Ayarları kaydet" : "Turnuva oluştur"}
      </button>
    </form>
  );
}
function Login({
  onLogin,
}: {
  onLogin: (u: string, p: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        const d = new FormData(e.currentTarget);
        try {
          await onLogin(String(d.get("username")), String(d.get("password")));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="form-intro">
        Bu haftanın turnuvasını yönetmek için kulüp hesabınla giriş yap.
      </p>
      <Field label="Kullanıcı adı">
        <input name="username" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Şifre">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button full" disabled={saving}>
        {saving ? "Giriş yapılıyor…" : "Giriş yap"}
        <ArrowRight size={17} />
      </button>
      <p className="footnote">
        Oyuncuların ve izleyicilerin hesap açması gerekmez.
      </p>
    </form>
  );
}

type Action = (
  name: string,
  payload: object,
  success?: string,
) => Promise<boolean>;
function TournamentDesk({
  t,
  state,
  user,
  busy,
  action,
  openPlayer,
  notify,
  onEdit,
}: {
  t: Tournament;
  state: PublicState;
  user: SessionUser | null;
  busy: boolean;
  action: Action;
  openPlayer: (id: string) => void;
  notify: (s: string, e?: boolean) => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState(
    t.status === "draft" ? "participants" : "pairings",
  );
  const [selectedRound, setSelectedRound] = useState(t.rounds.length);
  useEffect(() => {
    setSelectedRound(t.rounds.length);
  }, [t.rounds.length]);
  const rows = standings(t);
  const round = t.rounds.find((r) => r.number === selectedRound);
  const name = (id: string) =>
    t.entries.find((e) => e.playerId === id)?.name ?? "—";
  const entry = (id: string) => t.entries.find((e) => e.playerId === id)!;
  const allDone =
    t.rounds.length > 0 &&
    t.rounds.every((r) => r.games.every((g) => g.result));
  const finalRound = t.rounds.length === t.roundsPlanned;
  const needsLots = rows.some((r) => r.tied);
  const lastTournament = [...state.tournaments]
    .filter((x) => x.id !== t.id && x.entries.length)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return (
    <>
      <a className="back-link" href="#tournaments">
        <ChevronLeft size={16} />
        Turnuvalara dön
      </a>
      <div className="page-heading tournament-heading">
        <div>
          <div className="eyebrow">
            {t.semester} ·{" "}
            {t.variant === "chess960" ? "CHESS960" : "HAFTALIK TURNUVA"}
          </div>
          <h1>{t.name}</h1>
          <div className="detail-meta">
            <span>
              <CalendarDays size={16} />
              {date(t.date)}
            </span>
            <span>
              <Clock3 size={16} />
              {t.timeControl}
            </span>
            <span>
              <Users size={16} />
              {t.entries.length} oyuncu
            </span>
            <Badge status={t.status} />
          </div>
        </div>
        <div className="button-group">
          <button
            className="button secondary small"
            onClick={() => {
              navigator.clipboard
                .writeText(location.href)
                .then(() => notify("Turnuva bağlantısı kopyalandı"))
                .catch(() =>
                  notify("Adres çubuğundaki bağlantıyı kopyalayabilirsin."),
                );
            }}
          >
            <Copy size={15} />
            Paylaş
          </button>
          {user && t.status === "draft" && (
            <button className="button secondary small" onClick={onEdit}>
              <Settings size={15} />
              Ayarlar
            </button>
          )}
        </div>
      </div>
      {t.status === "finished" && (
        <div className="podium-banner">
          <Trophy size={33} />
          <div>
            <span>TURNUVANIN PODYUMU</span>
            <div className="podium-names">
              {rows.slice(0, 3).map((r, i) => (
                <button onClick={() => openPlayer(r.playerId)} key={r.playerId}>
                  <span className={`medal medal-${i + 1}`}>{i + 1}</span>
                  <strong>{r.name}</strong>
                  <small>{fmt(r.score)} puan</small>
                </button>
              ))}
            </div>
          </div>
          <CheckCircle2 className="finished-check" size={28} />
        </div>
      )}
      <div className="round-progress">
        <div>
          <span className="eyebrow">TURNUVA AKIŞI</span>
          <strong>
            {t.status === "draft"
              ? "Oyuncular bekleniyor"
              : `${t.rounds.length} / ${t.roundsPlanned} tur`}
          </strong>
        </div>
        <div className="round-dots">
          {Array.from({ length: t.roundsPlanned }, (_, i) => (
            <span
              className={
                i < t.rounds.length - (allDone ? 0 : 1)
                  ? "done"
                  : i === t.rounds.length - 1
                    ? "current"
                    : ""
              }
              key={i}
            >
              {i < t.rounds.length - (allDone ? 0 : 1) ? (
                <Check size={15} />
              ) : (
                i + 1
              )}
            </span>
          ))}
        </div>
        {user && t.status !== "finished" && (
          <button
            className="button"
            disabled={
              busy || (t.status === "draft" ? t.entries.length < 2 : !allDone)
            }
            onClick={async () => {
              if (finalRound) {
                if (needsLots) {
                  if (
                    confirm(
                      "Tüm tie-break değerleri eşit olan oyuncular için rastgele son sıralama kurası çekilsin mi?",
                    )
                  )
                    await action(
                      "tournament.lots",
                      { tournamentId: t.id, confirm: true },
                      "Sıralama kurası kaydedildi",
                    );
                } else if (
                  confirm(
                    "Turnuva tamamlansın mı? Dönem puanları ve varsa İTÜ Elo güncellenecek.",
                  )
                )
                  await action(
                    "tournament.finalize",
                    { tournamentId: t.id },
                    "Turnuva tamamlandı!",
                  );
              } else if (
                await action(
                  "round.generate",
                  { tournamentId: t.id },
                  "Eşlendirmeler hazır",
                )
              )
                setTab("pairings");
            }}
          >
            {finalRound ? (
              needsLots ? (
                <Shuffle size={17} />
              ) : (
                <Flag size={17} />
              )
            ) : (
              <Shuffle size={17} />
            )}{" "}
            {finalRound
              ? needsLots
                ? "Eşitlik kurasını çek"
                : "Turnuvayı tamamla"
              : t.status === "draft"
                ? "İlk turu eşlendir"
                : "Sonraki turu eşlendir"}
          </button>
        )}
      </div>
      <div className="toolbar detail-toolbar">
        <div className="tabs">
          {[
            ["pairings", "Eşlendirmeler"],
            ["standings", "Sıralama"],
            ["participants", "Oyuncular"],
            ["info", "Bilgiler"],
          ].map(([key, label]) => (
            <button
              className={tab === key ? "selected" : ""}
              onClick={() => setTab(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "pairings" && !!t.rounds.length && (
          <select
            aria-label="Tur seç"
            value={selectedRound}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
          >
            {t.rounds.map((r) => (
              <option value={r.number} key={r.number}>
                {r.number}. tur
              </option>
            ))}
          </select>
        )}
        {tab === "standings" && (
          <button
            className="button secondary small"
            onClick={() =>
              csv(`itu-siralama-${t.date}.csv`, [
                [
                  "Sıra",
                  "Ad",
                  "İTÜ Elo",
                  "Resmî rating",
                  "Puan",
                  "BH-C1",
                  "BH",
                  "SB",
                ],
                ...rows.map((r) => [
                  r.rank,
                  r.name,
                  r.itu,
                  r.official,
                  r.score,
                  r.bhCut,
                  r.bh,
                  r.sb,
                ]),
              ])
            }
          >
            <Download size={15} />
            CSV
          </button>
        )}
      </div>
      {tab === "pairings" && (
        <div className="card">
          {!round ? (
            <Empty
              icon={<Shuffle size={40} />}
              title="İlk eşlendirme bekleniyor"
            >
              {user
                ? "Oyuncular sekmesinden katılımcıları seç, ardından ilk turu eşlendir."
                : "Turnuva yöneticisi ilk turu eşlendirdiğinde burada görebilirsin."}
            </Empty>
          ) : (
            <>
              <div className="card-section-heading">
                <h2>{round.number}. tur eşlendirmeleri</h2>
                <span className="muted">
                  {round.games.filter((g) => g.board && g.result).length} /{" "}
                  {round.games.filter((g) => g.board).length} sonuç
                </span>
              </div>
              <div className="table-wrap">
                <table className="pairings-table">
                  <thead>
                    <tr>
                      <th>Masa</th>
                      <th>
                        <span className="piece-dot white-piece" />
                        Beyaz
                      </th>
                      <th className="result-col">Sonuç</th>
                      <th>
                        <span className="piece-dot black-piece" />
                        Siyah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.games
                      .filter((g) => g.board > 0)
                      .map((g) => (
                        <tr key={g.board}>
                          <td>
                            <span className="board-number">{g.board}</span>
                          </td>
                          <td>
                            <button
                              className="player-name"
                              onClick={() => openPlayer(g.white)}
                            >
                              {name(g.white)}
                            </button>
                            <Rating
                              itu={entry(g.white).itu}
                              official={entry(g.white).official}
                              kind={entry(g.white).officialType}
                            />
                          </td>
                          <td className="result-col">
                            {user &&
                            t.status === "live" &&
                            round.number === t.rounds.length &&
                            g.black ? (
                              <select
                                aria-label={`Masa ${g.board} sonucu`}
                                className={`result-select ${g.result ? "has-result" : ""}`}
                                value={g.result ?? ""}
                                disabled={busy}
                                onChange={(e) =>
                                  action(
                                    "round.result",
                                    {
                                      tournamentId: t.id,
                                      round: round.number,
                                      board: g.board,
                                      result: e.target.value || null,
                                    },
                                    "Sonuç kaydedildi",
                                  )
                                }
                              >
                                <option value="">· · ·</option>
                                <option value="1-0">1 – 0</option>
                                <option value="1/2">½ – ½</option>
                                <option value="0-1">0 – 1</option>
                                <option value="+-">+ – − (hükmen)</option>
                                <option value="-+">− – + (hükmen)</option>
                                <option value="--">− – − (çift hükmen)</option>
                              </select>
                            ) : (
                              <span
                                className={`result ${g.result ? "has-result" : ""}`}
                              >
                                {resultLabel(g.result)}
                              </span>
                            )}
                          </td>
                          <td>
                            {g.black ? (
                              <>
                                <button
                                  className="player-name"
                                  onClick={() => openPlayer(g.black!)}
                                >
                                  {name(g.black)}
                                </button>
                                <Rating
                                  itu={entry(g.black).itu}
                                  official={entry(g.black).official}
                                  kind={entry(g.black).officialType}
                                />
                              </>
                            ) : (
                              <span className="bye-label">
                                Tur atladı{" "}
                                <small>1 puan · ratinge dahil değil</small>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {round.games.some((g) => g.result === "absent") && (
                <p className="footnote inset">
                  Oynamayanlar:{" "}
                  {round.games
                    .filter((g) => g.result === "absent")
                    .map((g) => name(g.white))
                    .join(", ")}{" "}
                  · 0 puan
                </p>
              )}
            </>
          )}
        </div>
      )}
      {tab === "standings" && (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sıra</th>
                  <th>Oyuncu</th>
                  <th>İTÜ Elo / Resmî</th>
                  <th>Puan</th>
                  <th title="Buchholz Cut-1">BH-C1</th>
                  <th title="Buchholz">BH</th>
                  <th title="Sonneborn-Berger">SB</th>
                  {t.status === "finished" && t.countsRating && (
                    <th>İTÜ Elo değişimi</th>
                  )}
                  {t.status === "finished" && t.countsPoints && <th>GP</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const change = t.ratingChanges.find(
                    (c) => c.playerId === r.playerId,
                  );
                  return (
                    <tr key={r.playerId}>
                      <td>
                        {t.status === "finished" && i < 3 ? (
                          <span className={`medal medal-${i + 1}`}>
                            {i + 1}
                          </span>
                        ) : (
                          `${r.rank}${r.tied ? "=" : ""}`
                        )}
                      </td>
                      <td>
                        <button
                          className="player-name"
                          onClick={() => openPlayer(r.playerId)}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td>
                        <Rating
                          itu={r.itu}
                          official={r.official}
                          kind={r.officialType}
                        />
                      </td>
                      <td>
                        <b className="score-value">{fmt(r.score)}</b>
                      </td>
                      <td>{fmt(r.bhCut)}</td>
                      <td>{fmt(r.bh)}</td>
                      <td>{fmt(r.sb)}</td>
                      {t.status === "finished" && t.countsRating && (
                        <td>
                          {change?.after !== null &&
                          change?.after !== undefined ? (
                            <span
                              className={
                                change.delta! >= 0 ? "positive" : "negative"
                              }
                            >
                              {change.before === null
                                ? `${change.after} (ilk)`
                                : signed(change.delta!)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      {t.status === "finished" && t.countsPoints && (
                        <td>
                          <strong>{F1[i] ?? "—"}</strong>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <Empty title="Henüz oyuncu yok">
                Katılımcılar eklendiğinde sıralama burada görünür.
              </Empty>
            )}
          </div>
          <p className="footnote">
            Sıralama: Puan → BH-C1 → BH → SB → kayıtlı kura. Tam eşitliklerde
            “=” gösterilir. Canlı tie-break değerleri geçicidir. Ratingler
            turnuva başlangıcındaki değerlerdir.
          </p>
        </>
      )}
      {tab === "participants" &&
        (t.status === "draft" && user ? (
          <ParticipantPicker
            key={t.entries.map((e) => e.playerId).join(",")}
            t={t}
            players={state.players}
            last={lastTournament}
            onSave={(ids) =>
              action("tournament.entries", {
                tournamentId: t.id,
                playerIds: ids,
              })
            }
          />
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Başlangıç no.</th>
                  <th>Oyuncu</th>
                  <th>İTÜ Elo / Resmî</th>
                  <th>Eşlendirme ratingi</th>
                  <th>Durum</th>
                  {user && t.status === "live" && <th />}
                </tr>
              </thead>
              <tbody>
                {t.entries.map((e) => (
                  <tr key={e.playerId}>
                    <td>{e.number || "—"}</td>
                    <td>
                      <button
                        className="player-name"
                        onClick={() => openPlayer(e.playerId)}
                      >
                        {e.name}
                      </button>
                    </td>
                    <td>
                      <Rating
                        itu={e.itu}
                        official={e.official}
                        kind={e.officialType}
                      />
                    </td>
                    <td>{e.seed}</td>
                    <td>
                      <span className="pill">
                        {e.withdrawn ? "Çekildi" : "Aktif"}
                      </span>
                    </td>
                    {user && t.status === "live" && (
                      <td>
                        <button
                          className="text-button"
                          disabled={!allDone || busy}
                          onClick={() => {
                            if (
                              confirm(
                                `${e.name} ${e.withdrawn ? "yeniden eşlendirmeye alınsın" : "sonraki turlardan çekilsin"} mı?`,
                              )
                            )
                              action("player.withdraw", {
                                tournamentId: t.id,
                                playerId: e.playerId,
                                withdrawn: !e.withdrawn,
                              });
                          }}
                        >
                          {e.withdrawn ? "Geri al" : "Çekildi olarak işaretle"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {tab === "info" && (
        <div className="settings-grid">
          <div className="card padded">
            <h2>Turnuva kuralları</h2>
            <dl>
              <dt>Eşlendirme</dt>
              <dd>FIDE Dutch 2026 · bbpPairings 6.0.0</dd>
              <dt>Başlangıç sıralaması</dt>
              <dd>İTÜ Elo → resmî Elo/UKD → geçici referans</dd>
              <dt>Tur sayısı</dt>
              <dd>{t.roundsPlanned} (başlangıçta sabit)</dd>
              <dt>Skor</dt>
              <dd>Galibiyet 1 · Beraberlik ½ · Mağlubiyet 0</dd>
              <dt>Dönem puanları</dt>
              <dd>{t.countsPoints ? "Dahil" : "Hariç"}</dd>
              <dt>İTÜ Elo</dt>
              <dd>{t.countsRating ? "Dahil" : "Hariç"}</dd>
              <dt>Renk kurası</dt>
              <dd>
                1 numaranın başlangıç rengi:{" "}
                {t.initialColor === "w" ? "Beyaz" : "Siyah"}
              </dd>
            </dl>
            <p className="footnote">
              Kulüp turnuvasıdır; resmî FIDE ratingi üretmez. Chess960 başlangıç
              konumu fiziksel tahtalarda organizatör tarafından belirlenir.
            </p>
            {user && allDone && (
              <a
                className="button secondary small"
                href={`/api/tournaments/${t.id}/trf`}
              >
                <Download size={15} />
                TRF indir
              </a>
            )}
          </div>
          <div className="card padded">
            <h2>Rating politikası</h2>
            <dl>
              <dt>Referans</dt>
              <dd>{t.policy.reference}</dd>
              <dt>İlk rating</dt>
              <dd>
                {t.policy.initialMethod === "performance"
                  ? "Yumuşatılmış performans"
                  : "Referans + Elo değişimi"}
              </dd>
              <dt>Geçici dönem</dt>
              <dd>
                {t.policy.provisionalGames} maç · K={t.policy.provisionalK}
              </dd>
              <dt>Yerleşik rating</dt>
              <dd>K={t.policy.establishedK}</dd>
            </dl>
            <p className="footnote">
              Politika turnuva başlangıcında kaydedilir. Byeler ve hükmen
              sonuçlar Elo hesaplamasına girmez.
            </p>
          </div>
        </div>
      )}
      {user && t.status !== "draft" && (
        <div className="admin-strip">
          <ShieldCheck size={16} />
          <span>Yönetici araçları</span>
          {t.status === "live" && (
            <button
              className="text-button danger-text"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Son turun TÜM eşlendirmeleri ve sonuçları silinecek. Devam edilsin mi?",
                  )
                )
                  action(
                    "round.undo",
                    { tournamentId: t.id, confirm: true },
                    "Son tur geri alındı",
                  );
              }}
            >
              <RotateCcw size={14} />
              Son turu geri al
            </button>
          )}
          {user.role === "owner" && t.status === "finished" && (
            <button
              className="text-button danger-text"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Turnuva yeniden açılacak. Verilen dönem puanları geri alınacak ve ratingler yeniden hesaplanacak. Devam?",
                  )
                )
                  action("tournament.reopen", {
                    tournamentId: t.id,
                    confirm: true,
                  });
              }}
            >
              <RotateCcw size={14} />
              Yeniden aç
            </button>
          )}
        </div>
      )}
    </>
  );
}
function resultLabel(r: Result | null) {
  return r === "1-0"
    ? "1 – 0"
    : r === "0-1"
      ? "0 – 1"
      : r === "1/2"
        ? "½ – ½"
        : r === "+-"
          ? "+ – −"
          : r === "-+"
            ? "− – +"
            : r === "--"
              ? "− – −"
              : r === "bye"
                ? "1"
                : "· · ·";
}
function ParticipantPicker({
  t,
  players,
  last,
  onSave,
}: {
  t: Tournament;
  players: Player[];
  last?: Tournament;
  onSave: (ids: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(
    new Set(t.entries.map((e) => e.playerId)),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="card">
      <div className="picker-heading">
        <div>
          <h2>Katılımcılar</h2>
          <p className="muted">Kayıtlı oyuncuları seç, kadroyu kaydet.</p>
        </div>
        <span className="pill">{selected.size} seçili</span>
      </div>
      <div className="toolbar inset">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Oyuncu ara…"
        />
        <div className="button-group">
          {last && (
            <button
              className="button secondary small"
              onClick={() =>
                setSelected(new Set(last.entries.map((e) => e.playerId)))
              }
            >
              <Copy size={14} />
              Son turnuvadan al
            </button>
          )}
          <button
            className="text-button"
            onClick={() =>
              setSelected(
                selected.size === players.length
                  ? new Set()
                  : new Set(players.map((p) => p.id)),
              )
            }
          >
            {selected.size === players.length ? "Seçimi temizle" : "Tümünü seç"}
          </button>
        </div>
      </div>
      <div className="player-picker">
        {[...players]
          .sort((a, b) => a.name.localeCompare(b.name, "tr"))
          .filter((p) =>
            p.name
              .toLocaleLowerCase("tr")
              .includes(search.toLocaleLowerCase("tr")),
          )
          .map((p) => (
            <label
              className={`pick-player ${selected.has(p.id) ? "picked" : ""}`}
              key={p.id}
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(p.id) : next.delete(p.id);
                  setSelected(next);
                }}
              />
              <span className="avatar">{p.name[0]}</span>
              <span>
                <strong>{p.name}</strong>
                <Rating
                  itu={p.itu}
                  official={p.official}
                  kind={p.officialType}
                />
              </span>
            </label>
          ))}
      </div>
      {!players.length && (
        <Empty
          title="Kayıtlı oyuncu yok"
          action={
            <a className="button secondary" href="#players">
              Oyunculara git
              <ArrowRight size={16} />
            </a>
          }
        >
          Oyuncular sekmesine eklediğin kişiler her haftanın turnuvasında tekrar
          seçilebilir.
        </Empty>
      )}
      <div className="picker-footer">
        <span className="footnote">
          Eşlendirmeden önce katılımcı listesini kaydet.
        </span>
        <button
          className="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave([...selected]);
            setSaving(false);
          }}
        >
          <Check size={17} />
          {saving ? "Kaydediliyor…" : `${selected.size} oyuncuyu kaydet`}
        </button>
      </div>
    </div>
  );
}

function PlayerProfile({
  player: p,
  state,
  owner,
  canEdit,
  onEdit,
  onOverride,
}: {
  player: Player;
  state: PublicState;
  owner: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onOverride: (v: number, r: string) => Promise<void>;
}) {
  const events = state.tournaments
    .filter(
      (t) =>
        t.status === "finished" && t.entries.some((e) => e.playerId === p.id),
    )
    .sort((a, b) => a.finalizedAt!.localeCompare(b.finalizedAt!));
  const changes = events.flatMap((t) => {
    const c = t.ratingChanges.find((c) => c.playerId === p.id);
    return c?.after === null || !c ? [] : [{ date: t.date, rating: c.after! }];
  });
  const values = changes.map((c) => c.rating);
  const min = Math.min(...values) - 50,
    max = Math.max(...values) + 50;
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <div className="profile-summary">
        <span className="avatar large">{p.name[0]}</span>
        <div>
          <Rating itu={p.itu} official={p.official} kind={p.officialType} />
          <p>
            {p.games} maç · {events.length} turnuva
            {p.itu !== null && p.games < state.policy.provisionalGames
              ? " · Geçici rating"
              : ""}
          </p>
        </div>
        {canEdit && (
          <button className="button secondary small" onClick={onEdit}>
            Düzenle
          </button>
        )}
      </div>
      {changes.length > 1 && (
        <div className="rating-chart">
          <span className="eyebrow">İTÜ ELO GELİŞİMİ</span>
          <svg
            viewBox="0 0 500 130"
            role="img"
            aria-label="Turnuvalara göre İTÜ Elo grafiği"
          >
            <path
              d={`M ${changes.map((c, i) => `${20 + (i * 460) / (changes.length - 1)},${110 - ((c.rating - min) / (max - min)) * 90}`).join(" L ")}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
            />
            {changes.map((c, i) => (
              <circle
                key={i}
                cx={20 + (i * 460) / (changes.length - 1)}
                cy={110 - ((c.rating - min) / (max - min)) * 90}
                r="4"
                fill="var(--accent)"
              >
                <title>
                  {c.date}: {c.rating}
                </title>
              </circle>
            ))}
          </svg>
          <div className="chart-labels">
            <span>{changes[0].date}</span>
            <span>{changes.at(-1)!.date}</span>
          </div>
        </div>
      )}
      <h3>Turnuva geçmişi</h3>
      {!events.length && (
        <p className="muted">Henüz tamamlanmış turnuvası yok.</p>
      )}
      {[...events].reverse().map((t) => {
        const r = standings(t).find((r) => r.playerId === p.id)!;
        const c = t.ratingChanges.find((c) => c.playerId === p.id);
        return (
          <div className="profile-event" key={t.id}>
            <span className={r.rank <= 3 ? `medal medal-${r.rank}` : "place"}>
              {r.rank}
            </span>
            <div>
              <strong>{t.name}</strong>
              <small>
                {date(t.date)} · {fmt(r.score)} puan
              </small>
            </div>
            <b>
              {c?.after ?? "—"}
              {c?.delta !== null && c?.delta !== undefined && (
                <small className={c.delta >= 0 ? "positive" : "negative"}>
                  {signed(c.delta)}
                </small>
              )}
            </b>
          </div>
        );
      })}
      {owner && (
        <details className="advanced">
          <summary>Manuel İTÜ Elo düzeltmesi</summary>
          <p className="footnote">
            Resmî ratingi değiştirmez. Yeni değer gerekçesiyle geçmişe
            kaydedilir.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const d = new FormData(e.currentTarget);
              await onOverride(Number(d.get("value")), String(d.get("reason")));
              setSaving(false);
            }}
          >
            <Field label="Yeni İTÜ Elo">
              <input
                name="value"
                type="number"
                required
                min={100}
                max={3500}
                defaultValue={p.itu ?? 1500}
              />
            </Field>
            <Field label="Gerekçe">
              <input name="reason" required maxLength={120} />
            </Field>
            <button className="button secondary" disabled={saving}>
              Düzeltmeyi kaydet
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
function SettingsPage({
  state,
  user,
  action,
  revision,
  developerAvailable,
  sandbox,
  onEnterSandbox,
}: {
  state: PublicState;
  user: SessionUser;
  action: Action;
  revision: number;
  developerAvailable: boolean;
  sandbox: boolean;
  onEnterSandbox: () => void;
}) {
  const [managers, setManagers] = useState<SessionUser[]>([]);
  const [saving, setSaving] = useState(false);
  const owner = user.role === "owner";
  useEffect(() => {
    if (owner && !sandbox)
      fetch("/api/managers")
        .then((r) => (r.ok ? r.json() : []))
        .then(setManagers)
        .catch(() => {});
  }, [owner, revision, sandbox]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Kulüp ayarları</h1>
          <p>Rating politikası, yönetici hesapları ve verilerin.</p>
        </div>
      </div>
      {owner && developerAvailable && !sandbox && (
        <section className="card padded developer-settings">
          <h2>Developer mode</h2>
          <p className="muted">
            Boş ve ayrı bir deneme alanı açar. Deneme verileri yalnız sunucu
            belleğinde tutulur; sıfırlama, çıkış veya sunucu yeniden
            başlatıldığında silinir. Gerçek oyuncular, turnuvalar ve ratingler
            değişmez.
          </p>
          <button className="button secondary" onClick={onEnterSandbox}>
            Deneme ortamını aç
          </button>
        </section>
      )}
      <div className="settings-grid">
        <section className="card padded">
          <h2>İTÜ Elo politikası</h2>
          <p className="muted">Kulüp içinde karar verdikçe değiştirilebilir.</p>
          <form
            key={JSON.stringify(state.policy)}
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const d = new FormData(e.currentTarget);
              await action("policy.save", {
                reference: Number(d.get("reference")),
                initialMethod: d.get("initialMethod"),
                provisionalGames: Number(d.get("provisionalGames")),
                provisionalK: Number(d.get("provisionalK")),
                establishedK: Number(d.get("establishedK")),
              });
              setSaving(false);
            }}
          >
            <fieldset disabled={!owner || saving}>
              <Field label="Derecesiz oyuncular için başlangıç referansı">
                <input
                  type="number"
                  required
                  name="reference"
                  min={100}
                  max={3500}
                  defaultValue={state.policy.reference}
                />
              </Field>
              <Field label="Derecesiz oyuncunun ilk İTÜ Elo’su">
                <select
                  name="initialMethod"
                  defaultValue={state.policy.initialMethod}
                >
                  <option value="performance">
                    İlk turnuvadaki performanstan
                  </option>
                  <option value="seed">
                    Başlangıç referansı + Elo değişimi
                  </option>
                </select>
              </Field>
              <Field label="Geçici rating süresi (oynanan maç)">
                <input
                  required
                  name="provisionalGames"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={state.policy.provisionalGames}
                />
              </Field>
              <div className="form-row">
                <Field label="Geçici K katsayısı">
                  <input
                    name="provisionalK"
                    required
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={state.policy.provisionalK}
                  />
                </Field>
                <Field label="Yerleşik K katsayısı">
                  <input
                    name="establishedK"
                    required
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={state.policy.establishedK}
                  />
                </Field>
              </div>
              <button className="button" disabled={!owner || saving}>
                <Check size={16} />
                Politikayı kaydet
              </button>
            </fieldset>
          </form>
          <div className="info-box">
            <ShieldCheck size={19} />
            <p>
              Değişiklikler yeni başlayacak turnuvalara uygulanır. Mevcut
              turnuvaların başlangıç sıralaması değişmez.
            </p>
          </div>
          <details className="advanced">
            <summary>Hesaplama nasıl çalışır?</summary>
            <p>
              Resmî ratingi olan oyuncu bu değerden başlar. Daha sonra yalnız
              İTÜ Elo kullanılır. Elo beklentisi: 1 / (1 + 10^((rakip − oyuncu)
              / 400)). Değişim: K × (sonuç − beklenti).
            </p>
            <p>
              Derecesiz ilk rating: rakiplerin ortalama başlangıç ratingi + 400
              × log10((puan + 0,5) / (oynanan maç − puan + 0,5)). Bu kulübe
              özel, yumuşatılmış bir tahmindir; FIDE’nin ilk rating formülü
              değildir. Byeler/hükmen sonuçlar dışlanır. Değerler 100–3500
              aralığında tutulur.
            </p>
            <p>
              Her turnuva için başlangıç ratingleri sabittir. Geçmiş yeniden
              hesaplanırsa Elo hesapları yenilenir, oynanmış eşlendirmeler ve
              başlangıç snapshotları korunur. Geçmiş resmî ratingler giriş
              snapshotlarından alınır.
            </p>
          </details>
        </section>
        <div className="settings-stack">
          <section className="card padded">
            <h2>{sandbox ? "Deneme verileri" : "Veriler ve yedekleme"}</h2>
            <p className="muted">
              {sandbox
                ? "Deneme alanı kalıcı veritabanına yazılmaz. Üstteki sıfırlama düğmesi tüm deneme verilerini temizler."
                : "Her turnuva sonrası yedek almanı öneririz."}
            </p>
            {owner && !sandbox && (
              <a className="button secondary" href="/api/backup">
                <Download size={17} />
                Tam yedek indir
              </a>
            )}
            <p className="footnote">
              {sandbox
                ? "Deneme alanında tam yedek indirme kapalıdır. Kendi indirdiğiniz CSV/TRF dosyaları sıfırlamayla bilgisayarınızdan silinmez."
                : "Tam yedek yönetici şifre hashlerini de içerir; özel tut. Geri yükleme sunucu bakım aracıyla yapılır."}
            </p>
            {owner && (
              <details className="advanced">
                <summary>Geçmiş ratingleri yeniden hesapla</summary>
                <p className="footnote">
                  Kayıtlı yeni politika tüm rating turnuvalarına uygulanır.
                  Manuel düzeltmeler tarih sırasıyla korunur. Puanlar ve eski
                  eşlendirmeler değişmez.
                </p>
                <button
                  className="button danger"
                  disabled={saving}
                  onClick={async () => {
                    if (
                      confirm(
                        "TÜM geçmiş İTÜ ratingleri mevcut politikayla yeniden hesaplansın mı? Önce yedek almanız önerilir.",
                      )
                    ) {
                      setSaving(true);
                      await action(
                        "ratings.recalculate",
                        { confirm: true },
                        "Rating geçmişi yeniden hesaplandı",
                      );
                      setSaving(false);
                    }
                  }}
                >
                  <RotateCcw size={16} />
                  Geçmişi yeniden hesapla
                </button>
              </details>
            )}
          </section>
          {owner && !sandbox && (
            <section className="card padded">
              <h2>Turnuva yöneticileri</h2>
              {managers.map((m) => (
                <div className="manager-row" key={m.id}>
                  <span className="avatar">{m.name[0]}</span>
                  <div>
                    <strong>{m.name}</strong>
                    <small>
                      {m.username} ·{" "}
                      {m.role === "owner" ? "Kulüp yöneticisi" : "Organizatör"}
                    </small>
                  </div>
                  {m.role !== "owner" && (
                    <button
                      className="icon-button danger-text"
                      aria-label={`${m.name} hesabını kaldır`}
                      onClick={() => {
                        if (confirm(`${m.name} hesabı kaldırılsın mı?`))
                          action("manager.remove", { id: m.id });
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      const password = prompt(
                        `${m.name} için yeni şifre (en az 12 karakter):`,
                      );
                      if (password)
                        action("manager.password", { id: m.id, password });
                    }}
                  >
                    Şifre
                  </button>
                </div>
              ))}
              <details className="advanced">
                <summary>Yeni yönetici ekle</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSaving(true);
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    if (
                      await action("manager.create", {
                        name: d.get("name"),
                        username: d.get("username"),
                        password: d.get("password"),
                      })
                    )
                      form.reset();
                    setSaving(false);
                  }}
                >
                  <Field label="Ad">
                    <input name="name" required maxLength={80} />
                  </Field>
                  <Field label="Kullanıcı adı">
                    <input
                      name="username"
                      required
                      pattern="[a-zA-Z0-9_.\-]{3,40}"
                      maxLength={40}
                    />
                  </Field>
                  <Field label="Başlangıç şifresi">
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={200}
                    />
                  </Field>
                  <button className="button secondary" disabled={saving}>
                    <Plus size={16} />
                    Hesap oluştur
                  </button>
                </form>
              </details>
            </section>
          )}
          <section className="card padded">
            <h2>Son işlemler</h2>
            <div className="audit-list">
              {state.audit.slice(0, 12).map((a, i) => (
                <div key={i}>
                  <span className="audit-dot" />
                  <div>
                    <strong>{a.by}</strong>
                    <span>{auditLabel(a.action)}</span>
                  </div>
                  <time>
                    {new Date(a.at).toLocaleString("tr-TR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              {!state.audit.length && <p className="muted">Henüz işlem yok.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
function auditLabel(action: string) {
  return (
    (
      {
        "player.create": "Oyuncu eklendi",
        "player.update": "Oyuncu düzenlendi",
        "tournament.create": "Turnuva oluşturuldu",
        "tournament.entries": "Katılımcılar kaydedildi",
        "round.generate": "Tur eşlendirildi",
        "round.result": "Maç sonucu kaydedildi",
        "tournament.finalize": "Turnuva tamamlandı",
        "tournament.reopen": "Turnuva yeniden açıldı",
        "round.undo": "Son tur geri alındı",
        "tournament.lots": "Eşitlik kurası çekildi",
        "policy.save": "Rating politikası değiştirildi",
        "ratings.recalculate": "Rating geçmişi yeniden hesaplandı",
        "ratings.override": "Manuel rating düzeltildi",
      } as Record<string, string>
    )[action] ?? action
  );
}
