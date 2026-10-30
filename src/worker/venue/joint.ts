import type { ExamplePlace, JointExample, Match, MatchPartner, NightPlan, PlanInput, PlanResponse, StreetRead, Venue } from "../../shared/contract.ts";
import { plainName } from "../../shared/words.ts";
import { QLOO_KEY_MISSING, isQlooError } from "../qloo/errors.ts";
import { fail, failure, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { kindOf, walkMinutes } from "./invites.ts";
import { publicStops } from "../pages/stops.ts";
import { boardRows } from "../../shared/board.ts";
import { qlooFor, recentFeatures } from "./planning.ts";
import type { VenueRecords } from "./records.ts";

const keyMissing = <T>(): Out<T> => fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);

// Without a partner id this is the match the owner last chose for this read, or the read's own top candidate.
export async function matchNow(records: VenueRecords, deps: VenueDeps, partnerId?: string): Promise<Out<Match>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const read = await records.read();
  if (!read) return fail(409, "no_read", "Run the street read first.");
  const current = await records.match();
  if (!partnerId) return current ? ok(current) : fail(404, "no_match", "No place near your venue that hosts people came back from Qloo, so there is no match yet.");
  if (current && current.partner.id.toUpperCase() === partnerId.toUpperCase()) return ok(current);
  const q = qlooFor(deps, venue);
  if (!q) return keyMissing();
  try {
    const out = await deps.core.matchFor(q, venue, read, partnerId);
    if (!out) return fail(404, "partner_not_found", "That place is not one of the runners up for this read.");
    if (out.read !== read) await records.store.put("read", out.read);
    await records.store.put("match", out.match);
    return ok(out.match);
  } catch (err) {
    return failure(err, "match your venue");
  }
}

function solo(deps: VenueDeps, read: StreetRead, venue: Venue, input: PlanInput, origin: NightPlan["origin"]): PlanResponse {
  return deps.core.planNights(read, venue, input, deps.now(), origin, deps.newId);
}

// With a match the night is planned for both crowds; the joint read is kept per read and partner, so a new day costs no calls.
export async function planWithMatch(
  records: VenueRecords,
  deps: VenueDeps,
  read: StreetRead,
  venue: Venue,
  input: PlanInput,
  origin: NightPlan["origin"],
): Promise<{ response: PlanResponse; read: StreetRead }> {
  const match = await records.match();
  if (!match) return { response: solo(deps, read, venue, input, origin), read };
  let joint = await records.joint(read.at, match.partner.id);
  let current = read;
  if (!joint) {
    const q = qlooFor(deps, venue);
    try {
      if (!q) throw new Error("no Qloo key");
      const j = await deps.core.readJoint(q, venue, read, match.partner, await recentFeatures(records, deps.now()));
      current = j.read;
      joint = { readAt: read.at, partnerId: match.partner.id, rising: j.rising, limits: j.limits };
      await records.store.put("read", current);
      await records.store.put("joint", joint);
    } catch (err) {
      if (isQlooError(err) && err.kind === "auth") throw err;
      const response = solo(deps, read, venue, input, origin);
      response.plan.limits.unshift(`The joint read with ${plainName(match.partner.name)} did not come back from Qloo, so this is ${plainName(venue.entity.name)}'s own night.`);
      return { response, read };
    }
  }
  const response = deps.core.planJoint(current, joint.rising, venue, match, input, deps.now(), origin, deps.newId);
  response.plan.limits.push(...joint.limits);
  return { response, read: current };
}

// The landing shows the top of the board: enough rows to see the list being judged.
const EXAMPLE_ROWS = 6;

function exampleRank(p: NightPlan, accepted: boolean, published: boolean): number {
  return (p.match?.split ? 0 : 4) + (accepted ? 0 : published ? 1 : 2);
}

function examplePlace(name: string, image?: string, kind?: string, address?: string, neighborhood?: string): ExamplePlace {
  return { name, ...(image ? { image } : {}), ...(kind ? { kind } : {}), ...(address ? { address } : {}), ...(neighborhood ? { neighborhood } : {}) };
}

// The landing's example: the venue's best joint night, accepted ones first. Nothing about the owner goes in it.
export async function jointExample(records: VenueRecords): Promise<Out<JointExample>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const nights = (await records.nights()).map((r) => r.night).filter((n) => n.match && !n.withdrawnAt);
  const accepted = new Set((await records.invites()).filter((i) => i.status === "accepted").map((i) => i.planId));
  const drafts = (await records.proposals()).map((r) => r.plan).filter((p) => p.match && p.status === "proposed");
  const ranked = [
    ...nights.map((p) => ({ p, r: exampleRank(p, accepted.has(p.id), true) })),
    ...drafts.map((p) => ({ p, r: exampleRank(p, false, false) })),
  ].sort((a, b) => a.r - b.r || b.p.createdAt.localeCompare(a.p.createdAt));
  const best = ranked[0]?.p;
  const m = best?.match;
  if (!best || !m) return fail(404, "no_example");
  const ex: JointExample = {
    venue: examplePlace(venue.entity.name, venue.entity.image, venue.entity.kind, venue.entity.address, venue.entity.neighborhood),
    partner: examplePlace(m.partner.name, m.partner.image, (m.partner as MatchPartner).kind, m.partner.address),
    distanceM: m.partner.distanceM,
    minutes: walkMinutes(m.partner.distanceM),
    title: best.copy.eventTitle,
    format: best.format,
    split: m.split,
    shared: m.shared.slice(0, 3).map((t) => t.name),
  };
  if (best.feature) ex.feature = best.feature.name;
  ex.readAt = best.readAt;
  ex.kind = kindOf(best);
  const fit = (m.partner as MatchPartner).fit;
  if (fit) {
    ex.fit = fit.score;
    ex.checks = fit.checks.map(({ key, label, pass, points, max, sentence }) => ({ key, label, pass, points, max, sentence }));
  }
  ex.city = venue.city;
  ex.date = best.date;
  ex.agreed = accepted.has(best.id);
  // The stops name the partner, so they go on the landing only once the partner said yes.
  const stops = accepted.has(best.id) ? publicStops(best.pair?.stops) : undefined;
  if (stops) ex.stops = stops;
  const board = await records.match();
  if (board?.considered && board.partner.id.toUpperCase() === m.partner.id.toUpperCase()) {
    ex.considered = boardRows(board.considered, EXAMPLE_ROWS, ["partner"]).shown;
    ex.consideredOf = board.consideredOf ?? board.considered.length;
    ex.partnerRank = board.partner.rank;
    const back = board.partner.reverseRank;
    if (back) ex.back = { checked: back.checked, rank: back.rank, of: back.of };
  }
  return ok(ex);
}
