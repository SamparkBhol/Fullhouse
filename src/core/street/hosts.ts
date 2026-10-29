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

// Qloo files it as a room people go to for an evening.
export function hostsPeople(p: Pick<LovedPlace, "tags">): boolean {
  return !neverHosts(p) && hostKinds(p).length > 0;
}

// A match also needs a website, so there is an owner to find and ask.
export function canHost(p: Pick<LovedPlace, "tags" | "url">): boolean {
  return Boolean(p.url) && hostsPeople(p);
}
