import type { NightFormat, Rising, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { FORMATS, FORMAT_ORDER, MENU_NAMESPACES, type FormatDef } from "./formats.ts";

export interface Candidate {
  format: NightFormat;
  feature: Rising | null;
  menuTag: StreetTag | null;
  score: number;
}

const MOMENTUM: Record<Rising["trend"], number> = { rising: 0.3, steady: 0.1, unknown: 0, falling: -0.2 };

function fitsPeople(def: FormatDef, cap: number | undefined): number {
  if (cap === undefined) return 1;
  return cap >= def.people.min ? 1 : 0.6;
}

export function menuTags(read: StreetRead): StreetTag[] {
  return read.streetTags.filter((t) => MENU_NAMESPACES.includes(t.namespace) && t.namespace !== "urn:tag:dining_options:place");
}

export function scoreCandidates(read: StreetRead, venue: Venue, cap: number | undefined, prefer: Set<NightFormat>): Candidate[] {
  const gapIds = new Set(read.gaps.map((g) => g.tag.id));
  const streetTop = new Set(read.streetTags.slice(0, 15).map((t) => t.id));
  const venueIds = new Set([...venue.entity.tags, ...read.venueTags.map((t) => t.id)]);
  const perType = new Map<string, number>();
  for (const r of read.rising) perType.set(r.type, (perType.get(r.type) ?? 0) + 1);

  const out: Candidate[] = [];
  for (const format of FORMAT_ORDER) {
    const def = FORMATS[format];
    const bonus = prefer.has(format) ? 1 : 0;
    const people = fitsPeople(def, cap);
    if (format === "tasting") {
      const tags = menuTags(read);
      const n = Math.max(1, read.streetTags.length);
      const pick = tags.find((t) => gapIds.has(t.id)) ?? tags[0];
      if (pick) {
        const base = (1 - (pick.rank - 1) / n) * 0.8 + (gapIds.has(pick.id) ? 0.3 : 0);
        out.push({ format, feature: null, menuTag: pick, score: base * people + bonus });
      }
      continue;
    }
    for (const r of read.rising) {
      if (!def.types.includes(r.type)) continue;
      const n = Math.max(1, perType.get(r.type) ?? 1);
      const tags = r.tags ?? [];
      const base =
        1 -
        (r.rank - 1) / n +
        MOMENTUM[r.trend] +
        (tags.some((t) => gapIds.has(t)) ? 0.3 : 0) +
        (tags.some((t) => streetTop.has(t)) ? 0.15 : 0) +
        (tags.some((t) => venueIds.has(t)) ? 0.1 : 0) +
        (format === "quiz" ? -0.05 : 0);
      out.push({ format, feature: r, menuTag: null, score: base * people + bonus });
    }
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format) ||
      (a.feature?.rank ?? 0) - (b.feature?.rank ?? 0) ||
      (a.feature?.id ?? a.menuTag?.id ?? "").localeCompare(b.feature?.id ?? b.menuTag?.id ?? ""),
  );
}
