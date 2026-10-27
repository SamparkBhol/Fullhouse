import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countResults,
  errorMessage,
  parseDemographics,
  parseEntities,
  parseEntity,
  parseExplainability,
  parseHeatmap,
  parseTags,
  parseTrending,
  stripVerbose,
  tagLabel,
  tagNamespace,
  topExplainability,
} from "../../src/core/index.ts";

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`../fixtures/qloo/${name}.json`, import.meta.url), "utf8"));

describe("parsers against the documented layouts", () => {
  it("reads the flat /search results array", () => {
    const es = parseEntities(fx("search_balthazar"));
    expect(es).toHaveLength(2);
    expect(es[0]).toMatchObject({
      id: "FCE8B172-4795-43E4-B222-3B550DC05FD9",
      name: "Balthazar",
      type: "place",
      address: "80 Spring St, New York, NY 10012",
      disambiguation: "80 Spring St, New York, NY 10012",
      affinity: null,
      lat: null,
    });
    expect(es[0]?.tags.map((t) => t.id)).toEqual(["urn:tag:genre:place:restaurant:french", "urn:tag:dining_options:place:brunch"]);
    expect(es[0]?.tags[0]?.namespace).toBe("urn:tag:genre:place");
  });

  it("reads /entities results", () => {
    const [e] = parseEntities(fx("entities_spotify"));
    expect(e).toMatchObject({ name: "Sabrina Carpenter", type: "artist" });
  });

  it("reads insights entities with affinity, distance, coordinates and explainability", () => {
    const body = fx("insights_place");
    const es = parseEntities(body);
    expect(es.map((e) => e.name)).toEqual(["Catch NYC", "L'Artusi", "Roberta's"]);
    expect(es[0]).toMatchObject({ affinity: 0.97, distanceM: 1240.5, lat: 40.7404, lng: -74.0059, type: "place", url: "https://catchrestaurants.com/catchnyc/" });
    expect(es[0]?.explain).toEqual([{ input: "FCE8B172-4795-43E4-B222-3B550DC05FD9", source: "signal.interests.entities", score: 1 }]);
    expect(es[1]?.lat).toBeNull();
    expect(topExplainability(body)[0]?.input).toBe("FCE8B172-4795-43E4-B222-3B550DC05FD9");
    expect(countResults(body)).toBe(3);
  });

  it("strips akas and short descriptions", () => {
    const body = stripVerbose(fx("insights_movie"));
    const props = body.results.entities[0].properties;
    expect(props.akas).toBeUndefined();
    expect(props.short_descriptions).toBeUndefined();
    expect(props.release_year).toBe(2022);
    const [e] = parseEntities(fx("insights_movie"));
    expect(e).toMatchObject({ name: "Everything Everywhere All at Once", type: "movie", disambiguation: "2022, Daniel Scheinert, Daniel Kwan", affinity: 0.91 });
    expect(JSON.stringify(e)).not.toContain("akas");
  });

  it("reads books and artists with multi input explainability", () => {
    expect(parseEntities(fx("insights_book"))[0]).toMatchObject({ name: "The Catcher in the Rye", type: "book" });
    const [artist] = parseEntities(fx("insights_artist"));
    expect(artist?.type).toBe("artist");
    expect(artist?.explain.map((r) => r.score)).toEqual([0.72, 0.28]);
  });

  it("reads tags from insights tag mode, /v2/tags and compare", () => {
    const insights = parseTags(fx("insights_tags"));
    expect(insights[0]).toEqual({ id: "urn:tag:ambience:qloo:intimate", name: "Intimate", namespace: "urn:tag:ambience:qloo", score: 0.992, popularity: null });
    const search = parseTags(fx("tags_search"));
    expect(search.map((t) => t.namespace)).toEqual(["urn:tag:amenity:place", "urn:tag:view:qloo", "urn:tag:genre:place"]);
    expect(search[0]?.score).toBeNull();
    const compare = parseTags(fx("compare"));
    expect(compare.map((t) => [t.id, t.score])).toEqual([
      ["urn:tag:style:qloo:athletic", 0.729],
      ["urn:tag:genre:brand:fashion:activewear", 0.654],
      ["urn:tag:adjective:qloo:sustainable", 0.512],
    ]);
  });

  it("tolerates compare returning a flat array or entities instead of tags", () => {
    const flat = { results: [{ tag_id: "urn:tag:style:qloo:athletic", name: "Athletic", query: { score: 0.7 } }] };
    expect(parseTags(flat).map((t) => t.id)).toEqual(["urn:tag:style:qloo:athletic"]);
    const ents = { results: [{ entity_id: "X", name: "Some Brand", subtype: "urn:entity:brand" }] };
    expect(parseTags(ents)).toEqual([]);
    expect(parseEntities(ents)[0]?.type).toBe("brand");
  });

  it("reads heatmap cells and keeps the no read cells distinguishable", () => {
    const cells = parseHeatmap(fx("heatmap"));
    expect(cells).toHaveLength(7);
    expect(cells[0]).toEqual({ geohash: "dr5wct", lat: 40.591736, lng: -73.756714, affinity: 1, affinityRank: 0.9976498237367802, popularity: 0.9717472118959107 });
    const empty = parseHeatmap({ results: { heatmap: [{ location: { latitude: 40.7, longitude: -73.9, geohash: "dr5r" }, query: { affinity: 0, popularity: 0 } }] } });
    expect(empty[0]?.affinityRank).toBeNull();
  });

  it("reads demographics blocks", () => {
    const d = parseDemographics(fx("demographics"));
    expect(d).toHaveLength(2);
    expect(d[1]?.age["30_to_34"]).toBeCloseTo(0.7);
    expect(d[1]?.gender.male).toBe(0.16);
  });

  it("reads both trending shapes", () => {
    const series = parseTrending(fx("trending_series"));
    expect(series.points).toHaveLength(7);
    expect(series.points[0]?.date).toBe("2026-10-17");
    expect(series.points[6]?.date).toBe("2026-09-05");
    expect(series.points[0]).toMatchObject({ percentile: 99.1, rank: 14, rankVelocity: 3, foldChange: 1.21, percentDelta: 0.9 });
    const ranked = parseTrending(fx("trending_ranked"));
    expect(ranked.points).toEqual([]);
    expect(ranked.ranked).toEqual([{ id: "F5453A45-593C-41EC-BD5A-453D1AEC565C", name: "Sabrina Carpenter", trendRank: 1 }]);
  });

  it("reads a per entity series nested under the trending array", () => {
    const body = { results: { trending: [{ entity_id: "abc", trending: [{ date: "2026-10-01", population_rank: 3 }, { date: "2026-10-08", population_rank: 2 }] }] } };
    const t = parseTrending(body, "ABC");
    expect(t.points.map((p) => p.date)).toEqual(["2026-10-08", "2026-10-01"]);
  });

  it("parses every explainability shape seen or guessed", () => {
    expect(parseExplainability({ "signal.interests.entities": { A: 0.7, B: 0.3 } })).toEqual([
      { input: "A", source: "signal.interests.entities", score: 0.7 },
      { input: "B", source: "signal.interests.entities", score: 0.3 },
    ]);
    expect(parseExplainability([{ entity_id: "A", score: 0.5 }])).toEqual([{ input: "A", source: "", score: 0.5 }]);
    expect(parseExplainability({ "signal.interests.entities": [{ id: "A", weight: "0.4" }] })).toEqual([{ input: "A", source: "signal.interests.entities", score: 0.4 }]);
    expect(parseExplainability({ warning: "could not compute" })).toEqual([]);
    expect(parseExplainability({ "signal.location": 1 })).toEqual([{ input: "signal.location", source: "", score: 1 }]);
    expect(parseExplainability(null)).toEqual([]);
  });

  it("reads affinity wherever the docs put it, and keeps null as null", () => {
    expect(parseEntity({ entity_id: "A", name: "A", affinity: 0.5 })?.affinity).toBe(0.5);
    expect(parseEntity({ entity_id: "A", name: "A", properties: { affinity: 0.4 } })?.affinity).toBe(0.4);
    expect(parseEntity({ entity_id: "A", name: "A", query: { affinity: null } })?.affinity).toBeNull();
    expect(parseEntity({ entity_id: "A" })).toBeNull();
    expect(parseEntity({ entity_id: "A", name: "A", properties: { latitude: 10, longitude: 20 } })).toMatchObject({ lat: 10, lng: 20 });
  });

  it("labels tags and reads both error shapes", () => {
    expect(tagLabel("urn:tag:amenity:place:rooftop_bar")).toBe("rooftop bar");
    expect(tagNamespace("urn:tag:genre:place:restaurant:italian")).toBe("urn:tag:genre:place");
    expect(errorMessage(fx("error_401"))).toBe("Unauthorized: API keys mismatch");
    expect(errorMessage(fx("error_400"))).toBe("entity_ids must be specified.: Bad Request");
  });
});
