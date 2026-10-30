import { describe, expect, it } from "vitest";
import type { Invite, JointExample, Match, Night, NightPlan, PlanResponse, VenueState } from "../../../src/shared/contract.ts";
import type { StatEvent } from "../../../src/worker/stats/events.ts";
import type { ProposalRecord } from "../../../src/worker/venue/records.ts";
import { fakeCore, fakeMatch } from "../helpers.ts";
import { ORIGIN, createVenue, req, testApp, type TestApp } from "../test_app.ts";

function jointApp(env: Record<string, string> = {}) {
  const events: StatEvent[] = [];
  const log = { reads: [], plans: [], copies: 0 };
  const h = testApp({ deps: { core: fakeCore(log, { joint: true }), stats: { add: (e) => events.push(e), atEnd: () => undefined } }, env });
  return { h, events, log: log as ReturnType<typeof fakeCore>["log"] };
}

async function jointPlan(h: TestApp) {
  const v = await createVenue(h);
  const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: {} });
  expect(res.status).toBe(200);
  return { ...v, plan: ((await res.json()) as PlanResponse).plan };
}

async function invite(h: TestApp, v: { id: string; token: string }, planId: string, partnerId = "P-1"): Promise<Response> {
  return req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId } });
}

async function publish(h: TestApp, v: { id: string; token: string }, planId: string): Promise<Night> {
  const res = await req(h, `/api/venues/${v.id}/nights/${planId}/approve`, { method: "POST", token: v.token, body: { actions: ["event_page", "poster", "ics"] } });
  expect(res.status).toBe(200);
  return (await res.json()) as Night;
}

const say = (h: TestApp, slug: string, answer: string, headers: Record<string, string> = {}) =>
  req(h, `/i/${slug}/answer`, { method: "POST", body: `answer=${answer}`, headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, ...headers } });

describe("the match route", () => {
  it("returns the read's match, and switches to a runner up only when asked", async () => {
    const { h, log } = jointApp();
    const v = await createVenue(h);
    await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    const first = (await (await req(h, `/api/venues/${v.id}/match`, { method: "POST", token: v.token, body: {} })).json()) as Match;
    expect(first.partner.name).toBe("Kaffee Kanal");
    expect(first.runnersUp).toHaveLength(2);
    expect(log.matches ?? []).toEqual([]);
    const swapped = (await (await req(h, `/api/venues/${v.id}/match`, { method: "POST", token: v.token, body: { partnerId: "P-3" } })).json()) as Match;
    expect(swapped.partner.name).toBe("Kino am Kanal");
    expect(((await (await req(h, `/api/venues/${v.id}/match`, { method: "POST", token: v.token, body: {} })).json()) as Match).partner.name).toBe("Kino am Kanal");
    const plan = (await (await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: {} })).json()) as PlanResponse;
    expect(plan.plan.match?.partner.name).toBe("Kino am Kanal");
    expect((await req(h, `/api/venues/${v.id}/match`, { method: "POST", token: v.token, body: { partnerId: "NOT-NEAR" } })).status).toBe(404);
  });

  it("needs a read first", async () => {
    const { h } = jointApp();
    const v = await createVenue(h);
    const res = await req(h, `/api/venues/${v.id}/match`, { method: "POST", token: v.token, body: {} });
    expect(res.status).toBe(409);
  });
});

describe("the plan route with a match", () => {
  it("builds the joint night and keeps the joint read, so a new day asks Qloo nothing", async () => {
    const { h, log } = jointApp();
    const p = await jointPlan(h);
    expect(p.plan.match).toMatchObject({ partner: { name: "Kaffee Kanal" }, split: { venue: 52, partner: 48 } });
    await req(h, `/api/venues/${p.id}/plan`, { method: "POST", token: p.token, body: { weekday: 2 } });
    expect(log.joints).toEqual(["P-1"]);
  });
});

