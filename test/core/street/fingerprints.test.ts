import { describe, expect, it } from "vitest";
import { STREET_TAG_TYPES, streetFingerprint } from "../../../src/core/street/steps/street_tags.ts";
import { VENUE_TAG_TYPES, venueFingerprint } from "../../../src/core/street/steps/venue_tags.ts";
import { VENUE_ID } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const tagMode = (p: URLSearchParams) => p.get("filter.type") === "urn:tag";

describe("streetFingerprint", () => {
  it("asks for the five namespaces a location answers in, with the venue point as the only signal", async () => {
    const { run, ctx, calls } = stepSetup();
    const { street } = await streetFingerprint(run, ctx);
    const p = calls[0]!.url.searchParams;
    expect(Object.fromEntries(p)).toEqual({
      "diversify.by": "subtype",
      "diversify.take": "5",
      "filter.tag.types": STREET_TAG_TYPES.join(","),
      "filter.type": "urn:tag",
      "signal.location": "POINT(-73.958 40.721)",
      take: "25",
    });
    expect(street?.tags.slice(0, 3).map((t) => t.name)).toEqual(["Jazz", "Intimate", "Documentary"]);
    expect(street?.tags.find((t) => t.id === "urn:tag:genre:music:soul")?.name).toBe("Soul");
  });

  it("says the tags are a set when Qloo scores them almost level", async () => {
    const { run, ctx } = stepSetup();
    const { limits } = await streetFingerprint(run, ctx);
    expect(limits).toEqual(["Qloo scores the street's taste tags almost level, so they are shown as a set, not a ranking."]);
  });

  it("says plainly when the area has no tags", async () => {
    const { run, ctx } = stepSetup([answer(tagMode, { success: true, results: { tags: [] } })]);
    expect(await streetFingerprint(run, ctx)).toEqual({ street: null, limits: ["Qloo returned no taste tags for the area around Cafe Lumen."] });
  });
});

describe("venueFingerprint", () => {
  it("signals with the venue entity and adds the namespaces only an entity answers in", async () => {
    const { run, ctx, calls } = stepSetup();
    const { audience, limits } = await venueFingerprint(run, ctx);
    const p = calls[0]!.url.searchParams;
    expect(p.get("signal.interests.entities")).toBe(VENUE_ID);
    expect(p.has("signal.location")).toBe(false);
    expect(p.get("filter.tag.types")?.split(",")).toEqual(VENUE_TAG_TYPES);
    expect(p.get("take")).toBe("40");
    expect(audience?.tags.map((t) => [t.name, t.rank])).toEqual([
      ["Cozy", 1],
      ["Espresso", 2],
      ["Documentary", 3],
      ["Working", 4],
      ["indie", 5],
    ]);
    expect(limits).toEqual([]);
  });

  it("notes when the venue has no audience tags", async () => {
    const { run, ctx } = stepSetup([answer(tagMode, { success: true, results: { tags: [] } })]);
    const { audience, limits } = await venueFingerprint(run, ctx);
    expect(audience).toBeNull();
    expect(limits).toEqual(["Qloo returned no audience taste tags for Cafe Lumen."]);
  });
});
