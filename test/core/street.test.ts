import { describe, expect, it } from "vitest";
import {
  AGGREGATE_LIMIT,
  QlooError,
  RANK_LIMIT,
  READ_CAP,
  classifyTrend,
  createQloo,
  findVenues,
  haversineM,
  pickTrendTargets,
  readStreet,
  type QlooCache,
} from "../../src/core/index.ts";
import type { Because, StreetRead } from "../../src/shared/contract.ts";
import { CENTER, NOW, VENUE, fakeFetch, streetRoute, type Reply, type Route } from "../fixtures/street.ts";

const KEY = "street-test-key";

function setup(routes: Route[] = [], extra: Record<string, unknown> = {}) {
  const f = fakeFetch([...routes, streetRoute]);
  const q = createQloo({ apiKey: KEY, fetch: f.fetch, now: () => NOW, sleep: async () => {}, ...extra });
  return { q, calls: f.calls };
}

export function allBecause(read: StreetRead): Because[] {
  return [
    ...read.lovedPlaces.flatMap((p) => p.because),
    ...read.rising.flatMap((r) => r.because),
    ...read.gaps.flatMap((g) => g.because),
  ];
}

function expectValidProvenance(read: StreetRead) {
  for (const b of allBecause(read)) {
    expect(b.provenance, b.text).toBeGreaterThanOrEqual(0);
    expect(b.provenance, b.text).toBeLessThan(read.provenance.length);
  }
  for (const h of read.heat) expect(read.provenance[h.provenance]).toBeDefined();
  if (read.demographics) expect(read.provenance[read.demographics.provenance]?.call).toBe("demographics");
}

