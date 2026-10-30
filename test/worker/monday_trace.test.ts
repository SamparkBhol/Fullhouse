import { describe, expect, it } from "vitest";
import type { CreateVenueInput, Night, VenueState } from "../../src/shared/contract.ts";
import type { Qloo } from "../../src/core/index.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import { VenueCore } from "../../src/worker/venue/core.ts";
import { mondayInput } from "../../src/worker/venue/monday.ts";
import { CANDIDATE, fakeCore, fakeMatch, fakeRead, PARTNERS, venueDeps, type FakeCoreLog } from "./helpers.ts";
import { createVenue, req, testApp } from "./test_app.ts";

const INPUT: CreateVenueInput = {
  candidate: CANDIDATE,
  city: "Berlin",
  tz: "Europe/Berlin",
  quietSlot: { weekday: 4, start: "19:00", durationMin: 180 },
  capacity: 40,
};

function counting(): Qloo {
  let n = 0;
  return {
    async get(call) {
      n += 1;
      return { body: {}, prov: { call, endpoint: "/x", params: {}, at: "2026-10-25T10:00:00.000Z", resultCount: 0, cached: n % 2 === 0 } };
    },
  };
}

function setup(withMatch: boolean) {
  const log: FakeCoreLog = { reads: [], plans: [], copies: 0 };
  const core = fakeCore(log, { joint: withMatch });
  const read = core.readStreet;
  core.readStreet = async (q, venue, opts) => {
    await q.get("loved_places", "/a", {});
    await q.get("loves_back", "/b", {});
    return read(q, venue, opts);
  };
  const joint = core.readJoint;
  core.readJoint = async (q, venue, r, partner, exclude) => {
    await q.get("insights", "/c", {});
    return joint(q, venue, r, partner, exclude);
  };
  const store = new MemoryStore();
  const deps = venueDeps({ core, qloo: () => counting() });
  return { store, deps, log, venue: new VenueCore(store, deps) };
}

async function runs(venue: VenueCore) {
  const state = await venue.state();
  if (!state.ok) throw new Error("state failed");
  return state.value.runs ?? [];
}

describe("the Monday run record", () => {
  it("lists the steps in order for a venue with a partner, with the calls each made", async () => {
    const { venue } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    await venue.read();
    const out = await venue.monday();
    expect(out.ok && out.value.run?.by).toBe("alarm");
    const [run] = await runs(venue);
    expect(run?.steps.map((s) => s.key)).toEqual(["read", "partner", "formats", "draft", "hold"]);
    const calls = Object.fromEntries(run!.steps.map((s) => [s.key, s.calls]));
    expect(calls).toEqual({ read: 2, partner: 0, formats: 0, draft: 1, hold: 0 });
    expect(run?.calls).toBe(3);
    expect(run?.cached).toBe(1);
    expect(run?.steps.find((s) => s.key === "partner")?.outcome).toContain("Kaffee Kanal is still the best fit");
    expect(run?.steps.find((s) => s.key === "partner")?.did).toBe("Checked the partner from the last read, Kaffee Kanal, against the new read");
    expect(run?.steps.find((s) => s.key === "formats")?.outcome).toContain("every format is open");
    expect(run?.title).toBe("Jazz on vinyl night");
    expect(run?.planId).toBeTruthy();
  });

  it("says the venue's own night when no partner fits, and skips the email step with no mail set up", async () => {
    const { venue } = setup(false);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    await venue.monday();
    const [run] = await runs(venue);
    expect(run?.steps.map((s) => s.key)).toEqual(["read", "partner", "formats", "draft", "hold"]);
    expect(run?.steps[1]?.outcome).toContain("the venue's own");
    expect(run?.steps[3]?.did).toBe("Drafted a night for the quiet slot");
  });

  it("explains a switch when last week's partner is no longer the best fit", async () => {
    const { venue, store } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    const older = fakeRead("abcdefghijkm", "2026-10-18T10:00:00.000Z", false);
    older.match = { ...fakeMatch(older.at, PARTNERS[1]!), considered: undefined };
    await store.put("read", older);
    await venue.monday();
    const [run] = await runs(venue);
    expect(run?.steps[1]?.did).toBe("Checked last week's partner, Paper & Ink Books, against the new read");
    expect(run?.steps[1]?.outcome).toMatch(/^Switched to Kaffee Kanal/);
    expect(run?.steps[1]?.outcome).toContain("Paper & Ink Books");
  });

  it("leaves out formats already run with the partner", async () => {
    const { venue, store } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    const night = { id: "n1", date: "2026-10-15", start: "19:00", format: "film", status: "done", match: { partner: PARTNERS[0], shared: [], split: null, host: "both" } };
    await store.put("night:n1", { night, input: {}, published: { page: true, poster: true, ics: true } });
    await venue.monday();
    const [run] = await runs(venue);
    expect(run?.steps.find((s) => s.key === "formats")?.outcome).toBe("Film night already ran with Kaffee Kanal.");
    expect(mondayInput({ ...INPUT, id: "x", entity: CANDIDATE, createdAt: "" } as never, [night as unknown as Night], PARTNERS[0]!.id).avoidFormats).toEqual(["film"]);
  });

  it("keeps the latest five runs and marks the owner's run", async () => {
    const { venue, deps } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    for (let i = 0; i < 6; i++) await venue.monday();
    expect(await runs(venue)).toHaveLength(5);
    const out = await venue.monday("owner");
    expect(out).toMatchObject({ ok: true, value: { run: { by: "owner" } } });
    expect((await runs(venue))[0]?.by).toBe("owner");
    const again = await venue.monday("owner");
    expect(again).toMatchObject({ ok: false, status: 429, error: "run_limit" });
    deps.now = () => new Date(Date.now() + 3_700_000);
    expect(await venue.monday("owner")).toMatchObject({ ok: true });
  });

  it("records a failed read as a failed step and still re-arms", async () => {
    const { venue, deps, store } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    store.alarm = null;
    deps.core.readStreet = async () => {
      throw Object.assign(new Error("budget"), { kind: "budget", status: 0 });
    };
    await venue.monday();
    const [run] = await runs(venue);
    expect(run?.steps).toHaveLength(1);
    expect(run?.steps[0]).toMatchObject({ key: "read", status: "failed" });
    expect(run?.planId).toBeUndefined();
    expect(store.alarm).not.toBeNull();
  });

  it("records a paused run for a venue nobody opened", async () => {
    const { venue, deps } = setup(true);
    await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
    deps.now = () => new Date("2026-12-25T10:00:00Z");
    await venue.monday();
    const [run] = await runs(venue);
    expect(run?.steps.map((s) => [s.key, s.status])).toEqual([["pause", "skipped"]]);
  });
});

describe("POST /api/venues/:id/monday/run", () => {
  it("is owner only, runs the routine, and answers 429 on a second press within the hour", async () => {
    const h = testApp();
    const v = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}/monday/run`, { method: "POST", body: {} })).status).toBe(401);
    const res = await req(h, `/api/venues/${v.id}/monday/run`, { method: "POST", token: v.token, body: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { planned: boolean; run: { by: string; steps: unknown[] } };
    expect(body).toMatchObject({ planned: true, run: { by: "owner" } });
    const state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.runs?.[0]?.by).toBe("owner");
    const again = await req(h, `/api/venues/${v.id}/monday/run`, { method: "POST", token: v.token, body: {} });
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ error: "run_limit" });
  });
});
