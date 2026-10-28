import { geohash, type Point } from "../geo.ts";
import { round, uuidFrom } from "../seed.ts";
import type { FakeWork } from "../world/media.ts";
import { WORK_URN } from "../world/media.ts";
import type { FakePlace } from "../world/places.ts";
import type { TagDef } from "../world/tags.ts";

const ENTITY_SIGNAL = "signal.interests.entities";

function geocode(p: FakePlace): Record<string, string> {
  return { name: p.city.neighborhood, city: p.city.name, admin1_region: p.city.region, country: p.city.country, country_code: p.city.countryCode };
}

function placeProperties(p: FakePlace): Record<string, unknown> {
  const genre = p.tags.find((t) => t.namespace === "urn:tag:genre:place" && t.id !== t.namespace);
  return {
    address: p.address,
    geocode: geocode(p),
    neighborhood: p.city.neighborhood,
    is_closed: false,
    ...(genre ? { primary_genre: { id: genre.id, name: genre.name, type: genre.namespace } } : {}),
  };
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

export interface Scored {
  affinity: number;
  distance?: number;
  explainedBy?: string[];
}

function scoreQuery(s: Scored): Record<string, unknown> {
  const q: Record<string, unknown> = { affinity: round(s.affinity, 6) };
  if (s.distance !== undefined) q.distance = round(s.distance, 3);
  if (s.explainedBy?.length) q.explainability = { [ENTITY_SIGNAL]: s.explainedBy.map((id) => ({ entity_id: id, score: 1 })) };
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
    properties: {},
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
    const effect = extra.explained.map((id) => ({ avg_score: 1, entity_id: id }));
    query.explainability = {
      [ENTITY_SIGNAL]: { effect_on_all_recs: effect, effect_on_top10_recs: effect, effect_on_top3_recs: effect, effect_on_top5_recs: effect },
    };
  }
  if (extra.located) query.geospatial = { panel_size: { context: 4314640207, target: 18640233 } };
  return { ...(Object.keys(query).length ? { query } : {}), results: { [key]: rows }, success: true };
}
