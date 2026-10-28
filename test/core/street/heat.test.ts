import { describe, expect, it } from "vitest";
import type { StreetTag } from "../../../src/shared/contract.ts";
import { MAX_HEAT_CELLS, conceptHeat, heatCells, venueHeat } from "../../../src/core/street/steps/heat.ts";
import { VENUE_ID, fixture } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isHeat = (p: URLSearchParams) => p.get("filter.type") === "urn:heatmap";
const CONCEPTS: StreetTag[] = [
  { id: "urn:tag:genre:place:cafe", name: "Cafe", namespace: "urn:tag:genre:place", rank: 1 },
  { id: "urn:tag:genre:place:book_store", name: "Book store", namespace: "urn:tag:genre:place", rank: 2 },
];

function cell(geohash: string, rank: number | null, popularity: number | null = 0.5, affinity: number | null = rank) {
  return { location: { latitude: 40.72, longitude: -73.95, geohash }, query: { affinity, affinity_rank: rank, popularity } };
}

describe("heatCells", () => {
  it("keeps cells with a rank and a popularity, strongest first, rounded", () => {
    const body = { success: true, results: { heatmap: [cell("b", 0.41234567), cell("a", 0.9), cell("c", null), cell("d", 0.5, null)] } };
    expect(heatCells(body)).toEqual({
      cells: [
        { geohash: "a", lat: 40.72, lng: -73.95, affinityRank: 0.9, popularity: 0.5 },
        { geohash: "b", lat: 40.72, lng: -73.95, affinityRank: 0.4123, popularity: 0.5 },
      ],
      dropped: 0,
    });
  });

  it("marks a square with no affinity and no popularity as no read, whatever its rank says, and puts it last", () => {
    const body = { results: { heatmap: [cell("empty", 0.64, 0, 0), cell("real", 0.2, 0.3)] } };
    expect(heatCells(body).cells).toEqual([
      { geohash: "real", lat: 40.72, lng: -73.95, affinityRank: 0.2, popularity: 0.3 },
      { geohash: "empty", lat: 40.72, lng: -73.95, affinityRank: 0.64, popularity: 0, noRead: true },
    ]);
  });

  it("caps a city sized answer and counts what it left off", () => {
    const heatmap = Array.from({ length: MAX_HEAT_CELLS + 3 }, (_, i) => cell(`g${i}`, i / (MAX_HEAT_CELLS + 3)));
    const { cells, dropped } = heatCells({ results: { heatmap } });
    expect(cells).toHaveLength(MAX_HEAT_CELLS);
    expect(dropped).toBe(3);
  });
});

describe("venueHeat", () => {
  it("maps where the taste for the venue runs strongest inside 2 km", async () => {
    const { run, ctx, calls } = stepSetup();
    const { layer, limits } = await venueHeat(run, ctx);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      "filter.location": "POINT(-73.958 40.721)",
      "filter.location.radius": "2000",
      "filter.type": "urn:heatmap",
      "signal.interests.entities": VENUE_ID,
    });
    expect(layer?.label).toBe("Where the taste for Cafe Lumen runs strongest");
    expect(layer?.cells.map((c) => [c.affinityRank, c.noRead ?? false])).toEqual([[1, false], [0.8745, false], [0.4129, false], [0.303, false], [0.3508, true]]);
    expect(limits).toEqual([]);
  });

  it("says when the map came back empty", async () => {
    const { run, ctx } = stepSetup([answer(isHeat, { success: true, results: { heatmap: [] } })]);
    expect(await venueHeat(run, ctx)).toEqual({ layer: null, limits: ["The heatmap for Cafe Lumen's audience came back with no cells around Cafe Lumen."] });
  });
});

describe("conceptHeat", () => {
  it("uses the venue's own place concepts as one union signal", async () => {
    const { run, ctx, calls } = stepSetup();
    const { layer } = await conceptHeat(run, ctx, CONCEPTS);
    const p = calls[0]!.url.searchParams;
    expect(p.get("signal.interests.tags")).toBe("urn:tag:genre:place:cafe,urn:tag:genre:place:book_store");
    expect(p.get("operator.signal.interests.tags")).toBe("union");
    expect(p.has("signal.interests.entities")).toBe(false);
    expect(layer?.label).toBe("Where places like Cafe Lumen run strongest");
    expect(layer?.cells).toHaveLength(fixture("heatmap_street").results.heatmap.length);
  });

  it("makes no call without concept tags", async () => {
    const { run, ctx, calls } = stepSetup();
    expect(await conceptHeat(run, ctx, [])).toEqual({ layer: null, limits: [] });
    expect(calls).toHaveLength(0);
  });
});
