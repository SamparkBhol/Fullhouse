import type { KindGroup, NightStop, VenueCandidate } from "../../shared/contract.ts";
import { hoursVerdict, spansOn, type HoursVerdict } from "../../shared/hours.ts";
import { shortName } from "../../shared/words.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { hhmm, parseHHMM } from "../planner/time.ts";
import { activityText, serves, type Activity, type StopPicks } from "./activity.ts";
import type { PairFormatDef } from "./grammar.ts";

export interface Side {
  at: "venue" | "partner";
  place: Pick<VenueCandidate, "id" | "name" | "hours" | "tags">;
  group: KindGroup | null;
}

const SLOT = 15;
// A stop has to be open when people arrive and still open three quarters of an hour later.
export const HOLD_MIN = 45;

function closing(p: Side["place"], weekday: number): number | null {
  const spans = (spansOn(p, weekday) ?? []).filter((s) => !s.closed && s.closes);
  const t = spans.map((s) => parseHHMM(s.closes as string)).filter((x): x is { h: number; m: number } => x !== null);
  if (!t.length) return null;
  // A close after midnight is late, not early.
  return Math.max(...t.map((x) => (x.h < 6 ? 24 + x.h : x.h) * 60 + x.m));
}

// The place suited to the main activity opens the night. With no main activity, the place that shuts first goes first,
// so nobody is turned out of the second stop early.
export function order(def: PairFormatDef, venue: Side, partner: Side, weekday: number): [Side, Side] {
  if (def.opens) return partner.group === def.opens && venue.group !== def.opens ? [partner, venue] : [venue, partner];
  const v = closing(venue.place, weekday);
  const p = closing(partner.place, weekday);
  return v !== null && p !== null && p < v ? [partner, venue] : [venue, partner];
}

export function activityAt(def: PairFormatDef, side: Side, pos: 0 | 1): Activity {
  if (!def.opens) return pos === 0 ? def.main : def.other;
  return side.group === def.opens ? def.main : def.other;
}

// The other place may go first only when all it does is serve, so the main activity still has its room after.
export function canSwap(def: PairFormatDef, venue: Side, partner: Side): boolean {
  if (!def.opens) return true;
  const other = venue.group === def.opens ? partner : venue;
  return serves(activityAt(def, other, 1)) || activityAt(def, other, 1) === "meet";
}

export interface Timed {
  start: number;
  end: number;
}

// First stop from the start, then the walk rounded up to the next quarter hour, then the second stop,
// which runs to the end of the slot or for its own least length, whichever is later.
export function timeline(firstMin: number, secondMin: number, start: number, durationMin: number, distanceM: number): [Timed, Timed] {
  const e1 = start + firstMin;
  const walk = walkMinutes(distanceM);
  const s2 = e1 + Math.max(SLOT, Math.ceil(walk / SLOT) * SLOT);
  const e2 = Math.max(s2 + secondMin, start + (durationMin > 0 ? durationMin : 180));
  return [
    { start, end: e1 },
    { start: s2, end: e2 },
  ];
}

// Minutes after midnight, with an evening that runs past midnight kept on the same day.
export function clock(min: number): string {
  return hhmm(((min % 1440) + 1440) % 1440);
}

export function openFor(p: Side["place"], weekday: number, t: Timed): HoursVerdict {
  const first = hoursVerdict(p, weekday, clock(t.start));
  if (first !== "open") return first;
  const later = t.start + Math.min(HOLD_MIN, Math.max(0, t.end - t.start - SLOT));
  return hoursVerdict(p, weekday, clock(later));
}

export interface Arranged {
  first: Side;
  second: Side;
  times: [Timed, Timed];
  // The serving place goes first because it shuts before the main activity ends.
  swapped: boolean;
}

export function stopsOf(def: PairFormatDef, a: Arranged, picks: StopPicks, distanceM: number, afterHours: Set<string>): NightStop[] {
  const acts: [Activity, Activity] = !def.opens
    ? [def.main, def.other]
    : a.swapped
      ? [activityAt(def, a.first, 1), activityAt(def, a.second, 0)]
      : [activityAt(def, a.first, 0), activityAt(def, a.second, 1)];
  const sides = [a.first, a.second];
  return sides.map((side, i) => {
    const t = a.times[i]!;
    const stop: NightStop = {
      at: side.at,
      placeId: side.place.id,
      name: shortName(side.place.name),
      start: clock(t.start),
      end: clock(t.end),
      what: activityText(acts[i]!, side.place, picks, i === 0 ? "first" : "second"),
    };
    if (i === 0) stop.walkMin = walkMinutes(distanceM);
    if (afterHours.has(side.at)) stop.afterHours = true;
    return stop;
  });
}

// The main activity of the night: the book club, the screening, the first quiz round or the show.
export function mainStop(def: PairFormatDef, stops: NightStop[], a: Arranged): NightStop | undefined {
  return def.opens && a.swapped ? stops[1] : stops[0];
}
