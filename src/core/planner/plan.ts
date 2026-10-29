import type { NightPlan, PlanInput, PlanResponse, StreetRead, Venue } from "../../shared/contract.ts";
import { listWords } from "../../shared/words.ts";
import { foodLed } from "../street/hosts.ts";
import { RANK_LIMIT } from "../street/steps/limits.ts";
import { fmtDay } from "../street/words.ts";
import { scoreCandidates, type Candidate } from "./candidates.ts";
import { FORMATS, PLAYLIST_LICENCE } from "./formats.ts";
import { menuFor } from "./menu.ts";
import { pickPartners } from "./partners.ts";
import { whyFor } from "./reasons.ts";
import { EMPTY_COPY, nightSlot, playlistFrom, themeFor, withTemplateCopy } from "./parts.ts";

export { MAX_PARTNERS, WALK_M } from "./partners.ts";
export { provIndex } from "./provenance.ts";
export { PLAYLIST_SIZE } from "./parts.ts";

export class PlanError extends Error {
  code: "no_candidates" | "all_avoided";
  constructor(code: PlanError["code"], message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
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

export function planNights(
  read: StreetRead,
  venue: Venue,
  input: PlanInput,
  now: Date,
  origin: NightPlan["origin"],
  newId: () => string,
): PlanResponse {
  const { slot, when, cap, noLive, avoid, prefer } = nightSlot(venue, input, now);

  const all = scoreCandidates(read, venue, cap, prefer);
  if (!all.length) {
    throw new PlanError("no_candidates", "No artists, books, films, shows, podcasts, games or food tags came back for this street, so there is nothing to build a night from.");
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
    shared.push(`Nothing came back to build a ${listWords([...prefer].map((f) => FORMATS[f].label))} from, so this is the closest fit.`);
  }
  if (cap !== undefined) shared.push(`Sized for up to ${cap} people.`);
  shared.push(`Based on the street read from ${fmtDay(read.at)}.`, RANK_LIMIT);

  const plans = picks.map((c, i) => {
    const notes: string[] = [];
    const theme = themeFor(c, read);
    const partners = pickPartners(c, theme, read, venue, slot, notes);
    const menuIdeas = menuFor(c.menuTag, read, venue);
    if (!menuIdeas.length && foodLed(venue.entity)) notes.push("No food or drink tags came back for your audience or the street, so there are no menu ideas.");
    const playlist = playlistFrom(read.rising);
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
      copy: EMPTY_COPY,
      checks: { claimsVerified: true, unverified: [] },
      limits: [...notes, ...shared],
      readAt: read.at,
      status: "proposed",
    };
    if (cap !== undefined) plan.maxPeople = cap;
    return withTemplateCopy(plan, venue, read);
  });

  const [plan, ...alternatives] = plans;
  if (!plan) throw new PlanError("no_candidates", "No night could be planned from this street read.");
  return { plan, alternatives };
}
