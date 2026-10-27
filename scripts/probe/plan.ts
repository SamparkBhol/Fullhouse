import type { QlooType } from "../../src/shared/contract.ts";
import {
  TYPE_URN,
  locationFilter,
  locationSignal,
  searchNear,
  trendWindow,
  type Params,
} from "../../src/core/qloo/index.ts";
import { CITY_RADIUS_MILES, HEAT_RADIUS_M, LOVED_RADIUS_M, TREND_WEEKS } from "./config.ts";
import type { ArrayStyle } from "./record.ts";
import { NAME_ONLY_SEARCH, UNTYPED_SEARCH, citySlug, type ProbeVenue } from "./venues.ts";

export type CallGroup = "city" | "global" | "resolve" | "app" | "experiment";

export interface CallSpec {
  scope: string;
  call: string;
  group: CallGroup;
  path: string;
  params: Params;
  arrays?: ArrayStyle;
  question?: string;
}

export interface Point {
  lat: number;
  lng: number;
}

export interface Locality {
  id: string;
  name: string;
  label: string;
  adminLevel: number | null;
  lat: number | null;
  lng: number | null;
}

export interface CityLocalities {
  app: Locality | null;
  best: Locality | null;
  all: Locality[];
}

export interface ResolvedVenue extends Point {
  venue: ProbeVenue;
  id: string;
  name: string;
  area: string;
}

export interface TrendTarget {
  label: string;
  urn: string;
  id: string;
  name: string;
}

export interface FollowUp {
  topTags: string[];
  topLoved: string[];
  trendTargets: TrendTarget[];
}

// The app's settings when the probe ran, kept as they were so reruns still match the cached answers.
export const APP_MAX_HEAT_CELLS = 400;
export const APP_STREET_TAG_TYPES = [
  "urn:tag:genre:media",
  "urn:tag:genre:music",
  "urn:tag:keyword:media",
  "urn:tag:ambience:qloo",
  "urn:tag:cuisine:qloo",
  "urn:tag:genre:place",
  "urn:tag:good_for:qloo",
  "urn:tag:menu_highlight:qloo",
  "urn:tag:specialty_dish:place",
  "urn:tag:dining_options:place",
];

export const CROSS_TYPES: QlooType[] = ["artist", "book", "movie", "tv_show", "podcast", "videogame"];
export const GAME_URNS = ["urn:entity:videogame", "urn:entity:video_game"];
export const PLACE = TYPE_URN.place;

export function spec(scope: string, group: CallGroup, call: string, path: string, params: Params, question?: string): CallSpec {
  const s: CallSpec = { scope, call, group, path, params };
  if (question) s.question = question;
  return s;
}

export function streetTagParams(): Params {
  return { "filter.type": "urn:tag", "filter.tag.types": APP_STREET_TAG_TYPES, "diversify.by": "subtype", "diversify.take": "5", take: "50" };
}

export function crossParams(urn: string, signal: Params, biased = true): Params {
  const p: Params = { "filter.type": urn, ...signal, "feature.explainability": "true", take: "10" };
  if (biased) p["bias.trends"] = "high";
  return p;
}

export function lovedParams(v: ResolvedVenue, signal: Params): Params {
  return { "filter.type": PLACE, ...locationFilter(v.lat, v.lng, LOVED_RADIUS_M), ...signal, take: "30" };
}

export function trendParams(t: TrendTarget, window: { start: string; end: string }, take = 10): Params {
  return { "filter.type": t.urn, "signal.interests.entities": t.id, "filter.start_date": window.start, "filter.end_date": window.end, take: String(take) };
}

export function urnFor(type: QlooType, gameUrn: string): string {
  return type === "videogame" ? gameUrn : TYPE_URN[type];
}

function venueCrossParams(type: QlooType, v: ResolvedVenue, gameUrn: string): Params {
  return crossParams(urnFor(type, gameUrn), { "signal.interests.entities": v.id, ...locationSignal(v.lat, v.lng) }, false);
}

export function cityCall(city: string): CallSpec {
  return spec("_cities", "city", citySlug(city), "/search", { query: city, types: "urn:entity:locality", take: "3" }, "Which locality does a bare city name resolve to, and with what coordinates?");
}

