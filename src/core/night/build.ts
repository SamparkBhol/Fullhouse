import type { Because, KindGroup, LovedPlace, Match, NightDay, NightPlan, PairNight, PlanInput, PlanResponse, Rising, SharedPicks, StreetRead, Venue } from "../../shared/contract.ts";
import { BALANCE_TOP, nearEven, splitOf } from "../joint/balance.ts";
import { capFirst, shortName } from "../../shared/words.ts";
import { FORMATS, PLAYLIST_LICENCE } from "../planner/formats.ts";
import { menuFor } from "../planner/menu.ts";
import { EMPTY_COPY, nightSlot, playlistFrom, themeFor, withTemplateCopy, type NightSlot } from "../planner/parts.ts";
import { partnerBecause } from "../planner/partners.ts";
import { RANK_LIMIT } from "../street/steps/limits.ts";
import { fmtDay } from "../street/words.ts";
import { groupOf } from "../pair/groups.ts";
import type { StopPicks } from "./activity.ts";
import { artPickSet } from "./art.ts";
import { bookFilmSets } from "./connect.ts";
import { pairFormat, plainTwoStop, type PairFormatDef } from "./grammar.ts";
import { playlistStops } from "./music.ts";
import { dayNotes } from "./notes.ts";
import { pickSet, usable, type PickSet } from "./picks.ts";
import { quizSet, type QuizSet } from "./quiz.ts";
import { pickBecause, nightReasons, roundBecause } from "./reasons.ts";
import { schedule } from "./schedule.ts";
import { stopsOf, type Side } from "./stops.ts";
import { formatWhy } from "./voice.ts";

export const PAIR_ALTERNATIVES = 2;

export interface PairCtx {
  read: StreetRead;
  venue: Venue;
  match: Match;
  joint: Rising[];
  input: PlanInput;
  now: Date;
  origin: NightPlan["origin"];
  newId: () => string;
}

// A venue with a stage and its own programme plays that programme, whatever Qloo files it as.
function venueGroup(venue: Venue): KindGroup | null {
  const g = groupOf(venue.entity);
  return venue.house?.stage && (g === null || ["drinks", "coffee", "food"].includes(g)) ? "live" : g;
}

// The owner can rule a format out, and a room with no space for a spoken event never gets a quiz or a book club;
// the two places then still meet, with nothing on that the owner said no to.
export function formatFor(venue: Venue, partner: LovedPlace, night: NightSlot): PairFormatDef {
  const a = venueGroup(venue);
  const b = groupOf(partner);
  const def = pairFormat(a, b);
  const spokenAtVenue = venue.house?.spoken === false && def.types.length > 0 && ["quiz", "book"].includes(def.legacy) && a !== "book";
  if ((night.avoid.has(def.legacy) || spokenAtVenue) && def.format !== "two_stop") return plainTwoStop(a, b);
  return def;
}

// Titles both crowds put in their top ten of one kind, for the screens to say what the two share when tags are thin.
export function sharedPicks(joint: Rising[], venue: { id: string; name: string }, partner: { id: string; name: string }, types: Rising["type"][]): SharedPicks | undefined {
  const names = [venue.name, partner.name];
  for (const type of [...types, ...new Set(joint.map((r) => r.type))]) {
    const shared = joint
      .filter((r) => r.type === type && r.rank <= BALANCE_TOP && usable(r, names))
      .filter((r) => {
        const split = splitOf(r, venue.id, partner.id);
        return split !== null && nearEven(split);
      })
      .slice(0, 3)
      .map((r) => r.name);
    if (shared.length >= 2) return { type, names: shared };
  }
  return undefined;
}

function sides(ctx: PairCtx): { venue: Side; partner: Side } {
  return {
    venue: { at: "venue", place: ctx.venue.entity, group: venueGroup(ctx.venue) },
    partner: { at: "partner", place: ctx.match.partner, group: groupOf(ctx.match.partner) },
  };
}

type NightSet = PickSet & { rounds?: QuizSet["rounds"] };

