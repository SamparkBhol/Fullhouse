import { describe, expect, it } from "vitest";
import type { Invite, PlanResponse, VenueCandidate } from "../../../src/shared/contract.ts";
import { CANDIDATE, fakeCore } from "../helpers.ts";
import { CREATE_BODY, ORIGIN, createVenue, req, testApp, type TestApp } from "../test_app.ts";

const place = (id: string, name: string): VenueCandidate => ({ ...CANDIDATE, id, name });
const KANAL = place("P-1", "Kaffee Kanal");
const INK = place("P-2", "Paper & Ink Books");

function app(): TestApp {
  return testApp({ deps: { core: fakeCore({ reads: [], plans: [], copies: 0 }, { joint: true }) }, candidates: [CANDIDATE, KANAL, INK] });
}

async function asked(h: TestApp): Promise<{ v: { id: string; token: string }; invite: Invite }> {
  const v = await createVenue(h);
  const plan = ((await (await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: {} })).json()) as PlanResponse).plan;
  const invite = (await (await req(h, `/api/venues/${v.id}/nights/${plan.id}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
  return { v, invite };
}

const yes = (h: TestApp, slug: string) => req(h, `/i/${slug}/answer`, { method: "POST", body: "answer=yes", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN } });

const setUp = (h: TestApp, c: VenueCandidate, via: string) =>
  req(h, "/api/venues", { method: "POST", body: { ...CREATE_BODY, candidate: { id: c.id, name: c.name }, via } });

async function theInvite(h: TestApp, v: { id: string; token: string }): Promise<Invite> {
  return ((await (await req(h, `/api/venues/${v.id}/invites`, { token: v.token })).json()) as Invite[])[0]!;
}

describe("each invite brings the next venue", () => {
  it("an accepted invite records the partner's own setup, only for that place", async () => {
    const h = app();
    const { v, invite } = await asked(h);
    expect((await setUp(h, KANAL, invite.slug)).status).toBe(201);
    expect((await theInvite(h, v)).joinedAt).toBeUndefined();
    await yes(h, invite.slug);
    expect((await setUp(h, INK, invite.slug)).status).toBe(201);
    expect((await theInvite(h, v)).joinedAt).toBeUndefined();
    expect((await setUp(h, KANAL, invite.slug)).status).toBe(201);
    const first = (await theInvite(h, v)).joinedAt;
    expect(first).toEqual(expect.any(String));
    await setUp(h, KANAL, invite.slug);
    expect((await theInvite(h, v)).joinedAt).toBe(first);
  });

  it("a create with an unknown via still creates the venue", async () => {
    const h = app();
    const before = h.venues.size;
    for (const via of ["night-abcdefghijklmnopqrstuv-abcdefghijkm", "nothing-like-a-slug"]) {
      const res = await setUp(h, KANAL, via);
      expect(res.status).toBe(201);
    }
    expect(h.venues.size).toBeGreaterThan(before);
    expect((await setUp(h, KANAL, "Not A Slug!")).status).toBe(400);
  });

  it("puts the link to find the partner's own neighbour on its page only after its yes", async () => {
    const h = app();
    const { invite } = await asked(h);
    expect(await (await req(h, `/i/${invite.slug}`)).text()).not.toContain("/start?");
    await yes(h, invite.slug);
    const page = await (await req(h, `/i/${invite.slug}`)).text();
    expect(page).toContain(`href="/start?name=Kaffee%20Kanal&amp;city=Berlin&amp;via=${invite.slug}"`);
    expect(page).toContain(">Find Kaffee Kanal&#39;s own neighbour</a>");
  });
});
