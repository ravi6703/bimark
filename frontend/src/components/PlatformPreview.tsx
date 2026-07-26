import { useState } from "react";

/** Minimal stroke icons — generic action glyphs, not platform logos. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  thumb: "M7 9v8H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h3Zm0 0 3.3-5.7a1.7 1.7 0 0 1 3 1.5L12.6 8H16a1.6 1.6 0 0 1 1.5 2.1l-1.8 5A1.6 1.6 0 0 1 14.2 16H7",
  comment: "M3 10a6 6 0 0 1 6-6h2a6 6 0 0 1 0 12H8l-4 3v-4.2A6 6 0 0 1 3 10Z",
  repost: "M5 7h8V4l4 4-4 4V9H5V7Zm10 6H7v3l-4-4 4-4v3h8v2Z",
  send: "m3 10 14-7-5 14-3-6-6-1Z",
  heart: "M10 17s-6-4-8-8a4 4 0 0 1 8-3 4 4 0 0 1 8 3c-2 4-8 8-8 8Z",
  bookmark: "M5 3h10v14l-5-4-5 4V3Z",
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** e.g. "Leadup Universe" -> "leadupuniverse" — a plausible handle when the
 * brand's own social handle isn't stored anywhere (multi-brand support). */
function handleize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** LinkedIn truncates a feed post around this many characters before "…see more". */
const LI_TRUNCATE = 210;
/** Instagram truncates a caption to roughly this many characters before "more". */
const IG_TRUNCATE = 125;

function ExpandableText({ text, limit, className }: { text: string; limit: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > limit;
  const shown = expanded || !long ? text : text.slice(0, limit).replace(/\s+\S*$/, "");
  return (
    <p className={className}>
      {shown}
      {long && !expanded && "… "}
      {long && (
        <button type="button" className="pv-seemore" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "see less" : "see more"}
        </button>
      )}
    </p>
  );
}

export function PlatformPreview({
  platform,
  body,
  mediaAssetId,
  mediaAssetIds,
  brandName = "Board Infinity",
}: {
  platform: string;
  body: string;
  mediaAssetId?: number | null;
  /** Full ordered image set for a multi-image LinkedIn post; falls back to
   * just mediaAssetId when absent/empty (older drafts, other platforms). */
  mediaAssetIds?: number[];
  brandName?: string;
}) {
  if (platform === "x") {
    return (
      <div className="platform-preview pv-x">
        <div className="pv-head">
          <div className="pv-avatar pv-avatar-x">{initials(brandName)}</div>
          <div className="pv-names">
            <span className="pv-name">{brandName}</span>
            <span className="pv-handle">@{handleize(brandName)} · 2h</span>
          </div>
        </div>
        <p className="pv-body pv-x-body">{body}</p>
        <div className="pv-actions pv-x-actions">
          <span><Icon d={ICONS.comment} /> 0</span>
          <span><Icon d={ICONS.repost} /> 0</span>
          <span><Icon d={ICONS.heart} /> 0</span>
          <span><Icon d={ICONS.send} /></span>
        </div>
      </div>
    );
  }

  if (platform === "instagram") {
    return (
      <div className="platform-preview pv-instagram">
        <div className="pv-head">
          <div className="pv-avatar pv-avatar-ig">{initials(brandName)}</div>
          <div className="pv-names">
            <span className="pv-name">{handleize(brandName)}</span>
          </div>
          <span className="pv-menu-dots">···</span>
        </div>
        {mediaAssetId != null ? (
          <img className="pv-ig-image" src={`/api/media/${mediaAssetId}`} alt="Generated visual for this post" />
        ) : (
          <div className="pv-ig-image pv-ig-placeholder">No image attached</div>
        )}
        <div className="pv-actions pv-ig-actions">
          <span><Icon d={ICONS.heart} /></span>
          <span><Icon d={ICONS.comment} /></span>
          <span><Icon d={ICONS.send} /></span>
          <span className="pv-spacer" />
          <span><Icon d={ICONS.bookmark} /></span>
        </div>
        <ExpandableText
          className="pv-body pv-ig-caption"
          limit={IG_TRUNCATE}
          text={`${handleize(brandName)} ${body}`}
        />
      </div>
    );
  }

  if (platform === "geo") {
    return (
      <div className="platform-preview pv-geo">
        <div className="pv-geo-tag">✨ GEO — written to be found and cited by AI answer engines</div>
        <p className="pv-body pv-geo-body">{body}</p>
      </div>
    );
  }

  if (platform === "youtube") {
    const titleMatch = body.match(/^TITLE:\s*(.+)$/m);
    return (
      <div className="platform-preview pv-youtube">
        <div className="pv-yt-tag">🎬 YouTube — a script/outline for a human to shoot, not a finished video</div>
        <div className="pv-yt-thumb">
          <span className="pv-yt-play">▶</span>
          {titleMatch && <span className="pv-yt-thumb-title">{titleMatch[1]}</span>}
        </div>
        <pre className="pv-body pv-yt-script">{body}</pre>
      </div>
    );
  }

  // Default: LinkedIn.
  const liImages = mediaAssetIds?.length ? mediaAssetIds : mediaAssetId != null ? [mediaAssetId] : [];
  return (
    <div className="platform-preview pv-linkedin">
      <div className="pv-head">
        <div className="pv-avatar pv-avatar-li">{initials(brandName)}</div>
        <div className="pv-names">
          <span className="pv-name">{brandName}</span>
          <span className="pv-handle">Workforce &amp; skills insight · 2h · 🌐</span>
        </div>
      </div>
      <ExpandableText className="pv-body pv-li-body" limit={LI_TRUNCATE} text={body} />
      {liImages.length > 0 && (
        <div className={`pv-li-gallery ${liImages.length > 1 ? "pv-li-gallery-multi" : ""}`}>
          {liImages.map((id) => (
            <img key={id} className="pv-li-image" src={`/api/media/${id}`} alt="Generated visual for this post" />
          ))}
        </div>
      )}
      <div className="pv-actions pv-li-actions">
        <span><Icon d={ICONS.thumb} /> Like</span>
        <span><Icon d={ICONS.comment} /> Comment</span>
        <span><Icon d={ICONS.repost} /> Repost</span>
        <span><Icon d={ICONS.send} /> Send</span>
      </div>
    </div>
  );
}
