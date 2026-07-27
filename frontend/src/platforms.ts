/**
 * Channel presentation, in one place.
 *
 * The backend has its own registry (src/platforms) covering prompt specs,
 * publish capability, image policy and so on. This is deliberately separate
 * rather than shared: that module reads runtime config and can't run in a
 * browser, and what the UI needs — icons, tab labels, explainer copy — isn't
 * something the pipeline should care about. What must not drift is the set of
 * keys, which both sides derive from the same five channels.
 *
 * Before this, the list was restated in NewTopicForm and DraftQueue with
 * different labels and different ordering in each, and the explainer copy
 * lived in a third literal.
 */
export interface PlatformUi {
  key: string;
  /** Short form, for tabs, badges and chips. */
  label: string;
  /** Longer form for the New Topic picker, where there's room to disambiguate. */
  pickerLabel: string;
  icon: string;
  /** One line shown when this platform's tab is selected in the review queue. */
  queueSummary: string;
  /** The "why" behind that line, collapsed — only where it needs more than one. */
  queueDetail?: string;
}

export const PLATFORMS: PlatformUi[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    pickerLabel: "LinkedIn",
    icon: "💼",
    queueSummary: "Long-form thought-leadership posts, published automatically once approved.",
  },
  {
    key: "instagram",
    label: "Instagram",
    pickerLabel: "Instagram",
    icon: "📸",
    queueSummary: "Caption + an auto-generated image, published automatically once approved.",
  },
  {
    key: "x",
    label: "X",
    pickerLabel: "X",
    icon: "✖️",
    queueSummary: "Short, single-idea posts, published automatically once approved.",
  },
  {
    key: "geo",
    label: "GEO",
    pickerLabel: "GEO (AI answer engines)",
    icon: "✨",
    queueSummary: "A direct-answer article for AI answer engines (ChatGPT, Perplexity) — not a social post.",
    queueDetail:
      "GEO = Generative-Engine Optimization. There's no publish API for that, so approving it just " +
      'copies the text out for you to place on your own site/CMS, then "Mark as posted" logs it here.',
  },
  {
    key: "youtube",
    label: "YouTube",
    pickerLabel: "YouTube (script)",
    icon: "🎬",
    queueSummary: "A script/outline for a video, not a finished video.",
    queueDetail:
      "Nothing is filmed or uploaded automatically. Approving locks the script in for you to shoot " +
      'and upload yourself, then "Mark as posted" logs it here.',
  },
];

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));

export function platformUi(key: string): PlatformUi | undefined {
  return BY_KEY.get(key);
}

/**
 * How to write a platform's name in running text. Falls back to the raw key
 * for anything unrecognised, so an unexpected value shows as itself rather
 * than disappearing.
 */
export function platformLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
