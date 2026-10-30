import { describe, expect, it } from "vitest";
import { DELETE_AFTER_DAYS, EVENINGS, FIT_CHECKS, FIT_MAX, PAUSE_AFTER_DAYS } from "../../src/shared/engine.ts";
import { keptWords, lowerFirst, milesWords, numberWord, spanWords } from "../../src/shared/words.ts";

describe("numbers said from the engine's own constants", () => {
  it("counts the checks from the score's parts and says the spans the way an owner would", () => {
    expect(FIT_CHECKS).toBe(Object.keys(FIT_MAX).length);
    expect(numberWord(FIT_CHECKS)).toBe("six");
    expect(numberWord(EVENINGS)).toBe("seven");
    expect(numberWord(40)).toBe("40");
    expect(spanWords(PAUSE_AFTER_DAYS)).toBe("8 weeks");
    expect(spanWords(DELETE_AFTER_DAYS)).toBe("6 months");
    expect(spanWords(10)).toBe("10 days");
    expect(keptWords(86400)).toBe("a day");
    expect(keptWords(21600)).toBe("6 hours");
    expect(milesWords(1)).toBe("a mile");
  });

  it("lowers a stop's first letter inside a sentence and leaves names in capitals alone", () => {
    expect(lowerFirst("Screening of Beautiful Boy")).toBe("screening of Beautiful Boy");
    expect(lowerFirst("IFC Center late show")).toBe("IFC Center late show");
  });
});
