import type { Match, StreetRead, Venue } from "../../shared/contract.ts";
import { provIndex } from "../planner/provenance.ts";
import type { Qloo } from "../qloo/client.ts";
import { QlooError } from "../qloo/errors.ts";
import { sameId } from "../qloo/values.ts";
import { appendRows } from "../street/append.ts";
import { createRunner } from "../street/runner.ts";
import { resolveVenue } from "../street/steps/resolve.ts";
import { matchCandidates } from "./candidates.ts";
import { matchStep } from "./step.ts";

export const MATCH_CAP = 4;

export interface MatchOutcome {
  match: Match;
  read: StreetRead;
  limits: string[];
}

// The read already holds the match with its top candidate; only a switch to a runner up costs calls.
export async function matchFor(q: Qloo, venue: Venue, read: StreetRead, partnerId?: string): Promise<MatchOutcome | null> {
  const candidates = matchCandidates(read.lovedPlaces, venue);
  const chosen = partnerId ? candidates.find((c) => sameId(c.id, partnerId)) : candidates[0];
  if (!chosen) return null;
  if (read.match && sameId(read.match.partner.id, chosen.id)) return { match: read.match, read, limits: [] };
  const ctx = resolveVenue(venue, q.now?.() ?? new Date());
  const run = createRunner(q, MATCH_CAP, 3);
  const step = await matchStep(run, ctx, [chosen, ...candidates.filter((c) => c !== chosen)], read.venueTags, null, read.at);
  if (!step.match) return null;
  if (run.answered() === 0) throw run.firstError() ?? new QlooError("server", 0, "Qloo answered none of the calls for this match");
  const { rows, rowOf } = run.provenance();
  const appended = appendRows(read, rows);
  const lovedRow = provIndex(read, ["loved_places"]);
  const callRows = step.match.provenance.map((ref) => appended.at[rowOf(ref)] ?? -1);
  const provenance = [lovedRow, ...callRows].filter((i) => i >= 0);
  return { match: { ...step.match, provenance }, read: appended.read, limits: step.limits };
}
