import { describe, expect, it } from "vitest";
import {
  AGGREGATE_LIMIT,
  FIRST_READ_LIMIT,
  QlooError,
  RANK_LIMIT,
  createQloo,
  findVenues,
  readStreet,
  type QlooCache,
} from "../../src/core/index.ts";
import type { Because, StreetRead } from "../../src/shared/contract.ts";
import { CENTER, NOW, VENUE, VENUE_ID, fakeFetch, streetRoute, type Route } from "../fixtures/street.ts";

const KEY = "street-test-key";

function setup(routes: Route[] = [], extra: Record<string, unknown> = {}) {
  const f = fakeFetch([...routes, streetRoute]);
  const q = createQloo({ apiKey: KEY, fetch: f.fetch, now: () => NOW, sleep: async () => {}, ...extra });
  return { q, calls: f.calls };
}

function allBecause(read: StreetRead): Because[] {
  return [...read.lovedPlaces.flatMap((p) => p.because), ...read.rising.flatMap((r) => r.because), ...read.gaps.flatMap((g) => g.because)];
}

function expectValidProvenance(read: StreetRead) {
  for (const b of allBecause(read)) {
    expect(b.provenance, b.text).toBeGreaterThanOrEqual(0);
    expect(b.provenance, b.text).toBeLessThan(read.provenance.length);
  }
  for (const h of read.heat) expect(read.provenance[h.provenance]?.call).toMatch(/^heat_/);
  if (read.demographics) expect(read.provenance[read.demographics.provenance]?.call).toBe("demographics");
}

const param = (calls: Array<{ url: URL }>, call: (p: URLSearchParams) => boolean) => calls.find((c) => call(c.url.searchParams))?.url.searchParams;

