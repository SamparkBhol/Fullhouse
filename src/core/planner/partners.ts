import type { Because, LovedPlace, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { capFirst } from "../copy/text.ts";
import { tagLabel } from "../qloo/tags.ts";
import { describeDistance } from "../street/geo.ts";
import type { Candidate } from "./candidates.ts";
import { FORMATS } from "./formats.ts";

export const WALK_M = 1000;
export const MAX_PARTNERS = 3;
const COMPETITOR_NS = ["urn:tag:genre:place", "urn:tag:category:place"];

export function pickPartners(
  c: Candidate,
  theme: StreetTag[],
  read: StreetRead,
  venue: Venue,
  notes: string[],
): LovedPlace[] {
  const def = FORMATS[c.format];
  const walkable = read.lovedPlaces.filter((p) => p.distanceM <= WALK_M);
  if (!walkable.length) {
    notes.push("No place within a 1 km walk came back from Qloo, so this night has no partners.");
    return [];
  }
  const themeIds = new Set(theme.map((t) => t.id));
  const gapIds = new Set(read.gaps.map((g) => g.tag.id));
  const sharedIds = new Set(read.shared.map((t) => t.id));
  const names = new Map<string, string>();
  for (const t of [...read.streetTags, ...read.shared, ...read.gaps.map((g) => g.tag)]) names.set(t.id, t.name);
  const venueCats = new Set(venue.entity.tags.filter((t) => COMPETITOR_NS.some((ns) => t.startsWith(`${ns}:`))));
  const scored = walkable.map((p) => {
    const onTheme = p.tags.find((t) => themeIds.has(t));
    const gap = p.tags.find((t) => gapIds.has(t));
    const shared = p.tags.find((t) => sharedIds.has(t));
    const hint = p.tags.find((t) => COMPETITOR_NS.some((ns) => t.startsWith(`${ns}:`)) && def.partnerHints.some((h) => tagLabel(t).toLowerCase().includes(h)));
    const competitor = p.tags.some((t) => venueCats.has(t));
    const score =
      p.tags.filter((t) => themeIds.has(t)).length * 3 + (hint ? 2 : 0) + p.tags.filter((t) => gapIds.has(t) || sharedIds.has(t)).length;
    return { p, onTheme, gap, shared, hint, competitor, score };
  });
  const order = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.p.rank - b.p.rank;
  const nonCompeting = scored.filter((s) => !s.competitor);
  const pool = nonCompeting.length >= 2 ? nonCompeting : scored;
  let chosen = pool.filter((s) => s.score > 0).sort(order).slice(0, MAX_PARTNERS);
  if (chosen.length < 2) {
    const fill = pool
      .filter((s) => !chosen.includes(s))
      .sort((a, b) => Number(a.competitor) - Number(b.competitor) || a.p.rank - b.p.rank)
      .slice(0, 2 - chosen.length);
    if (fill.length) notes.push("Few nearby places shared a tag with this night, so some partners are simply the street's top loved places.");
    chosen = [...chosen, ...fill];
  }
  if (chosen.some((s) => s.competitor)) notes.push("A partner shares a category with your venue because no other nearby match came back.");
  return chosen.map((s) => {
    const prov = s.p.because[0]?.provenance ?? -1;
    const extra: Because[] = [];
    const walk = `${capFirst(describeDistance(s.p.distanceM))} from ${venue.entity.name}`;
    const label = (id: string) => names.get(id) ?? tagLabel(id);
    if (prov >= 0) {
      if (s.onTheme) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.onTheme)}, which is part of this night's theme`, provenance: prov });
      else if (s.hint) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.hint)}, which Full House pairs with a ${def.label}`, provenance: prov });
      else if (s.gap) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.gap)}, which is one of the gaps between the street and ${venue.entity.name}`, provenance: prov });
      else if (s.shared) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.shared)}, which the street already likes ${venue.entity.name} for`, provenance: prov });
      else extra.push({ kind: "affinity", text: walk, provenance: prov });
    }
    return { ...s.p, because: [...s.p.because, ...extra] };
  });
}
