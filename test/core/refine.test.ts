import { describe, expect, it } from "vitest";
import { REFINE_TOOL, applyRefine, parseRefineFallback } from "../../src/core/index.ts";
import type { PlanInput } from "../../src/shared/contract.ts";

describe("parseRefineFallback", () => {
  it("reads the example request from the spec", () => {
    expect(parseRefineFallback("make it Friday, no live music, under 40 people")).toEqual({
      weekday: 5,
      noLiveMusic: true,
      maxPeople: 39,
      note: "make it Friday, no live music, under 40 people",
    });
  });

  it("reads weekdays, keeping the one the owner moves to", () => {
    expect(parseRefineFallback("move it from Thursday to Saturday").weekday).toBe(6);
    expect(parseRefineFallback("not Tuesday, Wed works").weekday).toBe(3);
    expect(parseRefineFallback("sundays are better").weekday).toBe(0);
    expect(parseRefineFallback("earlier please").weekday).toBeUndefined();
  });

  it("reads times and ranges", () => {
    expect(parseRefineFallback("start at 7pm").start).toBe("19:00");
    expect(parseRefineFallback("7.30 pm start").start).toBe("19:30");
    expect(parseRefineFallback("kick off 19:45").start).toBe("19:45");
    expect(parseRefineFallback("at 8").start).toBe("20:00");
    expect(parseRefineFallback("from 7 to 10")).toMatchObject({ start: "19:00", durationMin: 180 });
    expect(parseRefineFallback("6pm until 9:30pm")).toMatchObject({ start: "18:00", durationMin: 210 });
    expect(parseRefineFallback("from 9 to 1")).toMatchObject({ start: "21:00", durationMin: 240 });
    expect(parseRefineFallback("11am to 2pm")).toMatchObject({ start: "11:00", durationMin: 180 });
  });

  it("reads head counts", () => {
    expect(parseRefineFallback("max 30").maxPeople).toBe(30);
    expect(parseRefineFallback("no more than 25 guests").maxPeople).toBe(25);
    expect(parseRefineFallback("for 12 people").maxPeople).toBe(12);
    expect(parseRefineFallback("fewer than 20").maxPeople).toBe(19);
    expect(parseRefineFallback("at 8, 40 people tops").maxPeople).toBe(40);
  });

  it("reads format words and negations", () => {
    expect(parseRefineFallback("no quiz, make it a film night")).toMatchObject({ avoidFormats: ["quiz"], preferFormats: ["film"] });
    expect(parseRefineFallback("something with books instead of trivia")).toMatchObject({ avoidFormats: ["quiz"], preferFormats: ["book"] });
    expect(parseRefineFallback("book it for Friday").preferFormats).toBeUndefined();
    expect(parseRefineFallback("a podcast night").preferFormats).toEqual(["podcast"]);
    expect(parseRefineFallback("no bands please").noLiveMusic).toBe(true);
    expect(parseRefineFallback("live music is fine").noLiveMusic).toBe(false);
  });

  it("handles empty and odd input", () => {
    expect(parseRefineFallback("")).toEqual({});
    expect(parseRefineFallback(undefined as unknown as string)).toEqual({});
    expect(parseRefineFallback("x".repeat(900)).note?.length).toBe(200);
  });
});

describe("applyRefine", () => {
  const base: PlanInput = { weekday: 4, start: "19:00", avoidFormats: ["film"], preferFormats: ["quiz"] };

  it("merges valid changes and leaves the base untouched", () => {
    const out = applyRefine(base, { weekday: 5, avoidFormats: ["quiz"], preferFormats: ["film"], noLiveMusic: true });
    expect(out).toEqual({ weekday: 5, start: "19:00", avoidFormats: ["quiz"], preferFormats: ["film"], noLiveMusic: true });
    expect(base).toEqual({ weekday: 4, start: "19:00", avoidFormats: ["film"], preferFormats: ["quiz"] });
  });

  it("clamps and validates every field", () => {
    expect(applyRefine({}, { maxPeople: 5000, durationMin: 5, weekday: 9, start: "26:00" })).toEqual({ maxPeople: 1000, durationMin: 30 });
    expect(applyRefine({}, { maxPeople: "35", durationMin: "120.4", weekday: "Friday", start: "7:05" })).toEqual({ maxPeople: 35, durationMin: 120, weekday: 5, start: "07:05" });
    expect(applyRefine({}, { start: "8pm", noLiveMusic: "true" })).toEqual({ start: "20:00", noLiveMusic: true });
    expect(applyRefine({}, { avoidFormats: ["opera", "quiz", 3], preferFormats: "book, games", extra: "x" })).toEqual({ avoidFormats: ["quiz"], preferFormats: ["book", "games"] });
    expect(applyRefine({}, { note: `  ${"y".repeat(400)} ` }).note?.length).toBe(200);
  });

  it("never avoids every format", () => {
    expect(applyRefine({}, { avoidFormats: ["listening", "film", "quiz", "book", "games", "podcast", "tasting"] }).avoidFormats).toBeUndefined();
  });

  it("accepts a JSON string and ignores junk", () => {
    expect(applyRefine({ weekday: 1 }, '{"weekday": 2}')).toEqual({ weekday: 2 });
    expect(applyRefine({ weekday: 1 }, "not json")).toEqual({ weekday: 1 });
    expect(applyRefine({ weekday: 1 }, null)).toEqual({ weekday: 1 });
    expect(applyRefine({ weekday: 1 }, [1, 2])).toEqual({ weekday: 1 });
  });

  it("chains with the keyword fallback", () => {
    expect(applyRefine({ weekday: 4, maxPeople: 60 }, parseRefineFallback("make it Friday, no live music, under 40 people"))).toMatchObject({
      weekday: 5,
      maxPeople: 39,
      noLiveMusic: true,
    });
  });
});

describe("REFINE_TOOL", () => {
  it("describes exactly the PlanInput fields as a strict JSON schema", () => {
    const params = REFINE_TOOL.parameters as { type: string; additionalProperties: boolean; properties: Record<string, { enum?: string[]; items?: { enum: string[] } }> };
    expect(REFINE_TOOL.name).toMatch(/^[a-z_]+$/);
    expect(params.type).toBe("object");
    expect(params.additionalProperties).toBe(false);
    expect(Object.keys(params.properties).sort()).toEqual(["avoidFormats", "durationMin", "maxPeople", "noLiveMusic", "note", "preferFormats", "start", "weekday"]);
    expect(params.properties.avoidFormats?.items?.enum).toEqual(["listening", "film", "quiz", "book", "games", "podcast", "tasting"]);
    expect(JSON.parse(JSON.stringify(REFINE_TOOL))).toEqual(REFINE_TOOL);
  });
});
