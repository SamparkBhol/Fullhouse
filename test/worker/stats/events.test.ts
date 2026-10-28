import { describe, expect, it } from "vitest";
import { createQloo } from "../../../src/core/index.ts";
import type { Night, StreetRead } from "../../../src/shared/contract.ts";
import { StatsBuffer } from "../../../src/worker/stats/buffer.ts";
import { cleanName, lineFor } from "../../../src/worker/stats/lines.ts";
import { mondayEvent, planEvent, publishEvent, readEvent, rsvpEvent, turnoutEvent } from "../../../src/worker/stats/makers.ts";
import { endpointName, observeQloo } from "../../../src/worker/stats/qloo_observer.ts";
import { fakeFetch, fakePlan, fakeRead, venueDeps } from "../helpers.ts";
import { initVenue } from "../../../src/worker/venue/owner.ts";
import { VenueRecords } from "../../../src/worker/venue/records.ts";
import { MemoryStore } from "../../../src/worker/store.ts";
import { CANDIDATE } from "../helpers.ts";

const NOW = new Date("2026-10-25T10:00:00.000Z");

function night(over: Partial<Night> = {}): Night {
  return { ...fakePlan("N1", "V1", {}, "owner", NOW), status: "done", actions: [], rsvps: 4, ...over };
}

