import type { Match, MatchPartner, StreetRead, Venue } from "../../shared/contract.ts";
import { provIndex } from "../planner/provenance.ts";
import type { Qloo } from "../qloo/client.ts";
import { plainName } from "../../shared/words.ts";
import { sameId } from "../qloo/values.ts";
import { appendRows } from "../street/append.ts";
import { createRunner } from "../street/runner.ts";
import { resolveVenue } from "../street/steps/resolve.ts";
import { byFit, compareWith, matchOf, richer, scored, type Scoring } from "./engine.ts";
import { notChecked, type Back } from "./reverse.ts";
import { relabel, withBoard } from "./board.ts";

export const MATCH_CAP = 1;

export interface MatchOutcome {
  match: Match;
  read: StreetRead;
  limits: string[];
}

function backOf(p: MatchPartner): Back {
  const ref = p.fit?.checks.find((c) => c.key === "back")?.provenance ?? null;
  return p.reverseRank ? { partnerId: p.id, rank: p.reverseRank, ref } : notChecked(p.id);
}

// The read already scored its top three; a switch to a runner up asks Qloo one compare call, nothing more.
export async function matchFor(q: Qloo, venue: Venue, read: StreetRead, partnerId?: string): Promise<MatchOutcome | null> {
  const m = read.match;
  if (!m) return null;
  const pool = [m.partner, ...m.runnersUp];
  const chosen = partnerId ? pool.find((c) => sameId(c.id, partnerId)) : m.partner;
  if (!chosen) return null;
  if (sameId(m.partner.id, chosen.id)) return { match: m, read, limits: [] };
  const ctx = resolveVenue(venue, q.now?.() ?? new Date());
  const run = createRunner(q, MATCH_CAP, 1);
  const cmp = await compareWith(run, ctx, chosen);
  const { rows, rowOf } = run.provenance();
  const appended = appendRows(read, rows);
  const lovedRow = provIndex(read, ["loved_places"]);
  const s: Scoring = { venue, places: read.lovedPlaces, lovedRef: lovedRow >= 0 ? lovedRow : null };
  const cmpRow = cmp ? (appended.at[rowOf(cmp.ref)] ?? null) : null;
  const before = scored(s, chosen, backOf(chosen));
  const partner = cmp && cmpRow !== null ? richer(before, scored(s, chosen, backOf(chosen), cmp.read, cmpRow)) : before;
  const runnersUp = pool.filter((p) => !sameId(p.id, chosen.id)).sort(byFit);
  const provenance = [lovedRow, cmpRow ?? -1, ...m.provenance].filter((i, n, all) => i >= 0 && all.indexOf(i) === n);
  const limits = cmp ? [] : [`The comparison with ${plainName(chosen.name)} did not come back, so what both share comes from the two places' own tags.`];
  const match = matchOf(s, partner, runnersUp, read.at, provenance);
  const boarded = m.considered
    ? { ...match, considered: relabel(m.considered, venue, read.lovedPlaces.length, partner, runnersUp, m.partner), ...(m.consideredOf ? { consideredOf: m.consideredOf } : {}) }
    : withBoard(match, venue, read.lovedPlaces, m.partner);
  return { match: boarded, read: appended.read, limits };
}
