import { DurableObject } from "cloudflare:workers";
import { applyRefine, createQloo, nextMondayNine, parseRefineFallback, planNights, readStreet, REFINE_TOOL, runBaseline, writeCopy } from "../core/index.ts";
import type { ApproveInput, Baseline, CreateVenueInput, Night, PlanInput, PlanResponse, StreetRead, Venue, VenueCandidate, VenueState } from "../shared/contract.ts";
import { makeGenerate } from "./ai.ts";
import { modelOf, resendOf, type Env } from "./env.ts";
import type { MeterApi } from "./meter_core.ts";
import type { PublicNight } from "./pages/event.ts";
import { buildQloo, cacheApiCache, sqlCache, tieredCache, type SqlLike } from "./qloo_wiring.ts";
import { doStore } from "./store.ts";
import { newNightId } from "./tokens.ts";
import { VenueCore, type CoreFns, type Out, type VenueApi } from "./venue_core.ts";

export const CORE_FNS: CoreFns = { readStreet, planNights, writeCopy, runBaseline, nextMondayNine, REFINE_TOOL, parseRefineFallback, applyRefine };

export function meterStub(env: Env): MeterApi {
  return env.METER.get(env.METER.idFromName("global")) as unknown as MeterApi;
}

export class VenueAgent extends DurableObject<Env> implements VenueApi {
  // Built per call so each invocation gets its own cache operation allowance and budget reservation.
  private core(): VenueCore {
    const env = this.env;
    const sql = this.ctx.storage.sql as unknown as SqlLike;
    const model = modelOf(env);
    return new VenueCore(doStore(this.ctx.storage), {
      core: CORE_FNS,
      qloo: () => buildQloo(env, createQloo, tieredCache(sqlCache(sql), cacheApiCache(10)), meterStub(env)),
      generate: makeGenerate(env.AI, model),
      ai: env.AI ?? null,
      model,
      fetch: (input, init) => fetch(input, init),
      secret: env.TOKEN_SECRET ?? "",
      resend: resendOf(env),
      now: () => new Date(),
      newId: newNightId,
    });
  }

  init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<Venue>> {
    return this.core().init(id, input, candidate, origin);
  }
  state(): Promise<Out<VenueState>> {
    return this.core().state();
  }
  read(): Promise<Out<StreetRead>> {
    return this.core().read();
  }
  plan(input: PlanInput): Promise<Out<PlanResponse>> {
    return this.core().plan(input);
  }
  refine(planId: string, request: string): Promise<Out<PlanResponse>> {
    return this.core().refine(planId, request);
  }
  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>> {
    return this.core().approve(planId, input, origin);
  }
  result(nightId: string, headcount: number, note?: string): Promise<Out<Night>> {
    return this.core().result(nightId, headcount, note);
  }
  connectEventbrite(token: string): Promise<Out<{ organization: string }>> {
    return this.core().connectEventbrite(token);
  }
  disconnectEventbrite(): Promise<Out<{ disconnected: true }>> {
    return this.core().disconnectEventbrite();
  }
  destroy(): Promise<Out<{ deleted: true }>> {
    return this.core().destroy();
  }
  baseline(): Promise<Out<Baseline>> {
    return this.core().baseline();
  }
  publicNight(slug: string, browser: string | null): Promise<Out<PublicNight>> {
    return this.core().publicNight(slug, browser);
  }
  rsvp(slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>> {
    return this.core().rsvp(slug, browser);
  }
  monday(): Promise<Out<{ planned: boolean; emailed: boolean; nextAlarm: string }>> {
    return this.core().monday();
  }

  override async alarm(): Promise<void> {
    await this.core().monday();
  }
}