describe("readStreet", () => {
  it("follows the probed call plan: twelve calls, the venue as signal, no trending", async () => {
    const { q, calls } = setup();
    const read = await readStreet(q, VENUE);

    expect(calls).toHaveLength(12);
    expect(read.provenance.map((p) => p.call)).toEqual([
      "street_tags",
      "venue_tags",
      "loved_places",
      "heat_venue",
      "insights_artist",
      "insights_book",
      "insights_movie",
      "insights_tv_show",
      "insights_podcast",
      "demographics",
      "compare",
      "heat_street",
    ]);
    for (const c of calls) {
      expect(c.headers["x-api-key"]).toBe(KEY);
      expect(c.url.href).not.toContain(KEY);
      expect(c.url.searchParams.has("bias.trends")).toBe(false);
      expect(c.url.pathname).not.toMatch(/trending|entities$/);
    }
    expect(JSON.stringify(read)).not.toContain(KEY);

    const street = param(calls, (p) => p.get("filter.type") === "urn:tag" && p.has("signal.location"));
    expect(street?.get("filter.tag.types")?.split(",")).toHaveLength(5);
    expect(street?.get("take")).toBe("25");
    const loved = param(calls, (p) => p.get("filter.type") === "urn:entity:place");
    expect(Object.fromEntries(loved ?? [])).toEqual({
      "feature.explainability": "true",
      "filter.exclude.entities": VENUE_ID,
      "filter.location": "POINT(-73.958 40.721)",
      "filter.location.radius": "1200",
      "filter.type": "urn:entity:place",
      "signal.interests.entities": VENUE_ID,
      take: "30",
    });
    const artist = param(calls, (p) => p.get("filter.type") === "urn:entity:artist");
    expect(artist?.get("signal.interests.entities")).toBe(VENUE_ID);
    expect(artist?.get("signal.location")).toBe("POINT(-73.958 40.721)");
    const demo = param(calls, (p) => p.get("filter.type") === "urn:demographics");
    expect(demo?.has("signal.location")).toBe(false);
    expect(read).toMatchObject({ venueId: "venue-1", at: NOW.toISOString(), center: CENTER, radiusM: 1200 });
    expectValidProvenance(read);
  });

  it("builds every section from the answers", async () => {
    const read = await readStreet(setup().q, VENUE);

    expect(read.streetTags.slice(0, 3).map((t) => [t.name, t.rank])).toEqual([["Jazz", 1], ["Intimate", 2], ["Documentary", 3]]);
    expect(read.streetTags.some((t) => t.name === "Soul")).toBe(true);
    expect(read.venueTags[0]?.name).toBe("Cozy");
    expect(read.shared.map((t) => t.name)).toEqual(["Coffee", "Documentary", "Cozy"]);

    expect(read.lovedPlaces.map((p) => [p.name, p.distanceM])).toEqual([
      ["Blue Hour Wine Bar", 151],
      ["Kettle Books", 213],
      ["Sora Ramen", 525],
      ["Daybreak Cafe", 93],
      ["Grand Street Cinema", 743],
    ]);
    const blueHour = read.lovedPlaces[0]!;
    expect(blueHour.because.map((b) => b.kind)).toEqual(["affinity", "explainability", "trending", "tag"]);
    expect(blueHour.because[0]?.text).toBe("Ranked #1 of 5 places within 1.2 km for people who like Cafe Lumen");
    expect(blueHour.because[3]?.text).toBe("Tagged Intimate, which ranks #2 in the street's taste profile");

    expect([...new Set(read.rising.map((r) => r.type))]).toEqual(["artist", "book", "movie", "podcast"]);
    const alice = read.rising.find((r) => r.name === "Alice Coltrane")!;
    expect(alice).toMatchObject({ rank: 1, trend: "unknown", tags: ["urn:tag:genre:music:jazz", "urn:tag:influenced_by:qloo:john_coltrane"] });
    expect(alice.because.map((b) => b.kind)).toEqual(["affinity", "explainability", "tag"]);
    const podcast = read.rising.find((r) => r.type === "podcast")!;
    expect(podcast.because.map((b) => b.kind)).toEqual(["affinity"]);
    expect(podcast.because[0]?.text).toContain("for the area around Cafe Lumen");

    expect(read.gaps.map((g) => g.tag.name)).toEqual(["Wine", "Live music", "Date Night", "Bar", "Jazz", "Intimate", "Natural Wine", "Ramen"]);
    expect(read.gaps[1]?.because[0]?.text).toBe("Tagged Live music: Blue Hour Wine Bar");

    expect(read.heat.map((h) => [h.label, h.cells.length])).toEqual([
      ["Where Cafe Lumen's audience over indexes", 5],
      ["Taste for Jazz, Intimate and Documentary around Cafe Lumen", 3],
    ]);
    expect(read.demographics?.summary).toMatch(/^People who like Cafe Lumen on Qloo over index on the 25 to 29 and 30 to 34 age groups, leaning female\./);

    expect(read.limits).toEqual(
      expect.arrayContaining([
        "Qloo scores the street's taste tags almost level, so read their order loosely.",
        "Qloo returned no TV shows for Cafe Lumen.",
        "Qloo did not use Cafe Lumen itself for the podcasts, so those picks reflect the area only.",
        FIRST_READ_LIMIT,
        RANK_LIMIT,
        AGGREGATE_LIMIT,
      ]),
    );
  });

  it("keeps none of Qloo's long text fields", async () => {
    const read = await readStreet(setup().q, VENUE);
    expect(JSON.stringify(read)).not.toMatch(/akas|short_descriptions|ambience_description/);
  });

  it("turns a failed optional call into a limits line and keeps the rest", async () => {
    const broken: Route = (url) => (url.pathname === "/v2/analysis/compare" ? { status: 500, body: { errors: [{ message: "boom" }] } } : undefined);
    const read = await readStreet(setup([broken]).q, VENUE);
    expect(read.limits[0]).toBe("Venue versus nearby places comparison failed (Qloo server error), so that part of the read is missing.");
    expect(read.provenance.some((p) => p.call === "compare")).toBe(false);
    expect(read.shared.map((t) => t.name)).toEqual(["Documentary", "Cozy"]);
    expect(read.gaps.map((g) => g.tag.name)).toEqual(["Jazz", "Intimate", "Natural Wine", "Ramen", "Soul", "Wine Bar", "Science Fiction"]);
    expectValidProvenance(read);
  });

  it("keeps going when the places and heatmaps time out", async () => {
    const slow: Route = (url) => {
      const t = url.searchParams.get("filter.type");
      return t === "urn:entity:place" || t === "urn:heatmap" ? "hang" : undefined;
    };
    const read = await readStreet(setup([slow], { timeoutMs: 20 }).q, VENUE);
    expect(read.lovedPlaces).toEqual([]);
    expect(read.heat).toEqual([]);
    expect(read.limits).toContain("Nearby places failed (timed out), so that part of the read is missing.");
    expect(read.limits).toContain("Cafe Lumen was not compared with nearby places because none came back.");
    expect(read.limits.some((l) => l.startsWith("Venue heatmap failed"))).toBe(true);
    expectValidProvenance(read);
  });

  it("throws on an auth error", async () => {
    const denied: Route = (url) => (url.pathname === "/v2/analysis/compare" ? { status: 401, body: { error: { message: "Unauthorized", reason: "API keys mismatch" } } } : undefined);
    const err = await readStreet(setup([denied]).q, VENUE).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.kind).toBe("auth");
  });

  it("throws instead of returning an empty read when nothing answers", async () => {
    const down: Route = () => ({ status: 502, body: {} });
    const err = await readStreet(setup([down]).q, VENUE).catch((e) => e);
    expect(err.kind).toBe("server");
    const spent = await readStreet(setup([], { budget: async () => false }).q, VENUE).catch((e) => e);
    expect(spent.kind).toBe("budget");
  });

  it("stops cleanly when the daily budget runs out mid read", async () => {
    let left = 5;
    const read = await readStreet(setup([], { budget: async () => left-- > 0 }).q, VENUE);
    expect(read.limits[0]).toBe("The daily Qloo call budget ran out during this read, so the remaining calls were skipped.");
    expect(read.provenance).toHaveLength(5);
    expectValidProvenance(read);
  });

  it("labels cached calls with their fetch time", async () => {
    const store = new Map<string, unknown>();
    const cache: QlooCache = { get: async (k) => store.get(k), put: async (k, v) => void store.set(k, v) };
    await readStreet(setup([], { cache, now: () => new Date("2026-10-25T09:00:00Z") }).q, VENUE);
    const second = setup([], { cache, now: () => new Date("2026-10-25T12:30:00Z") });
    const read = await readStreet(second.q, VENUE);
    expect(second.calls).toHaveLength(0);
    expect(read.provenance.every((p) => p.cached)).toBe(true);
    expect(read.limits.at(-1)).toBe("12 of 12 Qloo calls came from the cache, fetched 2026-10-25 09:00 UTC.");
  });

  it("compares the picks with last week's read", async () => {
    const before = await readStreet(setup().q, VENUE);
    const lastWeek: StreetRead = {
      ...before,
      at: "2026-10-18T09:00:00.000Z",
      rising: before.rising
        .filter((r) => r.name !== "Khruangbin")
        .map((r) => (r.name === "Sade" ? { ...r, rank: 1 } : r.name === "Alice Coltrane" ? { ...r, rank: 2 } : r)),
    };
    const read = await readStreet(setup().q, VENUE, { previous: lastWeek });
    const trendOf = (name: string) => read.rising.find((r) => r.name === name);
    expect(trendOf("Alice Coltrane")).toMatchObject({ trend: "rising", trendNote: "Up from #2 to #1 among artists for this venue since the read of 2026-10-18" });
    expect(trendOf("Sade")?.trend).toBe("falling");
    expect(trendOf("Khruangbin")?.trendNote).toBe("New among artists for this venue since the read of 2026-10-18");
    expect(trendOf("Paterson")?.trend).toBe("steady");
    expect(trendOf("Alice Coltrane")?.because.map((b) => b.kind)).toEqual(["affinity", "trending", "explainability", "tag"]);
    expect(read.limits).toContain("Rank changes compare this read with the one from 2026-10-18.");
    expectValidProvenance(read);
  });
});

