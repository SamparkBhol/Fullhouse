import type { LovedPlace, OpeningSpan } from "../../shared/contract.ts";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function minutes(hhmm: string | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function spansOn(p: Pick<LovedPlace, "hours">, weekday: number): OpeningSpan[] | null {
  if (!p.hours) return null;
  return p.hours[DAY_KEYS[weekday] ?? ""] ?? null;
}

// A span that closes at or before it opens runs past midnight, so it is still open at the start of the night.
function openAt(span: OpeningSpan, start: number): boolean {
  if (span.closed) return false;
  const opens = minutes(span.opens);
  const closes = minutes(span.closes);
  if (closes === null) return true;
  if (opens !== null && closes <= opens) return true;
  return closes > start;
}

export type HoursVerdict = "open" | "closed" | "unknown";

export function hoursVerdict(p: Pick<LovedPlace, "hours">, weekday: number, start: string): HoursVerdict {
  const spans = spansOn(p, weekday);
  if (!spans || !spans.length) return "unknown";
  const at = minutes(start) ?? 0;
  return spans.some((s) => openAt(s, at)) ? "open" : "closed";
}

export function hoursLine(p: Pick<LovedPlace, "hours">, weekday: number): string | null {
  const spans = (spansOn(p, weekday) ?? []).filter((s) => !s.closed && s.opens && s.closes);
  if (!spans.length) return null;
  return `Open ${DAY_PLURAL[weekday]} ${spans.map((s) => `${s.opens} to ${s.closes}`).join(" and ")}`;
}
