import { DurableObject } from "cloudflare:workers";
import {
  applyRefine,
  createQloo,
  matchFor,
  nextMondayNine,
  parseRefineFallback,
  planJoint,
  planNights,
  readJoint,
  readStreet,
  REFINE_TOOL,
  runBaseline,
  writeCopy,
} from "../core/index.ts";
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
  StreetRead,
  Venue,
  VenueCandidate,
  VenueSettingsInput,
  VenueState,
  RunProgress,
} from "../shared/contract.ts";
import type { VenueDashboard } from "../shared/stats.ts";
import { makeGenerate } from "./ai.ts";
import { modelOf, resendOf, tokenSecretOf, type Env } from "./env.ts";
import { newNightId } from "./ids.ts";
import type { MeterApi } from "./meter_core.ts";
import type { PublicNight } from "./pages/event.ts";
import type { PublicInvite } from "./pages/invite.ts";
import { buildQloo } from "./qloo/build.ts";
import { cacheApiCache, sqlCache, tieredCache, type SqlLike } from "./qloo/caches.ts";
import { StatsBuffer, type StatsApi } from "./stats/buffer.ts";
import { settleVenueStats } from "./stats/venue_history.ts";
import { doStore } from "./store.ts";
import type { CoreFns, MondayRun, Out, VenueApi } from "./venue/api.ts";
import { VenueCore } from "./venue/core.ts";
import { Progress } from "./venue/progress.ts";

export const CORE_FNS: CoreFns = { readStreet, planNights, writeCopy, runBaseline, nextMondayNine, REFINE_TOOL, parseRefineFallback, applyRefine, matchFor, readJoint, planJoint };

export function meterStub(env: Env): MeterApi {
  return env.METER.get(env.METER.idFromName("global")) as unknown as MeterApi;
}

export function statsStub(env: Env): StatsApi {
  return meterStub(env) as unknown as StatsApi;
}

export class VenueAgent extends DurableObject<Env> implements VenueApi {
  private readonly tracker = new Progress();

  // Built per call so each invocation gets its own cache operation allowance and budget reservation.
  private core(stats?: StatsBuffer): VenueCore {
    const env = this.env;
    const sql = this.ctx.storage.sql as unknown as SqlLike;
    const model = modelOf(env);
    return new VenueCore(doStore(this.ctx.storage), {
      core: CORE_FNS,
      progress: this.tracker,
      qloo: (established) => buildQloo(env, createQloo, tieredCache(sqlCache(sql), cacheApiCache(10)), meterStub(env), established, stats),
      generate: makeGenerate(env.AI, model),
      ai: env.AI ?? null,
      model,
      fetch: (input, init) => fetch(input, init),
      secret: tokenSecretOf(env),
      resend: resendOf(env),
      now: () => new Date(),
      newId: newNightId,
      ...(stats ? { stats } : {}),
    });
  }

  // Methods that can count something run through here, so their events reach the Meter in one call at the end.
  // The answer does not wait for the Meter, except in the alarm, which has no answer to send.
  private async run<T>(work: (core: VenueCore) => Promise<T>, waitForMeter = false): Promise<T> {
    const stats = new StatsBuffer();
    try {
      return await work(this.core(stats));
    } finally {
      await settleVenueStats(stats, doStore(this.ctx.storage), statsStub(this.env), waitForMeter ? undefined : (sent) => this.ctx.waitUntil(sent));
    }
  }

