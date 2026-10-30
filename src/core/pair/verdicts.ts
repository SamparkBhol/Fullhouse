import type { FitCheck, LovedPlace, MatchPartner, ReverseRank, Venue } from "../../shared/contract.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { capFirst, ordinal, shortName } from "../../shared/words.ts";
import { hostKinds } from "../street/hosts.ts";
import { EVENINGS, evenings } from "./fit.ts";
import { article, complement, kindOf } from "./groups.ts";
import { placeWord } from "./place_word.ts";

export type BoardVenue = Pick<Venue, "entity" | "quietSlot">;

export interface Scored {
  place: LovedPlace;
  checks: FitCheck[];
  score: number;
  back?: ReverseRank;
}

function aOrAn(word: string): string {
  return capFirst(article(word));
}

function openWords(venue: BoardVenue, place: LovedPlace): string {
  const e = evenings({ venue, partner: place });
  if (!e.partnerListed && !e.venueListed) return "Neither of you lists opening hours.";
  if (!e.partnerListed) return "Lists no opening hours.";
  if (!e.venueListed) return "Your own hours are not listed.";
  if (e.opened) return `Open with you on ${e.opened} of the next ${EVENINGS} evenings.`;
  if (e.late) return "Open with you only if you open late.";
  return "Never open with you for its part of the night.";
}

// The check that cost a place most, in a few words built from its own numbers.
function said(c: FitCheck, s: Scored, venue: BoardVenue, of: number): string {
  const p = s.place;
  switch (c.key) {
    case "crowd":
      return `Your crowd ranks it ${ordinal(p.rank)} of ${of}.`;
    case "back":
      return s.back?.rank ? `Its crowd ranks you ${ordinal(s.back.rank)} of ${s.back.of}.` : `You are not on its crowd's list of ${s.back?.of ?? 0}.`;
    case "partners": {
      const mine = kindOf(venue.entity);
      const theirs = kindOf(p);
      const loose = complement(mine.group, theirs.group) >= 0.7;
      return `${aOrAn(mine.word)} and ${article(theirs.word)} ${loose ? "are a looser pair" : "are not a natural pair"}.`;
    }
    case "open":
      return openWords(venue, p);
    case "walk": {
      const n = walkMinutes(p.distanceM);
      return `About ${n} minute${n === 1 ? "" : "s"} on foot.`;
    }
    case "taste":
      return c.points === 0 ? c.sentence : `Taste in common, ${c.points} of ${c.max}.`;
  }
}

export function weakest(s: Scored, venue: BoardVenue, of: number): string | null {
  const asked = s.checks.filter((c) => c.key !== "back" || s.back?.checked);
  const lost = (c: FitCheck) => c.max - c.points;
  const worst = [...asked].sort((a, b) => lost(b) - lost(a) || lost(b) / b.max - lost(a) / a.max)[0];
  return worst && worst.points < worst.max ? said(worst, s, venue, of) : null;
}

export function scoredWhy(s: Scored, venue: BoardVenue, of: number): string {
  const why = weakest(s, venue, of);
  return `${s.score} of 100.${why ? ` ${why}` : ""}`;
}

export function unaskedWhy(s: Scored, venue: BoardVenue, of: number): string {
  const why = weakest(s, venue, of);
  return `${s.score} of 100, too low to ask its crowd.${why ? ` ${why}` : ""}`;
}

export function belowWhy(last: MatchPartner): string {
  return `Scored below ${shortName(last.name)} at ${last.fit?.score ?? 0}.`;
}

const pts = (p: MatchPartner): number => p.fit?.score ?? 0;
const opens = (p: MatchPartner): boolean => (p.fit?.checks.find((c) => c.key === "open")?.points ?? 1) > 0;
const minutes = (p: MatchPartner): number => walkMinutes(p.distanceM);

// Why the partner won, from the rule that decided it: the highest score; level or a few points behind the highest and
// the shorter walk; level and higher on the venue's list; or the best of the places that can open for the night.
export function partnerWhy(partner: MatchPartner, scored: MatchPartner[], count = scored.length): string {
  const score = pts(partner);
  const others = scored.filter((p) => p.id !== partner.id);
  const peers = others.filter((p) => opens(p) === opens(partner));
  const best = [...peers].sort((a, b) => pts(b) - pts(a) || a.rank - b.rank)[0];
  if (!best || pts(best) < score) {
    if (others.some((p) => pts(p) > score)) return `${score} of 100, the best of the places open for the night.`;
    return count > 1 ? `${score} of 100, the best of the ${count} places scored.` : `${score} of 100, the only place scored.`;
  }
  const rival = shortName(best.name);
  const walk = `${minutes(partner)} minute${minutes(partner) === 1 ? "" : "s"} on foot instead of ${minutes(best)}`;
  if (pts(best) === score && partner.rank < best.rank) return `${score} of 100, level with ${rival} and higher on your crowd's list, ${ordinal(partner.rank)} to ${ordinal(best.rank)}.`;
  if (partner.distanceM >= best.distanceM) return pts(best) === score ? `${score} of 100, level with ${rival}.` : `${score} of 100.`;
  if (pts(best) === score) return `${score} of 100, level with ${rival}, and ${walk}.`;
  const gap = pts(best) - score;
  return `${score} of 100, ${gap} point${gap === 1 ? "" : "s"} behind ${rival}, and ${walk}.`;
}

export function pickedWhy(partner: MatchPartner, over: MatchPartner): string {
  return `${partner.fit?.score ?? 0} of 100. Your pick over ${shortName(over.name)} at ${over.fit?.score ?? 0}.`;
}

export function rivalWhy(place: LovedPlace, venue: BoardVenue): string {
  const theirs = kindOf(place);
  const mine = kindOf(venue.entity);
  if (theirs.group !== null && theirs.group === mine.group) return `Another ${theirs.word}, after the same customers.`;
  if (mine.part && hostKinds(place).includes(mine.part)) return `Runs ${article(mine.word)} too, after the same customers.`;
  return `You run ${article(theirs.word)} too, so you are after the same customers.`;
}

export function roomWhy(place: LovedPlace): string {
  return `${aOrAn(placeWord(place))}, not a room for a night.`;
}

export const NO_OWNER = "No website, so no owner to ask.";
export const CLOSED = "Listed as closed.";
export const YOURS = "Your own venue.";
