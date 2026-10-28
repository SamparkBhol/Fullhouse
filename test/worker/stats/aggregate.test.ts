import { describe, expect, it } from "vitest";
import type { BudgetToday } from "../../../src/shared/stats.ts";
import { aggregate, type CounterRow } from "../../../src/worker/stats/aggregate.ts";
import { stepOf } from "../../../src/worker/stats/percentile.ts";
import { hourOf } from "../../../src/worker/stats/schema.ts";
import { bucketIndex, bucketStarts, windowFor } from "../../../src/worker/stats/window.ts";

const NOW = new Date("2026-10-27T15:20:00.000Z");
const HOUR = hourOf(NOW.getTime());
const BUDGET: BudgetToday = { day: "2026-10-27", counted: 40, budget: 4000, newVenueShare: 0.8, resetsAt: "2026-10-28T00:00:00.000Z", liveCalls: 31 };

function inputs(rows: CounterRow[], range: "24h" | "7d" | "30d" = "24h") {
  return { window: windowFor(range, NOW), rows, latency: [], allTime: [], events: [], since: null, budget: BUDGET };
}

describe("stats windows", () => {
  it("covers the last 24 hours in hourly buckets ending with the current hour", () => {
    const w = windowFor("24h", NOW);
    const starts = bucketStarts(w);
    expect(starts).toHaveLength(24);
    expect(starts[23]).toBe("2026-10-27T15:00:00.000Z");
    expect(starts[0]).toBe("2026-10-26T16:00:00.000Z");
    expect(bucketIndex(w, HOUR)).toBe(23);
    expect(bucketIndex(w, HOUR - 24)).toBe(-1);
  });

  it("groups 7 days into 28 buckets of six hours on UTC boundaries", () => {
    const w = windowFor("7d", NOW);
    const starts = bucketStarts(w);
    expect(starts).toHaveLength(28);
    expect(starts[27]).toBe("2026-10-27T12:00:00.000Z");
    expect(bucketIndex(w, HOUR)).toBe(27);
    expect(bucketIndex(w, HOUR - 3)).toBe(27);
    expect(bucketIndex(w, HOUR - 4)).toBe(26);
  });

  it("counts 30 days by UTC day", () => {
    const w = windowFor("30d", NOW);
    const starts = bucketStarts(w);
    expect(starts).toHaveLength(30);
    expect(starts[29]).toBe("2026-10-27T00:00:00.000Z");
    expect(starts[0]).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("stats aggregation", () => {
  it("sums counters into totals and lines them up by bucket", () => {
    const body = aggregate(
      inputs([
        { t: HOUR, metric: "venue", label: "", n: 2 },
        { t: HOUR - 5, metric: "venue", label: "", n: 1 },
        { t: HOUR - 30, metric: "venue", label: "", n: 9 },
        { t: HOUR, metric: "plan", label: "model", n: 3 },
        { t: HOUR, metric: "plan", label: "template", n: 1 },
        { t: HOUR, metric: "monday", label: "planned", n: 2 },
        { t: HOUR, metric: "monday", label: "skipped", n: 1 },
      ]),
    );
    expect(body.totals).toMatchObject({ venues: 3, plans: 4, copyModel: 3, copyTemplate: 1, mondayRuns: 3, mondayPlanned: 2 });
    expect(body.series.venues[23]).toBe(2);
    expect(body.series.venues[18]).toBe(1);
    expect(body.series.venues.reduce((a, b) => a + b, 0)).toBe(3);
    expect(body.bucketHours).toBe(1);
  });

  it("builds one endpoint row per Qloo endpoint with calls, cache hits, errors and percentiles", () => {
    const body = aggregate({
      ...inputs([
        { t: HOUR, metric: "qloo_call", label: "/v2/insights urn:tag", n: 4 },
        { t: HOUR, metric: "qloo_cache", label: "/v2/insights urn:tag", n: 6 },
        { t: HOUR, metric: "qloo_error", label: "/search", n: 1 },
        { t: HOUR, metric: "qloo_error_kind", label: "rate", n: 1 },
      ]),
      latency: [
        { endpoint: "/v2/insights urn:tag", step: stepOf(300), n: 1 },
        { endpoint: "/v2/insights urn:tag", step: stepOf(100), n: 1 },
        { endpoint: "/v2/insights urn:tag", step: stepOf(200), n: 1 },
        { endpoint: "/v2/insights urn:tag", step: stepOf(800), n: 1 },
      ],
    });
    expect(body.endpoints).toEqual([
      { endpoint: "/v2/insights urn:tag", calls: 4, cacheHits: 6, errors: 0, p50: 200, p95: 1000, samples: 4 },
      { endpoint: "/search", calls: 0, cacheHits: 0, errors: 1, p50: null, p95: null, samples: 0 },
    ]);
    expect(body.errorKinds).toEqual([{ kind: "rate", n: 1 }]);
    expect(body.totals).toMatchObject({ qlooCalls: 4, qlooCacheHits: 6, qlooErrors: 1 });
  });

  it("shows zeros, not gaps, when nothing happened", () => {
    const body = aggregate(inputs([], "7d"));
    expect(body.series.rsvps).toEqual(Array(28).fill(0));
    expect(body.totals.rsvps).toBe(0);
    expect(body.endpoints).toEqual([]);
    expect(body.allTime).toEqual({ venues: 0, streetReads: 0, nightsPublished: 0, rsvps: 0, turnoutNights: 0, turnoutPeople: null });
  });

  it("ranks MCP tools by use", () => {
    const body = aggregate(
      inputs([
        { t: HOUR, metric: "mcp", label: "read_street", n: 1 },
        { t: HOUR, metric: "mcp", label: "find_venue", n: 3 },
      ]),
    );
    expect(body.mcpTools).toEqual([
      { tool: "find_venue", n: 3 },
      { tool: "read_street", n: 1 },
    ]);
  });

  it("leaves head counts and seats out until five nights are logged in the range", () => {
    const turnout = (nights: number) => [
      { t: HOUR, metric: "turnout_nights", label: "", n: nights },
      { t: HOUR, metric: "turnout_people", label: "", n: 23 * nights },
      { t: HOUR, metric: "room_nights", label: "", n: nights },
      { t: HOUR, metric: "room_seats", label: "", n: 40 * nights },
      { t: HOUR, metric: "room_people", label: "", n: 23 * nights },
    ];
    const few = aggregate({ ...inputs(turnout(4)), allTime: [{ metric: "turnout_nights", n: 4 }, { metric: "turnout_people", n: 92 }] });
    expect(few.totals).toMatchObject({ turnoutNights: 4, turnoutPeople: null, roomNights: null, roomSeats: null, roomPeople: null });
    expect(few.allTime).toMatchObject({ turnoutNights: 4, turnoutPeople: null });
    expect(Object.keys(few.series)).not.toContain("turnoutPeople");
    const enough = aggregate({ ...inputs(turnout(5)), allTime: [{ metric: "turnout_nights", n: 5 }, { metric: "turnout_people", n: 115 }] });
    expect(enough.totals).toMatchObject({ turnoutNights: 5, turnoutPeople: 115, roomNights: 5, roomSeats: 200, roomPeople: 115 });
    expect(enough.allTime.turnoutPeople).toBe(115);
  });
});
