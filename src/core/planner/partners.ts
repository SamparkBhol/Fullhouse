import type { Because, LovedPlace, QuietSlot, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { capFirst } from "../../shared/words.ts";
import { tagLabel } from "../qloo/tags.ts";
import { describeDistance } from "../street/geo.ts";
import { canHost, isKindTag } from "../street/hosts.ts";
import type { Candidate } from "./candidates.ts";
import { FORMATS } from "./formats.ts";
import { hoursLine, hoursVerdict } from "./hours.ts";

export const WALK_M = 1000;
export const MAX_PARTNERS = 3;
// A loved place whose crowd carried at least this much of the feature in Qloo's explainability has a stake in the night.
const CARRIER_SHARE = 0.3;

export interface Slot {
  weekday: QuietSlot["weekday"];
  start: string;
}

function carrierIds(c: Candidate): Set<string> {
  return new Set((c.feature?.explain ?? []).filter((x) => x.share >= CARRIER_SHARE).map((x) => x.entityId.toUpperCase()));
}

function partnerBecause(p: LovedPlace, slot: Slot, prov: number): Because[] {
  if (prov < 0) return [];
  const open = hoursLine(p, slot.weekday);
  if (open) return [{ kind: "affinity", text: `${open}, from Qloo's listing`, provenance: prov }];
  return hoursVerdict(p, slot.weekday, slot.start) === "unknown"
    ? [{ kind: "affinity", text: `Qloo has no opening hours for ${p.name}, check before you send`, provenance: prov }]
    : [];
}

export function pickPartners(c: Candidate, theme: StreetTag[], read: StreetRead, venue: Venue, slot: Slot, notes: string[]): LovedPlace[] {
  const def = FORMATS[c.format];
  const walkable = read.lovedPlaces.filter((p) => p.distanceM <= WALK_M);
  if (!walkable.length) {
    notes.push("No place within a 1 km walk came back from Qloo, so this night has no partners.");
    return [];
  }
  const open = walkable.filter((p) => hoursVerdict(p, slot.weekday, slot.start) !== "closed");
  const shut = walkable.length - open.length;
  if (shut) notes.push(shut === 1 ? "1 nearby place is left out because Qloo lists it as closed by the start of the night." : `${shut} nearby places are left out because Qloo lists them as closed by the start of the night.`);
  const themeIds = new Set(theme.map((t) => t.id));
  const gapIds = new Set(read.gaps.map((g) => g.tag.id));
  const sharedIds = new Set(read.shared.map((t) => t.id));
  const carriers = carrierIds(c);
  const names = new Map<string, string>();
  for (const t of [...read.streetTags, ...read.shared, ...read.gaps.map((g) => g.tag)]) names.set(t.id, t.name);
  const venueCats = new Set(venue.entity.tags.filter(isKindTag));
  const scored = open.map((p) => {
    const onTheme = p.tags.find((t) => themeIds.has(t));
    const gap = p.tags.find((t) => gapIds.has(t));
    const shared = p.tags.find((t) => sharedIds.has(t));
    const hint = p.tags.find((t) => isKindTag(t) && def.partnerHints.some((h) => tagLabel(t).toLowerCase().includes(h)));
    const competitor = p.tags.some((t) => venueCats.has(t));
    const carrier = carriers.has(p.id.toUpperCase());
    // A tag the venue already shares, such as LGBTQ+ friendly, says nothing about the night, so it only breaks ties.
    const score =
      p.tags.filter((t) => themeIds.has(t)).length * 3 + (hint ? 2 : 0) + (carrier ? 1.5 : 0) + p.tags.filter((t) => gapIds.has(t)).length + (shared ? 0.5 : 0);
    return { p, onTheme, gap, shared, hint, competitor, carrier, score };
  });
  const order = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.p.rank - b.p.rank;
  const nonCompeting = scored.filter((s) => !s.competitor);
  const pool = nonCompeting.length >= 2 ? nonCompeting : scored;
  let chosen = pool.filter((s) => s.score >= 1).sort(order).slice(0, MAX_PARTNERS);
  if (chosen.length < 2) {
    const fill = pool
      .filter((s) => !chosen.includes(s) && canHost(s.p))
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
    const feature = c.feature?.name ?? "";
    if (prov >= 0) {
      if (s.onTheme) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.onTheme)}, which is part of this night's theme`, provenance: prov });
      else if (s.hint) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.hint)}, which Full House pairs with a ${def.label}`, provenance: prov });
      else if (s.carrier) extra.push({ kind: "explainability", text: `${walk}, and its crowd carries a share of ${feature} in Qloo's explainability`, provenance: c.feature?.because[0]?.provenance ?? prov });
      else if (s.gap) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.gap)}, which is one of the gaps between the street and ${venue.entity.name}`, provenance: prov });
      else if (s.shared) extra.push({ kind: "tag", text: `${walk}, tagged ${label(s.shared)}, which the street already likes ${venue.entity.name} for`, provenance: prov });
      else extra.push({ kind: "affinity", text: walk, provenance: prov });
    }
    return { ...s.p, because: [...s.p.because, ...partnerBecause(s.p, slot, prov), ...extra] };
  });
}
