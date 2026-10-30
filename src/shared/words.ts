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

// "a university", "an Episcopal church": the sound decides, and a few vowels sound like a y.
export function article(word: string): string {
  return /^[aeiou]/i.test(word) && !/^(uni|use|usu|eu|one\b)/i.test(word) ? `an ${word}` : `a ${word}`;
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

// Listings carry flags and emoji, and some put a street or a tagline after a pipe. None of that is the name.
const DECORATION = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu;

function undecorated(name: string): string {
  const cut = name.split("|")[0] ?? name;
  const clean = cut.replace(DECORATION, "").replace(/\s+/g, " ").trim();
  return clean || name.trim();
}

// Some listings put the branch after a hyphen with spaces round it. A comma reads the same and keeps dashes off the page.
export function plainName(name: string): string {
  return undecorated(name).replace(/\s+[-\u2013\u2014]\s+/g, ", ").trim();
}

// Nobody says "Angelika Film Center & Cafe": the side line after the ampersand goes when a real name is left.
const SIDE_LINE = /\s+(?:&|and)\s+(?:caf[eé]|bar|kitchen|lounge|restaurant|publishers|event center|events)$/i;

// A branch listed after the name, such as Angelika Film Center & Cafe in New York, is said as the name alone.
export function shortName(name: string): string {
  const base = plainName(name).split(",")[0]?.trim() || name;
  const cut = base.replace(SIDE_LINE, "").trim();
  return cut.split(/\s+/).length >= 2 ? cut : base;
}

// "the The Hate U Give" never: a title that already starts with an article keeps its own.
export function theTitle(title: string): string {
  return /^(the|a|an)\s/i.test(title) ? title : `the ${title}`;
}