describe("invites", () => {
  it("are created once per partner and plan, polled by the owner, and counted", async () => {
    const { h, events } = jointApp();
    const p = await jointPlan(h);
    const res = await invite(h, p, p.plan.id);
    expect(res.status).toBe(200);
    const inv = (await res.json()) as Invite;
    expect(inv).toMatchObject({ planId: p.plan.id, status: "waiting", partner: { id: "P-1", name: "Kaffee Kanal" } });
    expect(inv.url).toBe(`${ORIGIN}/i/${inv.slug}`);
    expect(((await (await invite(h, p, p.plan.id)).json()) as Invite).id).toBe(inv.id);
    expect((await invite(h, p, p.plan.id, "SOMEONE-ELSE")).status).toBe(404);
    const polled = (await (await req(h, `/api/venues/${p.id}/invites`, { token: p.token })).json()) as Invite[];
    expect(polled.map((i) => i.status)).toEqual(["waiting"]);
    expect((await req(h, `/api/venues/${p.id}/invites`)).status).toBe(401);
    expect(events.filter((e) => e.kind === "invite_sent")).toHaveLength(1);
  });

  it("show the two places, the night, the split, what both crowds share and the two answers", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    const page = await req(h, `/i/${inv.slug}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("x-robots-tag")).toContain("noindex");
    const html = await page.text();
    expect(html).toContain("Blue Hour Records would like to put on one night with Kaffee Kanal");
    expect(html).toContain("Blue Hour Records crowd 52, Kaffee Kanal crowd 48");
    expect(html).toContain('width="52"');
    expect(html).toContain("What both places share");
    expect(html).toContain("A pattern across many people, not a fact about anyone.");
    expect(html).toContain("We're in");
    expect(html).toContain("Not this time");
    expect((await req(h, `/i/${inv.slug.slice(0, -1)}x`)).status).toBe(404);
  });

  it("take one answer, from the invite page only, and flip the owner's poll", async () => {
    const { h, events } = jointApp();
    const p = await jointPlan(h);
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    expect((await say(h, inv.slug, "yes", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await say(h, inv.slug, "maybe")).status).toBe(303);
    const yes = await say(h, inv.slug, "yes");
    expect(yes.status).toBe(303);
    expect(yes.headers.get("location")).toBe(`/i/${inv.slug}#answer`);
    const again = await say(h, inv.slug, "no", { accept: "application/json" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "already_answered" });
    expect(await (await req(h, `/i/${inv.slug}`)).text()).toContain("You are in.");
    const polled = (await (await req(h, `/api/venues/${p.id}/invites`, { token: p.token })).json()) as Invite[];
    expect(polled[0]).toMatchObject({ status: "accepted" });
    expect(polled[0]?.answeredAt).toBeDefined();
    expect(events.filter((e) => e.kind === "invite_answered")).toEqual([{ kind: "invite_answered", venueId: p.id, answer: "yes" }]);
  });

  it("say not this time without naming anyone", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    const no = await say(h, inv.slug, "no", { accept: "application/json" });
    expect(await no.json()).toMatchObject({ status: "declined" });
    expect(await (await req(h, `/i/${inv.slug}`)).text()).toContain("You said not this time.");
  });
});

