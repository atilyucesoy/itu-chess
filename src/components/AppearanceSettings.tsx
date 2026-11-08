export default function AppearanceSettings({
  dark,
  onDark,
}: {
  dark: boolean;
  onDark: (dark: boolean) => void;
}) {
  return (
    <section className="card padded appearance-settings">
      <h2>Görünüm</h2>
      <p className="muted">
        Bu tarayıcı için kaydedilir; diğer yöneticilerin görünümünü değiştirmez.
      </p>
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
