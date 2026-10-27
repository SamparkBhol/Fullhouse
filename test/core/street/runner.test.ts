import { describe, expect, it } from "vitest";
import type { Qloo, QlooResult } from "../../../src/core/qloo/client.ts";
import { QlooError } from "../../../src/core/qloo/errors.ts";
import { BUDGET_NOTE, createRunner } from "../../../src/core/street/runner.ts";

function fakeQloo(answer: (call: string) => Promise<QlooResult>): Qloo {
  return { get: (call) => answer(call) };
}

const prov = (call: string) => ({ call, endpoint: "/v2/insights", params: {}, at: "2026-10-25T10:00:00.000Z", resultCount: 1, cached: false });
const later = (ms: number, call: string) => new Promise<QlooResult>((resolve) => setTimeout(() => resolve({ body: { call }, prov: prov(call) }), ms));

describe("createRunner", () => {
  it("orders provenance by issue order, not by which answer came first", async () => {
    const run = createRunner(fakeQloo((call) => later(call === "slow" ? 30 : 1, call)), 30, 3);
    const [slow, fast] = await Promise.all([run.call("slow", "/v2/insights", {}, "Slow"), run.call("fast", "/v2/insights", {}, "Fast")]);
    const { rows, rowOf } = run.provenance();
    expect(rows.map((r) => r.call)).toEqual(["slow", "fast"]);
    expect([rowOf(slow!.ref), rowOf(fast!.ref)]).toEqual([0, 1]);
    expect(run.answered()).toBe(2);
  });

  it("skips calls past the cap and says so", async () => {
    const run = createRunner(fakeQloo((call) => later(1, call)), 1, 3);
    await run.call("a", "/v2/insights", {}, "First");
    expect(await run.call("b", "/v2/insights", {}, "Second")).toBeNull();
    expect(run.notes()).toEqual(["Second was skipped because this read reached its cap of 1 Qloo calls."]);
  });

  it("turns failures into notes in issue order, leaves gaps out of provenance and remembers the first error", async () => {
    const run = createRunner(
      fakeQloo(async (call) => {
        if (call === "b") throw new QlooError("timeout", 0, "slow", call);
        if (call === "c") throw new QlooError("not_found", 404, "none", call);
        return later(1, call);
      }),
      30,
      3,
    );
    await Promise.all(["a", "b", "c", "d"].map((c) => run.call(c, "/v2/insights", {}, `Call ${c}`)));
    expect(run.notes()).toEqual(["Call b failed (timed out), so that part of the read is missing.", "Call c came back empty."]);
    const { rows, rowOf } = run.provenance();
    expect(rows.map((r) => r.call)).toEqual(["a", "d"]);
    expect(rowOf(1)).toBe(-1);
    expect(rowOf(3)).toBe(1);
    expect(run.firstError()?.kind).toBe("timeout");
  });

  it("stops after the budget runs out and notes it once", async () => {
    let calls = 0;
    const run = createRunner(
      fakeQloo(async (call) => {
        calls++;
        if (calls > 1) throw new QlooError("budget", 0, "spent", call);
        return later(1, call);
      }),
      30,
      1,
    );
    await Promise.all(["a", "b", "c"].map((c) => run.call(c, "/v2/insights", {}, c)));
    expect(await run.call("d", "/v2/insights", {}, "d")).toBeNull();
    expect(run.notes()).toEqual([BUDGET_NOTE]);
    expect(run.answered()).toBe(1);
  });

  it("rethrows auth failures and anything that is not a Qloo error", async () => {
    const denied = createRunner(fakeQloo(async () => Promise.reject(new QlooError("auth", 401, "no"))), 30, 3);
    await expect(denied.call("a", "/v2/insights", {}, "a")).rejects.toMatchObject({ kind: "auth" });
    const broken = createRunner(fakeQloo(async () => Promise.reject(new TypeError("bug"))), 30, 3);
    await expect(broken.call("a", "/v2/insights", {}, "a")).rejects.toBeInstanceOf(TypeError);
  });
});
