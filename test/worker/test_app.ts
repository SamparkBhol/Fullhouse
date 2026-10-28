import type { QlooOptions } from "../../src/core/index.ts";
import type { Night, PlanResponse, Venue, VenueCandidate } from "../../src/shared/contract.ts";
import { createApp, type AppDeps } from "../../src/worker/app.ts";
import type { AiLike, Env } from "../../src/worker/env.ts";
import { MeterCore } from "../../src/worker/meter_core.ts";
import type { StatsApi } from "../../src/worker/stats/buffer.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import type { VenueDeps } from "../../src/worker/venue/api.ts";
import { VenueCore } from "../../src/worker/venue/core.ts";
import { CANDIDATE, PARTNERS, fakeQloo, venueDeps } from "./helpers.ts";

export interface TestApp {
  app: ReturnType<typeof createApp>;
  env: Env;
  venues: Map<string, VenueCore>;
  stores: Map<string, MemoryStore>;
  meterStore: MemoryStore;
  deps: VenueDeps;
  searches: Array<{ name: string; city: string }>;
  qlooOptions: QlooOptions[];
}

export function testApp(opts: { env?: Partial<Env>; deps?: Partial<VenueDeps>; candidates?: VenueCandidate[]; budget?: number; ai?: AiLike; stats?: StatsApi } = {}): TestApp {
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
  const stats = opts.stats;
  if (stats) appDeps.stats = () => stats;
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

export function req(h: TestApp, path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Response> {
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

export async function createVenue(h: TestApp): Promise<{ id: string; token: string; ownerUrl: string }> {
  const res = await req(h, "/api/venues", { method: "POST", body: CREATE_BODY });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { venue: Venue; ownerToken: string; ownerUrl: string };
  return { id: data.venue.id, token: data.ownerToken, ownerUrl: data.ownerUrl };
}

export async function planned(h: TestApp) {
  const v = await createVenue(h);
  const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: { maxPeople: 30 } });
  if (res.status !== 200) throw new Error(`plan failed ${res.status}`);
  return { ...v, plan: (await res.json()) as PlanResponse };
}

export async function published(h: TestApp, actions = ["event_page", "poster", "ics", "outreach"]) {
  const p = await planned(h);
  const res = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, {
    method: "POST",
    token: p.token,
    body: { actions, partnerEmails: { [PARTNERS[0]!.id]: "hi@kanal.example" } },
  });
  if (res.status !== 200) throw new Error(`approve failed ${res.status}`);
  return { ...p, night: (await res.json()) as Night };
}
