import type {
  Because,
  EntityRef,
  LovedPlace,
  MenuIdea,
  NightFormat,
  NightPlan,
  PlanInput,
  PlanResponse,
  QuietSlot,
  Rising,
  StreetRead,
  StreetTag,
  Venue,
} from "../../shared/contract.ts";
import { checkClaims } from "../copy/claims.ts";
import { templateCopy } from "../copy/templates.ts";
import { capFirst, listWords } from "../copy/text.ts";
import { briefNames, buildBrief } from "../copy/write.ts";
import { tagLabel } from "../qloo/parse.ts";
import { describeDistance, haversineM } from "../street/geo.ts";
import { RANK_LIMIT } from "../street/read.ts";
import { FORMATS, FORMAT_ORDER, MENU_NAMESPACES, PLAYLIST_LICENCE, type FormatDef } from "./formats.ts";
import { nextSlotDate, parseHHMM } from "./time.ts";

export const WALK_M = 1000;
export const MAX_PARTNERS = 3;
export const PLAYLIST_SIZE = 8;

export class PlanError extends Error {
  code: "no_candidates" | "all_avoided";
  constructor(code: PlanError["code"], message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

interface Candidate {
  format: NightFormat;
  feature: Rising | null;
  menuTag: StreetTag | null;
  score: number;
}

const MOMENTUM: Record<Rising["trend"], number> = { rising: 0.3, steady: 0.1, unknown: 0, falling: -0.2 };
const COMPETITOR_NS = ["urn:tag:genre:place", "urn:tag:category:place"];

export function provIndex(read: StreetRead, calls: string[]): number {
  for (const call of calls) {
    for (let i = read.provenance.length - 1; i >= 0; i--) {
      const p = read.provenance[i];
      if (p && p.call === call && (p.resultCount > 0 || call === calls[calls.length - 1])) return i;
    }
  }
  return -1;
}

function streetTagsIndex(read: StreetRead): number {
  return provIndex(read, ["street_tags_open", "street_tags"]);
}

function fitsPeople(def: FormatDef, cap: number | undefined): number {
  if (cap === undefined) return 1;
  return cap >= def.people.min ? 1 : 0.6;
}

function menuTags(read: StreetRead): StreetTag[] {
  return read.streetTags.filter((t) => MENU_NAMESPACES.includes(t.namespace) && t.namespace !== "urn:tag:dining_options:place");
}

function menuText(t: StreetTag): string {
  const label = t.namespace === "urn:tag:cuisine:qloo" ? t.name : t.name.toLowerCase();
  return `${capFirst(label)} on the night's menu`;
}

function scoreCandidates(read: StreetRead, venue: Venue, cap: number | undefined, prefer: Set<NightFormat>): Candidate[] {
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

function themeFor(c: Candidate, read: StreetRead): StreetTag[] {
  const def = FORMATS[c.format];
  const out: StreetTag[] = [];
  const add = (t: StreetTag | undefined) => {
    if (t && !out.some((o) => o.id === t.id) && out.length < 3) out.push(t);
  };
  const tags = new Set(c.feature?.tags ?? []);
  if (c.menuTag) add(c.menuTag);
  for (const g of read.gaps) if (tags.has(g.tag.id)) add(g.tag);
  for (const t of read.streetTags) if (tags.has(t.id)) add(t);
  for (const t of read.streetTags) if (def.themeNamespaces.includes(t.namespace)) add(t);
  return out;
}

function pickPartners(
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
  const themeIds = new Set([...theme.map((t) => t.id), ...read.gaps.map((g) => g.tag.id), ...read.shared.map((t) => t.id)]);
  const venueCats = new Set(venue.entity.tags.filter((t) => COMPETITOR_NS.some((ns) => t.startsWith(`${ns}:`))));
  const scored = walkable.map((p) => {
    const overlap = p.tags.filter((t) => themeIds.has(t));
    const hint = p.tags.find((t) => def.partnerHints.some((h) => tagLabel(t).toLowerCase().includes(h)));
    const competitor = p.tags.some((t) => venueCats.has(t));
    return { p, overlap, hint, competitor, score: overlap.length * 2 + (hint ? 1 : 0) };
  });
  const order = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.p.rank - b.p.rank;
  const matching = scored.filter((s) => s.score > 0).sort(order);
  const nonCompeting = matching.filter((s) => !s.competitor);
  let chosen = nonCompeting.length >= 2 ? nonCompeting : matching;
  chosen = chosen.slice(0, MAX_PARTNERS);
  if (chosen.length < 2) {
    const fill = scored
      .filter((s) => !chosen.includes(s) && !s.competitor)
      .sort((a, b) => a.p.rank - b.p.rank)
      .slice(0, 2 - chosen.length);
    if (fill.length) notes.push("Few nearby places shared a tag with this night, so some partners are simply the street's top loved places.");
    chosen = [...chosen, ...fill];
  }
  if (chosen.some((s) => s.competitor)) notes.push("A partner shares a category with your venue because no other nearby match came back.");
  return chosen.map((s) => {
    const prov = s.p.because[0]?.provenance ?? -1;
    const extra: Because[] = [];
    const walk = `${capFirst(describeDistance(s.p.distanceM))} from ${venue.entity.name}`;
    const first = s.overlap[0];
    if (first && prov >= 0) {
      extra.push({ kind: "tag", text: `${walk}, tagged ${tagLabel(first)}, which fits this night's theme`, provenance: prov });
    } else if (s.hint && prov >= 0) {
      extra.push({ kind: "tag", text: `${walk}, tagged ${tagLabel(s.hint)}, which Full House pairs with a ${def.label}`, provenance: prov });
    } else if (prov >= 0) {
      extra.push({ kind: "affinity", text: walk, provenance: prov });
    }
    return { ...s.p, because: [...s.p.because, ...extra] };
  });
}

function menuFor(c: Candidate, read: StreetRead): MenuIdea[] {
  const prov = streetTagsIndex(read);
  if (prov < 0) return [];
  const tags = menuTags(read);
  const ordered = c.menuTag ? [c.menuTag, ...tags.filter((t) => t.id !== c.menuTag?.id)] : tags;
  return ordered.slice(0, 3).map((t) => ({
    text: menuText(t),
    because: [{ kind: "tag", text: `The street ranks ${t.name} #${t.rank} in its taste profile`, provenance: prov }],
  }));
}

function playlistFor(read: StreetRead): EntityRef[] {
  return read.rising
    .filter((r) => r.type === "artist")
    .sort((a, b) => a.rank - b.rank)
    .slice(0, PLAYLIST_SIZE)
    .map((r) => {
      const e: EntityRef = { id: r.id, name: r.name, type: r.type };
      if (r.subtype) e.subtype = r.subtype;
      if (r.image) e.image = r.image;
      if (r.url) e.url = r.url;
      return e;
    });
}

function whyFor(c: Candidate, theme: StreetTag[], read: StreetRead, venue: Venue, playlist: EntityRef[]): Because[] {
  const why: Because[] = [];
  if (c.feature) why.push(...c.feature.because);
  const themeGap = read.gaps.find((g) => theme.some((t) => t.id === g.tag.id));
  if (themeGap) why.push(...themeGap.because);
  else {
    const prov = streetTagsIndex(read);
    const t = theme[0];
    if (t && prov >= 0 && read.streetTags.some((s) => s.id === t.id)) {
      why.push({ kind: "tag", text: `${t.name} ranks #${t.rank} in the street's taste profile`, provenance: prov });
    }
  }
  const iCompare = provIndex(read, ["compare"]);
  const shared = read.shared[0];
  if (shared && iCompare >= 0) {
    why.push({ kind: "compare", text: `${venue.entity.name}'s audience and the places the street loves most share ${shared.name}`, provenance: iCompare });
  }
  const layer = read.heat[0];
  const top = layer?.cells[0];
  if (layer && top) {
    const d = haversineM(read.center, { lat: top.lat, lng: top.lng });
    why.push({ kind: "heatmap", text: `The strongest heat cell for the street's top tastes sits ${describeDistance(d)} from ${venue.entity.name}`, provenance: layer.provenance });
  }
  const iArtist = provIndex(read, ["insights_artist"]);
  if (playlist.length && iArtist >= 0) {
    why.push({ kind: "affinity", text: `The playlist is the top ${playlist.length} artists for the taste of people around ${venue.entity.name}`, provenance: iArtist });
  }
  return why;
}

function validStart(s: string | undefined): string | undefined {
  return s && parseHHMM(s) ? s : undefined;
}

function fmtDay(iso: string): string {
  return iso.slice(0, 10);
}

export function planNights(
  read: StreetRead,
  venue: Venue,
  input: PlanInput,
  now: Date,
  origin: NightPlan["origin"],
  newId: () => string,
): PlanResponse {
  const noLive = input.noLiveMusic ?? venue.noLiveMusic ?? false;
  const avoid = new Set<NightFormat>(input.avoidFormats ?? []);
  if (noLive) for (const f of FORMAT_ORDER) if (FORMATS[f].music) avoid.add(f);
  const prefer = new Set<NightFormat>((input.preferFormats ?? []).filter((f) => !avoid.has(f)));
  const caps = [input.maxPeople, venue.capacity].filter((n): n is number => typeof n === "number" && n > 0);
  const cap = caps.length ? Math.min(...caps) : undefined;
  const slot: QuietSlot = {
    weekday: input.weekday ?? venue.quietSlot.weekday,
    start: validStart(input.start) ?? venue.quietSlot.start,
    durationMin: input.durationMin ?? venue.quietSlot.durationMin,
  };
  const when = nextSlotDate(slot, venue.tz, now);

  const all = scoreCandidates(read, venue, cap, prefer);
  if (!all.length) {
    throw new PlanError("no_candidates", "Qloo returned no artists, books, films, shows, podcasts, games or food tags for this street, so there is nothing to build a night from.");
  }
  const allowed = all.filter((c) => !avoid.has(c.format));
  if (!allowed.length) {
    throw new PlanError("all_avoided", "Every night format that has Qloo data for this street was ruled out by the request.");
  }
  const picks: Candidate[] = [];
  for (const c of allowed) {
    if (picks.length >= 3) break;
    if (!picks.some((p) => p.format === c.format)) picks.push(c);
  }

  const shared: string[] = [];
  if (noLive) shared.push("Listening nights were left out because you asked for no live music.");
  const avoided = [...avoid].filter((f) => !FORMATS[f].music || !noLive);
  if (avoided.length) shared.push(`Left out at your request: ${listWords(avoided.map((f) => `${FORMATS[f].label}s`))}.`);
  if (prefer.size && !picks.some((p) => prefer.has(p.format))) {
    shared.push(`Qloo returned nothing to build a ${listWords([...prefer].map((f) => FORMATS[f].label))} from, so this is the closest fit.`);
  }
  if (cap !== undefined) shared.push(`Sized for up to ${cap} people.`);
  shared.push(`Based on the street read from ${fmtDay(read.at)}.`, RANK_LIMIT);

  const plans = picks.map((c, i) => {
    const notes: string[] = [];
    const theme = themeFor(c, read);
    const partners = pickPartners(c, theme, read, venue, notes);
    const menuIdeas = menuFor(c, read);
    if (!menuIdeas.length) notes.push("Qloo returned no food or drink tags for this street, so there are no menu ideas.");
    const playlist = playlistFor(read);
    const def = FORMATS[c.format];
    if (def.licence) notes.push(def.licence);
    if (playlist.length) notes.push(PLAYLIST_LICENCE);
    if (i === 0 && picks.length < 3) {
      notes.push(picks.length === 1 ? "No other night format had Qloo data, so there are no alternatives." : "Only one other night format had Qloo data, so there is one alternative.");
    }
    const plan: NightPlan = {
      id: newId(),
      venueId: venue.id,
      createdAt: now.toISOString(),
      origin,
      date: when.date,
      start: when.start,
      end: when.end,
      format: c.format,
      feature: c.feature,
      themeTags: theme,
      partners,
      menuIdeas,
      playlist,
      why: whyFor(c, theme, read, venue, playlist),
      copy: {
        eventTitle: "",
        eventDescription: "",
        posterHeadline: "",
        posterSub: "",
        social: "",
        partnerPitch: { subject: "", body: "" },
        writtenBy: "template",
      },
      checks: { claimsVerified: true, unverified: [] },
      limits: [...notes, ...shared],
      readAt: read.at,
      status: "proposed",
    };
    plan.copy = templateCopy(plan, venue);
    const c2 = plan.copy;
    const text = [c2.eventTitle, c2.eventDescription, c2.posterHeadline, c2.posterSub, c2.social, c2.partnerPitch.subject, c2.partnerPitch.body].join("\n");
    const check = checkClaims(text, briefNames(buildBrief(plan, venue, read), plan, read));
    plan.checks = { claimsVerified: check.ok, unverified: check.unverified };
    return plan;
  });

  const [plan, ...alternatives] = plans;
  if (!plan) throw new PlanError("no_candidates", "No night could be planned from this street read.");
  return { plan, alternatives };
}
