import type { ApproveInput, Night, Venue } from "../../shared/contract.ts";
import { runActions } from "../actions/run.ts";
import { ownerToken, ownerUrl } from "../tokens.ts";
import { fail, failure, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { eventbriteToken } from "./eventbrite.ts";
import type { NightRecord, VenueRecords } from "./records.ts";

export async function ownerLink(deps: VenueDeps, venue: Venue, origin: string): Promise<string> {
  return ownerUrl(origin, venue.id, await ownerToken(deps.secret, venue.id));
}

// Approving twice returns the night already published instead of running its actions again.
export async function approveNight(records: VenueRecords, deps: VenueDeps, planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const existing = await records.night(planId);
  if (existing) return ok(existing.night);
  const proposals = await records.proposals();
  const record = proposals.find((r) => r.plan.id === planId);
  if (!record) return fail(404, "plan_not_found", "That plan is not among the current proposals.");
  try {
    const run = await runActions({
      night: record.plan,
      venue,
      input: record.input,
      actions: input.actions,
      partnerEmails: input.partnerEmails ?? {},
      origin,
      now: deps.now(),
      fetch: deps.fetch,
      eventbrite: input.actions.includes("eventbrite") ? await eventbriteToken(records, deps, venue) : null,
      resend: deps.resend,
      ownerLink: await ownerLink(deps, venue, origin),
      ...(deps.slugRand ? { slugRand: deps.slugRand } : {}),
    });
    const night: Night = { ...record.plan, status: "approved", actions: run.results, rsvps: 0 };
    if (run.slug) night.eventSlug = run.slug;
    await records.store.put(`night:${night.id}`, { night, input: record.input, published: run.published } satisfies NightRecord);
    if (run.slug) await records.store.put(`slug:${run.slug}`, night.id);
    await records.store.put(
      "proposals",
      proposals.map((r) => (r.plan.id === planId ? { ...r, plan: { ...r.plan, status: "approved" as const } } : r)),
    );
    return ok(night);
  } catch (err) {
    return failure(err, "publish the night");
  }
}

export async function logTurnout(records: VenueRecords, nightId: string, headcount: number, note?: string): Promise<Out<Night>> {
  const rec = await records.night(nightId);
  if (!rec) return fail(404, "night_not_found", "No approved night with that id.");
  rec.night.headcount = headcount;
  if (note) rec.night.resultNote = note;
  else delete rec.night.resultNote;
  rec.night.status = "done";
  await records.store.put(`night:${nightId}`, rec);
  return ok(rec.night);
}
