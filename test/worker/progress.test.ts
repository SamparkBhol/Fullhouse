import { describe, expect, it } from "vitest";
import { Progress, tracked } from "../../src/worker/venue/progress.ts";
import type { Qloo } from "../../src/core/index.ts";
import { liveBody, livePlaces } from "../core/pair/live.ts";
import { liveNight } from "../core/night/live.ts";

describe("run progress", () => {
  it("lists each Qloo call once it has answered, and starts over with each read or plan", async () => {
    const p = new Progress();
    let release: () => void = () => undefined;
    const slow: Qloo = { get: (call) => new Promise((resolve) => (release = () => resolve({ body: { call }, prov: {} as never }))) };
    p.start(new Date("2026-10-29T16:00:00.000Z"));
    const q = tracked(slow, p);
    const pending = q.get("loved_places", "/v2/insights", {});
    expect(p.view().done).toEqual([]);
    release();
    await pending;
    expect(p.view()).toEqual({ since: "2026-10-29T16:00:00.000Z", done: ["loved_places"] });
    p.start(new Date("2026-10-29T16:05:00.000Z"));
    expect(p.view().done).toEqual([]);
  });

  it("hands the screen the list's pins once the places call is back, and the partner once Full House compares it", async () => {
    const daunt = liveNight("night2_daunt_etna");
    const venueId = daunt.venue.entity.id;
    const p = new Progress();
    p.start(new Date("2026-10-29T16:00:00.000Z"));
    const answers: Qloo = { get: async (call) => ({ body: call === "loved_places" ? liveBody("daunt_loved") : {}, prov: {} as never }) };
    const q = tracked(answers, p);
    await q.get("loved_places", "/v2/insights", { "signal.interests.entities": venueId });
    const pins = p.view().places ?? [];
    expect(pins.map((x) => [x.name, x.rank])).toEqual(livePlaces("daunt_loved").map((x) => [x.name, x.rank]));
    expect(p.view().partnerId).toBeUndefined();
    await q.get("compare", "/v2/analysis/compare", { "a.signal.interests.entities": venueId, "b.signal.interests.entities": daunt.match.partner.id });
    expect(p.view().partnerId).toBe(daunt.match.partner.id);
    p.start(new Date("2026-10-29T16:05:00.000Z"));
    expect(p.view()).toEqual({ since: "2026-10-29T16:05:00.000Z", done: [] });
  });
});
