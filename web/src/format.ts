import type { NightFormat, QuietSlot, Trend, VerifyStatus } from "../../src/shared/contract.ts";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// QuietSlot.weekday follows Date.getDay(): 0 is Sunday.
export const WEEKDAY_ORDER: QuietSlot["weekday"][] = [1, 2, 3, 4, 5, 6, 0];

export function weekdayName(day: number): string {
  return WEEKDAYS[day] ?? "that day";
}

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

export function formatName(format: NightFormat): string {
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

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export const TREND_WORDS: Record<Trend, string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling",
  unknown: "No trend data",
};

export const VERIFY_WORDS: Record<VerifyStatus, string> = {
  found_nearby: "Found near you",
  found_far: "Found, but not nearby",
  not_found: "Not found in Qloo",
};

export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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

export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

export function prettyTag(name: string): string {
  if (!name) return name;
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
