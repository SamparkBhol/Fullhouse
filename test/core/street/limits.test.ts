import { describe, expect, it } from "vitest";
import type { Provenance } from "../../../src/shared/contract.ts";
import { AGGREGATE_LIMIT, RANK_LIMIT, cacheLine, readLimits } from "../../../src/core/street/steps/limits.ts";

function row(at: string, cached: boolean): Provenance {
  return { call: "street_tags", endpoint: "/v2/insights", params: {}, at, resultCount: 1, cached };
}

describe("cacheLine", () => {
  it("says nothing when every call was fresh", () => {
    expect(cacheLine([row("2026-10-25T09:00:00.000Z", false)])).toBeNull();
  });

  it("gives one time when the cached calls share a minute, and the span otherwise", () => {
    expect(cacheLine([row("2026-10-25T09:00:10.000Z", true), row("2026-10-25T09:00:50.000Z", true), row("2026-10-25T12:00:00.000Z", false)])).toBe(
      "2 of 3 Qloo calls came from the cache, fetched 2026-10-25 09:00 UTC.",
    );
    expect(cacheLine([row("2026-10-25T11:30:00.000Z", true), row("2026-10-24T09:05:00.000Z", true)])).toBe(
      "2 of 2 Qloo calls came from the cache, fetched between 2026-10-24 09:05 UTC and 2026-10-25 11:30 UTC.",
    );
  });
});

describe("readLimits", () => {
  it("puts failed calls first, then what the steps found, then the standing lines and the cache line", () => {
    const rows = [row("2026-10-25T09:00:00.000Z", true)];
    expect(readLimits(["Nearby places failed (timed out), so that part of the read is missing."], ["Qloo returned no TV shows for Cafe Lumen."], rows)).toEqual([
      "Nearby places failed (timed out), so that part of the read is missing.",
      "Qloo returned no TV shows for Cafe Lumen.",
      RANK_LIMIT,
      AGGREGATE_LIMIT,
      "1 of 1 Qloo call came from the cache, fetched 2026-10-25 09:00 UTC.",
    ]);
  });
});
