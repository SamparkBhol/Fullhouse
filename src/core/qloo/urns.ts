import type { QlooType } from "../../shared/contract.ts";

// urn:entity:video_game, printed in the developer guide, is refused with HTTP 400.
export const TYPE_URN: Record<QlooType, string> = {
  place: "urn:entity:place",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  podcast: "urn:entity:podcast",
  videogame: "urn:entity:videogame",
  brand: "urn:entity:brand",
  person: "urn:entity:person",
  destination: "urn:entity:destination",
};

// /search still returns the legacy people types.
const LEGACY_URN: Record<string, QlooType> = {
  "urn:entity:actor": "person",
  "urn:entity:author": "person",
  "urn:entity:director": "person",
};

const URN_TYPE = new Map<string, QlooType>(
  Object.entries(TYPE_URN).map(([type, urn]) => [urn, type as QlooType]),
);

export function typeFromUrn(urn: unknown): QlooType | null {
  if (typeof urn !== "string") return null;
  const key = urn.toLowerCase();
  return URN_TYPE.get(key) ?? LEGACY_URN[key] ?? null;
}
