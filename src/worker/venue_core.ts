import type { Generate, Qloo } from "../core/index.ts";
import type {
  ApproveInput,
  Baseline,
  CreateVenueInput,
  Night,
  NightPlan,
  PlanInput,
  PlanResponse,
  StreetRead,
  Venue,
  VenueCandidate,
  VenueState,
} from "../shared/contract.ts";
import { runActions, type Published } from "./actions/run.ts";
import { sendOwnerEmail } from "./actions/email.ts";
import { eventbriteOrganization } from "./actions/eventbrite.ts";
import { refineInput, type RefineCore } from "./ai.ts";
import type { AiLike } from "./env.ts";
import { esc } from "./pages/html.ts";
import { isPast, type PublicNight } from "./pages/event.ts";
import { isQlooError, qlooFailure, QLOO_KEY_MISSING } from "./qloo_wiring.ts";
import type { Store } from "./store.ts";
import { ownerToken, ownerUrl, seal, unseal, type Sealed } from "./tokens.ts";
import { longDate } from "./zones.ts";

export interface CoreFns extends RefineCore {
  readStreet(q: Qloo, venue: Venue, opts?: { previous?: StreetRead; momentumOnly?: boolean }): Promise<StreetRead>;
  planNights(read: StreetRead, venue: Venue, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse;
  writeCopy(plan: NightPlan, venue: Venue, read: StreetRead, generate: Generate | null): Promise<NightPlan>;
  runBaseline(q: Qloo, venue: Venue, read: StreetRead, plan: NightPlan, generate: Generate, model: string): Promise<Baseline>;
  nextMondayNine(tz: string, now: Date): Date;
}

export interface VenueDeps {
  core: CoreFns;
  qloo(): Qloo | null;
  generate: Generate | null;
  ai: AiLike | null;
  model: string;
  fetch: typeof fetch;
  secret: string;
  resend: { key: string; from: string } | null;
  now(): Date;
  newId(): string;
  slugRand?(): string;
}

export type Out<T> = { ok: true; value: T } | { ok: false; status: number; error: string; detail?: string };

export interface VenueApi {
  init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<Venue>>;
  state(): Promise<Out<VenueState>>;
  read(): Promise<Out<StreetRead>>;
  plan(input: PlanInput): Promise<Out<PlanResponse>>;
  refine(planId: string, request: string): Promise<Out<PlanResponse>>;
  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>>;
  result(nightId: string, headcount: number, note?: string): Promise<Out<Night>>;
  connectEventbrite(token: string): Promise<Out<{ organization: string }>>;
  disconnectEventbrite(): Promise<Out<{ disconnected: true }>>;
  destroy(): Promise<Out<{ deleted: true }>>;
  baseline(): Promise<Out<Baseline>>;
  publicNight(slug: string, browser: string | null): Promise<Out<PublicNight>>;
  rsvp(slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>>;
  monday(): Promise<Out<{ planned: boolean; emailed: boolean; nextAlarm: string }>>;
}

interface ProposalRecord {
  plan: NightPlan;
  input: PlanInput;
}

interface NightRecord {
  night: Night;
  input: PlanInput;
  published: Published;
}

interface EventbriteRecord {
  sealed: Sealed;
  organizationId: string;
  organization: string;
}

const MAX_PROPOSALS = 12;

const ok = <T>(value: T): Out<T> => ({ ok: true, value });
const fail = <T>(status: number, error: string, detail?: string): Out<T> =>
  detail === undefined ? { ok: false, status, error } : { ok: false, status, error, detail };

function failure<T>(err: unknown, what: string): Out<T> {
  if (isQlooError(err)) {
    const f = qlooFailure(err);
    console.error(`${what} failed`, err.kind, err.status);
    return fail(f.status, f.error, f.detail);
  }
  console.error(`${what} failed`, err instanceof Error ? err.message : String(err));
  return fail(500, "internal", `Something went wrong while trying to ${what}. It was logged.`);
}

export function mondayInput(venue: Venue, nights: Night[]): PlanInput {
  const input: PlanInput = {
    weekday: venue.quietSlot.weekday,
    start: venue.quietSlot.start,
    durationMin: venue.quietSlot.durationMin,
  };
  if (venue.capacity) input.maxPeople = venue.capacity;
  if (venue.noLiveMusic) input.noLiveMusic = true;
  const last = nights
    .filter((n) => n.status === "done" && typeof n.headcount === "number")
    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0];
  if (last && venue.capacity && (last.headcount ?? 0) < venue.capacity * 0.4) input.avoidFormats = [last.format];
  return input;
}

export class VenueCore implements VenueApi {
  constructor(
    private readonly store: Store,
    private readonly deps: VenueDeps,
  ) {}

