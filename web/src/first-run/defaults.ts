import type { CreateVenueInput, VenueCandidate } from "../../../src/shared/contract.ts";
import { CITIES, MILE_M, NEAR_ME, cityNamed, type City } from "../../../src/shared/cities.ts";
import { haversineM } from "../../../src/shared/geo.ts";
import { DEFAULT_SLOT } from "../../../src/shared/engine.ts";
import { guessZone } from "../zone-guess.ts";

export { DEFAULT_SLOT };
export const DEFAULT_ROOM = 40;

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

// Zone names end in a city ("America/New_York"), which is the owner's most likely city. Region zones are skipped.
// A listed city in the same zone wins, so New York picks New York and not a namesake.
export function cityFromZone(zone = deviceZone()): string {
  const listed = CITIES.find((c) => c.tz === zone && zone.endsWith(c.name.replace(/ /g, "_")));
  if (listed) return listed.name;
  const parts = zone.split("/");
  if (parts.length < 2 || /^(Etc|SystemV|US|Canada)$/.test(parts[0] ?? "")) return "";
  return (parts[parts.length - 1] ?? "").replace(/_/g, " ");
}

// One tap creates the venue with the quiet night set to Tuesday 19:00 for three hours and room for 40, both marked as
// assumed until the owner sets the real ones while the read runs, or later in the venue settings.
export function venueDefaults(candidate: VenueCandidate, city: string, near?: { lat: number; lng: number }): CreateVenueInput {
  const here = deviceZone();
  const listed = zones();
  const known = cityNamed(city) ?? nearestCity(candidate);
  const tz = known?.tz ?? guessZone(candidate, city, listed.includes(here) ? listed : [here, ...listed]) ?? here;
  const name = known?.name ?? (city || NEAR_ME);
  return { candidate, city: name, tz, quietSlot: { ...DEFAULT_SLOT }, capacity: DEFAULT_ROOM, assumed: { slot: true, room: true }, ...(near ? { near } : {}) };
}

// A venue found near the owner sits in a listed city when it is inside that city's radius.
export function nearestCity(p: { lat: number; lng: number }): City | null {
  return CITIES.map((c) => ({ c, d: haversineM(p, c) })).filter((x) => x.d <= x.c.miles * MILE_M).sort((a, b) => a.d - b.d)[0]?.c ?? null;
}
