import { describe, expect, it } from "vitest";
import {
  countResults,
  errorMessage,
  explainSummary,
  isNamespaceRoot,
  parseCompare,
  parseDemographics,
  parseEntities,
  parseEntity,
  parseExplain,
  parseHeatmap,
  parseTag,
  parseTags,
  parseTrending,
  tagLabel,
  tagNamespace,
} from "../../src/core/index.ts";
import { VENUE_ID, fixture } from "../fixtures/street.ts";

describe("entity parsing", () => {
  it("reads /search hits: types array, top level location, address and tag_id tags", () => {
    const [lisbon, lumen, bakery] = parseEntities(fixture("search_place"));
    expect(lumen).toMatchObject({
      id: VENUE_ID,
      name: "Cafe Lumen",
      type: "place",
      lat: 40.721,
      lng: -73.958,
      address: "12 Grand St Brooklyn, NY 11211",
      disambiguation: "12 Grand St Brooklyn, NY 11211",
      image: "https://images.example/cafe-lumen.jpg",
      url: "https://cafelumen.example",
      affinity: null,
    });
    expect(lumen?.tags.map((t) => [t.id, t.namespace])).toEqual([
      ["urn:tag:genre:place:cafe", "urn:tag:genre:place"],
      ["urn:tag:ambience:qloo:cozy", "urn:tag:ambience:qloo"],
    ]);
    expect(lumen?.areaNames).toEqual(["Williamsburg", "New York", "Kings County", "United States"]);
    expect(lisbon?.areaNames).toContain("Lisbon");
    expect(bakery).toMatchObject({ lat: null, lng: null });
  });

  it("reads insights places: subtype, distance, audience growth and per result explainability", () => {
    const [first, , third] = parseEntities(fixture("insights_place"));
    expect(first).toMatchObject({ type: "place", affinity: 0.9681, distanceM: 151.4, audienceGrowth: 0.42, lat: 40.7223, lng: -73.9568 });
    expect(first?.explain).toEqual([{ entityId: VENUE_ID, score: 1 }]);
    expect(first?.tags[0]).toEqual({ id: "urn:tag:genre:place:wine_bar", name: "Wine Bar", namespace: "urn:tag:genre:place", score: null, popularity: null });
    expect(third?.audienceGrowth).toBe(-0.8);
  });

  it("keeps a missing affinity as null and needs an id and a name", () => {
    const [song] = parseEntities(fixture("insights_podcast"));
    expect(song).toMatchObject({ affinity: 1, explain: [] });
    expect(parseEntity({ entity_id: "X", name: "No signal", query: { distance: 40 } })?.affinity).toBeNull();
    expect(parseEntity({ entity_id: "X" })).toBeNull();
    expect(parseEntity({ name: "No id" })).toBeNull();
  });

  it("drops duplicate ids within one answer", () => {
    const body = { results: { entities: [{ entity_id: "a", name: "A" }, { entity_id: "A", name: "A again" }] } };
    expect(parseEntities(body).map((e) => e.name)).toEqual(["A"]);
  });
});

describe("tag parsing", () => {
  it("reads tag mode with query.affinity and trims names", () => {
    const tags = parseTags(fixture("insights_street_tags"));
    expect(tags[0]).toEqual({ id: "urn:tag:genre:music:jazz", name: "Jazz", namespace: "urn:tag:genre:music", score: 0.99994, popularity: 0.9812 });
    expect(tags.find((t) => t.id === "urn:tag:genre:music:soul")?.name).toBe("Soul");
  });

  it("reads compare tags, whose type is urn:tag and whose namespace is the subtype", () => {
    const t = parseTag({ tag_id: "urn:tag:offerings:place:wine", name: "Wine", type: "urn:tag", subtype: "urn:tag:offerings:place", query: { count: "2" } });
    expect(t).toMatchObject({ namespace: "urn:tag:offerings:place", score: null });
    expect(parseTag({ id: "not-a-tag", name: "X" })).toBeNull();
  });

  it("labels tags and spots bare namespaces", () => {
    expect(tagLabel("urn:tag:amenity:place:rooftop_bar")).toBe("rooftop bar");
    expect(tagNamespace("urn:tag:genre:place:restaurant:italian")).toBe("urn:tag:genre:place");
    expect(isNamespaceRoot({ id: "urn:tag:genre:place", namespace: "urn:tag:genre:place" })).toBe(true);
    expect(isNamespaceRoot({ id: "urn:tag:genre:place:bar", namespace: "urn:tag:genre:place" })).toBe(false);
  });
});

