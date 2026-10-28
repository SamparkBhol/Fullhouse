import type { Query } from "../params.ts";
import { takeOf } from "../params.ts";
import { CITIES, splitQuery } from "../world/cities.ts";
import { placesAround, venueFromQuery, type FakePlace } from "../world/places.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { ok, searchInvalid, type Answer } from "./answer.ts";
import { searchPlace } from "./render.ts";

const WKT = /^\s*(POINT|POLYGON|MULTIPOLYGON)\s*\(/i;

// Like the live search it is fuzzy and never empty: the named place first, then namesakes in other cities,
// then a few places near the first hit.
export function search(q: Query, places: PlaceRegistry): Answer {
  const location = q.one("filter.location");
  if (location && WKT.test(location)) return searchInvalid("filter.location must be in the form lat,lon");
  const radius = q.one("filter.radius");
  if (radius !== undefined && !(Number(radius) >= 0 && Number(radius) <= 100)) return searchInvalid("filter.radius must be between 0 and 100");
  const take = takeOf(q, 20);
  if (take === null) return searchInvalid("take must be an integer between 1 and 50");
  const types = q.list("types");
  if (types.length && !types.includes("urn:entity:place")) return ok({ results: [] });
  const text = q.one("query");
  if (!text) return searchInvalid("query is required");

  const { name, city } = splitQuery(text);
  const asked = name || text;
  const hits: FakePlace[] = [];
  if (city && name) hits.push(venueFromQuery(name, city));
  for (const other of CITIES) if (other !== city) hits.push(venueFromQuery(asked, other));
  const first = hits[0];
  if (first) hits.push(...placesAround(first.point).slice(0, 3));
  return ok({ results: places.remember(hits).slice(0, take).map(searchPlace) });
}
