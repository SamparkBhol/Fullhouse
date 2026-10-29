import { describe, expect, it } from "vitest";
import type { Gap } from "../../src/shared/contract.ts";
import { plainName } from "../../src/shared/words.ts";
import { gapLines, layerWord } from "../../web/src/ui/lines.ts";

function gap(name: string, count: number, of: number): Gap {
  return {
    tag: { id: `urn:tag:genre:place:${name}`, name, namespace: "urn:tag:genre:place", rank: 1 },
    note: `${count} of the ${of} places nearby that Saltwater Records' audience also loves ${count === 1 ? "is" : "are"} tagged ${name}.`,
    because: [],
  };
}

describe("names on postcards and pins", () => {
  it("turns a branch after a spaced dash into a comma", () => {
    expect(plainName(["Angelika Film Center & Cafe", "New York"].join(" - "))).toBe("Angelika Film Center & Cafe, New York");
    expect(plainName("Roxy Cinema \u2013 Tribeca")).toBe("Roxy Cinema, Tribeca");
  });

  it("leaves hyphens inside a name alone", () => {
    expect(plainName("Wi-Fi Bar")).toBe("Wi-Fi Bar");
  });
});

describe("the heat map switch", () => {
  it("names each layer by who the light follows", () => {
    expect(layerWord("Where the taste for Caffe Reggio runs strongest")).toBe("Your crowd");
    expect(layerWord("Where places like Caffe Reggio run strongest")).toBe("Places like yours");
    expect(layerWord("Something else")).toBe("Something else");
  });
});

describe("the gaps chalkboard", () => {
  it("says the shared sentence once and keeps each tag's count", () => {
    const out = gapLines([gap("Movie Theater", 3, 5), gap("Arcade games", 2, 5)]);
    expect(out.intro).toBe("Of the 5 places nearby that Saltwater Records' audience also loves, how many carry each tag. Your venue carries none of them.");
    expect(out.lines).toEqual([
      { text: "Movie Theater", count: "3 of 5" },
      { text: "Arcade games", count: "2 of 5" },
    ]);
  });

  it("keeps each note when the notes do not share one sentence", () => {
    const odd: Gap = { ...gap("Jazz", 1, 1), note: "The one place nearby that Saltwater Records' audience also loves is tagged Jazz." };
    const out = gapLines([odd]);
    expect(out.intro).toBeUndefined();
    expect(out.lines[0]?.note).toBe(odd.note);
  });
});
