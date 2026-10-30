import { describe, expect, it } from "vitest";
import { lovesBack } from "../../../src/core/pair/reverse.ts";
import { createQloo } from "../../../src/core/qloo/client.ts";
import { createRunner } from "../../../src/core/street/runner.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { THEIR_TOP } from "../../../src/shared/engine.ts";
import { fakeFetch, type Route } from "../../fixtures/street.ts";
import { HOUSING_WORKS, liveBody, livePlaces } from "./live.ts";

const NOW = new Date("2026-10-29T16:00:00.000Z");

describe("the read from the partner's side", () => {
  const hw = HOUSING_WORKS();
  const angelika = livePlaces("hw_loved")[0]!;
  const route: Route = (url) => (url.pathname === "/v2/insights" ? { status: 200, body: liveBody("hw_back_angelika") } : undefined);

  it("keeps the first five places of each candidate's own list", async () => {
    const f = fakeFetch([route]);
    const q = createQloo({ apiKey: "reverse-key", fetch: f.fetch, now: () => NOW, sleep: async () => {} });
    const back = await lovesBack(createRunner(q, 30, 3), resolveVenue(hw, NOW), angelika);
    expect(back.rank).toMatchObject({ checked: true, rank: 6, of: 50 });
    expect(back.rank.top).toEqual([
      { id: "519396F1-B71B-4D40-833B-0940BDD47D9D", name: "Village East by Angelika", rank: 1 },
      { id: "14AD79A5-3B89-4F31-A1F4-CA244ACBED21", name: "Roxy Cinema New York", rank: 2 },
      { id: "E118C216-4EB5-4856-837C-AF8A5D4E57B9", name: "IFC Center", rank: 3 },
      { id: "D052194B-6B47-4866-B00B-7D69A3EA34C3", name: "Gene Frankel Theatre", rank: 4 },
      { id: "7F778F1D-012A-424A-809F-9E48F63FBDF3", name: "Anthology Film Archives", rank: 5 },
    ]);
    expect(back.rank.top).toHaveLength(THEIR_TOP);
    expect(f.calls).toHaveLength(1);
  });
});
