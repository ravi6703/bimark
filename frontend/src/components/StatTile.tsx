/**
 * Okara-inspired dashboard polish — a consistent icon + color-coded stat
 * tile used across Overview and Metrics, instead of plain numbers on a flat
 * card. `tone` drives the accent color; pass "neutral" when there's no
 * good/bad read on the number (e.g. a raw count).
 */
export type StatTone = "green" | "amber" | "red" | "accent" | "neutral";

export function StatTile({
  icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: string;
  value: string | number;
  label: string;
  tone?: StatTone;
}) {
  return (
    <div className="stat-tile">
      <div className={`stat-tile-icon tone-${tone}`}>{icon}</div>
      <div>
        <div className={`stat-tile-value tone-${tone}`}>{value}</div>
        <div className="stat-tile-label">{label}</div>
      </div>
    </div>
  );
}
