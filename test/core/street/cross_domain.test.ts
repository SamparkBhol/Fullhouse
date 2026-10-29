import { describe, expect, it } from "vitest";
import type { LovedPlace } from "../../../src/shared/contract.ts";
import { CROSS_TYPES, crossDomain } from "../../../src/core/street/steps/cross_domain.ts";
import { VENUE_ID } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const typeIs = (urn: string) => (p: URLSearchParams) => p.get("filter.type") === urn;
const NONE = { anchors: [], exclude: [] };

const BAR_ID = "A1B2C3D4-1111-4A2B-9C3D-0E1F2A3B4C11";
const CINEMA_ID = "A1B2C3D4-5555-4A2B-9C3D-0E1F2A3B4C15";

function loved(id: string, name: string, tags: string[], url?: string): LovedPlace {
  return { id, name, type: "place", lat: 40.72, lng: -73.95, distanceM: 300, rank: 1, tags, because: [], ...(url ? { url } : {}) };
}

const BAR = loved(BAR_ID, "Blue Hour Wine Bar", ["urn:tag:genre:place:wine_bar"], "https://bluehour.example");
const CINEMA = loved(CINEMA_ID, "Grand Street Cinema", ["urn:tag:genre:place:movie_theater"], "https://grandstreetcinema.example");

function film(id: string, name: string, affinity: number, explain: Array<[string, number]>) {
  return {
    name,
    entity_id: id,
    subtype: "urn:entity:movie",
    tags: [],
    query: { affinity, explainability: { "signal.interests.entities": explain.map(([entity_id, score]) => ({ entity_id, score })) } },
  };
}

const SHARED_FILMS = {
  success: true,
  results: {
    entities: [
      film("FILM-1", "The Farewell", 0.94, [[VENUE_ID, 0.61], [CINEMA_ID, 0.39]]),
      film("FILM-2", "Booksmart", 0.9, [[VENUE_ID, 0.58], [CINEMA_ID, 0.42]]),
    ],
  },
  query: {
    explainability: { "signal.interests.entities": { effect_on_top10_recs: [{ entity_id: VENUE_ID, avg_score: 0.598 }, { entity_id: CINEMA_ID, avg_score: 0.402 }] } },
  },
  warnings: [{ type: "not_found", "signal.interests.entities": [BAR_ID] }],
};

