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