  private venue(): Promise<Venue | undefined> {
    return this.store.get<Venue>("venue");
  }

  private async proposals(): Promise<ProposalRecord[]> {
    return (await this.store.get<ProposalRecord[]>("proposals")) ?? [];
  }

  private async nights(): Promise<NightRecord[]> {
    const map = await this.store.list<NightRecord>("night:");
    return [...map.values()];
  }

  private async saveProposals(response: PlanResponse, input: PlanInput): Promise<void> {
    const fresh = [response.plan, ...response.alternatives].map((plan) => ({ plan, input }));
    const old = (await this.proposals()).filter((r) => r.plan.status === "proposed");
    await this.store.put("proposals", [...fresh, ...old].slice(0, MAX_PROPOSALS));
  }

  private async withCopy(plan: NightPlan, venue: Venue, read: StreetRead): Promise<NightPlan> {
    try {
      return await this.deps.core.writeCopy(plan, venue, read, this.deps.generate);
    } catch (err) {
      console.warn("writeCopy failed, keeping template copy", err instanceof Error ? err.message : String(err));
      return plan;
    }
  }

  private async freshRead(q: Qloo, venue: Venue, momentumOnly = false): Promise<StreetRead> {
    const previous = await this.store.get<StreetRead>("read");
    const opts: { previous?: StreetRead; momentumOnly?: boolean } = {};
    if (previous) opts.previous = previous;
    if (momentumOnly && previous) opts.momentumOnly = true;
    const read = await this.deps.core.readStreet(q, venue, opts);
    await this.store.put("read", read);
    return read;
  }

  private async armAlarm(tz: string): Promise<number> {
    const now = this.deps.now();
    let next = this.deps.core.nextMondayNine(tz, now).getTime();
    if (!Number.isFinite(next) || next <= now.getTime() + 60_000) {
      next = this.deps.core.nextMondayNine(tz, new Date(now.getTime() + 3_600_000)).getTime();
    }
    await this.store.setAlarm(next);
    return next;
  }

  async init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<Venue>> {
    if (await this.venue()) return fail(409, "venue_exists", "This venue is already set up.");
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
    await this.store.put("venue", venue);
    await this.store.put("meta", { origin });
    await this.armAlarm(venue.tz);
    return ok(venue);
  }

  async state(): Promise<Out<VenueState>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    const [read, proposals, nights, alarm, baseline] = await Promise.all([
      this.store.get<StreetRead>("read"),
      this.proposals(),
      this.nights(),
      this.store.getAlarm(),
      this.store.get<Baseline>("baseline"),
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
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    const q = this.deps.qloo();
    if (!q) return fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
    try {
      return ok(await this.freshRead(q, venue));
    } catch (err) {
      return failure(err, "read the street");
    }
  }

  async plan(input: PlanInput): Promise<Out<PlanResponse>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    try {
      let read = await this.store.get<StreetRead>("read");
      if (!read) {
        const q = this.deps.qloo();
        if (!q) return fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
        read = await this.freshRead(q, venue);
      }
      const response = this.deps.core.planNights(read, venue, input, this.deps.now(), "owner", this.deps.newId);
      const plan = await this.withCopy(response.plan, venue, read);
      const out: PlanResponse = { plan, alternatives: response.alternatives, input };
      await this.saveProposals(out, input);
      return ok(out);
    } catch (err) {
      return failure(err, "plan the night");
    }
  }

  async refine(planId: string, request: string): Promise<Out<PlanResponse>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    const record = (await this.proposals()).find((r) => r.plan.id === planId);
    if (!record) return fail(404, "plan_not_found", "That plan is not among the current proposals.");
    const read = await this.store.get<StreetRead>("read");
    if (!read) return fail(409, "no_read", "Run the street read first.");
    try {
      const { input, method } = await refineInput(
        { ai: this.deps.ai, model: this.deps.model, generate: this.deps.generate, core: this.deps.core },
        record.input,
        request,
      );
      const response = this.deps.core.planNights(read, venue, input, this.deps.now(), "refine", this.deps.newId);
      const plan = await this.withCopy(response.plan, venue, read);
      const out: PlanResponse = { plan, alternatives: response.alternatives, input, refine: { method, request } };
      await this.saveProposals(out, input);
      return ok(out);
    } catch (err) {
      return failure(err, "refine the plan");
    }
  }