describe("explainability", () => {
  it("reads the per result list under the literal signal.interests.entities key", () => {
    expect(parseExplain({ "signal.interests.entities": [{ entity_id: "B", score: 0.3 }, { entity_id: "A", score: 0.7 }] })).toEqual([
      { entityId: "A", score: 0.7 },
      { entityId: "B", score: 0.3 },
    ]);
    expect(parseExplain(undefined)).toEqual([]);
  });

  it("reads the top level effect lists", () => {
    const body = fixture("insights_artist");
    expect(explainSummary(body)).toEqual([{ entityId: VENUE_ID, score: 1 }]);
    expect(explainSummary(body, "effect_on_top3_recs")).toHaveLength(1);
    expect(explainSummary(fixture("insights_podcast"))).toEqual([]);
  });
});

describe("other insights modes", () => {
  it("reads heat cells from location latitude and longitude", () => {
    const cells = parseHeatmap(fixture("heatmap_venue"));
    expect(cells).toHaveLength(5);
    expect(cells[0]).toEqual({ geohash: "dr5rtg0", lat: 40.72152, lng: -73.95721, affinity: 1, affinityRank: 1, popularity: 0.98214 });
    expect(cells[4]).toMatchObject({ affinityRank: 0, popularity: 0 });
  });

  it("reads compare's shared tags, each side's own tags and the string counts", () => {
    const c = parseCompare(fixture("compare"));
    expect(c.shared.map((t) => t.name)).toEqual(["Place", "Coffee"]);
    expect(c.shared[1]?.b).toEqual([{ id: "A1B2C3D4-2222-4A2B-9C3D-0E1F2A3B4C12", name: "Kettle Books" }]);
    expect(c.shared[0]?.score).toBeCloseTo(0.731, 3);
    expect(c.a.map((t) => t.id)).toEqual(["urn:tag:genre:place", "urn:tag:genre:place:cafe", "urn:tag:offerings:place:coffee"]);
    expect(c.b.find((t) => t.name === "Wine")?.count).toBe(2);
  });

  it("reads one demographics block per input", () => {
    const [d] = parseDemographics(fixture("demographics"));
    expect(d?.input).toBe(VENUE_ID);
    expect(d?.age["25_to_29"]).toBe(0.31);
    expect(d?.gender).toEqual({ male: -0.09, female: 0.09 });
  });

  it("reads trending points newest first with the rank as a number", () => {
    const points = parseTrending(fixture("trending_series"));
    expect(points.map((p) => p.date)).toEqual(["2026-10-26", "2026-10-19", "2026-10-12"]);
    expect(points[0]).toEqual({ date: "2026-10-26", percentile: 0.2071, rank: 4412, rankVelocity: 0, foldChange: 0, percentDelta: 0 });
  });
});

describe("counts and errors", () => {
  it("counts results for every layout", () => {
    expect(countResults(fixture("search_place"))).toBe(3);
    expect(countResults(fixture("insights_place"))).toBe(5);
    expect(countResults(fixture("insights_street_tags"))).toBe(9);
    expect(countResults(fixture("heatmap_street"))).toBe(3);
    expect(countResults(fixture("demographics"))).toBe(1);
    expect(countResults(fixture("compare"))).toBe(9);
    expect(countResults({})).toBe(0);
  });

  it("reads all three error layouts", () => {
    expect(errorMessage(fixture("error_insights_400"))).toBe("take must be an integer value between 1 and 50");
    expect(errorMessage({ errors: [{ message: "WKT format is invalid and cannot be parsed", path: "filter.location" }] })).toBe(
      "WKT format is invalid and cannot be parsed (filter.location)",
    );
    expect(errorMessage(fixture("error_search_400"))).toBe("filter.location must be in the form lat,lon: Bad Request");
    expect(errorMessage(fixture("error_401"))).toBe("Unauthorized: API keys mismatch");
    expect(errorMessage("<html>")).toBe("");
  });
});