describe("readStreet", () => {
  it("runs the call plan and builds an honest street read", async () => {
    const { q, calls } = setup();
    const read = await readStreet(q, VENUE);

    expect(calls.length).toBeLessThanOrEqual(READ_CAP);
    expect(read.provenance.length).toBe(calls.length - 1);
    expect(JSON.stringify(read)).not.toContain(KEY);
    for (const c of calls) {
      expect(c.url.href).not.toContain(KEY);
      expect(c.headers["x-api-key"]).toBe(KEY);
    }
    expect(read.venueId).toBe("venue-1");
    expect(read.at).toBe(NOW.toISOString());
    expect(read.center).toEqual(CENTER);
    expectValidProvenance(read);

    const loved = calls.find((c) => c.url.searchParams.get("filter.type") === "urn:entity:place");
    expect(loved?.url.searchParams.get("filter.location")).toBe("POINT(-73.958 40.721)");
    expect(loved?.url.searchParams.get("filter.location.radius")).toBe("1200");
    expect(loved?.url.searchParams.get("signal.location")).toBe("POINT(-73.958 40.721)");
    expect(loved?.url.searchParams.get("feature.explainability")).toBe("true");

    expect(read.streetTags.map((t) => [t.name, t.rank]).slice(0, 3)).toEqual([["Jazz", 1], ["Intimate", 2], ["Documentary", 3]]);
    expect(read.venueTags[0]?.name).toBe("Cozy");

    expect(read.lovedPlaces.map((p) => p.name)).toEqual(["Blue Hour Wine Bar", "Kettle Books", "Sora Ramen", "Daybreak Cafe"]);
    expect(read.lovedPlaces.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    const first = read.lovedPlaces[0]!;
    expect(first.distanceM).toBe(Math.round(haversineM(CENTER, { lat: 40.7225, lng: -73.957 })));
    expect(first.because.map((b) => b.kind)).toEqual(["affinity", "explainability", "tag"]);
    expect(first.because[1]?.text).toContain("the taste of people around Cafe Lumen");
    expect(first.tags).toContain("urn:tag:menu_highlight:qloo:natural_wine");

    const types = new Set(read.rising.map((r) => r.type));
    expect([...types].sort()).toEqual(["artist", "book", "movie", "podcast", "videogame"]);
    const alice = read.rising.find((r) => r.id === "ART-1")!;
    expect(alice).toMatchObject({ rank: 1, trend: "rising" });
    expect(alice.trendNote).toContain("from 30 to 12");
    expect(alice.because.some((b) => b.kind === "trending" && read.provenance[b.provenance]?.endpoint === "/v2/trending")).toBe(true);
    expect(alice.tags).toEqual(["urn:tag:genre:music:jazz"]);
    expect(read.rising.find((r) => r.id === "BOOK-1")?.trend).toBe("falling");
    expect(read.rising.find((r) => r.id === "MOV-2")?.trend).toBe("rising");
    expect(read.rising.find((r) => r.id === "ART-3")?.trend).toBe("unknown");
    expect(read.rising.find((r) => r.id === "GAME-1")).toMatchObject({ type: "videogame", rank: 1 });

    expect(read.shared.map((t) => [t.name, t.rank])).toEqual([["Intimate", 1], ["Cozy", 2]]);
    expect(read.gaps.map((g) => g.tag.name).slice(0, 5)).toEqual(["Jazz", "Natural Wine", "Japanese", "Soul", "Science Fiction"]);
    expect(read.gaps.some((g) => g.tag.id === "urn:tag:ambience:qloo:cozy")).toBe(false);
    const placeGap = read.gaps.find((g) => g.tag.id === "urn:tag:genre:place:wine_bar");
    expect(placeGap?.because[0]?.text).toContain("Blue Hour Wine Bar");

    expect(read.heat.map((h) => h.cells.length)).toEqual([3, 2]);
    expect(read.heat[0]?.cells[0]?.affinityRank).toBe(0.97);
    expect(read.heat[0]?.label).toBe("Taste for Jazz, Intimate and Documentary around Cafe Lumen");
    expect(read.demographics?.summary).toMatch(/30 to 34 and 25 to 29/);
    expect(read.demographics?.summary).toMatch(/not a description of any person/);

    expect(read.limits).toContain(RANK_LIMIT);
    expect(read.limits).toContain(AGGREGATE_LIMIT);
    expect(read.limits).toContain("Qloo returned no TV shows for this location.");
    expect(read.limits).toContain("1 heatmap cell came back with no read and is not drawn.");
    expect(read.limits).toContain("1 place came back without coordinates and is not on the map.");
    expect(read.limits).toContain("1 place further than 1.2 km was left out.");
  });

  it("strips akas from what it keeps", async () => {
    const { q } = setup();
    const read = await readStreet(q, VENUE);
    expect(JSON.stringify(read)).not.toMatch(/akas|short_descriptions/);
  });

  it("falls back to the video_game spelling when videogame is refused", async () => {
    const { q, calls } = setup();
    await readStreet(q, VENUE);
    const types = calls.map((c) => c.url.searchParams.get("filter.type"));
    expect(types).toContain("urn:entity:videogame");
    expect(types).toContain("urn:entity:video_game");
    const trend = calls.find((c) => c.url.pathname === "/v2/trending" && c.url.searchParams.get("signal.interests.entities") === "GAME-1");
    expect(trend?.url.searchParams.get("filter.type")).toBe("urn:entity:video_game");
  });

  it("checks momentum for at most twelve picks over eight weeks", async () => {
    const many: Route = (url) => {
      const t = url.searchParams.get("filter.type");
      if (url.pathname === "/v2/insights" && t?.startsWith("urn:entity:") && t !== "urn:entity:place") {
        return {
          status: 200,
          body: { results: { entities: Array.from({ length: 10 }, (_, i) => ({ entity_id: `${t}-${i}`, name: `Pick ${i}`, subtype: t, query: { affinity: 1 - i / 20 } })) } },
        };
      }
      return undefined;
    };
    const { q, calls } = setup([many]);
    const read = await readStreet(q, VENUE);
    const trending = calls.filter((c) => c.url.pathname === "/v2/trending");
    expect(trending).toHaveLength(12);
    expect(trending[0]?.url.searchParams.get("filter.start_date")).toBe("2026-08-30");
    expect(trending[0]?.url.searchParams.get("filter.end_date")).toBe("2026-10-25");
    expect(calls.length).toBeLessThanOrEqual(READ_CAP);
    expect(read.rising).toHaveLength(60);
    expectValidProvenance(read);
  });

  it("turns a failed optional call into a limits line", async () => {
    const broken: Route = (url) => (url.pathname === "/v2/analysis/compare" ? { status: 500, body: { message: "boom" } } : undefined);
    const { q } = setup([broken]);
    const read = await readStreet(q, VENUE);
    expect(read.limits).toContain("Venue versus street comparison failed (Qloo server error), so that part of the read is missing.");
    expect(read.limits).toContain("Shared tags come from the two tag reads because the comparison call did not run.");
    expect(read.shared.map((t) => t.name)).toEqual(["Intimate", "Documentary", "Cozy"]);
    expect(read.provenance.some((p) => p.endpoint === "/v2/analysis/compare")).toBe(false);
    expectValidProvenance(read);
  });

  it("keeps going when the loved places and heatmaps time out", async () => {
    const slow: Route = (url) => {
      const t = url.searchParams.get("filter.type");
      return t === "urn:entity:place" || t === "urn:heatmap" ? "hang" : undefined;
    };
    const { q } = setup([slow], { timeoutMs: 20 });
    const read = await readStreet(q, VENUE);
    expect(read.lovedPlaces).toEqual([]);
    expect(read.heat).toEqual([]);
    expect(read.limits).toContain("Nearby places failed (timed out), so that part of the read is missing.");
    expect(read.limits.some((l) => l.startsWith("Venue heatmap failed"))).toBe(true);
    expectValidProvenance(read);
  });

  it("reruns the street tags without namespace filters when they come back empty", async () => {
    const empty: Route = (url) =>
      url.searchParams.get("filter.type") === "urn:tag" && url.searchParams.get("filter.tag.types") && url.searchParams.get("signal.location")
        ? { status: 200, body: { success: true, results: { tags: [] } } }
        : undefined;
    const { q, calls } = setup([empty]);
    const read = await readStreet(q, VENUE);
    expect(calls.filter((c) => c.url.searchParams.get("filter.type") === "urn:tag")).toHaveLength(3);
    expect(read.streetTags[0]?.name).toBe("Jazz");
    expect(read.limits).toContain("The street tag read with namespace filters came back empty, so it was rerun without them.");
    const gap = read.gaps[0]!;
    expect(read.provenance[gap.because[0]!.provenance]?.call).toBe("street_tags_open");
  });

  it("throws on an auth error", async () => {
    const denied: Route = (url) => (url.pathname === "/v2/trending" ? { status: 401, body: { error: { message: "Unauthorized" } } } : undefined);
    const { q } = setup([denied]);
    const err = await readStreet(q, VENUE).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.kind).toBe("auth");
  });

  it("throws when the venue does not resolve", async () => {
    const gone: Route = (url) => (url.pathname === "/entities" ? { status: 200, body: { success: true, results: [] } } : undefined);
    const { q, calls } = setup([gone]);
    const err = await readStreet(q, VENUE).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.kind).toBe("not_found");
    expect(calls).toHaveLength(1);

    const down: Route = (url) => (url.pathname === "/entities" ? { status: 502, body: {} } : undefined);
    const d = setup([down]);
    expect((await readStreet(d.q, VENUE).catch((e) => e)).kind).toBe("server");
  });

  it("stops cleanly when the daily budget runs out mid read", async () => {
    let left = 5;
    const { q } = setup([], { budget: async () => left-- > 0 });
    const read = await readStreet(q, VENUE);
    expect(read.limits).toContain("The daily Qloo call budget ran out during this read, so the remaining calls were skipped.");
    expect(read.provenance.length).toBe(5);
    expectValidProvenance(read);
  });

  it("labels cached calls with their fetch time", async () => {
    const store = new Map<string, unknown>();
    const cache: QlooCache = { get: async (k) => store.get(k), put: async (k, v) => void store.set(k, v) };
    const first = setup([], { cache, now: () => new Date("2026-10-25T09:00:00Z") });
    await readStreet(first.q, VENUE);
    const second = setup([], { cache, now: () => new Date("2026-10-25T12:30:00Z") });
    const read = await readStreet(second.q, VENUE);
    expect(second.calls.map((c) => c.url.searchParams.get("filter.type"))).toEqual(["urn:entity:videogame"]);
    expect(read.provenance.every((p) => p.cached)).toBe(true);
    expect(read.limits.some((l) => /^\d+ of \d+ Qloo calls came from the cache, fetched 2026-10-25 09:00 UTC\.$/.test(l))).toBe(true);
  });

  it("refreshes only momentum on the Monday run", async () => {
    const { q } = setup();
    const prev = await readStreet(q, VENUE);
    const flipped: Route = (url) =>
      url.pathname === "/v2/trending" && url.searchParams.get("signal.interests.entities") === "ART-1"
        ? { status: 200, body: { results: { trending: [{ date: "2026-10-24", population_rank: 40 }, { date: "2026-09-01", population_rank: 12 }] } } }
        : undefined;
    const later = new Date("2026-11-02T14:00:00Z");
    const m = setup([flipped], { now: () => later });
    const read = await readStreet(m.q, VENUE, { previous: prev, momentumOnly: true });
    expect(m.calls.every((c) => c.url.pathname === "/v2/trending")).toBe(true);
    expect(m.calls.length).toBe(prev.provenance.filter((p) => p.endpoint === "/v2/trending").length);
    expect(read.at).toBe(later.toISOString());
    expect(read.rising.find((r) => r.id === "ART-1")?.trend).toBe("falling");
    expect(read.lovedPlaces.map((p) => p.name)).toEqual(prev.lovedPlaces.map((p) => p.name));
    expect(read.provenance.length).toBe(prev.provenance.length);
    expect(read.limits.some((l) => l.startsWith("Momentum refreshed 2026-11-02 14:00 UTC"))).toBe(true);
    expectValidProvenance(read);
    for (const p of read.lovedPlaces) {
      const before = prev.lovedPlaces.find((x) => x.id === p.id)!;
      expect(read.provenance[p.because[0]!.provenance]).toEqual(prev.provenance[before.because[0]!.provenance]);
    }
  });
});

