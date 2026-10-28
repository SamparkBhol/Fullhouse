import { describe, expect, it } from "vitest";
import type { LovedPlace } from "../../../src/shared/contract.ts";
import type { CompareRead, SideTag } from "../../../src/core/qloo/compare.ts";
import { MAX_GAPS, isCatalogueTag, partnerGaps } from "../../../src/core/street/steps/gaps.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { NOW, VENUE } from "../../fixtures/street.ts";

const ctx = resolveVenue(VENUE, NOW);

function side(id: string, name: string, count: number): SideTag {
  const namespace = id.split(":").slice(0, 4).join(":");
  return { id, name, namespace, score: null, popularity: null, count };
}

function partner(name: string, tags: string[] = []): LovedPlace {
  return { id: name, name, type: "place", lat: 40.72, lng: -73.95, distanceM: 300, rank: 1, tags, because: [] };
}

const FIVE = [partner("Blue Hour Wine Bar", ["urn:tag:good_for:qloo:live_music"]), partner("Kettle Books"), partner("Sora Ramen"), partner("Daybreak Cafe"), partner("Grand Street Cinema")];

function compare(b: SideTag[], a: SideTag[] = []): CompareRead {
  return { shared: [], a, b };
}

describe("partnerGaps", () => {
  it("keeps tags at least two partners carry, most carried first, then by namespace", () => {
    const gaps = partnerGaps(
      compare([
        side("urn:tag:offerings:place:repair_services", "Repair services", 1),
        side("urn:tag:genre:place:bar", "Bar", 2),
        side("urn:tag:good_for:qloo:live_music", "Live music", 2),
        side("urn:tag:offerings:place:wine", "Wine", 4),
      ]),
      FIVE,
      ctx,
      7,
    );
    expect(gaps.map((g) => [g.tag.name, g.tag.rank])).toEqual([["Wine", 1], ["Live music", 2], ["Bar", 3]]);
    expect(gaps[0]?.note).toBe("4 of the 5 places nearby that Cafe Lumen's audience also loves are tagged Wine. Cafe Lumen is not.");
    expect(gaps[1]?.because).toEqual([
      { kind: "compare", text: "Tagged Live music: Blue Hour Wine Bar", provenance: 7 },
      { kind: "compare", text: "Cafe Lumen's own Qloo tags do not include Live music", provenance: 7 },
    ]);
    expect(gaps[0]?.because[0]?.text).toBe("Wine is on 4 of the 5 nearby places Qloo compared with Cafe Lumen");
  });

  it("leaves out what the venue already carries, catalogue tags, other namespaces and repeated names", () => {
    const gaps = partnerGaps(
      compare(
        [
          side("urn:tag:genre:place", "Place", 5),
          side("urn:tag:genre:place:tourist_attraction", "Tourist Attraction", 4),
          side("urn:tag:amenity:qloo:hair_dryer", "Hair dryer", 3),
          side("urn:tag:ambience:qloo:cozy", "Cozy", 3),
          side("urn:tag:offerings:place:coffee", "Coffee", 3),
          side("urn:tag:genre:place:bar", "Bar", 2),
          side("urn:tag:category:place:bar", "Bar", 2),
        ],
        [side("urn:tag:offerings:place:coffee", "Coffee", 1)],
      ),
      FIVE,
      ctx,
      0,
    );
    expect(gaps.map((g) => g.tag.id)).toEqual(["urn:tag:genre:place:bar"]);
  });

  it("counts and ranks by the partners' own tags when compare reports fewer carriers", () => {
    const partners = [partner("Blue Hour Wine Bar", ["urn:tag:offerings:place:vegetarian_meals"]), partner("Kettle Books", ["urn:tag:offerings:place:vegetarian_meals"]), partner("Sora Ramen", ["urn:tag:offerings:place:vegetarian_meals"])];
    const gaps = partnerGaps(
      compare([side("urn:tag:offerings:place:vegan_meals", "Vegan Meals", 2), side("urn:tag:offerings:place:vegetarian_meals", "Vegetarian Meals", 1)]),
      partners,
      ctx,
      0,
    );
    expect(gaps.map((g) => g.tag.name)).toEqual(["Vegetarian Meals", "Vegan Meals"]);
    expect(gaps[0]?.note).toMatch(/^3 of the 3 places nearby/);
    expect(gaps[0]?.because[0]?.text).toBe("Tagged Vegetarian Meals: Blue Hour Wine Bar, Kettle Books and Sora Ramen");
  });

  it("accepts a single carrier when only one place was compared, and caps the list", () => {
    const many = Array.from({ length: MAX_GAPS + 2 }, (_, i) => side(`urn:tag:offerings:place:item_${i}`, `Item ${i}`, 1));
    const gaps = partnerGaps(compare(many), [partner("Blue Hour Wine Bar")], ctx, 0);
    expect(gaps).toHaveLength(MAX_GAPS);
    expect(gaps[0]?.note).toBe("The one place nearby that Cafe Lumen's audience also loves is tagged Item 0. Cafe Lumen is not.");
  });
});

describe("isCatalogueTag", () => {
  it("flags namespace roots and Tourist Attraction only", () => {
    expect(isCatalogueTag({ id: "urn:tag:genre:place", name: "Place", namespace: "urn:tag:genre:place" })).toBe(true);
    expect(isCatalogueTag({ id: "urn:tag:category:place:tourist_attraction", name: " tourist attraction", namespace: "urn:tag:category:place" })).toBe(true);
    expect(isCatalogueTag({ id: "urn:tag:genre:place:bar", name: "Bar", namespace: "urn:tag:genre:place" })).toBe(false);
  });
});
