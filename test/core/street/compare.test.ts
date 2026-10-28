import { describe, expect, it } from "vitest";
import type { LovedPlace } from "../../../src/shared/contract.ts";
import { lovedPlaces } from "../../../src/core/street/steps/loved_places.ts";
import { PARTNERS_COMPARED, compareStep } from "../../../src/core/street/steps/compare.ts";
import { streetFingerprint } from "../../../src/core/street/steps/street_tags.ts";
import { venueFingerprint } from "../../../src/core/street/steps/venue_tags.ts";
import { VENUE_ID, fixture } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isCompare = (_: URLSearchParams, path: string) => path === "/v2/analysis/compare";

async function inputs(routes = [] as ReturnType<typeof answer>[]) {
  const setup = stepSetup(routes);
  const [street, audience, loved] = await Promise.all([streetFingerprint(setup.run, setup.ctx), venueFingerprint(setup.run, setup.ctx), lovedPlaces(setup.run, setup.ctx)]);
  const partners: LovedPlace[] = loved.loved?.places ?? [];
  return { ...setup, input: { partners, street: street.street, audience: audience.audience } };
}

describe("compareStep", () => {
  it("compares the venue with its top five loved places", async () => {
    const { run, ctx, calls, input } = await inputs();
    await compareStep(run, ctx, input);
    const p = calls.find((c) => c.url.pathname === "/v2/analysis/compare")!.url.searchParams;
    expect(p.get("a.signal.interests.entities")).toBe(VENUE_ID);
    expect(p.get("b.signal.interests.entities")).toBe(input.partners.slice(0, PARTNERS_COMPARED).map((x) => x.id).join(","));
    expect(PARTNERS_COMPARED).toBe(5);
    expect(p.get("take")).toBe("20");
  });

  it("takes what the street already likes the venue for from the shared tags and the venue's own side", async () => {
    const { run, ctx, input } = await inputs();
    const { shared } = await compareStep(run, ctx, input);
    expect(shared.map((t) => [t.name, t.rank])).toEqual([
      ["Coffee", 1],
      ["Cafe", 2],
    ]);
  });

  it("finds the gap as the partners' side minus the venue's side, shared by two or more, most carried first", async () => {
    const { run, ctx, input } = await inputs();
    const { gaps, limits } = await compareStep(run, ctx, input);
    expect(gaps.map((g) => g.tag.name)).toEqual(["Wine", "Live music", "Date Night", "Bar"]);
    expect(gaps[0]?.note).toBe("3 of the 5 places nearby that Cafe Lumen's audience also loves are tagged Wine.");
    expect(gaps[1]?.because.map((b) => b.text)).toEqual(["Carried by Blue Hour Wine Bar, not by Cafe Lumen"]);
    expect(gaps.every((g) => g.because.every((b) => b.kind === "compare"))).toBe(true);
    expect(limits).toEqual([]);
  });

  it("leaves out amenities, catalogue tags, single carriers and tags the venue already carries", async () => {
    const { run, ctx, input } = await inputs();
    const names = (await compareStep(run, ctx, input)).gaps.map((g) => g.tag.name);
    for (const left of ["Hair dryer", "Place", "Tourist Attraction", "Coffee", "Cozy", "Repair services", "Movie Theater"]) expect(names).not.toContain(left);
  });

  it("falls back to the street and audience overlap when compare fails, and shows no gap", async () => {
    const { run, ctx, input } = await inputs([answer(isCompare, { errors: [{ message: "boom" }] }, 400)]);
    const out = await compareStep(run, ctx, input);
    expect(out.shared.map((t) => t.name)).toEqual(["Documentary", "Cozy"]);
    expect(out.gaps).toEqual([]);
    expect(run.notes()).toEqual(["Venue versus nearby places comparison failed (Qloo rejected the request), so that part of the read is missing."]);
  });

  it("makes no call and says why when no place came back", async () => {
    const { run, ctx, calls, input } = await inputs();
    const out = await compareStep(run, ctx, { ...input, partners: [] });
    expect(calls.some((c) => c.url.pathname === "/v2/analysis/compare")).toBe(false);
    expect(out.limits).toEqual(["Cafe Lumen was not compared with nearby places because none came back, so this read shows no gap."]);
  });

  it("says so when the partners carry nothing the venue lacks", async () => {
    const body = fixture("compare");
    body.results.b = body.results.a;
    const { run, ctx, input } = await inputs([answer(isCompare, body)]);
    expect((await compareStep(run, ctx, input)).limits).toEqual([
      "No tag missing from Cafe Lumen is shared by two or more of the places nearby that its audience loves, so this read shows no gap.",
    ]);
  });
});
