import { parseWktPoint } from "./location.ts";
import type { Params } from "./request.ts";
import { TRENDING_TYPES } from "./trending.ts";
import { TYPE_URN } from "./urns.ts";

const LAT_LON = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
const WKT = /^\s*(POINT|POLYGON|MULTIPOLYGON)\s*\(/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const INSIGHTS_TYPES = new Set([...Object.values(TYPE_URN), "urn:tag", "urn:demographics", "urn:heatmap"]);
const TRENDING_URNS = new Set(TRENDING_TYPES.map((t) => TYPE_URN[t]));
// Both answer HTTP 400 "does not yet support trending requests" when bias.trends is sent.
const NO_TREND_BIAS = new Set([TYPE_URN.book, TYPE_URN.videogame]);

function one(params: Params, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

function count(params: Params, key: string): number {
  const v = params[key];
  if (Array.isArray(v)) return v.filter((s) => s.trim() !== "").length;
  return typeof v === "string" && v.trim() !== "" ? v.split(",").length : 0;
}

function intIn(v: string | undefined, min: number, max: number): boolean {
  return v === undefined || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max);
}

function locationProblem(params: Params): string | null {
  for (const key of ["filter.location", "signal.location"]) {
    const loc = one(params, key);
    if (loc === undefined) continue;
    if (LAT_LON.test(loc)) return `${key} on insights takes WKT or a locality id, not a lat,lon pair`;
    if (/^\s*POINT/i.test(loc) && !parseWktPoint(loc)) return `${key} POINT must be WKT with longitude first`;
  }
  const filter = one(params, "filter.location");
  if (filter && /^\s*POINT/i.test(filter) && params["filter.location.radius"] === undefined) {
    return "filter.location POINT needs filter.location.radius or only the place on that point matches";
  }
  if (params["signal.location.radius"] !== undefined && !/^\s*POINT/i.test(one(params, "signal.location") ?? "")) {
    return "signal.location.radius only applies to a POINT";
  }
  return null;
}

function insightsProblem(params: Params): string | null {
  const type = one(params, "filter.type");
  if (!type) return "insights needs filter.type";
  if (!INSIGHTS_TYPES.has(type)) return `filter.type ${type} is not one the API accepts`;
  if (params["bias.trends"] !== undefined && NO_TREND_BIAS.has(type)) return `bias.trends is refused for ${type}`;
  const bySignal = count(params, "signal.interests.entities") + count(params, "signal.interests.tags") > 0;
  if (type === "urn:demographics" && !bySignal) return "demographics needs signal.interests.entities or signal.interests.tags; a location alone is refused";
  if (type === "urn:heatmap" && !bySignal) return "a heatmap needs signal.interests.entities or signal.interests.tags";
  if (type === "urn:heatmap" && !params["filter.location"] && !params["filter.location.query"]) return "a heatmap needs filter.location or filter.location.query";
  return locationProblem(params);
}

function searchProblem(params: Params): string | null {
  const loc = one(params, "filter.location");
  if (loc !== undefined && WKT.test(loc)) return "filter.location on /search takes lat,lon, not WKT";
  const radius = one(params, "filter.radius");
  if (radius !== undefined && !(Number(radius) >= 0 && Number(radius) <= 100)) return "filter.radius on /search is 0 to 100 miles";
  return null;
}

function trendingProblem(params: Params): string | null {
  if (count(params, "signal.interests.entities") !== 1) return "trending takes exactly one entity in signal.interests.entities";
  const type = one(params, "filter.type");
  if (!type || !TRENDING_URNS.has(type)) return `trending accepts only ${[...TRENDING_URNS].join(", ")}`;
  if (!DAY.test(one(params, "filter.start_date") ?? "") || !DAY.test(one(params, "filter.end_date") ?? "")) {
    return "trending needs filter.start_date and filter.end_date as YYYY-MM-DD";
  }
  return null;
}

// Each rule here is a request the hackathon host answered with HTTP 400 or with a misleading 200.
export function checkParams(path: string, params: Params): string | null {
  if (!intIn(one(params, "take"), 1, 50)) return "take must be between 1 and 50";
  if (!intIn(one(params, "page"), 1, 100)) return "page must be between 1 and 100";
  if (path === "/v2/insights") return insightsProblem(params);
  if (path === "/search") return searchProblem(params);
  if (path === "/v2/trending") return trendingProblem(params);
  return null;
}
