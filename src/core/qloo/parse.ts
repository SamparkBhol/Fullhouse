import type { QlooType } from "../../shared/contract.ts";
import { typeFromUrn } from "./request.ts";

export interface QTag {
  id: string;
  name: string;
  namespace: string;
  score: number | null;
  popularity: number | null;
}

export interface ExplainRow {
  input: string;
  source: string;
  score: number;
}

export interface QEntity {
  id: string;
  name: string;
  type: QlooType | null;
  subtype?: string;
  popularity: number | null;
  affinity: number | null;
  distanceM: number | null;
  lat: number | null;
  lng: number | null;
  address?: string;
  disambiguation?: string;
  image?: string;
  url?: string;
  tags: QTag[];
  explain: ExplainRow[];
  trendRank: number | null;
}

export interface QCell {
  geohash: string;
  lat: number;
  lng: number;
  affinity: number | null;
  affinityRank: number | null;
  popularity: number | null;
}

export interface QDemo {
  input: string;
  age: Record<string, number>;
  gender: Record<string, number>;
}

export interface TrendPoint {
  date: string;
  percentile: number | null;
  rank: number | null;
  rankVelocity: number | null;
  foldChange: number | null;
  percentDelta: number | null;
}

export interface QTrending {
  points: TrendPoint[];
  ranked: Array<{ id: string; name: string; trendRank: number | null }>;
}

type Obj = Record<string, any>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function resultsOf(body: unknown): unknown {
  return isObj(body) ? body.results : undefined;
}

function arrayAt(body: unknown, key: string): unknown[] {
  const r = resultsOf(body);
  if (isObj(r) && Array.isArray(r[key])) return r[key];
  if (key === "entities" && Array.isArray(r)) return r;
  return [];
}

export function countResults(body: unknown): number {
  const r = resultsOf(body);
  if (Array.isArray(r)) return r.length;
  if (isObj(r)) {
    for (const key of ["entities", "tags", "heatmap", "demographics", "trending", "audiences"]) {
      if (Array.isArray(r[key])) return r[key].length;
    }
  }
  return 0;
}

export function stripVerbose<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripVerbose(v)) as T;
  if (!isObj(value)) return value;
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "akas" || k === "short_descriptions") continue;
    out[k] = stripVerbose(v);
  }
  return out as T;
}

export function tagNamespace(id: string): string {
  const parts = id.split(":");
  return parts.length >= 4 ? parts.slice(0, 4).join(":") : id;
}

export function tagLabel(idOrName: string): string {
  if (!idOrName.startsWith("urn:")) return idOrName;
  const last = idOrName.split(":").pop() ?? idOrName;
  return last.replace(/_/g, " ").trim();
}

export function parseTag(raw: unknown): QTag | null {
  if (!isObj(raw)) return null;
  const id = str(raw.tag_id) ?? str(raw.id) ?? str(raw.tag_value);
  if (!id) return null;
  const pickNs = (v: unknown) => {
    const s = str(v);
    return s && s.startsWith("urn:tag:") ? s : undefined;
  };
  const namespace = pickNs(raw.subtype) ?? pickNs(raw.type) ?? tagNamespace(id);
  const q = isObj(raw.query) ? raw.query : {};
  const score = num(q.affinity) ?? num(q.score) ?? num(raw.affinity) ?? num(raw.score);
  return {
    id,
    name: str(raw.name) ?? tagLabel(id),
    namespace,
    score,
    popularity: num(raw.popularity),
  };
}

function looksLikeTag(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  const id = str(raw.tag_id) ?? str(raw.id) ?? "";
  return typeof raw.tag_id === "string" || id.startsWith("urn:tag:");
}

