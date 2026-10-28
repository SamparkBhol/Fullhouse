import type { VenueCandidate } from "../../shared/contract.ts";
import type { Qloo } from "../qloo/client.ts";
import { parseEntities, type QEntity } from "../qloo/entities.ts";
import { QlooError } from "../qloo/errors.ts";
import { TYPE_URN } from "../qloo/urns.ts";
import { uniqueBy } from "./rank.ts";

export const MAX_CANDIDATES = 8;

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

function toCandidate(e: QEntity): VenueCandidate | null {
  if (e.lat === null || e.lng === null) return null;
  const c: VenueCandidate = { id: e.id, name: e.name, type: "place", lat: e.lat, lng: e.lng, tags: e.tags.map((t) => t.id) };
  const address = e.address ?? e.disambiguation;
  if (address) c.address = address;
  if (e.image) c.image = e.image;
  if (e.url) c.url = e.url;
  return c;
}

// /search is fuzzy and never answers empty, even for nonsense, so the owner picks from addresses.
async function search(q: Qloo, call: string, query: string): Promise<QEntity[]> {
  const { body } = await q.get(call, "/search", { query, types: TYPE_URN.place, take: String(MAX_CANDIDATES) });
  return parseEntities(body).filter((e) => e.type === "place");
}

// Name plus city in one query found every probe venue; a locality lookup first sent "New York" to the state's centroid.
export async function findVenues(q: Qloo, name: string, city: string): Promise<VenueCandidate[]> {
  const venueName = cleanInput(name, "name");
  const cityName = cleanInput(city, "city");
  let hits = await search(q, "find_venue", `${venueName} ${cityName}`);
  if (!hits.some((h) => inCity(h, cityName))) {
    hits = uniqueBy([...hits, ...(await search(q, "find_venue_by_name", venueName))], (h) => [h.id.toUpperCase()]);
  }
  // A namesake in another country only gets in the owner's way once the right city has a hit.
  const local = hits.filter((h) => inCity(h, cityName));
  return (local.length ? local : hits)
    .map(toCandidate)
    .filter((c): c is VenueCandidate => c !== null)
    .slice(0, MAX_CANDIDATES);
}
