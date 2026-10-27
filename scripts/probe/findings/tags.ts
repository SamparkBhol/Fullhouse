import { parseTags } from "../../../src/core/qloo/parse.ts";
import { recordsFor, type ProbeContext } from "../context.ts";
import { errorText, namespaceLine, namespaces, shared, status, tagIds } from "../lens.ts";
import type { CallRecord } from "../record.ts";
import { APP_STREET_TAG_TYPES } from "../plan.ts";

function topNames(rec: CallRecord | undefined, n = 6): string {
  return rec && rec.status === 200 ? parseTags(rec.body).slice(0, n).map((t) => t.name).join(", ") : "none";
}

function oddNames(recs: CallRecord[]): string[] {
  const odd = new Set<string>();
  for (const rec of recs) {
    const rows: any[] = rec.status === 200 ? (rec.body as any)?.results?.tags ?? [] : [];
    for (const r of rows) if (typeof r?.name === "string" && r.name !== r.name.trim()) odd.add(JSON.stringify(r.name));
  }
  return [...odd].slice(0, 6);
}

function scoreRange(recs: CallRecord[]): string {
  const scores = recs.flatMap((r) => (r.status === 200 ? parseTags(r.body).map((t) => t.score) : [])).filter((x): x is number => x !== null);
  return scores.length ? `${scores.length} tags from ${Math.min(...scores).toFixed(3)} to ${Math.max(...scores).toFixed(3)}` : "no scores";
}

function neverReturned(recs: CallRecord[]): string[] {
  const seen = new Set<string>();
  for (const rec of recs) for (const ns of Object.keys(namespaces(rec))) seen.add(ns);
  return APP_STREET_TAG_TYPES.filter((ns) => !seen.has(ns));
}

export function tagFindings(ctx: ProbeContext): string[] {
  const out = ["TAG FINGERPRINTS", ""];
  const street: CallRecord[] = [];
  const venue: CallRecord[] = [];
  for (const v of ctx.venues) {
    const recs = recordsFor(ctx, v.slug);
    const s = recs.get("street_tags");
    const t = recs.get("venue_tags");
    if (s) street.push(s);
    if (t) venue.push(t);
    out.push(`${v.slug}: street ${status(s)} [${namespaceLine(s)}], venue ${status(t)} [${namespaceLine(t)}]`);
    out.push(`  street top ${topNames(s)}; venue top ${topNames(t)}`);
  }
  out.push(
    "",
    `Requested namespaces never returned for the street: ${neverReturned(street).join(", ") || "none"}.`,
    `Requested namespaces never returned for any venue: ${neverReturned(venue).join(", ") || "none"}.`,
    `Street tag affinity across all venues: ${scoreRange(street)}; venue tag affinity: ${scoreRange(venue)}.`,
    `Tag names with stray whitespace: ${oddNames([...street, ...venue]).join(", ") || "none"}.`,
  );
  const pairs: Array<[string, string]> = [
    ["housing-works", "caffe-reggio"],
    ["city-lights", "ritual-coffee"],
    ["rough-trade-east", "photographers-gallery"],
    ["housing-works", "shakespeare-and-company"],
  ];
  for (const [a, b] of pairs) {
    const ra = recordsFor(ctx, a).get("street_tags");
    const rb = recordsFor(ctx, b).get("street_tags");
    if (ra && rb) out.push(`Street tags shared between ${a} and ${b}: ${shared(tagIds(ra), tagIds(rb), 25)} of 25.`);
  }
  for (const slug of ctx.experimentSlugs) {
    const recs = recordsFor(ctx, slug);
    const base = recs.get("street_tags");
    out.push("", `Variants for ${slug}:`);
    for (const name of ["street_tags_open", "street_tags_signal_query", "venue_tags_open", "street_tags_repeat"]) {
      const rec = recs.get(name);
      if (!rec) continue;
      const overlap = name.startsWith("street") && base ? `, shares ${shared(tagIds(base), tagIds(rec), 50)} tags with the POINT read` : "";
      const err = rec.status !== 200 ? ` (${errorText(rec)})` : "";
      out.push(`  ${name}: ${status(rec)}${err} [${namespaceLine(rec)}]${overlap}`);
    }
  }
  return out;
}
