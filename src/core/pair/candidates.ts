import type { LovedPlace, QuietSlot, Venue } from "../../shared/contract.ts";
import { sameId } from "../qloo/values.ts";
import { canHost } from "../street/hosts.ts";
import { fitOf } from "./fit.ts";
import { rivals } from "./groups.ts";
import { notChecked } from "./reverse.ts";
import { sharedTaste } from "./taste.ts";

export { BACK_CHECKS, PAIR_CANDIDATES } from "../../shared/engine.ts";
import { PAIR_CANDIDATES } from "../../shared/engine.ts";

const TUESDAY: QuietSlot = { weekday: 2, start: "19:00", durationMin: 180 };

// Everything the fit score knows before asking Qloo again: crowd pull, the two kinds, the hours, the walk and the
// tags the two places carry. The loves you back calls go to the places this ranks highest.
export function preFit(p: LovedPlace, places: LovedPlace[], venue: Pick<Venue, "entity"> & Partial<Pick<Venue, "quietSlot">>): number {
  const v = { entity: venue.entity, quietSlot: venue.quietSlot ?? TUESDAY };
  return fitOf({ venue: v, partner: p, forward: { rank: p.rank, of: places.length, ref: null }, back: notChecked(p.id), taste: sharedTaste(venue.entity, p, places), tasteRef: null }).score;
}

// Places the venue's crowd loves that can host a night, best first by what is already known, ties in Qloo's order.
// Closed places never reach the read, and a place of the venue's own kind is after the same customers, so it is left out.
export function pairCandidates(places: LovedPlace[], venue: Pick<Venue, "entity"> & Partial<Pick<Venue, "quietSlot">>, n = PAIR_CANDIDATES): LovedPlace[] {
  return places
    .filter((p) => canHost(p) && !sameId(p.id, venue.entity.id) && !rivals(p, venue.entity))
    .map((p) => ({ p, score: preFit(p, places, venue) }))
    .sort((a, b) => b.score - a.score || a.p.rank - b.p.rank)
    .slice(0, n)
    .map((x) => x.p);
}
