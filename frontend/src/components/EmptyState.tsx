/**
 * Okara-inspired dashboard polish — a proper "nothing here yet" state
 * (icon + explanation + optional next action) instead of a bare 0/— that
 * reads as broken. Never used to hide real data — only shown when there's
 * genuinely nothing recorded yet (e.g. a freshly seeded brand).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <p className="empty-state-desc">{description}</p>
      {action && (
        <button className="btn primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
