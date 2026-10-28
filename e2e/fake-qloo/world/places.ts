import { metresBetween, offset, type Point } from "../geo.ts";
import { between, hash, shuffled, uuidFrom } from "../seed.ts";
import { addressIn, CITIES, type City } from "./cities.ts";
import { tagDefs, type TagDef } from "./tags.ts";

export interface FakePlace {
  id: string;
  name: string;
  point: Point;
  address: string;
  city: City;
  tags: TagDef[];
  popularity: number;
}

const ROOT = "urn:tag:genre:place";

const ARCHETYPES: Array<{ suffix: string; tags: string[] }> = [
  { suffix: "Wine Bar", tags: ["urn:tag:genre:place:wine_bar", "urn:tag:specialty_dish:place:natural_wine", "urn:tag:event:place:date_night", "urn:tag:good_for:qloo:groups", "urn:tag:ambience:qloo:intimate"] },
  { suffix: "Picture House", tags: ["urn:tag:genre:place:movie_theater", "urn:tag:good_for:qloo:groups", "urn:tag:event:place:date_night", "urn:tag:genre:media:documentary", "urn:tag:category:place:tourist_attraction"] },
  { suffix: "Records", tags: ["urn:tag:genre:place:record_store", "urn:tag:good_for:qloo:live_music", "urn:tag:genre:music:jazz", "urn:tag:genre:music:indie_folk", "urn:tag:ambience:qloo:cozy"] },
  { suffix: "Bakery", tags: ["urn:tag:genre:place:bakery", "urn:tag:specialty_dish:place:sourdough", "urn:tag:offerings:place:coffee", "urn:tag:offerings:place:vegan_options"] },
  { suffix: "Ramen Bar", tags: ["urn:tag:genre:place:ramen_restaurant", "urn:tag:cuisine:qloo:japanese", "urn:tag:specialty_dish:place:ramen", "urn:tag:offerings:place:vegan_options", "urn:tag:good_for:qloo:groups"] },
  { suffix: "Taproom", tags: ["urn:tag:genre:place:brewery", "urn:tag:good_for:qloo:trivia", "urn:tag:good_for:qloo:groups", "urn:tag:event:place:birthday", "urn:tag:ambience:qloo:lively"] },
  { suffix: "Comedy Cellar", tags: ["urn:tag:genre:place:comedy_club", "urn:tag:good_for:qloo:groups", "urn:tag:event:place:birthday", "urn:tag:event:place:date_night", "urn:tag:genre:media:comedy"] },
  { suffix: "Arcade", tags: ["urn:tag:genre:place:arcade", "urn:tag:good_for:qloo:groups", "urn:tag:event:place:birthday", "urn:tag:ambience:qloo:lively"] },
  { suffix: "Gallery", tags: ["urn:tag:genre:place:art_gallery", "urn:tag:ambience:qloo:quiet", "urn:tag:category:place:tourist_attraction"] },
  { suffix: "Pizza", tags: ["urn:tag:genre:place:pizza_restaurant", "urn:tag:cuisine:qloo:mediterranean", "urn:tag:good_for:qloo:groups", "urn:tag:offerings:place:vegan_options"] },
  { suffix: "Cocktail Room", tags: ["urn:tag:genre:place:cocktail_bar", "urn:tag:offerings:place:cocktails", "urn:tag:event:place:date_night", "urn:tag:good_for:qloo:live_music", "urn:tag:ambience:qloo:trendy"] },
  { suffix: "Oyster House", tags: ["urn:tag:genre:place:seafood_restaurant", "urn:tag:specialty_dish:place:oysters", "urn:tag:event:place:date_night", "urn:tag:offerings:place:cocktails"] },
];

const PREFIXES = ["Alder", "Juniper", "Copper", "Harbor", "Marigold", "Quarry", "Saltwater", "Ember", "Willow", "Brass", "Larkspur", "Foundry"];

// The kind of venue is read from the words of its name, as an owner would type it.
const VENUE_KINDS: Array<{ words: RegExp; tags: string[] }> = [
  { words: /book|read|press/i, tags: ["urn:tag:genre:place:book_store", "urn:tag:ambience:qloo:quiet", "urn:tag:ambience:qloo:cozy", "urn:tag:offerings:place:coffee"] },
  { words: /record|vinyl|sound/i, tags: ["urn:tag:genre:place:record_store", "urn:tag:genre:music:jazz", "urn:tag:ambience:qloo:cozy"] },
  { words: /wine|cellar/i, tags: ["urn:tag:genre:place:wine_bar", "urn:tag:specialty_dish:place:natural_wine", "urn:tag:ambience:qloo:intimate"] },
  { words: /brew|tap|ale/i, tags: ["urn:tag:genre:place:brewery", "urn:tag:ambience:qloo:lively", "urn:tag:good_for:qloo:groups"] },
  { words: /galler|studio/i, tags: ["urn:tag:genre:place:art_gallery", "urn:tag:ambience:qloo:quiet"] },
];
const CAFE = ["urn:tag:genre:place:cafe", "urn:tag:offerings:place:coffee", "urn:tag:specialty_dish:place:espresso", "urn:tag:ambience:qloo:cozy"];

export const NEARBY_COUNT = 12;

export function nearestCity(p: Point): City {
  return [...CITIES].sort((a, b) => metresBetween(p, a.center) - metresBetween(p, b.center))[0] as City;
}

export function venueFromQuery(name: string, city: City): FakePlace {
  const key = `${name.toLowerCase()}|${city.name}`;
  const seed = hash(key);
  const kind = VENUE_KINDS.find((k) => k.words.test(name));
  return {
    id: uuidFrom(`venue|${key}`),
    name,
    point: offset(city.center, between(`${key}|n`, -250, 250), between(`${key}|e`, -250, 250)),
    address: addressIn(city, seed),
    city,
    tags: tagDefs([ROOT, ...(kind?.tags ?? CAFE)]),
    popularity: between(`${key}|pop`, 0.82, 0.97),
  };
}

// The same street always has the same neighbours; how they rank depends on who asks.
export function placesAround(center: Point): FakePlace[] {
  const cell = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
  const city = nearestCity(center);
  const kinds = shuffled(ARCHETYPES, `kinds|${cell}`).slice(0, NEARBY_COUNT);
  const prefixes = shuffled(PREFIXES, `names|${cell}`);
  return kinds.map((kind, i) => {
    const name = `${prefixes[i % prefixes.length]} ${kind.suffix}`;
    const key = `${cell}|${name}`;
    const away = between(`${key}|d`, 70, 1050);
    const bearing = between(`${key}|b`, 0, 2 * Math.PI);
    return {
      id: uuidFrom(`place|${key}`),
      name,
      point: offset(center, away * Math.cos(bearing), away * Math.sin(bearing)),
      address: addressIn(city, hash(key)),
      city,
      tags: tagDefs([ROOT, ...kind.tags]),
      popularity: between(`${key}|pop`, 0.7, 0.99),
    };
  });
}
