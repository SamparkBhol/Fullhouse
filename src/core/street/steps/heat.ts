import type { HeatCell, HeatLayer, StreetTag } from "../../../shared/contract.ts";
import { listWords, plural, possessive } from "../../../shared/words.ts";
import { parseHeatmap } from "../../qloo/heatmap.ts";
import { locationFilter } from "../../qloo/location.ts";
import type { Params } from "../../qloo/request.ts";
import type { Runner } from "../runner.ts";
import type { ReadContext } from "./resolve.ts";

export const HEAT_RADIUS_M = 2000;
// A 2 km circle came back with up to about 800 cells; the cap only guards against a much larger answer.
export const MAX_HEAT_CELLS = 1000;

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Qloo answers affinity 0 and popularity 0 for a square it has no data for, sometimes with a non zero
// affinity_rank, so those two fields decide that a square has no read.
export function heatCells(body: unknown): { cells: HeatCell[]; dropped: number } {
  const cells: HeatCell[] = [];
  for (const c of parseHeatmap(body)) {
    if (c.affinityRank === null || c.popularity === null) continue;
    const cell: HeatCell = { geohash: c.geohash, lat: c.lat, lng: c.lng, affinityRank: round(c.affinityRank), popularity: round(c.popularity) };
    if (c.affinity === 0 && c.popularity === 0) cell.noRead = true;
    cells.push(cell);
  }
  cells.sort((a, b) => Number(Boolean(a.noRead)) - Number(Boolean(b.noRead)) || b.affinityRank - a.affinityRank || a.geohash.localeCompare(b.geohash));
  return { cells: cells.slice(0, MAX_HEAT_CELLS), dropped: Math.max(0, cells.length - MAX_HEAT_CELLS) };
}

interface LayerSpec {
  call: string;
  label: string;
  signal: Params;
  title: string;
  subject: string;
}

async function heatLayer(run: Runner, ctx: ReadContext, spec: LayerSpec): Promise<{ layer: HeatLayer | null; limits: string[] }> {
  const params = { "filter.type": "urn:heatmap", ...locationFilter(ctx.center.lat, ctx.center.lng, HEAT_RADIUS_M), ...spec.signal };
  const got = await run.call(spec.call, "/v2/insights", params, spec.label);
  if (!got) return { layer: null, limits: [] };
  const { cells, dropped } = heatCells(got.body);
  if (!cells.length) return { layer: null, limits: [`The heatmap for ${spec.subject} came back with no cells around ${ctx.name}.`] };
  const limits = dropped ? [`${plural(dropped, "weaker heatmap cell", "weaker heatmap cells")} for ${spec.subject} ${dropped === 1 ? "was" : "were"} left off the map.`] : [];
  return { layer: { label: spec.title, cells, provenance: got.ref }, limits };
}

// The venue as signal gives the map its contrast: affinity_rank spans 0 to 1 across the area.
export function venueHeat(run: Runner, ctx: ReadContext): Promise<{ layer: HeatLayer | null; limits: string[] }> {
  return heatLayer(run, ctx, {
    call: "heat_venue",
    label: "Venue heatmap",
    signal: { "signal.interests.entities": ctx.entityId },
    title: `Where the taste for ${ctx.name} runs strongest`,
    subject: `${possessive(ctx.name)} audience`,
  });
}

// The venue's own place concepts as signal answer whether that kind of place does well on this block or the
// next one over. Concept tags compress affinity_rank to about 0.6 to 1, so this layer is the weaker of the two.
export async function conceptHeat(run: Runner, ctx: ReadContext, concepts: StreetTag[]): Promise<{ layer: HeatLayer | null; limits: string[] }> {
  if (!concepts.length) return { layer: null, limits: [] };
  return heatLayer(run, ctx, {
    call: "heat_street",
    label: "Concept heatmap",
    signal: { "signal.interests.tags": concepts.map((t) => t.id), "operator.signal.interests.tags": "union" },
    title: `Where places like ${ctx.name} run strongest`,
    subject: `places tagged ${listWords(concepts.map((t) => t.name))}`,
  });
}
