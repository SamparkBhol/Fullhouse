const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function geohashBounds(hash: string): Bounds | null {
  if (!hash || hash.length > 12) return null;
  let even = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  for (const ch of hash.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return null;
    for (let bit = 4; bit >= 0; bit -= 1) {
      const on = (idx >> bit) & 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (on) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return { south: latMin, west: lngMin, north: latMax, east: lngMax };
}

export function squareAround(lat: number, lng: number, sideM: number): Bounds {
  const dLat = sideM / 2 / 111320;
  const dLng = sideM / 2 / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

export function bearingWord(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const y = Math.sin(((toLng - fromLng) * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180);
  const x =
    Math.cos((fromLat * Math.PI) / 180) * Math.sin((toLat * Math.PI) / 180) -
    Math.sin((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.cos(((toLng - fromLng) * Math.PI) / 180);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const words = ["north", "north east", "east", "south east", "south", "south west", "west", "north west"];
  return words[Math.round(deg / 45) % 8] ?? "near";
}
