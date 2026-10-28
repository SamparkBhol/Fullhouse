import { describe, expect, it } from "vitest";
import type { QDemo } from "../../../src/core/qloo/demographics.ts";
import { demographicsStep, summariseDemographics } from "../../../src/core/street/steps/demographics.ts";
import { VENUE_ID } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isDemo = (p: URLSearchParams) => p.get("filter.type") === "urn:demographics";

describe("summariseDemographics", () => {
  it("names the two strongest over indexed age groups and a clear gender lean", () => {
    const block: QDemo = { input: VENUE_ID, age: { "24_and_younger": -0.12, "25_to_29": 0.31, "30_to_34": 0.22, "45_to_54": 0.06 }, gender: { male: -0.09, female: 0.09 } };
    expect(summariseDemographics([block], "Cafe Lumen")).toBe(
      "People who like Cafe Lumen on Qloo over index on the 25 to 29 and 30 to 34 age groups, leaning female. This is Qloo's aggregate for the venue's audience, not a description of the street's residents or of any person.",
    );
  });

  it("says when no age group or gender stands out", () => {
    const block: QDemo = { input: VENUE_ID, age: { "25_to_29": 0.01 }, gender: { female: 0.02 } };
    expect(summariseDemographics([block], "Cafe Lumen")).toMatch(/^People who like Cafe Lumen on Qloo over index on no single age group\. /);
    expect(summariseDemographics([], "Cafe Lumen")).toBeNull();
  });
});

describe("demographicsStep", () => {
  it("asks about the venue's audience, since location alone is refused and changes nothing", async () => {
    const { run, ctx, calls } = stepSetup();
    const { demographics, limits } = await demographicsStep(run, ctx);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ "filter.type": "urn:demographics", "signal.interests.entities": VENUE_ID });
    expect(demographics?.summary).toMatch(/^People who like Cafe Lumen on Qloo over index on the 25 to 29 and 30 to 34 age groups, leaning female\./);
    expect(limits).toEqual([]);
  });

  it("says plainly when Qloo has no block for the venue", async () => {
    const { run, ctx } = stepSetup([answer(isDemo, { success: true, results: { demographics: [] } })]);
    expect(await demographicsStep(run, ctx)).toEqual({ demographics: null, limits: ["Qloo returned no age or gender lean for Cafe Lumen's audience."] });
  });
});
