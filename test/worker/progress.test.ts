import { describe, expect, it } from "vitest";
import { Progress, tracked } from "../../src/worker/venue/progress.ts";
import type { Qloo } from "../../src/core/index.ts";

describe("run progress", () => {
  it("lists each Qloo call once it has answered, and starts over with each read or plan", async () => {
    const p = new Progress();
    let release: () => void = () => undefined;
    const slow: Qloo = { get: (call) => new Promise((resolve) => (release = () => resolve({ body: { call }, prov: {} as never }))) };
    p.start(new Date("2026-10-29T16:00:00.000Z"));
    const q = tracked(slow, p);
    const pending = q.get("loved_places", "/v2/insights", {});
    expect(p.view().done).toEqual([]);
    release();
    await pending;
    expect(p.view()).toEqual({ since: "2026-10-29T16:00:00.000Z", done: ["loved_places"] });
    p.start(new Date("2026-10-29T16:05:00.000Z"));
    expect(p.view().done).toEqual([]);
  });
});
