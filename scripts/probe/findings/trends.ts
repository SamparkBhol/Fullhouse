import { parseTrending } from "../../../src/core/qloo/parse.ts";
import { recordsFor, type ProbeContext } from "../context.ts";
import { errorText, status } from "../lens.ts";
import type { CallRecord } from "../record.ts";

function seriesLine(rec: CallRecord): string {
  if (rec.status !== 200) return `${status(rec)} (${errorText(rec)})`;
  const { points } = parseTrending(rec.body);
  if (!points.length) return "0 points";
  const ranks = new Set(points.map((p) => p.rank));
  const pcts = new Set(points.map((p) => p.percentile));
  const moving = points.filter((p) => (p.rankVelocity ?? 0) !== 0 || (p.foldChange ?? 0) !== 0 || (p.percentDelta ?? 0) !== 0).length;
  const newest = points[0]?.date ?? "";
  const oldest = points[points.length - 1]?.date ?? "";
  return `${points.length} points from ${oldest} to ${newest}, ${ranks.size} distinct rank${ranks.size === 1 ? "" : "s"}, ${pcts.size} distinct percentile${pcts.size === 1 ? "" : "s"}, ${moving} points with any velocity`;
}

export function trendFindings(ctx: ProbeContext): string[] {
  const out = ["TRENDING", ""];
  const ranked = recordsFor(ctx, "_global").get("trending_ranked_artist");
  if (ranked) out.push(`Without an entity: ${status(ranked)} (${errorText(ranked) || "no error text"})`, "");
  for (const v of ctx.venues) {
    for (const [name, rec] of recordsFor(ctx, v.slug)) {
      if (!name.startsWith("trending")) continue;
      out.push(`${v.slug} ${name} ${rec.params["filter.start_date"]} to ${rec.params["filter.end_date"]} take ${rec.params.take}: ${seriesLine(rec)}`);
    }
  }
  return out;
}
