import { describe, expect, it } from "vitest";
import type { LovedPlace, StreetTag } from "../../../src/shared/contract.ts";
import { matchCandidates } from "../../../src/core/match/candidates.ts";
import { sharedTags } from "../../../src/core/match/shared.ts";
import { matchStep } from "../../../src/core/match/step.ts";
import { lovedPlaces } from "../../../src/core/street/steps/loved_places.ts";
import { venueFingerprint } from "../../../src/core/street/steps/venue_tags.ts";
import { VENUE, VENUE_ID, fixture } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isCompare = (_: URLSearchParams, path: string) => path === "/v2/analysis/compare";
const AT = "2026-10-25T15:00:00.000Z";

async function inputs(routes = [] as ReturnType<typeof answer>[]) {
  const setup = stepSetup(routes);
  const [audience, loved] = await Promise.all([venueFingerprint(setup.run, setup.ctx), lovedPlaces(setup.run, setup.ctx)]);
  const places: LovedPlace[] = loved.loved?.places ?? [];
  return { ...setup, places, venueTags: audience.audience?.tags ?? [], lovedRef: loved.loved?.ref ?? null };
}

const tag = (name: string, namespace: string, rank: number): StreetTag => ({ id: `${namespace}:${name.toLowerCase().replace(/\W+/g, "_")}`, name, namespace, rank });

describe("the match", () => {
  it("is the top place nearby that hosts people, with two runners up", async () => {
    const { places } = await inputs();
    const picked = matchCandidates(places, VENUE);
    expect(picked.map((p) => p.name)).toEqual(["Blue Hour Wine Bar", "Grand Street Cinema"]);
  });

  it("compares the venue with the partner alone and reads the partner's crowd the same way as the venue's", async () => {
    const { run, ctx, calls, places, venueTags, lovedRef } = await inputs();
    const before = calls.length;
    const out = await matchStep(run, ctx, matchCandidates(places, VENUE), venueTags, lovedRef, AT);
    const made = calls.slice(before);
    const cmp = made.find((c) => c.url.pathname === "/v2/analysis/compare")!.url.searchParams;
    expect(cmp.get("a.signal.interests.entities")).toBe(VENUE_ID);
    expect(cmp.get("b.signal.interests.entities")).toBe(out.match!.partner.id);
    const tags = made.find((c) => c.url.searchParams.get("filter.type") === "urn:tag")!.url.searchParams;
    expect(tags.get("signal.interests.entities")).toBe(out.match!.partner.id);
    expect(made).toHaveLength(2);
    expect(out.match!.runnersUp.map((p) => p.name)).toEqual(["Grand Street Cinema"]);
    expect(out.match!.readAt).toBe(AT);
    expect(out.match!.provenance).toHaveLength(3);
  });

  it("takes compare's shared tags and the tags both crowds rank, music and screen tastes first, never a catalogue or dish tag", async () => {
    const { run, ctx, places, venueTags, lovedRef } = await inputs();
    const out = await matchStep(run, ctx, matchCandidates(places, VENUE), venueTags, lovedRef, AT);
    const names = out.match!.shared.map((t) => t.name);
    expect(names.slice(0, 3)).toEqual(["Jazz", "indie", "Documentary"]);
    expect(names).toContain("Coffee");
    for (const left of ["Place", "Espresso", "Natural Wine"]) expect(names).not.toContain(left);
  });

  it("finds the gap from the partner's side of compare", async () => {
    const { run, ctx, places, venueTags, lovedRef } = await inputs();
    const out = await matchStep(run, ctx, matchCandidates(places, VENUE), venueTags, lovedRef, AT);
    expect(out.gaps.length).toBeGreaterThan(0);
    expect(out.gaps.every((g) => g.because.every((b) => b.kind === "compare"))).toBe(true);
  });

  it("still matches when compare fails, from the two crowds' own tags", async () => {
    const { run, ctx, places, venueTags, lovedRef } = await inputs([answer(isCompare, { errors: [{ message: "boom" }] }, 400)]);
    const out = await matchStep(run, ctx, matchCandidates(places, VENUE), venueTags, lovedRef, AT);
    expect(out.match!.shared.map((t) => t.name)).toContain("Jazz");
    expect(out.gaps).toEqual([]);
  });

  it("makes no call and says why when no place that hosts people came back", async () => {
    const { run, ctx, calls } = stepSetup();
    const out = await matchStep(run, ctx, [], [], null, AT);
    expect(calls).toHaveLength(0);
    expect(out.match).toBeNull();
    expect(out.limits).toEqual(["No place near Cafe Lumen that hosts people came back from Qloo, so there is no neighbour to match with yet."]);
  });

  it("says so when the two crowds share nothing worth naming", async () => {
    const body = fixture("compare");
    body.results.tags = [];
    body.results.a = [];
    const { run, ctx, places, lovedRef } = await inputs([answer(isCompare, body)]);
    const out = await matchStep(run, ctx, matchCandidates(places, VENUE), [], lovedRef, AT);
    expect(out.match!.shared).toEqual([]);
    expect(out.limits[0]).toMatch(/^Qloo found no taste Cafe Lumen and Blue Hour Wine Bar share beyond the basics/);
  });
});

describe("what both crowds share", () => {
  it("leaves out identity, payment and age tags, and the plainest kinds of place", () => {
    const venue = [
      tag("LGBT", "urn:tag:genre:media", 1),
      tag("Female protagonist", "urn:tag:keyword:media", 2),
      tag("Indie rock", "urn:tag:genre:music", 3),
      tag("Restaurant", "urn:tag:genre:place", 4),
      tag("Adult", "urn:tag:genre:media", 5),
      tag("Cozy", "urn:tag:ambience:qloo", 6),
    ];
    const partner = [...venue].reverse().map((t, i) => ({ ...t, rank: i + 1 }));
    const lgbtqFriendly = { id: "urn:tag:inclusivity:place:lgbtq_friendly", name: "LGBTQ+ friendly", namespace: "urn:tag:inclusivity:place", score: 1, popularity: 1, a: [], b: [] };
    const shared = sharedTags({ shared: [lgbtqFriendly], a: [], b: [] }, venue, partner);
    expect(shared.map((t) => t.name)).toEqual(["Indie rock", "Cozy"]);
    expect(shared.map((t) => t.rank)).toEqual([1, 2]);
  });
});

describe("shared tags that describe the building", () => {
  it("are left out: cost, health and seating say nothing about a crowd", () => {
    const venue = [tag("Moderately expensive", "urn:tag:cost_description:place", 1), tag("Average", "urn:tag:health:place", 2), tag("Seating", "urn:tag:dining_options:place", 3), tag("Wine", "urn:tag:offerings:place", 4)];
    expect(sharedTags(null, venue, venue).map((t) => t.name)).toEqual(["Wine"]);
  });
});
