import { applyRefine, parseRefineFallback, REFINE_TOOL } from "../../src/core/index.ts";
import type { Qloo, QlooOptions } from "../../src/core/index.ts";
import type {
  Baseline,
  LovedPlace,
  NightPlan,
  PlanInput,
  PlanResponse,
  StreetRead,
  Venue,
  VenueCandidate,
} from "../../src/shared/contract.ts";
import { createApp, type AppDeps } from "../../src/worker/app.ts";
import type { AiLike, Env } from "../../src/worker/env.ts";
import { MeterCore } from "../../src/worker/meter_core.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import { newNightId } from "../../src/worker/tokens.ts";
import type { CoreFns, VenueDeps } from "../../src/worker/venue/api.ts";
import { VenueCore } from "../../src/worker/venue/core.ts";

export const CANDIDATE: VenueCandidate = {
  id: "B6E7C1A4-0000-4000-8000-000000000001",
  name: "Blue Hour Records",
  type: "place",
  address: "12 Canal Street",
  lat: 52.52,
  lng: 13.405,
  tags: ["record shop"],
};

export function loved(id: string, name: string): LovedPlace {
  return {
    id,
    name,
    type: "place",
    lat: 52.521,
    lng: 13.406,
    distanceM: 180,
    rank: 1,
    tags: ["cafe"],
    because: [{ text: `${name} ranks high on this street`, kind: "affinity", provenance: 1 }],
  };
}

export const PARTNERS = [loved("P-1", "Kaffee Kanal"), loved("P-2", "Paper & Ink Books")];

export function fakeRead(venueId: string, at = "2026-10-25T10:00:00.000Z"): StreetRead {
  return {
    venueId,
    at,
    center: { lat: CANDIDATE.lat, lng: CANDIDATE.lng },
    radiusM: 1200,
    heat: [],
    streetTags: [],
    venueTags: [],
    shared: [],
    gaps: [],
    lovedPlaces: PARTNERS,
    rising: [],
    limits: ["Qloo data covers places with enough signal."],
    provenance: [],
  };
}

export function fakePlan(id: string, venueId: string, input: PlanInput, origin: NightPlan["origin"], now: Date, title = "Jazz on vinyl night"): NightPlan {
  return {
    id,
    venueId,
    createdAt: now.toISOString(),
    origin,
    date: "2026-11-05",
    start: input.start ?? "19:00",
    end: "22:00",
    format: input.preferFormats?.[0] ?? "listening",
    feature: null,
    themeTags: [],
    partners: PARTNERS,
    menuIdeas: [],
    playlist: [],
    why: [{ text: "Jazz ranks 2nd among the tags this street over indexes on.", kind: "tag", provenance: 0 }],
    copy: {
      eventTitle: title,
      eventDescription: "Records from the street's favourite jazz artists, played loud.\n\nBring a record if you like.",
      posterHeadline: "Jazz on vinyl",
      posterSub: "A listening night",
      social: "Jazz on vinyl, Thursday.",
      partnerPitch: { subject: "A jazz night next door", body: "Hello, we are running a jazz listening night and would love to team up." },
      writtenBy: "template",
    },
    checks: { claimsVerified: true, unverified: [] },
    limits: [],
    readAt: now.toISOString(),
    status: "proposed",
  };
}

export interface FakeCoreLog {
  reads: Array<{ venueId: string; hadPrevious: boolean }>;
  plans: Array<{ input: PlanInput; origin: NightPlan["origin"] }>;
  copies: number;
}

export function fakeCore(log: FakeCoreLog = { reads: [], plans: [], copies: 0 }): CoreFns & { log: FakeCoreLog } {
  return {
    log,
    REFINE_TOOL,
    parseRefineFallback,
    applyRefine,
    async readStreet(_q: Qloo, venue: Venue, opts?: { previous?: StreetRead }) {
      log.reads.push({ venueId: venue.id, hadPrevious: Boolean(opts?.previous) });
      return fakeRead(venue.id);
    },
    planNights(read, venue, input, now, origin, newId): PlanResponse {
      log.plans.push({ input, origin });
      return {
        plan: fakePlan(newId(), venue.id, input, origin, now),
        alternatives: [fakePlan(newId(), venue.id, input, origin, now, "Film night"), fakePlan(newId(), venue.id, input, origin, now, "Quiz night")],
      };
    },
    async writeCopy(plan, _venue, _read, generate) {
      log.copies++;
      if (!generate) return plan;
      return { ...plan, copy: { ...plan.copy, writtenBy: "model" } };
    },
    async runBaseline(_q, _venue, _read, plan, _generate, model): Promise<Baseline> {
      return { at: "2026-10-25T10:00:00.000Z", ask: `Plan a night like ${plan.copy.eventTitle}`, model, plainText: "x", plainNames: [], fullHouseNames: [], method: "fake" };
    },
    nextMondayNine(_tz: string, now: Date) {
      return new Date(now.getTime() + 3 * 86400000);
    },
  };
}

