import { describe, expect, it } from "vitest";
import { createQloo, findVenues } from "../../../src/core/index.ts";
import { VENUE_ID, fakeFetch, streetRoute } from "../../fixtures/street.ts";

const KEY = "venue-test-key";

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

  it("leaves out hits without coordinates", async () => {
    const f = fakeFetch([streetRoute]);
    const out = await findVenues(createQloo({ apiKey: KEY, fetch: f.fetch }), "Lumen", "Brooklyn");
    expect(out.map((c) => c.name)).not.toContain("Lumen Bakery");
  });

  it("throws on auth and refuses empty input", async () => {
    const denied = fakeFetch([() => ({ status: 401, body: {} })]);
    const err = await findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "A", "B").catch((e) => e);
    expect(err.kind).toBe("auth");
    await expect(findVenues(createQloo({ apiKey: KEY, fetch: denied.fetch }), "", "B")).rejects.toMatchObject({ kind: "bad_request" });
  });
});