  init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<{ venue: Venue; ownerToken: string }>> {
    return this.run((c) => c.init(id, input, candidate, origin));
  }
  ownerCheck(venueId: string, token: string | null): Promise<boolean> {
    return this.core().ownerCheck(venueId, token);
  }
  newOwnerLink(origin: string): Promise<Out<{ ownerUrl: string; ownerToken: string }>> {
    return this.core().newOwnerLink(origin);
  }
  requestEmail(email: string, origin: string): Promise<Out<Venue>> {
    return this.core().requestEmail(email, origin);
  }
  confirmEmail(code: string): Promise<Out<Venue>> {
    return this.core().confirmEmail(code);
  }
  settings(input: VenueSettingsInput): Promise<Out<Venue>> {
    return this.core().settings(input);
  }
  state(): Promise<Out<VenueState>> {
    return this.core().state();
  }
  // The proof runs after the read has answered, in its own run, so the owner never waits for it.
  async read(): Promise<Out<StreetRead>> {
    const out = await this.run((c) => c.read());
    if (out.ok) this.ctx.waitUntil(this.run((c) => c.precomputeProof()).catch(() => undefined));
    return out;
  }
  precomputeProof(): Promise<Out<Baseline | null>> {
    return this.run((c) => c.precomputeProof());
  }
  match(partnerId?: string): Promise<Out<Match>> {
    return this.run((c) => c.match(partnerId));
  }
  invite(planId: string, partnerId: string, origin: string): Promise<Out<Invite>> {
    return this.run((c) => c.invite(planId, partnerId, origin));
  }
  invites(): Promise<Out<Invite[]>> {
    return this.core().invites();
  }
  publicInvite(slug: string): Promise<Out<PublicInvite>> {
    return this.core().publicInvite(slug);
  }
  answerInvite(slug: string, answer: InviteAnswer): Promise<Out<Invite>> {
    return this.ctx.blockConcurrencyWhile(() => this.run((c) => c.answerInvite(slug, answer)));
  }
  example(): Promise<Out<JointExample>> {
    return this.core().example();
  }
  plan(input: PlanInput): Promise<Out<PlanResponse>> {
    return this.run((c) => c.plan(input));
  }
  refine(planId: string, request: string): Promise<Out<PlanResponse>> {
    return this.run((c) => c.refine(planId, request));
  }
  // Input gates do not hold across the Eventbrite and email fetches, so a second tap must wait for the first.
  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
    return this.ctx.blockConcurrencyWhile(() => this.run((c) => c.approve(planId, input, origin)));
  }
  result(nightId: string, headcount: number, note?: string, capacity?: number): Promise<Out<Night>> {
    return this.run((c) => c.result(nightId, headcount, note, capacity));
  }
  unpublish(nightId: string): Promise<Out<Night>> {
    return this.run((c) => c.unpublish(nightId));
  }
  republish(nightId: string): Promise<Out<Night>> {
    return this.core().republish(nightId);
  }
  editNight(nightId: string, copy: EditableCopy): Promise<Out<Night>> {
    return this.core().editNight(nightId, copy);
  }
  report(slug: string, reporter: string): Promise<Out<{ hidden: boolean }>> {
    return this.run((c) => c.report(slug, reporter));
  }
  connectEventbrite(token: string): Promise<Out<{ organization: string }>> {
    return this.core().connectEventbrite(token);
  }
  disconnectEventbrite(): Promise<Out<{ disconnected: true }>> {
    return this.core().disconnectEventbrite();
  }
  destroy(): Promise<Out<{ deleted: true }>> {
    return this.run((c) => c.destroy());
  }
  baseline(): Promise<Out<Baseline>> {
    return this.run((c) => c.baseline());
  }
  publicNight(slug: string, browser: string | null, via?: string): Promise<Out<PublicNight>> {
    return this.core().publicNight(slug, browser, via);
  }
  rsvp(slug: string, browser: string, via?: string): Promise<Out<{ count: number; already: boolean }>> {
    return this.run((c) => c.rsvp(slug, browser, via));
  }
  progress(): Promise<Out<RunProgress>> {
    return this.core().progress();
  }
  monday(): Promise<Out<MondayRun>> {
    return this.run((c) => c.monday());
  }

  dashboard(): Promise<Out<VenueDashboard>> {
    return this.core().dashboard();
  }

  override async alarm(): Promise<void> {
    await this.run((c) => c.monday(), true);
  }
}
