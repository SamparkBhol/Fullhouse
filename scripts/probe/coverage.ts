import { recordsFor, type ProbeContext } from "./context.ts";
import { rankOf } from "./derive.ts";
import { count, errorText, quantile, status } from "./lens.ts";
import { requestLine, type CallRecord } from "./record.ts";
import { shapeKey } from "./shape.ts";

const DENSITY_CALLS = ["street_tags", "venue_tags", "loved_places", "heat_venue", "heat_street", "compare", "demographics"];
const CROSS_CALLS = ["cross_artist_venue", "cross_book_venue", "cross_movie_venue", "cross_tv_show_venue", "cross_podcast_venue", "cross_videogame_venue"];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function callLine(rec: CallRecord): string {
  const retries = rec.retried.length ? ` after retrying HTTP ${rec.retried.join(", ")}` : "";
  const timing = rec.failure === "cap" ? "" : `${rec.ms} ms${retries}`;
  const err = rec.status !== 200 ? `  ${errorText(rec)}` : "";
  return `  ${pad(rec.call, 26)} ${pad(status(rec), 14)} ${timing}${err}`;
}

export function venueSection(ctx: ProbeContext): string[] {
  const out = ["VENUES", ""];
  for (const v of ctx.venues) {
    const recs = recordsFor(ctx, v.slug);
    const res = ctx.resolutions.get(v.slug);
    out.push(`${v.slug}: ${v.name}, ${v.city} (${v.kind})`);
    if (res) {
      const r = res.resolved;
      out.push(`  resolved via ${res.via} as ${r.name} at ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}, area ${r.area}`);
      const ranks = [...recs.values()]
        .filter((rec) => rec.group === "resolve")
        .map((rec) => `${rec.call} ${status(rec)}, venue at rank ${rankOf(rec, r.id) ?? "none"}`);
      out.push(`  ${ranks.join("; ")}`);
    } else {
      out.push("  not resolved");
    }
    for (const rec of recs.values()) if (rec.group !== "resolve") out.push(callLine(rec));
    out.push("");
  }
  return out;
}

function mean(xs: number[]): string {
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "none";
}

export function citySection(ctx: ProbeContext): string[] {
  const out = ["CITIES", "", "Averages over the resolved venues in each city. Cross domain is the sum over the six venue signal calls.", ""];
  const cities = [...new Set(ctx.venues.map((v) => v.city))];
  const rows = cities.map((city) => {
    const slugs = ctx.venues.filter((v) => v.city === city).map((v) => v.slug);
    const resolved = slugs.filter((s) => ctx.resolutions.has(s));
    const avg = (call: string) => mean(resolved.map((s) => count(recordsFor(ctx, s).get(call)) ?? 0));
    const cross = resolved.map((s) => CROSS_CALLS.reduce((sum, c) => sum + (count(recordsFor(ctx, s).get(c)) ?? 0), 0));
    const loc = ctx.localities.get(city);
    const hits = (loc?.all ?? []).map(
      (l, i) => `  locality ${i + 1}: ${l.label}, admin level ${l.adminLevel ?? "none"}, ${l.lat !== null ? `${l.lat.toFixed(3)}, ${(l.lng ?? 0).toFixed(3)}` : "no coordinates"}${l.id === loc?.best?.id ? " (city level pick)" : ""}`,
    );
    return { line: `${city}: ${resolved.length} of ${slugs.length} resolved`, hits, detail: DENSITY_CALLS.map((c) => `${c} ${avg(c)}`).join(", "), cross: mean(cross) };
  });
  for (const r of rows) out.push(r.line, ...r.hits, `  ${r.detail}, cross domain ${r.cross}`, "");
  return out;
}

export function latencySection(ctx: ProbeContext): string[] {
  const groups = new Map<string, number[]>();
  for (const rec of ctx.records) {
    if (rec.failure || rec.ms <= 0) continue;
    const key = `${shapeKey(rec).replace(/^trending_(artist|movie|tv_show|book|podcast|videogame)$/, "trending")} ${rec.path}`;
    groups.set(key, [...(groups.get(key) ?? []), rec.ms]);
  }
  const rows = [...groups.entries()]
    .map(([key, ms]) => ({ key, n: ms.length, p50: quantile(ms, 0.5) ?? 0, p90: quantile(ms, 0.9) ?? 0, max: Math.max(...ms) }))
    .sort((a, b) => b.p50 - a.p50);
  const out = ["LATENCY", "", "Milliseconds per request as first measured live (cached answers keep their original timing).", ""];
  for (const r of rows) out.push(`${pad(r.key, 52)} n ${pad(String(r.n), 4)} median ${pad(String(r.p50), 6)} p90 ${pad(String(r.p90), 6)} max ${r.max}`);
  return out;
}

export function emptySection(ctx: ProbeContext): string[] {
  const out = ["EMPTY OR FAILED", ""];
  for (const rec of ctx.records) {
    const n = count(rec);
    if (n !== null && n > 0) continue;
    out.push(`${rec.scope} ${rec.call}: ${status(rec)} ${errorText(rec)}`.trim(), `  ${requestLine(rec)}`);
  }
  if (out.length === 2) out.push("Every call returned data.");
  return out;
}