export function parseTags(body: unknown): QTag[] {
  let rows = arrayAt(body, "tags");
  if (!rows.length) {
    const r = resultsOf(body);
    if (Array.isArray(r)) rows = r.filter(looksLikeTag);
    else if (isObj(r) && Array.isArray(r.entities)) rows = r.entities.filter(looksLikeTag);
  }
  const seen = new Set<string>();
  const out: QTag[] = [];
  for (const row of rows) {
    const t = parseTag(row);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function parseExplainability(raw: unknown, source = "", depth = 0): ExplainRow[] {
  const rows: ExplainRow[] = [];
  if (depth > 3 || raw === null || raw === undefined) return rows;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isObj(item)) continue;
      const input = str(item.entity_id) ?? str(item.id) ?? str(item.tag_id) ?? str(item.input) ?? str(item.name);
      const score = num(item.score) ?? num(item.value) ?? num(item.weight) ?? num(item.affinity) ?? num(item.contribution);
      if (input && score !== null) rows.push({ input, source: str(item.signal) ?? str(item.type) ?? source, score });
    }
  } else if (isObj(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (key === "warning" || key === "warnings") continue;
      const n = num(value);
      if (n !== null) rows.push({ input: key, source, score: n });
      else rows.push(...parseExplainability(value, key, depth + 1));
    }
  }
  return rows;
}

