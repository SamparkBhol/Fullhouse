import { parseWktPoint } from "./location.ts";

export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

export type Params = Record<string, string | string[]>;

const LAT_LON = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
const WKT = /^\s*(POINT|POLYGON|MULTIPOLYGON)\s*\(/i;
const SECRET_PARAM = /key|token|secret|password/i;

function one(params: Params, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

function insightsProblem(params: Params): string | null {
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

function searchProblem(params: Params): string | null {
  const loc = one(params, "filter.location");
  if (loc !== undefined && WKT.test(loc)) return "filter.location on /search takes lat,lon, not WKT";
  const radius = one(params, "filter.radius");
  if (radius !== undefined && !(Number(radius) >= 0 && Number(radius) <= 100)) return "filter.radius on /search is 0 to 100 miles";
  return null;
}

function trendingProblem(params: Params): string | null {
  const ids = params["signal.interests.entities"];
  const count = Array.isArray(ids) ? ids.length : typeof ids === "string" ? ids.split(",").length : 0;
  return count === 1 ? null : "trending takes exactly one entity in signal.interests.entities";
}

export function checkParams(path: string, params: Params): string | null {
  const take = one(params, "take");
  if (take !== undefined && (!/^\d+$/.test(take) || Number(take) < 1 || Number(take) > 50)) return "take must be between 1 and 50";
  if (path === "/v2/insights") return insightsProblem(params);
  if (path === "/search") return searchProblem(params);
  if (path === "/v2/trending") return trendingProblem(params);
  return null;
}

export function cleanParams(params: Params): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const key of Object.keys(params).sort()) {
    if (SECRET_PARAM.test(key)) continue;
    const raw = params[key];
    const values = (Array.isArray(raw) ? raw : [raw])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    if (values.length) out.push([key, values]);
  }
  return out;
}

// Arrays go as one comma joined value; repeating the key is refused with HTTP 400.
export function buildQuery(params: Params): string {
  const sp = new URLSearchParams();
  for (const [key, values] of cleanParams(params)) sp.append(key, values.join(","));
  return sp.toString();
}

export function buildUrl(baseUrl: string, path: string, params: Params): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new RangeError(`Invalid Qloo path ${path}`);
  }
  const base = baseUrl.replace(/\/+$/, "");
  const qs = buildQuery(params);
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

export function provenanceParams(params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, values] of cleanParams(params)) out[key] = values.join(",");
  return out;
}
