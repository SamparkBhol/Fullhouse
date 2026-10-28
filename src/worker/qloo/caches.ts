import { CACHE_TTL_SEC, type QlooCache } from "../../core/index.ts";
import { sha256hex } from "../crypto.ts";

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export async function openCache(name: string): Promise<CacheLike | null> {
  try {
    const storage = (globalThis as { caches?: CacheStorage }).caches;
    if (!storage) return null;
    return (await storage.open(name)) as unknown as CacheLike;
  } catch {
    return null;
  }
}

async function cacheRequest(key: string): Promise<Request> {
  return new Request(`https://qloo-cache.fullhouse.internal/v1/${await sha256hex(key)}`);
}

// Cache API calls share the 50 subrequest quota of a free plan invocation with fetch, so each
// instance stops touching the cache after `cap` operations and lets the call go to Qloo instead.
export function cacheApiCache(cap: number, open: (name: string) => Promise<CacheLike | null> = openCache): QlooCache {
  let ops = 0;
  let cache: Promise<CacheLike | null> | undefined;
  const take = (): boolean => {
    if (ops >= cap) return false;
    ops += 1;
    return true;
  };
  return {
    async get(key) {
      if (!take()) return undefined;
      cache ??= open("qloo");
      const c = await cache;
      if (!c) return undefined;
      try {
        const hit = await c.match(await cacheRequest(key));
        return hit ? ((await hit.json()) as unknown) : undefined;
      } catch {
        return undefined;
      }
    },
    async put(key, body, ttlSec) {
      if (body === undefined || !take()) return;
      cache ??= open("qloo");
      const c = await cache;
      if (!c) return;
      try {
        const res = new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json", "cache-control": `max-age=${Math.max(60, Math.floor(ttlSec))}` },
        });
        await c.put(await cacheRequest(key), res);
      } catch {
        // A failed cache write only costs a repeat call later.
      }
    },
  };
}

export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

export function sqlCache(sql: SqlLike, now: () => Date = () => new Date()): QlooCache {
  let ready = false;
  const init = (): void => {
    if (ready) return;
    sql.exec("CREATE TABLE IF NOT EXISTS qloo_cache (k TEXT PRIMARY KEY, exp INTEGER NOT NULL, body TEXT NOT NULL)");
    sql.exec("DELETE FROM qloo_cache WHERE exp < ?", now().getTime());
    ready = true;
  };
  return {
    async get(key) {
      try {
        init();
        const row = sql.exec("SELECT body, exp FROM qloo_cache WHERE k = ?", key).toArray()[0];
        if (!row || Number(row["exp"]) < now().getTime()) return undefined;
        return JSON.parse(String(row["body"])) as unknown;
      } catch {
        return undefined;
      }
    },
    async put(key, body, ttlSec) {
      if (body === undefined) return;
      try {
        init();
        sql.exec(
          "INSERT OR REPLACE INTO qloo_cache (k, exp, body) VALUES (?, ?, ?)",
          key,
          now().getTime() + Math.floor(ttlSec) * 1000,
          JSON.stringify(body),
        );
      } catch {
        // Oversized bodies are simply not cached.
      }
    },
  };
}

export function tieredCache(near: QlooCache, far: QlooCache): QlooCache {
  return {
    async get(key) {
      const a = await near.get(key);
      if (a !== undefined) return a;
      const b = await far.get(key);
      if (b !== undefined) await near.put(key, b, CACHE_TTL_SEC);
      return b;
    },
    async put(key, body, ttlSec) {
      await near.put(key, body, ttlSec);
      await far.put(key, body, ttlSec);
    },
  };
}
