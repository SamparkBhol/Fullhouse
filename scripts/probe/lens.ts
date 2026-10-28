import { countResults, isObj, list, obj, parseEntities, parseTags, parseWktPoint, str } from "../../src/core/qloo/index.ts";
import { haversineM } from "../../src/shared/geo.ts";
import type { Point } from "./plan.ts";
import type { CallRecord } from "./record.ts";

export function count(rec: CallRecord | undefined): number | null {
  if (!rec || rec.status !== 200) return null;
  return countResults(rec.body);
}

export function status(rec: CallRecord | undefined): string {
  if (!rec) return "not run";
  if (rec.failure) return rec.failure;
  if (rec.status !== 200) return `HTTP ${rec.status}`;
  return `${countResults(rec.body)} results`;
}

// Qloo answers errors in three layouts: {errors: [{message}]}, {error: {message, reason}} and {message, reason}.
export function errorText(rec: CallRecord | undefined): string {
  const raw = rec?.body;
  if (!isObj(raw)) return typeof raw === "string" ? raw.slice(0, 160) : "";
  const listed = list(raw.errors).map((e) => obj(e).message);
  const inner = isObj(raw.error) ? raw.error : raw;
  return [...listed, inner.message, inner.reason, str(raw.error)]
    .filter((s) => typeof s === "string")
    .join(", ")
    .slice(0, 200);
}

export function ids(rec: CallRecord | undefined): string[] {
  return rec && rec.status === 200 ? parseEntities(rec.body).map((e) => e.id.toUpperCase()) : [];
}

export function names(rec: CallRecord | undefined, n = 5): string[] {
  return rec && rec.status === 200 ? parseEntities(rec.body).slice(0, n).map((e) => e.name) : [];
}

export function tagIds(rec: CallRecord | undefined): string[] {
  return rec && rec.status === 200 ? parseTags(rec.body).map((t) => t.id) : [];
}

export function shared(a: string[], b: string[], n = 10): number {
  const top = new Set(a.slice(0, n));
  return b.slice(0, n).filter((x) => top.has(x)).length;
}

export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function namespaces(rec: CallRecord | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!rec || rec.status !== 200) return out;
  for (const t of parseTags(rec.body)) out[t.namespace] = (out[t.namespace] ?? 0) + 1;
  return out;
}

export function namespaceLine(rec: CallRecord | undefined): string {
  const ns = Object.entries(namespaces(rec)).sort((a, b) => b[1] - a[1]);
  return ns.length ? ns.map(([k, v]) => `${k.replace(/^urn:tag:/, "")} ${v}`).join(", ") : "none";
}

export interface Spread {
  n: number;
  nulls: number;
  min: number | null;
  max: number | null;
  descending: boolean;
}

function spread(values: Array<number | null>): Spread {
  const nums = values.filter((v): v is number => v !== null);
  const descending = nums.every((v, i) => i === 0 || v <= (nums[i - 1] as number) + 1e-9);
  return { n: values.length, nulls: values.length - nums.length, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, descending };
}

export function spreadLine(s: Spread): string {
  if (!s.n) return "no values";
  if (s.min === null || s.max === null) return `${s.n} values, all null`;
  return `${s.n} values from ${s.min.toFixed(3)} to ${s.max.toFixed(3)}${s.nulls ? `, ${s.nulls} null` : ""}, ${s.descending ? "in descending order" : "not in descending order"}`;
}

export function affinities(rec: CallRecord | undefined): Spread {
  return spread(rec && rec.status === 200 ? parseEntities(rec.body).map((e) => e.affinity) : []);
}

export function popularities(rec: CallRecord | undefined): Spread {
  return spread(rec && rec.status === 200 ? parseEntities(rec.body).map((e) => e.popularity) : []);
}

export function distances(rec: CallRecord | undefined, center: Point): number[] {
  if (!rec || rec.status !== 200) return [];
  return parseEntities(rec.body)
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => Math.round(haversineM(center, { lat: e.lat as number, lng: e.lng as number })));
}

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
}

export function keysOf(v: unknown): string {
  return v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).join(", ") : Array.isArray(v) ? `array of ${v.length}` : String(v);
}

function itemKeys(v: unknown): string {
  const first = Array.isArray(v) ? v[0] : v;
  return first && typeof first === "object" ? `{${Object.keys(first).join(", ")}}` : typeof first;
}

export function explainLayout(rec: CallRecord | undefined): { top: string[]; perResult: string[]; explained: number } {
  const out = { top: [] as string[], perResult: [] as string[], explained: 0 };
  if (!rec || rec.status !== 200) return out;
  const body = obj(rec.body);
  const top = obj(body.query).explainability;
  if (top && typeof top === "object") {
    for (const [signal, block] of Object.entries(top as Record<string, unknown>)) {
      if (block && typeof block === "object" && !Array.isArray(block)) {
        for (const [k, v] of Object.entries(block as Record<string, unknown>)) out.top.push(`query.explainability.${signal}.${k}[] ${itemKeys(v)}`);
      } else {
        out.top.push(`query.explainability.${signal} ${itemKeys(block)}`);
      }
    }
  }
  for (const row of list(obj(body.results).entities)) {
    const ex = obj(obj(row).query).explainability;
    if (!ex || !Object.values(ex as Record<string, unknown>).some((v) => Array.isArray(v) && v.length > 0)) continue;
    out.explained += 1;
    if (!out.perResult.length) for (const [signal, v] of Object.entries(ex as Record<string, unknown>)) out.perResult.push(`results.entities[].query.explainability.${signal}[] ${itemKeys(v)}`);
  }
  return out;
}

export function centerOf(rec: CallRecord | undefined): Point | null {
  const wkt = rec?.params["filter.location"] ?? rec?.params["signal.location"];
  return wkt ? parseWktPoint(wkt) : null;
}
