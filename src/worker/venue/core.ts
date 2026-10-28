import type {
  ApproveInput,
  Baseline,
  CreateVenueInput,
  Night,
  PlanInput,
  PlanResponse,
  StreetRead,
  Venue,
  VenueCandidate,
  VenueState,
} from "../../shared/contract.ts";
import { refineInput } from "../ai.ts";
import type { PublicNight } from "../pages/event.ts";
import { QLOO_KEY_MISSING } from "../qloo_wiring.ts";
import type { Store } from "../store.ts";
import { fail, failure, noVenue, ok, type Out, type VenueApi, type VenueDeps } from "./api.ts";
import { connectEventbrite, disconnectEventbrite } from "./eventbrite.ts";
import { armAlarm, runMonday } from "./monday.ts";
import { freshRead, withCopy } from "./planning.ts";
import { publicNight, rsvp } from "./public.ts";
import { approveNight, logTurnout } from "./publish.ts";
import { VenueRecords } from "./records.ts";

const keyMissing = <T>(): Out<T> => fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);

export class VenueCore implements VenueApi {
  private readonly records: VenueRecords;

  constructor(
    store: Store,
    private readonly deps: VenueDeps,
  ) {
    this.records = new VenueRecords(store);
  }

  async init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<Venue>> {
    if (await this.records.venue()) return fail(409, "venue_exists", "This venue is already set up.");
    const venue: Venue = {
      id,
      entity: candidate,
      city: input.city,
      tz: input.tz,
      quietSlot: input.quietSlot,
      createdAt: this.deps.now().toISOString(),
    };
    if (input.capacity !== undefined) venue.capacity = input.capacity;
    if (input.ownerEmail) venue.ownerEmail = input.ownerEmail;
    if (input.noLiveMusic !== undefined) venue.noLiveMusic = input.noLiveMusic;
    await this.records.store.put("venue", venue);
    await this.records.store.put("meta", { origin });
    await armAlarm(this.records, this.deps, venue.tz);
    return ok(venue);
  }

  async state(): Promise<Out<VenueState>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    const [read, proposals, nights, alarm, baseline] = await Promise.all([
      this.records.read(),
      this.records.proposals(),
      this.records.nights(),
      this.records.store.getAlarm(),
      this.records.store.get<Baseline>("baseline"),
    ]);
    const state: VenueState = {
      venue,
      proposals: proposals.filter((r) => r.plan.status === "proposed").map((r) => r.plan),
      nights: nights.map((r) => r.night).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)),
    };
    if (read) state.read = read;
    if (alarm) state.nextAlarm = new Date(alarm).toISOString();
    if (baseline) state.baseline = baseline;
    return ok(state);
  }

  async read(): Promise<Out<StreetRead>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    const q = this.deps.qloo();
    if (!q) return keyMissing();
    try {
      return ok(await freshRead(this.records, this.deps, q, venue));
    } catch (err) {
      return failure(err, "read the street");
    }
  }

  async plan(input: PlanInput): Promise<Out<PlanResponse>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    try {
      let read = await this.records.read();
      if (!read) {
        const q = this.deps.qloo();
        if (!q) return keyMissing();
        read = await freshRead(this.records, this.deps, q, venue);
      }
      const response = this.deps.core.planNights(read, venue, input, this.deps.now(), "owner", this.deps.newId);
      const plan = await withCopy(this.deps, response.plan, venue, read);
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
      const response = this.deps.core.planNights(read, venue, input, this.deps.now(), "refine", this.deps.newId);
      const plan = await withCopy(this.deps, response.plan, venue, read);
      const out: PlanResponse = { plan, alternatives: response.alternatives, input, refine: { method, request } };
      await this.records.saveProposals(out, input);
      return ok(out);
    } catch (err) {
      return failure(err, "refine the plan");
    }
  }

  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
    return approveNight(this.records, this.deps, planId, input, origin);
  }

  result(nightId: string, headcount: number, note?: string): Promise<Out<Night>> {
    return logTurnout(this.records, nightId, headcount, note);
  }

  connectEventbrite(token: string): Promise<Out<{ organization: string }>> {
    return connectEventbrite(this.records, this.deps, token);
  }

  disconnectEventbrite(): Promise<Out<{ disconnected: true }>> {
    return disconnectEventbrite(this.records);
  }

  async destroy(): Promise<Out<{ deleted: true }>> {
    await this.records.store.deleteAlarm();
    await this.records.store.deleteAll();
    return ok({ deleted: true });
  }

  async baseline(): Promise<Out<Baseline>> {
    const venue = await this.records.venue();
    if (!venue) return noVenue();
    if (!this.deps.generate) return fail(503, "ai_unavailable", "The language model is not available here, so the plain model comparison cannot run.");
    const q = this.deps.qloo();
    if (!q) return keyMissing();
    const read = await this.records.read();
    if (!read) return fail(409, "no_read", "Run the street read first.");
    const proposals = await this.records.proposals();
    const nights = (await this.records.nights()).map((r) => r.night).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const plan = proposals[0]?.plan ?? nights[0];
    if (!plan) return fail(409, "no_plan", "Plan a night first, then compare it with the plain model.");
    try {
      const result = await this.deps.core.runBaseline(q, venue, read, plan, this.deps.generate, this.deps.model);
      await this.records.store.put("baseline", result);
      return ok(result);
    } catch (err) {
      return failure(err, "run the plain model comparison");
    }
  }

  publicNight(slug: string, browser: string | null): Promise<Out<PublicNight>> {
    return publicNight(this.records, slug, browser);
  }

  rsvp(slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>> {
    return rsvp(this.records, this.deps, slug, browser);
  }

  monday(): Promise<Out<{ planned: boolean; emailed: boolean; nextAlarm: string }>> {
    return runMonday(this.records, this.deps);
  }
}
