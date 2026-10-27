import { describe, expect, it } from "vitest";
import { IP_LIMITS, MeterCore } from "../../src/worker/meter_core.ts";
import { cacheApiCache, memoryCache, reservingBudget, sqlCache, tieredCache } from "../../src/worker/qloo_wiring.ts";
import { MemoryStore } from "../../src/worker/store.ts";

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe("Meter", () => {
  it("spends the daily Qloo budget and refuses past it", async () => {
    const m = new MeterCore(new MemoryStore(), 10, clock("2026-10-25T10:00:00Z").now);
    expect(await m.spend(6)).toBe(true);
    expect(await m.spend(4)).toBe(true);
    expect(await m.spend(1)).toBe(false);
    expect((await m.usage()).qlooCalls).toBe(10);
  });

  it("resets the budget and the per IP counts at UTC midnight", async () => {
    const c = clock("2026-10-25T23:59:00Z");
    const m = new MeterCore(new MemoryStore(), 5, c.now);
    expect(await m.spend(5)).toBe(true);
    for (let i = 0; i < IP_LIMITS.baseline; i++) expect((await m.hit("ip1", "baseline")).ok).toBe(true);
    expect((await m.hit("ip1", "baseline")).ok).toBe(false);
    c.advance(2 * 60_000);
    expect(await m.spend(5)).toBe(true);
    expect((await m.hit("ip1", "baseline")).ok).toBe(true);
  });

  it("keeps separate limits per kind and per address", async () => {
    const m = new MeterCore(new MemoryStore(), 5, clock("2026-10-25T10:00:00Z").now);
    for (let i = 0; i < IP_LIMITS.create; i++) await m.hit("ip1", "create");
    const blocked = await m.hit("ip1", "create");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterS).toBe(14 * 3600);
    expect((await m.hit("ip2", "create")).ok).toBe(true);
    expect((await m.hit("ip1", "search")).ok).toBe(true);
  });

  it("has the limits the spec names", () => {
    expect(IP_LIMITS).toEqual({ create: 20, search: 120, rsvp: 60, baseline: 10 });
  });
});

describe("budget reservations", () => {
  it("ask the meter in chunks instead of once per call", async () => {
    const spent: number[] = [];
    const meter = { spend: async (n: number) => (spent.push(n), true), hit: async () => ({ ok: true, remaining: 1, retryAfterS: 0 }), usage: async () => ({ day: "", qlooCalls: 0, qlooBudget: 0 }) };
    const budget = reservingBudget(meter, 10);
    for (let i = 0; i < 25; i++) expect(await budget(1)).toBe(true);
    expect(spent).toEqual([10, 10, 10]);
  });

  it("fall back to the exact need when a chunk does not fit", async () => {
    let left = 3;
    const meter = {
      spend: async (n: number) => (n <= left ? ((left -= n), true) : false),
      hit: async () => ({ ok: true, remaining: 1, retryAfterS: 0 }),
      usage: async () => ({ day: "", qlooCalls: 0, qlooBudget: 0 }),
    };
    const budget = reservingBudget(meter, 10);
    expect(await budget(1)).toBe(true);
    expect(await budget(1)).toBe(true);
    expect(await budget(1)).toBe(true);
    expect(await budget(1)).toBe(false);
  });
});

describe("caches", () => {
  it("stop touching the Cache API after the cap", async () => {
    let ops = 0;
    const store = new Map<string, Response>();
    const fake = {
      match: async (r: Request) => (ops++, store.get(r.url)?.clone()),
      put: async (r: Request, res: Response) => {
        ops++;
        store.set(r.url, res);
      },
    };
    const cache = cacheApiCache(2, async () => fake);
    await cache.put("k1", { a: 1 }, 60);
    expect(await cache.get("k1")).toEqual({ a: 1 });
    expect(await cache.get("k1")).toBeUndefined();
    await cache.put("k2", { b: 2 }, 60);
    expect(ops).toBe(2);
    expect(store.size).toBe(1);
  });

  it("serve the near tier first and fill it from the far tier", async () => {
    const near = memoryCache();
    const far = memoryCache();
    await far.put("k", { v: 1 }, 60);
    const t = tieredCache(near, far);
    expect(await t.get("k")).toEqual({ v: 1 });
    expect(near.size()).toBe(1);
  });

  it("expire rows in the Durable Object table", async () => {
    const rows = new Map<string, { exp: number; body: string }>();
    const sql = {
      exec(query: string, ...b: unknown[]) {
        if (query.startsWith("INSERT")) rows.set(String(b[0]), { exp: Number(b[1]), body: String(b[2]) });
        if (query.startsWith("DELETE")) for (const [k, r] of rows) if (r.exp < Number(b[0])) rows.delete(k);
        const row = query.startsWith("SELECT") ? rows.get(String(b[0])) : undefined;
        return { toArray: () => (row ? [{ body: row.body, exp: row.exp }] : []) };
      },
    };
    const c = clock("2026-10-25T10:00:00Z");
    const cache = sqlCache(sql, c.now);
    await cache.put("k", { v: 2 }, 60);
    expect(await cache.get("k")).toEqual({ v: 2 });
    c.advance(61_000);
    expect(await cache.get("k")).toBeUndefined();
  });
});
