import type { VercelRequest } from "@vercel/node";
import { brands } from "../../src/db/repositories/index.js";
import type { Brand } from "../../src/types.js";

/**
 * Resolves which brand a request is for (multi-brand support). The dashboard
 * sends the selected brand's slug as `x-brand-id` on every call (see
 * frontend/src/api.ts); falls back to the first brand when it's absent — so
 * every pre-multi-brand caller (older clients, cron jobs, tests) keeps
 * working unchanged.
 */
export async function resolveBrandId(req?: VercelRequest): Promise<number> {
  const slug = typeof req?.headers?.["x-brand-id"] === "string" ? req.headers["x-brand-id"] : undefined;
  if (slug) {
    const bySlug = await brands.getBySlug(slug);
    if (bySlug) return bySlug.id;
  }
  const brand = await brands.first();
  if (!brand) throw new Error("no brand configured — run the seed script");
  return brand.id;
}

/**
 * Never round-trip the raw publish credentials to the browser (multi-brand
 * support follow-up) — the dashboard only needs to know WHETHER a brand has
 * its own connected, not the secret value itself. PATCH /api/brand is
 * write-only for these two fields.
 */
export function redactBrandCredentials(brand: Brand) {
  const { ayrshare_api_key, ayrshare_profile_key, logo_mime_type, logo_data, ...rest } = brand;
  return {
    ...rest,
    has_ayrshare_api_key: !!ayrshare_api_key,
    has_ayrshare_profile_key: !!ayrshare_profile_key,
    // The logo itself is served from GET /api/brand/logo?brandId=, never
    // inlined as bytes here (LinkedIn multi-image follow-up) — same posture
    // as the publish credentials above.
    has_logo: !!logo_data,
  };
}
