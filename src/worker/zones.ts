import { zonedToUtc } from "../core/index.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;

// Plan dates and times are strings in the venue's zone; the conversion itself lives in the planner.
export function localToUtc(date: string, time: string, tz: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new Error(`bad local time ${date} ${time}`);
  return zonedToUtc(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]), tz);
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
  const start = localToUtc(night.date, night.start, tz);
  const endDate = minutesOf(night.end) <= minutesOf(night.start) ? addDays(night.date, 1) : night.date;
  const end = localToUtc(endDate, night.end, tz);
  return { start, end };
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