describe("pickTrendTargets", () => {
  it("takes picks round robin across types", () => {
    const groups = [
      { type: "artist" as const, urn: "a", items: [{ id: "a1", name: "a1" }, { id: "a2", name: "a2" }, { id: "a3", name: "a3" }] },
      { type: "book" as const, urn: "b", items: [{ id: "b1", name: "b1" }] },
      { type: "movie" as const, urn: "m", items: [] },
    ];
    expect(pickTrendTargets(groups, 3).map((t) => t.id)).toEqual(["a1", "b1", "a2"]);
    expect(pickTrendTargets(groups, 12).map((t) => t.id)).toEqual(["a1", "b1", "a2", "a3"]);
  });
});

describe("classifyTrend", () => {
  const pt = (date: string, extra: Record<string, number | null>) => ({ date, percentile: null, rank: null, rankVelocity: null, foldChange: null, percentDelta: null, ...extra });
  it("reads rank movement from the series", () => {
    const r = classifyTrend({ points: [pt("2026-10-17", { rank: 14 }), pt("2026-09-05", { rank: 19 })], ranked: [] }, "X", "artists");
    expect(r).toEqual({ trend: "rising", note: "Weekly popularity rank went from 19 to 14 between the weeks of 2026-09-05 and 2026-10-17" });
  });
  it("falls back to percentile, then single point deltas, then the ranked list", () => {
    expect(classifyTrend({ points: [pt("b", { percentile: 0.5 }), pt("a", { percentile: 0.5 })], ranked: [] }, "X", "artists").trend).toBe("steady");
    expect(classifyTrend({ points: [pt("a", { percentDelta: -0.4 })], ranked: [] }, "X", "artists").trend).toBe("falling");
    expect(classifyTrend({ points: [pt("a", { foldChange: 1.2 })], ranked: [] }, "X", "artists").trend).toBe("rising");
    expect(classifyTrend({ points: [], ranked: [{ id: "x", name: "X", trendRank: 2 }] }, "X", "films")).toEqual({
      trend: "rising",
      note: "Listed at trend rank 2 among the films rising fastest in Qloo's trending list",
    });
    expect(classifyTrend({ points: [], ranked: [{ id: "y", name: "Y", trendRank: 1 }] }, "X", "films").trend).toBe("unknown");
    expect(classifyTrend({ points: [], ranked: [] }, "X", "films")).toEqual({ trend: "unknown" });
  });
});

