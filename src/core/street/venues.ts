import type { VenueCandidate } from "../../shared/contract.ts";
import { MILE_M, cityNamed } from "../../shared/cities.ts";
import { haversineM, type LatLng } from "../../shared/geo.ts";
import type { Qloo } from "../qloo/client.ts";
import { parseEntities, type QEntity } from "../qloo/entities.ts";
import { QlooError } from "../qloo/errors.ts";
import { checkLatLng, searchNear } from "../qloo/location.ts";
import { TYPE_URN } from "../qloo/urns.ts";
import { uniqueBy } from "./rank.ts";
import { namedLike, rankResults } from "./search_rank.ts";

export const MAX_CANDIDATES = 8;
// Enough answers to rank by name and distance before the list is cut to eight.
const GEO_TAKE = 20;
export const NEAR_MILES = 1;

export interface FindOptions {
  // The owner's position for this one search. It goes to Qloo as the search point and is never stored.
  near?: LatLng;
}

function cleanInput(v: string, field: string): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s || s.length > 120) throw new QlooError("bad_request", 400, `${field} must be between 1 and 120 characters`);
  return s;
}

function words(s: string): string {
  const plain = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ` ${plain} `;
}

// The city word in the query is matched as text, not as a place, so a namesake elsewhere can rank first.
export function inCity(e: QEntity, city: string): boolean {
  const where = words([e.address, e.disambiguation, ...e.areaNames].filter((s): s is string => Boolean(s)).join(" "));
  return where.includes(words(city));
}

// /search is fuzzy and never answers empty, even for nonsense, so the owner picks from addresses.
async function search(q: Qloo, call: string, params: Record<string, string>): Promise<QEntity[]> {
  const { body } = await q.get(call, "/search", { types: TYPE_URN.place, take: String(MAX_CANDIDATES), ...params });
  return parseEntities(body).filter((e) => e.type === "place");
}

function within(hits: QEntity[], from: LatLng, miles: number): QEntity[] {
  return hits.filter((e) => e.lat !== null && e.lng !== null && haversineM(from, { lat: e.lat, lng: e.lng }) <= miles * MILE_M);
}

async function geoSearch(q: Qloo, call: string, name: string, from: LatLng, miles: number): Promise<QEntity[]> {
  return within(await search(q, call, { query: name, take: String(GEO_TAKE), ...searchNear(from.lat, from.lng, miles) }), from, miles);
}

// Name plus city as text, then the name alone, for a city that is not on the list or a geo search that came back empty.
async function textSearch(q: Qloo, name: string, city: string): Promise<QEntity[]> {
  let hits = await search(q, "find_venue", { query: `${name} ${city}` });
  if (!hits.some((h) => inCity(h, city))) {
    hits = uniqueBy([...hits, ...(await search(q, "find_venue_by_name", { query: name }))], (h) => [h.id.toUpperCase()]);
  }
  // A namesake in another country only gets in the owner's way once the right city has a hit.
  const local = hits.filter((h) => inCity(h, city));
  return local.length ? local : hits;
}

function named(rows: VenueCandidate[], typed: string): VenueCandidate[] {
  return namedLike(rows, typed).slice(0, MAX_CANDIDATES);
}

export async function findVenues(q: Qloo, name: string, city: string, opts: FindOptions = {}): Promise<VenueCandidate[]> {
  const venueName = cleanInput(name, "name");
  if (opts.near) {
    checkLatLng(opts.near.lat, opts.near.lng);
    return rankResults(await geoSearch(q, "find_venue_near", venueName, opts.near, NEAR_MILES), venueName, opts.near, MAX_CANDIDATES);
  }
  const cityName = cleanInput(city, "city");
  const listed = cityNamed(cityName);
  if (listed) {
    const centre = { lat: listed.lat, lng: listed.lng };
    const hits = await geoSearch(q, "find_venue_in_city", venueName, centre, listed.miles);
    if (hits.length) return named(rankResults(hits, venueName, centre, GEO_TAKE), venueName);
    return named(rankResults(await textSearch(q, venueName, listed.name), venueName, centre, GEO_TAKE), venueName);
  }
  return named(rankResults(await textSearch(q, venueName, cityName), venueName, null, GEO_TAKE), venueName);
}
