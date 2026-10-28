import type { EntityRef, NightFormat, NightPlan, PlanInput, PlanResponse, QuietSlot, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { checkClaims } from "../copy/claims.ts";
import { templateCopy } from "../copy/templates.ts";
import { listWords } from "../../shared/words.ts";
import { briefNames, buildBrief } from "../copy/brief.ts";
import { RANK_LIMIT } from "../street/steps/limits.ts";
import { fmtDay } from "../street/words.ts";
import { scoreCandidates, type Candidate } from "./candidates.ts";
import { FORMATS, FORMAT_ORDER, PLAYLIST_LICENCE } from "./formats.ts";
import { menuFor, menuTags } from "./menu.ts";
import { pickPartners } from "./partners.ts";
import { whyFor } from "./reasons.ts";
import { nextSlotDate, parseHHMM } from "./time.ts";

export { MAX_PARTNERS, WALK_M } from "./partners.ts";
export { provIndex } from "./provenance.ts";

export const PLAYLIST_SIZE = 8;

export class PlanError extends Error {
  code: "no_candidates" | "all_avoided";
  constructor(code: PlanError["code"], message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

// Book formats such as Audiobook or Paperback are on every book, so they never make a theme.
const FORMAT_TAG = /^(audiobook|e ?book|hardcover|paperback|mass market|kindle)/i;

// The theme only names tags the feature itself carries, so a film night is never themed with the street's book tags.
function themeFor(c: Candidate, read: StreetRead): StreetTag[] {
  const out: StreetTag[] = [];
  const add = (t: StreetTag | undefined) => {
    if (t && !FORMAT_TAG.test(t.name.trim()) && !out.some((o) => o.id === t.id) && out.length < 3) out.push(t);
  };
  const tags = new Set(c.feature?.tags ?? []);
  if (c.menuTag) add(c.menuTag);
  if (c.format === "tasting") for (const m of menuTags(read)) add(m.tag);
  for (const g of read.gaps) if (tags.has(g.tag.id)) add(g.tag);
  for (const t of read.streetTags) if (tags.has(t.id)) add(t);
  for (const t of read.venueTags) if (tags.has(t.id)) add(t);
  return out;
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

// An alternative is offered by what it features, so one without a named Qloo pick, such as a tasting night, only
// ever leads; it is never one of the two choices beside the night.
function featured(c: Candidate): boolean {
  return !!c.feature && c.feature.name.trim() !== "";
}

function pickNights(ranked: Candidate[]): Candidate[] {
  const picks: Candidate[] = [];
  for (const c of ranked) {
    if (picks.length >= 3) break;
    if (picks.length > 0 && !featured(c)) continue;
    const repeats = picks.some((p) => p.format === c.format || (p.feature && c.feature && p.feature.id === c.feature.id));
    if (!repeats) picks.push(c);
  }
  return picks;
}

function validStart(s: string | undefined): string | undefined {
  return s && parseHHMM(s) ? s : undefined;
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
  const picks = pickNights(allowed);

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
    const partners = pickPartners(c, theme, read, venue, slot, notes);
    const menuIdeas = menuFor(c.menuTag, read, venue);
    if (!menuIdeas.length) notes.push("Qloo returned no food or drink tags for your audience or the street, so there are no menu ideas.");
    const playlist = playlistFor(read);
    const def = FORMATS[c.format];
    if (def.licence) notes.push(def.licence);
    if (playlist.length) notes.push(PLAYLIST_LICENCE);
    if (i === 0 && picks.length < 3) {
      notes.push(
        picks.length === 1
          ? "No other kind of night had a Qloo pick to feature, so there are no alternatives."
          : "Only one other kind of night had a Qloo pick to feature, so there is one alternative.",
      );
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
    if (cap !== undefined) plan.maxPeople = cap;
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
