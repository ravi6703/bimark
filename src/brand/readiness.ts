import { query } from "../db/pool.js";
import { channels, pillars } from "../db/repositories/index.js";
import type { Brand } from "../types.js";

/**
 * Move 6 — make brand readiness visible instead of implied.
 *
 * Three of the four brands have no source material, which means every draft
 * they produce is ungrounded by construction. The product already detects this
 * per-draft (`low_source`) but only at review time, after the LLM call is paid
 * for and someone's attention has been spent. Worse, the portfolio view lists
 * all four brands identically, implying a parity that doesn't exist.
 *
 * This is the difference between the tool looking broken and the tool telling
 * the truth. Nothing here is a new measurement — it's existing data, read
 * before the work rather than after it.
 */

export type ReadinessLevel = "ready" | "partial" | "empty";

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  /** What the operator sees now, e.g. "3 pillars" or "no owned material". */
  detail: string;
  /** The concrete next action. Null when the check passes. */
  fix: string | null;
  /** A brand missing this can still draft, just worse. */
  blocking: boolean;
}

export interface BrandReadiness {
  brandId: number;
  level: ReadinessLevel;
  /** Checks passed over checks total — the headline number. */
  passed: number;
  total: number;
  checks: ReadinessCheck[];
  /** Set when the brand cannot produce a grounded draft at all. Rendered as a
   * warning at intake, not just at review. */
  blockingReason: string | null;
}

/** Below this, retrieval has too little to work with for grounding to mean
 * much — a handful of chunks will match anything and everything. */
const MIN_ASSET_CHUNKS = 5;

export async function assessBrand(brand: Brand): Promise<BrandReadiness> {
  const [assetCount, pillarList, channelList] = await Promise.all([
    ownedAssetChunkCount(brand.id),
    pillars.listActive(brand.id),
    channels.list(brand.id),
  ]);

  const checks: ReadinessCheck[] = [
    {
      key: "owned_material",
      label: "Owned material to ground drafts in",
      ok: assetCount >= MIN_ASSET_CHUNKS,
      detail:
        assetCount === 0
          ? "Nothing ingested — every draft will be ungrounded"
          : `${assetCount} chunk${assetCount === 1 ? "" : "s"} indexed`,
      fix:
        assetCount >= MIN_ASSET_CHUNKS
          ? null
          : `Ingest real material for this brand (case studies, decks, posts). ` +
            `At least ${MIN_ASSET_CHUNKS} chunks before drafts are worth reviewing.`,
      // This is the one that makes the output worthless rather than merely
      // weaker, so it's the only blocking check.
      blocking: assetCount === 0,
    },
    {
      key: "pillars",
      label: "Content pillars",
      ok: pillarList.length >= 3,
      detail:
        pillarList.length === 0
          ? "None defined"
          : `${pillarList.length} active pillar${pillarList.length === 1 ? "" : "s"}`,
      fix:
        pillarList.length >= 3
          ? null
          : "Define at least 3 pillars, or run onboarding against the brand's site to propose them.",
      blocking: false,
    },
    {
      key: "voice",
      label: "Brand voice guide",
      ok: (brand.voice_guide?.trim().length ?? 0) > 80,
      detail: brand.voice_guide?.trim() ? "Set" : "Using the default Board Infinity voice",
      fix:
        (brand.voice_guide?.trim().length ?? 0) > 80
          ? null
          : "Write this brand's own voice guide — without one it inherits Board Infinity's.",
      blocking: false,
    },
    {
      key: "channels",
      label: "Channels with a weekly target",
      ok: channelList.some((c) => (c.weekly_target ?? 0) > 0),
      detail: channelList.length === 0
        ? "No channels configured"
        : `${channelList.filter((c) => (c.weekly_target ?? 0) > 0).length} of ${channelList.length} have a target`,
      fix: channelList.some((c) => (c.weekly_target ?? 0) > 0)
        ? null
        : "Set a weekly target on at least one channel — the morning pitch uses it to decide what to suggest.",
      blocking: false,
    },
    {
      key: "site_url",
      label: "Website (for SEO audit and link attribution)",
      ok: !!brand.site_url,
      detail: brand.site_url ?? "Not set",
      fix: brand.site_url
        ? null
        : "Set the brand's site URL. Without it, published links can't be UTM-stamped and nothing is attributable.",
      blocking: false,
    },
    {
      key: "logo",
      label: "Logo for generated images",
      ok: !!brand.logo_mime_type,
      detail: brand.logo_mime_type ? "Uploaded" : "None — images generate unwatermarked",
      fix: brand.logo_mime_type ? null : "Upload the brand logo to watermark generated visuals.",
      blocking: false,
    },
  ];

  const passed = checks.filter((c) => c.ok).length;
  const blocking = checks.find((c) => c.blocking && !c.ok);

  return {
    brandId: brand.id,
    level: blocking ? "empty" : passed === checks.length ? "ready" : "partial",
    passed,
    total: checks.length,
    checks,
    blockingReason: blocking
      ? `${brand.name} has no owned material indexed. Drafts will be generated from the ` +
        "model's general knowledge rather than this brand's own work, which is exactly what " +
        "the grounding guard exists to prevent."
      : null,
  };
}

async function ownedAssetChunkCount(brandId: number): Promise<number> {
  const { rows } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM owned_assets WHERE brand_id = $1",
    [brandId],
  );
  return Number(rows[0]?.n ?? 0);
}
