import type { Rising, StreetRead } from "../../../shared/contract.ts";
import { fmtDay, TYPE_PLURAL } from "../words.ts";
import type { ReadContext } from "./resolve.ts";

// Qloo's weekly trending series held flat on the hackathon host, so this step makes no call and never labels a
// pick as rising or falling. It notes, with dates, how each pick's place changed since the previous weekly read.
export const MIN_COMPARE_DAYS = 5;
const DAY_MS = 86400000;

export const FIRST_READ_LIMIT = "Changes in the picks show from the next weekly read, which is compared with this one.";

function key(r: Pick<Rising, "type" | "id">): string {
  return `${r.type}:${r.id.toUpperCase()}`;
}

export function changeNote(now: Rising, before: Rising | undefined, since: string, venueName: string): string {
  if (!before) return `New among Qloo's ${TYPE_PLURAL[now.type]} for ${venueName} since the read of ${since}`;
  if (before.rank === now.rank) return `Also #${now.rank} in the read of ${since}`;
  return `#${now.rank} in this read, #${before.rank} in the read of ${since}`;
}

function withNote(r: Rising, note: string): Rising {
  return { ...r, trend: "unknown", trendNote: note };
}

// A read repeated within a few days keeps the weekly notes for picks that still hold the same place.
function carryOver(rising: Rising[], previous: StreetRead): { rising: Rising[]; limits: string[] } {
  const before = new Map(previous.rising.map((r) => [key(r), r]));
  let carried = 0;
  const out = rising.map((r) => {
    const prev = before.get(key(r));
    if (!prev?.trendNote || prev.rank !== r.rank) return r;
    carried++;
    return withNote(r, prev.trendNote);
  });
  return { rising: out, limits: [carried ? `Changes in the picks are carried over from the read of ${fmtDay(previous.at)}.` : FIRST_READ_LIMIT] };
}

export function noteChanges(rising: Rising[], previous: StreetRead | undefined, ctx: ReadContext): { rising: Rising[]; limits: string[] } {
  if (!previous || previous.venueId !== ctx.venue.id) return { rising, limits: [FIRST_READ_LIMIT] };
  const age = ctx.now.getTime() - Date.parse(previous.at);
  if (!(age >= MIN_COMPARE_DAYS * DAY_MS)) return carryOver(rising, previous);
  const before = new Map(previous.rising.map((r) => [key(r), r]));
  const typesBefore = new Set(previous.rising.map((r) => r.type));
  const since = fmtDay(previous.at);
  const out = rising.map((r) => (typesBefore.has(r.type) ? withNote(r, changeNote(r, before.get(key(r)), since, ctx.name)) : r));
  return { rising: out, limits: [`Changes in the picks are measured against the read of ${since}.`] };
}
