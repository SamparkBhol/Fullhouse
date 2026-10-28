import type { Query } from "../params.ts";
import { workTypeOf } from "../world/media.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { invalid, type Answer } from "./answer.ts";
import { demographics } from "./demographics.ts";
import { heatmap } from "./heatmap.ts";
import { placeInsights } from "./places.ts";
import { tagInsights } from "./tags.ts";
import { workInsights } from "./works.ts";

const LAT_LON = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;

export function insights(q: Query, places: PlaceRegistry): Answer {
  for (const key of ["filter.location", "signal.location"]) {
    if (LAT_LON.test(q.one(key) ?? "")) return invalid(`${key} must be a WKT geometry or a locality id`, key);
  }
  const type = q.one("filter.type");
  if (!type) return invalid("filter.type is required", "filter.type");
  if (type === "urn:tag") return tagInsights(q, places);
  if (type === "urn:heatmap") return heatmap(q, places);
  if (type === "urn:demographics") return demographics(q);
  if (type === "urn:entity:place") return placeInsights(q, places);
  const work = workTypeOf(type);
  if (work) return workInsights(work, q);
  return invalid(`filter.type ${type} is not supported`, "filter.type");
}
