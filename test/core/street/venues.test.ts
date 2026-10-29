import { describe, expect, it } from "vitest";
import { createQloo, findVenues } from "../../../src/core/index.ts";
import { parseEntities } from "../../../src/core/qloo/entities.ts";
import { nameClass, rankResults } from "../../../src/core/street/search_rank.ts";
import { CITIES, cityNamed } from "../../../src/shared/cities.ts";
import { VENUE_ID, fakeFetch, streetRoute } from "../../fixtures/street.ts";

const KEY = "venue-test-key";

function setup() {
  const f = fakeFetch([streetRoute]);
  return { f, q: createQloo({ apiKey: KEY, fetch: f.fetch }) };
}

describe("the city list", () => {
  it("has every supported city once, with a centre, a radius in miles and a time zone", () => {
    expect(CITIES.map((c) => c.name)).toEqual([
      "New York", "Brooklyn", "Los Angeles", "San Francisco", "Chicago", "Austin", "Seattle", "Boston", "Toronto",
      "London", "Paris", "Berlin", "Amsterdam", "Barcelona", "Lisbon", "Mumbai", "Bengaluru", "Tokyo",
    ]);
    for (const c of CITIES) {
      expect(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180 && c.miles > 0 && c.miles <= 100, c.name).toBe(true);
      expect(() => new Intl.DateTimeFormat("en", { timeZone: c.tz })).not.toThrow();
    }
  });

  it("reads the city however the owner types it", () => {
    expect(cityNamed("  new YORK ")?.name).toBe("New York");
    expect(cityNamed("NYC")?.name).toBe("New York");
    expect(cityNamed("Bangalore")?.name).toBe("Bengaluru");
    expect(cityNamed("Oslo")).toBeNull();
  });
});

describe("findVenues", () => {
  it("searches the name alone round the centre of a listed city and keeps what is inside its radius", async () => {
    const { f, q } = setup();
    const out = await findVenues(q, "  Cafe   Lumen ", "Brooklyn");
    expect(f.calls).toHaveLength(1);
    expect(Object.fromEntries(f.calls[0]!.url.searchParams)).toEqual({
      query: "Cafe Lumen",
      types: "urn:entity:place",
      take: "20",
      "filter.location": "40.6782,-73.9442",
      "filter.radius": "6",
    });
    expect(out.map((c) => c.name)).toEqual(["Cafe Lumen"]);
    expect(out[0]).toMatchObject({ id: VENUE_ID, address: "12 Grand St Brooklyn, NY 11211", neighborhood: "Williamsburg", kind: "cafe" });
    expect(out[0]?.distanceM).toBeGreaterThan(4000);
    expect(out[0]?.distanceM).toBeLessThan(6000);
  });

  it("falls back to name and city as text, then the name alone, when nothing is inside the radius", async () => {
    const { f, q } = setup();
    const out = await findVenues(q, "Cafe Lumen", "Tokyo");
    expect(f.calls.map((c) => c.url.searchParams.get("query"))).toEqual(["Cafe Lumen", "Cafe Lumen Tokyo", "Cafe Lumen"]);
    expect(out.map((c) => c.name)).toEqual(["Cafe Lumen", "Cafe Lumen Lisboa"]);
  });

  it("keeps the old text path for a city that is not on the list", async () => {
    const { f, q } = setup();
    await findVenues(q, "Cafe Lumen", "Oslo");
    expect(f.calls.map((c) => c.url.searchParams.get("query"))).toEqual(["Cafe Lumen Oslo", "Cafe Lumen"]);
    expect(f.calls.every((c) => !c.url.searchParams.has("filter.location"))).toBe(true);
  });

  it("searches within a mile of the owner's position for near me, and the position goes nowhere else", async () => {
    const { f, q } = setup();
    const out = await findVenues(q, "cafe", "", { near: { lat: 40.7205, lng: -73.9575 } });
    expect(Object.fromEntries(f.calls[0]!.url.searchParams)).toMatchObject({ query: "cafe", "filter.location": "40.7205,-73.9575", "filter.radius": "1" });
    expect(out.map((c) => c.name)).toEqual(["Cafe Lumen"]);
    expect(JSON.stringify(out)).not.toContain("40.7205");
  });

  it("leaves out hits without coordinates", async () => {
    const { q } = setup();
    expect((await findVenues(q, "Lumen", "Brooklyn")).map((c) => c.name)).not.toContain("Lumen Bakery");
  });

  it("throws on auth and refuses empty input", async () => {
    const denied = fakeFetch([() => ({ status: 401, body: {} })]);
    const err = await findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "A", "B").catch((e) => e);
    expect(err.kind).toBe("auth");
    await expect(findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "", "B")).rejects.toMatchObject({ kind: "bad_request" });
  });
});

describe("result ranking", () => {
  const place = (name: string, lat: number, extra: Record<string, unknown> = {}, kinds = ["cafe"]) => ({
    entity_id: `${name}-${lat}`,
    name,
    types: ["urn:entity:place"],
    location: { lat, lon: -74 },
    tags: kinds.map((k) => ({ tag_id: `urn:tag:genre:place:${k}`, name: k })),
    properties: { address: `${Math.round(lat * 1000)} Main St`, ...extra },
  });

  it("puts the name as typed first, then the nearest, drops closed places and doubles, and sends places that never host last", () => {
    const hits = parseEntities({
      results: [
        place("Church of Reggio", 40.7301, {}, ["church"]),
        place("W New York", 40.7302),
        place("Reggio Bar", 40.75),
        place("Caffe Reggio", 40.74),
        place("Caffe Reggio", 40.74),
        place("Reggio", 40.76),
        place("Reggio Closed", 40.7303, { is_closed: true }),
      ],
    });
    const out = rankResults(hits, "reggio", { lat: 40.73, lng: -74 }, 8);
    expect(out.map((c) => c.name)).toEqual(["Reggio", "Reggio Bar", "Caffe Reggio", "W New York", "Church of Reggio"]);
  });

  it("classes names as exact, prefix, whole words or other", () => {
    expect([nameClass("Veselka", "veselka"), nameClass("Daunt Books Marylebone", "daunt books"), nameClass("Caffe Reggio", "reggio"), nameClass("Regional Bar", "reggio")]).toEqual([0, 1, 2, 3]);
    expect(nameClass("Housing Works Bookstore", "Housing Works Bookstore Cafe")).toBe(1);
  });
});
