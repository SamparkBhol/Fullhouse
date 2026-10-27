import { recordsFor, type ProbeContext } from "../context.ts";
import { rawEntity } from "../derive.ts";
import { affinities, centerOf, distances, explainLayout, ids, quantile, sameOrder, shared, spreadLine, status } from "../lens.ts";
import type { CallRecord } from "../record.ts";

const VARIANTS = ["loved_filter_query", "loved_signal_query", "loved_no_signal", "loved_signal_radius", "loved_entity_signal", "loved_point_no_radius"];

function variantLine(name: string, rec: CallRecord, base: CallRecord): string {
  const center = centerOf(base);
  const d = center ? distances(rec, center) : [];
  const ex = explainLayout(rec).explained;
  const where = d.length ? `distance median ${quantile(d, 0.5)} m, max ${Math.max(...d)} m` : "no distances";
  const overlap = `${shared(ids(base), ids(rec))} of the app's top 10${sameOrder(ids(base), ids(rec)) ? ", same order" : ""}`;
  return `  ${name}: ${status(rec)}, ${where}, shares ${overlap}, affinity ${spreadLine(affinities(rec))}, ${ex} results explained`;
}

function genres(rec: CallRecord | undefined, n = 10): string {
  if (!rec || rec.status !== 200) return "none";
  const rows: any[] = (rec.body as any)?.results?.entities ?? [];
  return rows
    .slice(0, n)
    .map((r) => r?.properties?.primary_genre?.name ?? "no genre")
    .join(", ");
}

function growth(rec: CallRecord | undefined): string {
  const rows: any[] = rec && rec.status === 200 ? (rec.body as any)?.results?.entities ?? [] : [];
  const g = rows.map((r) => r?.query?.measurements?.audience_growth).filter((x): x is number => typeof x === "number");
  const nonzero = g.filter((x) => x !== 0).length;
  return g.length ? `audience_growth nonzero on ${nonzero} of ${g.length}, from ${Math.min(...g).toFixed(2)} to ${Math.max(...g).toFixed(2)}` : "no audience_growth";
}

export function placeFindings(ctx: ProbeContext): string[] {
  const out = ["NEARBY PLACES", "", "The app's call is loved_places: POINT filter with radius 1200 m and the same POINT as signal.", ""];
  for (const v of ctx.venues) {
    const base = recordsFor(ctx, v.slug).get("loved_places");
    if (!base) continue;
    out.push(`${v.slug}: ${status(base)}, affinity ${spreadLine(affinities(base))}, ${growth(base)}`, `  top genres ${genres(base)}`);
  }
  for (const slug of ctx.experimentSlugs) {
    const recs = recordsFor(ctx, slug);
    const base = recs.get("loved_places");
    if (!base) continue;
    const area = ctx.resolutions.get(slug)?.resolved.area ?? "";
    out.push("", `Variants for ${slug} (area name ${area}):`, variantLine("loved_places", base, base));
    for (const name of VARIANTS) {
      const rec = recs.get(name);
      if (rec) out.push(variantLine(name, rec, base));
    }
    out.push(`  entity signal top genres ${genres(recs.get("loved_entity_signal"))}`);
    const layout = explainLayout(recs.get("loved_entity_signal"));
    out.push(...layout.top.map((l) => `  ${l}`), ...layout.perResult.map((l) => `  ${l}`));
  }
  const venue = ctx.experimentSlugs[0];
  const entity = venue ? recordsFor(ctx, venue).get("venue_entity") : undefined;
  const id = venue ? ctx.resolutions.get(venue)?.resolved.id : undefined;
  if (entity && id) {
    const raw = rawEntity(entity.body, id);
    out.push("", `/entities for ${venue}: ${status(entity)}, fields {${Object.keys(raw ?? {}).join(", ")}}, ${Array.isArray(raw?.tags) ? raw.tags.length : 0} tags.`);
  }
  return out;
}