// Every idea for the format: the first is the plan, the rest the other ideas, each on picks the others did not use.
function setsFor(def: PairFormatDef, ctx: PairCtx): NightSet[] {
  const v = { id: ctx.venue.entity.id, name: ctx.venue.entity.name };
  const p = { id: ctx.match.partner.id, name: ctx.match.partner.name };
  const n = PAIR_ALTERNATIVES + 1;
  if (!def.types.length) return [{ chosen: [], notes: [], link: null }];
  if (def.format === "book_then_film") return bookFilmSets(ctx.joint, ctx.read.rising, v, p, n);
  const out: NightSet[] = [];
  const art = def.format === "late_view" && def.types.length === 1 ? def.types[0]! : null;
  for (let i = 0; i < n; i++) {
    const set =
      def.format === "quiz_crawl"
        ? quizSet(i, ctx.joint, ctx.read.rising, v, p)
        : art
          ? artPickSet(art, i, ctx.joint, ctx.read.rising, v, p)
          : pickSet(def.types, i, ctx.joint, ctx.read.rising, v, p);
    if (!set) break;
    out.push(set);
  }
  return out;
}

function stopPicks(set: NightSet): StopPicks {
  const of = (t: Rising["type"]) => set.chosen.find((c) => c.pick.type === t)?.pick;
  const out: StopPicks = {};
  const book = of("book");
  const film = of("movie");
  const artist = of("artist");
  if (book) out.book = book;
  if (film) out.film = film;
  if (artist) out.artist = artist;
  if (set.rounds) out.rounds = set.rounds;
  return out;
}

function partnerPlace(ctx: PairCtx, weekday: NightSlot["slot"]["weekday"], start: string): LovedPlace {
  const p = ctx.match.partner;
  const prov = p.because[0]?.provenance ?? -1;
  return { ...p, because: [...p.because, ...partnerBecause(p, { weekday, start }, prov)] };
}

function reasonsFor(set: NightSet, ctx: PairCtx): { picks: Rising[]; because: Because[] } {
  const picks = set.chosen.map((c) => ({ ...c.pick, because: pickBecause(c, ctx.venue, ctx.match) }));
  if (!set.rounds) return { picks, because: picks.flatMap((p) => p.because) };
  const because = [
    ...roundBecause("one", set.rounds[0], set.chosen, ctx.venue),
    ...roundBecause("two", set.rounds[1], set.chosen, ctx.venue),
  ];
  return { picks, because };
}

// "Book club then coffee" turns round when the cafe has to go first.
function orderLabel(def: PairFormatDef, swapped: boolean): string {
  const m = / then /.exec(def.label);
  if (!swapped || !def.opens || !m) return def.label;
  const [a, b] = def.label.split(" then ");
  return `${b} then ${a}`;
}

// A screening gets the film's own running time and a quarter of an hour to settle in, in quarter hours.
function sized(def: PairFormatDef, set: NightSet): PairFormatDef {
  const minutes = set.chosen.find((c) => c.pick.type === "movie")?.pick.minutes;
  if (!minutes) return def;
  const need = Math.ceil((minutes + 15) / 15) * 15;
  return { ...def, firstMin: def.main === "screening" ? need : def.firstMin, secondMin: def.other === "screening" ? need : def.secondMin };
}

