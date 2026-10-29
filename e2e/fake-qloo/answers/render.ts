import { geohash, type Point } from "../geo.ts";
import { hash, round, uuidFrom } from "../seed.ts";
import type { FakeWork } from "../world/media.ts";
import { WORK_URN } from "../world/media.ts";
import type { FakePlace } from "../world/places.ts";
import type { TagDef } from "../world/tags.ts";

const ENTITY_SIGNAL = "signal.interests.entities";

function geocode(p: FakePlace): Record<string, string> {
  return { name: p.city.neighborhood, city: p.city.name, admin1_region: p.city.region, country: p.city.country, country_code: p.city.countryCode };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Like the live data, nearly every entity carries an image on images.qloo.com and a few carry none.
function image(id: string): { url: string } | undefined {
  return hash(`image|${id}`) % 9 === 0 ? undefined : { url: `https://images.qloo.com/i/${id}-420x-auto.jpg` };
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Like the live data, about a third of places carry no hours, and some close all day once a week.
function hours(p: FakePlace): Record<string, unknown> | undefined {
  const h = hash(`hours|${p.id}`);
  if (h % 3 === 0) return undefined;
  const shut = h % 5 === 0 ? "monday" : null;
  return Object.fromEntries(DAYS.map((d) => [d, d === shut ? [{ closed: true }] : [{ closed: false, opens: "T11:00:00", closes: "T23:00:00" }]]));
}

function placeProperties(p: FakePlace): Record<string, unknown> {
  const genre = p.tags.find((t) => t.namespace === "urn:tag:genre:place" && t.id !== t.namespace);
  return {
    address: p.address,
    description: `${genre?.name ?? "Place"} in ${p.city.neighborhood}, ${p.city.name}.`,
    geocode: geocode(p),
    ...(image(p.id) ? { image: image(p.id) } : {}),
    neighborhood: p.city.neighborhood,
    is_closed: false,
    website: `https://${slug(p.name)}.example`,
    ...(hours(p) ? { hours: hours(p) } : {}),
    ...(genre ? { primary_genre: { id: genre.id, name: genre.name, type: genre.namespace } } : {}),
  };
}

function workProperties(w: FakeWork): Record<string, unknown> {
  const genres = w.tags.map((t) => t.name.toLowerCase()).join(" and ");
  const img = image(w.id);
  return { description: `${w.name}, ${genres}.`, ...(img ? { image: img } : {}) };
}

// /search lists tags as {name, tag_id, type, value} and the entity type in types[].
export function searchPlace(p: FakePlace): Record<string, unknown> {
  return {
    disambiguation: p.address,
    entity_id: p.id,
    location: { lat: round(p.point.lat, 7), lon: round(p.point.lng, 7) },
    name: p.name,
    popularity: round(p.popularity, 6),
    properties: placeProperties(p),
    tags: p.tags.map((t) => ({ name: t.name, tag_id: t.id, type: t.namespace, value: t.id })),
    types: ["urn:entity:place"],
  };
}

// With several entities in the signal, Qloo splits each result between them and the venue usually carries the most.
function shares(ids: string[], salt: number): Array<{ entity_id: string; score: number }> {
  if (ids.length === 1) return [{ entity_id: ids[0] as string, score: 1 }];
  const raw = ids.map((id, i) => (i === 0 ? 1.5 : 0.5 + ((Math.round(salt * 1e6) + id.length * (i + 1)) % 7) / 10));
  const total = raw.reduce((a, b) => a + b, 0);
  return ids.map((id, i) => ({ entity_id: id, score: round((raw[i] as number) / total, 4) })).sort((a, b) => b.score - a.score);
}

export interface Scored {
  affinity: number;
  distance?: number;
  explainedBy?: string[];
}

function scoreQuery(s: Scored): Record<string, unknown> {
  const q: Record<string, unknown> = { affinity: round(s.affinity, 6) };
  if (s.distance !== undefined) q.distance = round(s.distance, 3);
  if (s.explainedBy?.length) q.explainability = { [ENTITY_SIGNAL]: shares(s.explainedBy, s.affinity) };
  q.measurements = { audience_growth: 0 };
  return q;
}

// Insights lists tags as {id, name, type, weight} and the type in subtype.
export function insightsPlace(p: FakePlace, s: Scored): Record<string, unknown> {
  return {
    disambiguation: p.address,
    entity_id: p.id,
    location: { geohash: geohash(p.point, 12), lat: round(p.point.lat, 7), lon: round(p.point.lng, 7) },
    name: p.name,
    popularity: round(p.popularity, 6),
    properties: placeProperties(p),
    query: scoreQuery(s),
    references: null,
    subtype: "urn:entity:place",
    tags: p.tags.map((t) => ({ id: t.id, name: t.name, type: t.namespace, weight: null })),
    type: "urn:entity",
  };
}

export function insightsWork(w: FakeWork, popularity: number, s: Scored): Record<string, unknown> {
  const query = scoreQuery(s);
  if (w.type === "book") delete query.measurements;
  return {
    disambiguation: w.disambiguation,
    entity_id: w.id,
    name: w.name,
    popularity: round(popularity, 6),
    properties: workProperties(w),
    query,
    subtype: WORK_URN[w.type],
    tags: w.tags.map((t) => ({ id: t.id, name: t.name, type: t.namespace })),
    type: "urn:entity",
  };
}

export function tagModeRow(t: TagDef, affinity: number, popularity: number): Record<string, unknown> {
  return {
    name: t.name,
    popularity: round(popularity, 8),
    query: { affinity: round(affinity, 6) },
    subtype: t.namespace,
    tag_id: t.id,
    tag_value: t.id,
    types: ["urn:entity:place"],
  };
}

export function compareTagRow(t: TagDef, popularity: number, query: Record<string, unknown>): Record<string, unknown> {
  return { entity_id: uuidFrom(`tag|${t.id}`), name: t.name, popularity: round(popularity, 8), query, subtype: t.namespace, tag_id: t.id, type: "urn:tag" };
}

export function heatCell(p: Point, query: Record<string, number>): Record<string, unknown> {
  return { location: { geohash: geohash(p, 7), latitude: round(p.lat, 5), longitude: round(p.lng, 5) }, query };
}

// Entity signals add a top level explainability summary; a location signal adds the panel size.
export function insightsEnvelope(key: "entities" | "tags" | "heatmap" | "demographics", rows: unknown[], extra: { explained?: string[]; located?: boolean } = {}): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (extra.explained?.length) {
    const effect = shares(extra.explained, 0.5).map((x) => ({ avg_score: x.score, entity_id: x.entity_id }));
    query.explainability = {
      [ENTITY_SIGNAL]: { effect_on_all_recs: effect, effect_on_top10_recs: effect, effect_on_top3_recs: effect, effect_on_top5_recs: effect },
    };
  }
  if (extra.located) query.geospatial = { panel_size: { context: 4314640207, target: 18640233 } };
  return { ...(Object.keys(query).length ? { query } : {}), results: { [key]: rows }, success: true };
}
