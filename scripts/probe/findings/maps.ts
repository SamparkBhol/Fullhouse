import { parseHeatmap, resultsOf } from "../../../src/core/qloo/parse.ts";
import { haversineM } from "../../../src/core/street/geo.ts";
import { recordsFor, type ProbeContext } from "../context.ts";
import { centerOf, errorText, keysOf, status } from "../lens.ts";
import type { CallRecord } from "../record.ts";

function heatLine(name: string, rec: CallRecord | undefined): string {
  if (!rec) return `  ${name}: not asked`;
  if (rec.status !== 200) return `  ${name}: ${status(rec)} (${errorText(rec)})`;
  const cells = parseHeatmap(rec.body);
  const center = centerOf(rec);
  const far = center && cells.length ? Math.max(...cells.map((c) => Math.round(haversineM(center, c)))) : null;
  const ranks = cells.map((c) => c.affinityRank).filter((x): x is number => x !== null);
  const lengths = [...new Set(cells.map((c) => c.geohash.length))].join("/");
  const blank = cells.filter((c) => c.affinity === 0 && c.popularity === 0).length;
  const rankText = ranks.length ? `affinity_rank ${Math.min(...ranks).toFixed(2)} to ${Math.max(...ranks).toFixed(2)}` : "no ranks";
  return `  ${name}: ${cells.length} cells, geohash length ${lengths || "none"}, furthest ${far ?? "?"} m, ${rankText}, ${blank} empty cells`;
}

function compareLine(rec: CallRecord | undefined): string {
  if (!rec) return "not asked";
  if (rec.status !== 200) return `${status(rec)} (${errorText(rec)})`;
  const r = resultsOf(rec.body) as any;
  const scores: number[] = (r?.tags ?? []).map((t: any) => t?.query?.score).filter((x: unknown) => typeof x === "number");
  const range = scores.length ? `score ${Math.min(...scores).toFixed(3)} to ${Math.max(...scores).toFixed(3)}` : "no scores";
  const sharedNames = (r?.tags ?? []).slice(0, 4).map((t: any) => t?.name).join(", ");
  return `results {${keysOf(r)}}, shared tags ${r?.tags?.length ?? 0} (${sharedNames}), a ${r?.a?.length ?? 0}, b ${r?.b?.length ?? 0}, ${range}`;
}

function demographicsByInput(ctx: ProbeContext): string[] {
  const seen = new Map<string, Set<string>>();
  const where = new Map<string, number>();
  for (const v of ctx.venues) {
    const rec = recordsFor(ctx, v.slug).get("demographics");
    const rows: any[] = rec?.status === 200 ? (resultsOf(rec.body) as any)?.demographics ?? [] : [];
    for (const row of rows) {
      const key = String(row?.entity_id);
      seen.set(key, (seen.get(key) ?? new Set()).add(JSON.stringify(row?.query)));
      where.set(key, (where.get(key) ?? 0) + 1);
    }
  }
  return [...seen.entries()]
    .filter(([k]) => (where.get(k) ?? 0) > 1)
    .map(([k, blocks]) => `  ${k}: asked at ${where.get(k)} venues, ${blocks.size} distinct answer${blocks.size === 1 ? "" : "s"}`);
}

export function mapFindings(ctx: ProbeContext): string[] {
  const out = ["HEATMAPS, COMPARE AND DEMOGRAPHICS", ""];
  for (const v of ctx.venues) {
    const recs = recordsFor(ctx, v.slug);
    out.push(`${v.slug}`, heatLine("heat_venue", recs.get("heat_venue")), heatLine("heat_street", recs.get("heat_street")));
    for (const [name, rec] of recs) if (name.startsWith("heat_boundary")) out.push(`  ${name}: ${status(rec)}${rec.status !== 200 ? ` (${errorText(rec)})` : `, results {${keysOf(resultsOf(rec.body))}}`}`);
    out.push(`  compare: ${compareLine(recs.get("compare"))}`);
    const typed = recs.get("compare_typed");
    if (typed) out.push(`  compare_typed: ${compareLine(typed)}; results identical to untyped ${JSON.stringify(resultsOf(typed.body)) === JSON.stringify(resultsOf(recs.get("compare")?.body))}`);
    const demo = recs.get("demographics");
    const demoRows = demo?.status === 200 ? ((resultsOf(demo.body) as any)?.demographics ?? []).length : 0;
    out.push(`  demographics: ${demo ? `${demoRows} blocks for ${demo.params["signal.interests.tags"]?.split(",").length ?? 0} tags` : "not asked"}`);
    for (const name of ["demo_venue", "demo_location_only"]) {
      const rec = recs.get(name);
      if (rec) out.push(`  ${name}: ${status(rec)}${rec.status !== 200 ? ` (${errorText(rec)})` : ""}`);
    }
  }
  out.push("", "Demographics for the same tag asked from different venues:", ...demographicsByInput(ctx));
  return out;
}
