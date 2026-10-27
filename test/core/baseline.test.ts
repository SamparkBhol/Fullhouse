import { beforeAll, describe, expect, it } from "vitest";
import { EXTRACT_SYSTEM, PLAIN_SYSTEM, baselineAsk, createQloo, planNights, readStreet, runBaseline, sameName, summarise } from "../../src/core/index.ts";
import type { NightPlan, StreetRead } from "../../src/shared/contract.ts";
import { NOW, VENUE, fakeFetch, streetRoute, type Route } from "../fixtures/street.ts";

let read: StreetRead;
let plan: NightPlan;

const PLAIN = "Try a vinyl night! Feature Norah Jones. Partner with Blue Hour Wine Bar, Sora Ramen and The Velvet Spoon.";

const searchRoute: Route = (url) => {
  if (url.pathname !== "/search") return undefined;
  const q = url.searchParams.get("query") ?? "";
  const types = url.searchParams.get("types");
  const place = (id: string, name: string, lat: number, lng: number) => ({ entity_id: id, name, types: ["urn:entity:place"], properties: { lat, lon: lng, address: `${name} street` } });
  if (types === "urn:entity:place") {
    if (q === "Blue Hour Wine Bar") return { status: 200, body: { results: [place("PLACE-1", "Blue Hour Wine Bar", 40.7225, -73.957)] } };
    if (q === "Kettle Books") return { status: 200, body: { results: [place("PLACE-2", "Kettle Books", 40.719, -73.96)] } };
    if (q === "Sora Ramen") return { status: 200, body: { results: [place("X-9", "Sora Ramen", 40.78, -73.9)] } };
    if (q === "Daybreak Cafe") return { status: 500, body: {} };
    return { status: 404, body: { message: "No results" } };
  }
  if (types === "urn:entity:artist") {
    if (q === "Alice Coltrane" || q === "Norah Jones") return { status: 200, body: { results: [{ entity_id: "ART-X", name: q, types: ["urn:entity:artist"] }] } };
    return { status: 200, body: { results: [] } };
  }
  return { status: 200, body: { results: [] } };
};

beforeAll(async () => {
  const f = fakeFetch([streetRoute]);
  read = await readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
  plan = planNights(read, VENUE, {}, NOW, "owner", () => "p1").plan;
});

describe("runBaseline", () => {
  it("asks the plain model, extracts names and checks them against Qloo search", async () => {
    const f = fakeFetch([searchRoute]);
    const q = createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW, sleep: async () => {} });
    const asked: Array<[string, string]> = [];
    const generate = async (system: string, user: string) => {
      asked.push([system, user]);
      if (system === PLAIN_SYSTEM) return PLAIN;
      return JSON.stringify({ places: ["Blue Hour Wine Bar", "Sora Ramen", "The Velvet Spoon"], artists: ["Norah Jones"], other: [] });
    };
    const b = await runBaseline(q, VENUE, read, plan, generate, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    expect(asked[0]).toEqual([PLAIN_SYSTEM, baselineAsk(VENUE)]);
    expect(asked[1]?.[0]).toBe(EXTRACT_SYSTEM);
    expect(b.ask).toBe("I run Cafe Lumen at 12 Grand St, Brooklyn, NY 11211, Brooklyn. Thursday evenings are quiet. Suggest one night I could run on a Thursday, one featured act for it, and three nearby businesses I could partner with.");
    expect(b.plainText).toBe(PLAIN);
    expect(b.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(b.at).toBe(NOW.toISOString());
    expect(b.plainNames.map((n) => [n.name, n.kind, n.status])).toEqual([
      ["Blue Hour Wine Bar", "place", "found_nearby"],
      ["Sora Ramen", "place", "found_far"],
      ["The Velvet Spoon", "place", "not_found"],
      ["Norah Jones", "artist", "found_nearby"],
    ]);
    expect(b.plainNames[1]?.note).toMatch(/^Sora Ramen is about \d+\.\d km away$/);
    expect(summarise(b.plainNames)).toEqual({ found_nearby: 2, found_far: 1, not_found: 1 });

    expect(b.fullHouseNames[0]).toMatchObject({ name: "Alice Coltrane", kind: "artist", status: "found_nearby" });
    expect(b.fullHouseNames.slice(1).map((n) => n.name)).toEqual(plan.partners.map((p) => p.name));
    expect(b.method).toContain("is not proof that a place does not exist");
    expect(b.method).toContain("within 10 miles");

    const placeSearch = f.calls.find((c) => c.url.searchParams.get("query") === "Blue Hour Wine Bar")!.url.searchParams;
    expect(placeSearch.get("filter.location")).toBe("40.721,-73.958");
    expect(placeSearch.get("filter.radius")).toBe("10");
    expect(f.calls.length).toBeLessThanOrEqual(12);
  });

  it("says when a check could not run instead of calling it missing", async () => {
    const f = fakeFetch([searchRoute]);
    const q = createQloo({ apiKey: "k", fetch: f.fetch, sleep: async () => {} });
    const generate = async (system: string) => (system === PLAIN_SYSTEM ? "Partner with Daybreak Cafe." : '{"places": ["Daybreak Cafe"], "artists": [], "other": []}');
    const b = await runBaseline(q, VENUE, read, plan, generate, "m");
    expect(b.plainNames[0]).toEqual({ name: "Daybreak Cafe", kind: "place", status: "not_found", note: "Not checked: the Qloo search failed (server)" });
  });

  it("falls back to pattern extraction when the extraction reply is not JSON", async () => {
    const f = fakeFetch([searchRoute]);
    const q = createQloo({ apiKey: "k", fetch: f.fetch });
    const generate = async (system: string) => (system === PLAIN_SYSTEM ? PLAIN : "sorry");
    const b = await runBaseline(q, VENUE, read, plan, generate, "m");
    expect(b.plainNames.every((n) => n.kind === "other")).toBe(true);
    expect(b.plainNames.map((n) => n.name)).toContain("Blue Hour Wine Bar");
    expect(b.method).toContain("because the extraction call failed");
  });

  it("propagates an auth failure", async () => {
    const f = fakeFetch([() => ({ status: 401, body: {} })]);
    const q = createQloo({ apiKey: "k", fetch: f.fetch });
    const generate = async (system: string) => (system === PLAIN_SYSTEM ? PLAIN : '{"places": ["Sora Ramen"]}');
    await expect(runBaseline(q, VENUE, read, plan, generate, "m")).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("sameName", () => {
  it("matches names loosely but not wildly", () => {
    expect(sameName("The Blue Note", "Blue Note")).toBe(true);
    expect(sameName("Café Lumen", "cafe lumen")).toBe(true);
    expect(sameName("Sora Ramen Williamsburg", "Sora Ramen")).toBe(true);
    expect(sameName("Sora", "Ramen Bar")).toBe(false);
    expect(sameName("", "x")).toBe(false);
  });
});
