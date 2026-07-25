/**
 * A pluggable social-listening source (§19 Proxy 1). Returns a score (mentions
 * + engagement) for a query. The default (NullSovSource) returns 0 — no
 * invented numbers; isSovConfigured() lets callers say so honestly instead of
 * treating that 0 as real competitive data.
 */
export interface SovSource {
  readonly name: string;
  score(query: string): Promise<number>;
}
