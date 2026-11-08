import { useState, type ReactNode } from "react";
import type { Player } from "../../shared/types";

export default function LateEntryForm({
  players,
  nextRound,
  newPlayerForm,
  onAdd,
}: {
  players: Player[];
  nextRound: number;
  newPlayerForm: ReactNode;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set<string>());
  const [saving, setSaving] = useState(false);
  return (
    <>
      <p className="form-intro">
        Katılımcı {nextRound}. turda başlar. Kaçırdığı turlar 0 puandır ve
        rating hesabına girmez. Yayınlanmış eşlendirmeler değişmez; başlangıç
        numaraları rating sırasına göre yeniden düzenlenebilir.
      </p>
      <div className="tabs">
        <button
          aria-pressed={mode === "existing"}
          className={mode === "existing" ? "selected" : ""}
          onClick={() => setMode("existing")}
        >
          Kayıtlı oyuncular
        </button>
        <button
          aria-pressed={mode === "new"}
          className={mode === "new" ? "selected" : ""}
          onClick={() => setMode("new")}
        >
          Yeni oyuncu
        </button>
      </div>
      {mode === "new" ? (
        newPlayerForm
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            setSaving(true);
            await onAdd([...selected]);
            setSaving(false);
          }}
        >
          <label className="field">
            <span>Oyuncu ara</span>
            <input
              aria-label="Geç katılım oyuncu ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="late-player-list">
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name, "tr"))
              .filter((p) =>
                p.name
                  .toLocaleLowerCase("tr")
                  .includes(search.toLocaleLowerCase("tr")),
              )
              .map((p) => (
                <label className="check-row" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      e.target.checked ? next.add(p.id) : next.delete(p.id);
                      setSelected(next);
                    }}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            {!players.length && (
              <p className="footnote">
                Turnuvada olmayan kayıtlı oyuncu yok. Yeni oyuncu sekmesini
                kullanabilirsiniz.
              </p>
            )}
          </div>
          <button
            className="button full"
            type="submit"
            disabled={!selected.size || saving}
          >
            {saving ? "Ekleniyor…" : "Geç katılımı ekle"}
          </button>
        </form>
      )}
    </>
  );
}
