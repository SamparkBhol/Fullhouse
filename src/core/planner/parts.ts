import type { EntityRef, NightCopy, NightFormat, NightPlan, PlanInput, QuietSlot, Rising, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { briefNames, buildBrief } from "../copy/brief.ts";
import { checkClaims } from "../copy/claims.ts";
import { templateCopy } from "../copy/templates.ts";
import type { Candidate } from "./candidates.ts";
import { FORMATS, FORMAT_ORDER } from "./formats.ts";
import { menuTags } from "./menu.ts";
import { nextSlotDate, parseHHMM } from "./time.ts";

export const PLAYLIST_SIZE = 8;

// Book formats such as Audiobook or Paperback are on every book, so they never make a theme.
const FORMAT_TAG = /^(audiobook|e ?book|hardcover|paperback|mass market|kindle)/i;

// The theme only names tags the feature itself carries, so a film night is never themed with the street's book tags.
export function themeFor(c: Pick<Candidate, "feature" | "menuTag" | "format">, read: StreetRead): StreetTag[] {
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

export function playlistFrom(rising: Rising[]): EntityRef[] {
  return rising
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

export interface NightSlot {
  slot: QuietSlot;
  when: { date: string; start: string; end: string };
  cap: number | undefined;
  noLive: boolean;
  avoid: Set<NightFormat>;
  prefer: Set<NightFormat>;
}

function validStart(s: string | undefined): string | undefined {
  return s && parseHHMM(s) ? s : undefined;
}

export function nightSlot(venue: Venue, input: PlanInput, now: Date): NightSlot {
  const noLive = input.noLiveMusic ?? venue.noLiveMusic ?? venue.house?.music === false;
  const avoid = new Set<NightFormat>(input.avoidFormats ?? []);
  if (noLive) for (const f of FORMAT_ORDER) if (FORMATS[f].music) avoid.add(f);
  const prefer = new Set<NightFormat>((input.preferFormats ?? []).filter((f) => !avoid.has(f)));
  const caps = [input.maxPeople, venue.capacity].filter((n): n is number => typeof n === "number" && n > 0);
  const slot: QuietSlot = {
    weekday: input.weekday ?? venue.quietSlot.weekday,
    start: validStart(input.start) ?? venue.quietSlot.start,
    durationMin: input.durationMin ?? venue.quietSlot.durationMin,
  };
  return { slot, when: nextSlotDate(slot, venue.tz, now), cap: caps.length ? Math.min(...caps) : undefined, noLive, avoid, prefer };
}

export const EMPTY_COPY: NightCopy = {
  eventTitle: "",
  eventDescription: "",
  posterHeadline: "",
  posterSub: "",
  social: "",
  partnerPitch: { subject: "", body: "" },
  writtenBy: "template",
};

export function withTemplateCopy(plan: NightPlan, venue: Venue, read: StreetRead): NightPlan {
  const copy = templateCopy(plan, venue);
  const text = [copy.eventTitle, copy.eventDescription, copy.posterHeadline, copy.posterSub, copy.social, copy.partnerPitch.subject, copy.partnerPitch.body].join("\n");
  const check = checkClaims(text, briefNames(buildBrief({ ...plan, copy }, venue, read), plan, read));
  return { ...plan, copy, checks: { claimsVerified: check.ok, unverified: check.unverified } };
}
