import type { NightPlan, NightStop, PartnerConfirmation, Venue } from "../../shared/contract.ts";
import { templateCopy } from "../copy/templates.ts";
import { parseHHMM, hhmm } from "../planner/time.ts";

const HOURS_NOTE = /lists no opening hours|Neither place lists opening hours/;

function minutes(t: string): number | null {
  const p = parseHHMM(t);
  return p ? p.h * 60 + p.m : null;
}

function movedStop(stop: NightStop, c: PartnerConfirmation): NightStop {
  const out: NightStop = { ...stop };
  if (c.what?.trim()) out.what = c.what.trim();
  const start = c.start ? minutes(c.start) : null;
  const was = minutes(stop.start);
  const end = minutes(stop.end);
  if (start !== null && was !== null && end !== null && start !== was) {
    out.start = hhmm(start % 1440);
    out.end = hhmm((start + Math.max(30, ((end - was + 1440) % 1440) || 60)) % 1440);
  }
  return out;
}

// The partner's own words and time replace the proposed stop. The plan's hours caveat goes when the partner says it is
// open, and template copy is written again so the words match the night as both owners now have it.
export function confirmPartnerStop(plan: NightPlan, c: PartnerConfirmation, venue: Venue): NightPlan {
  if (!plan.pair) return plan;
  const stops = plan.pair.stops.map((s) => (s.at === "partner" ? movedStop(s, c) : s));
  const first = stops[0];
  const last = stops[stops.length - 1];
  const dropHours = c.open === true;
  const limits = dropHours ? plan.limits.filter((l) => !HOURS_NOTE.test(l)) : plan.limits;
  const day = plan.day && dropHours && plan.day.note ? { ...plan.day, note: plan.day.note.split(/(?<=\.)\s+/).filter((t) => !HOURS_NOTE.test(t)).join(" ") } : plan.day;
  const next: NightPlan = {
    ...plan,
    pair: { ...plan.pair, stops },
    start: first?.start ?? plan.start,
    end: last?.end ?? plan.end,
    limits,
    ...(day ? { day: day.note ? day : { asked: day.asked, moved: day.moved } } : {}),
  };
  const changed = JSON.stringify(stops) !== JSON.stringify(plan.pair.stops);
  if (!changed || plan.copy.editedByOwner) return next;
  return { ...next, copy: templateCopy(next, venue) };
}
