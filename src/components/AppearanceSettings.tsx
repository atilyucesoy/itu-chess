export type Palette = "brown" | "green";
export default function AppearanceSettings({
  palette,
  dark,
  onPalette,
  onDark,
}: {
  palette: Palette;
  dark: boolean;
  onPalette: (p: Palette) => void;
  onDark: (dark: boolean) => void;
}) {
  return (
    <section className="card padded appearance-settings">
      <h2>Görünüm</h2>
      <p className="muted">
        Bu tarayıcı için kaydedilir; diğer yöneticilerin görünümünü değiştirmez.
      </p>
      <div className="palette-options" role="group" aria-label="Renk paleti">
        {(
          [
            ["brown", "Kahverengi"],
            ["green", "Yeşil"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={palette === value}
            className={`palette-option ${value}`}
            onClick={() => onPalette(value)}
          >
            <i />
            {label}
          </button>
        ))}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={dark}
          onChange={(e) => onDark(e.target.checked)}
        />
        <span>Koyu görünüm</span>
      </label>
    </section>
  );
}
