import type { Fit, Gap, LovedPlace, Match, MatchPartner, Venue } from "../../shared/contract.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { plainName, possessive } from "../../shared/words.ts";
import { parseCompare, type CompareRead } from "../qloo/compare.ts";
import type { Runner } from "../street/runner.ts";
import { partnerGaps } from "../street/steps/gaps.ts";
import type { ReadContext } from "../street/steps/resolve.ts";
import { BACK_CHECKS, pairCandidates } from "./candidates.ts";
import { fitOf } from "./fit.ts";
import { kindOf } from "./groups.ts";
import { lovesBack, notChecked, type Back } from "./reverse.ts";
import { sharedTaste, shownTags } from "./taste.ts";

export const RUNNERS_UP = 2;

export interface PairStep {
  // Provenance and check rows hold call refs until the read settles them.
  match: Match | null;
  gaps: Gap[];
  limits: string[];
}

export interface Scoring {
  venue: Pick<Venue, "entity" | "quietSlot">;
  places: LovedPlace[];
  lovedRef: number | null;
}

// One candidate scored on everything Full House knows without asking Qloo again.
export function scored(s: Scoring, p: LovedPlace, back: Back, compare: CompareRead | null = null, compareRef: number | null = null): MatchPartner {
  const taste = sharedTaste(s.venue.entity, p, s.places, compare);
  const fit: Fit = fitOf({
    venue: s.venue,
    partner: p,
    forward: { rank: p.rank, of: s.places.length, ref: s.lovedRef },
    back,
    taste,
    tasteRef: compareRef ?? s.lovedRef,
  });
  const kind = kindOf(p);
  const out: MatchPartner = { ...p, fit, reverseRank: back.rank, kind: kind.word, walkMin: walkMinutes(p.distanceM), shared: shownTags(taste) };
  if (kind.group) out.group = kind.group;
  return out;
}

// A place that is shut for its part of the night every evening cannot be the match while one that can open is left.
function canOpen(p: MatchPartner): boolean {
  const open = p.fit?.checks.find((c) => c.key === "open");
  return !open || open.points > 0;
}

// Highest score first; a tie goes to the place the venue's crowd ranks higher.
export function byFit(a: MatchPartner, b: MatchPartner): number {
  return Number(canOpen(b)) - Number(canOpen(a)) || (b.fit?.score ?? 0) - (a.fit?.score ?? 0) || a.rank - b.rank;
}

// Within this many points the top two are as good as level, and the shorter walk wins on a cold Tuesday.
export const NEAR_TIE = 5;

export function nearerFirst(ranked: MatchPartner[]): MatchPartner[] {
  const [a, b] = ranked;
  if (!a || !b || canOpen(a) !== canOpen(b)) return ranked;
  const gap = (a.fit?.score ?? 0) - (b.fit?.score ?? 0);
  return gap <= NEAR_TIE && b.distanceM < a.distanceM ? [b, a, ...ranked.slice(2)] : ranked;
}

export async function compareWith(run: Runner, ctx: ReadContext, partner: LovedPlace): Promise<{ read: CompareRead; ref: number } | null> {
  const params = { "a.signal.interests.entities": ctx.entityId, "b.signal.interests.entities": partner.id, take: "20" };
  const got = await run.call("compare", "/v2/analysis/compare", params, `${ctx.name} compared with ${plainName(partner.name)}`);
  return got ? { read: parseCompare(got.body), ref: got.ref } : null;
}

// Compare's tags join the shared taste only when they add to it, so asking Qloo once more never costs the match its place.
export function richer(before: MatchPartner, after: MatchPartner): MatchPartner {
  return (after.fit?.score ?? 0) >= (before.fit?.score ?? 0) ? after : before;
}

export function matchOf(s: Scoring, partner: MatchPartner, runnersUp: MatchPartner[], readAt: string, provenance: number[]): Match {
  const venueKind = kindOf(s.venue.entity);
  const m: Match = { partner, runnersUp, shared: partner.shared ?? [], readAt, provenance, venueKind: venueKind.word };
  if (partner.fit) m.fit = partner.fit;
  if (partner.reverseRank) m.reverseRank = partner.reverseRank;
  if (venueKind.group) m.venueGroup = venueKind.group;
  return m;
}

function noPartner(ctx: ReadContext): PairStep {
  return { match: null, gaps: [], limits: [`No place near ${ctx.name} that hosts people came back from Qloo, so there is no neighbour to match with yet.`] };
}

// Up to eight candidates, each asked whether its crowd loves the venue back.
// The match is the highest fit, compared with the venue once so the shared tags and the gap use its own answer.
export async function pairStep(run: Runner, ctx: ReadContext, venue: Venue, places: LovedPlace[], lovedRef: number | null, readAt: string): Promise<PairStep> {
  const candidates = pairCandidates(places, venue);
  if (!candidates.length) return noPartner(ctx);
  const backs = await Promise.all(candidates.slice(0, BACK_CHECKS).map((c) => lovesBack(run, ctx, c)));
  const s: Scoring = { venue, places, lovedRef };
  const ranked = nearerFirst(candidates.map((c, i) => scored(s, c, backs[i] ?? notChecked(c.id))).sort(byFit));
  const top = ranked[0]!;
  const cmp = await compareWith(run, ctx, top);
  const back = backs.find((b) => b.partnerId === top.id) ?? notChecked(top.id);
  const partner = cmp ? richer(top, scored(s, top, back, cmp.read, cmp.ref)) : top;
  const refs = [lovedRef, cmp?.ref ?? null, ...backs.map((b) => b.ref)].filter((r): r is number => r !== null);
  const limits: string[] = [];
  if (!(partner.shared ?? []).length) {
    const p = plainName(partner.name);
    limits.push(`${ctx.name} and ${p} share no tags that say what their crowds go for, so the match rests on ${possessive(ctx.name)} crowd loving ${p}.`);
  }
  if (backs.every((b) => !b.rank.checked)) limits.push("Full House could not ask whether the places nearby love you back, so no place earned those points.");
  return {
    match: matchOf(s, partner, ranked.slice(1, 1 + RUNNERS_UP), readAt, refs),
    gaps: cmp ? partnerGaps(cmp.read, [partner], ctx, cmp.ref) : [],
    limits,
  };
}
