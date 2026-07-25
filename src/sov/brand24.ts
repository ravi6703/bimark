import { config } from "../config.js";
import { logger } from "../logger.js";
import type { SovSource } from "./types.js";

/**
 * Brand24 adapter (§19 SOV, audit Phase 3).
 *
 * IMPORTANT — verify before relying on this in production: it was written
 * against Brand24's generally-documented v2 REST shape (bearer-token auth,
 * per-project mentions endpoint) without a live Brand24 account to test
 * against. Confirm the base URL, auth scheme, and response fields below
 * against your account's actual API docs/playground (https://api.brand24.com)
 * before trusting the numbers this produces.
 *
 * Brand24, like every social-listening tool, tracks pre-configured projects
 * with their own keywords rather than accepting an arbitrary free-text search
 * per call. So this does NOT search Brand24 live for whatever topic string
 * wf7_sovMemo.ts happens to construct — it maps each tracked entity (your
 * brand, each named competitor) to a Brand24 project you set up yourself in
 * your Brand24 account, via BRAND24_PROJECT_MAP, and counts that project's
 * recent mentions. Set up one Brand24 project per entity, each tracking that
 * entity's name/keywords, before this can produce a real number.
 */
export class Brand24Source implements SovSource {
  readonly name = "brand24";
  private base = "https://api.brand24.com/v2";
  private projectMap: Record<string, string>;

  constructor(
    private apiKey = config.sov.brand24.apiKey,
    projectMapJson = config.sov.brand24.projectMapJson,
  ) {
    if (!apiKey) throw new Error("Brand24Source requires BRAND24_API_KEY");
    try {
      this.projectMap = JSON.parse(projectMapJson || "{}");
    } catch {
      throw new Error(
        "BRAND24_PROJECT_MAP is not valid JSON — expected e.g. " +
          '{"Board Infinity":"<project-slug>","Hurix":"<project-slug>"}',
      );
    }
    if (Object.keys(this.projectMap).length === 0) {
      throw new Error(
        "BRAND24_PROJECT_MAP is empty — map at least your brand's entity name to a " +
          "Brand24 project id/slug before this source can score anything",
      );
    }
  }

  async score(query: string): Promise<number> {
    const entity = this.matchEntity(query);
    const projectId = entity ? this.projectMap[entity] : undefined;
    if (!projectId) {
      logger.warn(
        { query },
        "Brand24Source: no BRAND24_PROJECT_MAP entry matches this entity — scoring 0 " +
          "rather than guessing which project it means",
      );
      return 0;
    }

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const res = await fetch(
      `${this.base}/projects/${projectId}/mentions?since=${encodeURIComponent(since)}`,
      { headers: { authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) {
      throw new Error(`Brand24 mentions request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { mentions?: { reach?: number }[] };
    const mentions = json.mentions ?? [];
    // Mention count weighted lightly by reach, as a rough engagement proxy —
    // tune this once real account data shows what's actually meaningful.
    return mentions.reduce((sum, m) => sum + 1 + (m.reach ?? 0) / 1000, 0);
  }

  /** Finds which configured entity (if any) this "<entity> <topic>" query refers to. */
  private matchEntity(query: string): string | null {
    const q = query.toLowerCase();
    return Object.keys(this.projectMap).find((entity) => q.includes(entity.toLowerCase())) ?? null;
  }
}
