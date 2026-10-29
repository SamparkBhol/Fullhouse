import type { LovedPlace, NightFormat, NightHost, QlooType } from "../../shared/contract.ts";
import { hostKinds } from "../street/hosts.ts";

export function formatForType(type: QlooType): NightFormat | null {
  if (type === "artist") return "listening";
  if (type === "book") return "book";
  if (type === "movie" || type === "tv_show") return "film";
  if (type === "podcast") return "podcast";
  return null;
}

const BOOKS = ["book_store", "used_book_store", "rare_book_store", "specialist_book_shop"];
const DRINKS = ["bar", "pub", "lounge", "brewpub", "brewery", "gastropub", "winery"];

// A cinema hosts a film or watch night, a bar or a music room a listening night, a bookshop a book night.
const SUITS: Partial<Record<NightFormat, string[]>> = {
  film: ["movie_theater", "cinema"],
  listening: [...DRINKS, "live_music_venue", "jazz_club", "concert_hall", "record_store", "cabaret_club"],
  book: BOOKS,
  podcast: ["cafe", "coffee_shop", "espresso_bar", "tea_house", ...DRINKS, ...BOOKS],
};

export function suits(format: NightFormat, p: Pick<LovedPlace, "tags">): boolean {
  const want = SUITS[format] ?? [];
  return hostKinds(p).some((k) => want.includes(k) || (want.includes("bar") && k.endsWith("_bar")));
}

// The host is whichever of the two suits the format. When both do, or neither does, the venue that planned it hosts and both are named.
export function hostFor(format: NightFormat, venue: Pick<LovedPlace, "tags">, partner: Pick<LovedPlace, "tags">): NightHost {
  const v = suits(format, venue);
  const p = suits(format, partner);
  if (v && !p) return "venue";
  if (p && !v) return "partner";
  return "both";
}
