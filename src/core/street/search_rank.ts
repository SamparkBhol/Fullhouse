import type { VenueCandidate } from "../../shared/contract.ts";
import { haversineM, type LatLng } from "../../shared/geo.ts";
import type { QEntity } from "../qloo/entities.ts";
import { kindOf } from "../pair/groups.ts";
import { hostsPeople } from "./hosts.ts";

function words(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// 0 for the exact name, 1 when one starts with the other (owners type "Housing Works Bookstore Cafe" for
// "Housing Works Bookstore"), 2 when one holds the other as whole words, 3 otherwise.
export function nameClass(name: string, typed: string): number {
  const n = words(name);
  const t = words(typed);
  if (!t || !n) return 3;
  if (n === t) return 0;
  if (n.startsWith(`${t} `) || t.startsWith(`${n} `)) return 1;
  return ` ${n} `.includes(` ${t} `) || ` ${t} `.includes(` ${n} `) ? 2 : 3;
}

export function toCandidate(e: QEntity, from: LatLng | null): VenueCandidate | null {
  if (e.lat === null || e.lng === null) return null;
  const c: VenueCandidate = { id: e.id, name: e.name, type: "place", lat: e.lat, lng: e.lng, tags: e.tags.map((t) => t.id) };
  const address = e.address ?? e.disambiguation;
  if (address) c.address = address;
  if (e.image) c.image = e.image;
  if (e.url) c.url = e.url;
  if (e.hours) c.hours = e.hours;
  if (e.neighborhood) c.neighborhood = e.neighborhood;
  if (from) c.distanceM = Math.round(haversineM(from, { lat: e.lat, lng: e.lng }));
  const kind = kindOf(c);
  if (kind.group) c.kind = kind.word;
  return c;
}

const FILLER = new Set(["the", "and", "of", "a", "an", "at", "on", "in", "de", "la", "le"]);

function nameWords(s: string): Set<string> {
  return new Set(words(s).split(" ").filter((w) => w && !FILLER.has(w)));
}

// How many of the typed words the name carries. "prince charles cinema" finds the cinema with three, and the KFC on
// Prince Charles Drive with none, because the street is in its address, not its name.
export function sharedWords(name: string, typed: string): number {
  const n = nameWords(name);
  return [...nameWords(typed)].filter((w) => n.has(w)).length;
}

// Words that say what kind of place it is. "Housing Works Bookstore Cafe" shares "cafe" with every cafe in town.
const KIND_WORDS = new Set(["cafe", "caffe", "coffee", "bar", "pub", "restaurant", "bakery", "kitchen", "books", "bookstore", "bookshop", "booksellers", "shop", "store", "records", "cinema", "theatre", "theater", "gallery", "club"]);

function sharedNameWords(name: string, typed: string): number {
  const n = nameWords(name);
  return [...nameWords(typed)].filter((w) => !KIND_WORDS.has(w) && n.has(w)).length;
}

// When a result carries every typed word, the ones that carry only some are namesakes; when some result shares a word,
// the ones that share none are noise, and when some result shares a name word, the ones that share only kind words go too.
// Then a place that cannot host goes when one that can is left.
export function namedLike<T extends { name: string; tags: string[] }>(rows: T[], typed: string): T[] {
  const specific = rows.map((r) => sharedNameWords(r.name, typed));
  if (Math.max(0, ...specific) > 0) rows = rows.filter((_, i) => specific[i]! > 0);
  const want = nameWords(typed).size;
  const counts = rows.map((r) => sharedWords(r.name, typed));
  const best = Math.max(0, ...counts);
  const floor = best === 0 ? 0 : best === want ? want : 1;
  const named = rows.filter((_, i) => counts[i]! >= floor);
  const hosting = named.filter((r) => hostsPeople(r));
  return hosting.length ? hosting : named;
}

// Closed places go; the same place listed twice goes once; places that cannot host a night go last; then the name as typed
// first, then the nearest to the search point.
export function rankResults(hits: QEntity[], typed: string, from: LatLng | null, max: number): VenueCandidate[] {
  const seen = new Set<string>();
  const out: Array<{ c: VenueCandidate; never: boolean; cls: number; i: number }> = [];
  hits.forEach((e, i) => {
    if (e.closed) return;
    const c = toCandidate(e, from);
    if (!c) return;
    const k = `${words(c.name)}|${words(c.address ?? "")}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ c, never: !hostsPeople(c), cls: nameClass(c.name, typed), i });
  });
  return out
    .sort((a, b) => Number(a.never) - Number(b.never) || a.cls - b.cls || (a.c.distanceM ?? 0) - (b.c.distanceM ?? 0) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c);
}
