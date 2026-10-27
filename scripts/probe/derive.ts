import { countResults, num, parseEntities, parseTags, resultsOf, type QEntity } from "../../src/core/qloo/index.ts";
import { haversineM } from "../../src/core/street/geo.ts";
import { LOVED_RADIUS_M, MATCH_RADIUS_KM } from "./config.ts";
import { GAME_URNS, urnFor, type CityLocalities, type FollowUp, type Locality, type ResolvedVenue, type TrendTarget } from "./plan.ts";
import type { CallRecord } from "./record.ts";
import type { ProbeVenue } from "./venues.ts";

const STOP_WORDS = new Set(["the", "and", "of", "a"]);
const MIN_NAME_MATCH = 0.6;
const CITY_ADMIN_LEVEL = 5;
const TREND_ORDER = ["artist", "movie", "tv_show", "book", "podcast", "videogame"] as const;

export function answered(rec: CallRecord | undefined): rec is CallRecord {
  return rec !== undefined && rec.status === 200;
}

function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "" && !STOP_WORDS.has(w));
}

function nameMatch(wanted: string, found: string): number {
  const want = words(wanted);
  const got = new Set(words(found));
  return want.length ? want.filter((w) => got.has(w)).length / want.length : 0;
}

function sortByScore<T>(items: T[], score: (item: T) => number | null): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => (b.s ?? -Infinity) - (a.s ?? -Infinity) || a.i - b.i)
    .map((x) => x.item);
}

export function rawEntity(body: unknown, id: string): Record<string, any> | null {
  const r = resultsOf(body) as any;
  const rows: unknown[] = Array.isArray(r) ? r : Array.isArray(r?.entities) ? r.entities : [];
  const hit = rows.find((row: any) => typeof row?.entity_id === "string" && row.entity_id.toUpperCase() === id.toUpperCase());
  return (hit as Record<string, any>) ?? null;
}

export function localitiesFrom(rec: CallRecord | undefined): CityLocalities {
  if (!answered(rec)) return { app: null, best: null, all: [] };
  const all: Locality[] = parseEntities(rec.body).map((e) => ({
    id: e.id,
    name: e.name,
    label: e.disambiguation ?? e.name,
    adminLevel: num(rawEntity(rec.body, e.id)?.properties?.admin_level),
    lat: e.lat,
    lng: e.lng,
  }));
  const cityLevel = all.find((l) => l.adminLevel !== null && l.adminLevel >= CITY_ADMIN_LEVEL && l.lat !== null);
  return { app: all[0] ?? null, best: cityLevel ?? all[0] ?? null, all };
}

function closeEnough(e: QEntity, loc: CityLocalities): boolean {
  if (e.lat === null || e.lng === null) return false;
  const anchors = loc.all.filter((l) => l.lat !== null && l.lng !== null);
  if (!anchors.length) return true;
  const here = { lat: e.lat, lng: e.lng };
  return anchors.some((l) => haversineM(here, { lat: l.lat as number, lng: l.lng as number }) <= MATCH_RADIUS_KM * 1000);
}

function matchVenue(v: ProbeVenue, rec: CallRecord | undefined, loc: CityLocalities): QEntity | null {
  if (!answered(rec)) return null;
  return parseEntities(rec.body).find((e) => nameMatch(v.name, e.name) >= MIN_NAME_MATCH && closeEnough(e, loc)) ?? null;
}

export function resolveVenue(v: ProbeVenue, searches: CallRecord[], loc: CityLocalities): { resolved: ResolvedVenue; via: string } | null {
  for (const rec of searches) {
    const e = matchVenue(v, rec, loc);
    if (!e || e.lat === null || e.lng === null) continue;
    const props = rawEntity(rec.body, e.id)?.properties ?? {};
    const area = props.neighborhood ?? props.geocode?.name ?? v.city;
    return { resolved: { venue: v, id: e.id, name: e.name, lat: e.lat, lng: e.lng, area: String(area) }, via: rec.call };
  }
  return null;
}

export function rankOf(rec: CallRecord | undefined, id: string): number | null {
  if (!answered(rec)) return null;
  const i = parseEntities(rec.body).findIndex((e) => e.id.toUpperCase() === id.toUpperCase());
  return i < 0 ? null : i + 1;
}

export function gameUrnFrom(records: CallRecord[]): string {
  const games = GAME_URNS.map((urn) => ({ urn, rec: records.find((r) => r.call === `game_${urn.split(":").pop()}`) }));
  const withData = games.find((g) => answered(g.rec) && countResults(g.rec.body) > 0);
  const accepted = games.find((g) => answered(g.rec));
  return withData?.urn ?? accepted?.urn ?? GAME_URNS[0] ?? "urn:entity:videogame";
}

function topTags(rec: CallRecord | undefined): string[] {
  if (!answered(rec)) return [];
  return sortByScore(parseTags(rec.body), (t) => t.score).slice(0, 3).map((t) => t.id);
}

function topLoved(rec: CallRecord | undefined, v: ResolvedVenue): string[] {
  if (!answered(rec)) return [];
  const near = parseEntities(rec.body).filter(
    (e) => e.id.toUpperCase() !== v.id.toUpperCase() && e.lat !== null && e.lng !== null && haversineM(v, { lat: e.lat, lng: e.lng }) <= LOVED_RADIUS_M + 300,
  );
  return sortByScore(near, (e) => e.affinity).slice(0, 3).map((e) => e.id);
}

function trendTargets(byCall: Map<string, CallRecord>, gameUrn: string, max: number): TrendTarget[] {
  const out: TrendTarget[] = [];
  for (const type of TREND_ORDER) {
    if (out.length >= max) break;
    const rec = byCall.get(`cross_${type}_venue`);
    const first = answered(rec) ? sortByScore(parseEntities(rec.body), (e) => e.affinity)[0] : undefined;
    if (first) out.push({ label: type, urn: urnFor(type, gameUrn), id: first.id, name: first.name });
  }
  return out;
}

export function followUpFrom(v: ResolvedVenue, byCall: Map<string, CallRecord>, gameUrn: string): FollowUp {
  return {
    topTags: topTags(byCall.get("street_tags")),
    topLoved: topLoved(byCall.get("loved_places"), v),
    trendTargets: trendTargets(byCall, gameUrn, 1),
  };
}
