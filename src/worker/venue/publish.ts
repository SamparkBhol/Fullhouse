import type { ApproveInput, Night } from "../../shared/contract.ts";
import { applyCopyEdits } from "../../core/index.ts";
import { plainName } from "../../shared/words.ts";
import { runActions, type Published } from "../actions/run.ts";
import { recordEvent } from "../stats/events.ts";
import { forgetVenue, publishEvent, turnoutEvent, type Counted } from "../stats/makers.ts";
import { utcDay } from "../zones.ts";
import { fail, failure, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { eventbriteToken } from "./eventbrite.ts";
import { ownerLink } from "./owner.ts";
import type { NightRecord, VenueRecords } from "./records.ts";

export const REPORTS_TO_HIDE = 3;
const HIDDEN: Published = { page: false, poster: false, ics: false };

// Approving twice returns the night already published instead of running its actions again.
export async function approveNight(records: VenueRecords, deps: VenueDeps, planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const existing = await records.night(planId);
  if (existing) return ok({ ...existing.night, invites: await records.invitesFor(planId) });
  const proposals = await records.proposals();
  const record = proposals.find((r) => r.plan.id === planId);
  if (!record) return fail(404, "plan_not_found", "That plan is not among the current proposals.");
  const accepted = await records.accepted(planId);
  const partner = record.plan.match?.partner;
  // A night at the partner's place cannot go up before the partner has agreed to host it.
  if (record.plan.match?.host === "partner" && !accepted && partner) {
    const p = plainName(partner.name);
    return fail(409, "waiting_for_partner", `${p} hosts this night, so it goes up once ${p} says yes on its invite.`);
  }
  const edited = input.copy ? applyCopyEdits(record.plan.copy, input.copy) : { copy: record.plan.copy };
  if ("problem" in edited) return fail(400, "copy_not_accepted", edited.problem);
  const plan = { ...record.plan, copy: edited.copy };
  const wantsMail = input.actions.includes("owner_email") && Boolean(deps.resend && venue.ownerEmail);
  try {
    const run = await runActions({
      night: plan,
      venue,
      input: record.input,
      actions: input.actions,
      partnerEmails: input.partnerEmails ?? {},
      origin,
      now: deps.now(),
      fetch: deps.fetch,
      eventbrite: input.actions.includes("eventbrite") ? await eventbriteToken(records, deps, venue) : null,
      resend: deps.resend,
      mailCapped: wantsMail && !(await records.takeMailSlot(utcDay(deps.now()))),
      ownerLink: await ownerLink(records, deps, venue, origin),
      ...(deps.slugRand ? { slugRand: deps.slugRand } : {}),
    });
    const results = partner && !accepted ? run.results.map((r) => (r.kind === "event_page" && r.ok ? { ...r, detail: `${r.detail} ${plainName(partner.name)} is not named on it until they say yes.` } : r)) : run.results;
    const night: Night = { ...plan, status: "approved", actions: results, rsvps: 0 };
    if (run.slug) night.eventSlug = run.slug;
    await records.store.put(`night:${night.id}`, { night, input: record.input, published: run.published, chosen: run.published } satisfies NightRecord);
    if (run.slug) await records.store.put(`slug:${run.slug}`, night.id);
    recordEvent(deps.stats, publishEvent(venue, night));
    await records.store.put(
      "proposals",
      proposals.map((r) => (r.plan.id === planId ? { ...r, plan: { ...r.plan, status: "approved" as const } } : r)),
    );
    return ok({ ...night, invites: await records.invitesFor(night.id) });
  } catch (err) {
    return failure(err, "publish the night");
  }
}

// What the public totals hold for a night logged before nights kept their own count: its head count against
// the room it had then, with no time, so a correction lands in the hour it is made.
function countedBefore(rec: NightRecord, capacity: number | undefined): Counted | undefined {
  if (rec.counted) return rec.counted;
  if (rec.night.headcount === undefined) return undefined;
  return { people: rec.night.headcount, room: rec.night.maxPeople ?? capacity ?? null };
}

// A room size given with the turnout sets the cap the Monday rule measures it against.
export async function logTurnout(records: VenueRecords, deps: VenueDeps, nightId: string, headcount: number, note?: string, capacity?: number): Promise<Out<Night>> {
  const [rec, venue] = await Promise.all([records.night(nightId), records.venue()]);
  if (!rec || !venue) return fail(404, "night_not_found", "No approved night with that id.");
  const before = countedBefore(rec, venue.capacity);
  rec.night.headcount = headcount;
  if (capacity !== undefined && rec.night.maxPeople === undefined) rec.night.maxPeople = capacity;
  if (note) rec.night.resultNote = note;
  else delete rec.night.resultNote;
  rec.night.status = "done";
  rec.counted = { people: headcount, room: rec.night.maxPeople ?? venue.capacity ?? null, at: before?.at ?? deps.now().toISOString() };
  await records.store.put(`night:${nightId}`, rec);
  recordEvent(deps.stats, turnoutEvent(venue.id, before, rec.counted));
  return ok(rec.night);
}

// Takes the page, poster and calendar file offline; the night stays in the owner's list.
export async function unpublishNight(records: VenueRecords, deps: VenueDeps, nightId: string): Promise<Out<Night>> {
  const rec = await records.night(nightId);
  if (!rec) return fail(404, "night_not_found", "No approved night with that id.");
  rec.published = HIDDEN;
  rec.night.withdrawnAt = deps.now().toISOString();
  await records.store.put(`night:${nightId}`, rec);
  if (rec.night.eventSlug) await records.store.delete(`slug:${rec.night.eventSlug}`);
  const venue = await records.venue();
  if (venue) recordEvent(deps.stats, forgetVenue(venue, "nights"));
  return ok(rec.night);
}

export async function republishNight(records: VenueRecords, nightId: string): Promise<Out<Night>> {
  const rec = await records.night(nightId);
  if (!rec) return fail(404, "night_not_found", "No approved night with that id.");
  if (!rec.night.eventSlug) return fail(409, "nothing_to_republish", "This night was approved without a public page.");
  rec.published = rec.chosen ?? { page: true, poster: true, ics: true };
  rec.reports = 0;
  delete rec.night.withdrawnAt;
  await records.store.put(`night:${nightId}`, rec);
  await records.store.put(`slug:${rec.night.eventSlug}`, nightId);
  return ok(rec.night);
}

// Three reports take the public copy offline until the owner puts it back up.
export async function reportNight(records: VenueRecords, deps: VenueDeps, slug: string): Promise<Out<{ hidden: boolean }>> {
  const found = await records.nightBySlug(slug);
  if (!found || !found.rec.published.page) return fail(404, "night_not_found");
  const rec = found.rec;
  rec.reports = (rec.reports ?? 0) + 1;
  const hidden = rec.reports >= REPORTS_TO_HIDE;
  if (hidden) rec.published = HIDDEN;
  await records.store.put(`night:${rec.night.id}`, rec);
  if (hidden) recordEvent(deps.stats, forgetVenue(found.venue, "nights"));
  return ok({ hidden });
}
