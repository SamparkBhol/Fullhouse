import type { Provenance } from "../../../shared/contract.ts";
import { fmtTime } from "../words.ts";

export const RANK_LIMIT = "Ranks are positions within one Qloo response. They are not scores and cannot be compared across lists.";
export const AGGREGATE_LIMIT =
  "Everything here is Qloo's aggregate taste data for the venue's audience and the area around it, not a fact about any person.";

export function cacheLine(rows: Provenance[]): string | null {
  const cached = rows.filter((p) => p.cached);
  if (!cached.length) return null;
  const times = cached.map((p) => p.at).sort();
  const first = times[0] ?? "";
  const last = times[times.length - 1] ?? "";
  const when = first.slice(0, 16) === last.slice(0, 16) ? `fetched ${fmtTime(first)}` : `fetched between ${fmtTime(first)} and ${fmtTime(last)}`;
  return `${cached.length} of ${rows.length} Qloo ${rows.length === 1 ? "call" : "calls"} came from the cache, ${when}.`;
}

export function readLimits(callNotes: string[], stepNotes: string[], rows: Provenance[]): string[] {
  const cache = cacheLine(rows);
  return [...callNotes, ...stepNotes, RANK_LIMIT, AGGREGATE_LIMIT, ...(cache ? [cache] : [])];
}
