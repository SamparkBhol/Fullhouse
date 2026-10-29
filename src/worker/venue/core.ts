import type {
  ApproveInput,
  Baseline,
  CreateVenueInput,
  EditableCopy,
  Invite,
  InviteAnswer,
  JointExample,
  Match,
  Night,
  PlanInput,
  PlanResponse,
  RunProgress,
  StreetRead,
  Venue,
  VenueCandidate,
  VenueSettingsInput,
  VenueState,
} from "../../shared/contract.ts";
import type { VenueDashboard } from "../../shared/stats.ts";
import { refineInput } from "../ai.ts";
import type { PublicNight } from "../pages/event.ts";
import type { PublicInvite } from "../pages/invite.ts";
import { QLOO_KEY_MISSING } from "../qloo/errors.ts";
import { venueDashboard } from "../stats/dashboard.ts";
import { recordEvent } from "../stats/events.ts";
import { forgetVenue, planEvent } from "../stats/makers.ts";
import type { Store } from "../store.ts";
import { utcDay } from "../zones.ts";
import { armAlarm } from "./alarm.ts";
import { fail, failure, noVenue, ok, type MondayRun, type Out, type VenueApi, type VenueDeps } from "./api.ts";
import { connectEventbrite, disconnectEventbrite } from "./eventbrite.ts";
import { runMonday } from "./monday.ts";
import { checkOwner, confirmEmail, initVenue, requestEmail, rotateOwnerLink, updateSettings } from "./owner.ts";
import { FRESH_READS_PER_DAY, freshRead, qlooFor, takeReadSlot, withCopy } from "./planning.ts";
import { answerInvite, createInvite, publicInvite } from "./invites.ts";
import { jointExample, matchNow, planWithMatch } from "./joint.ts";
import { precomputeProof, runProof } from "./proof.ts";
import { publicNight, rsvp } from "./public.ts";
import { approveNight, editNight, logTurnout, reportNight, republishNight, unpublishNight } from "./publish.ts";
import { pairLedgers } from "./ledger.ts";
import { VenueRecords } from "./records.ts";

const keyMissing = <T>(): Out<T> => fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
const readLimit = <T>(): Out<T> =>
  fail(429, "read_limit", `This venue already read the street ${FRESH_READS_PER_DAY} times today. The last read is still here, and the Monday run reads it again.`);

export class VenueCore implements VenueApi {
  private readonly records: VenueRecords;

  constructor(
    store: Store,
    private readonly deps: VenueDeps,
  ) {
    this.records = new VenueRecords(store);
  }

  init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<{ venue: Venue; ownerToken: string }>> {
    return initVenue(this.records, this.deps, id, input, candidate, origin);
  }

  ownerCheck(venueId: string, token: string | null): Promise<boolean> {
    return checkOwner(this.records, this.deps, venueId, token);
  }

  newOwnerLink(origin: string): Promise<Out<{ ownerUrl: string; ownerToken: string }>> {
    return rotateOwnerLink(this.records, this.deps, origin);
  }

  requestEmail(email: string, origin: string): Promise<Out<Venue>> {
    return requestEmail(this.records, this.deps, email, origin);
  }

  confirmEmail(code: string): Promise<Out<Venue>> {
    return confirmEmail(this.records, this.deps, code);
  }

  settings(input: VenueSettingsInput): Promise<Out<Venue>> {
    return updateSettings(this.records, input);
  }

