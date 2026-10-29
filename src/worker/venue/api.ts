import type { Generate, JointRead, MatchOutcome, Qloo, ReadOptions } from "../../core/index.ts";
import type {
  ApproveInput,
  Baseline,
  CreateVenueInput,
  EntityRef,
  Invite,
  JointExample,
  LovedPlace,
  Match,
  Night,
  NightPlan,
  PlanInput,
  PlanResponse,
  StreetRead,
  Rising,
  Venue,
  VenueCandidate,
  VenueState,
} from "../../shared/contract.ts";
import type { VenueDashboard } from "../../shared/stats.ts";
import type { RefineCore } from "../ai.ts";
import type { AiLike } from "../env.ts";
import type { PublicNight } from "../pages/event.ts";
import type { PublicInvite } from "../pages/invite.ts";
import { isQlooError, qlooFailure } from "../qloo/errors.ts";
import type { StatsSink } from "../stats/events.ts";

export interface CoreFns extends RefineCore {
  readStreet(q: Qloo, venue: Venue, opts?: ReadOptions): Promise<StreetRead>;
  planNights(read: StreetRead, venue: Venue, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse;
  writeCopy(plan: NightPlan, venue: Venue, read: StreetRead, generate: Generate | null): Promise<NightPlan>;
  runBaseline(q: Qloo, venue: Venue, read: StreetRead, plan: NightPlan | null, generate: Generate, model: string): Promise<Baseline>;
  matchFor(q: Qloo, venue: Venue, read: StreetRead, partnerId?: string): Promise<MatchOutcome | null>;
  readJoint(q: Qloo, venue: Venue, read: StreetRead, partner: LovedPlace, exclude?: EntityRef[]): Promise<JointRead>;
  planJoint(read: StreetRead, joint: Rising[], venue: Venue, match: Match, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse;
  nextMondayNine(tz: string, now: Date): Date;
}


export interface VenueDeps {
  core: CoreFns;
  qloo(established?: boolean): Qloo | null;
  generate: Generate | null;
  ai: AiLike | null;
  model: string;
  fetch: typeof fetch;
  secret: string;
  resend: { key: string; from: string } | null;
  now(): Date;
  newId(): string;
  slugRand?(): string;
  stats?: StatsSink;
}

export type Out<T> = { ok: true; value: T } | { ok: false; status: number; error: string; detail?: string };

export interface VenueApi {
  init(id: string, input: CreateVenueInput, candidate: VenueCandidate, origin: string): Promise<Out<{ venue: Venue; ownerToken: string }>>;
  ownerCheck(venueId: string, token: string | null): Promise<boolean>;
  newOwnerLink(origin: string): Promise<Out<{ ownerUrl: string; ownerToken: string }>>;
  requestEmail(email: string, origin: string): Promise<Out<Venue>>;
  confirmEmail(code: string): Promise<Out<Venue>>;
  state(): Promise<Out<VenueState>>;
  read(): Promise<Out<StreetRead>>;
  plan(input: PlanInput): Promise<Out<PlanResponse>>;
  refine(planId: string, request: string): Promise<Out<PlanResponse>>;
  approve(planId: string, input: ApproveInput, origin: string): Promise<Out<Night>>;
  result(nightId: string, headcount: number, note?: string, capacity?: number): Promise<Out<Night>>;
  unpublish(nightId: string): Promise<Out<Night>>;
  republish(nightId: string): Promise<Out<Night>>;
  report(slug: string): Promise<Out<{ hidden: boolean }>>;
  connectEventbrite(token: string): Promise<Out<{ organization: string }>>;
  disconnectEventbrite(): Promise<Out<{ disconnected: true }>>;
  destroy(): Promise<Out<{ deleted: true }>>;
  baseline(): Promise<Out<Baseline>>;
  publicNight(slug: string, browser: string | null): Promise<Out<PublicNight>>;
  rsvp(slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>>;
  monday(): Promise<Out<MondayRun>>;
  dashboard(): Promise<Out<VenueDashboard>>;
  match(partnerId?: string): Promise<Out<Match>>;
  invite(planId: string, partnerId: string, origin: string): Promise<Out<Invite>>;
  invites(): Promise<Out<Invite[]>>;
  publicInvite(slug: string): Promise<Out<PublicInvite>>;
  answerInvite(slug: string, answer: "yes" | "no"): Promise<Out<Invite>>;
  example(): Promise<Out<JointExample>>;
  precomputeProof(): Promise<Out<Baseline | null>>;
}

export interface MondayRun {
  planned: boolean;
  emailed: boolean;
  nextAlarm: string | null;
  idle?: "paused" | "deleted";
}

export const ok = <T>(value: T): Out<T> => ({ ok: true, value });

export const fail = <T>(status: number, error: string, detail?: string): Out<T> =>
  detail === undefined ? { ok: false, status, error } : { ok: false, status, error, detail };

export function failure<T>(err: unknown, what: string): Out<T> {
  if (isQlooError(err)) {
    const f = qlooFailure(err);
    console.error(`${what} failed`, err.kind, err.status);
    return fail(f.status, f.error, f.detail);
  }
  console.error(`${what} failed`, err instanceof Error ? err.message : String(err));
  return fail(500, "internal", `Something went wrong while trying to ${what}. It was logged.`);
}

export function noVenue<T>(): Out<T> {
  return fail(404, "venue_not_found", "No venue with that id.");
}
