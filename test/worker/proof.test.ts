import { describe, expect, it } from "vitest";
import type { Baseline, CreateVenueInput } from "../../src/shared/contract.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import { VenueCore } from "../../src/worker/venue/core.ts";
import { CANDIDATE, fakeCore, venueDeps } from "./helpers.ts";

const INPUT: CreateVenueInput = { candidate: CANDIDATE, city: "Berlin", tz: "Europe/Berlin", quietSlot: { weekday: 4, start: "19:00", durationMin: 180 } };

async function setup(withModel: boolean) {
  const store = new MemoryStore();
  let runs = 0;
  const core = fakeCore(undefined, { joint: true });
  const deps = venueDeps({ core: { ...core, runBaseline: async (...args) => (runs++, core.runBaseline(...args)) }, generate: withModel ? async () => "x" : null });
  const venue = new VenueCore(store, deps);
  await venue.init("abcdefghijkm", INPUT, CANDIDATE, "https://x.example");
  return { store, venue, runs: () => runs };
}

describe("the proof", () => {
  it("is worked out once after the first read, without a plan, so the tab has it when it opens", async () => {
    const { store, venue, runs } = await setup(true);
    expect((await venue.precomputeProof()).ok && (await store.get<Baseline>("baseline"))).toBeFalsy();
    await venue.read();
    const first = await venue.precomputeProof();
    expect(first.ok && first.value?.ask).toBe("Plan a night like nothing yet");
    expect(await store.get<Baseline>("baseline")).toBeDefined();
    await venue.precomputeProof();
    expect(runs()).toBe(1);
  });

  it("is skipped where no model runs", async () => {
    const { store, venue } = await setup(false);
    await venue.read();
    expect(await venue.precomputeProof()).toEqual({ ok: true, value: null });
    expect(await store.get("baseline")).toBeUndefined();
  });
});
