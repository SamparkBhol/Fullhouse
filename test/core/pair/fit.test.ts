import { describe, expect, it } from "vitest";
import { scored } from "../../../src/core/pair/engine.ts";
import { FIT_MAX } from "../../../src/core/pair/fit.ts";
import { notChecked, type Back } from "../../../src/core/pair/reverse.ts";
import { parseCompare } from "../../../src/core/qloo/compare.ts";
import type { MatchPartner } from "../../../src/shared/contract.ts";
import { HOUSING_WORKS, REGGIO, liveBody, liveEntities, livePlaces, placeNamed } from "./live.ts";

function backFrom(fixture: string, partnerId: string, venueId: string, ref = 9): Back {
  const list = liveEntities(fixture).filter((e) => e.id !== partnerId);
  const at = list.findIndex((e) => e.id === venueId);
  return { partnerId, rank: { checked: true, rank: at < 0 ? null : at + 1, of: list.length }, ref };
}

const checks = (p: MatchPartner) => Object.fromEntries((p.fit?.checks ?? []).map((c) => [c.key, c]));

// The live listing name, with its spaced hyphen built from parts.
const ANGELIKA = ["Angelika Film Center & Cafe", "New York"].join(" \u002d ");

describe("the fit score", () => {
  const reggio = REGGIO();
  const places = livePlaces("reggio_loved");
  const s = { venue: reggio, places, lovedRef: 2 };

  it("scores Olive Tree Cafe for Caffe Reggio part by part, every part with its sentence", () => {
    const olive = placeNamed(places, "Olive Tree Cafe");
    const p = scored(s, olive, backFrom("reggio_back_olive_tree", olive.id, reggio.entity.id), parseCompare(liveBody("reggio_olive_tree_compare")), 7);
    const c = checks(p);
    expect(c.crowd).toMatchObject({ points: 23, max: 25, pass: true, sentence: "Olive Tree Cafe is 6th of the 50 places your crowd loves nearby.", provenance: 2 });
    expect(c.back).toMatchObject({ points: 24, max: 25, pass: true, sentence: "Caffe Reggio is 3rd of the 50 places Olive Tree Cafe's crowd loves. It goes both ways.", provenance: 9 });
    expect(c.partners).toMatchObject({ points: 11, max: 15, pass: true, sentence: "A cafe and a bar suit each other, and they sell different things." });
    expect(c.open).toMatchObject({ points: 15, max: 15, pass: true, sentence: "Both are open for their part of the night every evening." });
    expect(c.walk).toMatchObject({ points: 10, max: 10, pass: true, sentence: "About 1 minute on foot." });
    expect(c.taste?.provenance).toBe(7);
    expect(p.fit?.score).toBe(Object.values(c).reduce((n, x) => n + x.points, 0));
    expect(p.fit?.checks.map((x) => x.max)).toEqual(Object.values(FIT_MAX));
    expect(p.reverseRank).toEqual({ checked: true, rank: 3, of: 50 });
    expect(p).toMatchObject({ group: "drinks", kind: "bar", walkMin: 1 });
  });

  it("follows the formulas: rank r of N earns 25 times 1 minus r minus 1 over N", () => {
    const veselka = placeNamed(places, "Veselka");
    const p = scored(s, veselka, backFrom("reggio_back_veselka", veselka.id, reggio.entity.id));
    const c = checks(p);
    expect(veselka.rank).toBe(3);
    expect(c.crowd?.points).toBe(Math.round(25 * (1 - 2 / 50)));
    expect(c.back).toMatchObject({ points: Math.round(25 * (1 - 18 / 50)), sentence: "Caffe Reggio is 19th of the 50 places Veselka's crowd loves." });
    expect(c.partners).toMatchObject({ points: 8, pass: false, sentence: "A cafe and a restaurant are not rivals, but they are not a natural pair either." });
    expect(c.open).toMatchObject({ points: 8, pass: false, sentence: "Veselka lists no opening hours, so check them before you ask. Caffe Reggio is open for its part every evening." });
    expect(c.walk).toMatchObject({ points: Math.round(10 * (1500 - 1126) / 1200), sentence: "About 18 minutes on foot." });
  });

  it("fails loves you back when the venue is not in the partner's list, and says when it was not asked", () => {
    const tavern = placeNamed(places, "Tavern On Jane");
    expect(checks(scored(s, tavern, { partnerId: tavern.id, rank: { checked: true, rank: null, of: 50 }, ref: 4 })).back).toMatchObject({
      points: 0,
      pass: false,
      sentence: "Caffe Reggio is not among the 50 places Tavern On Jane's crowd loves nearby.",
    });
    expect(checks(scored(s, tavern, notChecked(tavern.id))).back).toMatchObject({ points: 0, pass: false, sentence: "Not checked. Full House asks this of the 8 places that score best on the other checks." });
    expect(checks(scored(s, tavern, { partnerId: tavern.id, rank: { checked: true, rank: 33, of: 50 }, ref: 4 })).back).toMatchObject({ points: 9, pass: false, sentence: "Caffe Reggio is 33rd of the 50 places Tavern On Jane's crowd loves." });
  });

  it("gives a bookshop and a cinema full partner points and a short name in every sentence", () => {
    const hw = HOUSING_WORKS();
    const hwPlaces = livePlaces("hw_loved");
    const angelika = placeNamed(hwPlaces, ANGELIKA);
    const c = checks(scored({ venue: hw, places: hwPlaces, lovedRef: 2 }, angelika, backFrom("hw_back_angelika", angelika.id, hw.entity.id)));
    expect(c.partners).toMatchObject({ points: 15, sentence: "A bookshop and a cinema send each other people. Two bookshops would compete for them." });
    expect(c.back?.sentence).toBe("Housing Works Bookstore is 6th of the 50 places Angelika Film Center's crowd loves. It goes both ways.");
    expect(c.walk).toMatchObject({ points: 10, sentence: "About 2 minutes on foot." });
    expect(c.open).toMatchObject({ points: 8, sentence: "Angelika Film Center lists no opening hours, so check them before you ask. Housing Works Bookstore is open for its part on 6 of the next 7 evenings." });
  });

  it("scores walking full at 300 m and nothing at 1500 m", () => {
    const olive = placeNamed(places, "Olive Tree Cafe");
    const at = (distanceM: number) => checks(scored(s, { ...olive, distanceM }, notChecked(olive.id))).walk?.points;
    expect([at(300), at(900), at(1500), at(2000)]).toEqual([10, 5, 0, 0]);
  });
});
