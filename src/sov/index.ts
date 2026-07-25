import { config } from "../config.js";
import { logger } from "../logger.js";
import { Brand24Source } from "./brand24.js";
import { NullSovSource } from "./null.js";
import type { SovSource } from "./types.js";

export * from "./types.js";
export { NullSovSource } from "./null.js";
export { Brand24Source } from "./brand24.js";

let sovSource: SovSource | null = null;

/** Resolve the configured SOV source; fall back to the honest null source on init failure. */
export function getSovSource(): SovSource {
  if (sovSource) return sovSource;
  try {
    switch (config.sov.provider) {
      case "brand24":
        sovSource = new Brand24Source();
        break;
      default:
        sovSource = new NullSovSource();
    }
  } catch (err) {
    logger.warn({ err, provider: config.sov.provider }, "SOV source init failed — using null source");
    sovSource = new NullSovSource();
  }
  logger.info({ provider: sovSource.name }, "SOV source ready");
  return sovSource;
}

export function setSovSource(s: SovSource): void {
  sovSource = s;
}

/**
 * Audit Phase 1: SOV was silently reporting a permanent 0% as if it were real
 * data whenever no listening source was wired up. Exposed here so the memo
 * text and the dashboard can both say "not configured" instead of a bare 0%.
 */
export function isSovConfigured(): boolean {
  return !(getSovSource() instanceof NullSovSource);
}