function explainFor(raw: Obj): ExplainRow[] {
  const q = isObj(raw.query) ? raw.query : {};
  const rows = parseExplainability(q.explainability ?? raw.explainability);
  const best = new Map<string, ExplainRow>();
  for (const r of rows) {
    const prev = best.get(r.input);
    if (!prev || r.score > prev.score) best.set(r.input, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.input.localeCompare(b.input));
}

export function topExplainability(body: unknown): ExplainRow[] {
  if (!isObj(body) || !isObj(body.query)) return [];
  const ex = body.query.explainability;
  if (!isObj(ex)) return [];
  const all = ex.all ?? ex.top_10 ?? ex.top_5 ?? ex.top_3;
  return parseExplainability(all).sort((a, b) => b.score - a.score);
}

export function explainWarning(body: unknown): string | null {
  if (!isObj(body) || !isObj(body.query) || !isObj(body.query.explainability)) return null;
  return str(body.query.explainability.warning) ?? null;
}

function coords(raw: Obj): { lat: number | null; lng: number | null } {
  const p = isObj(raw.properties) ? raw.properties : {};
  const candidates: Obj[] = [p, raw, isObj(p.location) ? p.location : {}, isObj(raw.location) ? raw.location : {}, isObj(p.geocode) ? p.geocode : {}];
  for (const c of candidates) {
    const lat = num(c.lat) ?? num(c.latitude);
    const lng = num(c.lon) ?? num(c.lng) ?? num(c.longitude);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return { lat: null, lng: null };
}

function entityType(raw: Obj): { type: QlooType | null; subtype?: string } {
  const candidates: unknown[] = [raw.subtype, ...(Array.isArray(raw.types) ? raw.types : []), raw.type];
  for (const c of candidates) {
    const t = typeFromUrn(c);
    if (t) {
      const sub = typeof c === "string" && c.split(":").length > 3 ? c : undefined;
      return sub ? { type: t, subtype: sub } : { type: t };
    }
  }
  return { type: null };
}

export function parseEntity(raw: unknown): QEntity | null {
  if (!isObj(raw)) return null;
  const id = str(raw.entity_id) ?? str(raw.id);
  const p = isObj(raw.properties) ? raw.properties : {};
  const name = str(raw.name) ?? str(p.title) ?? str(p.name);
  if (!id || !name || id.startsWith("urn:tag:")) return null;
  const q = isObj(raw.query) ? raw.query : {};
  const { lat, lng } = coords(raw);
  const { type, subtype } = entityType(raw);
  const image = isObj(p.image) ? str(p.image.url) : str(p.image) ?? (isObj(raw.image) ? str(raw.image.url) : undefined);
  const tags: QTag[] = [];
  if (Array.isArray(raw.tags)) {
    for (const t of raw.tags) {
      const tag = parseTag(t);
      if (tag) tags.push(tag);
    }
  }
  const e: QEntity = {
    id,
    name,
    type,
    popularity: num(raw.popularity) ?? num(p.popularity),
    affinity: num(q.affinity) ?? num(raw.affinity) ?? num(p.affinity),
    distanceM: num(q.distance) ?? num(raw.distance),
    lat,
    lng,
    tags,
    explain: explainFor(raw),
    trendRank: num(p.trend_rank) ?? num(raw.trend_rank) ?? num(q.trend_rank),
  };
  if (subtype) e.subtype = subtype;
  const address = str(p.address) ?? str(raw.address);
  if (address) e.address = address;
  const dis = str(raw.disambiguation) ?? str(p.disambiguation);
  if (dis) e.disambiguation = dis;
  if (image) e.image = image;
  const url = str(p.website) ?? str(raw.website);
  if (url && /^https?:\/\//i.test(url)) e.url = url;
  return e;
}

export function parseEntities(body: unknown): QEntity[] {
  const rows = arrayAt(body, "entities");
  const seen = new Set<string>();
  const out: QEntity[] = [];
  for (const row of rows) {
    if (looksLikeTag(row)) continue;
    const e = parseEntity(row);
    if (e && !seen.has(e.id.toUpperCase())) {
      seen.add(e.id.toUpperCase());
      out.push(e);
    }
  }
  return out;
}

export function parseHeatmap(body: unknown): QCell[] {
  const r = resultsOf(body);
  let rows: unknown[] = [];
  if (isObj(r) && Array.isArray(r.heatmap)) rows = r.heatmap;
  else if (isObj(r) && isObj(r.heatmap) && Array.isArray(r.heatmap.cells)) rows = r.heatmap.cells;
  else if (Array.isArray(r)) rows = r;
  const out: QCell[] = [];
  for (const row of rows) {
    if (!isObj(row)) continue;
    const loc = isObj(row.location) ? row.location : row;
    const lat = num(loc.latitude) ?? num(loc.lat);
    const lng = num(loc.longitude) ?? num(loc.lng) ?? num(loc.lon);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const q = isObj(row.query) ? row.query : row;
    out.push({
      geohash: str(loc.geohash) ?? str(row.geohash) ?? `${lat.toFixed(5)},${lng.toFixed(5)}`,
      lat,
      lng,
      affinity: num(q.affinity),
      affinityRank: num(q.affinity_rank),
      popularity: num(q.popularity),
    });
  }
  return out;
}

export function parseDemographics(body: unknown): QDemo[] {
  const out: QDemo[] = [];
  for (const row of arrayAt(body, "demographics")) {
    if (!isObj(row)) continue;
    const q = isObj(row.query) ? row.query : row;
    const age: Record<string, number> = {};
    const gender: Record<string, number> = {};
    if (isObj(q.age)) for (const [k, v] of Object.entries(q.age)) { const n = num(v); if (n !== null) age[k] = n; }
    if (isObj(q.gender)) for (const [k, v] of Object.entries(q.gender)) { const n = num(v); if (n !== null) gender[k] = n; }
    if (Object.keys(age).length || Object.keys(gender).length) {
      out.push({ input: str(row.entity_id) ?? str(row.id) ?? "", age, gender });
    }
  }
  return out;
}

function parsePoint(raw: unknown): TrendPoint | null {
  if (!isObj(raw)) return null;
  const date = str(raw.date) ?? str(raw.week);
  if (!date) return null;
  return {
    date,
    percentile: num(raw.population_percentile),
    rank: num(raw.population_rank),
    rankVelocity: num(raw.population_rank_velocity),
    foldChange: num(raw.velocity_fold_change),
    percentDelta: num(raw.population_percent_delta),
  };
}

export function parseTrending(body: unknown, entityId?: string): QTrending {
  const r = resultsOf(body);
  const points: TrendPoint[] = [];
  const ranked: QTrending["ranked"] = [];
  const want = entityId?.toUpperCase();
  const trendingRows = isObj(r) && Array.isArray(r.trending) ? r.trending : Array.isArray(r) ? r : [];
  for (const row of trendingRows) {
    const pt = parsePoint(row);
    if (pt) {
      points.push(pt);
      continue;
    }
    if (isObj(row)) {
      const id = (str(row.entity_id) ?? str(row.id) ?? "").toUpperCase();
      const series = [row.trending, row.points, row.data, row.series].find(Array.isArray) as unknown[] | undefined;
      if (series && (!want || id === want)) {
        for (const s of series) {
          const p = parsePoint(s);
          if (p) points.push(p);
        }
      }
    }
  }
  if (isObj(r) && Array.isArray(r.entities)) {
    r.entities.forEach((row: unknown, i: number) => {
      const e = parseEntity(row);
      if (e) ranked.push({ id: e.id, name: e.name, trendRank: e.trendRank ?? i + 1 });
    });
  }
  points.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { points, ranked };
}
