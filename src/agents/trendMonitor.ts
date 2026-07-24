import { logger } from "../logger.js";

/**
 * Trend/Competitor Monitor (§8). Watches the space and feeds *timeliness* into
 * the Daily Pitch and surfaces openings *to the human*. It NEVER posts — it only
 * produces a signal string. A real build wires this to a listening API
 * (Brand24 / Mention) or native LinkedIn/X search; here it is a pluggable stub
 * that returns whatever the configured source yields (empty by default).
 */
export interface TrendSignalSource {
  fetch(pillarNames: string[]): Promise<string[]>;
}

/** Default no-op source — no external calls, no invented trends. */
export class NullTrendSource implements TrendSignalSource {
  async fetch(): Promise<string[]> {
    return [];
  }
}

let source: TrendSignalSource = new NullTrendSource();
export function setTrendSource(s: TrendSignalSource): void {
  source = s;
}

/** Returns a short timeliness signal for the pitch prompt, or "" if none. */
export async function getTrendSignal(pillarNames: string[]): Promise<string> {
  try {
    const signals = await source.fetch(pillarNames);
    return signals.slice(0, 3).join(" | ");
  } catch (err) {
    logger.warn({ err }, "trend monitor failed; continuing without a signal");
    return "";
  }
}
