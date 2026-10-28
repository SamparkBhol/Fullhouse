import { applyRefine, parseRefineFallback, REFINE_TOOL } from "../../src/core/index.ts";
import type { Qloo, QlooCache, ReadOptions } from "../../src/core/index.ts";
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
import { newNightId } from "../../src/worker/ids.ts";
import type { CoreFns, VenueDeps } from "../../src/worker/venue/api.ts";

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

// An in memory Qloo cache for tests; it copies values the way a real store would.
export function memoryCache(): QlooCache & { size(): number } {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async put(key, body) {
      map.set(key, structuredClone(body));
    },
    size: () => map.size,
  };
}

export interface FakeCoreLog {
  reads: Array<{ venueId: string; hadPrevious: boolean; exclude: string[] }>;
  plans: Array<{ input: PlanInput; origin: NightPlan["origin"] }>;
  copies: number;
}

export function fakeCore(log: FakeCoreLog = { reads: [], plans: [], copies: 0 }): CoreFns & { log: FakeCoreLog } {
  return {
    log,
    REFINE_TOOL,
    parseRefineFallback,
    applyRefine,
    async readStreet(_q: Qloo, venue: Venue, opts?: ReadOptions) {
      log.reads.push({ venueId: venue.id, hadPrevious: Boolean(opts?.previous), exclude: (opts?.exclude ?? []).map((e) => e.id) });
      return fakeRead(venue.id);
    },
    planNights(_read, venue, input, now, origin, newId): PlanResponse {
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
