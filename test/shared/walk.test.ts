import { describe, expect, it } from "vitest";
import { DETOUR, WALK_M_PER_MIN, walkMinutes, walkText } from "../../src/shared/walk.ts";

describe("walk minutes", () => {
  it("adds 30% to the straight line for corners and walks it at 80 m a minute", () => {
    expect(DETOUR).toBe(1.3);
    expect(WALK_M_PER_MIN).toBe(80);
    expect(walkMinutes(1126)).toBe(18);
    expect(walkMinutes(153)).toBe(2);
    expect(walkMinutes(21)).toBe(1);
    expect(walkMinutes(0)).toBe(1);
  });

  it("says it the way a person would", () => {
    expect(walkText(313)).toBe("about 5 minutes on foot");
    expect(walkText(10)).toBe("about 1 minute on foot");
  });
});
