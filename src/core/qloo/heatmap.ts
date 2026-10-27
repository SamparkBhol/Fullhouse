import { resultRows } from "./results.ts";
import { num, obj, str } from "./values.ts";

export interface QCell {
  geohash: string;
  lat: number;
  lng: number;
  affinity: number | null;
  affinityRank: number | null;
  popularity: number | null;
}

// Cells carry location {latitude, longitude, geohash}, unlike entities, which use {lat, lon}.
// Per signal columns such as entity_place_affinity_rank repeat affinity_rank when there is one signal.
export function parseHeatmap(body: unknown): QCell[] {
  const out: QCell[] = [];
  for (const row of resultRows(body, "heatmap")) {
    const loc = obj(obj(row).location);
    const q = obj(obj(row).query);
    const lat = num(loc.latitude);
    const lng = num(loc.longitude);
    const geohash = str(loc.geohash);
    if (lat === null || lng === null || !geohash || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ geohash, lat, lng, affinity: num(q.affinity), affinityRank: num(q.affinity_rank), popularity: num(q.popularity) });
  }
  return out;
}
