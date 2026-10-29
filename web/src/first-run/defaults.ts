import type { CreateVenueInput, VenueCandidate } from "../../../src/shared/contract.ts";
import { guessZone } from "../zone-guess.ts";

export const DEFAULT_SLOT = { weekday: 2, start: "19:00", durationMin: 180 } as const;
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
export function cityFromZone(zone = deviceZone()): string {
  const parts = zone.split("/");
  if (parts.length < 2 || /^(Etc|SystemV|US|Canada)$/.test(parts[0] ?? "")) return "";
  return (parts[parts.length - 1] ?? "").replace(/_/g, " ");
}

// One tap creates the venue with the quiet night set to Tuesday 19:00 for three hours and room for 40.
// All of it can be changed later in the venue settings.
export function venueDefaults(candidate: VenueCandidate, city: string): CreateVenueInput {
  const here = deviceZone();
  const listed = zones();
  const tz = guessZone(candidate, city, listed.includes(here) ? listed : [here, ...listed]) ?? here;
  return { candidate, city, tz, quietSlot: { ...DEFAULT_SLOT }, capacity: DEFAULT_ROOM };
}
