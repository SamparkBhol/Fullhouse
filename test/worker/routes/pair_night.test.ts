import { describe, expect, it } from "vitest";
import type { Invite, Night, PlanResponse, RunProgress, VenueState } from "../../../src/shared/contract.ts";
import type { CoreFns } from "../../../src/worker/venue/api.ts";
import { fakeCore } from "../helpers.ts";
import { ORIGIN, createVenue, req, testApp, type TestApp } from "../test_app.ts";

// The fake core's joint plan, made a two stop night: a quiz at the venue, then a round at Kaffee Kanal.
function pairCore(): CoreFns {
  const base = fakeCore({ reads: [], plans: [], copies: 0 }, { joint: true });
  return {
    ...base,
    planJoint(read, joint, venue, match, input, now, origin, newId) {
      const r = base.planJoint(read, joint, venue, match, input, now, origin, newId);
      const stops = [
        { at: "venue" as const, placeId: venue.entity.id, name: venue.entity.name, start: "19:00", end: "20:00", what: "Quiz round one, on Master of None", walkMin: 3 },
        { at: "partner" as const, placeId: match.partner.id, name: match.partner.name, start: "20:15", end: "22:00", what: "Quiz round two, on The Farewell" },
      ];
      return { ...r, plan: { ...r.plan, pair: { format: "quiz_crawl", label: "quiz crawl", stops, picks: [], why: "Neither place screens or sells books, so the night is a quiz in two rounds, one at each place." } } };
    },
  };
}

async function setup(): Promise<{ h: TestApp; v: { id: string; token: string }; planId: string }> {
  const h = testApp({ deps: { core: pairCore() } });
  const v = await createVenue(h);
  const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: {} });
  return { h, v, planId: ((await res.json()) as PlanResponse).plan.id };
}

const publish = (h: TestApp, v: { id: string; token: string }, planId: string) =>
  req(h, `/api/venues/${v.id}/nights/${planId}/approve`, { method: "POST", token: v.token, body: { actions: ["event_page", "poster", "ics"] } });

