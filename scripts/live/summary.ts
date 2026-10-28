import type { Rising, StreetRead, StreetTag } from "../../src/shared/contract.ts";

const SHOW = 8;

function names(tags: StreetTag[], n = SHOW): string {
  return tags.length ? tags.slice(0, n).map((t) => t.name).join(", ") : "(none)";
}

function section(title: string, lines: string[]): string[] {
  return [`  ${title}`, ...(lines.length ? lines.map((l) => `    ${l}`) : ["    (none)"])];
}

function picksByType(rising: Rising[]): string[] {
  const types = [...new Set(rising.map((r) => r.type))];
  return types.map((type) => {
    const top = rising.filter((r) => r.type === type).slice(0, 4);
    const explained = top.filter((r) => r.because.some((b) => b.kind === "explainability")).length;
    const picks = top.map((r) => `${r.name} [${r.trend}${r.trendNote ? `: ${r.trendNote}` : ""}]`).join(", ");
    return `${type} (${explained} of ${top.length} explained): ${picks}`;
  });
}

export function summarise(read: StreetRead, ms: number): string[] {
  const cached = read.provenance.filter((p) => p.cached).length;
  const live = read.provenance.length - cached;
  return [
    ...section("Street tags", [names(read.streetTags)]),
    ...section("Venue audience tags", [names(read.venueTags)]),
    ...section("Already liked for", [names(read.shared)]),
    ...section("Gaps", read.gaps.map((g) => `${g.tag.name}: ${g.note}`)),
    ...section(
      "Loved places",
      read.lovedPlaces.slice(0, SHOW).map((p) => `#${p.rank} ${p.name}, ${p.distanceM} m (${p.because.map((b) => b.kind).join(", ")})`),
    ),
    ...section("Picks", picksByType(read.rising)),
    ...section("Heat", read.heat.map((h) => `${h.label}: ${h.cells.length} cells, top rank ${h.cells[0]?.affinityRank ?? "n/a"}`)),
    ...section("Demographics", read.demographics ? [read.demographics.summary] : []),
    ...section("Limits", read.limits),
    `  Calls: ${read.provenance.length} (${live} live, ${cached} cached), ${read.provenance.map((p) => p.call).join(" ")}`,
    `  Time: ${ms} ms`,
  ];
}
