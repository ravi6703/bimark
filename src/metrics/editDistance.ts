/**
 * Levenshtein edit distance (§7). Instrumented on every approve/edit so the team
 * can see how much the operator rewrites AI drafts — the core signal for whether
 * generation quality clears the ≥70% first-pass-approval bar.
 *
 * Iterative two-row DP: O(n·m) time, O(min(n,m)) space.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string on the inner axis to bound memory.
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a.length + 1);

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i]! + 1, // deletion
        curr[i - 1]! + 1, // insertion
        prev[i - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length]!;
}

/** Normalised distance in [0,1] relative to the longer string. */
export function normalizedEditDistance(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : editDistance(a, b) / max;
}
