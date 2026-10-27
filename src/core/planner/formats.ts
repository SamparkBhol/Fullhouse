import type { NightFormat, QlooType } from "../../shared/contract.ts";

export interface FormatDef {
  format: NightFormat;
  label: string;
  types: QlooType[];
  music: boolean;
  people: { min: number; max: number };
  themeNamespaces: string[];
  partnerHints: string[];
  licence?: string;
}

export const FORMAT_ORDER: NightFormat[] = ["listening", "film", "quiz", "book", "games", "podcast", "tasting"];

export const MENU_NAMESPACES = [
  "urn:tag:cuisine:qloo",
  "urn:tag:menu_highlight:qloo",
  "urn:tag:specialty_dish:place",
  "urn:tag:dining_options:place",
];

export const FORMATS: Record<NightFormat, FormatDef> = {
  listening: {
    format: "listening",
    label: "listening night",
    types: ["artist"],
    music: true,
    people: { min: 10, max: 80 },
    themeNamespaces: ["urn:tag:genre:music"],
    partnerHints: ["bar", "record", "music", "cafe", "coffee", "wine", "cocktail", "pub"],
  },
  film: {
    format: "film",
    label: "film night",
    types: ["movie", "tv_show"],
    music: false,
    people: { min: 8, max: 60 },
    themeNamespaces: ["urn:tag:genre:media", "urn:tag:keyword:media"],
    partnerHints: ["cinema", "theater", "theatre", "bar", "pizza", "popcorn", "dessert", "restaurant"],
    licence: "Showing a film or TV episode to the public needs a screening licence. Check you have one before the night.",
  },
  quiz: {
    format: "quiz",
    label: "quiz night",
    types: ["movie", "tv_show", "videogame", "artist"],
    music: false,
    people: { min: 12, max: 80 },
    themeNamespaces: ["urn:tag:genre:media", "urn:tag:genre:music", "urn:tag:keyword:media"],
    partnerHints: ["pub", "bar", "brewery", "pizza", "burger", "restaurant"],
  },
  book: {
    format: "book",
    label: "book night",
    types: ["book"],
    music: false,
    people: { min: 6, max: 30 },
    themeNamespaces: ["urn:tag:genre:media", "urn:tag:keyword:media"],
    partnerHints: ["book", "library", "cafe", "coffee", "tea", "wine", "bakery"],
  },
  games: {
    format: "games",
    label: "game night",
    types: ["videogame"],
    music: false,
    people: { min: 6, max: 40 },
    themeNamespaces: ["urn:tag:genre:media", "urn:tag:keyword:media"],
    partnerHints: ["game", "arcade", "comic", "pizza", "bar", "burger"],
  },
  podcast: {
    format: "podcast",
    label: "podcast listening night",
    types: ["podcast"],
    music: false,
    people: { min: 10, max: 60 },
    themeNamespaces: ["urn:tag:genre:media", "urn:tag:keyword:media"],
    partnerHints: ["cafe", "coffee", "bar", "book", "radio"],
    licence: "Check the podcast's terms before playing an episode to the public.",
  },
  tasting: {
    format: "tasting",
    label: "tasting night",
    types: [],
    music: false,
    people: { min: 8, max: 40 },
    themeNamespaces: MENU_NAMESPACES,
    partnerHints: ["wine", "cheese", "bakery", "deli", "market", "brewery", "coffee", "chocolate"],
  },
};

export function menuItem(t: { name: string; namespace: string }): string {
  return t.namespace === "urn:tag:cuisine:qloo" ? `${t.name} food` : t.name.toLowerCase();
}

export const KIND_WORD: Record<QlooType, string> = {
  artist: "artist",
  book: "book",
  movie: "film",
  tv_show: "show",
  podcast: "podcast",
  videogame: "game",
  place: "place",
  brand: "brand",
  person: "person",
  destination: "destination",
};

export const PLAYLIST_LICENCE =
  "The playlist is a list of artists, not a licence. A personal streaming account does not cover playing music in a business; the venue needs its own public performance licence or a business music service.";
