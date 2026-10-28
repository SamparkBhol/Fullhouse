import { describe, expect, it } from "vitest";
import { LATENCY_STEPS_MS, latencySummary, percentile, stepOf } from "../../../src/worker/stats/percentile.ts";

const at = (ms: number, n = 1) => ({ step: stepOf(ms), n });

describe("latency steps", () => {
  it("puts a call on the first step at or above its time", () => {
    expect(LATENCY_STEPS_MS[stepOf(1)]).toBe(10);
    expect(LATENCY_STEPS_MS[stepOf(200)]).toBe(200);
    expect(LATENCY_STEPS_MS[stepOf(201)]).toBe(250);
    expect(stepOf(60_000)).toBe(LATENCY_STEPS_MS.length - 1);
  });
});

describe("percentiles over steps", () => {
  it("has no value for no calls", () => {
    expect(percentile([], 50)).toBeNull();
    expect(latencySummary([])).toEqual({ p50: null, p95: null, samples: 0 });
  });

  it("reports the step of a single call for any percentile", () => {
    expect(percentile([at(240)], 50)).toBe(250);
    expect(percentile([at(240)], 95)).toBe(250);
  });

  it("uses the nearest rank, in step order whatever order the rows come in", () => {
    const rows = [at(400), at(100), at(300), at(200)];
    expect(percentile(rows, 25)).toBe(100);
    expect(percentile(rows, 50)).toBe(200);
    expect(percentile(rows, 95)).toBe(400);
  });

  it("weighs each step by how many calls landed on it", () => {
    expect(latencySummary([at(180, 90), at(1900, 10)])).toEqual({ p50: 200, p95: 2000, samples: 100 });
    expect(latencySummary([at(180, 96), at(1900, 4)])).toMatchObject({ p95: 200 });
  });
});
