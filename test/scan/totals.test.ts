import { describe, expect, it } from "vitest";
import { ScanRecordSchema } from "../../src/worker/scan/schema.ts";
import { formatWords, median, methodOf, recordOf, totalsOf, type PairResult, type VenueResult } from "../../scripts/scan/totals.ts";

function pair(over: Partial<PairResult> = {}): PairResult {
  return {
    id: "P",
    name: "The Partner",
    kind: "cinema",
    group: "film",
    walkMin: 4,
    distanceM: 250,
    fit: 80,
    forward: { rank: 1, of: 50 },
    back: { checked: true, rank: 6, of: 50 },
    crowdPass: true,
    backPass: true,
    evenings: { opened: 3, late: 0, unknown: 0, venueListed: true, partnerListed: true },
    format: "book_then_film",
    label: "book then film",
    sentences: [],
    ...over,
  };
}

function venue(city: string, over: Partial<VenueResult> = {}): VenueResult {
  return { city, area: "seed", via: "name", id: "V", name: "A Venue", kind: "bookshop", group: "book", read: true, calls: 10, notes: [], partner: pair(), twoWay: true, openTogether: true, board: [], ...over };
}

describe("scan totals", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([])).toBeNull();
    expect(median([7, 1, 4])).toBe(4);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("counts venues read, two way pairs, open evenings and formats, and leaves unread venues out", () => {
    const rows = [
      venue("New York"),
      venue("New York", { twoWay: false, openTogether: false, partner: pair({ fit: 60, walkMin: 12, format: "book_club_then_drinks", label: "book club then coffee" }) }),
      venue("London", { partner: pair({ fit: 90, walkMin: 2, format: "book_club_then_drinks", label: "book club then dinner" }) }),
      venue("London", { partner: null, twoWay: false, openTogether: false }),
      venue("London", { read: false, partner: null, twoWay: false, openTogether: false }),
    ];
    const t = totalsOf(rows);
    expect(t).toMatchObject({ venues: 4, matched: 3, twoWay: 2, medianFit: 80, medianWalk: 4, openTogether: 2 });
    expect(t.formats).toEqual([
      { format: "book_club_then_drinks", label: "book club then drinks", n: 2 },
      { format: "book_then_film", label: "book then film", n: 1 },
    ]);
    const r = recordOf(rows, { at: "2026-10-30T10:50:00.000Z", calls: 487, method: methodOf({ take: 50, radiusM: 1200, checks: 8, walkMax: 10 }), walkMax: 10, cities: ["New York", "London"] });
    expect(r.cities.map((c) => [c.city, c.totals.venues, c.totals.twoWay])).toEqual([
      ["New York", 2, 1],
      ["London", 2, 1],
    ]);
    expect(ScanRecordSchema.safeParse(r).success).toBe(true);
    expect(JSON.stringify(r)).not.toContain("A Venue");
    expect(JSON.stringify(r)).not.toContain("The Partner");
  });

  it("says the method in one sentence built from the engine's numbers", () => {
    const m = methodOf({ take: 50, radiusM: 1200, checks: 8, walkMax: 10 });
    expect(m.split(". ")).toHaveLength(1);
    expect(m).toContain("50 places its crowd loves within 1.2 km");
    expect(m).toContain("8 best");
    expect(m).toContain("10 minutes or less");
    expect(formatWords("two_stop")).toBe("two stops");
  });
});
