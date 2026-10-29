import { describe, expect, it } from "vitest";
import { nearEven, splitOf } from "../../../src/core/joint/balance.ts";
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
