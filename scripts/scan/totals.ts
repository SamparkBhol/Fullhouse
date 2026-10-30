import type { Considered, KindGroup, PairFormat } from "../../src/shared/contract.ts";
import type { ScanFormatCount, ScanRecord, ScanTotals } from "../../src/shared/scan.ts";

export interface PairResult {
  id: string;
  name: string;
  address?: string;
  kind: string;
  group: KindGroup | null;
  walkMin: number;
  distanceM: number;
  fit: number;
  forward: { rank: number; of: number };
  back: { checked: boolean; rank: number | null; of: number };
  crowdPass: boolean;
  backPass: boolean;
  evenings: { opened: number; late: number; unknown: number; venueListed: boolean; partnerListed: boolean };
  format: PairFormat;
  label: string;
  sentences: string[];
}

export interface VenueResult {
  city: string;
  area: string;
  via: string;
  id: string;
  name: string;
  address?: string;
  url?: string;
  kind: string;
  group: KindGroup | null;
  read: boolean;
  calls: number;
  notes: string[];
  partner: PairResult | null;
  twoWay: boolean;
  openTogether: boolean;
  board: Considered[];
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

// Counted by the grammar's own format, named by its words, so "book club then coffee" and "book club then dinner" add up.
export function formatWords(f: PairFormat): string {
  return f === "two_stop" ? "two stops" : f.replace(/_/g, " ");
}

function formats(pairs: PairResult[]): ScanFormatCount[] {
  const out = new Map<PairFormat, ScanFormatCount>();
  for (const p of pairs) {
    const held = out.get(p.format);
    if (held) held.n += 1;
    else out.set(p.format, { format: p.format, label: formatWords(p.format), n: 1 });
  }
  return [...out.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export function totalsOf(rows: VenueResult[]): ScanTotals {
  const read = rows.filter((r) => r.read);
  const pairs = read.flatMap((r) => (r.partner ? [r.partner] : []));
  return {
    venues: read.length,
    matched: pairs.length,
    twoWay: read.filter((r) => r.twoWay).length,
    medianFit: median(pairs.map((p) => p.fit)),
    medianWalk: median(pairs.map((p) => p.walkMin)),
    openTogether: read.filter((r) => r.openTogether).length,
    formats: formats(pairs),
  };
}

export function recordOf(rows: VenueResult[], o: { at: string; calls: number; method: string; walkMax: number; cities: string[] }): ScanRecord {
  return {
    at: o.at,
    calls: o.calls,
    method: o.method,
    walkMax: o.walkMax,
    overall: totalsOf(rows),
    cities: o.cities.map((city) => ({ city, totals: totalsOf(rows.filter((r) => r.city === city)) })),
  };
}

export function methodOf(o: { take: number; radiusM: number; checks: number; walkMax: number }): string {
  return (
    `Each venue was found with Full House's own place search and read by its own engine, which takes the ${o.take} places its crowd loves within ${o.radiusM / 1000} km, ` +
    `asks the ${o.checks} best of them whether their crowd loves it back, and counts the pair it picks as two way when each place is in the top half of the other's list and the walk is ${o.walkMax} minutes or less.`
  );
}
