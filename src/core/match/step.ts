import type { Gap, LovedPlace, Match, StreetTag } from "../../shared/contract.ts";
import { plainName, possessive } from "../../shared/words.ts";
import { parseCompare, type CompareRead } from "../qloo/compare.ts";
import type { Runner } from "../street/runner.ts";
import { fetchFingerprint, tagModeParams, type Fingerprint } from "../street/steps/fingerprint.ts";
import { partnerGaps } from "../street/steps/gaps.ts";
import type { ReadContext } from "../street/steps/resolve.ts";
import { VENUE_TAG_TYPES } from "../street/steps/venue_tags.ts";
import { sharedTags } from "./shared.ts";

export interface MatchStep {
  // Provenance holds call refs until the read settles them into rows.
  match: Match | null;
  gaps: Gap[];
  limits: string[];
}

async function compare(run: Runner, ctx: ReadContext, partner: LovedPlace): Promise<{ read: CompareRead; ref: number } | null> {
  const params = { "a.signal.interests.entities": ctx.entityId, "b.signal.interests.entities": partner.id, take: "20" };
  const got = await run.call("compare", "/v2/analysis/compare", params, `${ctx.name} compared with ${plainName(partner.name)}`);
  return got ? { read: parseCompare(got.body), ref: got.ref } : null;
}

// The partner's crowd read the same way as the venue's, so the two lists can be laid side by side.
function partnerTags(run: Runner, partner: LovedPlace): Promise<Fingerprint | null> {
  const params = { ...tagModeParams(VENUE_TAG_TYPES, 40), "signal.interests.entities": partner.id };
  return fetchFingerprint(run, "partner_tags", params, `Taste tags for people who like ${plainName(partner.name)}`);
}

export async function matchStep(run: Runner, ctx: ReadContext, candidates: LovedPlace[], venueTags: StreetTag[], lovedRef: number | null, readAt: string): Promise<MatchStep> {
  const [partner, ...runnersUp] = candidates;
  if (!partner) {
    return { match: null, gaps: [], limits: [`No place near ${ctx.name} that hosts people came back from Qloo, so there is no neighbour to match with yet.`] };
  }
  const [cmp, theirs] = await Promise.all([compare(run, ctx, partner), partnerTags(run, partner)]);
  const shared = sharedTags(cmp?.read ?? null, venueTags, theirs?.tags ?? []);
  const refs = [lovedRef, cmp?.ref ?? null, theirs?.ref ?? null].filter((r): r is number => r !== null);
  const limits: string[] = [];
  if (!shared.length && (cmp || theirs)) {
    const p = plainName(partner.name);
    limits.push(`Qloo found no taste ${ctx.name} and ${p} share beyond the basics, so the match rests on Qloo tying ${p} to ${possessive(ctx.name)} crowd.`);
  }
  return {
    match: { partner, runnersUp, shared, readAt, provenance: refs },
    gaps: cmp ? partnerGaps(cmp.read, [partner], ctx, cmp.ref) : [],
    limits,
  };
}