describe("findVenues", () => {
  const locality: Route = (url) =>
    url.pathname === "/search" && url.searchParams.get("types") === "urn:entity:locality"
      ? { status: 200, body: { results: [{ entity_id: "LOC-1", name: "Brooklyn", types: ["urn:entity:locality"], properties: { lat: 40.65, lon: -73.95 } }] } }
      : undefined;
  const venues = (body: unknown): Route => (url) =>
    url.pathname === "/search" && url.searchParams.get("types") === "urn:entity:place" ? { status: 200, body } : undefined;

  it("resolves the city, then searches places near it", async () => {
    const hit = { results: [{ entity_id: "V1", name: "Cafe Lumen", types: ["urn:entity:place"], disambiguation: "12 Grand St", properties: { lat: 40.72, lon: -73.95 }, tags: [{ id: "urn:tag:genre:place:cafe", name: "Cafe", type: "urn:tag:genre:place" }] }] };
    const f = fakeFetch([locality, venues(hit)]);
    const q = createQloo({ apiKey: KEY, fetch: f.fetch });
    const out = await findVenues(q, "  Cafe   Lumen ", "Brooklyn");
    expect(out).toEqual([{ id: "V1", name: "Cafe Lumen", type: "place", lat: 40.72, lng: -73.95, address: "12 Grand St", tags: ["urn:tag:genre:place:cafe"] }]);
    const search = f.calls[1]!.url.searchParams;
    expect(search.get("query")).toBe("Cafe Lumen");
    expect(search.get("filter.location")).toBe("40.65,-73.95");
    expect(search.get("filter.radius")).toBe("30");
    expect(search.get("take")).toBe("8");
  });

  it("falls back to an address filter, hydrates missing coordinates and drops what cannot be mapped", async () => {
    let placeCalls = 0;
    const route: Route = (url) => {
      if (url.pathname === "/search" && url.searchParams.get("types") === "urn:entity:locality") return { status: 404, body: { message: "No results" } };
      if (url.pathname === "/search") {
        placeCalls++;
        return { status: 200, body: { results: [{ entity_id: "V1", name: "Balthazar", types: ["urn:entity:place"] }, { entity_id: "V2", name: "Balthazar Bakery", types: ["urn:entity:place"] }] } };
      }
      if (url.pathname === "/entities") {
        expect(url.searchParams.get("entity_ids")).toBe("V1,V2");
        return { status: 200, body: { results: [{ entity_id: "V1", name: "Balthazar", properties: { lat: 40.72, lon: -74, address: "80 Spring St" } }] } };
      }
      return undefined;
    };
    const f = fakeFetch([route]);
    const q = createQloo({ apiKey: KEY, fetch: f.fetch });
    const out = await findVenues(q, "Balthazar", "New York");
    expect(placeCalls).toBe(1);
    expect(f.calls.find((c) => c.url.searchParams.get("filter.address"))?.url.searchParams.get("filter.address")).toBe("New York");
    expect(out.map((c) => [c.id, c.address])).toEqual([["V1", "80 Spring St"]]);
  });

  it("returns nothing when Qloo finds nothing, and throws on auth", async () => {
    const none = fakeFetch([locality, venues({ results: [] })]);
    expect(await findVenues(createQloo({ apiKey: KEY, fetch: none.fetch }), "Nowhere", "Brooklyn")).toEqual([]);
    const denied = fakeFetch([() => ({ status: 401, body: {} }) as Reply]);
    const err = await findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "A", "B").catch((e) => e);
    expect(err.kind).toBe("auth");
    await expect(findVenues(createQloo({ apiKey: KEY, fetch: none.fetch }), "", "B")).rejects.toMatchObject({ kind: "bad_request" });
  });
});
