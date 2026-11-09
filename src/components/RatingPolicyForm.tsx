import { useState } from "react";
import { Check } from "lucide-react";
import type { Policy } from "../../shared/types";

export default function RatingPolicyForm({
  policy,
  owner,
  onSave,
}: {
  policy: Policy;
  owner: boolean;
  onSave: (policy: Policy) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState(policy.initialMethod);
  const [capEnabled, setCapEnabled] = useState(
    policy.initialPerformanceCapEnabled ?? false,
  );
  const [capValue, setCapValue] = useState(
    String(policy.initialPerformanceCap ?? 1900),
  );
  const usesCap = capEnabled && method === "performance";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const d = new FormData(e.currentTarget),
          cap = Number(capValue);
        setSaving(true);
        await onSave({
          reference: Number(d.get("reference")),
          initialMethod: method,
          provisionalGames: Number(d.get("provisionalGames")),
          provisionalK: Number(d.get("provisionalK")),
          establishedK: Number(d.get("establishedK")),
          initialPerformanceCapEnabled: capEnabled,
          initialPerformanceCap:
            usesCap || (Number.isInteger(cap) && cap >= 100 && cap <= 3500)
              ? cap
              : (policy.initialPerformanceCap ?? 1900),
        });
        setSaving(false);
      }}
    >
      <fieldset disabled={!owner || saving}>
        <label className="field">
          <span>Derecesiz oyuncular için başlangıç referansı</span>
          <input
            aria-label="Derecesiz oyuncular için başlangıç referansı"
            name="reference"
            type="number"
            required
            min={100}
            max={3500}
            defaultValue={policy.reference}
          />
        </label>
        <label className="field">
          <span>Derecesiz oyuncunun ilk İTÜ Elo’su</span>
          <select
            aria-label="Derecesiz oyuncunun ilk İTÜ Elo’su"
            name="initialMethod"
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as Policy["initialMethod"])
            }
          >
            <option value="performance">İlk turnuvadaki performanstan</option>
            <option value="seed">Başlangıç referansı + Elo değişimi</option>
          </select>
        </label>
        <label className="check-row">
          <input
            aria-label="İlk performans ratingine üst sınır uygula"
            type="checkbox"
            name="initialPerformanceCapEnabled"
            checked={capEnabled}
            disabled={method !== "performance"}
            onChange={(e) => setCapEnabled(e.target.checked)}
          />
          <span>
            <strong>İlk performans ratingine üst sınır uygula</strong>
            <small>
              Yalnız resmî ve İTÜ ratingi olmayan oyuncunun ilk ratingi; sonraki
              gelişimini sınırlamaz.
            </small>
          </span>
        </label>
        <label className="field">
          <span>İlk rating üst sınırı</span>
          <input
            aria-label="İlk rating üst sınırı"
            name="initialPerformanceCap"
            type="number"
            min={100}
            max={3500}
            required
            disabled={!usesCap}
            value={capValue}
            onChange={(e) => setCapValue(e.target.value)}
          />
          <small>
            Örneğin 1900. Resmî ratingden başlayanlara uygulanmaz; sınırın
            altındaki sonuçlar olduğu gibi kalır.
          </small>
        </label>
        <label className="field">
          <span>Geçici rating süresi (oynanan maç)</span>
          <input
            aria-label="Geçici rating süresi (oynanan maç)"
            name="provisionalGames"
            type="number"
            min={0}
            max={200}
            required
            defaultValue={policy.provisionalGames}
          />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Geçici K katsayısı</span>
            <input
              aria-label="Geçici K katsayısı"
              name="provisionalK"
              type="number"
              required
              min={1}
              max={100}
              defaultValue={policy.provisionalK}
            />
          </label>
          <label className="field">
            <span>Yerleşik K katsayısı</span>
            <input
              aria-label="Yerleşik K katsayısı"
              name="establishedK"
              type="number"
              required
              min={1}
              max={100}
              defaultValue={policy.establishedK}
            />
          </label>
        </div>
        <button className="button" type="submit" disabled={!owner || saving}>
          <Check size={16} />
          {saving ? "Kaydediliyor…" : "Politikayı kaydet"}
        </button>
      </fieldset>
    </form>
  );
}
