import { describe, expect, it } from "vitest";
import { balanceOf, balancePicks, nearEven, splitOf } from "../../../src/core/joint/balance.ts";
import { VENUE_ID } from "../../fixtures/street.ts";
import { PARTNER_ID, pick } from "./helpers.ts";

describe("the crowd split", () => {
  it("is each crowd's explainability share of one pick, in whole numbers that sum to 100", () => {
    expect(splitOf(pick("A", "book", 1, 0.61, 0.39), VENUE_ID, PARTNER_ID)).toEqual({ venue: 61, partner: 39 });
    expect(splitOf(pick("B", "book", 1, 0.335, 0.665), VENUE_ID, PARTNER_ID)).toEqual({ venue: 34, partner: 66 });
    expect(splitOf(pick("C", "book", 1, 0.2, 0.2), VENUE_ID, PARTNER_ID)).toEqual({ venue: 50, partner: 50 });
  });

  it("has no split when Qloo explained the pick with one of the two only", () => {
    const solo = { ...pick("A", "book", 1, 1, 0), explain: [{ entityId: VENUE_ID, share: 1 }] };
    expect(splitOf(solo, VENUE_ID, PARTNER_ID)).toBeNull();
    expect(splitOf({ explain: undefined }, VENUE_ID, PARTNER_ID)).toBeNull();
  });

  it("counts as near even from 35 to 65", () => {
    expect(nearEven({ venue: 35, partner: 65 })).toBe(true);
    expect(nearEven({ venue: 65, partner: 35 })).toBe(true);
    expect(nearEven({ venue: 34, partner: 66 })).toBe(false);
    expect(nearEven({ venue: 66, partner: 34 })).toBe(false);
  });
});

describe("the balance pick", () => {
  it("is the pick nearest half and half among the top ten, ties by rank", () => {
    const list = [pick("First", "book", 1, 0.7, 0.3), pick("Second", "book", 2, 0.45, 0.55), pick("Third", "book", 3, 0.55, 0.45), pick("Fourth", "book", 4, 0.5, 0.5)];
    expect(balanceOf(list, VENUE_ID, PARTNER_ID)?.pick.name).toBe("Fourth");
    expect(balanceOf(list.slice(0, 3), VENUE_ID, PARTNER_ID)?.pick.name).toBe("Second");
  });

  it("never looks past the top ten", () => {
    const list = [pick("Top", "book", 1, 0.8, 0.2), pick("Eleventh", "book", 11, 0.5, 0.5)];
    expect(balanceOf(list, VENUE_ID, PARTNER_ID)?.pick.name).toBe("Top");
  });

  it("takes one pick per type and puts the most even first", () => {
    const rising = [pick("Book", "book", 1, 0.6, 0.4), pick("Film", "movie", 2, 0.52, 0.48), pick("Record", "artist", 1, 0.9, 0.1)];
    const picks = balancePicks(rising, VENUE_ID, PARTNER_ID, ["artist", "book", "movie", "tv_show", "podcast"]);
    expect(picks.map((b) => [b.pick.name, b.split.venue])).toEqual([
      ["Film", 52],
      ["Book", 60],
      ["Record", 90],
    ]);
  });
});
