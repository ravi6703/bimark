import { brands } from "../../src/db/repositories/index.js";

/** The MVP runs single-brand (§15); resolves that default brand or throws. */
export async function resolveBrandId(): Promise<number> {
  const brand = await brands.first();
  if (!brand) throw new Error("no brand configured — run the seed script");
  return brand.id;
}
