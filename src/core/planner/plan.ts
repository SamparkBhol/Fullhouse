import type { EntityRef, MenuIdea, NightFormat, NightPlan, PlanInput, PlanResponse, QuietSlot, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { checkClaims } from "../copy/claims.ts";
import { templateCopy } from "../copy/templates.ts";
import { listWords } from "../copy/text.ts";
import { briefNames, buildBrief } from "../copy/write.ts";
import { RANK_LIMIT } from "../street/steps/limits.ts";
import { streetTagLine } from "../street/words.ts";
import { menuTags, scoreCandidates, type Candidate } from "./candidates.ts";
import { FORMATS, FORMAT_ORDER, PLAYLIST_LICENCE, menuItem } from "./formats.ts";
import { pickPartners } from "./partners.ts";
import { streetTagsIndex, whyFor } from "./reasons.ts";
import { nextSlotDate, parseHHMM } from "./time.ts";

export { MAX_PARTNERS, WALK_M } from "./partners.ts";
export { provIndex } from "./reasons.ts";

export const PLAYLIST_SIZE = 8;

export class PlanError extends Error {
  code: "no_candidates" | "all_avoided";
  constructor(code: PlanError["code"], message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

function menuText(t: StreetTag): string {
  return `Add ${menuItem(t)} to the menu for the night`;
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

function menuFor(c: Candidate, read: StreetRead, venue: Venue): MenuIdea[] {
  const prov = streetTagsIndex(read);
  if (prov < 0) return [];
  const tags = menuTags(read);
  const ordered = c.menuTag ? [c.menuTag, ...tags.filter((t) => t.id !== c.menuTag?.id)] : tags;
  return ordered.slice(0, 3).map((t) => ({
    text: menuText(t),
    because: [{ kind: "tag", text: streetTagLine(t.name, venue.entity.name), provenance: prov }],
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
    const menuIdeas = menuFor(c, read, venue);
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
