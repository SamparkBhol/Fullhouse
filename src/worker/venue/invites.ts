import type { Invite, InviteAnswer, InviteDecline, LovedPlace, Match, MatchPartner, NightPlan, NightStop, PartnerConfirmation, Venue } from "../../shared/contract.ts";
import { FORMATS, confirmPartnerStop } from "../../core/index.ts";
import { NEAR_ME } from "../../shared/cities.ts";
import { listedHours } from "../../shared/hours.ts";
import { capFirst, ordinal, possessive, shortName } from "../../shared/words.ts";
import { proxiedImage } from "../../shared/images.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { featureArt } from "../pages/event_art.ts";
import { inviteUrl, type PublicInvite } from "../pages/invite.ts";
import type { TheirList } from "../pages/their_list.ts";
import { publicStops } from "../pages/stops.ts";
import { COUNT_SHOWN_FROM } from "../pages/event.ts";
import { makeInviteSlug } from "../slug.ts";
import { recordEvent } from "../stats/events.ts";
import { inviteAnsweredEvent, inviteSentEvent } from "../stats/makers.ts";
import { fail, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

const MAX_INVITES = 40;

export { walkMinutes } from "../../shared/walk.ts";

export function kindOf(plan: Pick<NightPlan, "format" | "feature" | "pair">): string {
  if (plan.pair) return capFirst(plan.pair.label);
  return capFirst(FORMATS[plan.format]?.label ?? "night");
}

// The checks read from the partner's side: "your crowd" on the invite is the partner's crowd. The failed hours check
// goes in too, so the partner can answer it with one tick.
export function partnerReasons(m: MatchPartner | undefined, venue: Venue, listShown = false): string[] {
  if (!m) return [];
  const v = shortName(venue.entity.name);
  const p = shortName(m.name);
  const back = !listShown && m.reverseRank?.rank ? `${v} is ${ordinal(m.reverseRank.rank)} of the ${m.reverseRank.of} places your crowd loves nearby.` : null;
  const crowd = `${p} is ${ordinal(m.rank)} on the list of places ${possessive(v)} crowd loves nearby.`;
  const keep = new Set(["partners", "walk", "taste", "open"]);
  const rest = (m.fit?.checks ?? []).filter((c) => keep.has(c.key) && (c.pass || c.key === "open")).map((c) => c.sentence.replace(/so check them before you ask\./, "so say below if you are open that evening."));
  return [back, crowd, ...rest].filter((x): x is string => Boolean(x));
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
  const slug = makeInviteSlug(venue.id);
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

// The stop the invite page puts in the partner's form, as planned before any answer.
export function proposedStop(plan: NightPlan | undefined): NightStop | undefined {
  return plan?.pair?.stops.find((s) => s.at === "partner");
}

function confirmation(a: InviteAnswer, at: string, proposed: NightStop | undefined): PartnerConfirmation {
  const c: PartnerConfirmation = { tellsRegulars: a.tellsRegulars === true, at };
  if (a.start) c.start = a.start;
  if (a.what?.trim()) c.what = a.what.trim();
  if (a.open !== undefined) c.open = a.open;
  if (a.contact?.trim()) c.contact = a.contact.trim();
  if (proposed && c.what !== undefined && c.start !== undefined) c.kept = c.what === proposed.what.trim() && c.start.trim() === proposed.start.trim();
  return c;
}

// The partner's own time and words replace the proposed stop wherever the plan is kept: the drafts, the invite's copy
// of the plan, and a night already published.
async function applyConfirmation(records: VenueRecords, venue: Venue, invite: Invite, c: PartnerConfirmation): Promise<void> {
  const merge = (plan: NightPlan) => confirmPartnerStop(plan, c, venue);
  const proposals = await records.proposals();
  if (proposals.some((r) => r.plan.id === invite.planId)) await records.store.put("proposals", proposals.map((r) => (r.plan.id === invite.planId ? { ...r, plan: merge(r.plan) } : r)));
  const kept = await records.store.get<NightPlan>(`iplan:${invite.id}`);
  if (kept) await records.store.put(`iplan:${invite.id}`, merge(kept));
  const night = await records.night(invite.planId);
  if (night) await records.store.put(`night:${invite.planId}`, { ...night, night: { ...night.night, ...merge(night.night) } });
}

function decline(a: InviteAnswer): InviteDecline | null {
  const d: InviteDecline = {};
  if (a.reason) d.reason = a.reason;
  if (a.note?.trim()) d.note = a.note.trim();
  return d.reason || d.note ? d : null;
}

export async function answerInvite(records: VenueRecords, deps: VenueDeps, slug: string, answer: InviteAnswer): Promise<Out<Invite>> {
  const invite = await records.inviteBySlug(slug);
  if (!invite) return fail(404, "invite_not_found");
  if (invite.status !== "waiting") return fail(409, "already_answered", `${shortName(invite.partner.name)} already answered this invite.`);
  const at = deps.now().toISOString();
  const yes = answer.answer === "yes";
  const asked = (await records.store.get<NightPlan>(`iplan:${invite.id}`)) ?? (await planById(records, invite.planId));
  const no = yes ? null : decline(answer);
  const answered: Invite = {
    ...invite,
    status: yes ? "accepted" : "declined",
    answeredAt: at,
    ...(yes ? { confirmed: confirmation(answer, at, proposedStop(asked)) } : {}),
    ...(no ? { declined: no } : {}),
  };
  await records.store.put(`invite:${invite.id}`, answered);
  const venue = await records.venue();
  if (venue && answered.confirmed) await applyConfirmation(records, venue, answered, answered.confirmed);
  if (venue) recordEvent(deps.stats, inviteAnsweredEvent(venue.id, answer.answer, yes ? undefined : answer.reason));
  return ok(answered);
}

function place(name: string, image: string | undefined, address?: string, kind?: string): PublicInvite["venue"] {
  const img = proxiedImage(image);
  return { name: shortName(name), ...(img ? { image: img } : {}), ...(address ? { address } : {}), ...(kind ? { kind } : {}) };
}

// The partner's own list, when the reverse read kept its top. Reads stored before it did keep none.
function theirList(m: MatchPartner | undefined): TheirList | undefined {
  const r = m?.reverseRank;
  if (!r?.top?.length || !r.rank) return undefined;
  return { top: r.top, rank: r.rank, of: r.of };
}

// The invite may ask a runner up, so the place, its score and its checks are the invited partner's own.
function invitedPartner(invite: Invite, plan: NightPlan): MatchPartner | undefined {
  if (plan.match && same(plan.match.partner.id, invite.partner.id)) return plan.match.partner;
  return plan.partners.find((p) => same(p.id, invite.partner.id));
}

export function inviteView(invite: Invite, plan: NightPlan, venue: Venue): PublicInvite {
  const partner = invitedPartner(invite, plan);
  const distanceM = partner?.distanceM ?? 0;
  const hostsHere = plan.match?.host !== "partner";
  const art = featureArt(plan);
  const list = theirList(partner);
  const at = plan.pair?.stops[0]?.name ?? (hostsHere ? venue.entity.name : invite.partner.name);
  const night: PublicInvite["night"] = { date: plan.date, start: plan.start, end: plan.end, tz: venue.tz, kind: kindOf(plan), at };
  if (plan.feature) night.feature = plan.feature.name;
  if (plan.feature?.by) night.by = plan.feature.by;
  if (art) night.art = art;
  const view: PublicInvite = {
    slug: invite.slug,
    status: invite.status,
    venue: place(venue.entity.name, venue.entity.image, venue.entity.address, venue.entity.kind),
    partner: place(invite.partner.name, partner?.image ?? invite.partner.image, partner?.address, partner?.kind),
    walkMin: walkMinutes(distanceM),
    verified: venue.verified === true,
    night,
    split: plan.match && same(plan.match.partner.id, invite.partner.id) ? plan.match.split : null,
    shared: plan.match?.shared.map((t) => t.name) ?? [],
    reasons: partnerReasons(partner, venue, list !== undefined),
  };
  if (list) view.theirList = list;
  const score = partner?.fit?.score;
  if (typeof score === "number" && Number.isFinite(score)) view.score = Math.round(score);
  const stops = publicStops(plan.pair?.stops);
  if (stops) view.stops = stops;
  if (plan.pair) view.why = plan.pair.why;
  if (invite.answeredAt) view.answeredAt = invite.answeredAt;
  const mine = proposedStop(plan);
  if (mine) view.partnerStop = { start: mine.start, end: mine.end, what: mine.what, hoursUnknown: partner ? listedHours(partner) === null : false };
  const c = invite.confirmed;
  if (c) view.confirmed = { tellsRegulars: c.tellsRegulars, ...(c.start ? { start: c.start } : {}), ...(c.what ? { what: c.what } : {}), ...(c.kept !== undefined ? { kept: c.kept } : {}) };
  if (invite.status === "accepted" && venue.contact) view.venueContact = venue.contact;
  if (invite.status === "declined" && invite.declined?.reason) view.declined = { reason: invite.declined.reason };
  if (invite.status === "accepted") view.spread = { name: view.partner.name, ...(venue.city !== NEAR_ME ? { city: venue.city } : {}) };
  return view;
}

export async function publicInvite(records: VenueRecords, slug: string): Promise<Out<PublicInvite>> {
  const [invite, venue] = await Promise.all([records.inviteBySlug(slug), records.venue()]);
  if (!invite || !venue) return fail(404, "invite_not_found");
  const plan = (await records.store.get<NightPlan>(`iplan:${invite.id}`)) ?? (await planById(records, invite.planId));
  if (!plan) return fail(404, "invite_not_found");
  const view = inviteView(invite, plan, venue);
  if (invite.status === "accepted") {
    // The partner's own link to share with its regulars, so the RSVPs it sends are counted as its own.
    const night = (await records.night(invite.planId))?.night;
    const link = night && !night.withdrawnAt ? night.shareLinks?.partner : undefined;
    if (link) view.yourLink = link;
    const theirs = night?.ledger?.fromPartner ?? 0;
    if (link && theirs >= COUNT_SHOWN_FROM) view.yourCount = theirs;
  }
  return ok(view);
}
