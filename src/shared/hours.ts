import type { OpeningSpan } from "./contract.ts";

export const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const DAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type Week = Record<string, OpeningSpan[]>;

// Qloo lists Veselka and the Donut Pub, both open around the clock, as closed on all seven days.
// A week with no open day is a gap in the listing, not a place that never opens.
export function listedHours(p: { hours?: Week }): Week | null {
  const h = p.hours;
  if (!h) return null;
  const days = DAY_KEYS.map((k) => h[k] ?? []);
  if (!days.some((spans) => spans.length)) return null;
  if (days.every((spans) => spans.length > 0 && spans.every((s) => s.closed))) return null;
  return h;
}

export function spansOn(p: { hours?: Week }, weekday: number): OpeningSpan[] | null {
  return listedHours(p)?.[DAY_KEYS[weekday] ?? ""] ?? null;
}

function minutes(hhmm: string | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// A span that closes at or before it opens runs past midnight.
function openAt(span: OpeningSpan, start: number): boolean {
  if (span.closed) return false;
  const opens = minutes(span.opens);
  const closes = minutes(span.closes);
  if (closes === null) return true;
  if (opens !== null && closes <= opens) return opens <= start || closes > start;
  return (opens === null || opens <= start) && closes > start;
}

export type HoursVerdict = "open" | "closed" | "unknown";

export function hoursVerdict(p: { hours?: Week }, weekday: number, start: string): HoursVerdict {
  const spans = spansOn(p, weekday);
  if (!spans || !spans.length) return "unknown";
  const at = minutes(start) ?? 0;
  return spans.some((s) => openAt(s, at)) ? "open" : "closed";
}

// Whether a place trades at all that day. The venue's own night can run after its listed closing time,
// so for the venue only a day it is shut counts.
export function dayVerdict(p: { hours?: Week }, weekday: number): HoursVerdict {
  const spans = spansOn(p, weekday);
  if (!spans || !spans.length) return "unknown";
  return spans.some((s) => !s.closed) ? "open" : "closed";
}

export function closesBefore(p: { hours?: Week }, weekday: number, start: string): string | null {
  const spans = (spansOn(p, weekday) ?? []).filter((s) => !s.closed && s.closes);
  const at = minutes(start) ?? 0;
  if (!spans.length || spans.some((s) => openAt(s, at))) return null;
  const last = spans.map((s) => s.closes as string).sort().at(-1);
  return last ?? null;
}

export function hoursLine(p: { hours?: Week }, weekday: number): string | null {
  const spans = (spansOn(p, weekday) ?? []).filter((s) => !s.closed && s.opens && s.closes);
  if (!spans.length) return null;
  return `Open ${DAY_PLURAL[weekday]} ${spans.map((s) => `${s.opens} to ${s.closes}`).join(" and ")}`;
}