describe("crossDomain", () => {
  it("asks each media type with the venue and its point as signals, explained, and never with bias.trends", async () => {
    const { run, ctx, calls } = stepSetup();
    await crossDomain(run, ctx, NONE);
    expect(calls.map((c) => c.url.searchParams.get("filter.type"))).toEqual(CROSS_TYPES.map((t) => `urn:entity:${t}`));
    for (const c of calls) {
      expect(Object.fromEntries(c.url.searchParams)).toEqual({
        "feature.explainability": "true",
        "filter.type": c.url.searchParams.get("filter.type"),
        "signal.interests.entities": VENUE_ID,
        "signal.location": "POINT(-73.958 40.721)",
        take: "10",
      });
    }
  });

  it("ranks picks by affinity within each type and ties them to the venue", async () => {
    const { run, ctx } = stepSetup();
    const { rising } = await crossDomain(run, ctx, NONE);
    const artists = rising.filter((r) => r.type === "artist");
    expect(artists.map((r) => [r.name, r.rank, r.trend, r.venueSignal])).toEqual([
      ["Alice Coltrane", 1, "unknown", true],
      ["Sade", 2, "unknown", true],
      ["Khruangbin", 3, "unknown", true],
    ]);
    expect(artists[0]?.because.map((b) => b.text)).toEqual(["Ranked among 3 artists for people who like Cafe Lumen, read with the streets around it"]);
    expect(artists[0]?.tags).toEqual(["urn:tag:genre:music:jazz", "urn:tag:influenced_by:qloo:john_coltrane"]);
  });

  it("labels a type Qloo answered without the venue as the area's picks, with no rank claim", async () => {
    const { run, ctx } = stepSetup();
    const { rising, limits } = await crossDomain(run, ctx, NONE);
    const podcast = rising.find((r) => r.type === "podcast")!;
    expect(podcast.venueSignal).toBe(false);
    expect(podcast.because.map((b) => b.text)).toEqual(["One of 2 podcasts Qloo returned for the area around Cafe Lumen"]);
    expect(limits).toEqual([
      "Qloo returned no TV shows for Cafe Lumen.",
      "Qloo did not use Cafe Lumen itself for the podcasts, so those picks reflect the area only and are not ranked.",
    ]);
  });

  it("reads the anchors it is given beside the venue and shows each pick's explainability share", async () => {
    const { run, ctx, calls } = stepSetup([answer(typeIs("urn:entity:movie"), SHARED_FILMS)]);
    const { rising, anchors, limits } = await crossDomain(run, ctx, { anchors: [BAR, CINEMA], exclude: [] });
    expect(anchors.map((a) => a.name)).toEqual(["Blue Hour Wine Bar", "Grand Street Cinema"]);
    expect(calls[0]?.url.searchParams.get("signal.interests.entities")).toBe(`${VENUE_ID},${BAR_ID},${CINEMA_ID}`);
    const top = rising.find((r) => r.type === "movie")!;
    expect(top.because.map((b) => b.text)).toEqual([
      "Ranked among 2 films for people who like Cafe Lumen and Grand Street Cinema, read with the streets around it. Across the top 10, Qloo's explainability share is Cafe Lumen 0.60 and Grand Street Cinema 0.40",
      "Qloo's explainability share for this one: Cafe Lumen 0.61 and Grand Street Cinema 0.39",
    ]);
    expect(top.explain).toEqual([
      { entityId: VENUE_ID, share: 0.61 },
      { entityId: CINEMA_ID, share: 0.39 },
    ]);
    expect(limits).toContain("Qloo could not use Blue Hour Wine Bar for the films, so those lists lean on the others.");
  });

  it("treats a list as the area's when Qloo says it could not use the venue", async () => {
    const dropped = { ...SHARED_FILMS, warnings: [{ type: "not_found", "signal.interests.entities": [VENUE_ID] }] };
    const { run, ctx } = stepSetup([answer(typeIs("urn:entity:movie"), dropped)]);
    const { rising } = await crossDomain(run, ctx, NONE);
    expect(rising.filter((r) => r.type === "movie").every((r) => r.venueSignal === false)).toBe(true);
  });

  it("asks Qloo to leave out the features of recent nights and says so", async () => {
    const { run, ctx, calls } = stepSetup();
    const { limits } = await crossDomain(run, ctx, { anchors: [], exclude: [{ id: "FILM-1", name: "The Farewell", type: "movie" }] });
    expect(calls.every((c) => c.url.searchParams.get("filter.exclude.entities") === "FILM-1")).toBe(true);
    expect(limits).toContain("Left out because you ran them: The Farewell.");
  });

  it("keeps the other types when one is refused", async () => {
    const refused = answer(typeIs("urn:entity:book"), { errors: [{ message: "urn:entity:book does not yet support trending requests.", subtype: "urn:entity:book" }] }, 400);
    const { run, ctx } = stepSetup([refused]);
    const { rising } = await crossDomain(run, ctx, NONE);
    expect(rising.some((r) => r.type === "book")).toBe(false);
    expect(rising.some((r) => r.type === "artist")).toBe(true);
    expect(run.notes()).toEqual(["Book picks failed (Qloo rejected the request), so that part of the read is missing."]);
  });
});

describe("the street read's own picks", () => {
  it("say people who like the venue alone, because no other place is in the signal", async () => {
    const { run, ctx, calls } = stepSetup();
    const { rising, anchors } = await crossDomain(run, ctx, NONE);
    expect(anchors).toEqual([]);
    expect(calls.every((c) => c.url.searchParams.get("signal.interests.entities") === VENUE_ID)).toBe(true);
    expect(rising.filter((r) => r.venueSignal).every((r) => r.because[0]!.text.includes("for people who like Cafe Lumen,"))).toBe(true);
  });
});