function oneNight(format: PairFormatDef, set: NightSet, ctx: PairCtx, base: NightSlot): NightPlan {
  const { venue, match, read } = ctx;
  const def = sized(format, set);
  const both = sides(ctx);
  const sch = schedule({ def, venue: both.venue, partner: both.partner, slot: base.slot, distanceM: match.partner.distanceM }, venue.tz, ctx.now);
  const f = sch.fitting;
  const stops = stopsOf(def, f.arranged, stopPicks(set), match.partner.distanceM, new Set(f.afterHours ? ["venue"] : []));
  const rooms = playlistStops(stops, [both.venue, both.partner]);
  // A venue that plays no recorded music never gets the playlist, whatever kind of room it is.
  const at = def.music ? rooms.filter((side) => side !== "venue" || venue.house?.music !== false) : [];
  const playlist = at.length ? playlistFrom(ctx.joint) : [];
  const { picks, because } = reasonsFor(set, ctx);
  const film = set.chosen.find((c) => c.pick.type === "movie")?.pick ?? null;
  const notes = dayNotes(sch, stops, both.venue, film);
  const day: NightDay = { asked: sch.asked, moved: sch.moved, ...(notes.length ? { note: notes.join(" ") } : {}) };
  const pair: PairNight = { format: def.format, label: orderLabel(def, f.arranged.swapped), stops, picks, why: formatWhy(def.format, stops, set.link) };
  if (set.link) pair.link = set.link;
  if (at.length && playlist.length) pair.playlistAt = at;
  const feature = picks[0] ?? null;
  // A cinema has its own licence; the note is for the owner only when the film plays in the owner's own room.
  const screens = stops.some((s) => s.at === "venue" && s.what.startsWith("Screening") && groupOf(venue.entity) !== "film");
  const licences = [...(screens ? [FORMATS.film.licence ?? ""] : []), ...(playlist.length ? [PLAYLIST_LICENCE] : [])].filter(Boolean);
  const partnerStart = stops.find((s) => s.at === "partner")?.start ?? base.slot.start;
  const shared = sharedPicks(ctx.joint, { id: venue.entity.id, name: venue.entity.name }, { id: match.partner.id, name: match.partner.name }, def.types);
  const plan: NightPlan = {
    id: ctx.newId(),
    venueId: venue.id,
    createdAt: ctx.now.toISOString(),
    origin: ctx.origin,
    date: f.day.date,
    start: stops[0]!.start,
    end: stops[1]!.end,
    format: def.legacy,
    feature,
    themeTags: feature ? themeFor({ feature, menuTag: null, format: def.legacy }, read) : [],
    partners: [partnerPlace(ctx, f.day.weekday, partnerStart)],
    menuIdeas: menuFor(null, read, venue),
    playlist,
    why: nightReasons(pair, because, playlist, ctx, shared),
    copy: EMPTY_COPY,
    checks: { claimsVerified: true, unverified: [] },
    limits: [
      ...set.notes,
      ...licences,
      ...(base.cap !== undefined ? [`Sized for up to ${base.cap} people.`] : []),
      `Based on the street read from ${fmtDay(read.at)}.`,
      RANK_LIMIT,
      ...notes,
    ],
    readAt: read.at,
    status: "proposed",
    match: {
      partner: match.partner,
      shared: match.shared,
      split: set.chosen.find((c) => c.split)?.split ?? null,
      host: "both",
      ...(shared ? { sharedPicks: shared } : {}),
    },
    day,
    pair,
  };
  if (base.cap !== undefined) plan.maxPeople = base.cap;
  return withTemplateCopy(plan, venue, read);
}

// One format, from the two kinds of place. The other ideas are the same format on the next picks.
export function planPair(read: StreetRead, joint: Rising[], venue: Venue, match: Match, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse {
  const ctx: PairCtx = { read, venue, match, joint, input, now, origin, newId };
  const base = nightSlot(venue, input, now);
  let def = formatFor(venue, match.partner, base);
  let sets = setsFor(def, ctx);
  // With no pick at all for the format's types, the two places still get their night, with nothing claimed.
  if (!sets.length) {
    def = plainTwoStop(groupOf(venue.entity), groupOf(match.partner));
    sets = setsFor(def, ctx);
  }
  const nights = sets.map((s) => oneNight(def, s, ctx, base));
  // Two ideas that read the same are one idea.
  const seen = new Set<string>();
  const [plan, ...alternatives] = nights.filter((n) => {
    const key = `${n.copy.eventTitle}|${n.pair?.stops.map((x) => x.what).join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as [NightPlan, ...NightPlan[]];
  if (!alternatives.length && def.types.length) {
    plan.limits.unshift(`Nothing else splits the crowds of ${shortName(venue.entity.name)} and ${shortName(match.partner.name)} evenly enough, so there is no second idea this time.`);
  }
  return { plan, alternatives };
}

export function pairLabel(plan: Pick<NightPlan, "pair">): string | null {
  return plan.pair ? capFirst(plan.pair.label) : null;
}
