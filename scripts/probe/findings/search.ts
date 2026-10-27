import { parseEntities } from "../../../src/core/qloo/index.ts";
import { recordsFor, type ProbeContext } from "../context.ts";
import { answered, rankOf, rawEntity } from "../derive.ts";
import { errorText, names } from "../lens.ts";
import type { CallRecord } from "../record.ts";

const FORMS: Array<[string, string]> = [
  ["search_near", "name near the first locality hit, as the app does"],
  ["search_near_city", "name near the city level locality, asked only where it differs"],
  ["search_name_city", "name and city in one query, no location filter"],
  ["search_name_only", "name alone"],
  ["search_untyped", "name and city without types"],
];

function formLine(ctx: ProbeContext, call: string, meaning: string): string | null {
  const rows = ctx.venues
    .map((v) => ({ slug: v.slug, rec: recordsFor(ctx, v.slug).get(call), id: ctx.resolutions.get(v.slug)?.resolved.id }))
    .filter((r): r is { slug: string; rec: CallRecord; id: string | undefined } => r.rec !== undefined);
  if (!rows.length) return null;
  const ranks = rows.map((r) => (r.id ? rankOf(r.rec, r.id) : null));
  const first = ranks.filter((r) => r === 1).length;
  const found = ranks.filter((r) => r !== null).length;
  const misses = rows.filter((_, i) => ranks[i] === null).map((r) => r.slug);
  const later = rows.flatMap((r, i) => (ranks[i] !== null && ranks[i] !== 1 ? [`${r.slug} at ${ranks[i]}`] : []));
  return `${call} (${meaning}): ${rows.length} venues, first in ${first}, found in ${found}${later.length ? `, lower ranks ${later.join(", ")}` : ""}${misses.length ? `, missed ${misses.join(", ")}` : ""}.`;
}

function namesakes(rec: CallRecord): string {
  if (!answered(rec)) return "no answer";
  return parseEntities(rec.body)
    .slice(0, 5)
    .map((e) => `${e.name} (${e.disambiguation ?? "no disambiguation"})`)
    .join("; ");
}

function untypedTypes(rec: CallRecord): string {
  const seen = new Map<string, number>();
  const rows = answered(rec) && Array.isArray((rec.body as any)?.results) ? ((rec.body as any).results as any[]) : [];
  for (const row of rows) for (const t of Array.isArray(row?.types) ? row.types : []) seen.set(t, (seen.get(t) ?? 0) + 1);
  return [...seen.entries()].map(([t, n]) => `${t} ${n}`).join(", ") || "none";
}

function hitFields(ctx: ProbeContext): string {
  for (const v of ctx.venues) {
    const res = ctx.resolutions.get(v.slug);
    const rec = res ? recordsFor(ctx, v.slug).get(res.via) : undefined;
    const raw = res && rec ? rawEntity(rec.body, res.resolved.id) : null;
    if (raw) return `top level {${Object.keys(raw).join(", ")}}, properties {${Object.keys(raw.properties ?? {}).join(", ")}}`;
  }
  return "no hit";
}

export function searchFindings(ctx: ProbeContext): string[] {
  const out = ["SEARCH AND RESOLUTION", ""];
  for (const [call, meaning] of FORMS) {
    const line = formLine(ctx, call, meaning);
    if (line) out.push(line);
  }
  out.push("", `A resolved place hit carries ${hitFields(ctx)}.`, "");
  for (const v of ctx.venues) {
    const recs = recordsFor(ctx, v.slug);
    const only = recs.get("search_name_only");
    if (only) out.push(`Name only for ${v.name}: ${namesakes(only)}.`);
    const untyped = recs.get("search_untyped");
    if (untyped) out.push(`Untyped search for ${v.name} ${v.city}: types ${untypedTypes(untyped)}; top ${names(untyped, 4).join(", ")}.`);
  }
  const nonsense = recordsFor(ctx, "_global").get("search_nonsense");
  if (nonsense) {
    out.push(`A nonsense query answered HTTP ${nonsense.status} with fuzzy hits rather than an empty list: ${names(nonsense, 3).join(", ") || errorText(nonsense)}.`);
  }
  return out;
}
