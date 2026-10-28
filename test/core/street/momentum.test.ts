import { describe, expect, it } from "vitest";
import type { Rising, StreetRead } from "../../../src/shared/contract.ts";
import { FIRST_READ_LIMIT, changeNote, noteChanges } from "../../../src/core/street/steps/momentum.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { NOW, VENUE } from "../../fixtures/street.ts";

const ctx = resolveVenue(VENUE, NOW);

function pick(id: string, name: string, rank: number, type: Rising["type"] = "artist"): Rising {
  return { id, name, type, rank, trend: "unknown", because: [{ kind: "affinity", text: `#${rank}`, provenance: 4 }] };
}

const NOW_PICKS = [pick("A", "Alice Coltrane", 1), pick("S", "Sade", 2), pick("K", "Khruangbin", 3), pick("P", "Paterson", 1, "movie")];

function previous(at: string, rising: Rising[], venueId = VENUE.id): StreetRead {
  return { venueId, at, center: ctx.center, radiusM: 1200, heat: [], streetTags: [], venueTags: [], shared: [], gaps: [], lovedPlaces: [], rising, limits: [], provenance: [] };
}

describe("noteChanges", () => {
  it("says changes start next week on a first read", () => {
    expect(noteChanges(NOW_PICKS, undefined, ctx)).toEqual({ rising: NOW_PICKS, limits: [FIRST_READ_LIMIT] });
    const other = previous("2026-10-18T09:00:00.000Z", NOW_PICKS, "another-venue");
    expect(noteChanges(NOW_PICKS, other, ctx).limits).toEqual([FIRST_READ_LIMIT]);
  });

  it("notes each pick's place against last week's read with its date and never claims a trend", () => {
    const lastWeek = previous("2026-10-18T09:00:00.000Z", [pick("A", "Alice Coltrane", 2), pick("S", "Sade", 1), pick("P", "Paterson", 1, "movie")]);
    const { rising, limits } = noteChanges(NOW_PICKS, lastWeek, ctx);
    expect(rising.map((r) => [r.name, r.trend, r.trendNote])).toEqual([
      ["Alice Coltrane", "unknown", "#1 in this read, #2 in the read of 2026-10-18"],
      ["Sade", "unknown", "#2 in this read, #1 in the read of 2026-10-18"],
      ["Khruangbin", "unknown", "New among Qloo's artists for Cafe Lumen since the read of 2026-10-18"],
      ["Paterson", "unknown", "Also #1 in the read of 2026-10-18"],
    ]);
    expect(rising[0]?.because).toEqual(NOW_PICKS[0]?.because);
    expect(limits).toEqual(["Changes in the picks are measured against the read of 2026-10-18."]);
  });

  it("leaves a type alone when last week's read had none of it", () => {
    const lastWeek = previous("2026-10-18T09:00:00.000Z", [pick("A", "Alice Coltrane", 1)]);
    expect(noteChanges(NOW_PICKS, lastWeek, ctx).rising.find((r) => r.type === "movie")?.trendNote).toBeUndefined();
  });

  it("carries last week's notes over when the read is repeated within a few days", () => {
    const earlier = previous("2026-10-24T09:00:00.000Z", [
      { ...pick("A", "Alice Coltrane", 1), trendNote: "#1 in this read, #2 in the read of 2026-10-18" },
      { ...pick("S", "Sade", 1), trendNote: "Also #1 in the read of 2026-10-18" },
    ]);
    const { rising, limits } = noteChanges(NOW_PICKS, earlier, ctx);
    expect(rising[0]?.trendNote).toBe("#1 in this read, #2 in the read of 2026-10-18");
    expect(rising[1]?.trendNote).toBeUndefined();
    expect(limits).toEqual(["Changes in the picks are carried over from the read of 2026-10-24."]);
    expect(noteChanges(NOW_PICKS, previous("2026-10-24T09:00:00.000Z", []), ctx).limits).toEqual([FIRST_READ_LIMIT]);
  });

  it("words each kind of change plainly", () => {
    const now = pick("A", "Alice Coltrane", 3);
    expect(changeNote(now, undefined, "2026-10-18", "Cafe Lumen")).toBe("New among Qloo's artists for Cafe Lumen since the read of 2026-10-18");
    expect(changeNote(now, pick("A", "Alice Coltrane", 3), "2026-10-18", "Cafe Lumen")).toBe("Also #3 in the read of 2026-10-18");
    expect(changeNote(now, pick("A", "Alice Coltrane", 1), "2026-10-18", "Cafe Lumen")).toBe("#3 in this read, #1 in the read of 2026-10-18");
  });
});