describe("consent", () => {
  it("keeps the partner off the event page, poster and calendar until it says yes, and the owner sees it is waiting", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    const night = await publish(h, p, p.plan.id);
    expect(night.invites?.map((i) => i.status)).toEqual(["waiting"]);
    expect(night.actions.find((a) => a.kind === "event_page")?.detail).toContain("Kaffee Kanal is not named on it until they say yes.");
    const slug = night.eventSlug!;
    for (const path of [`/e/${slug}`, `/e/${slug}/poster`, `/e/${slug}.ics`]) expect(await (await req(h, path)).text(), path).not.toContain("Kaffee Kanal");
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.nights[0]?.invites?.[0]).toMatchObject({ status: "waiting", partner: { name: "Kaffee Kanal" } });

    await say(h, inv.slug, "yes&what=Our+late+coffee&start=20%3A15");
    const page = await (await req(h, `/e/${slug}`)).text();
    expect(page).toContain("Put on with Kaffee Kanal");
    expect(page).toContain("people who like Blue Hour Records and people who like Kaffee Kanal");
    expect(await (await req(h, `/e/${slug}/poster`)).text()).toContain("With Kaffee Kanal");
    expect((await (await req(h, `/e/${slug}.ics`)).text()).replace(/\r\n /g, "")).toContain("Put on by Blue Hour Records and Kaffee Kanal.");
  });

  it("holds back a night at the partner's place until the partner has said yes", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    const store = h.stores.get(p.id)!;
    const records = (await store.get<ProposalRecord[]>("proposals"))!;
    const atPartner: NightPlan = { ...records[0]!.plan, match: { ...records[0]!.plan.match!, host: "partner" } };
    await store.put("proposals", [{ ...records[0]!, plan: atPartner }, ...records.slice(1)]);
    const held = await req(h, `/api/venues/${p.id}/nights/${p.plan.id}/approve`, { method: "POST", token: p.token, body: { actions: ["event_page"] } });
    expect(held.status).toBe(409);
    expect(await held.json()).toMatchObject({ error: "waiting_for_partner" });
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    await say(h, inv.slug, "yes");
    const night = await publish(h, p, p.plan.id);
    expect(await (await req(h, `/e/${night.eventSlug}`)).text()).toContain("Kaffee Kanal");
  });
});

describe("the example route", () => {
  it("answers 404 when no example venue is set or it has no joint night", async () => {
    const { h } = jointApp();
    expect((await req(h, "/api/example")).status).toBe(404);
    const v = await createVenue(h);
    h.env.EXAMPLE_VENUE = v.id;
    expect((await req(h, "/api/example")).status).toBe(404);
  });

  it("gives the two places, minutes apart, the night, the split and up to three shared tags, and nothing about the owner", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    h.env.EXAMPLE_VENUE = p.id;
    const res = await req(h, "/api/example");
    expect(res.status).toBe(200);
    const ex = (await res.json()) as JointExample;
    expect(ex).toMatchObject({ venue: { name: "Blue Hour Records" }, partner: { name: "Kaffee Kanal" }, minutes: 3, distanceM: 180, split: { venue: 52, partner: 48 }, shared: ["Jazz"], agreed: false });
    expect(ex.title).toBe(p.plan.copy.eventTitle);
    expect(JSON.stringify(ex)).not.toMatch(/owner|example\.com|token/i);
    const inv = (await (await invite(h, p, p.plan.id)).json()) as Invite;
    await say(h, inv.slug, "yes");
    expect(((await (await req(h, "/api/example")).json()) as JointExample).agreed).toBe(true);
  });
  it("carries the partner's rank on the venue's list and the venue's rank on the partner's, without the partner's list", async () => {
    const { h } = jointApp();
    const p = await jointPlan(h);
    h.env.EXAMPLE_VENUE = p.id;
    const match = fakeMatch(p.plan.readAt);
    const top = [{ id: "T-1", name: "Village East by Angelika", rank: 1 }];
    const partner = { ...match.partner, rank: 2, reverseRank: { checked: true, rank: 6, of: 50, top } };
    const considered = [{ id: partner.id, name: partner.name, kind: "cafe", rank: 2, walkMin: 3, verdict: "partner" as const, reason: "The best fit." }];
    await h.stores.get(p.id)!.put("match", { ...match, partner, considered, consideredOf: 50 });
    const ex = (await (await req(h, "/api/example")).json()) as JointExample;
    expect(ex.partnerRank).toBe(2);
    expect(ex.back).toEqual({ checked: true, rank: 6, of: 50 });
    expect(ex.consideredOf).toBe(50);
  });
});
