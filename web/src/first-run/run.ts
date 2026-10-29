import type { NightPlan, PlanInput, PlanResponse, StreetRead } from "../../../src/shared/contract.ts";
import { ApiFailure, api } from "../api.ts";
import type { Invite, Match } from "../joint.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { planGroup, rememberPlanResponse, type VenueCtx } from "../venue-context.ts";

export interface Run {
  ctx: VenueCtx;
  read: Promise<StreetRead> | null;
  match: Promise<Match | null> | null;
  plan: Promise<PlanResponse> | null;
}

const runs = new Map<string, Run>();

const key = (id: string, part: string): string => `first.${id}.${part}`;

// No partner that can host is an answer, not a failure, so the screens can say so.
function noPartner(err: unknown): boolean {
  return err instanceof ApiFailure && [404, 409, 422].includes(err.status);
}

export function runFor(ctx: VenueCtx): Run {
  const held = runs.get(ctx.id);
  if (held) {
    held.ctx = ctx;
    return held;
  }
  const run: Run = { ctx, read: ctx.state.read ? Promise.resolve(ctx.state.read) : null, match: null, plan: null };
  const match = sessionGet<Match | null>(key(ctx.id, "match"));
  if (match !== null && match !== undefined && run.read) run.match = Promise.resolve(match);
  const planId = sessionGet<string>(key(ctx.id, "plan"));
  const group = planId ? planGroup(ctx.state, planId) : null;
  if (group?.plan && run.match) run.plan = Promise.resolve({ plan: group.plan, alternatives: group.alternatives });
  runs.set(ctx.id, run);
  return run;
}

export function readOf(run: Run): Promise<StreetRead> {
  run.read ??= api.read(run.ctx.id, run.ctx.token).then((read) => {
    run.ctx.state.read = read;
    return read;
  });
  run.read.catch(() => (run.read = null));
  return run.read;
}

export function matchOf(run: Run): Promise<Match | null> {
  run.match ??= readOf(run)
    .then((read) => read.match ?? api.match(run.ctx.id, run.ctx.token))
    .catch((err: unknown) => {
      if (noPartner(err)) return null;
      throw err;
    })
    .then((m) => {
      sessionSet(key(run.ctx.id, "match"), m);
      return m;
    });
  run.match.catch(() => (run.match = null));
  return run.match;
}

function keep(run: Run, response: PlanResponse): PlanResponse {
  rememberPlanResponse(response);
  sessionSet(key(run.ctx.id, "plan"), response.plan.id);
  return response;
}

export function planOf(run: Run, input?: PlanInput): Promise<PlanResponse> {
  if (input) run.plan = null;
  run.plan ??= matchOf(run)
    .then(() => api.plan(run.ctx.id, run.ctx.token, input ?? {}))
    .then((r) => keep(run, r));
  run.plan.catch(() => (run.plan = null));
  return run.plan;
}

export function swapPartner(run: Run, partnerId: string): Promise<Match | null> {
  run.plan = null;
  run.match = api.match(run.ctx.id, run.ctx.token, partnerId).then((m) => {
    sessionSet(key(run.ctx.id, "match"), m);
    return m;
  });
  run.match.catch(() => (run.match = null));
  return run.match;
}

export function showPlan(run: Run, plan: NightPlan, alternatives: NightPlan[]): void {
  run.plan = Promise.resolve({ plan, alternatives });
  sessionSet(key(run.ctx.id, "plan"), plan.id);
}

export function rememberInvite(id: string, invite: Invite): void {
  sessionSet(key(id, "invite"), invite);
}

export function rememberedInvite(id: string): Invite | null {
  return sessionGet<Invite>(key(id, "invite"));
}

// The owner link from set up, or one built from the token this phone holds.
export function ownerLink(ctx: VenueCtx): string {
  return sessionGet<string>(`owner.${ctx.id}`) ?? `${location.origin}/v/${encodeURIComponent(ctx.id)}#t=${encodeURIComponent(ctx.token)}`;
}

export const firstPath = (id: string, step = ""): string => `/v/${encodeURIComponent(id)}/first${step ? `/${step}` : ""}`;
