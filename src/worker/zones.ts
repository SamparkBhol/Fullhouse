const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;

export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
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
    });
    formatters.set(tz, f);
  }
  return f;
}

function offsetMs(utcMs: number, tz: string): number {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) % 24,
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function zonedToUtc(date: string, time: string, tz: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new Error(`bad local time ${date} ${time}`);
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const first = offsetMs(guess, tz);
  let utc = guess - first;
  const second = offsetMs(utc, tz);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

export function addDays(date: string, days: number): string {
  const d = DATE_RE.exec(date);
  if (!d) return date;
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function minutesOf(time: string): number {
  const t = TIME_RE.exec(time);
  return t ? Number(t[1]) * 60 + Number(t[2]) : 0;
}

export interface NightWindow {
  start: Date;
  end: Date;
}

export function nightWindow(night: { date: string; start: string; end: string }, tz: string): NightWindow {
  const start = zonedToUtc(night.date, night.start, tz);
  const endDate = minutesOf(night.end) <= minutesOf(night.start) ? addDays(night.date, 1) : night.date;
  const end = zonedToUtc(endDate, night.end, tz);
  return { start, end };
}

// The plan date is already a calendar date in the venue zone, so it is formatted as a plain UTC date.
export function longDate(date: string): string {
  const d = DATE_RE.exec(date);
  if (!d) return date;
  const noon = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 12);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(noon),
  );
}

export function compactUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function eventbriteUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function secondsToUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
