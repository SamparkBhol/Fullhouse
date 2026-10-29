import type { Because, LovedPlace, Match, NightPlan, PlanInput, PlanResponse, Rising, StreetRead, Venue } from "../../shared/contract.ts";
import { capFirst, listWords, plainName } from "../../shared/words.ts";
import { FORMATS, PLAYLIST_LICENCE } from "../planner/formats.ts";
import { menuFor } from "../planner/menu.ts";
import { EMPTY_COPY, nightSlot, playlistFrom, themeFor, withTemplateCopy, type NightSlot } from "../planner/parts.ts";
import { partnerBecause } from "../planner/partners.ts";
import { planNights } from "../planner/plan.ts";
import { describeDistance } from "../street/geo.ts";
import { CROSS_TYPES } from "../street/steps/cross_domain.ts";
import { RANK_LIMIT } from "../street/steps/limits.ts";
import { fmtDay } from "../street/words.ts";
import { EVEN_HIGH, EVEN_LOW, balancePicks, nearEven, type Balanced } from "./balance.ts";
import { formatForType, hostFor } from "./host.ts";
import { hostLine, sharedBecause, splitBecause } from "./reasons.ts";

export const JOINT_ALTERNATIVES = 2;

interface Ctx {
  read: StreetRead;
  venue: Venue;
  match: Match;
  joint: Rising[];
  input: PlanInput;
  night: NightSlot;
  now: Date;
  origin: NightPlan["origin"];
  newId: () => string;
}

function partnerOf(ctx: Ctx): LovedPlace {
  const p = ctx.match.partner;
  const prov = p.because[0]?.provenance ?? -1;
  if (prov < 0) return p;
  const walk: Because = { kind: "affinity", text: `${capFirst(describeDistance(p.distanceM))} from ${plainName(ctx.venue.entity.name)}`, provenance: prov };
  return { ...p, because: [...p.because, walk, ...partnerBecause(p, ctx.night.slot, prov)] };
}

function shellNotes(ctx: Ctx): string[] {
  const out: string[] = [];
  if (ctx.night.cap !== undefined) out.push(`Sized for up to ${ctx.night.cap} people.`);
  out.push(`Based on the street read from ${fmtDay(ctx.read.at)}.`, RANK_LIMIT);
  return out;
}

function jointNight(b: Balanced, ctx: Ctx): NightPlan {
  const { venue, match, read } = ctx;
  const format = formatForType(b.pick.type) ?? "book";
  const host = hostFor(format, venue.entity, match.partner);
  const split = splitBecause(b, venue, match);
  const feature: Rising = { ...b.pick, because: [...b.pick.because.slice(0, 1), ...(split ? [split] : [])] };
  const theme = themeFor({ feature, menuTag: null, format }, read);
  const playlist = playlistFrom(ctx.joint);
  const def = FORMATS[format];
  const notes = [...(def.licence ? [def.licence] : []), ...(playlist.length ? [PLAYLIST_LICENCE] : [])];
  const shared = sharedBecause(match);
  const where = hostLine(host, format, venue, match);
  const artists = ctx.joint.find((r) => r.type === "artist")?.because[0];
  const plan: NightPlan = {
    id: ctx.newId(),
    venueId: venue.id,
    createdAt: ctx.now.toISOString(),
    origin: ctx.origin,
    date: ctx.night.when.date,
    start: ctx.night.when.start,
    end: ctx.night.when.end,
    format,
    feature,
    themeTags: theme,
    partners: [partnerOf(ctx)],
    menuIdeas: menuFor(null, read, venue),
    playlist,
    why: [
      ...feature.because,
      ...(shared ? [shared] : []),
      ...(where ? [where] : []),
      ...(playlist.length && artists ? [{ ...artists, text: `The playlist is the top ${playlist.length} artists Qloo picked for people who like ${plainName(venue.entity.name)} and ${plainName(match.partner.name)}` }] : []),
    ],
    copy: EMPTY_COPY,
    checks: { claimsVerified: true, unverified: [] },
    limits: [...notes, ...shellNotes(ctx)],
    readAt: read.at,
    status: "proposed",
    match: { partner: match.partner, shared: match.shared, split: b.split, host },
  };
  if (ctx.night.cap !== undefined) plan.maxPeople = ctx.night.cap;
  return withTemplateCopy(plan, venue, read);
}

// The venue's own pick, still planned with the partner, and said to be the venue's.
function venueNight(plan: NightPlan, ctx: Ctx, note: string): NightPlan {
  const host = hostFor(plan.format, ctx.venue.entity, ctx.match.partner);
  const shared = sharedBecause(ctx.match);
  return withTemplateCopy(
    {
      ...plan,
      partners: [partnerOf(ctx)],
      why: [...plan.why, ...(shared ? [shared] : [])],
      limits: [note, ...plan.limits],
      match: { partner: ctx.match.partner, shared: ctx.match.shared, split: null, host },
    },
    ctx.venue,
    ctx.read,
  );
}

function soloNights(ctx: Ctx): NightPlan[] {
  try {
    const r = planNights(ctx.read, ctx.venue, ctx.input, ctx.now, ctx.origin, ctx.newId);
    return [r.plan, ...r.alternatives];
  } catch {
    return [];
  }
}

export function planJoint(read: StreetRead, joint: Rising[], venue: Venue, match: Match, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse {
  const night = nightSlot(venue, input, now);
  const ctx: Ctx = { read, venue, match, joint, input, night, now, origin, newId };
  const allowed = balancePicks(joint, venue.entity.id, match.partner.id, CROSS_TYPES).filter((b) => {
    const f = formatForType(b.pick.type);
    return f !== null && !night.avoid.has(f);
  });
  const even = allowed.filter((b) => nearEven(b.split));
  const preferred = (b: Balanced) => (night.prefer.has(formatForType(b.pick.type) ?? "book") ? 0 : 1);
  const ranked = [...even].sort((a, b) => preferred(a) - preferred(b));
  const picks: Balanced[] = [];
  for (const b of ranked) if (!picks.some((p) => formatForType(p.pick.type) === formatForType(b.pick.type))) picks.push(b);
  const own = soloNights(ctx);
  const v = plainName(venue.entity.name);
  const p = plainName(match.partner.name);
  const ownNote = `This idea is built on ${v}'s own pick, not on the joint read.`;

  if (!picks.length) {
    const [first, ...rest] = own;
    if (!first) return planNights(read, venue, input, now, origin, newId);
    const why = allowed.length
      ? `No pick in the joint read came out near half and half between the two crowds (${EVEN_LOW} to ${EVEN_HIGH}), so this night is built on ${v}'s own top pick.`
      : `Qloo could not split any pick between ${v} and ${p}, so this night is built on ${v}'s own top pick.`;
    return { plan: venueNight(first, ctx, why), alternatives: rest.slice(0, JOINT_ALTERNATIVES).map((p) => venueNight(p, ctx, ownNote)) };
  }
  const [main, ...others] = picks.slice(0, JOINT_ALTERNATIVES + 1).map((b) => jointNight(b, ctx));
  const used = new Set([main!.format, ...others.map((o) => o.format)]);
  const fill = own.filter((p) => !used.has(p.format)).slice(0, JOINT_ALTERNATIVES - others.length).map((p) => venueNight(p, ctx, ownNote));
  if (!others.length && !fill.length) main!.limits.unshift(`No other pick came out near half and half for ${listWords([v, p])}, so there is no other idea.`);
  return { plan: main!, alternatives: [...others, ...fill] };
}
