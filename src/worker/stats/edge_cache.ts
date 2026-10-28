import { STATS_MAX_AGE_S, type StatsBody, type StatsRange } from "../../shared/stats.ts";
import { openCache, type CacheLike } from "../qloo/caches.ts";
import { etagOf } from "./etag.ts";

export interface CachedStats {
  body: string;
  etag: string;
}

const STORED_AT = "x-stored-at";

export function maxAgeMs(range: StatsRange): number {
  return STATS_MAX_AGE_S[range] * 1000;
}

// An answer is kept in this isolate's memory, then in the colo's Cache API where the zone has one, then asked of the Meter.
// Requests that arrive while the Meter is being asked wait for that one answer instead of asking again.
export class EdgeStatsCache {
  private readonly memo = new Map<StatsRange, { at: number; entry: CachedStats }>();
  private readonly asking = new Map<StatsRange, Promise<CachedStats>>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly open: (name: string) => Promise<CacheLike | null> = openCache,
  ) {}

  async get(range: StatsRange, load: () => Promise<StatsBody>): Promise<CachedStats> {
    const held = this.memo.get(range);
    if (held && this.now() - held.at < maxAgeMs(range)) return held.entry;
    const pending = this.asking.get(range);
    if (pending) return pending;
    const ask = this.fetch(range, load).finally(() => this.asking.delete(range));
    this.asking.set(range, ask);
    return ask;
  }

  private async fetch(range: StatsRange, load: () => Promise<StatsBody>): Promise<CachedStats> {
    const now = this.now();
    const cache = await this.open("stats");
    const key = new Request(`https://stats.fullhouse.internal/v2/${range}`);
    const edge = await this.fromEdge(cache, key, range, now);
    if (edge) return edge;
    const body = JSON.stringify(await load());
    const entry = { body, etag: await etagOf(body) };
    this.memo.set(range, { at: now, entry });
    try {
      await cache?.put(
        key,
        new Response(body, { headers: { "content-type": "application/json", etag: entry.etag, [STORED_AT]: String(now), "cache-control": `max-age=${STATS_MAX_AGE_S[range]}` } }),
      );
    } catch {
      // Without the colo cache the isolate copy still spares the Meter.
    }
    return entry;
  }

  private async fromEdge(cache: CacheLike | null, key: Request, range: StatsRange, now: number): Promise<CachedStats | null> {
    try {
      const hit = await cache?.match(key);
      if (!hit) return null;
      const stored = Number(hit.headers.get(STORED_AT));
      if (!Number.isFinite(stored) || now - stored >= maxAgeMs(range)) return null;
      const body = await hit.text();
      const entry = { body, etag: hit.headers.get("etag") ?? (await etagOf(body)) };
      this.memo.set(range, { at: stored, entry });
      return entry;
    } catch {
      return null;
    }
  }
}
