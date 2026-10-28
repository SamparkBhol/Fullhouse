export interface TagDef {
  id: string;
  name: string;
  namespace: string;
}

const NAMES: Record<string, string> = {
  "urn:tag:genre:place": "Place",
  "urn:tag:genre:place:book_store": "Book store",
  "urn:tag:genre:place:cafe": "Cafe",
  "urn:tag:genre:place:wine_bar": "Wine bar",
  "urn:tag:genre:place:record_store": "Record store",
  "urn:tag:genre:place:movie_theater": "Movie theater",
  "urn:tag:genre:place:bakery": "Bakery",
  "urn:tag:genre:place:seafood_restaurant": "Seafood restaurant",
  "urn:tag:genre:place:ramen_restaurant": "Ramen restaurant",
  "urn:tag:genre:place:brewery": "Brewery",
  "urn:tag:genre:place:comedy_club": "Comedy club",
  "urn:tag:genre:place:arcade": "Arcade",
  "urn:tag:genre:place:art_gallery": "Art gallery",
  "urn:tag:genre:place:pizza_restaurant": "Pizza restaurant",
  "urn:tag:genre:place:cocktail_bar": "Cocktail bar",
  "urn:tag:ambience:qloo:intimate": "Intimate",
  "urn:tag:ambience:qloo:cozy": "Cozy",
  "urn:tag:ambience:qloo:lively": "Lively",
  "urn:tag:ambience:qloo:quiet": "Quiet",
  "urn:tag:ambience:qloo:trendy": "Trendy",
  "urn:tag:specialty_dish:place:natural_wine": "Natural wine",
  "urn:tag:specialty_dish:place:sourdough": "Sourdough",
  "urn:tag:specialty_dish:place:oysters": "Oysters",
  "urn:tag:specialty_dish:place:ramen": "Ramen",
  "urn:tag:specialty_dish:place:espresso": "Espresso",
  "urn:tag:genre:media:documentary": "Documentary",
  "urn:tag:genre:media:drama": "Drama",
  "urn:tag:genre:media:comedy": "Comedy",
  "urn:tag:genre:media:science_fiction": "Science fiction",
  "urn:tag:genre:media:mystery": "Mystery",
  "urn:tag:genre:music:indie_folk": "Indie folk",
  "urn:tag:genre:music:jazz": "Jazz",
  "urn:tag:genre:music:soul": "Soul",
  "urn:tag:genre:music:electronic": "Electronic",
  "urn:tag:genre:music:post_punk": "Post punk",
  "urn:tag:keyword:media:found_family": "Found family",
  "urn:tag:keyword:media:coming_of_age": "Coming of age",
  "urn:tag:cuisine:qloo:japanese": "Japanese",
  "urn:tag:cuisine:qloo:mediterranean": "Mediterranean",
  "urn:tag:good_for:qloo:live_music": "Live music",
  "urn:tag:good_for:qloo:groups": "Groups",
  "urn:tag:good_for:qloo:trivia": "Trivia",
  "urn:tag:event:place:date_night": "Date night",
  "urn:tag:event:place:birthday": "Birthday",
  "urn:tag:offerings:place:coffee": "Coffee",
  "urn:tag:offerings:place:vegan_options": "Vegan options",
  "urn:tag:offerings:place:cocktails": "Cocktails",
  "urn:tag:category:place:tourist_attraction": "Tourist Attraction",
};

export function namespaceOf(id: string): string {
  const parts = id.split(":");
  return parts.length >= 4 ? parts.slice(0, 4).join(":") : id;
}

export function tagDef(id: string): TagDef {
  const name = NAMES[id];
  if (!name) throw new Error(`fake qloo has no tag ${id}`);
  return { id, name, namespace: namespaceOf(id) };
}

export function tagDefs(ids: string[]): TagDef[] {
  return ids.map(tagDef);
}

// A location signal answers in these five namespaces only.
export const STREET_TAGS = tagDefs([
  "urn:tag:ambience:qloo:intimate",
  "urn:tag:genre:music:indie_folk",
  "urn:tag:specialty_dish:place:natural_wine",
  "urn:tag:genre:media:documentary",
  "urn:tag:genre:place:wine_bar",
  "urn:tag:ambience:qloo:cozy",
  "urn:tag:genre:music:jazz",
  "urn:tag:specialty_dish:place:sourdough",
  "urn:tag:genre:media:drama",
  "urn:tag:genre:place:cafe",
  "urn:tag:ambience:qloo:lively",
  "urn:tag:genre:music:soul",
  "urn:tag:specialty_dish:place:oysters",
  "urn:tag:genre:media:comedy",
  "urn:tag:genre:place:record_store",
  "urn:tag:ambience:qloo:trendy",
  "urn:tag:genre:music:electronic",
  "urn:tag:specialty_dish:place:ramen",
  "urn:tag:genre:media:science_fiction",
  "urn:tag:genre:place:bakery",
  "urn:tag:ambience:qloo:quiet",
  "urn:tag:genre:music:post_punk",
  "urn:tag:specialty_dish:place:espresso",
  "urn:tag:genre:media:mystery",
  "urn:tag:genre:place:cocktail_bar",
]);

// An entity signal also answers in keyword, cuisine and good_for.
export const AUDIENCE_TAGS = [
  ...STREET_TAGS,
  ...tagDefs([
    "urn:tag:keyword:media:found_family",
    "urn:tag:keyword:media:coming_of_age",
    "urn:tag:cuisine:qloo:japanese",
    "urn:tag:cuisine:qloo:mediterranean",
    "urn:tag:good_for:qloo:live_music",
    "urn:tag:good_for:qloo:groups",
    "urn:tag:good_for:qloo:trivia",
  ]),
];

export function inNamespaces(tags: TagDef[], namespaces: string[]): TagDef[] {
  return namespaces.length ? tags.filter((t) => namespaces.includes(t.namespace)) : tags;
}

// diversify.by=subtype keeps at most `per` tags of each namespace, in order.
export function diversify(tags: TagDef[], per: number): TagDef[] {
  const seen = new Map<string, number>();
  return tags.filter((t) => {
    const n = seen.get(t.namespace) ?? 0;
    seen.set(t.namespace, n + 1);
    return n < per;
  });
}