describe("findVenues", () => {
  it("searches name and city in one call and puts hits in that city first", async () => {
    const f = fakeFetch([streetRoute]);
    const out = await findVenues(createQloo({ apiKey: KEY, fetch: f.fetch }), "  Cafe   Lumen ", "Brooklyn");
    expect(f.calls).toHaveLength(1);
    expect(Object.fromEntries(f.calls[0]!.url.searchParams)).toEqual({ query: "Cafe Lumen Brooklyn", types: "urn:entity:place", take: "8" });
    expect(out.map((c) => c.name)).toEqual(["Cafe Lumen", "Cafe Lumen Lisboa"]);
    expect(out[0]).toEqual({
      id: VENUE_ID,
      name: "Cafe Lumen",
      type: "place",
      lat: 40.721,
      lng: -73.958,
      address: "12 Grand St Brooklyn, NY 11211",
      image: "https://images.example/cafe-lumen.jpg",
      url: "https://cafelumen.example",
      tags: ["urn:tag:genre:place:cafe", "urn:tag:ambience:qloo:cozy"],
    });
  });

  it("matches the city against Qloo's geocode names too, and searches by name alone when no hit is in the city", async () => {
    const f = fakeFetch([streetRoute]);
    const q = createQloo({ apiKey: KEY, fetch: f.fetch });
    expect((await findVenues(q, "Cafe Lumen", "Lisbon")).map((c) => c.name)).toEqual(["Cafe Lumen Lisboa", "Cafe Lumen"]);
    expect(f.calls).toHaveLength(1);
    await findVenues(q, "Cafe Lumen", "Oslo");
    expect(f.calls.slice(1).map((c) => c.url.searchParams.get("query"))).toEqual(["Cafe Lumen Oslo", "Cafe Lumen"]);
  });

  it("throws on auth and refuses empty input", async () => {
    const denied = fakeFetch([() => ({ status: 401, body: {} })]);
    const err = await findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "A", "B").catch((e) => e);
    expect(err.kind).toBe("auth");
    await expect(findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "", "B")).rejects.toMatchObject({ kind: "bad_request" });
  });
});
