import { beforeAll, describe, expect, it } from "vitest";
import { EXTRACT_SYSTEM, PLAIN_SYSTEM, baselineAsk, createQloo, extractNames, planNights, readStreet, runBaseline, sameName, summarise, verifyArtist, verifyPlace } from "../../src/core/index.ts";
import type { NightPlan, StreetRead } from "../../src/shared/contract.ts";
import { NOW, VENUE, VENUE_ID, fakeFetch, streetRoute, type Route } from "../fixtures/street.ts";

let read: StreetRead;
let plan: NightPlan;

const PLAIN = "Try a vinyl night! Feature Norah Jones. Partner with Blue Hour Wine Bar, Sora Ramen and The Velvet Spoon.";

// Full House's own names come back by id, the way /entities answers.
const entitiesRoute: Route = (url) => {
  if (url.pathname !== "/entities") return undefined;
  const ids = (url.searchParams.get("entity_ids") ?? "").split(",");
  const known = [...read.lovedPlaces, ...read.rising];
  return { status: 200, body: { results: ids.flatMap((id) => known.filter((k) => k.id === id).slice(0, 1).map((k) => ({ entity_id: k.id, name: k.name, types: [`urn:entity:${k.type}`] }))) } };
};

const searchRoute: Route = (url) => {
  if (url.pathname === "/entities") return entitiesRoute(url);
  if (url.pathname !== "/search") return undefined;
  const q = url.searchParams.get("query") ?? "";
  const types = url.searchParams.get("types");
  const place = (id: string, name: string, lat: number, lng: number, address: string) => ({
    entity_id: id,
    name,
    types: ["urn:entity:place"],
    disambiguation: address,
    location: { lat, lon: lng },
    properties: { address },
  });
  if (types === "urn:entity:place") {
    if (q === "Blue Hour Wine Bar") return { status: 200, body: { results: [place("PLACE-1", "Blue Hour Wine Bar", 40.7223, -73.9568, "40 Grand St Brooklyn, NY 11211")] } };
    if (q === "Kettle Books") return { status: 200, body: { results: [place("PLACE-2", "Kettle Books", 40.7192, -73.9596, "7 Roebling St Brooklyn, NY 11211")] } };
    if (q === "Sora Ramen") return { status: 200, body: { results: [place("X-9", "Sora Ramen", 40.7801, -73.9012, "1530 Lexington Ave New York, NY 10128")] } };
    if (q === "Daybreak Cafe") return { status: 500, body: {} };
    // Search never answers empty, so a name Qloo does not know comes back as a fuzzy namesake.
    return { status: 200, body: { results: [place("X-7", "Silver Spoon Diner", 40.6501, -73.9496, "2101 Church Ave Brooklyn, NY 11226")] } };
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
    expect(b.ask).toBe("I run Cafe Lumen at 12 Grand St Brooklyn, NY 11211, Brooklyn. Thursday evenings are quiet. Suggest one night I could run on a Thursday, one featured act for it, and three nearby businesses I could partner with.");
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

    expect(b.fullHouseNames[0]).toMatchObject({ name: "Alice Coltrane", kind: "artist", status: "found_nearby", tied: true, tieNote: "1st among the artists Qloo returned for people who like Cafe Lumen" });
    expect(b.fullHouseNames.slice(1).map((n) => n.name)).toEqual(plan.partners.map((p) => p.name));
    expect(b.fullHouseNames.slice(1).every((n) => n.tied && /^\d+(st|nd|rd|th) of 5 places nearby people who like Cafe Lumen love$/.test(n.tieNote ?? ""))).toBe(true);
    expect(b.fullHouseNames[1]?.note).toMatch(/^Checked by Qloo id as .+, about \d+ m away$/);
    expect(b.plainNames[0]).toMatchObject({ tied: false, tieNote: "Not among the 5 places nearby Qloo ties to Cafe Lumen's audience" });
    expect(f.calls.filter((c) => c.url.pathname === "/entities")).toHaveLength(1);
    expect(b.method).toContain("is not proof that a place does not exist");
    expect(b.method).toContain("within 10 miles");

    const placeSearch = f.calls.find((c) => c.url.searchParams.get("query") === "Blue Hour Wine Bar")!.url.searchParams;
    expect(placeSearch.get("filter.location")).toBe("40.721,-73.958");
    expect(placeSearch.get("filter.radius")).toBe("10");
    expect(f.calls.length).toBeLessThanOrEqual(10);
  });

  it("leaves out the name the plain model gave the night itself", async () => {
    const generate = async (system: string) =>
      system === PLAIN_SYSTEM ? "Thursday Night Lit with Kettle Books." : JSON.stringify({ places: [], artists: [], other: ["Thursday Night Lit", "The Overstory"], events: ["Thursday Night Lit"] });
    const names = await extractNames("Thursday Night Lit with Kettle Books.", generate, VENUE);
    expect(names.other).toEqual(["The Overstory"]);
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

describe("verifyPlace", () => {
  it("says so when a plain model offers the venue itself as a partner", async () => {
    const own = fakeFetch([
      () => ({ status: 200, body: { results: [{ entity_id: VENUE_ID, name: "Cafe Lumen", types: ["urn:entity:place"], location: { lat: VENUE.entity.lat, lon: VENUE.entity.lng } }] } }),
    ]);
    const checked = await verifyPlace(createQloo({ apiKey: "k", fetch: own.fetch }), "Cafe Lumen", VENUE);
    expect(checked).toEqual({ name: { name: "Cafe Lumen", kind: "place", status: "found_nearby", note: "This is Cafe Lumen itself, so it cannot be a partner" }, id: VENUE_ID });
  });

  it("does not count a place Qloo lists as permanently closed", async () => {
    const shut = { entity_id: "SHUT-1", name: "Soho Bikes", types: ["urn:entity:place"], location: { lat: 40.7215, lng: -73.958 }, properties: { address: "26 Berwick St", is_closed: true } };
    const closed = fakeFetch([() => ({ status: 200, body: { results: [shut] } })]);
    const checked = await verifyPlace(createQloo({ apiKey: "k", fetch: closed.fetch }), "Soho Bikes", VENUE);
    expect(checked.name).toEqual({ name: "Soho Bikes", kind: "place", status: "not_found", closed: true, note: "In Qloo as permanently closed: Soho Bikes, 26 Berwick St" });
  });
});

describe("verifyArtist", () => {
  it("searches the whole catalog when the artist search misses, and names the type it found", async () => {
    const author = fakeFetch([
      (url) =>
        url.searchParams.get("types") === "urn:entity:artist"
          ? { status: 200, body: { results: [{ entity_id: "ART-2", name: "Jenny Lewis", types: ["urn:entity:artist"] }] } }
          : { status: 200, body: { results: [{ entity_id: "AUTH-1", name: "Jennifer Egan", types: ["urn:entity:author"] }] } },
    ]);
    const checked = await verifyArtist(createQloo({ apiKey: "k", fetch: author.fetch }), "Jennifer Egan", VENUE);
    expect(checked.name).toEqual({ name: "Jennifer Egan", kind: "artist", status: "found_nearby", note: "In Qloo's catalog as Jennifer Egan (author); distance does not apply" });
    expect(author.calls.map((c) => c.url.searchParams.get("types"))).toEqual(["urn:entity:artist", null]);
  });
});

describe("sameName", () => {
  it("matches names loosely but not wildly", () => {
    expect(sameName("The Blue Note", "Blue Note")).toBe(true);
    expect(sameName("Café Lumen", "cafe lumen")).toBe(true);
    expect(sameName("Sora Ramen Williamsburg", "Sora Ramen")).toBe(true);
    expect(sameName("Sora", "Ramen Bar")).toBe(false);
    expect(sameName("Emily St. John Mandel", "St John")).toBe(false);
    expect(sameName("Moss", "Moss Siridajnawanan Mortgage Broker")).toBe(false);
    expect(sameName("Cafe Grumpy", "Café Grumpy Lower East Side")).toBe(true);
    expect(sameName("", "x")).toBe(false);
  });
});
