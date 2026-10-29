import type { LovedPlace, QuietSlot } from "../../shared/contract.ts";
import { shortName as plainName } from "../../shared/words.ts";
import { dayVerdict } from "../../shared/hours.ts";
import { DAY_PLURAL, hoursVerdict, type HoursVerdict } from "./hours.ts";
import { describeDate, nextSlotDate } from "./time.ts";

export interface DayCheck {
  place: Pick<LovedPlace, "hours" | "name">;
  // The time this place has to be open, which is its own stop's start on a two stop night.
  start: string;
  role: "venue" | "partner";
}

export interface DayChoice {
  date: string;
  weekday: QuietSlot["weekday"];
  asked: QuietSlot["weekday"];
  moved: boolean;
  // A sentence for the owner when the day moved, when hours are not listed, or when no day works.
  note: string | null;
}

const WEEKEND = new Set([0, 6]);
const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
}

function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function verdictFor(c: DayCheck, weekday: number): HoursVerdict {
  return c.role === "venue" ? dayVerdict(c.place, weekday) : hoursVerdict(c.place, weekday, c.start);
}

function verdicts(checks: DayCheck[], weekday: number): HoursVerdict[] {
  return checks.map((c) => verdictFor(c, weekday));
}

interface Option {
  date: string;
  weekday: QuietSlot["weekday"];
  away: number;
}

// Every weekday once, on its first date with two days' notice, and the week after so a day just before the quiet one can still win.
function options(slot: QuietSlot, tz: string, now: Date, base: string): Option[] {
  const out: Option[] = [];
  for (let w = 0; w < 7; w++) {
    const first = nextSlotDate({ ...slot, weekday: w as QuietSlot["weekday"] }, tz, now).date;
    for (const date of [first, plusDays(first, 7)]) out.push({ date, weekday: w as QuietSlot["weekday"], away: dayNumber(date) - dayNumber(base) });
  }
  return out;
}

export interface DayOption {
  date: string;
  weekday: QuietSlot["weekday"];
}

// The other evenings to move to, nearest first and Monday to Friday before the weekend when the quiet day is a weekday.
export function otherDays(slot: QuietSlot, tz: string, now: Date): DayOption[] {
  const base = nextSlotDate(slot, tz, now).date;
  const weekendPenalty = (o: Option) => (WEEKEND.has(o.weekday) && !WEEKEND.has(slot.weekday) ? 1 : 0);
  return options(slot, tz, now, base)
    .filter((o) => o.weekday !== slot.weekday)
    .sort((a, b) => weekendPenalty(a) - weekendPenalty(b) || Math.abs(a.away) - Math.abs(b.away) || b.away - a.away)
    .filter((o, i, all) => all.findIndex((x) => x.weekday === o.weekday) === i)
    .map((o) => ({ date: o.date, weekday: o.weekday }));
}

function closedNote(checks: DayCheck[], shut: HoursVerdict[], asked: number, to: Option): string {
  const who = checks.filter((_, i) => shut[i] === "closed");
  const one = who[0];
  const names = who.length > 1 ? `${plainName(who[0]!.place.name)} and ${plainName(who[1]!.place.name)} are` : `${plainName(one?.place.name ?? "One place")} is`;
  const at = who.length > 1 || one?.role === "venue" ? "" : ` at ${one?.start ?? ""}`;
  return `${names} not open on ${DAY_PLURAL[asked]}${at}, so the night moves to ${describeDate(to.date)}, the nearest evening both places are open.`;
}

function uncheckedNote(checks: DayCheck[], date: string): string | null {
  const unknown = checks.filter((c) => c.role === "partner" && verdictFor(c, dayOfWeek(date)) === "unknown");
  if (!unknown.length) return null;
  const name = plainName(unknown[0]!.place.name);
  return `${name} has no opening hours listed, so check ${name} is open on ${describeDate(date)} before you ask.`;
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

// The quiet weekday when nobody is known to be closed then; otherwise the nearest evening, Monday to Friday first,
// when every place is open at its start. A place with no listed hours never moves the night.
export function chooseDay(slot: QuietSlot, tz: string, now: Date, checks: DayCheck[]): DayChoice {
  const base = nextSlotDate(slot, tz, now).date;
  const asked = slot.weekday;
  const here = verdicts(checks, asked);
  if (!here.includes("closed")) return { date: base, weekday: asked, asked, moved: false, note: uncheckedNote(checks, base) };
  const weekendPenalty = (o: Option) => (WEEKEND.has(o.weekday) && !WEEKEND.has(asked) ? 1 : 0);
  const best = options(slot, tz, now, base)
    .filter((o) => o.weekday !== asked && !verdicts(checks, o.weekday).includes("closed"))
    .sort((a, b) => weekendPenalty(a) - weekendPenalty(b) || Math.abs(a.away) - Math.abs(b.away) || b.away - a.away)[0];
  if (!best) {
    const start = checks.find((c) => c.role === "partner")?.start ?? slot.start;
    return {
      date: base,
      weekday: asked,
      asked,
      moved: false,
      note: `By their listed hours the two places are never open together at ${start}, so pick another start time before you ask.`,
    };
  }
  const note = closedNote(checks, here, asked, best);
  const unchecked = uncheckedNote(checks, best.date);
  return { date: best.date, weekday: best.weekday, asked, moved: true, note: unchecked ? `${note} ${unchecked}` : note };
}
