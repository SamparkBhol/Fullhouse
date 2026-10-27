export const MAX_RADIUS_M = 800000;
export const MAX_SEARCH_MILES = 100;

function fmtCoord(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

export function checkLatLng(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError(`Invalid coordinates lat=${lat} lng=${lng}`);
  }
}

// Insights wants WKT with longitude first; a "lat,lon" pair is refused there.
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

export function clampRadius(radiusM: number): number {
  if (!Number.isFinite(radiusM)) throw new RangeError("Radius must be a number of meters");
  return Math.min(MAX_RADIUS_M, Math.max(1, Math.round(radiusM)));
}

// A POINT without a radius matches only the place sitting on that exact point.
export function locationFilter(lat: number, lng: number, radiusM: number): Record<string, string> {
  return { "filter.location": wktPoint(lat, lng), "filter.location.radius": String(clampRadius(radiusM)) };
}

// signal.location.radius is left out: it overrides Qloo's density discovery and changed nothing useful.
export function locationSignal(lat: number, lng: number): Record<string, string> {
  return { "signal.location": wktPoint(lat, lng) };
}

// /search is the opposite of insights: "lat,lon" only, radius in miles.
export function searchNear(lat: number, lng: number, miles: number): Record<string, string> {
  checkLatLng(lat, lng);
  const r = Math.min(MAX_SEARCH_MILES, Math.max(0, miles));
  return { "filter.location": `${fmtCoord(lat)},${fmtCoord(lng)}`, "filter.radius": String(r) };
}
