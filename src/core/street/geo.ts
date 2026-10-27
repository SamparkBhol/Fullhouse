const EARTH_RADIUS_M = 6371008.8;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function roundDistance(m: number): number {
  if (m < 100) return Math.max(10, Math.round(m / 10) * 10);
  return Math.round(m / 50) * 50;
}

export function describeDistance(m: number): string {
  const r = roundDistance(m);
  return r < 1000 ? `about ${r} m` : `about ${(r / 1000).toFixed(1)} km`;
}
