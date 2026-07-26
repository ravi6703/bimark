import type { CompetitorNote } from "../types.js";

export interface CompetitorGroup {
  name: string;
  notes: CompetitorNote[];
  sovScore: number | null;
}

/**
 * Groups the manual note log by competitor (competitor dashboard,
 * Okara-inspired follow-up). Every tracked competitor (the SOV set) gets a
 * row even with zero notes yet, so the dashboard shows the full tracked list
 * rather than only whoever happens to have a note — plus any one-off
 * competitor name someone logged a note against outside that set.
 */
export function groupCompetitorNotes(
  trackedCompetitors: string[],
  notes: CompetitorNote[],
  sovScores: Record<string, number> | null,
): CompetitorGroup[] {
  const names = new Set(trackedCompetitors);
  for (const n of notes) names.add(n.competitor_name);

  return Array.from(names)
    .map((name) => ({
      name,
      notes: notes
        .filter((n) => n.competitor_name === name)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      sovScore: sovScores?.[name] ?? null,
    }))
    .sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name));
}
