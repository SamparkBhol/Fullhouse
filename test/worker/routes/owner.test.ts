import { describe, expect, it } from "vitest";
import type { Night, PlanResponse, StreetRead, Venue, VenueState } from "../../../src/shared/contract.ts";
import { fakeFetch } from "../helpers.ts";
import { createVenue, testApp, planned, published, req } from "../test_app.ts";

describe("owner routes", () => {
  it("need the right bearer token", async () => {
    const h = testApp();
    const v = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}`)).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}`, { token: "wrong" })).status).toBe(401);
    const other = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}`, { token: other.token })).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}`, { token: v.token })).status).toBe(200);
    expect((await req(h, `/api/venues/not-a-venue-id`, { token: v.token })).status).toBe(404);
  });

  it("read the street and plan a night with two alternatives and stored input", async () => {
    const h = testApp();
    const v = await createVenue(h);
    const read = await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    expect(read.status).toBe(200);
    expect(((await read.json()) as StreetRead).venueId).toBe(v.id);
    const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: { maxPeople: 30, preferFormats: ["film"] } });
    const plan = (await res.json()) as PlanResponse;
    expect(plan.alternatives).toHaveLength(2);
    expect(plan.input).toEqual({ maxPeople: 30, preferFormats: ["film"] });
    expect(plan.plan.copy.writtenBy).toBe("template");
  });

  it("returns qloo_key_missing for a read without the key", async () => {
    const h = testApp();
    const v = await createVenue(h);
    h.env.QLOO_API_KEY = "";
    h.deps.qloo = () => null;
    const res = await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "qloo_key_missing" });
  });

  it("allows three fresh reads per venue a day", async () => {
    const h = testApp();
    const v = await createVenue(h);
    for (let i = 0; i < 3; i++) expect((await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} })).status).toBe(200);
    const fourth = await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ error: "read_limit" });
  });

  it("refine maps a plain request onto the stored input", async () => {
    const h = testApp();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/refine`, { method: "POST", token: p.token, body: { planId: p.plan.plan.id, request: "make it Friday, no live music" } });
    expect(res.status).toBe(200);
    const out = (await res.json()) as PlanResponse;
    expect(out.refine?.method).toBe("keywords");
    expect(out.input).toMatchObject({ maxPeople: 30, weekday: 5, noLiveMusic: true });
    expect(out.plan.origin).toBe("refine");
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.proposals.map((x) => x.id)).not.toContain(p.plan.plan.id);
    expect(state.proposals.map((x) => x.id)).toContain(out.plan.id);
  });

  it("publishes the owner's edited words through the same gate as the model's", async () => {
    const h = testApp();
    const p = await planned(h);
    const url = `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`;
    const long = await req(h, url, { method: "POST", token: p.token, body: { actions: ["event_page"], copy: { eventTitle: "x".repeat(81) } } });
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: "copy_not_accepted" });
    const banned = await req(h, url, { method: "POST", token: p.token, body: { actions: ["event_page"], copy: { posterSub: `A ${"vib" + "rant"} night` } } });
    expect(banned.status).toBe(400);
    const ok = await req(h, url, { method: "POST", token: p.token, body: { actions: ["event_page"], copy: { eventTitle: "Records \u2014 coffee on Thursday" } } });
    const night = (await ok.json()) as Night;
    expect(night.copy).toMatchObject({ eventTitle: "Records, coffee on Thursday", editedByOwner: true });
    const page = await (await req(h, `/e/${night.eventSlug}`)).text();
    expect(page).toContain("Records, coffee on Thursday");
    expect(page).toContain("Description written by the venue.");
  });

  it("takes a published night down and puts it back up", async () => {
    const h = testApp();
    const p = await published(h);
    const down = await req(h, `/api/venues/${p.id}/nights/${p.night.id}/unpublish`, { method: "POST", token: p.token, body: {} });
    expect(((await down.json()) as Night).withdrawnAt).toBeTruthy();
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
    expect((await req(h, `/e/${p.night.eventSlug}.ics`)).status).toBe(404);
    expect((await req(h, `/api/venues/${p.id}/nights/${p.night.id}/republish`, { method: "POST", token: p.token, body: {} })).status).toBe(200);
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(200);
  });

  it("makes a new owner link that cuts off the old one", async () => {
    const h = testApp();
    const v = await createVenue(h);
    const res = await req(h, `/api/venues/${v.id}/owner-link`, { method: "POST", token: v.token, body: {} });
    const fresh = (await res.json()) as { ownerUrl: string; ownerToken: string };
    expect(fresh.ownerUrl).toContain(`#t=${fresh.ownerToken}`);
    expect((await req(h, `/api/venues/${v.id}`, { token: v.token })).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}`, { token: fresh.ownerToken })).status).toBe(200);
  });

  it("keeps a typed email pending until the code sent to it comes back, and never mails the owner link to it", async () => {
    const mail = fakeFetch(() => ({ body: { id: "m1" } }));
    const h = testApp({ deps: { resend: { key: "re_test", from: "Full House <hi@fullhouse.example>" }, fetch: mail } });
    const v = await createVenue(h);
    let state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.venue).toMatchObject({ pendingEmail: "owner@example.com" });
    expect(state.venue.ownerEmail).toBeUndefined();
    expect(mail.calls).toHaveLength(1);
    const sent = JSON.stringify(mail.calls[0]!.body);
    expect(sent).not.toContain(v.token);
    const code = /#c=([A-Za-z0-9_-]+)/.exec(sent)?.[1] ?? "";
    expect((await req(h, `/api/venues/${v.id}/email/confirm`, { method: "POST", token: v.token, body: { code: `${code}x` } })).status).toBe(400);
    const ok = await req(h, `/api/venues/${v.id}/email/confirm`, { method: "POST", token: v.token, body: { code } });
    expect(((await ok.json()) as Venue).ownerEmail).toBe("owner@example.com");
    state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.venue.pendingEmail).toBeUndefined();
  });

  it("approve runs the chosen actions once and returns the same night on a retry", async () => {
    const h = testApp();
    const p = await published(h);
    expect(p.night.status).toBe("approved");
    expect(p.night.eventSlug).toMatch(new RegExp(`-${p.id}-[a-km-np-z2-9]{5}$`));
    expect(p.night.actions.map((a) => a.kind)).toEqual(["event_page", "poster", "ics", "outreach", "outreach"]);
    const again = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, { method: "POST", token: p.token, body: { actions: ["event_page"] } });
    expect(((await again.json()) as Night).eventSlug).toBe(p.night.eventSlug);
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.nights).toHaveLength(1);
    expect(state.proposals.map((x) => x.id)).not.toContain(p.plan.plan.id);
  });

  it("rejects unknown actions", async () => {
    const h = testApp();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, { method: "POST", token: p.token, body: { actions: ["tweet"] } });
    expect(res.status).toBe(400);
  });

  it("logs turnout and keeps it off the public page", async () => {
    const h = testApp();
    const p = await published(h);
    const res = await req(h, `/api/venues/${p.id}/nights/${p.night.id}/result`, { method: "POST", token: p.token, body: { headcount: 4319, note: "Good crowd" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ headcount: 4319, status: "done", resultNote: "Good crowd" });
    const page = await (await req(h, `/e/${p.night.eventSlug}`)).text();
    expect(page).not.toContain("4319");
    expect(page).not.toContain("Good crowd");
  });

  it("stores the Eventbrite token encrypted and never returns it", async () => {
    const calls: string[] = [];
    const h = testApp({
      deps: {
        fetch: (async (url: RequestInfo | URL) => {
          calls.push(String(url));
          return new Response(JSON.stringify({ organizations: [{ id: "42", name: "Blue Hour Org" }] }), { status: 200 });
        }) as typeof fetch,
      },
    });
    const v = await createVenue(h);
    const res = await req(h, `/api/venues/${v.id}/eventbrite`, { method: "POST", token: v.token, body: { token: "EBPRIVATETOKEN42" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organization: "Blue Hour Org" });
    const raw = JSON.stringify([...h.stores.get(v.id)!.data.entries()]);
    expect(raw).not.toContain("EBPRIVATETOKEN42");
    const state = await (await req(h, `/api/venues/${v.id}`, { token: v.token })).text();
    expect(state).not.toContain("EBPRIVATETOKEN42");
    expect(state).toContain("Blue Hour Org");
    expect(calls).toEqual(["https://www.eventbriteapi.com/v3/users/me/organizations/"]);
    const off = await req(h, `/api/venues/${v.id}/eventbrite`, { method: "DELETE", token: v.token });
    expect(off.status).toBe(200);
    expect(JSON.stringify([...h.stores.get(v.id)!.data.entries()])).not.toContain("sealed");
  });

  it("baseline needs the AI binding", async () => {
    const h = testApp();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/baseline`, { method: "POST", token: p.token, body: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai_unavailable" });
  });

  it("baseline runs and is kept for the proof tab when AI is present", async () => {
    const ai = { run: async () => ({ response: "x" }) };
    const h = testApp({ ai, deps: { generate: async () => "x" } });
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/baseline`, { method: "POST", token: p.token, body: {} });
    expect(res.status).toBe(200);
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.baseline?.method).toBe("fake");
  });

  it("delete removes everything and the public page goes away", async () => {
    const h = testApp();
    const p = await published(h);
    expect((await req(h, `/api/venues/${p.id}`, { method: "DELETE", token: p.token })).status).toBe(200);
    expect(h.stores.get(p.id)!.data.size).toBe(0);
    expect(h.stores.get(p.id)!.alarm).toBeNull();
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
  });
});
