import type { VercelRequest } from "@vercel/node";
import { brands } from "../../src/db/repositories/index.js";

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
