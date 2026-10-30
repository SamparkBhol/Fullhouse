import { describe, expect, it } from "vitest";
import { both } from "../../web/src/first-run/example-ranks.ts";
import type { Example } from "../../web/src/joint.ts";

const base: Example = {
  venue: { name: "Housing Works Bookstore" },
  partner: { name: ["Angelika Film Center & Cafe", "New York"].join(" \u002d ") },
  minutes: 2,
  title: null,
  kind: null,
  split: null,
  shared: [],
  fit: 83,
  checks: [
    { key: "crowd", label: "Crowd pull", pass: true, points: 25, max: 25, sentence: "" },
    { key: "back", label: "Loves you back", pass: true, points: 23, max: 25, sentence: "" },
  ],
  readAt: null,
  date: null,
  city: "New York",
  stops: [],
  agreed: false,
  considered: [],
  consideredOf: 50,
  partnerRank: 1,
  back: { rank: 6, of: 50 },
};

describe("the landing card's two numbers", () => {
  it("says both ranks, each from its own crowd's list, with short names", () => {
    expect(both(base)).toEqual({
      ranks: ["Angelika Film Center is 1st of the 50 places Housing Works Bookstore's crowd loves nearby.", "Housing Works Bookstore is 6th of the 50 places Angelika Film Center's crowd loves."],
    });
  });

  it("falls back to the line from the checks when a rank is missing", () => {
    expect(both({ ...base, back: null })).toEqual({ line: "Each crowd counts the other place among the ones it loves nearby." });
    expect(both({ ...base, partnerRank: null, checks: [base.checks[0]!] })).toEqual({ line: "Your crowd loves Angelika Film Center." });
    expect(both({ ...base, consideredOf: null, checks: [] })).toBeNull();
  });
});
