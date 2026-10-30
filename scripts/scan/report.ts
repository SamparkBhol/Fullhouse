import type { ScanRecord, ScanTotals } from "../../src/shared/scan.ts";
import type { VenueResult } from "./totals.ts";

function ord(n: number | null): string {
  if (n === null) return "not on it";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function totalsText(name: string, t: ScanTotals, walkMax: number): string[] {
  return [
    `${name}: ${t.venues} venues read, ${t.matched} with a partner, ${t.twoWay} with a two way partner within ${walkMax} minutes.`,
    `  median fit ${t.medianFit ?? "none"}, median walk ${t.medianWalk ?? "none"} minutes, ${t.openTogether} pairs open together on at least one evening by listed hours.`,
    `  formats: ${t.formats.map((f) => `${f.label} ${f.n}`).join(", ") || "none"}`,
  ];
}

function venueText(r: VenueResult): string[] {
  const head = `${r.name} (${r.kind}, ${r.city}, ${r.area})${r.address ? `, ${r.address}` : ""}${r.url ? `, ${r.url}` : ""}`;
  if (!r.read) return [head, "  not read: " + (r.notes.join(" ") || "no answer"), ""];
  const p = r.partner;
  if (!p) return [head, `  no partner. ${r.notes.join(" ")}`, ""];
  return [
    head,
    `  partner ${p.name} (${p.kind})${p.address ? `, ${p.address}` : ""}`,
    `  fit ${p.fit}, walk ${p.walkMin} min, ${r.name} crowd puts it ${ord(p.forward.rank)} of ${p.forward.of}, its crowd puts ${r.name} ${p.back.checked ? `${ord(p.back.rank)} of ${p.back.of}` : "not checked"}`,
    `  two way within the walk: ${r.twoWay ? "yes" : "no"}. open together: ${r.openTogether ? `yes, ${p.evenings.opened} evenings` : `no (opened ${p.evenings.opened}, late ${p.evenings.late}, unknown ${p.evenings.unknown})`}. night: ${p.label}`,
    ...p.sentences.map((s) => `    ${s}`),
    `  calls ${r.calls}`,
    "",
  ];
}

export function reportOf(rows: VenueResult[], record: ScanRecord, ledger: { live: number; cached: number }): string {
  return [
    `Street scan, ${record.at}`,
    record.method,
    `Qloo answers used ${record.calls}. Live calls ${ledger.live}, kept answers ${ledger.cached}.`,
    "",
    ...totalsText("Overall", record.overall, record.walkMax),
    ...record.cities.flatMap((c) => totalsText(c.city, c.totals, record.walkMax)),
    "",
    ...rows.flatMap(venueText),
  ].join("\n");
}
