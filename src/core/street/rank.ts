import type { StreetTag } from "../../shared/contract.ts";
import type { QTag } from "../qloo/tags.ts";

// Highest score first; items without a score keep Qloo's order after the scored ones.
export function rankBy<T>(items: T[], score: (t: T) => number | null): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => {
      if (a.s !== null && b.s !== null && a.s !== b.s) return b.s - a.s;
      if (a.s !== null && b.s === null) return -1;
      if (a.s === null && b.s !== null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

export function toStreetTags(tags: QTag[]): StreetTag[] {
  return rankBy(tags, (t) => t.score).map((t, i) => ({ id: t.id, name: t.name, namespace: t.namespace, rank: i + 1 }));
}

export function renumber(tags: StreetTag[]): StreetTag[] {
  return tags.map((t, i) => ({ ...t, rank: i + 1 }));
}

// Qloo files one idea under several namespaces, such as Bar in genre:place and in category:place.
export function tagKeys(t: { id: string; name: string }): string[] {
  return [t.id, t.name.trim().toLowerCase()];
}

export function uniqueBy<T>(items: T[], keys: (t: T) => string[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const ks = keys(item);
    if (ks.some((k) => seen.has(k))) return false;
    for (const k of ks) seen.add(k);
    return true;
  });
}
