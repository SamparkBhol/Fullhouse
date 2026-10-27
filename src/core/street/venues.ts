import type { VenueCandidate } from "../../shared/contract.ts";
import { QlooError, type Qloo } from "../qloo/client.ts";
import { parseEntities, type QEntity } from "../qloo/parse.ts";
import { TYPE_URN, searchNear } from "../qloo/request.ts";

export const MAX_CANDIDATES = 8;
const CITY_RADIUS_MILES = 30;

function fatal(err: unknown): boolean {
  return err instanceof QlooError && (err.kind === "auth" || err.kind === "budget");
}

async function search(q: Qloo, call: string, params: Record<string, string>): Promise<QEntity[]> {
  try {
    const { body } = await q.get(call, "/search", params);
    return parseEntities(body);
  } catch (err) {
    if (err instanceof QlooError && err.kind === "not_found") return [];
    throw err;
  }
}

function toCandidate(e: QEntity): VenueCandidate | null {
  if (e.lat === null || e.lng === null) return null;
  const c: VenueCandidate = {
    id: e.id,
    name: e.name,
    type: "place",
    lat: e.lat,
    lng: e.lng,
    tags: e.tags.map((t) => t.id),
  };
  if (e.subtype) c.subtype = e.subtype;
  const address = e.address ?? e.disambiguation;
  if (address) c.address = address;
  if (e.image) c.image = e.image;
  if (e.url) c.url = e.url;
  return c;
}

function cleanInput(v: string, field: string): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s || s.length > 120) throw new QlooError("bad_request", 400, `${field} must be between 1 and 120 characters`);
  return s;
}

export async function findVenues(q: Qloo, name: string, city: string): Promise<VenueCandidate[]> {
  const venueName = cleanInput(name, "name");
  const cityName = cleanInput(city, "city");
  const placeType = TYPE_URN.place;

  let near: Record<string, string> | null = null;
  try {
    const localities = await search(q, "find_city", { query: cityName, types: "urn:entity:locality", take: "1" });
    const loc = localities[0];
    if (loc && loc.lat !== null && loc.lng !== null) near = searchNear(loc.lat, loc.lng, CITY_RADIUS_MILES);
    else if (loc) near = { "filter.location": loc.id, "filter.radius": String(CITY_RADIUS_MILES) };
  } catch (err) {
    if (fatal(err)) throw err;
  }

  let hits: QEntity[] = [];
  if (near) {
    hits = await search(q, "find_venue", { query: venueName, types: placeType, take: String(MAX_CANDIDATES), ...near });
  }
  if (!hits.length) {
    hits = await search(q, "find_venue_by_address", {
      query: venueName,
      types: placeType,
      "filter.address": cityName,
      take: String(MAX_CANDIDATES),
    });
  }
  hits = hits.filter((h) => h.type === null || h.type === "place").slice(0, MAX_CANDIDATES);

  const missing = hits.filter((h) => h.lat === null || h.lng === null).map((h) => h.id);
  if (missing.length) {
    try {
      const { body } = await q.get("hydrate_venues", "/entities", { entity_ids: missing });
      const byId = new Map(parseEntities(body).map((e) => [e.id.toUpperCase(), e]));
      hits = hits.map((h) => {
        const full = byId.get(h.id.toUpperCase());
        if (!full || full.lat === null || full.lng === null) return h;
        return { ...h, lat: full.lat, lng: full.lng, address: h.address ?? full.address, tags: h.tags.length ? h.tags : full.tags };
      });
    } catch (err) {
      if (fatal(err)) throw err;
    }
  }

  const out: VenueCandidate[] = [];
  for (const h of hits) {
    const c = toCandidate(h);
    if (c) out.push(c);
  }
  return out;
}
