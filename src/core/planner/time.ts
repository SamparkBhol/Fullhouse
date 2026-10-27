import type { QuietSlot } from "../../shared/contract.ts";

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function safeTz(tz: string): string {
  return isValidTimeZone(tz) ? tz : "UTC";
}

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(instant: Date, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(safeTz(tz)).formatToParts(instant)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
  };
}

export function tzOffsetMs(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const zone = safeTz(tz);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = tzOffsetMs(new Date(guess), zone);
  let t = guess - first;
  const second = tzOffsetMs(new Date(t), zone);
  if (second !== first) t = guess - second;
  return new Date(t);
}

export function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(typeof s === "string" ? s.trim() : "");
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function hhmm(totalMin: number): string {
  const t = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function ymd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

export function nextSlotDate(slot: QuietSlot, tz: string, now: Date): { date: string; start: string; end: string } {
  const start = parseHHMM(slot.start) ?? { h: 19, m: 0 };
  const startMin = start.h * 60 + start.m;
  const duration = Number.isFinite(slot.durationMin) && slot.durationMin > 0 ? Math.min(slot.durationMin, 720) : 180;
  const local = localParts(now, tz);
  const nowMin = local.hour * 60 + local.minute;
  let add = (slot.weekday - local.weekday + 7) % 7;
  if (add === 0 && nowMin >= startMin) add = 7;
  return {
    date: ymd(local.year, local.month, local.day + add),
    start: hhmm(startMin),
    end: hhmm(startMin + duration),
  };
}

export function nextMondayNine(tz: string, now: Date): Date {
  const local = localParts(now, tz);
  let add = (1 - local.weekday + 7) % 7;
  for (let tries = 0; tries < 3; tries++) {
    const d = new Date(Date.UTC(local.year, local.month - 1, local.day + add));
    const at = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 9, 0, tz);
    if (at.getTime() > now.getTime()) return at;
    add += 7;
  }
  return new Date(now.getTime() + 7 * 86400000);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function weekdayName(n: number): string {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7] ?? "Sunday";
}

export function describeDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

export { WEEKDAY_NAMES, MONTH_NAMES };