export function globalCalls(anchor: Point, now: Date): CallSpec[] {
  const g = (call: string, path: string, params: Params, question: string) => spec("_global", "global", call, path, params, question);
  const week = trendWindow(now, 1);
  return [
    g("api_info", "/", {}, "Does the key work, and what does the information endpoint return?"),
    ...GAME_URNS.map((urn) =>
      g(`game_${urn.split(":").pop()}`, "/v2/insights", { "filter.type": urn, ...locationSignal(anchor.lat, anchor.lng), take: "5" }, `Does insights accept ${urn}?`),
    ),
    g("search_nonsense", "/search", { query: "qzxv wublo frandt", types: PLACE, take: "5" }, "What does a search with no match return?"),
    g("tag_types_place", "/v2/tags/types", { "filter.parents.types": PLACE, take: "50" }, "Which tag namespaces exist for places?"),
    g("trending_ranked_artist", "/v2/trending", { "filter.type": TYPE_URN.artist, "filter.start_date": week.start, "filter.end_date": week.end, take: "10" }, "Without an entity, does trending return a ranked list?"),
  ];
}

function nearParams(loc: Locality): Params {
  if (loc.lat !== null && loc.lng !== null) return searchNear(loc.lat, loc.lng, CITY_RADIUS_MILES);
  return { "filter.location": loc.id, "filter.radius": String(CITY_RADIUS_MILES) };
}

export function resolveCalls(v: ProbeVenue, loc: CityLocalities): CallSpec[] {
  const r = (call: string, params: Params, question: string) => spec(v.slug, "resolve", call, "/search", params, question);
  const calls = [r("search_name_city", { query: `${v.name} ${v.city}`, types: PLACE, take: "8" }, "Does a city word in the query find the venue?")];
  if (loc.app) {
    calls.push(r("search_near", { query: v.name, types: PLACE, take: "8", ...nearParams(loc.app) }, "Does the app's search near the first locality hit find the venue?"));
  }
  if (loc.best && loc.best.id !== loc.app?.id) {
    calls.push(r("search_near_city", { query: v.name, types: PLACE, take: "8", ...nearParams(loc.best) }, "Does a search near the city level locality find the venue?"));
  }
  if (NAME_ONLY_SEARCH.has(v.slug)) {
    calls.push(r("search_name_only", { query: v.name, types: PLACE, take: "8" }, "How many namesakes come back with no location context?"));
  }
  if (UNTYPED_SEARCH.has(v.slug)) {
    calls.push(r("search_untyped", { query: `${v.name} ${v.city}`, take: "8" }, "Which entity types come back without a types filter?"));
  }
  return calls;
}

export function streetCalls(v: ResolvedVenue, gameUrn: string): CallSpec[] {
  const a = (call: string, path: string, params: Params) => spec(v.venue.slug, "app", call, path, params);
  const sig = locationSignal(v.lat, v.lng);
  return [
    a("street_tags", "/v2/insights", { ...streetTagParams(), ...sig }),
    a("venue_tags", "/v2/insights", { ...streetTagParams(), "signal.interests.entities": v.id }),
    a("loved_places", "/v2/insights", { ...lovedParams(v, sig), "filter.exclude.entities": v.id, "feature.explainability": "true" }),
    a("heat_venue", "/v2/insights", { "filter.type": "urn:heatmap", ...locationFilter(v.lat, v.lng, HEAT_RADIUS_M), "signal.interests.entities": v.id }),
    a("cross_artist", "/v2/insights", crossParams(TYPE_URN.artist, sig)),
    ...CROSS_TYPES.map((t) => a(`cross_${t}_venue`, "/v2/insights", venueCrossParams(t, v, gameUrn))),
  ];
}

export function followUpCalls(v: ResolvedVenue, f: FollowUp, now: Date): CallSpec[] {
  const a = (call: string, path: string, params: Params) => spec(v.venue.slug, "app", call, path, params);
  const sig = locationSignal(v.lat, v.lng);
  const calls: CallSpec[] = [];
  if (f.topTags.length) {
    calls.push(
      a("heat_street", "/v2/insights", {
        "filter.type": "urn:heatmap",
        ...locationFilter(v.lat, v.lng, HEAT_RADIUS_M),
        "signal.interests.tags": f.topTags,
        "operator.signal.interests.tags": "union",
      }),
      a("demographics", "/v2/insights", { "filter.type": "urn:demographics", ...sig, "signal.interests.tags": f.topTags }),
    );
  }
  if (f.topLoved.length) {
    calls.push(a("compare", "/v2/analysis/compare", { "a.signal.interests.entities": v.id, "b.signal.interests.entities": f.topLoved, take: "20" }));
  }
  const window = trendWindow(now, TREND_WEEKS);
  for (const t of f.trendTargets) calls.push(a(`trending_${t.label}`, "/v2/trending", trendParams(t, window, 30)));
  return calls;
}
