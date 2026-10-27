import type { Because, Rising, StreetRead, Trend } from "../../../shared/contract.ts";
import { fmtDay, TYPE_PLURAL } from "../words.ts";
import type { ReadContext } from "./resolve.ts";

// Qloo's weekly trending series held flat on the hackathon host, so this step makes no call. It compares the
// picks with the previous weekly read instead, and says plainly when there is nothing to compare with yet.
export const MIN_COMPARE_DAYS = 5;
const DAY_MS = 86400000;

export const FIRST_READ_LIMIT = "Rank changes show from next week's read, which is compared with this one.";

interface Move {
  trend: Trend;
  note: string;
}

function key(r: Pick<Rising, "type" | "id">): string {
  return `${r.type}:${r.id.toUpperCase()}`;
}

function move(now: Rising, before: Rising | undefined, since: string): Move {
  const among = `among ${TYPE_PLURAL[now.type]} for this venue since the read of ${since}`;
  if (!before) return { trend: "rising", note: `New ${among}` };
  if (now.rank < before.rank) return { trend: "rising", note: `Up from #${before.rank} to #${now.rank} ${among}` };
  if (now.rank > before.rank) return { trend: "falling", note: `Down from #${before.rank} to #${now.rank} ${among}` };
  return { trend: "steady", note: `Held #${now.rank} ${among}` };
}

function withMove(r: Rising, m: Move): Rising {
  const ref = r.because[0]?.provenance ?? -1;
  const because: Because[] = [...r.because.slice(0, 1), { kind: "trending", text: m.note, provenance: ref }, ...r.because.slice(1)];
  return { ...r, trend: m.trend, trendNote: m.note, because };
}

// A read repeated within a few days keeps last week's comparison for picks that still hold the same rank.
function carryOver(rising: Rising[], previous: StreetRead): { rising: Rising[]; limits: string[] } {
  const before = new Map(previous.rising.map((r) => [key(r), r]));
  let carried = 0;
  const out = rising.map((r) => {
    const prev = before.get(key(r));
    if (!prev || prev.rank !== r.rank || prev.trend === "unknown" || !prev.trendNote) return r;
    carried++;
    return withMove(r, { trend: prev.trend, note: prev.trendNote });
  });
  return { rising: out, limits: [carried ? `Rank changes are the ones measured at the read of ${fmtDay(previous.at)}.` : FIRST_READ_LIMIT] };
}

export function applyMomentum(rising: Rising[], previous: StreetRead | undefined, ctx: ReadContext): { rising: Rising[]; limits: string[] } {
  if (!previous || previous.venueId !== ctx.venue.id) return { rising, limits: [FIRST_READ_LIMIT] };
  const age = ctx.now.getTime() - Date.parse(previous.at);
  if (!(age >= MIN_COMPARE_DAYS * DAY_MS)) return carryOver(rising, previous);
  const before = new Map(previous.rising.map((r) => [key(r), r]));
  const typesBefore = new Set(previous.rising.map((r) => r.type));
  const since = fmtDay(previous.at);
  const out = rising.map((r) => (typesBefore.has(r.type) ? withMove(r, move(r, before.get(key(r)), since)) : r));
  return { rising: out, limits: [`Rank changes compare this read with the one from ${since}.`] };
}
