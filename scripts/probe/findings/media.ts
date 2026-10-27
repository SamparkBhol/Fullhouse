import { recordsFor, type ProbeContext } from "../context.ts";
import { affinities, errorText, explainLayout, ids, names, popularities, sameOrder, shared, spreadLine, status } from "../lens.ts";
import { CROSS_TYPES } from "../plan.ts";
import type { CallRecord } from "../record.ts";

function picks(rec: CallRecord | undefined, n: number): string {
  if (!rec) return "not asked";
  if (rec.status !== 200) return `${status(rec)} (${errorText(rec)})`;
  return names(rec, n).join(", ") || "empty";
}

function distinctLists(ctx: ProbeContext, call: string): string {
  const tops = ctx.venues.map((v) => ids(recordsFor(ctx, v.slug).get(call)).slice(0, 5).join(","));
  const firsts = new Set(ctx.venues.map((v) => names(recordsFor(ctx, v.slug).get(call), 1)[0] ?? ""));
  return `${new Set(tops).size} distinct top fives and ${firsts.size} distinct first picks over ${tops.length} venues`;
}

function globalLines(ctx: ProbeContext): string[] {
  const g = recordsFor(ctx, "_global");
  const out: string[] = [];
  for (const call of ["game_videogame", "game_video_game"]) {
    const rec = g.get(call);
    if (rec) out.push(`${call}: ${status(rec)}${rec.status !== 200 ? ` (${errorText(rec)})` : ""}`);
  }
  return out;
}

function experimentLines(ctx: ProbeContext, slug: string): string[] {
  const recs = recordsFor(ctx, slug);
  const app = recs.get("cross_artist");
  const out = [`Variants for ${slug}:`];
  const compare = (name: string) => {
    const rec = recs.get(name);
    if (!rec) return;
    const same = app && rec.status === 200 ? `, shares ${shared(ids(app), ids(rec))} of 10 with the app's artists${sameOrder(ids(app), ids(rec)) ? " in the same order" : ""}` : "";
    out.push(`  ${name}: ${picks(rec, 5)}${same}`);
  };
  ["cross_artist_no_bias", "cross_artist_city_query", "cross_artist_venue_only", "cross_artist_venue_biased", "cross_artist_no_location"].forEach(compare);
  for (const t of ["book", "movie", "tv_show", "podcast", "videogame"]) {
    const rec = recs.get(`app_cross_${t}`);
    if (rec) out.push(`  app_cross_${t}: ${picks(rec, 4)}; affinity ${spreadLine(affinities(rec))}`);
  }
  const venueOnly = recs.get("cross_artist_venue_only");
  const withPoint = recs.get("cross_artist_venue");
  if (venueOnly && withPoint) out.push(`  venue entity alone versus venue plus POINT: ${shared(ids(venueOnly), ids(withPoint))} of 10 shared`);
  return out;
}

export function mediaFindings(ctx: ProbeContext): string[] {
  const out = ["CROSS DOMAIN PICKS", "", ...globalLines(ctx), ""];
  out.push(`The app's artist call (POINT signal, bias.trends=high): ${distinctLists(ctx, "cross_artist")}.`);
  out.push(`Venue entity plus POINT: ${distinctLists(ctx, "cross_artist_venue")}.`, "");
  for (const v of ctx.venues) {
    const recs = recordsFor(ctx, v.slug);
    const app = recs.get("cross_artist");
    const venue = recs.get("cross_artist_venue");
    out.push(`${v.slug}`);
    out.push(`  POINT artists: ${picks(app, 5)}; affinity ${spreadLine(affinities(app))}`);
    out.push(`  venue artists: ${picks(venue, 5)}; affinity ${spreadLine(affinities(venue))}; popularity ${spreadLine(popularities(venue))}`);
    for (const t of CROSS_TYPES.filter((t) => t !== "artist")) out.push(`  venue ${t}: ${picks(recs.get(`cross_${t}_venue`), 3)}`);
  }
  out.push("");
  const layouts = new Map<string, string[]>();
  for (const rec of ctx.records) {
    if (!/^(cross_|app_cross_|loved_)/.test(rec.call) || rec.status !== 200) continue;
    const l = explainLayout(rec);
    const key = `${rec.call}: ${l.explained ? `${l.explained} results explained` : "no explainability"}`;
    if (!layouts.has(rec.call)) layouts.set(rec.call, [key, ...l.top, ...l.perResult]);
  }
  out.push("Explainability by call kind (first response of each kind):");
  for (const lines of layouts.values()) out.push(`  ${lines[0]}`, ...lines.slice(1).map((l) => `    ${l}`));
  for (const slug of ctx.experimentSlugs) out.push("", ...experimentLines(ctx, slug));
  return out;
}
