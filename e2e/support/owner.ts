import type { APIRequestContext, Page } from "playwright/test";
import type { Invite, Night, NightPlan, PlanResponse, StreetRead, Venue, VenueCandidate } from "../../src/shared/contract.ts";
import { BASE_URL } from "./env.ts";

export interface Owner {
  venue: Venue;
  token: string;
  ownerUrl: string;
}

export interface NewVenue {
  name: string;
  city: string;
  ownerEmail?: string;
  weekday?: Venue["quietSlot"]["weekday"];
  tz?: string;
}

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} answered ${res.status()}: ${await res.text()}`);
  return (await res.json()) as T;
}

function auth(o: Owner): Record<string, string> {
  return { authorization: `Bearer ${o.token}` };
}

export async function searchVenues(api: APIRequestContext, name: string, city: string): Promise<VenueCandidate[]> {
  return ok(await api.post("/api/venues/search", { data: { name, city } }), "venue search");
}

// Each venue is set up from its own address in the documentation range, so the suite never trips the daily
// limit on creations from one address that guards the live site.
function testAddress(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 250;
  return `203.0.113.${h + 1}`;
}

// The spec under test drives the screens; this sets up the venue a screen needs through the same public API.
export async function createVenue(api: APIRequestContext, input: NewVenue): Promise<Owner> {
  const [candidate] = await searchVenues(api, input.name, input.city);
  if (!candidate) throw new Error(`no candidate for ${input.name} in ${input.city}`);
  const body = {
    candidate,
    city: input.city,
    tz: input.tz ?? "Europe/London",
    quietSlot: { weekday: input.weekday ?? 2, start: "19:00", durationMin: 180 },
    capacity: 40,
    ...(input.ownerEmail ? { ownerEmail: input.ownerEmail } : {}),
  };
  const created = await ok<{ venue: Venue; ownerToken: string; ownerUrl: string }>(
    await api.post("/api/venues", { data: body, headers: { "cf-connecting-ip": testAddress(input.name) } }),
    "venue create",
  );
  return { venue: created.venue, token: created.ownerToken, ownerUrl: created.ownerUrl };
}

export async function readStreet(api: APIRequestContext, o: Owner): Promise<StreetRead> {
  return ok(await api.post(`/api/venues/${o.venue.id}/read`, { headers: auth(o), data: {} }), "street read");
}

export async function planNight(api: APIRequestContext, o: Owner): Promise<PlanResponse> {
  return ok(await api.post(`/api/venues/${o.venue.id}/plan`, { headers: auth(o), data: {} }), "plan");
}

export async function approveNight(api: APIRequestContext, o: Owner, plan: NightPlan, actions: string[]): Promise<Night> {
  return ok(await api.post(`/api/venues/${o.venue.id}/nights/${plan.id}/approve`, { headers: auth(o), data: { actions } }), "approve");
}

// A two stop night names the neighbour, so it goes up only after the neighbour says yes on its invite page.
// The neighbour confirms its own stop as planned, the way the invite form sends it.
export async function neighbourSaysYes(api: APIRequestContext, o: Owner, plan: NightPlan): Promise<Invite | null> {
  const partner = plan.match?.partner;
  if (!partner || !plan.pair) return null;
  const invite = await ok<Invite>(await api.post(`/api/venues/${o.venue.id}/nights/${plan.id}/invite`, { headers: auth(o), data: { partnerId: partner.id } }), "invite");
  const stop = plan.pair.stops.find((s) => s.at === "partner");
  const form = { answer: "yes", what: stop?.what ?? "", start: stop?.start ?? "", tellsRegulars: "on" };
  const res = await api.post(`/i/${invite.slug}/answer`, { form, headers: { origin: new URL(BASE_URL).origin, accept: "application/json" } });
  if (!res.ok()) throw new Error(`invite answer answered ${res.status()}: ${await res.text()}`);
  return invite;
}

// The same yes for a plan the spec only knows by its id, such as one refined on screen.
export async function neighbourSaysYesTo(api: APIRequestContext, o: Owner, planId: string): Promise<Invite | null> {
  const state = await ok<{ proposals: NightPlan[] }>(await api.get(`/api/venues/${o.venue.id}`, { headers: auth(o) }), "venue state");
  const plan = state.proposals.find((p) => p.id === planId);
  return plan ? neighbourSaysYes(api, o, plan) : null;
}

export async function publishedNight(api: APIRequestContext, input: NewVenue): Promise<{ owner: Owner; night: Night; invite: Invite | null }> {
  const owner = await createVenue(api, input);
  await readStreet(api, owner);
  const { plan } = await planNight(api, owner);
  const invite = await neighbourSaysYes(api, owner, plan);
  const night = await approveNight(api, owner, plan, ["event_page", "poster", "ics", "gcal"]);
  return { owner, night, invite };
}

export async function openAsOwner(page: Page, o: Owner, path = ""): Promise<void> {
  const url = new URL(o.ownerUrl);
  await page.goto(`/v/${o.venue.id}${path}${url.hash}`);
}
