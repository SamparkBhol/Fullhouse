import { describe, expect, it } from "vitest";
import type { Provenance } from "../../src/shared/contract.ts";
import { answersSoFar, callsSentence, choiceCalls } from "../../web/src/ui/calls-words.ts";

const row = (call: string, resultCount = 10, params: Record<string, string> = { "signal.interests.entities": "HW" }): Provenance => ({
  call,
  endpoint: call === "compare" ? "/v2/analysis/compare" : "/v2/insights",
  params,
  at: "2026-10-30T10:00:00.000Z",
  resultCount,
  cached: false,
});

const read: Provenance[] = [
  row("street_tags"),
  row("venue_tags"),
  row("loved_places", 50),
  row("heat_venue"),
  ...Array.from({ length: 8 }, (_, i) => row("loves_back", 50, { "signal.interests.entities": `P-${i}` })),
  row("compare", 30),
  row("heat_street"),
  ...["artist", "book", "movie", "tv_show", "podcast"].map((t) => row(`insights_${t}`)),
];

describe("the calls behind the choice", () => {
  it("groups a read's calls and counts the reverse reads", () => {
    expect(callsSentence(choiceCalls(read))).toBe(
      "This choice took 19 calls: 1 list of 50 places, 8 lists from each candidate's own crowd, 1 comparison, and 9 for tags, heat and what your crowd loves.",
    );
  });

  it("leaves out the joint night's calls, made afterwards with both places as the signal", () => {
    const joint = [row("insights_book", 10, { "signal.interests.entities": "HW,P-0" }), row("source_book", 3, { query: "Beautiful Boy" })];
    expect(choiceCalls([...read, ...joint])).toHaveLength(19);
  });

  it("says what came back while the read runs, and how much of it from the neighbours' side", () => {
    expect(answersSoFar([])).toBeNull();
    expect(answersSoFar(["loved_places"])).toBe("1 answer back so far, 0 from your neighbours' side");
    expect(answersSoFar(["street_tags", "loved_places", "loves_back", "loves_back"])).toBe("4 answers back so far, 2 from your neighbours' side");
  });
});
