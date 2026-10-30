import type { LovedPlace } from "../../shared/contract.ts";
import { hostsPeople, kindPaths } from "../street/hosts.ts";
import { kindOf } from "./groups.ts";

// The words an owner would use for the places Qloo files beside the rooms: shops, libraries, churches, parks.
const WORDS: Array<[string, string]> = [
  ["department_store", "department store"],
  ["supermarket", "supermarket"],
  ["shopping_mall", "shopping centre"],
  ["university_library", "university library"],
  ["public_library", "public library"],
  ["national_library", "national library"],
  ["library", "library"],
  ["catholic_cathedral", "Catholic cathedral"],
  ["catholic_church", "Catholic church"],
  ["episcopal_church", "Episcopal church"],
  ["protestant_church", "Protestant church"],
  ["cathedral", "cathedral"],
  ["chapel", "chapel"],
  ["church", "church"],
  ["place_of_worship", "place of worship"],
  ["community_garden", "community garden"],
  ["city_park", "park"],
  ["state_park", "park"],
  ["dog_park", "dog park"],
  ["park", "park"],
  ["garden", "garden"],
  ["university", "university"],
  ["college", "college"],
  ["art_school", "art school"],
  ["social_club", "members' club"],
  ["history_museum", "history museum"],
  ["art_museum", "art museum"],
  ["museum", "museum"],
  ["historical_landmark", "landmark"],
  ["hotel", "hotel"],
  ["apartment_complex", "apartment building"],
  ["gym", "gym"],
  ["mens_tailor", "tailor"],
  ["tailor", "tailor"],
  ["barber_shop", "barber"],
  ["hair_salon", "hair salon"],
  ["clothing_store", "clothes shop"],
  ["fast_food_restaurant", "fast food counter"],
];

// Words that sit on almost every listing and say nothing about what the place is.
const SAYS_NOTHING = new Set(["place", "shopping", "tourist_attraction", "personal_care", "restaurant", "event_venue", "non_profit_organization", "point_of_interest", "establishment", "store"]);

function fromPart(part: string): string {
  return part.replace(/_store$/, "_shop").replace(/_/g, " ").replace(/\bchildrens\b/, "children's").replace(/\bmens\b/, "men's").replace(/\bwomens\b/, "women's");
}

// What a place is, in a word or two: the kind Full House pairs by when it is a room for a night, otherwise the most
// telling kind Qloo files it under, so a tennis shop with a cafe counter reads as a tennis shop.
export function placeWord(p: Pick<LovedPlace, "tags">): string {
  const kind = kindOf(p);
  if (kind.group && hostsPeople(p)) return kind.word;
  const parts = kindPaths(p).flatMap((k) => k.split(":"));
  const known = WORDS.find(([part]) => parts.includes(part));
  if (known) return known[1];
  const first = parts.find((part) => !SAYS_NOTHING.has(part));
  return first ? fromPart(first) : "place";
}