describe("stats events", () => {
  it("counts a read's live calls and cache answers from its provenance", () => {
    const read: StreetRead = {
      ...fakeRead("V1"),
      provenance: [
        { call: "a", endpoint: "/v2/insights", params: {}, at: NOW.toISOString(), resultCount: 3, cached: false, ms: 200 },
        { call: "b", endpoint: "/v2/insights", params: {}, at: NOW.toISOString(), resultCount: 3, cached: true, ms: 0 },
        { call: "c", endpoint: "/search", params: {}, at: NOW.toISOString(), resultCount: 1, cached: false, ms: 90 },
      ],
    };
    const venue = { id: "V1", entity: CANDIDATE, city: "Berlin", tz: "Europe/Berlin", quietSlot: { weekday: 4 as const, start: "19:00", durationMin: 180 }, createdAt: NOW.toISOString() };
    expect(readEvent(venue, read)).toEqual({ kind: "street_read", venueId: "V1", calls: 2, cached: 1 });
  });

  it("counts a first turnout as one night and a correction as the difference from what was counted", () => {
    const first = "2026-10-29T22:10:00.000Z";
    expect(turnoutEvent("V1", undefined, { people: 27, room: 40, at: first })).toEqual({ kind: "turnout", venueId: "V1", nights: 1, people: 27, roomNights: 1, seats: 40, roomPeople: 27 });
    expect(turnoutEvent("V1", { people: 27, room: 40, at: first }, { people: 25, room: 40, at: first })).toEqual({
      kind: "turnout",
      venueId: "V1",
      nights: 0,
      people: -2,
      roomNights: 0,
      seats: 0,
      roomPeople: -2,
      firstAt: first,
    });
    expect(turnoutEvent("V1", undefined, { people: 12, room: null })).toEqual({ kind: "turnout", venueId: "V1", nights: 1, people: 12, roomNights: 0, seats: 0, roomPeople: 0 });
  });

  it("adds a room set after the first count once, with the corrected head count", () => {
    const before = { people: 30, room: null, at: "2026-10-29T22:10:00.000Z" };
    expect(turnoutEvent("V1", before, { people: 10, room: 40 })).toMatchObject({ nights: 0, people: -20, roomNights: 1, seats: 40, roomPeople: 10 });
    const counted = { people: 30, room: 40 };
    expect(turnoutEvent("V1", counted, { people: 10, room: 40 })).toMatchObject({ roomNights: 0, seats: 0, roomPeople: -20 });
  });

  it("writes log lines with no venue names and no owner words", () => {
    const venue = { id: "V1", entity: CANDIDATE, city: "Owner typed city", tz: "Europe/Berlin", quietSlot: { weekday: 4 as const, start: "19:00", durationMin: 180 }, createdAt: NOW.toISOString(), ownerEmail: "owner@example.com" };
    const plan = fakePlan("P1", "V1", {}, "monday", NOW, "Owner edited title");
    const lines = [
      planEvent(venue, plan),
      mondayEvent(venue, plan),
      mondayEvent(venue, null),
      turnoutEvent("V1", undefined, { people: 9, room: null }),
      readEvent(venue, fakeRead("V1")),
      publishEvent(venue, night()),
      rsvpEvent(venue),
    ].map(lineFor);
    expect(lines).toEqual([
      "Planned a listening night for a venue. Copy from template.",
      "A Monday run drafted a listening night.",
      "A Monday run drafted nothing.",
      "A venue logged the turnout of a night.",
      "Read the street around a venue: 0 calls to Qloo, 0 answered from cache.",
      "Published a listening night for Thursday 5 November at a venue that has not confirmed it.",
      "One more RSVP for a night.",
    ]);
    for (const line of lines) {
      expect(line).not.toMatch(/Owner|example\.com|Berlin|Blue Hour/);
      expect(line).not.toMatch(/[\u2013\u2014]| - /);
    }
  });

  it("names a venue only once it has confirmed it, and only on its nights and RSVPs", () => {
    const venue = { id: "V1", entity: CANDIDATE, city: "Berlin", tz: "Europe/Berlin", quietSlot: { weekday: 4 as const, start: "19:00", durationMin: 180 }, createdAt: NOW.toISOString(), verified: true };
    expect(lineFor(publishEvent(venue, night()))).toBe("Blue Hour Records published a listening night for Thursday 5 November.");
    expect(lineFor(rsvpEvent(venue))).toBe("One more RSVP for the night at Blue Hour Records.");
    expect(lineFor(readEvent(venue, fakeRead("V1")))).not.toContain("Blue Hour");
    expect(lineFor({ kind: "venue_created", venueId: "V1" })).toBe("A venue was set up.");
  });

  it("strips control characters and trims long venue names", () => {
    expect(cleanName("  Blue\nHour\u0007  Records ")).toBe("Blue Hour Records");
    expect(cleanName("x".repeat(120))).toHaveLength(80);
    expect(cleanName("")).toBe("A venue");
  });

  it("names insights rows by filter type and keeps unknown paths out", () => {
    expect(endpointName("/v2/insights", { "filter.type": "urn:entity:artist" })).toBe("/v2/insights urn:entity:artist");
    expect(endpointName("/v2/insights", { "filter.type": "urn:tag; drop" })).toBe("/v2/insights");
    expect(endpointName("/search", { query: "x" })).toBe("/search");
    expect(endpointName("/v9/whatever", {})).toBe("other");
  });

  it("records each Qloo answer with its time, and each failure with its kind", async () => {
    const buffer = new StatsBuffer(() => NOW);
    let status = 200;
    const fetch = fakeFetch(() => ({ status, body: status === 200 ? { results: { entities: [] } } : { errors: [{ message: "slow down" }] } }));
    const q = observeQloo(createQloo({ apiKey: "k", fetch, retries: 0, sleep: async () => {} }), buffer);
    await q.get("loved places", "/v2/insights", { "filter.type": "urn:entity:place", "signal.location": "POINT(13.4 52.5)" });
    status = 429;
    await expect(q.get("tags", "/v2/insights", { "filter.type": "urn:tag", "signal.location": "POINT(13.4 52.5)" })).rejects.toThrow();
    const events = buffer.take();
    expect(events.map((e) => e.kind)).toEqual(["qloo_call", "qloo_error"]);
    expect(events[0]).toMatchObject({ endpoint: "/v2/insights urn:entity:place", cached: false, at: NOW.toISOString() });
    expect(events[1]).toMatchObject({ endpoint: "/v2/insights urn:tag", error: "rate" });
    expect(buffer.take()).toEqual([]);
  });

  it("records a new venue through the sink in its deps", async () => {
    const buffer = new StatsBuffer(() => NOW);
    const records = new VenueRecords(new MemoryStore());
    const deps = venueDeps({ stats: buffer });
    await initVenue(records, deps, "V1", { candidate: CANDIDATE, city: "Berlin", tz: "Europe/Berlin", quietSlot: { weekday: 4, start: "19:00", durationMin: 180 } }, CANDIDATE, "https://fullhouse.example");
    expect(buffer.take()).toEqual([{ kind: "venue_created", venueId: "V1", at: NOW.toISOString() }]);
  });

  it("adds the events only known at the end when the buffer is taken", () => {
    const buffer = new StatsBuffer(() => NOW);
    let unused = 4;
    buffer.atEnd(() => (unused ? { kind: "budget_unused", calls: unused, day: "2026-10-25" } : null));
    unused = 6;
    expect(buffer.take()).toEqual([{ kind: "budget_unused", calls: 6, day: "2026-10-25", at: NOW.toISOString() }]);
    expect(buffer.take()).toEqual([]);
  });
});