async function askAndSayYes(h: TestApp, v: { id: string; token: string }, planId: string): Promise<Invite> {
  const inv = (await (await req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
  await req(h, `/i/${inv.slug}/answer`, { method: "POST", body: "answer=yes", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN } });
  return inv;
}

describe("a two stop night", () => {
  it("cannot go up before the partner says yes, because it names them", async () => {
    const { h, v, planId } = await setup();
    const early = await publish(h, v, planId);
    expect(early.status).toBe(409);
    expect(((await early.json()) as { detail: string }).detail).toMatch(/runs at .* and Kaffee Kanal, so it goes up once Kaffee Kanal says yes on its invite\.$/);
    await askAndSayYes(h, v, planId);
    expect((await publish(h, v, planId)).status).toBe(200);
  });

  it("shows the partner both stops and why their place, read from their side, with its own stop as a question", async () => {
    const { h, v, planId } = await setup();
    const inv = (await (await req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
    expect(inv.slug).toMatch(/^night-/);
    const html = await (await req(h, `/i/${inv.slug}`)).text();
    expect(html).toContain("Quiz round one, on Master of None");
    expect(html).toContain("Then about 3 minutes on foot to Kaffee Kanal");
    expect(html).toContain("Why your place");
    expect(html).toContain('name="what" maxlength="120" value="Quiz round two, on The Farewell"');
    expect(html).toContain('name="start" value="20:15"');
    expect(html).toContain('name="tellsRegulars" value="on">');
    expect(html).not.toContain("checked");
  });

  it("says the partner accepted the proposed stop when the yes sends it back untouched, and makes no regulars claim unticked", async () => {
    const { h, v, planId } = await setup();
    const inv = (await (await req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
    await req(h, `/i/${inv.slug}/answer`, {
      method: "POST",
      body: "answer=yes&what=Quiz+round+two%2C+on+The+Farewell&start=20%3A15",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    });
    const polled = (await (await req(h, `/api/venues/${v.id}/invites`, { token: v.token })).json()) as Invite[];
    expect(polled[0]?.confirmed).toMatchObject({ kept: true, tellsRegulars: false });
    const night = (await (await publish(h, v, planId)).json()) as Night;
    const page = await (await req(h, `/e/${night.eventSlug}`)).text();
    expect(page).toContain("Kaffee Kanal answered through an invite link and accepted the proposed quiz round two, on The Farewell from 20:15.");
    expect(page).not.toContain("set its own part");
    expect(page).not.toContain("tells its regulars");
  });

  it("says the partner set its own part when only the start changed", async () => {
    const { h, v, planId } = await setup();
    const inv = (await (await req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
    await req(h, `/i/${inv.slug}/answer`, {
      method: "POST",
      body: "answer=yes&what=Quiz+round+two%2C+on+The+Farewell&start=20%3A45&tellsRegulars=on",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    });
    const night = (await (await publish(h, v, planId)).json()) as Night;
    const page = await (await req(h, `/e/${night.eventSlug}`)).text();
    expect(page).toContain("Kaffee Kanal answered through an invite link and set its own part, quiz round two, on The Farewell from 20:45. It tells its regulars too.");
    expect(page).not.toContain("accepted the proposed");
  });

  it("takes the partner's own time and words with its yes, rewrites the stop, and the event page says so", async () => {
    const { h, v, planId } = await setup();
    const inv = (await (await req(h, `/api/venues/${v.id}/nights/${planId}/invite`, { method: "POST", token: v.token, body: { partnerId: "P-1" } })).json()) as Invite;
    const yes = await req(h, `/i/${inv.slug}/answer`, {
      method: "POST",
      body: "answer=yes&what=Our+open+mic%2C+as+every+Tuesday&start=20%3A30&tellsRegulars=on&contact=0151+000+0000",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    });
    expect(yes.status).toBe(303);
    const polled = (await (await req(h, `/api/venues/${v.id}/invites`, { token: v.token })).json()) as Invite[];
    expect(polled[0]?.confirmed).toMatchObject({ start: "20:30", what: "Our open mic, as every Tuesday", tellsRegulars: true, contact: "0151 000 0000" });
    const state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    const stop = state.proposals.find((p) => p.id === planId)?.pair?.stops.find((s) => s.at === "partner");
    expect(stop).toMatchObject({ start: "20:30", end: "22:15", what: "Our open mic, as every Tuesday" });
    const night = (await (await publish(h, v, planId)).json()) as Night;
    const page = await (await req(h, `/e/${night.eventSlug}`)).text();
    expect(page).toContain("Our open mic, as every Tuesday");
    expect(page).toContain("Kaffee Kanal answered through an invite link and set its own part, our open mic, as every Tuesday from 20:30. It tells its regulars too.");
    expect(polled[0]?.confirmed?.kept).toBe(false);
    expect(page).not.toContain("0151 000 0000");
    expect(page).not.toContain("Proposed, subject to");
    const poster = await (await req(h, `/e/${night.eventSlug}/poster`)).text();
    expect(poster).toContain("With Kaffee Kanal");
    expect(poster).toContain(`/e/${night.shortSlug}`);
    expect((await req(h, `/e/${night.shortSlug}`)).status).toBe(200);
  });

  it("marks a stop as proposed when the yes came with nothing typed, and keeps the partner off the poster", async () => {
    const { h, v, planId } = await setup();
    await askAndSayYes(h, v, planId);
    const night = (await (await publish(h, v, planId)).json()) as Night;
    const page = await (await req(h, `/e/${night.eventSlug}`)).text();
    expect(page).toContain("Proposed, subject to Kaffee Kanal&#39;s programme");
    expect(page).toContain("answered through an invite link");
    expect(page).not.toContain("tells its regulars");
    expect(await (await req(h, `/e/${night.eventSlug}/poster`)).text()).not.toContain("Kaffee Kanal");
  });

  it("gives each place its own link, counts RSVPs by link, and shows the partner its own link after its yes", async () => {
    const { h, v, planId } = await setup();
    const inv = await askAndSayYes(h, v, planId);
    const night = (await (await publish(h, v, planId)).json()) as Night;
    expect(night.ledger).toEqual({ fromVenue: 0, fromPartner: 0, direct: 0 });
    const theirs = night.shareLinks?.partner ?? "";
    // The code is random, so a link names no place before anyone taps it.
    expect(theirs).toMatch(/\?via=[a-km-np-z2-9]{8}$/);
    expect(theirs).not.toContain("kaffee");
    const code = new URL(theirs).searchParams.get("via") ?? "";
    expect(night.via).toEqual({ venue: expect.stringMatching(/^[a-km-np-z2-9]{8}$/), partner: code });
    const page = await (await req(h, new URL(theirs).pathname + new URL(theirs).search)).text();
    expect(page).toContain(`/e/${night.eventSlug}/rsvp?via=${code}`);
    expect(page).toContain("Kaffee Kanal");
    for (const ip of ["203.0.113.1", "203.0.113.2"]) {
      await req(h, `/e/${night.eventSlug}/rsvp?via=${code}`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json", "cf-connecting-ip": ip } });
    }
    await req(h, `/e/${night.eventSlug}/rsvp?via=nobody`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json", "cf-connecting-ip": "203.0.113.3" } });
    const state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.nights.find((n) => n.id === night.id)?.ledger).toEqual({ fromVenue: 0, fromPartner: 2, direct: 1 });
    expect(state.ledgers).toEqual([{ partnerId: "P-1", partnerName: "Kaffee Kanal", nights: 1, sent: 0, received: 2 }]);
    const invitePage = await (await req(h, `/i/${inv.slug}`)).text();
    expect(invitePage).toContain(theirs);
    expect(invitePage).not.toContain("through your link");
  });

  it("reports which Qloo calls have finished for the screens to tick", async () => {
    const { h, v } = await setup();
    const res = await req(h, `/api/venues/${v.id}/progress`, { token: v.token });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RunProgress).done).toEqual([]);
    expect((await req(h, `/api/venues/${v.id}/progress`)).status).toBe(401);
  });
});
