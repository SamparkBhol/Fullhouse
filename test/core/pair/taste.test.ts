import { describe, expect, it } from "vitest";
import { parseCompare } from "../../../src/core/qloo/compare.ts";
import { sharedTaste, shownTags } from "../../../src/core/pair/taste.ts";
import { HOUSING_WORKS, REGGIO, liveBody, livePlaces, placeNamed } from "./live.ts";

const EVERYDAY = ["casual", "dinner", "lunch", "breakfast", "trendy", "hip", "chic", "cozy", "good for groups", "family friendly"];

// The live listing name, with its spaced hyphen built from parts.
const ANGELIKA = ["Angelika Film Center & Cafe", "New York"].join(" \u002d ");

describe("shared tags that mean something", () => {
  const reggio = REGGIO();
  const places = livePlaces("reggio_loved");
  const veselka = placeNamed(places, "Veselka");
  const compare = parseCompare(liveBody("reggio_veselka_compare"));

  it("weighs each shared tag by how few places nearby carry it, and leads with the neighbourhood, decor and ambience namespaces", () => {
    const taste = sharedTaste(reggio.entity, veselka, places, compare);
    const shown = shownTags(taste).map((t) => t.name);
    expect(shown).toEqual(["cultural hub", "classic", "authentic"]);
    for (const w of EVERYDAY) expect(shown).not.toContain(w);
    const hub = taste.find((t) => t.tag.name === "cultural hub")!;
    expect(hub.tag).toMatchObject({ carriers: 5, pool: 49, namespace: "urn:tag:neighborhood_characteristic:qloo" });
    expect(hub.distinct).toBeCloseTo(Math.log(50 / 6), 6);
    const late = taste.find((t) => t.tag.name === "late night food")!;
    expect(late.tag).toMatchObject({ carriers: 11, pool: 49 });
    expect(late.distinct).toBeCloseTo(0.6 * Math.log(50 / 12), 6);
  });

  it("never shows how a place is paid for, reached, timed or equipped, or what any evening out is", () => {
    for (const [a, b] of [[reggio.entity, veselka], [HOUSING_WORKS().entity, placeNamed(livePlaces("hw_loved"), ANGELIKA)]] as const) {
      const names = sharedTaste(a, b, places, compare).map((t) => t.tag.name);
      for (const w of ["dining drinking", "social", "evening", "culture arts", "credit cards", "wifi", "late night"]) expect(names).not.toContain(w);
      for (const t of sharedTaste(a, b, places, compare)) {
        expect(t.tag.namespace).not.toMatch(/payments|credit_card|accessibility|service_options|planning|cost_description|age_range|time_of_day_fit|dining_options|amenit/);
      }
    }
  });

  it("lists the everyday tags last, so they only show when nothing more specific is shared", () => {
    const taste = sharedTaste(reggio.entity, veselka, places, compare);
    const firstEveryday = taste.findIndex((t) => t.generic);
    expect(firstEveryday).toBeGreaterThan(2);
    expect(taste.slice(firstEveryday).every((t) => t.generic)).toBe(true);
    for (const name of ["restaurant", "place", "seating", "moderately expensive", "toasting", "gluten free"]) expect(taste.map((t) => t.tag.name)).not.toContain(name);
  });

  it("finds one telling tag for Housing Works and Angelika and puts the common ones after it, never dining drinking, social or evening", () => {
    const hwPlaces = livePlaces("hw_loved");
    const angelika = placeNamed(hwPlaces, ANGELIKA);
    const taste = sharedTaste(HOUSING_WORKS().entity, angelika, hwPlaces, parseCompare(liveBody("hw_angelika_compare")));
    expect(taste.map((t) => t.generic)).toEqual([false, ...taste.slice(1).map(() => true)]);
    expect(shownTags(taste).map((t) => t.name)).toEqual(["classic"]);
    expect(taste.slice(1).map((t) => t.tag.name)).toContain("historic");
  });

  it("never counts the two places themselves in the base rate", () => {
    const taste = sharedTaste(reggio.entity, veselka, [...places, { id: reggio.entity.id, tags: reggio.entity.tags }], compare);
    expect(taste[0]?.tag.pool).toBe(49);
  });
});
