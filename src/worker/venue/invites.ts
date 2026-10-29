import type { Invite, LovedPlace, Match, NightPlan, Venue } from "../../shared/contract.ts";
import { FORMATS } from "../../core/index.ts";
import { capFirst } from "../../shared/words.ts";
import { proxiedImage } from "../../shared/images.ts";
import { featureArt } from "../pages/event_art.ts";
import { inviteUrl, type PublicInvite } from "../pages/invite.ts";
import { makeInviteSlug } from "../slug.ts";
import { recordEvent } from "../stats/events.ts";
import { inviteAnsweredEvent, inviteSentEvent } from "../stats/makers.ts";
import { fail, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

const MAX_INVITES = 40;

export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / 80));
}

export function kindOf(plan: Pick<NightPlan, "format" | "feature">): string {
  if (plan.format === "film" && plan.feature?.type === "tv_show") return "Watch night";
  return capFirst(FORMATS[plan.format]?.label ?? "night");
}

// An invite can be sent from a draft or from a published night, so the plan is looked for in both.
export async function planById(records: VenueRecords, planId: string): Promise<NightPlan | undefined> {
  const night = await records.night(planId);
  if (night) return night.night;
  return (await records.proposals()).find((r) => r.plan.id === planId)?.plan;
}

function same(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

// Only the night's own partner, the match and its runners up can be asked; any other id is refused.
function partnerFor(plan: NightPlan, match: Match | undefined, partnerId: string): LovedPlace | undefined {
  const pool = [plan.match?.partner, match?.partner, ...(match?.runnersUp ?? []), ...plan.partners].filter((p): p is LovedPlace => Boolean(p));
  return pool.find((p) => same(p.id, partnerId));
}

export async function createInvite(records: VenueRecords, deps: VenueDeps, planId: string, partnerId: string, origin: string): Promise<Out<Invite>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const plan = await planById(records, planId);
  if (!plan) return fail(404, "plan_not_found", "That plan is not among your drafts or published nights.");
  const partner = partnerFor(plan, await records.match(), partnerId);
  if (!partner) return fail(404, "partner_not_found", "That place is not this night's partner or one of its runners up.");
  const all = await records.invites();
  const existing = all.find((i) => i.planId === planId && same(i.partner.id, partner.id));
  if (existing) return ok(existing);
  if (all.length >= MAX_INVITES) return fail(429, "invite_limit", `This venue has sent ${MAX_INVITES} invites. Answered ones stay; ask the rest from a fresh night.`);
  const slug = makeInviteSlug(partner.name, venue.id);
  const invite: Invite = {
    id: deps.newId(),
    slug,
    url: inviteUrl(origin, slug),
    planId,
    partner: { id: partner.id, name: partner.name, type: "place", ...(partner.image ? { image: partner.image } : {}) },
    status: "waiting",
    createdAt: deps.now().toISOString(),
  };
  // The invite keeps the plan it asked about, so the page still shows that night after the drafts change.
  await records.store.put(`invite:${invite.id}`, invite);
  await records.store.put(`iplan:${invite.id}`, { ...plan, partners: [partner] });
  await records.store.put(`islug:${slug}`, invite.id);
  recordEvent(deps.stats, inviteSentEvent(venue.id));
  return ok(invite);
}

export async function answerInvite(records: VenueRecords, deps: VenueDeps, slug: string, answer: "yes" | "no"): Promise<Out<Invite>> {
  const invite = await records.inviteBySlug(slug);
  if (!invite) return fail(404, "invite_not_found");
  if (invite.status !== "waiting") return fail(409, "already_answered", `${invite.partner.name} already answered this invite.`);
  const answered: Invite = { ...invite, status: answer === "yes" ? "accepted" : "declined", answeredAt: deps.now().toISOString() };
  await records.store.put(`invite:${invite.id}`, answered);
  const venue = await records.venue();
  if (venue) recordEvent(deps.stats, inviteAnsweredEvent(venue.id, answer));
  return ok(answered);
}

function place(name: string, image: string | undefined, address?: string): PublicInvite["venue"] {
  const img = proxiedImage(image);
  return { name, ...(img ? { image: img } : {}), ...(address ? { address } : {}) };
}

export function inviteView(invite: Invite, plan: NightPlan, venue: Venue): PublicInvite {
  const partner = plan.match?.partner ?? plan.partners.find((p) => same(p.id, invite.partner.id));
  const distanceM = partner?.distanceM ?? 0;
  const hostsHere = plan.match?.host !== "partner";
  const art = featureArt(plan);
  const night: PublicInvite["night"] = { date: plan.date, start: plan.start, end: plan.end, tz: venue.tz, kind: kindOf(plan), at: hostsHere ? venue.entity.name : invite.partner.name };
  if (plan.feature) night.feature = plan.feature.name;
  if (plan.feature?.by) night.by = plan.feature.by;
  if (art) night.art = art;
  const view: PublicInvite = {
    slug: invite.slug,
    status: invite.status,
    venue: place(venue.entity.name, venue.entity.image, venue.entity.address),
    partner: place(invite.partner.name, partner?.image ?? invite.partner.image),
    walkMin: walkMinutes(distanceM),
    verified: venue.verified === true,
    night,
    split: plan.match && same(plan.match.partner.id, invite.partner.id) ? plan.match.split : null,
    shared: plan.match?.shared.map((t) => t.name) ?? [],
  };
  if (invite.answeredAt) view.answeredAt = invite.answeredAt;
  return view;
}

export async function publicInvite(records: VenueRecords, slug: string): Promise<Out<PublicInvite>> {
  const [invite, venue] = await Promise.all([records.inviteBySlug(slug), records.venue()]);
  if (!invite || !venue) return fail(404, "invite_not_found");
  const plan = (await records.store.get<NightPlan>(`iplan:${invite.id}`)) ?? (await planById(records, invite.planId));
  if (!plan) return fail(404, "invite_not_found");
  return ok(inviteView(invite, plan, venue));
}
