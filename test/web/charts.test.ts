import { describe, expect, it } from "vitest";
import { niceMax } from "../../web/src/charts/scale.ts";
import { bucketSpan, bucketTick, countedFrom, untilWords } from "../../web/src/charts/time.ts";

describe("chart scales", () => {
  it("round the top up to a step whose half is a whole number", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(5)).toBe(6);
    expect(niceMax(9)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(31)).toBe(40);
    expect(niceMax(56)).toBe(60);
    expect(niceMax(61)).toBe(80);
    expect(niceMax(4000)).toBe(4000);
    for (const n of [5, 7, 13, 27, 56, 99, 140, 777]) expect(Number.isInteger(niceMax(n) / 2)).toBe(true);
  });
});

describe("bucket labels", () => {
  const at = "2026-10-27T18:00:00.000Z";

  it("name an hour in the reader's zone, and a day's six hour buckets once, on the first of them", () => {
    expect(bucketTick(at, 1, "Europe/London")).toBe("18:00");
    expect(bucketTick(at, 1, "Asia/Kolkata")).toBe("23:30");
    expect(bucketTick("2026-10-27T00:00:00.000Z", 6, "UTC")).toBe("Tue");
    expect(bucketTick(at, 6, "UTC")).toBe("");
    expect(bucketTick("2026-10-26T18:00:00.000Z", 6, "Asia/Kolkata")).toBe("");
    expect(bucketTick("2026-10-27T00:00:00.000Z", 6, "Asia/Kolkata")).toBe("Tue");
    const week = Array.from({ length: 28 }, (_, i) => new Date(Date.parse("2026-10-21T00:00:00.000Z") + i * 6 * 3_600_000).toISOString());
    expect(week.map((b) => bucketTick(b, 6, "America/Los_Angeles")).filter(Boolean)).toEqual(["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]);
  });

  it("name day buckets by their UTC date wherever the reader is", () => {
    expect(bucketTick("2026-10-27T00:00:00.000Z", 24, "America/Los_Angeles")).toBe("27 Oct");
    expect(bucketSpan("2026-10-27T00:00:00.000Z", 24, "America/Los_Angeles")).toBe("Tuesday 27 October");
  });

  it("spell out the span a tooltip covers", () => {
    expect(bucketSpan(at, 6, "UTC")).toBe("Tue 27 Oct, 18:00 to 00:00");
    expect(bucketSpan("2026-10-27T00:00:00.000Z", 24, "UTC")).toBe("Tuesday 27 October");
  });

  it("find the first bucket counted, so the ones before it read as not counted", () => {
    const days = ["2026-10-25T00:00:00.000Z", "2026-10-26T00:00:00.000Z", "2026-10-27T00:00:00.000Z"];
    expect(countedFrom(days, 24, "2026-10-26T15:10:00.000Z")).toBe(1);
    expect(countedFrom(days, 24, "2026-10-01T00:00:00.000Z")).toBe(0);
    expect(countedFrom(days, 24, null)).toBe(0);
  });

  it("say how long until a reset in hours and minutes", () => {
    expect(untilWords(8 * 3_600_000 + 24 * 60_000)).toBe("8 h 24 min");
    expect(untilWords(45 * 60_000)).toBe("45 min");
    expect(untilWords(-5)).toBe("0 min");
  });
});
