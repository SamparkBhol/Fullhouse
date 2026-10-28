import type { QlooType } from "../../shared/contract.ts";

export const TYPE_PLURAL: Record<QlooType, string> = {
  artist: "artists",
  book: "books",
  movie: "films",
  tv_show: "TV shows",
  podcast: "podcasts",
  videogame: "video games",
  place: "places",
  brand: "brands",
  person: "people",
  destination: "destinations",
};

export const TYPE_SINGULAR: Record<QlooType, string> = {
  artist: "artist",
  book: "book",
  movie: "film",
  tv_show: "TV show",
  podcast: "podcast",
  videogame: "video game",
  place: "place",
  brand: "brand",
  person: "person",
  destination: "destination",
};

export function fmtTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function fmtDay(iso: string): string {
  return iso.slice(0, 10);
}

// "Publishers' audience", not "Publishers's audience".
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}'` : `${name}'s`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

// A location signal scores street tags almost level, so they are named as a set and never by rank.
export function streetTagLine(tag: string, venueName: string): string {
  return `${tag} is among the taste tags Qloo returns for the area around ${venueName}`;
}
