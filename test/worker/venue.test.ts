import { describe, expect, it } from "vitest";
import type { CreateVenueInput, Night } from "../../src/shared/contract.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import { VenueCore } from "../../src/worker/venue/core.ts";
import { mondayInput } from "../../src/worker/venue/monday.ts";
import { CANDIDATE, fakeCore, fakeFetch, type FakeCoreLog, venueDeps } from "./helpers.ts";

const INPUT: CreateVenueInput = {
  candidate: CANDIDATE,
  city: "Berlin",
  tz: "Europe/Berlin",
  quietSlot: { weekday: 4, start: "19:00", durationMin: 180 },
  capacity: 40,
  ownerEmail: "owner@example.com",
};

function setup(over: Parameters<typeof venueDeps>[0] = {}) {
  const store = new MemoryStore();
  const log: FakeCoreLog = { reads: [], plans: [], copies: 0 };
  const deps = venueDeps({ core: fakeCore(log), ...over });
  return { store, log, deps, venue: new VenueCore(store, deps) };
}

describe("VenueAgent core", () => {
  it("sets the Monday alarm when the venue is created and refuses a second setup", async () => {
    const { venue, store } = setup();
    expect((await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example")).ok).toBe(true);
    expect(store.alarm).toBe(new Date("2026-10-28T10:00:00.000Z").getTime());
    const again = await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    expect(again).toMatchObject({ ok: false, status: 409 });
  });

  it("runs a full read on plan when there is no read yet, then reuses it", async () => {
    const { venue, log } = setup();
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    await venue.plan({});
    await venue.plan({ maxPeople: 20 });
    expect(log.reads).toHaveLength(1);
    expect(log.plans.map((p) => p.origin)).toEqual(["owner", "owner"]);
  });

  it("the Monday run rereads against last week's read, plans the quiet slot, emails the owner and re-arms, without publishing", async () => {
    const mail = fakeFetch(() => ({ body: { id: "m1" } }));
    const { venue, store, log } = setup({ fetch: mail, resend: { key: "re_x", from: "Full House <a@b.example>" } });
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    await venue.read();
    const out = await venue.monday();
    expect(out).toMatchObject({ ok: true, value: { planned: true, emailed: true } });
    expect(log.reads.at(-1)).toEqual({ venueId: "abcdefghijkm", hadPrevious: true });
    expect(log.plans.at(-1)).toMatchObject({ origin: "monday", input: { weekday: 4, start: "19:00", durationMin: 180, maxPeople: 40 } });
    expect(store.alarm).toBeGreaterThan(new Date("2026-10-25T10:00:00Z").getTime());
    const state = await venue.state();
    if (!state.ok) throw new Error("state failed");
    expect(state.value.nights).toHaveLength(0);
    expect(state.value.proposals[0]?.origin).toBe("monday");
    expect(mail.calls).toHaveLength(1);
    expect((mail.calls[0]!.body as { to: string[] }).to).toEqual(["owner@example.com"]);
    expect((mail.calls[0]!.body as { text: string }).text).toContain("https://x.example/v/abcdefghijkm#t=");
    expect((mail.calls[0]!.body as { text: string }).text).toContain("Nothing is published until you approve it.");
  });

  it("the Monday run still re-arms when Qloo is unavailable", async () => {
    const { venue, store, deps } = setup();
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    store.alarm = null;
    deps.qloo = () => null;
    const out = await venue.monday();
    expect(out).toMatchObject({ ok: true, value: { planned: false, emailed: false } });
    expect(store.alarm).not.toBeNull();
  });

  it("the Monday run re-arms even when the read throws", async () => {
    const { venue, store, deps } = setup();
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    store.alarm = null;
    deps.core.readStreet = async () => {
      throw Object.assign(new Error("budget"), { kind: "budget", status: 0 });
    };
    const out = await venue.monday();
    expect(out).toMatchObject({ ok: true, value: { planned: false } });
    expect(store.alarm).not.toBeNull();
  });

  it("maps a spent Qloo budget to a clear 503", async () => {
    const { venue, deps } = setup();
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    deps.core.readStreet = async () => {
      throw Object.assign(new Error("budget"), { kind: "budget", status: 0 });
    };
    expect(await venue.read()).toMatchObject({ ok: false, status: 503, error: "qloo_budget_spent" });
  });

  it("keeps template copy when the model copy step throws", async () => {
    const { venue, deps } = setup({ generate: async () => "x" });
    deps.core.writeCopy = async () => {
      throw new Error("model down");
    };
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    const out = await venue.plan({});
    expect(out.ok && out.value.plan.copy.writtenBy).toBe("template");
  });

  it("creates the Eventbrite event with the decrypted token on approval", async () => {
    const f = fakeFetch((c) => {
      if (c.url.endsWith("/users/me/organizations/")) return { body: { organizations: [{ id: "ORG", name: "Blue Hour" }] } };
      if (c.url.endsWith("/venues/")) return { body: { id: "V1" } };
      if (c.url.endsWith("/events/")) return { body: { id: "E1", url: "https://www.eventbrite.com/e/E1" } };
      if (c.url.endsWith("/ticket_classes/")) return { body: { id: "T1" } };
      return { body: { published: true } };
    });
    const { venue } = setup({ fetch: f });
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    expect(await venue.connectEventbrite("EB_TOKEN_1")).toEqual({ ok: true, value: { organization: "Blue Hour" } });
    const plan = await venue.plan({ maxPeople: 25 });
    if (!plan.ok) throw new Error("plan failed");
    const night = await venue.approve(plan.value.plan.id, { actions: ["event_page", "eventbrite"] }, "https://x.example");
    if (!night.ok) throw new Error("approve failed");
    const eb = night.value.actions.find((a) => a.kind === "eventbrite");
    expect(eb).toMatchObject({ ok: true, url: "https://www.eventbrite.com/e/E1" });
    const create = f.calls.find((c) => c.url.endsWith("/organizations/ORG/events/"))!;
    expect(create.headers["authorization"]).toBe("Bearer EB_TOKEN_1");
    const desc = (create.body as { event: { description: { html: string }; capacity: number } }).event;
    expect(desc.capacity).toBe(25);
    expect(desc.description.html).toContain("https://x.example/e/");
  });

  it("does not count RSVPs for a night that has passed", async () => {
    const { venue, deps } = setup();
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    const plan = await venue.plan({});
    if (!plan.ok) throw new Error("plan failed");
    const night = await venue.approve(plan.value.plan.id, { actions: ["event_page"] }, "https://x.example");
    if (!night.ok) throw new Error("approve failed");
    deps.now = () => new Date("2026-11-07T10:00:00Z");
    expect(await venue.rsvp(night.value.eventSlug!, "browser1")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("mondayInput", () => {
  const venue = {
    id: "abcdefghijkm",
    entity: CANDIDATE,
    city: "Berlin",
    tz: "Europe/Berlin",
    quietSlot: { weekday: 2 as const, start: "18:30", durationMin: 120 },
    capacity: 50,
    noLiveMusic: true,
    createdAt: "",
  };

  it("uses the quiet slot, capacity and the no live music rule", () => {
    expect(mondayInput(venue, [])).toEqual({ weekday: 2, start: "18:30", durationMin: 120, maxPeople: 50, noLiveMusic: true });
  });

  it("steps away from a format whose last night drew under 40 percent of capacity", () => {
    const nights = [
      { status: "done", headcount: 12, format: "quiz", date: "2026-10-20", start: "18:30" },
      { status: "done", headcount: 45, format: "film", date: "2026-10-13", start: "18:30" },
    ] as unknown as Night[];
    expect(mondayInput(venue, nights).avoidFormats).toEqual(["quiz"]);
    const good = [{ status: "done", headcount: 30, format: "quiz", date: "2026-10-20", start: "18:30" }] as unknown as Night[];
    expect(mondayInput(venue, good).avoidFormats).toBeUndefined();
  });
});
