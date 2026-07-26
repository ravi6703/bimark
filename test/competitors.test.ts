import { describe, expect, it } from "vitest";
import { groupCompetitorNotes } from "../src/competitors/group.js";
import type { CompetitorNote } from "../src/types.js";

function note(id: number, name: string, daysAgo: number): CompetitorNote {
  return {
    id,
    brand_id: 1,
    competitor_name: name,
    source_url: null,
    summary: `${name} did something`,
    learning: null,
    added_by: "tester",
    created_at: new Date(Date.now() - daysAgo * 86400000),
  };
}

describe("groupCompetitorNotes (competitor dashboard, Okara-inspired follow-up)", () => {
  it("includes every tracked competitor even with zero notes", () => {
    const groups = groupCompetitorNotes(["Superset", "Mettl"], [], null);
    expect(groups.map((g) => g.name).sort()).toEqual(["Mettl", "Superset"]);
    expect(groups.every((g) => g.notes.length === 0)).toBe(true);
  });

  it("includes an untracked competitor that has a note logged against it", () => {
    const groups = groupCompetitorNotes(["Superset"], [note(1, "SomeNewPlayer", 0)], null);
    expect(groups.map((g) => g.name)).toContain("SomeNewPlayer");
  });

  it("sorts each competitor's own notes newest-first", () => {
    const groups = groupCompetitorNotes(
      ["Superset"],
      [note(1, "Superset", 5), note(2, "Superset", 0), note(3, "Superset", 2)],
      null,
    );
    const superset = groups.find((g) => g.name === "Superset")!;
    expect(superset.notes.map((n) => n.id)).toEqual([2, 3, 1]);
  });

  it("attaches the real SOV score for a competitor when configured, null otherwise", () => {
    const groups = groupCompetitorNotes(["Superset", "Mettl"], [], { Superset: 12.5 });
    expect(groups.find((g) => g.name === "Superset")?.sovScore).toBe(12.5);
    expect(groups.find((g) => g.name === "Mettl")?.sovScore).toBeNull();
  });

  it("orders competitors with more notes first, alphabetically as a tiebreak", () => {
    const groups = groupCompetitorNotes(
      ["Zebra", "Alpha"],
      [note(1, "Zebra", 0), note(2, "Zebra", 1)],
      null,
    );
    expect(groups.map((g) => g.name)).toEqual(["Zebra", "Alpha"]);
  });
});
