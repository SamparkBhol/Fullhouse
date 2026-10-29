import type { LovedPlace } from "../../shared/contract.ts";

// The namespaces that say what kind of place something is.
export const KIND_NAMESPACES = ["urn:tag:genre:place", "urn:tag:category:place"];

// Qloo files a cafe as "restaurant:cafe" and an Italian place as "restaurant:italian", so each part of the kind is checked.
const HOST_PARTS = new Set([
  "cafe", "coffee_shop", "espresso_bar", "tea_house", "restaurant", "bistro", "brasserie", "diner", "gastropub",
  "bar", "pub", "brewpub", "brewery", "beer_garden", "lounge", "winery",
  "movie_theater", "cinema",
  "book_store", "used_book_store", "rare_book_store", "specialist_book_shop", "record_store",
  "live_music_venue", "concert_hall", "jazz_club", "comedy_club", "cabaret_club", "dinner_theater",
  "art_gallery", "performing_arts_theater", "theater", "theatre", "event_venue",
]);

const HOST_SUFFIXES = ["_restaurant", "_bar", "_pub"];

// Nobody at these runs a night with a neighbour, even when Qloo also files them as an event venue.
const NEVER_HOSTS = new Set([
  "library", "public_library", "university_library", "national_library",
  "church", "catholic_church", "catholic_cathedral", "cathedral", "chapel", "episcopal_church", "protestant_church", "place_of_worship",
  "park", "city_park", "state_park", "dog_park", "wildlife_park", "garden", "community_garden",
  "college", "university", "art_school", "culinary_school",
]);

const NOT_A_ROOM = /(takeout|takeaway|delivery|fast_food|food_court)/;

export function isKindTag(tagId: string): boolean {
  return KIND_NAMESPACES.some((ns) => tagId.startsWith(`${ns}:`));
}

// The part after the namespace, such as "restaurant:cafe" or "movie_theater".
export function kindPaths(p: Pick<LovedPlace, "tags">): string[] {
  return p.tags.flatMap((t) => {
    const ns = KIND_NAMESPACES.find((n) => t.startsWith(`${n}:`));
    return ns ? [t.slice(ns.length + 1)] : [];
  });
}

export function kindsOf(p: Pick<LovedPlace, "tags">): string[] {
  return kindPaths(p).map((k) => k.split(":").pop() ?? "");
}

function hostPart(part: string): boolean {
  return !NOT_A_ROOM.test(part) && (HOST_PARTS.has(part) || HOST_SUFFIXES.some((s) => part.endsWith(s)));
}

export function hostKinds(p: Pick<LovedPlace, "tags">): string[] {
  return [...new Set(kindPaths(p).flatMap((k) => k.split(":")).filter(hostPart))];
}

export function neverHosts(p: Pick<LovedPlace, "tags">): boolean {
  return kindPaths(p).some((k) => k.split(":").some((part) => NEVER_HOSTS.has(part)));
}

// The kinds that make a place what it is. Cafe, restaurant and event venue sit on bookshops and cinemas alike.
const DISTINCT = new Set([
  "book_store", "used_book_store", "rare_book_store", "specialist_book_shop", "record_store", "movie_theater", "cinema",
  "art_gallery", "live_music_venue", "concert_hall", "jazz_club", "comedy_club", "cabaret_club", "performing_arts_theater",
  "theater", "theatre", "brewery", "brewpub", "winery",
]);

const BOOKS = new Set(["book_store", "used_book_store", "rare_book_store", "specialist_book_shop"]);

export function distinctKinds(p: Pick<LovedPlace, "tags">): Set<string> {
  return new Set(hostKinds(p).filter((k) => DISTINCT.has(k)).map((k) => (BOOKS.has(k) ? "book_store" : k)));
}

const FOOD = new Set(["cafe", "coffee_shop", "espresso_bar", "tea_house", "restaurant", "bistro", "brasserie", "diner", "gastropub", "bar", "pub", "lounge", "bakery"]);

// Food led means Qloo files the place for its food or drink and for nothing that defines it more, such as books or films.
export function foodLed(p: Pick<LovedPlace, "tags">): boolean {
  const kinds = kindPaths(p).flatMap((k) => k.split(":"));
  return kinds.some((k) => FOOD.has(k) || k.endsWith("_restaurant") || k.endsWith("_bar")) && distinctKinds(p).size === 0;
}

// Qloo files a tennis centre, a supermarket and a members' club under "restaurant" or "cafe" too.
// Unless it is also something that defines an evening out, such as a bookshop or a concert hall, it is not a room to host in.
const ELSEWHERE = /(supermarket|grocery|department_store|clothing|furniture|hardware|electronics|toy_store|jewelry|tennis|padel|sports|gym|fitness|stadium|golf|swimming|personal_care|hair_salon|barber|beauty|spa$|clinic|dental|medical|hospital|pharmacy|hotel|hostel|student|dormitory|child_care|social_club|_service$|agency|shopping_mall|pedestrian_zone|_lab$|_store$|_dealer$|office$)/;

export function mainlyElsewhere(p: Pick<LovedPlace, "tags">): boolean {
  if (distinctKinds(p).size) return false;
  return kindPaths(p).some((k) => k.split(":").some((part) => ELSEWHERE.test(part)));
}

// A fast food counter is a chain's room, not an owner's, and nobody stays for an evening. Qloo also files some espresso
// bars as fast food, so the kind alone only counts when nothing says it is a cafe, a bar or a bakery.
const FAST_FOOD_STYLE = "urn:tag:culinary_style:qloo:fast_food";
const FAST_FOOD_KIND = /^urn:tag:(genre|category):place:(.*:)?fast_food(_restaurant)?$/;
const SIT_DOWN = new Set(["cafe", "coffee_shop", "espresso_bar", "tea_house", "bar", "pub", "bakery", "wine_bar", "cocktail_bar", "lounge"]);

export function fastFood(p: Pick<LovedPlace, "tags">): boolean {
  if (distinctKinds(p).size) return false;
  if (p.tags.includes(FAST_FOOD_STYLE)) return true;
  return p.tags.some((t) => FAST_FOOD_KIND.test(t)) && !hostKinds(p).some((k) => SIT_DOWN.has(k));
}

// Qloo files it as a room people go to for an evening.
export function hostsPeople(p: Pick<LovedPlace, "tags">): boolean {
  return !neverHosts(p) && hostKinds(p).length > 0 && !mainlyElsewhere(p) && !fastFood(p);
}

// A match also needs a website, so there is an owner to find and ask.
export function canHost(p: Pick<LovedPlace, "tags" | "url">): boolean {
  return Boolean(p.url) && hostsPeople(p);
}
