import type { APIRequestContext, Page } from "playwright/test";
import type { Night, NightPlan, PlanResponse, StreetRead, Venue, VenueCandidate } from "../../src/shared/contract.ts";

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
  const created = await ok<{ venue: Venue; ownerToken: string; ownerUrl: string }>(await api.post("/api/venues", { data: body }), "venue create");
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

export async function publishedNight(api: APIRequestContext, input: NewVenue): Promise<{ owner: Owner; night: Night }> {
  const owner = await createVenue(api, input);
  await readStreet(api, owner);
  const { plan } = await planNight(api, owner);
  const night = await approveNight(api, owner, plan, ["event_page", "poster", "ics", "gcal"]);
  return { owner, night };
}

export async function openAsOwner(page: Page, o: Owner, path = ""): Promise<void> {
  const url = new URL(o.ownerUrl);
  await page.goto(`/v/${o.venue.id}${path}${url.hash}`);
}
