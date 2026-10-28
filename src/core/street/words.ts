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

export function fmtTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function fmtDay(iso: string): string {
  return iso.slice(0, 10);
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

// A location signal scores street tags almost level, so they are named as a set and never by rank.
export function streetTagLine(tag: string, venueName: string): string {
  return `${tag} is among the taste tags Qloo returns for the area around ${venueName}`;
}
