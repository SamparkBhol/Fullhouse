import { describe, expect, it } from "vitest";
import type { ScanRecord } from "../../src/shared/scan.ts";
import { callsLine, cityLine, formatsLine, scanDay, scanFacts, scanHeadline, twoWayLine } from "../../web/src/ui/scan-words.ts";

const t = { venues: 42, matched: 40, twoWay: 23, medianFit: 78.5, medianWalk: 6, openTogether: 18, formats: [{ format: "drinks_then_set" as const, label: "drinks then set", n: 9 }, { format: "book_then_film" as const, label: "book then film", n: 6 }] };
const r: ScanRecord = { at: "2026-10-30T23:30:00.000Z", calls: 487, method: "One sentence.", walkMax: 10, overall: t, cities: [{ city: "New York", totals: t }, { city: "London", totals: t }] };

describe("the scan band's words", () => {
  it("names the venue count, the cities and the scan's own date", () => {
    expect(scanDay(r.at)).toBe("30 October 2026");
    expect(scanHeadline(r)).toBe("Run on 42 real venues in New York and London on 30 October 2026.");
    expect(twoWayLine(t, 10)).toBe("23 of the 42 have a partner within a 10 minute walk, and each crowd puts the other in the top half of its list.");
    expect(cityLine(t)).toBe("23 of 42 two way");
  });

  it("writes each figure from the record and leaves out what it does not hold", () => {
    expect(scanFacts(t).map((f) => f.value)).toEqual(["78.5 of 100", "6 min", "18 of 40"]);
    expect(scanFacts({ ...t, medianFit: null, medianWalk: null, matched: 0 })).toEqual([]);
    expect(formatsLine(t)).toBe("The nights it would plan: drinks then set 9, book then film 6.");
    expect(formatsLine({ ...t, formats: [] })).toBe("");
    expect(callsLine(r)).toContain("487 taste data answers.");
  });
});
