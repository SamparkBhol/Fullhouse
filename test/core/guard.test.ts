import { describe, expect, it } from "vitest";
import { settleModelCopy } from "../../src/core/copy/guard.ts";
import { shortTitle } from "../../src/core/copy/text.ts";

const draft = {
  eventTitle: "Master of None watch night at Caffe Reggio",
  eventDescription: "draft",
  posterHeadline: "Master of None",
  posterSub: "Watch night. Free entry.",
  social: "draft",
  partnerPitch: { subject: "s", body: "b" },
};

function model(over: Partial<typeof draft>) {
  return { ...draft, eventTitle: "Master of None watch night at Caffe Reggio", eventDescription: "model", ...over };
}

describe("settleModelCopy", () => {
  it("puts the full feature name back when the headline was cut mid title", () => {
    const out = settleModelCopy(model({ posterHeadline: "Master of" }), draft, "Master of None", "Caffe Reggio");
    expect(out.posterHeadline).toBe("Master of None");
  });

  it("uses the template headline when the full name is too long for the poster", () => {
    const long = "A Very Long Book Title That Will Not Fit On The Poster Line";
    const out = settleModelCopy(model({ posterHeadline: "A Very Long Book" }), { ...draft, posterHeadline: "Book night" }, long, "Caffe Reggio");
    expect(out.posterHeadline).toBe("Book night");
  });

  it("leads the poster with the feature name whenever it fits", () => {
    const out = settleModelCopy(model({ posterHeadline: "Watch night" }), draft, "Master of None", "Caffe Reggio");
    expect(out.posterHeadline).toBe("Master of None");
  });

  it("keeps the model headline when there is no feature", () => {
    const out = settleModelCopy(model({ posterHeadline: "Tasting night, small plates" }), draft, null, "Caffe Reggio");
    expect(out.posterHeadline).toBe("Tasting night, small plates");
  });

  it("replaces a title that is only the feature name", () => {
    const out = settleModelCopy(model({ eventTitle: "Master of None" }), draft, "Master of None", "Caffe Reggio");
    expect(out.eventTitle).toBe(draft.eventTitle);
  });

  it("keeps a title that names the night", () => {
    const out = settleModelCopy(model({ eventTitle: "Master of None watch night" }), draft, "Master of None", "Caffe Reggio");
    expect(out.eventTitle).toBe("Master of None watch night");
  });
});

describe("shortTitle", () => {
  it("drops a subtitle after a colon or bracket", () => {
    expect(shortTitle("Walden: Or, Life in the Woods")).toBe("Walden");
    expect(shortTitle("Dune (Deluxe Edition)")).toBe("Dune");
  });

  it("leaves a plain name alone", () => {
    expect(shortTitle("Friday Black")).toBe("Friday Black");
  });
});
