import type { QlooType } from "./contract.ts";

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

// Indexed like Date.getDay(): 0 is Sunday.
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function weekdayName(n: number): string {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7] ?? "Sunday";
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function listWords(items: string[]): string {
  const xs = items.filter((x) => x && x.trim());
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function capFirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const end = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${n % 10 > 3 ? "th" : end}`;
}

// "Publishers' audience", not "Publishers's audience".
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}'` : `${name}'s`;
}