  private async eventbriteToken(venue: Venue): Promise<{ token: string; organizationId: string } | null> {
    const rec = await this.store.get<EventbriteRecord>("eventbrite");
    if (!rec) return null;
    try {
      return { token: await unseal(this.deps.secret, venue.id, rec.sealed), organizationId: rec.organizationId };
    } catch {
      console.error("eventbrite token could not be decrypted");
      return null;
    }
  }

  private async ownerLink(venue: Venue, origin: string): Promise<string> {
    return ownerUrl(origin, venue.id, await ownerToken(this.deps.secret, venue.id));
  }

  async approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    const existing = await this.store.get<NightRecord>(`night:${planId}`);
    if (existing) return ok(existing.night);
    const proposals = await this.proposals();
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
        now: this.deps.now(),
        fetch: this.deps.fetch,
        eventbrite: input.actions.includes("eventbrite") ? await this.eventbriteToken(venue) : null,
        resend: this.deps.resend,
        ownerLink: await this.ownerLink(venue, origin),
        ...(this.deps.slugRand ? { slugRand: this.deps.slugRand } : {}),
      });
      const night: Night = { ...record.plan, status: "approved", actions: run.results, rsvps: 0 };
      if (run.slug) night.eventSlug = run.slug;
      await this.store.put(`night:${night.id}`, { night, input: record.input, published: run.published } satisfies NightRecord);
      if (run.slug) await this.store.put(`slug:${run.slug}`, night.id);
      await this.store.put(
        "proposals",
        proposals.map((r) => (r.plan.id === planId ? { ...r, plan: { ...r.plan, status: "approved" as const } } : r)),
      );
      return ok(night);
    } catch (err) {
      return failure(err, "publish the night");
    }
  }

  async result(nightId: string, headcount: number, note?: string): Promise<Out<Night>> {
    const rec = await this.store.get<NightRecord>(`night:${nightId}`);
    if (!rec) return fail(404, "night_not_found", "No approved night with that id.");
    rec.night.headcount = headcount;
    if (note) rec.night.resultNote = note;
    else delete rec.night.resultNote;
    rec.night.status = "done";
    await this.store.put(`night:${nightId}`, rec);
    return ok(rec.night);
  }

  async connectEventbrite(token: string): Promise<Out<{ organization: string }>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    const org = await eventbriteOrganization(token, this.deps.fetch);
    if (!org.ok) return fail(400, "eventbrite_rejected", org.reason);
    const rec: EventbriteRecord = {
      sealed: await seal(this.deps.secret, venue.id, token),
      organizationId: org.org.id,
      organization: org.org.name,
    };
    await this.store.put("eventbrite", rec);
    await this.store.put("venue", { ...venue, eventbrite: { organization: org.org.name } });
    return ok({ organization: org.org.name });
  }

  async disconnectEventbrite(): Promise<Out<{ disconnected: true }>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    await this.store.delete("eventbrite");
    const { eventbrite: _drop, ...rest } = venue;
    await this.store.put("venue", rest);
    return ok({ disconnected: true });
  }

  async destroy(): Promise<Out<{ deleted: true }>> {
    await this.store.deleteAlarm();
    await this.store.deleteAll();
    return ok({ deleted: true });
  }

  async baseline(): Promise<Out<Baseline>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found", "No venue with that id.");
    if (!this.deps.generate) return fail(503, "ai_unavailable", "The language model is not available here, so the plain model comparison cannot run.");
    const q = this.deps.qloo();
    if (!q) return fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
    const read = await this.store.get<StreetRead>("read");
    if (!read) return fail(409, "no_read", "Run the street read first.");
    const proposals = await this.proposals();
    const nights = (await this.nights()).map((r) => r.night).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const plan = proposals[0]?.plan ?? nights[0];
    if (!plan) return fail(409, "no_plan", "Plan a night first, then compare it with the plain model.");
    try {
      const result = await this.deps.core.runBaseline(q, venue, read, plan, this.deps.generate, this.deps.model);
      await this.store.put("baseline", result);
      return ok(result);
    } catch (err) {
      return failure(err, "run the plain model comparison");
    }
  }

  private async nightBySlug(slug: string): Promise<{ venue: Venue; rec: NightRecord } | null> {
    const id = await this.store.get<string>(`slug:${slug}`);
    if (!id) return null;
    const [venue, rec] = await Promise.all([this.venue(), this.store.get<NightRecord>(`night:${id}`)]);
    if (!venue || !rec) return null;
    return { venue, rec };
  }

  async publicNight(slug: string, browser: string | null): Promise<Out<PublicNight>> {
    const found = await this.nightBySlug(slug);
    if (!found) return fail(404, "night_not_found");
    const { venue, rec } = found;
    const n = rec.night;
    const going = browser ? (await this.store.get<number>(`rsvp:${n.id}:${browser}`)) !== undefined : false;
    const pub: PublicNight = {
      slug,
      nightId: n.id,
      title: n.copy.eventTitle,
      description: n.copy.eventDescription,
      posterHeadline: n.copy.posterHeadline,
      posterSub: n.copy.posterSub,
      writtenBy: n.copy.writtenBy,
      date: n.date,
      start: n.start,
      end: n.end,
      tz: venue.tz,
      venueName: venue.entity.name,
      city: venue.city,
      lat: venue.entity.lat,
      lng: venue.entity.lng,
      why: n.why.map((b) => b.text).filter((t) => typeof t === "string" && t.trim().length > 0),
      rsvps: n.rsvps,
      going,
      published: rec.published,
    };
    if (venue.entity.address) pub.address = venue.entity.address;
    return ok(pub);
  }

  async rsvp(slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>> {
    const found = await this.nightBySlug(slug);
    if (!found || !found.rec.published.page) return fail(404, "night_not_found");
    const { rec, venue } = found;
    if (isPast({ date: rec.night.date, start: rec.night.start, end: rec.night.end, tz: venue.tz }, this.deps.now())) {
      return fail(409, "night_passed", "This night has already happened.");
    }
    const key = `rsvp:${rec.night.id}:${browser}`;
    if ((await this.store.get<number>(key)) !== undefined) return ok({ count: rec.night.rsvps, already: true });
    await this.store.put(key, 1);
    rec.night.rsvps += 1;
    await this.store.put(`night:${rec.night.id}`, rec);
    return ok({ count: rec.night.rsvps, already: false });
  }

  async monday(): Promise<Out<{ planned: boolean; emailed: boolean; nextAlarm: string }>> {
    const venue = await this.venue();
    if (!venue) return fail(404, "venue_not_found");
    let planned = false;
    let emailed = false;
    try {
      const q = this.deps.qloo();
      if (q) {
        const read = await this.freshRead(q, venue, true);
        const input = mondayInput(venue, (await this.nights()).map((r) => r.night));
        const response = this.deps.core.planNights(read, venue, input, this.deps.now(), "monday", this.deps.newId);
        const plan = await this.withCopy(response.plan, venue, read);
        await this.saveProposals({ plan, alternatives: response.alternatives, input }, input);
        planned = true;
        emailed = await this.mondayEmail(venue, plan);
      } else {
        console.warn("monday run skipped: QLOO_API_KEY is not set");
      }
    } catch (err) {
      failure(err, "run the Monday plan");
    }
    const next = await this.armAlarm(venue.tz);
    return ok({ planned, emailed, nextAlarm: new Date(next).toISOString() });
  }

  private async mondayEmail(venue: Venue, plan: NightPlan): Promise<boolean> {
    if (!venue.ownerEmail || !this.deps.resend) return false;
    const meta = await this.store.get<{ origin: string }>("meta");
    if (!meta?.origin) return false;
    const link = await this.ownerLink(venue, meta.origin);
    const when = `${longDate(plan.date)}, ${plan.start} to ${plan.end}`;
    const sent = await sendOwnerEmail(
      this.deps.resend,
      venue.ownerEmail,
      {
        subject: `Next quiet night idea for ${venue.entity.name}`,
        text: [
          `Full House read your street again this morning and planned "${plan.copy.eventTitle}" for ${when}.`,
          "Nothing is published until you approve it.",
          "",
          `Review it: ${link}`,
          "Keep this link to yourself. Anyone who has it can manage your venue.",
        ].join("\n"),
        html:
          `<p>Full House read your street again this morning and planned <strong>${esc(plan.copy.eventTitle)}</strong> for ${esc(when)}.</p>` +
          `<p>Nothing is published until you approve it.</p>` +
          `<p><a href="${esc(link)}">Review it</a>. Keep this link to yourself. Anyone who has it can manage your venue.</p>`,
      },
      this.deps.fetch,
    );
    if (!sent.ok) console.warn("monday email failed", sent.reason);
    return sent.ok;
  }
}
