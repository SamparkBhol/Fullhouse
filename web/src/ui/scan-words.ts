import type { ScanRecord, ScanTotals } from "../../../src/shared/scan.ts";
import { listWords } from "../../../src/shared/words.ts";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function scanDay(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? DAY.format(new Date(t)) : "";
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function scanHeadline(r: ScanRecord): string {
  const where = listWords(r.cities.map((c) => c.city));
  const day = scanDay(r.at);
  return `Run on ${r.overall.venues} real venues in ${where}${day ? ` on ${day}` : ""}.`;
}

export function twoWayLine(t: ScanTotals, walkMax: number): string {
  return `${t.twoWay} of the ${t.venues} have a partner within a ${walkMax} minute walk, and each crowd puts the other in the top half of its list.`;
}

export interface ScanFact {
  label: string;
  value: string;
  note: string;
}

export function scanFacts(t: ScanTotals): ScanFact[] {
  const out: ScanFact[] = [];
  if (t.medianFit !== null) out.push({ label: "Median fit", value: `${num(t.medianFit)} of 100`, note: "for the pair Full House picks" });
  if (t.medianWalk !== null) out.push({ label: "Median walk", value: `${num(t.medianWalk)} min`, note: "between the two doors" });
  if (t.matched) out.push({ label: "Open together", value: `${t.openTogether} of ${t.matched}`, note: "on at least one evening, by both places' listed hours" });
  return out;
}

export function formatsLine(t: ScanTotals): string {
  if (!t.formats.length) return "";
  return `The nights it would plan: ${t.formats.map((f) => `${f.label} ${f.n}`).join(", ")}.`;
}

export function cityLine(t: ScanTotals): string {
  return `${t.twoWay} of ${t.venues} two way`;
}

export function callsLine(r: ScanRecord): string {
  return `${r.calls} taste data answers. Venue names stay private, because a partner is never named before its own yes.`;
}
