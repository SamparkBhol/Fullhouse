import { readFileSync } from "node:fs";
import type { Match, NightPlan, PlanResponse, Rising, StreetRead, Venue } from "../../../src/shared/contract.ts";
import { planPair } from "../../../src/core/night/build.ts";

export interface LiveNight {
  venue: Venue;
  match: Match;
  joint: Rising[];
  read: StreetRead;
}

// The venue, its match and the joint picks as the live read of 29 October 2026 returned them.
export function liveNight(name: string): LiveNight {
  const raw = JSON.parse(readFileSync(new URL(`../../fixtures/live/${name}.json`, import.meta.url), "utf8"));
  const read: StreetRead = { venueId: raw.venue.id, center: { lat: raw.venue.entity.lat, lng: raw.venue.entity.lng }, radiusM: 1200, heat: [], streetTags: [], venueTags: [], shared: [], gaps: [], lovedPlaces: [], limits: [], ...raw.read };
  return { venue: raw.venue, match: raw.match, joint: raw.joint, read };
}

export const NOW = new Date("2026-10-29T16:00:00.000Z");

export function plan(n: LiveNight, input = {}, now = NOW): PlanResponse {
  let i = 0;
  return planPair(n.read, n.joint, n.venue, n.match, input, now, "owner", () => `night-${++i}`);
}

export function stopsText(p: NightPlan): string[] {
  return (p.pair?.stops ?? []).map((s) => `${s.start} to ${s.end} at ${s.name}: ${s.what}`);
}