export const fakeQloo: Qloo = {
  async get() {
    throw new Error("the fake core never calls Qloo");
  },
};

export type FetchCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

export function fakeFetch(handler: (call: FetchCall) => { status?: number; body?: unknown }): typeof fetch & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const call: FetchCall = { url: String(input), method: init?.method ?? "GET", headers, body: raw ? JSON.parse(raw) : undefined };
    calls.push(call);
    const out = handler(call);
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch & { calls: FetchCall[] };
  fn.calls = calls;
  return fn;
}

export function venueDeps(over: Partial<VenueDeps> = {}): VenueDeps {
  return {
    core: fakeCore(),
    qloo: () => fakeQloo,
    generate: null,
    ai: null,
    model: "@cf/test/model",
    fetch: fakeFetch(() => ({ body: {} })),
    secret: "test-secret-0123456789",
    resend: null,
    now: () => new Date("2026-10-25T10:00:00.000Z"),
    newId: newNightId,
    ...over,
  };
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  env: Env;
  venues: Map<string, VenueCore>;
  stores: Map<string, MemoryStore>;
  meterStore: MemoryStore;
  deps: VenueDeps;
  searches: Array<{ name: string; city: string }>;
  qlooOptions: QlooOptions[];
}

export function harness(opts: { env?: Partial<Env>; deps?: Partial<VenueDeps>; candidates?: VenueCandidate[]; budget?: number; ai?: AiLike } = {}): Harness {
  const venues = new Map<string, VenueCore>();
  const stores = new Map<string, MemoryStore>();
  const meterStore = new MemoryStore();
  const meter = new MeterCore(meterStore, opts.budget ?? 1000, () => new Date("2026-10-25T10:00:00.000Z"));
  const deps = venueDeps(opts.deps);
  const searches: Array<{ name: string; city: string }> = [];
  const qlooOptions: QlooOptions[] = [];
  const appDeps: AppDeps = {
    createQloo: (o) => {
      qlooOptions.push(o);
      return fakeQloo;
    },
    findVenues: async (_q, name, city) => {
      searches.push({ name, city });
      return opts.candidates ?? [CANDIDATE];
    },
    venue: (_env, id) => {
      let v = venues.get(id);
      if (!v) {
        const store = new MemoryStore();
        stores.set(id, store);
        v = new VenueCore(store, deps);
        venues.set(id, v);
      }
      return v;
    },
    meter: () => meter,
  };
  const env = {
    VENUE: {} as DurableObjectNamespace,
    METER: {} as DurableObjectNamespace,
    TOKEN_SECRET: deps.secret,
    QLOO_API_KEY: "test-qloo-key",
    ...(opts.ai ? { AI: opts.ai } : {}),
    ...opts.env,
  } as Env;
  return { app: createApp(appDeps), env, venues, stores, meterStore, deps, searches, qlooOptions };
}

export const ORIGIN = "https://fullhouse.example.workers.dev";

export function req(h: Harness, path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.7", ...init.headers };
  if (init.body !== undefined) headers["content-type"] ??= "application/json";
  if (init.token) headers["authorization"] = `Bearer ${init.token}`;
  const body = init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  return Promise.resolve(h.app.request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, ...(body !== undefined ? { body } : {}) }, h.env));
}

export const CREATE_BODY = {
  candidate: { id: CANDIDATE.id, name: CANDIDATE.name },
  city: "Berlin",
  tz: "Europe/Berlin",
  quietSlot: { weekday: 4, start: "19:00", durationMin: 180 },
  capacity: 40,
  ownerEmail: "owner@example.com",
};

export async function createVenue(h: Harness): Promise<{ id: string; token: string; ownerUrl: string }> {
  const res = await req(h, "/api/venues", { method: "POST", body: CREATE_BODY });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { venue: Venue; ownerToken: string; ownerUrl: string };
  return { id: data.venue.id, token: data.ownerToken, ownerUrl: data.ownerUrl };
}
