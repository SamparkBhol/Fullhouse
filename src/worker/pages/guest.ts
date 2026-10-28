import type { NightPlan } from "../../shared/contract.ts";
import { TYPE_PLURAL, TYPE_SINGULAR, ordinal } from "../../shared/words.ts";

// Guests get one plain line about where the night came from; the owner's reasons stay in the app.
export function guestLine(night: Pick<NightPlan, "feature">, venueName: string): string {
  const f = night.feature;
  if (f && f.venueSignal !== false) return `The ${TYPE_SINGULAR[f.type]} Qloo ranks ${ordinal(f.rank)} for people who like ${venueName}`;
  if (f) return `One of the ${TYPE_PLURAL[f.type]} Qloo returned for the area around ${venueName}`;
  return `Picked with Qloo taste data for people who like ${venueName}`;
}

// "America/New_York" reads as "New York time" on a page a guest sees.
export function zoneCity(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ").trim();
  return city ? `${city} time` : tz;
}
