import type { KindGroup, LovedPlace } from "../../shared/contract.ts";
import { hostKinds, kindsOf } from "../street/hosts.ts";

// The part of Qloo's kind tag that says which group a place is in, with the word an owner would use for it.
const KINDS: Array<{ group: KindGroup; kinds: string[]; word: string }> = [
  { group: "book", kinds: ["book_store", "used_book_store", "rare_book_store", "specialist_book_shop"], word: "bookshop" },
  { group: "film", kinds: ["movie_theater", "cinema"], word: "cinema" },
  { group: "record", kinds: ["record_store"], word: "record shop" },
  { group: "live", kinds: ["jazz_club"], word: "jazz club" },
  { group: "live", kinds: ["live_music_venue", "concert_hall", "music_venue"], word: "music room" },
  { group: "stage", kinds: ["comedy_club"], word: "comedy club" },
  { group: "stage", kinds: ["performing_arts_theater", "theater", "theatre", "dinner_theater", "cabaret_club"], word: "theatre" },
  { group: "art", kinds: ["art_gallery"], word: "gallery" },
  { group: "drinks", kinds: ["brewery", "brewpub"], word: "brewery" },
  { group: "drinks", kinds: ["wine_bar", "winery"], word: "wine bar" },
  { group: "drinks", kinds: ["cocktail_bar"], word: "cocktail bar" },
  { group: "drinks", kinds: ["pub", "gastropub"], word: "pub" },
  { group: "drinks", kinds: ["bar", "lounge", "beer_garden"], word: "bar" },
  { group: "coffee", kinds: ["tea_house"], word: "tea room" },
  { group: "coffee", kinds: ["bakery"], word: "bakery" },
  { group: "coffee", kinds: ["cafe", "coffee_shop", "espresso_bar"], word: "cafe" },
  { group: "food", kinds: ["diner"], word: "diner" },
  { group: "food", kinds: ["restaurant", "bistro", "brasserie"], word: "restaurant" },
];

// A place is filed under several kinds; the one that says most about it wins, so a bookshop with a cafe is a bookshop.
const ORDER: KindGroup[] = ["book", "film", "record", "live", "stage", "art", "drinks", "coffee", "food"];

// Qloo's own words for a dish or drink counter ("sushi_bar", "juice_bar") are rooms for food or coffee, not bars.
const FOOD_BARS = /(sushi|oyster|salad|raw|noodle|ramen|tapas|poke|dessert|snack)_bar$/;
const COFFEE_BARS = /(juice|espresso|coffee|smoothie|tea)_bar$/;

function kindOfPart(part: string): { group: KindGroup; word: string } | null {
  const hit = KINDS.find((k) => k.kinds.includes(part));
  if (hit) return { group: hit.group, word: hit.word };
  if (COFFEE_BARS.test(part)) return { group: "coffee", word: "cafe" };
  if (FOOD_BARS.test(part) || part.endsWith("_restaurant")) return { group: "food", word: "restaurant" };
  if (part.endsWith("_bar") || part.endsWith("_pub")) return { group: "drinks", word: part.endsWith("_pub") ? "pub" : "bar" };
  return null;
}

export interface PlaceKind {
  group: KindGroup | null;
  word: string;
  // The kind tag that decided it, such as "book_store".
  part?: string;
}

// A record shop that also sells books is a record shop. A used bookshop with a crate of records stays a bookshop,
// and Qloo files those as used bookshops.
function priority(part: string, group: KindGroup, usedBooks: boolean): number {
  return part === "record_store" && !usedBooks ? -1 : ORDER.indexOf(group);
}

export function kindOf(p: Pick<LovedPlace, "tags">): PlaceKind {
  const usedBooks = kindsOf(p).includes("used_book_store");
  const found = hostKinds(p).flatMap((part) => {
    const k = kindOfPart(part);
    return k ? [{ ...k, part, at: priority(part, k.group, usedBooks) }] : [];
  });
  const best = found.sort((a, b) => a.at - b.at)[0];
  return best ? { group: best.group, word: best.word, part: best.part } : { group: null, word: "place" };
}

const FAMILY: Record<string, string> = {
  used_book_store: "book_store",
  rare_book_store: "book_store",
  specialist_book_shop: "book_store",
  cinema: "movie_theater",
  theatre: "theater",
  performing_arts_theater: "theater",
};

function family(part: string): string {
  return FAMILY[part] ?? part;
}

export function groupOf(p: Pick<LovedPlace, "tags">): KindGroup | null {
  return kindOf(p).group;
}

// How well two kinds of place send each other people, from 0 to 1. Same group means rivals and never pairs.
const PAIRS: Array<[KindGroup, KindGroup, number]> = [
  ["book", "film", 1],
  ["book", "coffee", 1],
  ["book", "drinks", 0.8],
  ["book", "record", 0.8],
  ["book", "live", 0.7],
  ["book", "art", 0.8],
  ["book", "food", 0.7],
  ["film", "drinks", 1],
  ["film", "food", 0.9],
  ["film", "coffee", 0.8],
  ["film", "stage", 0.8],
  ["film", "live", 0.7],
  ["film", "record", 0.7],
  ["art", "film", 0.8],
  ["art", "live", 0.7],
  ["record", "drinks", 1],
  ["record", "coffee", 0.8],
  ["record", "food", 0.8],
  ["record", "live", 0.8],
  ["live", "drinks", 1],
  ["live", "coffee", 0.9],
  ["live", "food", 0.9],
  ["live", "stage", 0.6],
  ["coffee", "drinks", 0.7],
  ["food", "drinks", 0.9],
  ["art", "drinks", 0.9],
  ["art", "coffee", 0.8],
  ["stage", "drinks", 1],
  ["stage", "food", 0.9],
  ["coffee", "food", 0.5],
];

export const UNLISTED_PAIR = 0.5;

export function complement(a: KindGroup | null, b: KindGroup | null): number {
  if (!a || !b) return UNLISTED_PAIR;
  if (a === b) return 0;
  const hit = PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? hit[2] : UNLISTED_PAIR;
}

// Two places of one kind are after the same customers. So is an arts centre that also runs a gallery, for a gallery:
// whatever kind defines one place, the other must not have it too.
export function rivals(a: Pick<LovedPlace, "tags">, b: Pick<LovedPlace, "tags">): boolean {
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka.group !== null && ka.group === kb.group) return true;
  const has = (p: Pick<LovedPlace, "tags">, part: string | undefined) => part !== undefined && hostKinds(p).some((k) => family(k) === family(part));
  const defining = (k: PlaceKind) => k.group !== null && !["drinks", "coffee", "food"].includes(k.group);
  return (defining(kb) && has(a, kb.part)) || (defining(ka) && has(b, ka.part));
}

export { article } from "../../shared/words.ts";

export function pluralWord(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|sh|ch|x)$/.test(word)) return `${word}es`;
  return `${word}s`;
}
