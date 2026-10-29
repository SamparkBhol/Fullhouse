import { describe, expect, it } from "vitest";
import { RING_SIZE } from "../../../src/worker/stats/schema.ts";
import { at, clock, statsCore } from "./sqlite.ts";

describe("stats kept in the Meter's SQLite", () => {
  it("answers with zeros and no start date before anything happened", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    const body = await core.stats("24h");
    expect(body.since).toBeNull();
    expect(body.totals.venues).toBe(0);
    expect(body.events).toEqual([]);
    expect(body.budget).toEqual({
      day: "2026-10-27",
      counted: 30,
      budget: 4000,
      newVenueShare: 0.8,
      resetsAt: "2026-10-28T00:00:00.000Z",
      liveCalls: 0,
    });
  });

  it("counts a venue, its read, its calls and its night, and logs them in order", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    await core.record([
      at("2026-10-27T14:10:00.000Z", { kind: "venue_created", venueId: "V1" }),
      at("2026-10-27T14:11:00.000Z", { kind: "qloo_call", endpoint: "/v2/insights urn:tag", cached: false, ms: 220 }),
      at("2026-10-27T14:11:01.000Z", { kind: "qloo_call", endpoint: "/v2/insights urn:tag", cached: true, ms: 0 }),
      at("2026-10-27T14:11:02.000Z", { kind: "street_read", venueId: "V1", calls: 1, cached: 1 }),
      at("2026-10-27T14:20:00.000Z", { kind: "night_published", venueId: "V1", venue: "Blue Hour Records", verified: true, format: "listening", date: "2026-11-05" }),
      at("2026-10-27T14:30:00.000Z", { kind: "rsvp", venueId: "V1", venue: "Blue Hour Records", verified: true }),
    ]);
    const body = await core.stats("24h");
    expect(body.since).toBe("2026-10-27T14:10:00.000Z");
    expect(body.totals).toMatchObject({ venues: 1, streetReads: 1, nightsPublished: 1, rsvps: 1, qlooCalls: 1, qlooCacheHits: 1 });
    expect(body.allTime).toMatchObject({ venues: 1, rsvps: 1 });
    expect(body.endpoints[0]).toMatchObject({ endpoint: "/v2/insights urn:tag", calls: 1, cacheHits: 1, p50: 250, p95: 250, samples: 1 });
    expect(body.budget.liveCalls).toBe(1);
    expect(body.events.map((e) => e.kind)).toEqual(["rsvp", "night_published", "street_read", "venue_created"]);
    expect(body.events[1]?.line).toBe("Blue Hour Records published a listening night for Thursday 5 November.");
  });

  it("keeps the last 200 log lines and drops the oldest", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core, sql } = statsCore(c.now);
    for (let i = 0; i < RING_SIZE + 25; i++) {
      await core.record([at(new Date(Date.parse("2026-10-27T14:00:00Z") + i * 1000).toISOString(), { kind: "venue_created", venueId: `V${i}` })]);
    }
    const rows = sql.exec("SELECT venue FROM stats_log ORDER BY seq").toArray();
    expect(rows).toHaveLength(RING_SIZE);
    expect(rows[0]?.["venue"]).toBe("V25");
    expect(rows.at(-1)?.["venue"]).toBe(`V${RING_SIZE + 24}`);
    expect((await core.stats("24h")).totals.venues).toBe(RING_SIZE + 25);
  });

  it("counts every live call's time in steps, a few rows however busy the hour", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core, sql } = statsCore(c.now);
    const calls = Array.from({ length: 300 }, (_, i) => at("2026-10-27T14:30:00.000Z", { kind: "qloo_call", endpoint: "/search", cached: false, ms: i < 250 ? 180 : 1900 }));
    await core.record(calls.slice(0, 100));
    await core.record(calls.slice(100));
    expect(sql.exec("SELECT COUNT(*) AS n FROM stats_latency_hour").toArray()[0]?.["n"]).toBe(2);
    const day = await core.stats("24h");
    expect(day.endpoints[0]).toMatchObject({ calls: 300, samples: 300, p50: 200, p95: 2000 });
    expect((await core.stats("30d")).endpoints[0]).toMatchObject({ samples: 300, p50: 200, p95: 2000 });
  });

  it("drops a venue's log lines when its pages come down, and keeps the counts", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    const night = { kind: "night_published", venueId: "V1", venue: "Blue Hour Records", verified: true, format: "listening", date: "2026-11-05" } as const;
    await core.record([
      at("2026-10-27T14:00:00.000Z", { kind: "venue_created", venueId: "V1" }),
      at("2026-10-27T14:01:00.000Z", night),
      at("2026-10-27T14:02:00.000Z", { kind: "rsvp", venueId: "V1", venue: "Blue Hour Records", verified: true }),
      at("2026-10-27T14:03:00.000Z", { kind: "venue_created", venueId: "V2" }),
    ]);
    await core.record([at("2026-10-27T14:10:00.000Z", { kind: "forget_venue", venueId: "V1", lines: "nights" })]);
    const taken = await core.stats("24h");
    expect(taken.events.map((e) => e.kind)).toEqual(["venue_created", "venue_created"]);
    expect(taken.totals).toMatchObject({ venues: 2, nightsPublished: 1, rsvps: 1 });
    await core.record([at("2026-10-27T14:20:00.000Z", { kind: "forget_venue", venueId: "V1", lines: "all" })]);
    const gone = await core.stats("24h");
    expect(gone.events).toHaveLength(1);
    expect(JSON.stringify(gone)).not.toContain("Blue Hour");
  });

  it("answers again from memory until something is recorded or the hour turns", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core, sql } = statsCore(c.now);
    await core.record([at("2026-10-27T14:00:00.000Z", { kind: "venue_created", venueId: "V1" })]);
    const first = await core.stats("7d");
    sql.exec("INSERT INTO stats_hour (h, metric, label, n) VALUES (?, 'venue', '', 5)", Math.floor(Date.parse("2026-10-27T13:00:00Z") / 3_600_000));
    expect(await core.stats("7d")).toBe(first);
    core.changed();
    expect((await core.stats("7d")).totals.venues).toBe(6);
    const held = await core.stats("7d");
    c.advance(3_600_000);
    expect(await core.stats("7d")).not.toBe(held);
  });

  it("logs a burst of the same error once with its count", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    const err = { kind: "qloo_error", endpoint: "/v2/insights urn:entity:artist", error: "budget" } as const;
    await core.record([at("2026-10-27T14:00:00.000Z", err), at("2026-10-27T14:00:01.000Z", err), at("2026-10-27T14:00:02.000Z", err)]);
    const body = await core.stats("24h");
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.line).toBe("A taste data call to /v2/insights urn:entity:artist failed: stopped by today's budget. 3 times.");
    expect(body.errorKinds).toEqual([{ kind: "budget", n: 3 }]);
  });

  it("moves turnout totals by the correction instead of counting a night twice", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    const nights = Array.from({ length: 5 }, (_, i) =>
      at(`2026-10-27T0${i}:00:00.000Z`, { kind: "turnout", venueId: `V${i}`, nights: 1, people: 27, roomNights: 1, seats: 40, roomPeople: 27 }),
    );
    await core.record(nights);
    await core.record([at("2026-10-27T14:05:00.000Z", { kind: "turnout", venueId: "V0", nights: 0, people: 3, roomNights: 0, seats: 0, roomPeople: 3, firstAt: "2026-10-27T00:00:00.000Z" })]);
    const t = (await core.stats("24h")).totals;
    expect(t).toMatchObject({ turnoutNights: 5, turnoutPeople: 138, roomNights: 5, roomSeats: 200, roomPeople: 138 });
  });

  it("counts a correction in the hour the night was first counted", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core, sql } = statsCore(c.now);
    await core.record([at("2026-10-27T14:05:00.000Z", { kind: "turnout", venueId: "V0", nights: 0, people: -20, roomNights: 0, seats: 0, roomPeople: -20, firstAt: "2026-10-20T22:00:00.000Z" })]);
    const hours = sql.exec("SELECT h FROM stats_hour WHERE metric = 'turnout_people'").toArray().map((r) => Number(r["h"]));
    expect(hours).toEqual([Math.floor(Date.parse("2026-10-20T22:00:00.000Z") / 3_600_000)]);
    expect((await core.stats("24h")).events[0]?.at).toBe("2026-10-27T14:05:00.000Z");
  });

  it("keeps day counts after the hourly rows age out", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core, sql } = statsCore(c.now);
    await core.record([at("2026-09-20T10:00:00.000Z", { kind: "venue_created", venueId: "OLD" })]);
    await core.record([at("2026-10-27T14:00:00.000Z", { kind: "venue_created", venueId: "NEW" })]);
    expect(sql.exec("SELECT COUNT(*) AS n FROM stats_hour WHERE metric = 'venue'").toArray()[0]?.["n"]).toBe(1);
    const month = await core.stats("30d");
    expect(month.totals.venues).toBe(1);
    expect(month.allTime.venues).toBe(2);
    expect(sql.exec("SELECT COUNT(*) AS n FROM stats_day WHERE metric = 'venue'").toArray()[0]?.["n"]).toBe(1);
  });

  it("ignores events without a time", async () => {
    const c = clock("2026-10-27T15:00:00Z");
    const { core } = statsCore(c.now);
    await core.record([{ kind: "rsvp", venueId: "V1", venue: "X", verified: false, at: "not a date" }]);
    expect((await core.stats("24h")).totals.rsvps).toBe(0);
  });
});
