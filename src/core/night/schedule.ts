import type { QuietSlot } from "../../shared/contract.ts";
import { dayVerdict, spansOn } from "../../shared/hours.ts";
import { otherDays, type DayOption } from "../planner/day.ts";
import { nextSlotDate, parseHHMM } from "../planner/time.ts";
import type { PairFormatDef } from "./grammar.ts";
import { canSwap, openFor, order, timeline, type Arranged, type Side } from "./stops.ts";

// A night can start up to an hour early to fit inside a shop's opening hours, never more.
export const EARLIER_STEPS = [30, 60];

export interface Fitting {
  arranged: Arranged;
  day: DayOption;
  // How much earlier than the quiet slot's start the night begins.
  earlier: number;
  // The venue runs its own part after its listed closing time.
  afterHours: boolean;
  // A place with no listed hours is in the night, so the owner should check them.
  unknown: Side[];
}

export interface Schedule {
  fitting: Fitting;
  // The quiet day the owner asked for, and whether the night left it.
  asked: QuietSlot["weekday"];
  moved: boolean;
  // Nothing fits by the listed hours, so the night stays on the quiet slot and says so.
  stuck: boolean;
  // The stops that would have been shut on the quiet slot in the night's natural order.
  blockers: Side[];
}

interface Try {
  day: DayOption;
  swap: boolean;
  earlier: number;
  late: boolean;
  // The show or film at the second stop has to start in time for people to stay for it.
  capped: boolean;
}

// A show or a film at the second stop starts by a quarter to ten, or the room is half empty by the end.
export const LAST_SECOND_START = 21 * 60 + 45;
const TIMED = new Set(["show", "set", "screening"]);

export interface Setup {
  def: PairFormatDef;
  venue: Side;
  partner: Side;
  slot: QuietSlot;
  distanceM: number;
}

function startOf(slot: QuietSlot): number {
  const t = parseHHMM(slot.start) ?? { h: 19, m: 0 };
  return t.h * 60 + t.m;
}

export function arrange(s: Setup, weekday: number, swap: boolean, earlier: number): Arranged {
  const [a, b] = order(s.def, s.venue, s.partner, weekday);
  const [first, second] = swap ? [b, a] : [a, b];
  const swapped = swap && Boolean(s.def.opens);
  const firstMin = swapped ? s.def.secondMin : s.def.firstMin;
  const secondMin = swapped ? s.def.firstMin : s.def.secondMin;
  const times = timeline(firstMin, secondMin, startOf(s.slot) - earlier, s.slot.durationMin, s.distanceM);
  return { first, second, times, swapped };
}

// Each place has to be open for its own stop. With late allowed, the venue may run its own part after hours on a day it trades.
export function attempt(s: Setup, t: Try): Fitting | null {
  const arranged = arrange(s, t.day.weekday, t.swap, t.earlier);
  const secondAct = s.def.opens && arranged.swapped ? s.def.main : s.def.other;
  if (t.capped && TIMED.has(secondAct) && arranged.times[1].start > LAST_SECOND_START) return null;
  const unknown: Side[] = [];
  let afterHours = false;
  for (const [i, side] of [arranged.first, arranged.second].entries()) {
    const v = openFor(side.place, t.day.weekday, arranged.times[i]!);
    if (v === "unknown") unknown.push(side);
    if (v !== "closed") continue;
    if (!t.late || side.at !== "venue" || dayVerdict(side.place, t.day.weekday) !== "open") return null;
    afterHours = true;
  }
  return { arranged, day: t.day, earlier: t.earlier, afterHours, unknown };
}

// The quiet slot first; then the nearest evening both are open; then up to an hour earlier; then the serving place first
// when it shuts before the main activity ends; and last, the venue opening late for its own part.
function pass(quiet: DayOption, others: DayOption[], swap: boolean, capped: boolean): Try[] {
  const t = (day: DayOption, s: boolean, earlier: number, late: boolean): Try => ({ day, swap: s, earlier, late, capped });
  const out: Try[] = [t(quiet, false, 0, false)];
  for (const day of others) out.push(t(day, false, 0, false));
  for (const earlier of EARLIER_STEPS) out.push(t(quiet, false, earlier, false));
  if (swap) {
    out.push(t(quiet, true, 0, false));
    for (const earlier of EARLIER_STEPS) out.push(t(quiet, true, earlier, false));
    for (const day of others) out.push(t(day, true, 0, false));
  }
  for (const day of [quiet, ...others]) {
    for (const earlier of [0, ...EARLIER_STEPS]) {
      out.push(t(day, false, earlier, true));
      if (swap) out.push(t(day, true, earlier, true));
    }
  }
  return out;
}

// Every arrangement with the show starting in good time first, then the same again without that.
function tries(quiet: DayOption, others: DayOption[], swap: boolean): Try[] {
  return [...pass(quiet, others, swap, true), ...pass(quiet, others, swap, false)];
}

function blockersOf(s: Setup, quiet: DayOption): Side[] {
  const a = arrange(s, quiet.weekday, false, 0);
  return [a.first, a.second].filter((side, i) => openFor(side.place, quiet.weekday, a.times[i]!) === "closed");
}

// The listed closing time that day; a close after midnight counts as the latest.
export function closesOn(side: Side, weekday: number): string | null {
  const closes = (spansOn(side.place, weekday) ?? []).filter((x) => !x.closed && x.closes).map((x) => x.closes as string);
  const late = (t: string) => (t < "06:00" ? `3${t}` : t);
  return closes.sort((a, b) => late(a).localeCompare(late(b))).at(-1) ?? null;
}

export function schedule(s: Setup, tz: string, now: Date): Schedule {
  const quiet: DayOption = { date: nextSlotDate(s.slot, tz, now).date, weekday: s.slot.weekday };
  const others = otherDays(s.slot, tz, now);
  const swap = canSwap(s.def, s.venue, s.partner);
  const blockers = blockersOf(s, quiet);
  for (const t of tries(quiet, others, swap)) {
    const fitting = attempt(s, t);
    if (fitting) return { fitting, asked: s.slot.weekday, moved: fitting.day.weekday !== s.slot.weekday, stuck: false, blockers };
  }
  const arranged = arrange(s, quiet.weekday, false, 0);
  return { fitting: { arranged, day: quiet, earlier: 0, afterHours: false, unknown: [] }, asked: s.slot.weekday, moved: false, stuck: true, blockers };
}

export type DayFit = "open" | "unknown" | "late" | "closed";

// How one evening of the week works for the pair, by each stop's own hours: the fit score's open together check.
export function dayFit(s: Setup, weekday: QuietSlot["weekday"]): DayFit {
  const day: DayOption = { date: "", weekday };
  const swap = canSwap(s.def, s.venue, s.partner);
  for (const t of tries(day, [], swap)) {
    const f = attempt(s, t);
    if (!f) continue;
    if (f.afterHours) return "late";
    return f.unknown.length ? "unknown" : "open";
  }
  return "closed";
}
