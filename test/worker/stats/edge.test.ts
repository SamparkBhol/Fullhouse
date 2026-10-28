import { describe, expect, it } from "vitest";
import type { StatsBody, StatsRange } from "../../../src/shared/stats.ts";
import type { CacheLike } from "../../../src/worker/qloo/caches.ts";
import { BurstLimiter } from "../../../src/worker/burst.ts";
import { EdgeStatsCache, maxAgeMs } from "../../../src/worker/stats/edge_cache.ts";
import { conditional, etagOf, matchesEtag } from "../../../src/worker/stats/etag.ts";

function memoryCache(): CacheLike & { size(): number } {
  const held = new Map<string, Response>();
  return {
    async match(req) {
      return held.get(req.url)?.clone();
    },
    async put(req, res) {
      held.set(req.url, res.clone());
    },
    size: () => held.size,
  };
}

function loader() {
  let loads = 0;
  const load = (range: StatsRange) => async () => {
    loads += 1;
    return { range, loads } as unknown as StatsBody;
  };
  return { load, count: () => loads };
}

describe("the edge copy of the stats", () => {
  it("asks the Meter once per range while the answer is fresh, then again", async () => {
    let now = 1_000_000;
    const edge = new EdgeStatsCache(() => now, async () => null);
    const l = loader();
    const first = await edge.get("24h", l.load("24h"));
    const again = await edge.get("24h", l.load("24h"));
    expect(again).toEqual(first);
    expect(l.count()).toBe(1);
    await edge.get("7d", l.load("7d"));
    expect(l.count()).toBe(2);
    now += maxAgeMs("24h");
    const later = await edge.get("24h", l.load("24h"));
    expect(l.count()).toBe(3);
    expect(later.etag).not.toBe(first.etag);
    await edge.get("7d", l.load("7d"));
    expect(l.count()).toBe(3);
  });

  it("keeps longer ranges longer: 10 s for a day, a minute for a week, five minutes for a month", () => {
    expect([maxAgeMs("24h"), maxAgeMs("7d"), maxAgeMs("30d")]).toEqual([10_000, 60_000, 300_000]);
  });

  it("asks the Meter once for requests that arrive together", async () => {
    const edge = new EdgeStatsCache(() => 1_000, async () => null);
    let loads = 0;
    let release = (): void => {};
    const gate = new Promise<void>((r) => (release = r));
    const load = async () => {
      loads += 1;
      await gate;
      return { range: "24h" } as unknown as StatsBody;
    };
    const both = Promise.all([edge.get("24h", load), edge.get("24h", load), edge.get("24h", load)]);
    release();
    const [a, b, c] = await both;
    expect(loads).toBe(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("serves a fresh colo copy to a new isolate without asking the Meter", async () => {
    const now = 5_000_000;
    const colo = memoryCache();
    const l = loader();
    const one = await new EdgeStatsCache(() => now, async () => colo).get("30d", l.load("30d"));
    expect(colo.size()).toBe(1);
    const two = await new EdgeStatsCache(() => now + 4_000, async () => colo).get("30d", l.load("30d"));
    expect(two).toEqual(one);
    expect(l.count()).toBe(1);
    await new EdgeStatsCache(() => now + maxAgeMs("30d"), async () => colo).get("30d", l.load("30d"));
    expect(l.count()).toBe(2);
  });
});

describe("ETags for polling", () => {
  it("match a strong tag, a weak tag, a list and a star", async () => {
    const tag = await etagOf("{}");
    expect(tag).toMatch(/^"[0-9a-f]{24}"$/);
    expect(matchesEtag(tag, tag)).toBe(true);
    expect(matchesEtag(`W/${tag}`, tag)).toBe(true);
    expect(matchesEtag(`"other", ${tag}`, tag)).toBe(true);
    expect(matchesEtag("*", tag)).toBe(true);
    expect(matchesEtag('"other"', tag)).toBe(false);
    expect(matchesEtag(undefined, tag)).toBe(false);
  });

  it("answer 304 with no body when nothing changed", async () => {
    const res = conditional('"a"', "body", '"a"', { "cache-control": "no-cache" });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"a"');
    expect(await res.text()).toBe("");
    expect((await conditional('"b"', "body", '"a"', {}).text())).toBe("body");
  });
});

describe("the per address burst limit", () => {
  it("lets the set number through in a window and says when to come back", () => {
    const limiter = new BurstLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) expect(limiter.take("a", 1_000).ok).toBe(true);
    expect(limiter.take("a", 31_000)).toEqual({ ok: false, retryAfterS: 30 });
    expect(limiter.take("b", 31_000).ok).toBe(true);
    expect(limiter.take("a", 61_000).ok).toBe(true);
  });

  it("drops old addresses when it holds too many", () => {
    const limiter = new BurstLimiter(1, 1_000, 2);
    limiter.take("a", 0);
    limiter.take("b", 0);
    expect(limiter.take("c", 5_000).ok).toBe(true);
    expect(limiter.take("a", 5_000).ok).toBe(true);
  });
});
