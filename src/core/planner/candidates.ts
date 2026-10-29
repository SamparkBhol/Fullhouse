import type { Gap, NightFormat, Rising, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { foodLed } from "../street/hosts.ts";
import { FORMATS, FORMAT_ORDER, type FormatDef } from "./formats.ts";
import { menuTags } from "./menu.ts";

export interface Candidate {
  format: NightFormat;
  feature: Rising | null;
  menuTag: StreetTag | null;
  score: number;
}

const MOMENTUM: Record<Rising["trend"], number> = { rising: 0.3, steady: 0.1, unknown: 0, falling: -0.2 };
const GAP_BONUS = 0.3;
const UNTIED_WEIGHT = 0.5;
const GENERIC_OFFERINGS = new Set(["food", "drinks", "alcohol", "beer", "coffee"]);

function fitsPeople(def: FormatDef, cap: number | undefined): number {
  if (cap === undefined) return 1;
  return cap >= def.people.min ? 1 : 0.6;
}

// Gaps carry place tags and picks carry media tags, so the gap is matched to the kind of night by Qloo's tag name.
export function gapFor(format: NightFormat, read: StreetRead): Gap | null {
  const words = FORMATS[format].gapWords;
  return read.gaps.find((g) => words.some((w) => g.tag.name.toLowerCase().includes(w))) ?? null;
}

// A cuisine or a specific offering the places nearby carry can lead a tasting night's menu.
function menuGap(read: StreetRead): StreetTag | null {
  const g = read.gaps.find(
    (x) =>
      x.tag.namespace === "urn:tag:cuisine:qloo" ||
      (x.tag.namespace === "urn:tag:offerings:place" && !GENERIC_OFFERINGS.has(x.tag.name.trim().toLowerCase())),
  );
  return g?.tag ?? null;
}

function tastingCandidate(read: StreetRead, people: number, bonus: number, gap: Gap | null): Candidate | null {
  const tags = menuTags(read);
  const lead = menuGap(read);
  const pick = lead ?? tags[0]?.tag;
  if (!pick) return null;
  const at = Math.max(0, tags.findIndex((m) => m.tag.id === pick.id));
  const base = (1 - at / Math.max(1, tags.length)) * 0.8 + (gap || lead ? GAP_BONUS : 0);
  return { format: "tasting", feature: null, menuTag: pick, score: base * people + bonus };
}

export function scoreCandidates(read: StreetRead, venue: Venue, cap: number | undefined, prefer: Set<NightFormat>): Candidate[] {
  const streetIds = new Set(read.streetTags.map((t) => t.id));
  const venueIds = new Set([...venue.entity.tags, ...read.venueTags.map((t) => t.id)]);
  const perType = new Map<string, number>();
  for (const r of read.rising) perType.set(r.type, (perType.get(r.type) ?? 0) + 1);

  const out: Candidate[] = [];
  for (const format of FORMAT_ORDER) {
    const def = FORMATS[format];
    const bonus = prefer.has(format) ? 1 : 0;
    const people = fitsPeople(def, cap);
    const gap = gapFor(format, read) ? GAP_BONUS : 0;
    if (format === "tasting") {
      if (!foodLed(venue.entity)) continue;
      const c = tastingCandidate(read, people, bonus, gapFor(format, read));
      if (c) out.push(c);
      continue;
    }
    const fits = read.rising.filter((r) => def.types.includes(r.type) && r.name.trim() !== "");
    // A list Qloo answered without the venue is the area's, not the audience's, so it never outranks one that is.
    const anyTied = fits.some((r) => r.venueSignal !== false);
    for (const r of fits) {
      const untied = r.venueSignal === false;
      if (untied && anyTied) continue;
      const n = Math.max(1, perType.get(r.type) ?? 1);
      const tags = r.tags ?? [];
      const position = untied ? 1 : 1 - (r.rank - 1) / n;
      const base =
        position +
        MOMENTUM[r.trend] +
        gap +
        (tags.some((t) => streetIds.has(t)) ? 0.15 : 0) +
        (tags.some((t) => venueIds.has(t)) ? 0.1 : 0) +
        (format === "quiz" ? -0.05 : 0);
      out.push({ format, feature: r, menuTag: null, score: base * (untied ? UNTIED_WEIGHT : 1) * people + bonus });
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