  // Opening the venue counts as the owner being around, which keeps the Monday runs going.
  async state(): Promise<Out<VenueState>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    await this.records.store.put("lastSeen", this.deps.now().toISOString());
    const [read, proposals, nights, alarm, baseline] = await Promise.all([
      this.records.read(),
      this.records.proposals(),
      this.records.nights(),
      this.records.store.getAlarm(),
      this.records.store.get<Baseline>("baseline"),
    ]);
    const weekAhead = this.deps.now().getTime() + 8 * 86_400_000;
    const next = !alarm || alarm > weekAhead ? await armAlarm(this.records, this.deps, venue.tz) : alarm;
    const invites = await this.records.invites();
    const state: VenueState = {
      venue,
      proposals: proposals.filter((r) => r.plan.status === "proposed").map((r) => r.plan),
      nights: nights
        .map((r) => ({ ...r.night, invites: invites.filter((i) => i.planId === r.night.id) }))
        .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)),
      nextAlarm: new Date(next).toISOString(),
    };
    if (read) state.read = read;
    if (baseline) state.baseline = baseline;
    const ledgers = pairLedgers(state.nights);
    if (ledgers.length) state.ledgers = ledgers;
    return ok(state);
  }

  async read(): Promise<Out<StreetRead>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    const q = qlooFor(this.deps, venue);
    if (!q) return keyMissing();
    if (!(await takeReadSlot(this.records, utcDay(this.deps.now())))) return readLimit();
    this.deps.progress?.start(this.deps.now());
    try {
      return ok(await freshRead(this.records, this.deps, q, venue));
    } catch (err) {
      return failure(err, "read the street");
    }
  }

  async plan(input: PlanInput): Promise<Out<PlanResponse>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    this.deps.progress?.start(this.deps.now());
    try {
      let read = await this.records.read();
      if (!read) {
        const q = qlooFor(this.deps, venue);
        if (!q) return keyMissing();
        if (!(await takeReadSlot(this.records, utcDay(this.deps.now())))) return readLimit();
        read = await freshRead(this.records, this.deps, q, venue);
      }
      const joint = await planWithMatch(this.records, this.deps, read, venue, input, "owner");
      const response = joint.response;
      const plan = await withCopy(this.deps, response.plan, venue, joint.read);
      recordEvent(this.deps.stats, planEvent(venue, plan));
      const out: PlanResponse = { plan, alternatives: response.alternatives, input };
      await this.records.saveProposals(out, input);
      return ok(out);
    } catch (err) {
      return failure(err, "plan the night");
    }
  }

  async refine(planId: string, request: string): Promise<Out<PlanResponse>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    const record = (await this.records.proposals()).find((r) => r.plan.id === planId);
    if (!record) return fail(404, "plan_not_found", "That plan is not among the current proposals.");
    const read = await this.records.read();
    if (!read) return fail(409, "no_read", "Run the street read first.");
    try {
      const { input, method } = await refineInput(
        { ai: this.deps.ai, model: this.deps.model, generate: this.deps.generate, core: this.deps.core },
        record.input,
        request,
      );
      const joint = await planWithMatch(this.records, this.deps, read, venue, input, "refine");
      const response = joint.response;
      const plan = await withCopy(this.deps, response.plan, venue, joint.read);
      recordEvent(this.deps.stats, planEvent(venue, plan));
      const out: PlanResponse = { plan, alternatives: response.alternatives, input, refine: { method, request } };
      await this.records.saveProposals(out, input, record.plan.createdAt);
      return ok(out);
    } catch (err) {
      return failure(err, "refine the plan");
    }
  }

  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
    return approveNight(this.records, this.deps, planId, input, origin);
  }

  result(nightId: string, headcount: number, note?: string, capacity?: number): Promise<Out<Night>> {
    return logTurnout(this.records, this.deps, nightId, headcount, note, capacity);
  }

  unpublish(nightId: string): Promise<Out<Night>> {
    return unpublishNight(this.records, this.deps, nightId);
  }

  republish(nightId: string): Promise<Out<Night>> {
    return republishNight(this.records, nightId);
  }

  editNight(nightId: string, copy: EditableCopy): Promise<Out<Night>> {
    return editNight(this.records, nightId, copy);
  }

  report(slug: string, reporter: string): Promise<Out<{ hidden: boolean }>> {
    return reportNight(this.records, this.deps, slug, reporter);
  }

  connectEventbrite(token: string): Promise<Out<{ organization: string }>> {
    return connectEventbrite(this.records, this.deps, token);
  }

  disconnectEventbrite(): Promise<Out<{ disconnected: true }>> {
    return disconnectEventbrite(this.records);
  }

  async destroy(): Promise<Out<{ deleted: true }>> {
    const venue = await this.records.venue();
    await this.records.store.deleteAlarm();
    await this.records.store.deleteAll();
    if (venue) recordEvent(this.deps.stats, forgetVenue(venue, "all"));
    return ok({ deleted: true });
  }

  baseline(): Promise<Out<Baseline>> {
    return runProof(this.records, this.deps);
  }

  precomputeProof(): Promise<Out<Baseline | null>> {
    return precomputeProof(this.records, this.deps);
  }

  publicNight(slug: string, browser: string | null, via?: string): Promise<Out<PublicNight>> {
    return publicNight(this.records, slug, browser, via);
  }

  rsvp(slug: string, browser: string, via?: string): Promise<Out<{ count: number; already: boolean }>> {
    return rsvp(this.records, this.deps, slug, browser, via);
  }

  monday(): Promise<Out<MondayRun>> {
    return runMonday(this.records, this.deps);
  }

  match(partnerId?: string): Promise<Out<Match>> {
    return matchNow(this.records, this.deps, partnerId);
  }

  invite(planId: string, partnerId: string, origin: string): Promise<Out<Invite>> {
    return createInvite(this.records, this.deps, planId, partnerId, origin);
  }

  async progress(): Promise<Out<RunProgress>> {
    return ok(this.deps.progress?.view() ?? { since: null, done: [] });
  }

  async invites(): Promise<Out<Invite[]>> {
    return ok(await this.records.invites());
  }

  publicInvite(slug: string): Promise<Out<PublicInvite>> {
    return publicInvite(this.records, slug);
  }

  answerInvite(slug: string, answer: InviteAnswer): Promise<Out<Invite>> {
    return answerInvite(this.records, this.deps, slug, answer);
  }

  example(): Promise<Out<JointExample>> {
    return jointExample(this.records);
  }

  async dashboard(): Promise<Out<VenueDashboard>> {
    const d = await venueDashboard(this.records, this.deps.now());
    return d ? ok(d) : noVenue();
  }
}
