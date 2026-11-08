import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { PublicState } from "../../shared/types";

export default function SemesterSettings({
  state,
  owner,
  action,
}: {
  state: PublicState;
  owner: boolean;
  action: (name: string, payload: object, success?: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <section className="card padded semester-settings">
      <h2>Dönemler</h2>
      <p className="muted">
        Yeni turnuvalar varsayılan olarak aktif döneme bağlanır. Dönem değişimi
        eski turnuvaları, puanları veya İTÜ Elo'yu değiştirmez.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setSaving(true);
          await action(
            "semester.activate",
            { name: d.get("activeSemester") },
            "Aktif dönem güncellendi",
          );
          setSaving(false);
        }}
      >
        <fieldset disabled={!owner || saving}>
          <label className="field">
            <span>Aktif dönem</span>
            <select
              aria-label="Aktif dönem"
              key={state.activeSemester}
              name="activeSemester"
              defaultValue={state.activeSemester}
            >
              {state.semesters.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={!owner || saving}>
            <Check size={16} />
            Aktif dönemi kaydet
          </button>
        </fieldset>
      </form>
      {owner && (
        <details className="advanced">
          <summary>Yeni dönem oluştur</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              setSaving(true);
              if (
                await action(
                  "semester.create",
                  { name: d.get("name"), makeActive: d.has("makeActive") },
                  "Dönem oluşturuldu",
                )
              )
                form.reset();
              setSaving(false);
            }}
          >
            <label className="field">
              <span>Dönem adı</span>
              <input name="name" required maxLength={120} />
            </label>
            <label className="check-row">
              <input name="makeActive" type="checkbox" defaultChecked />
              <span>Yeni dönemi aktif yap</span>
            </label>
            <button className="button secondary" disabled={saving}>
              <Plus size={16} />
              Dönem oluştur
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
