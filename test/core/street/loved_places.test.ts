import { describe, expect, it } from "vitest";
import { lovedPlaces } from "../../../src/core/street/steps/loved_places.ts";
import { VENUE_ID, fixture } from "../../fixtures/street.ts";
import { answer, stepSetup } from "./helpers.ts";

const isPlace = (p: URLSearchParams) => p.get("filter.type") === "urn:entity:place";

function placesWith(edit: (e: any, i: number) => any): unknown {
  const body = fixture("insights_place");
  body.results.entities = body.results.entities.map(edit).filter(Boolean);
  return body;
}

describe("lovedPlaces", () => {
  it("signals with the venue inside a 1.2 km circle and leaves the venue out", async () => {
    const { run, ctx, calls } = stepSetup();
    await lovedPlaces(run, ctx);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      "feature.explainability": "true",
      "filter.exclude.entities": VENUE_ID,
      "filter.location": "POINT(-73.958 40.721)",
      "filter.location.radius": "1200",
      "filter.type": "urn:entity:place",
      "signal.interests.entities": VENUE_ID,
      take: "50",
    });
  });

  it("ranks by affinity, keeps Qloo's distance and cites the explained tie to the venue", async () => {
    const { run, ctx } = stepSetup();
    const { loved, limits } = await lovedPlaces(run, ctx);
    expect(loved?.places.map((p) => [p.name, p.rank, p.distanceM])).toEqual([
      ["Blue Hour Wine Bar", 1, 176],
      ["Kettle Books", 2, 241],
      ["Sora Ramen", 3, 525],
      ["Daybreak Cafe", 4, 109],
      ["Grand Street Cinema", 5, 742],
    ]);
    const first = loved!.places[0]!;
    expect(first).toMatchObject({ address: "40 Grand St Brooklyn, NY 11211", image: "https://images.example/blue-hour.jpg", url: "https://bluehour.example" });
    expect(first.because.map((b) => b.text)).toEqual([
      "Ranked among 5 places within 1.2 km for people who like Cafe Lumen",
    ]);
    expect(limits).toEqual([]);
  });

  it("keeps the venue off the list if Qloo returns it anyway, with every place keeping its rank on Qloo's list", async () => {
    const body = placesWith((e, i) => (i === 0 ? { ...e, entity_id: VENUE_ID.toLowerCase() } : i === 1 ? { ...e, query: { ...e.query, distance: undefined } } : e));
    const { run, ctx } = stepSetup([answer(isPlace, body)]);
    const { loved } = await lovedPlaces(run, ctx);
    expect(loved?.places.map((p) => p.name)).not.toContain("Blue Hour Wine Bar");
    expect(loved?.places[0]).toMatchObject({ name: "Kettle Books", distanceM: 241, rank: 2 });
    expect(loved?.aside.map((a) => [a.place.name, a.place.rank, a.why])).toEqual([["Blue Hour Wine Bar", 1, "you"]]);
  });

  it("sets a place marked closed aside with its rank, so the board can say why it is not on offer", async () => {
    const body = placesWith((e, i) => (i === 2 ? { ...e, properties: { ...e.properties, is_closed: true } } : e));
    const { run, ctx } = stepSetup([answer(isPlace, body)]);
    const { loved } = await lovedPlaces(run, ctx);
    expect(loved?.places.map((p) => [p.name, p.rank])).toEqual([
      ["Blue Hour Wine Bar", 1],
      ["Kettle Books", 2],
      ["Daybreak Cafe", 4],
      ["Grand Street Cinema", 5],
    ]);
    expect(loved?.aside.map((a) => [a.place.name, a.place.rank, a.why])).toEqual([["Sora Ramen", 3, "closed"]]);
  });

  it("does not present an unexplained list as a ranking of taste", async () => {
    const body = placesWith((e) => ({ ...e, query: { distance: e.query.distance } }));
    const { run, ctx } = stepSetup([answer(isPlace, body)]);
    const { loved, limits } = await lovedPlaces(run, ctx);
    expect(loved?.places[0]?.because.map((b) => b.text)).toEqual(["Listed among 5 places within 1.2 km of Cafe Lumen"]);
    expect(limits).toEqual(["The nearby places came back with no tie to Cafe Lumen's audience, so their order is not a ranking of taste."]);
  });

  it("says when the list is thin or a place has no coordinates", async () => {
    const body = placesWith((e, i) => (i === 0 ? { ...e, location: undefined } : i < 3 ? e : null));
    const { run, ctx } = stepSetup([answer(isPlace, body)]);
    const { loved, limits } = await lovedPlaces(run, ctx);
    expect(loved?.places.map((p) => p.name)).toEqual(["Kettle Books", "Sora Ramen"]);
    expect(limits).toEqual([
      "Only 2 places within 1.2 km came back from Qloo, so this part of the read is thin.",
      "1 place came back without coordinates and is not on the map.",
    ]);
  });

  it("says when no place came back", async () => {
    const { run, ctx } = stepSetup([answer(isPlace, { success: true, results: { entities: [] } })]);
    expect((await lovedPlaces(run, ctx)).limits).toEqual(["No places within 1.2 km of Cafe Lumen came back."]);
  });
});
