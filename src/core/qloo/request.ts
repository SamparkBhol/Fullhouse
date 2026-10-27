import type { QlooType } from "../../shared/contract.ts";

export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

export type Params = Record<string, string | string[]>;
export type ArrayStyle = "comma" | "repeat";

export const TYPE_URN: Record<QlooType, string> = {
  place: "urn:entity:place",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  podcast: "urn:entity:podcast",
  videogame: "urn:entity:videogame",
  brand: "urn:entity:brand",
  person: "urn:entity:person",
  destination: "urn:entity:destination",
};

// The developer guide spells it video_game once; the OpenAPI enum and the schema page use videogame.
export const TYPE_URN_ALTERNATES: Partial<Record<QlooType, string[]>> = {
  videogame: ["urn:entity:video_game"],
};

const URN_TO_TYPE: Record<string, QlooType> = {
  "urn:entity:place": "place",
  "urn:entity:artist": "artist",
  "urn:entity:book": "book",
  "urn:entity:movie": "movie",
  "urn:entity:tv_show": "tv_show",
  "urn:entity:podcast": "podcast",
  "urn:entity:videogame": "videogame",
  "urn:entity:video_game": "videogame",
  "urn:entity:brand": "brand",
  "urn:entity:person": "person",
  "urn:entity:actor": "person",
  "urn:entity:author": "person",
  "urn:entity:director": "person",
  "urn:entity:destination": "destination",
};

export function typeFromUrn(urn: unknown): QlooType | null {
  if (typeof urn !== "string") return null;
  const lower = urn.toLowerCase();
  if (URN_TO_TYPE[lower]) return URN_TO_TYPE[lower] ?? null;
  const parts = lower.split(":");
  if (parts.length > 3) return URN_TO_TYPE[parts.slice(0, 3).join(":")] ?? null;
  return null;
}

function fmtCoord(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

export function checkLatLng(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError(`Invalid coordinates lat=${lat} lng=${lng}`);
  }
}

export function wktPoint(lat: number, lng: number): string {
  checkLatLng(lat, lng);
  return `POINT(${fmtCoord(lng)} ${fmtCoord(lat)})`;
}

export function parseWktPoint(wkt: string): { lat: number; lng: number } | null {
  const m = /^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i.exec(wkt);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lat, lng };
}

export const MAX_RADIUS_M = 800000;

export function clampRadius(radiusM: number): number {
  if (!Number.isFinite(radiusM)) throw new RangeError("Radius must be a number of meters");
  return Math.min(MAX_RADIUS_M, Math.max(1, Math.round(radiusM)));
}

export function locationFilter(lat: number, lng: number, radiusM: number): Params {
  return {
    "filter.location": wktPoint(lat, lng),
    "filter.location.radius": String(clampRadius(radiusM)),
  };
}

// Qloo recommends leaving signal.location.radius out so its density discovery picks the cell size.
export function locationSignal(lat: number, lng: number, radiusM?: number): Params {
  const out: Params = { "signal.location": wktPoint(lat, lng) };
  if (radiusM !== undefined) out["signal.location.radius"] = String(clampRadius(radiusM));
  return out;
}

export function searchNear(lat: number, lng: number, miles: number): Record<string, string> {
  checkLatLng(lat, lng);
  const r = Math.min(100, Math.max(0, miles));
  return { "filter.location": `${fmtCoord(lat)},${fmtCoord(lng)}`, "filter.radius": String(r) };
}

export function checkParams(params: Params): string | null {
  const loc = params["filter.location"];
  if (typeof loc === "string" && /^\s*POINT/i.test(loc)) {
    if (!parseWktPoint(loc)) return "filter.location POINT must be WKT with longitude first";
    if (params["filter.radius"] === undefined && params["filter.location.radius"] === undefined) {
      return "filter.location POINT needs filter.location.radius or nothing matches";
    }
  }
  const sig = params["signal.location"];
  if (typeof sig === "string" && /^\s*POINT/i.test(sig) && !parseWktPoint(sig)) {
    return "signal.location POINT must be WKT with longitude first";
  }
  if (params["signal.location.radius"] !== undefined && !(typeof sig === "string" && /^\s*POINT/i.test(sig))) {
    return "signal.location.radius only applies to a POINT";
  }
  const take = params["take"];
  if (typeof take === "string" && (!/^\d+$/.test(take) || Number(take) < 1 || Number(take) > 50)) {
    return "take must be between 1 and 50";
  }
  return null;
}

const SECRET_PARAM = /key|token|secret|password/i;

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

export function buildQuery(params: Params, arrays: ArrayStyle = "comma"): string {
  const sp = new URLSearchParams();
  for (const [key, values] of cleanParams(params)) {
    if (arrays === "repeat") for (const v of values) sp.append(key, v);
    else sp.append(key, values.join(","));
  }
  return sp.toString();
}

export function buildUrl(baseUrl: string, path: string, params: Params, arrays: ArrayStyle = "comma"): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new RangeError(`Invalid Qloo path ${path}`);
  }
  const base = baseUrl.replace(/\/+$/, "");
  const qs = buildQuery(params, arrays);
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

export function provenanceParams(params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, values] of cleanParams(params)) out[key] = values.join(",");
  return out;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function trendWindow(now: Date, weeks = 8): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - weeks * 7 * 86400000);
  return { start: isoDate(start), end: isoDate(end) };
}
