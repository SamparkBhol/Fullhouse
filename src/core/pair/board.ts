import type { Considered, LovedPlace, Match, MatchPartner, Verdict } from "../../shared/contract.ts";
import { BOARD_TOP } from "../../shared/engine.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { sameId } from "../qloo/values.ts";
import { hostsPeople } from "../street/hosts.ts";
import { pairCandidates } from "./candidates.ts";
import { fitOf } from "./fit.ts";
import { rivals } from "./groups.ts";
import { placeWord } from "./place_word.ts";
import { notChecked } from "./reverse.ts";
import { sharedTaste } from "./taste.ts";
import { CLOSED, NO_OWNER, YOURS, belowWhy, partnerWhy, pickedWhy, rivalWhy, roomWhy, scoredWhy, unaskedWhy, type BoardVenue, type Scored } from "./verdicts.ts";

// A place Qloo listed that never reaches the list Full House reads: the venue itself, or a place marked closed.
export interface SetAside {
  place: LovedPlace;
  why: "closed" | "you";
}

export interface BoardInput {
  venue: BoardVenue;
  places: LovedPlace[];
  aside?: SetAside[];
  // Every place scored on all six checks, the partner and runners up among them.
  scored: MatchPartner[];
  partner: MatchPartner;
  runnersUp: MatchPartner[];
  partnerWhy: string;
}

export interface Board {
  considered: Considered[];
  of: number;
}

function row(p: LovedPlace, verdict: Verdict, reason: string, score?: number): Considered {
  const c: Considered = { id: p.id, name: p.name, kind: placeWord(p), rank: p.rank, walkMin: walkMinutes(p.distanceM), verdict, reason };
  if (p.image) c.image = p.image;
  if (score !== undefined) c.score = score;
  return c;
}

function full(p: MatchPartner): Scored {
  const s: Scored = { place: p, checks: p.fit?.checks ?? [], score: p.fit?.score ?? 0 };
  if (p.reverseRank) s.back = p.reverseRank;
  return s;
}

// A place that was never one of the candidates, scored on what Full House knew before asking anyone's crowd.
function unasked(p: LovedPlace, i: BoardInput): Scored {
  const taste = sharedTaste(i.venue.entity, p, i.places);
  const fit = fitOf({ venue: i.venue, partner: p, forward: { rank: p.rank, of: i.places.length, ref: null }, back: notChecked(p.id), taste, tasteRef: null });
  return { place: p, checks: fit.checks, score: fit.score };
}

const key = (id: string): string => id.toUpperCase();

function decide(p: LovedPlace, i: BoardInput, known: Map<string, MatchPartner>, candidates: Set<string>): Considered {
  const of = i.places.length;
  if (sameId(p.id, i.partner.id)) return row(p, "partner", i.partnerWhy, i.partner.fit?.score);
  const s = known.get(key(p.id));
  if (s) return row(p, i.runnersUp.some((r) => sameId(r.id, p.id)) ? "runner_up" : "scored", scoredWhy(full(s), i.venue, of), s.fit?.score);
  if (candidates.has(key(p.id))) return row(p, "scored", belowWhy(i.runnersUp.at(-1) ?? i.partner));
  if (!hostsPeople(p)) return row(p, "not_a_room", roomWhy(p));
  if (rivals(p, i.venue.entity)) return row(p, "rival", rivalWhy(p, i.venue));
  if (!p.url) return row(p, "no_owner", NO_OWNER);
  const u = unasked(p, i);
  return row(p, "scored", unaskedWhy(u, i.venue, of), u.score);
}

// What Full House decided about each place on the list, in Qloo's order: the first places on the list and every place
// it scored, so the list and the judgement on it read side by side.
export function boardOf(i: BoardInput): Board {
  const known = new Map([...i.scored, ...i.runnersUp, i.partner].map((p) => [key(p.id), p] as const));
  const candidates = new Set(pairCandidates(i.places, i.venue).map((p) => key(p.id)));
  const shown = i.places.filter((p) => p.rank <= BOARD_TOP || known.has(key(p.id)) || candidates.has(key(p.id)));
  const aside = (i.aside ?? []).filter((a) => a.place.rank <= BOARD_TOP).map((a) => row(a.place, a.why, a.why === "you" ? YOURS : CLOSED));
  const considered = [...shown.map((p) => decide(p, i, known, candidates)), ...aside].sort((a, b) => a.rank - b.rank);
  return { considered, of: i.places.length + (i.aside?.length ?? 0) };
}

// A switch to a runner up keeps every other verdict and moves the partner and runners up.
export function relabel(prev: Considered[], venue: BoardVenue, of: number, partner: MatchPartner, runnersUp: MatchPartner[], over: MatchPartner): Considered[] {
  return prev.map((c) => {
    if (sameId(c.id, partner.id)) return { ...c, verdict: "partner", reason: pickedWhy(partner, over), ...(partner.fit ? { score: partner.fit.score } : {}) };
    const r = runnersUp.find((p) => sameId(p.id, c.id));
    if (r) return { ...c, verdict: "runner_up", reason: scoredWhy(full(r), venue, of), ...(r.fit ? { score: r.fit.score } : {}) };
    return c.verdict === "partner" || c.verdict === "runner_up" ? { ...c, verdict: "scored", reason: `${c.score ?? 0} of 100.` } : c;
  });
}

// A match stored before the board existed gets one from the read it was made on. Only the partner and runners up were
// kept with their scores, so the other candidates are said to have scored below them, which is all that is known.
// When the owner swapped, best is the read's own choice, and the partner's row says it was the owner's pick.
export function withBoard(match: Match, venue: BoardVenue, places: LovedPlace[], best: MatchPartner = match.partner): Match {
  if (match.considered || !places.length) return match;
  const scored = [match.partner, ...match.runnersUp];
  const why = sameId(best.id, match.partner.id) ? partnerWhy(match.partner, scored, pairCandidates(places, venue).length) : pickedWhy(match.partner, best);
  const board = boardOf({ venue, places, scored, partner: match.partner, runnersUp: match.runnersUp, partnerWhy: why });
  return { ...match, considered: board.considered, consideredOf: board.of };
}
