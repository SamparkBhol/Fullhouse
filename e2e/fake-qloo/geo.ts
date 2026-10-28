export interface Point {
  lat: number;
  lng: number;
}

const EARTH_M = 6371008.8;
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function metresBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function geohash(p: Point, precision: number): string {
  const lat = [-90, 90];
  const lng = [-180, 180];
  let out = "";
  let bits = 0;
  let value = 0;
  let even = true;
  while (out.length < precision) {
    const range = even ? lng : lat;
    const v = even ? p.lng : p.lat;
    const mid = ((range[0] as number) + (range[1] as number)) / 2;
    value <<= 1;
    if (v >= mid) {
      value |= 1;
      range[0] = mid;
    } else {
      range[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      out += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return out;
}

// Insights takes WKT with longitude first.
export function parseWktPoint(text: string): Point | null {
  const m = /^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i.exec(text);
  if (!m) return null;
  const p = { lng: Number(m[1]), lat: Number(m[2]) };
  return Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;
}

// /search takes "lat,lon" instead.
export function parseLatLon(text: string): Point | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const p = { lat: Number(m[1]), lng: Number(m[2]) };
  return Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;
}

export function offset(p: Point, northM: number, eastM: number): Point {
  const dLat = (northM / EARTH_M) * (180 / Math.PI);
  const dLng = (eastM / (EARTH_M * Math.cos((p.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}
