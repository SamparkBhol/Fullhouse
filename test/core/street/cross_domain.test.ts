import { describe, expect, it } from "vitest";
import { CROSS_TYPES, crossDomain } from "../../../src/core/street/steps/cross_domain.ts";
import { VENUE_ID } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const typeIs = (urn: string) => (p: URLSearchParams) => p.get("filter.type") === urn;

describe("crossDomain", () => {
  it("asks each media type with the venue and its point as signals, explained, and never with bias.trends", async () => {
    const { run, ctx, calls } = stepSetup();
    await crossDomain(run, ctx);
    expect(calls.map((c) => c.url.searchParams.get("filter.type"))).toEqual(CROSS_TYPES.map((t) => `urn:entity:${t}`));
    for (const c of calls) {
      expect(Object.fromEntries(c.url.searchParams)).toEqual({
        "feature.explainability": "true",
        "filter.type": c.url.searchParams.get("filter.type"),
        "signal.interests.entities": VENUE_ID,
        "signal.location": "POINT(-73.958 40.721)",
        take: "10",
      });
    }
  });

  it("ranks picks by affinity within each type and ties them to the venue", async () => {
    const { run, ctx } = stepSetup();
    const { rising } = await crossDomain(run, ctx);
    const artists = rising.filter((r) => r.type === "artist");
    expect(artists.map((r) => [r.name, r.rank, r.trend])).toEqual([
      ["Alice Coltrane", 1, "unknown"],
      ["Sade", 2, "unknown"],
      ["Khruangbin", 3, "unknown"],
    ]);
    expect(artists[0]?.because.map((b) => b.text)).toEqual([
      "Ranked #1 of 3 artists for people who like Cafe Lumen, weighted to the area around it",
      "Qloo's explainability ties this pick to Cafe Lumen",
    ]);
    expect(artists[0]?.tags).toEqual(["urn:tag:genre:music:jazz", "urn:tag:influenced_by:qloo:john_coltrane"]);
  });

  it("labels a type Qloo answered without the venue as the area's picks, with no rank claim", async () => {
    const { run, ctx } = stepSetup();
    const { rising, limits } = await crossDomain(run, ctx);
    const podcast = rising.find((r) => r.type === "podcast")!;
    expect(podcast.because.map((b) => b.text)).toEqual(["One of 2 podcasts Qloo returned for the area around Cafe Lumen"]);
    expect(limits).toEqual(["Qloo returned no TV shows for Cafe Lumen.", "Qloo did not use Cafe Lumen itself for the podcasts, so those picks reflect the area only."]);
  });

  it("keeps the other types when one is refused", async () => {
    const refused = answer(typeIs("urn:entity:book"), { errors: [{ message: "urn:entity:book does not yet support trending requests.", subtype: "urn:entity:book" }] }, 400);
    const { run, ctx } = stepSetup([refused]);
    const { rising } = await crossDomain(run, ctx);
    expect(rising.some((r) => r.type === "book")).toBe(false);
    expect(rising.some((r) => r.type === "artist")).toBe(true);
    expect(run.notes()).toEqual(["Book picks failed (Qloo rejected the request), so that part of the read is missing."]);
  });
});
