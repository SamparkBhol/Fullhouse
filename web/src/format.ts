import type { NightFormat, QlooType, QuietSlot, Trend } from "../../src/shared/contract.ts";
import { weekdayName } from "../../src/shared/words.ts";

// QuietSlot.weekday follows Date.getDay(): 0 is Sunday.
export const WEEKDAY_ORDER: QuietSlot["weekday"][] = [1, 2, 3, 4, 5, 6, 0];

export function pluralWeekday(day: number): string {
  return `${weekdayName(day)}s`;
}

export const FORMAT_NAMES: Record<NightFormat, string> = {
  listening: "Listening night",
  film: "Film night",
  quiz: "Quiz night",
  book: "Book night",
  games: "Game night",
  podcast: "Podcast listening night",
  tasting: "Tasting night",
};

// A TV show is watched an episode at a time, so its night is a watch night rather than a film night.
export function formatName(format: NightFormat, featureType?: QlooType): string {
  if (format === "film" && featureType === "tv_show") return "Watch night";
  return FORMAT_NAMES[format] ?? "Night";
}

function dateFromDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

export function longDate(day: string): string {
  const d = dateFromDay(day);
  if (!d) return day;
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

export function shortDate(day: string): string {
  const d = dateFromDay(day);
  if (!d) return day;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function dayOnly(day: string): string {
  const d = dateFromDay(day);
  if (!d) return day;
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);
}

export function hours(start: string, end: string): string {
  return `${start} to ${end}`;
}

export function slotShort(slot: QuietSlot): string {
  const h = slot.durationMin / 60;
  const length = Number.isInteger(h) ? `${h} hour${h === 1 ? "" : "s"}` : `${slot.durationMin} minutes`;
  return `${pluralWeekday(slot.weekday)} from ${slot.start}, ${length}`;
}

export function slotLine(slot: QuietSlot): string {
  return `Quiet on ${slotShort(slot)}`;
}

function safeZone(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function moment(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: safeZone(tz),
  }).format(d).replace(" at ", ", ");
}

export function todayIn(tz: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: safeZone(tz),
  }).format(new Date());
  return parts.slice(0, 10);
}

export function distance(m: number): string {
  if (!Number.isFinite(m)) return "distance unknown";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function walk(m: number): string {
  if (!Number.isFinite(m)) return "";
  const minutes = Math.max(1, Math.round(m / 80));
  return `about ${minutes} minute${minutes === 1 ? "" : "s"} on foot`;
}

export function walkMinutes(m: number): number | null {
  return Number.isFinite(m) ? Math.max(1, Math.round(m / 80)) : null;
}

export function walkShort(m: number): string {
  const n = walkMinutes(m);
  return n === null ? "Walk unknown" : `${n} min walk`;
}

export const TREND_WORDS: Record<Trend, string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling",
  unknown: "No trend data",
};


export function prettyTag(name: string): string {
  const spaced = name.replace(/_/g, " ").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
