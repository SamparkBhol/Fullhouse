import { describe, expect, it } from "vitest";
import type { StreetTag } from "../../../src/shared/contract.ts";
import { MAX_HEAT_CELLS, heatCells, streetHeat, venueHeat } from "../../../src/core/street/steps/heat.ts";
import { VENUE_ID, fixture } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isHeat = (p: URLSearchParams) => p.get("filter.type") === "urn:heatmap";
const TOP: StreetTag[] = [
  { id: "urn:tag:genre:music:jazz", name: "Jazz", namespace: "urn:tag:genre:music", rank: 1 },
  { id: "urn:tag:ambience:qloo:intimate", name: "Intimate", namespace: "urn:tag:ambience:qloo", rank: 2 },
];

function cell(geohash: string, rank: number | null, popularity: number | null = 0.5) {
  return { location: { latitude: 40.72, longitude: -73.95, geohash }, query: { affinity: rank, affinity_rank: rank, popularity } };
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
    expect(layer?.cells.map((c) => c.affinityRank)).toEqual([1, 0.8745, 0.4129, 0.303, 0]);
    expect(limits).toEqual([]);
  });

  it("says when the map came back empty", async () => {
    const { run, ctx } = stepSetup([answer(isHeat, { success: true, results: { heatmap: [] } })]);
    expect(await venueHeat(run, ctx)).toEqual({ layer: null, limits: ["The heatmap for Cafe Lumen's audience came back with no cells around Cafe Lumen."] });
  });
});

describe("streetHeat", () => {
  it("uses the top street tags as one union signal", async () => {
    const { run, ctx, calls } = stepSetup();
    const { layer } = await streetHeat(run, ctx, TOP);
    const p = calls[0]!.url.searchParams;
    expect(p.get("signal.interests.tags")).toBe("urn:tag:genre:music:jazz,urn:tag:ambience:qloo:intimate");
    expect(p.get("operator.signal.interests.tags")).toBe("union");
    expect(p.has("signal.interests.entities")).toBe(false);
    expect(layer?.label).toBe("Where Jazz and Intimate run strongest");
    expect(layer?.cells).toHaveLength(fixture("heatmap_street").results.heatmap.length);
  });

  it("makes no call without street tags", async () => {
    const { run, ctx, calls } = stepSetup();
    expect(await streetHeat(run, ctx, [])).toEqual({ layer: null, limits: [] });
    expect(calls).toHaveLength(0);
  });
});
